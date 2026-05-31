/**
 * `activitypub-mcp logout <id>` — revoke (Mastodon) + remove from the store.
 */

import { credentialStore } from "../auth/credential-store.js";
import { resolveLoginStrategy } from "../auth/login/resolve.js";

export async function runLogout(argv: string[]): Promise<void> {
  const id = argv[0];
  if (!id) throw new Error("Usage: activitypub-mcp logout <id>");

  const account = await credentialStore.getAccount(id);
  if (!account) {
    throw new Error(
      `No persisted account found with id "${id}". Run \`activitypub-mcp accounts\` to list.`,
    );
  }

  const strategy = await resolveLoginStrategy(account.instance);
  if (strategy.revoke && account.clientId && account.clientSecret) {
    try {
      await strategy.revoke(account);
    } catch {
      process.stdout.write(
        "⚠ Server-side token revoke failed; removing the local record anyway.\n",
      );
    }
  } else if (strategy.kind === "misskey") {
    process.stdout.write(
      "ℹ Misskey has no app-revoke endpoint; removing the local record. " +
        "To fully revoke, delete the app token in your instance's Settings → API.\n",
    );
  }

  await credentialStore.remove(id);
  process.stdout.write(`✓ Logged out @${account.username}@${account.instance} (id: ${id})\n`);
}
