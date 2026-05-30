/**
 * Picks the login strategy for an instance from detected software, mirroring
 * adapters/resolve.ts: only Misskey-family software uses MiAuth; everything else
 * (including detection failure / unknown) defaults to Mastodon OAuth2.
 */

import { getInstanceSoftware } from "../../discovery/nodeinfo.js";
import type { LoginStrategy } from "./login-strategy.js";
import { mastodonOAuthStrategy } from "./mastodon-oauth.js";
import { misskeyMiAuthStrategy } from "./miauth.js";

const MISSKEY_FAMILY = new Set(["misskey", "foundkey"]);

export async function resolveLoginStrategy(instance: string): Promise<LoginStrategy> {
  const info = await getInstanceSoftware(instance);
  const name = info.software?.name?.toLowerCase();
  return name && MISSKEY_FAMILY.has(name) ? misskeyMiAuthStrategy : mastodonOAuthStrategy;
}
