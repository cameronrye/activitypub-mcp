import { z } from "zod";

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
