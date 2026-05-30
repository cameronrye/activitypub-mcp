/**
 * Picks the write adapter for an account based on detected instance software.
 * Only Misskey-family software (no Mastodon-compatible API) uses the Misskey
 * adapter; everything else — including detection failures — defaults to the
 * Mastodon adapter, which is correct for Pleroma/Akkoma/GotoSocial/Sharkey/
 * Firefish/Iceshrimp.
 */

import { getInstanceSoftware } from "../../discovery/nodeinfo.js";
import type { AccountCredentials } from "../account-manager.js";
import { mastodonWriteAdapter } from "./mastodon-adapter.js";
import { misskeyWriteAdapter } from "./misskey-adapter.js";
import type { WriteAdapter } from "./write-adapter.js";

export type SoftwareKind = "mastodon" | "misskey";

const MISSKEY_FAMILY = new Set(["misskey", "foundkey"]);

export async function resolveSoftwareKind(account: AccountCredentials): Promise<SoftwareKind> {
  const info = await getInstanceSoftware(account.instance);
  const name = info.software?.name?.toLowerCase();
  return name && MISSKEY_FAMILY.has(name) ? "misskey" : "mastodon";
}

export async function resolveWriteAdapter(account: AccountCredentials): Promise<WriteAdapter> {
  const kind = await resolveSoftwareKind(account);
  return kind === "misskey" ? misskeyWriteAdapter : mastodonWriteAdapter;
}
