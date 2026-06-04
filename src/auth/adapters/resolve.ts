/**
 * Picks the write adapter for an account based on detected instance software.
 * Only Misskey-family software (no Mastodon-compatible API) uses the Misskey
 * adapter; everything else — including detection failures — defaults to the
 * Mastodon adapter, which is correct for Pleroma/Akkoma/GotoSocial/Sharkey/
 * Firefish/Iceshrimp.
 */

import { detectSoftwareKind, type SoftwareKind } from "../../discovery/software-kind.js";
import type { AccountCredentials } from "../account-manager.js";
import { mastodonWriteAdapter } from "./mastodon-adapter.js";
import { misskeyWriteAdapter } from "./misskey-adapter.js";
import type { WriteAdapter } from "./write-adapter.js";

// Re-exported for back-compat; the family set + classification now live in the
// shared discovery/software-kind module so read/write/login routing can't drift.
export type { SoftwareKind };

export async function resolveSoftwareKind(account: AccountCredentials): Promise<SoftwareKind> {
  return detectSoftwareKind(account.instance);
}

export async function resolveWriteAdapter(account: AccountCredentials): Promise<WriteAdapter> {
  const kind = await resolveSoftwareKind(account);
  return kind === "misskey" ? misskeyWriteAdapter : mastodonWriteAdapter;
}
