/**
 * Resolve the account for a Mastodon-only feature tool and reject Misskey
 * accounts up front (mirrors AuthenticatedClient.assertMastodonApi for the
 * SP1 Mastodon-only ops).
 */

import { UnsupportedOnPlatformError } from "../../utils/errors.js";
import type { AccountCredentials } from "../account-manager.js";
import { accountManager } from "../account-manager.js";
import { resolveSoftwareKind } from "../adapters/resolve.js";

export async function requireMastodonAccount(
  op: string,
  accountId?: string,
): Promise<AccountCredentials> {
  const account = accountId
    ? accountManager.getAccount(accountId)
    : accountManager.getActiveAccount();
  if (!account) {
    if (accountId) throw new Error(`Account not found: ${accountId}`);
    throw new Error(
      "No authenticated account configured. Set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables, or use the account management tools.",
    );
  }
  const kind = await resolveSoftwareKind(account);
  if (kind === "misskey") throw new UnsupportedOnPlatformError(op, "Misskey");
  return account;
}
