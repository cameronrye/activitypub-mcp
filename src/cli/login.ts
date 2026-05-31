/**
 * `activitypub-mcp login <instance> [--port N] [--id ID] [--label L]`
 *
 * Validates the instance, resolves the platform login strategy, runs the
 * interactive flow against an ephemeral loopback callback, and persists the
 * resulting token. Never logs secrets.
 */

import { credentialStore, type StoredAccount } from "../auth/credential-store.js";
import { openBrowser } from "../auth/login/browser.js";
import { createLoopbackServer } from "../auth/login/loopback-server.js";
import { resolveLoginStrategy } from "../auth/login/resolve.js";
import { scopesFor } from "../auth/login/scopes.js";
import { ENABLE_WRITES } from "../config.js";
import { instanceBlocklist } from "../policy/instance-blocklist.js";
import { DomainSchema } from "../validation/schemas.js";

interface LoginFlags {
  port?: number;
  id?: string;
  label?: string;
  write?: boolean;
}

function parseFlags(rest: string[]): LoginFlags {
  const flags: LoginFlags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--port") {
      const port = Number.parseInt(rest[++i] ?? "", 10);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error("--port must be an integer between 0 and 65535");
      }
      flags.port = port;
    } else if (arg === "--id") flags.id = rest[++i];
    else if (arg === "--label") flags.label = rest[++i];
    else if (arg === "--write") flags.write = true;
  }
  return flags;
}

export async function runLogin(argv: string[]): Promise<void> {
  const [rawInstance, ...rest] = argv;
  if (!rawInstance) {
    throw new Error(
      "Usage: activitypub-mcp login <instance> [--port N] [--id ID] [--label L] [--write]",
    );
  }

  const instance = DomainSchema.parse(rawInstance).toLowerCase();
  instanceBlocklist.validateNotBlocked(instance);
  const flags = parseFlags(rest);

  const strategy = await resolveLoginStrategy(instance);
  // Least-privilege by default: only request write scopes when the deployment
  // intends writes (ACTIVITYPUB_ENABLE_WRITES=true) or the user opts in with
  // --write. A read-only server then stores a read-only token.
  const wantWrites = ENABLE_WRITES || flags.write === true;
  const scopes = scopesFor(strategy.kind, wantWrites);

  const loopback = await createLoopbackServer(flags.port ?? 0);
  try {
    const result = await strategy.authorize({
      instance,
      redirectUri: loopback.redirectUri,
      scopes,
      openBrowser: async (url) => {
        try {
          await openBrowser(url);
          process.stdout.write("→ Opening your browser to authorize…\n");
        } catch {
          process.stdout.write(`→ Open this URL to authorize:\n  ${url}\n`);
        }
      },
      waitForCallback: (expected) => loopback.waitForCallback(expected),
    });

    const account: StoredAccount = {
      id: flags.id ?? `${result.username.toLowerCase()}@${instance}`,
      instance: result.instance,
      username: result.username,
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      scopes: result.scopes,
      clientId: result.clientId,
      clientSecret: result.clientSecret,
      label: flags.label,
      createdAt: new Date().toISOString(),
    };
    await credentialStore.upsert(account);
    process.stdout.write(
      `✓ Authorized as @${account.username}@${account.instance} (id: ${account.id})\n`,
    );
  } finally {
    loopback.close();
  }
}
