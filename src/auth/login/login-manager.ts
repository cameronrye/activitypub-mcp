/**
 * Orchestrates account onboarding: selects the platform login provider, holds
 * ephemeral pending-login state, and on completion verifies + persists the
 * acquired account. Tokens are never returned to callers.
 */

import { getLogger } from "@logtape/logtape";
import type { AccountCredentials } from "../account-manager.js";
import { accountManager } from "../account-manager.js";
import { resolveSoftwareKind, resolveWriteAdapter } from "../adapters/resolve.js";
import type { LoginProvider, PendingLoginData } from "./login-provider.js";
import { mastodonOAuthProvider } from "./mastodon-oauth.js";
import { misskeyMiAuthProvider } from "./misskey-miauth.js";

const logger = getLogger("activitypub-mcp:login-manager");

const PENDING_TTL_MS = 10 * 60 * 1000;

type StoredPending = PendingLoginData & { createdAt: number };
const pending = new Map<string, StoredPending>();

/** Test-only: clear pending state. */
export function __clearPending(): void {
  pending.clear();
}

function prune(): void {
  const now = Date.now();
  for (const [id, p] of pending) {
    if (now - p.createdAt > PENDING_TTL_MS) pending.delete(id);
  }
}

function providerFor(kind: "mastodon" | "misskey"): LoginProvider {
  return kind === "misskey" ? misskeyMiAuthProvider : mastodonOAuthProvider;
}

export interface BeginLoginResult {
  loginId: string;
  authorizeUrl: string;
  kind: "mastodon" | "misskey";
}

export async function beginLogin(instance: string): Promise<BeginLoginResult> {
  const kind = await resolveSoftwareKind({ instance } as AccountCredentials);
  const provider = providerFor(kind);
  const { authorizeUrl, pending: data } = await provider.begin(instance);
  const loginId = crypto.randomUUID();
  pending.set(loginId, { ...data, createdAt: Date.now() });
  logger.info("Started login", { loginId, kind, instance: data.instance });
  return { loginId, authorizeUrl, kind };
}

export interface CompleteLoginResult {
  accountId: string;
  username: string;
  instance: string;
  isActive: boolean;
}

export async function completeLogin(loginId: string, code?: string): Promise<CompleteLoginResult> {
  prune();
  const data = pending.get(loginId);
  if (!data) {
    throw new Error("Unknown or expired login session. Start over with start-login.");
  }
  const provider = providerFor(data.kind);
  const { accessToken, tokenType } = await provider.complete(data, code);

  // Verify to fetch the canonical username/id for this platform.
  const temp: AccountCredentials = {
    id: `pending:${loginId}`,
    instance: data.instance,
    username: "pending",
    accessToken,
    tokenType,
    scopes: ["read", "write", "follow"],
    createdAt: new Date().toISOString(),
  };
  const adapter = await resolveWriteAdapter(temp);
  const info = await adapter.verifyCredentials(temp);

  const accountId = `${data.kind}:${data.instance}:${info.username}`;
  const wasEmpty = !accountManager.hasAccounts();
  await accountManager.addAndPersistAccount({
    id: accountId,
    instance: data.instance,
    username: info.username,
    accessToken,
    tokenType,
    scopes: ["read", "write", "follow"],
    label: `${info.username}@${data.instance}`,
  });
  pending.delete(loginId);
  logger.info("Completed login", { accountId, instance: data.instance });
  return { accountId, username: info.username, instance: data.instance, isActive: wasEmpty };
}
