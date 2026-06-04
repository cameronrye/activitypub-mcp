/**
 * Picks the login strategy for an instance from detected software, mirroring
 * adapters/resolve.ts: only Misskey-family software uses MiAuth; everything else
 * (including detection failure / unknown) defaults to Mastodon OAuth2.
 */

import { detectSoftwareKind } from "../../discovery/software-kind.js";
import type { LoginStrategy } from "./login-strategy.js";
import { mastodonOAuthStrategy } from "./mastodon-oauth.js";
import { misskeyMiAuthStrategy } from "./miauth.js";

export async function resolveLoginStrategy(instance: string): Promise<LoginStrategy> {
  const kind = await detectSoftwareKind(instance);
  return kind === "misskey" ? misskeyMiAuthStrategy : mastodonOAuthStrategy;
}
