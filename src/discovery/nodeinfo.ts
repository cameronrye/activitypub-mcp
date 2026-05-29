import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { CACHE_MAX_SIZE, MAX_RESPONSE_SIZE, REQUEST_TIMEOUT, USER_AGENT } from "../config.js";
import { instanceBlocklist } from "../policy/instance-blocklist.js";
import { fetchWithRedirectGuard, readJsonWithLimit } from "../utils/fetch-helpers.js";
import { LRUCache } from "../utils/lru-cache.js";
import { validateExternalUrl } from "../validation/url.js";

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

const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const NODEINFO_2_REL_PREFIX = "http://nodeinfo.diaspora.software/ns/schema/2.";

const cache = new LRUCache<string, InstanceSoftwareInfo>({
  maxSize: Math.min(CACHE_MAX_SIZE, 256),
  ttl: POSITIVE_TTL_MS,
});

const NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1h

const negativeCache = new LRUCache<string, InstanceSoftwareInfo>({
  maxSize: Math.min(CACHE_MAX_SIZE, 256),
  ttl: NEGATIVE_TTL_MS,
});

export function clearNodeInfoCache(): void {
  cache.clear();
  negativeCache.clear();
}

export async function getInstanceSoftware(domain: string): Promise<InstanceSoftwareInfo> {
  const normalizedDomain = domain.toLowerCase();

  const positive = cache.get(normalizedDomain);
  if (positive) return positive;
  const negative = negativeCache.get(normalizedDomain);
  if (negative) return negative;

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
  }
}

async function performDetection(domain: string): Promise<InstanceSoftwareInfo> {
  // Policy + SSRF gate on input domain.
  instanceBlocklist.validateNotBlocked(domain);

  const discoveryUrl = `https://${domain}/.well-known/nodeinfo`;
  await validateExternalUrl(discoveryUrl);
  const discoveryDoc = await fetchJson(discoveryUrl);
  const discovery = NodeInfoDiscoverySchema.parse(discoveryDoc);

  const link = pickHighestNodeInfo2Link(discovery);
  if (!link) {
    throw new Error("no NodeInfo 2.0/2.1 link in discovery document");
  }

  // Same-host check first, then SSRF guard + blocklist on the linked NodeInfo URL.
  const linkedHost = new URL(link.href).hostname.toLowerCase();
  if (!isSameOrSubdomain(domain, linkedHost)) {
    throw new Error(
      `linked NodeInfo URL on different host (${linkedHost}, expected ${domain} or subdomain)`,
    );
  }
  await validateExternalUrl(link.href);
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
  const a = input.toLowerCase();
  const b = candidate.toLowerCase();
  return b === a || b.endsWith(`.${a}`);
}

function pickHighestNodeInfo2Link(
  doc: NodeInfoDiscovery,
): { rel: string; href: string } | undefined {
  const matches = doc.links
    .filter((l) => l.rel.startsWith(NODEINFO_2_REL_PREFIX))
    .sort((a, b) => b.rel.localeCompare(a.rel));
  return matches[0];
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetchWithRedirectGuard(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
      },
      async (target) => {
        await validateExternalUrl(target);
        const targetHost = new URL(target).hostname;
        instanceBlocklist.validateNotBlocked(targetHost);
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await readJsonWithLimit(response, MAX_RESPONSE_SIZE);
  } finally {
    clearTimeout(timeoutId);
  }
}
