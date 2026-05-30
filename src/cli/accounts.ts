/**
 * `activitypub-mcp accounts` — list ALL configured accounts (env + persisted),
 * matching the in-conversation `list-accounts` tool so the two surfaces agree.
 * Each row is tagged with its source; no secrets are printed.
 */

import { accountManager } from "../auth/account-manager.js";
import { credentialStore } from "../auth/credential-store.js";

export async function runAccounts(): Promise<void> {
  await accountManager.loadPersisted();
  const persistedIds = new Set((await credentialStore.loadAccounts()).map((a) => a.id));
  const accounts = accountManager.listAccounts();
  if (accounts.length === 0) {
    process.stdout.write("No accounts. Run `activitypub-mcp login <instance>` to sign in.\n");
    return;
  }
  process.stdout.write(`Accounts (${accounts.length}):\n`);
  for (const a of accounts) {
    const source = persistedIds.has(a.id) ? "persisted" : "env";
    const label = a.label ? ` "${a.label}"` : "";
    const active = a.isActive ? " (active)" : "";
    process.stdout.write(
      `  • ${a.id}${label} — @${a.username}@${a.instance} [${a.scopes.join(", ")}] (${source})${active}\n`,
    );
  }
}
