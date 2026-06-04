/**
 * Single source of truth for fediverse software-family routing.
 *
 * Read adapters, write adapters, and login strategies all need to answer the
 * same question — "does this instance speak the Mastodon API, or is it a
 * Misskey-family server with its own API?" Keeping the family set and the
 * classification in one place means the read/write/login paths can never drift
 * (previously each resolver carried its own copy of the family set).
 */

import { getInstanceSoftware } from "./nodeinfo.js";

export type SoftwareKind = "mastodon" | "misskey";

/**
 * Software whose API is NOT Mastodon-compatible and must be routed to the
 * Misskey adapter/strategy. Everything else — Pleroma, Akkoma, GoToSocial,
 * Sharkey, Firefish, Iceshrimp, and any unknown/undetected software — exposes a
 * Mastodon-compatible API and defaults to "mastodon".
 */
export const MISSKEY_FAMILY: ReadonlySet<string> = new Set(["misskey", "foundkey"]);

/** Classify a NodeInfo software name into a routing kind. */
export function classifySoftwareKind(name: string | null | undefined): SoftwareKind {
  return name && MISSKEY_FAMILY.has(name.toLowerCase()) ? "misskey" : "mastodon";
}

/**
 * Detect an instance's software family via NodeInfo. Detection failures default
 * to "mastodon" (the broadest-compatible API), matching getInstanceSoftware's
 * fail-soft contract.
 */
export async function detectSoftwareKind(domain: string): Promise<SoftwareKind> {
  const info = await getInstanceSoftware(domain);
  return classifySoftwareKind(info.software?.name);
}
