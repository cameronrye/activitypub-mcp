/**
 * Persistence for OAuth/MiAuth-acquired accounts.
 *
 * Writes a JSON array of account credentials to a 0600 file (default under the
 * user's config dir, overridable via MCP_TOKEN_STORE). Loaded at startup by the
 * account manager alongside env-configured accounts. Never throws on read —
 * a missing/corrupt file yields an empty list so the server always starts.
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { TOKEN_STORE_PATH } from "../config.js";
import type { AccountCredentials } from "./account-manager.js";

const logger = getLogger("activitypub-mcp:token-store");

// Own schema (not imported from account-manager) to avoid an import cycle:
// account-manager imports this module at runtime.
const PersistedAccountSchema = z.object({
  id: z.string(),
  instance: z.string(),
  username: z.string(),
  accessToken: z.string(),
  tokenType: z.string().default("Bearer"),
  scopes: z.array(z.string()).default(["read", "write", "follow"]),
  createdAt: z.string(),
  label: z.string().optional(),
});

async function readAll(): Promise<AccountCredentials[]> {
  let raw: string;
  try {
    raw = await readFile(TOKEN_STORE_PATH, "utf8");
  } catch {
    return []; // missing file is normal
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn("Token store is not valid JSON; ignoring", { path: TOKEN_STORE_PATH });
    return [];
  }
  if (!Array.isArray(parsed)) {
    logger.warn("Token store is not a JSON array; ignoring", { path: TOKEN_STORE_PATH });
    return [];
  }
  const valid: AccountCredentials[] = [];
  for (const entry of parsed) {
    const result = PersistedAccountSchema.safeParse(entry);
    if (result.success) valid.push(result.data);
    else logger.warn("Skipping invalid token-store entry");
  }
  return valid;
}

async function writeAll(accounts: AccountCredentials[]): Promise<void> {
  await mkdir(dirname(TOKEN_STORE_PATH), { recursive: true, mode: 0o700 });
  await writeFile(TOKEN_STORE_PATH, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  // Ensure perms even if the file pre-existed with a looser mode.
  await chmod(TOKEN_STORE_PATH, 0o600);
}

export async function loadAll(): Promise<AccountCredentials[]> {
  return readAll();
}

export async function save(account: AccountCredentials): Promise<void> {
  const accounts = await readAll();
  const idx = accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) accounts[idx] = account;
  else accounts.push(account);
  await writeAll(accounts);
  logger.info("Persisted account to token store", { id: account.id, instance: account.instance });
}

export async function remove(id: string): Promise<void> {
  const accounts = await readAll();
  const next = accounts.filter((a) => a.id !== id);
  if (next.length !== accounts.length) await writeAll(next);
}
