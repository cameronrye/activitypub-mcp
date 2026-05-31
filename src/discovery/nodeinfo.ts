import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { CACHE_MAX_SIZE, INSTANCE_SOFTWARE_TTL } from "../config.js";
import { instanceBlocklist } from "../policy/instance-blocklist.js";
import { guardedFetch } from "../utils/fetch-helpers.js";
import { LRUCache } from "../utils/lru-cache.js";

/**
 * NodeInfo discovery document (RFC-style `/.well-known/nodeinfo` index).
 * See: https://nodeinfo.diaspora.software/
 */
export const NodeInfoDiscoverySchema = z.object({
  links: z.array(
    z.object({
      rel: z.string(),
      href: z.string(),
    }),
  ),
});

export type NodeInfoDiscovery = z.infer<typeof NodeInfoDiscoverySchema>;

/**
 * NodeInfo body schema (versions 2.0 and 2.1).
 * Only the fields we actually expose to LLM consumers are required;
 * `usage`, `services`, and `metadata` are tolerated but not validated strictly.
 */
export const NodeInfoSchema = z.object({
  version: z.string().optional(),
  software: z.object({
    name: z.string(),
    version: z.string(),
    repository: z.string().optional(),
    homepage: z.string().optional(),
  }),
  protocols: z.array(z.string()),
  openRegistrations: z.boolean().optional(),
  usage: z.unknown().optional(),
  services: z.unknown().optional(),
  metadata: z.unknown().optional(),
});

export type NodeInfo = z.infer<typeof NodeInfoSchema>;

/**
 * Result returned by `getInstanceSoftware`.
 * `detection: 'unavailable'` populates null fields and a one-line `reason`.
 */
export type InstanceSoftwareInfo = {
  domain: string;
  detection: "success" | "unavailable";
  software: { name: string; version: string } | null;
  protocols: string[] | null;
  openRegistrations: boolean | null;
  reason?: string;
};

const logger = getLogger("activitypub-mcp:nodeinfo");

// Only NodeInfo 2.0 and 2.1 are in scope. Match these rels exactly — a prefix
// match would also accept bogus rels like ".../2.1-evil" or ".../2.x", and a
// lexical sort could rank such a rel above the genuine link. 2.1 is preferred
// over 2.0 when both are advertised.
const SUPPORTED_NODEINFO_RELS = [
  "http://nodeinfo.diaspora.software/ns/schema/2.1",
  "http://nodeinfo.diaspora.software/ns/schema/2.0",
] as const;

const cache = new LRUCache<string, InstanceSoftwareInfo>({
  maxSize: Math.min(CACHE_MAX_SIZE, 256),
  ttl: INSTANCE_SOFTWARE_TTL,
});

const NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1h

const negativeCache = new LRUCache<string, InstanceSoftwareInfo>({
  maxSize: Math.min(CACHE_MAX_SIZE, 256),
  ttl: NEGATIVE_TTL_MS,
});

const inFlight = new Map<string, Promise<InstanceSoftwareInfo>>();

export function clearNodeInfoCache(): void {
  cache.clear();
  negativeCache.clear();
  inFlight.clear();
}

export async function getInstanceSoftware(domain: string): Promise<InstanceSoftwareInfo> {
  const normalizedDomain = domain.toLowerCase();

  const positive = cache.get(normalizedDomain);
  if (positive) return positive;
  const negative = negativeCache.get(normalizedDomain);
  if (negative) return negative;

  const existing = inFlight.get(normalizedDomain);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const info = await performDetection(normalizedDomain);
      cache.set(normalizedDomain, info);
      negativeCache.delete(normalizedDomain);
      return info;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const info: InstanceSoftwareInfo = {
        domain: normalizedDomain,
        detection: "unavailable",
        software: null,
        protocols: null,
        openRegistrations: null,
        reason,
      };
      logger.info("NodeInfo detection unavailable", { domain: normalizedDomain, reason });
      negativeCache.set(normalizedDomain, info);
      return info;
    } finally {
      inFlight.delete(normalizedDomain);
    }
  })();

  inFlight.set(normalizedDomain, promise);
  return promise;
}

async function performDetection(domain: string): Promise<InstanceSoftwareInfo> {
  // Policy + SSRF gate on input domain.
  instanceBlocklist.validateNotBlocked(domain);

  const discoveryUrl = `https://${domain}/.well-known/nodeinfo`;
  // The fetch goes through guardedFetch, which resolves + validates + pins the
  // IP onto the connection and re-pins each redirect hop (closes the
  // DNS-rebinding TOCTOU). No separate pre-validation needed here.
  const discoveryDoc = await fetchJson(discoveryUrl);
  const discovery = NodeInfoDiscoverySchema.parse(discoveryDoc);

  const link = pickHighestNodeInfo2Link(discovery);
  if (!link) {
    throw new Error("no NodeInfo 2.0/2.1 link in discovery document");
  }

  // Same-host + blocklist gate on the linked NodeInfo URL before fetching it.
  // guardedFetch then resolves + validates + pins the IP on the real fetch.
  const linkedHost = new URL(link.href).hostname.toLowerCase();
  if (!isSameOrSubdomain(domain, linkedHost)) {
    throw new Error(
      `linked NodeInfo URL on different host (${linkedHost}, expected ${domain} or subdomain)`,
    );
  }
  instanceBlocklist.validateNotBlocked(linkedHost);

  const body = await fetchJson(link.href);
  const nodeInfo = NodeInfoSchema.parse(body);

  return {
    domain,
    detection: "success",
    software: { name: nodeInfo.software.name, version: nodeInfo.software.version },
    protocols: nodeInfo.protocols,
    openRegistrations: nodeInfo.openRegistrations ?? null,
  };
}

function isSameOrSubdomain(input: string, candidate: string): boolean {
  // Strip a trailing dot so the FQDN form (e.g. "example.org.") of the same
  // host is treated as equal, not rejected as a different host.
  const a = input.toLowerCase().replace(/\.$/, "");
  const b = candidate.toLowerCase().replace(/\.$/, "");
  return b === a || b.endsWith(`.${a}`);
}

function pickHighestNodeInfo2Link(
  doc: NodeInfoDiscovery,
): { rel: string; href: string } | undefined {
  for (const rel of SUPPORTED_NODEINFO_RELS) {
    const match = doc.links.find((l) => l.rel === rel);
    if (match) return match;
  }
  return undefined;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await guardedFetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.data;
}
