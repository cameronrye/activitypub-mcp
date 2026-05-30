/**
 * Contracts for platform login strategies. The CLI orchestrator owns the shared
 * mechanics (loopback server, browser opener, timeout) and injects them via
 * AuthorizeContext; each strategy implements only its platform's protocol.
 */

import type { StoredAccount } from "../credential-store.js";

export interface AuthorizeContext {
  /** Validated bare domain (DomainSchema), lowercased. */
  instance: string;
  /** http://127.0.0.1:<ephemeral-port>/callback */
  redirectUri: string;
  /** Platform-appropriate scope/permission list (from scopes.ts). */
  scopes: string[];
  openBrowser: (url: string) => Promise<void>;
  waitForCallback: (expected: { state?: string; session?: string }) => Promise<URLSearchParams>;
}

export interface LoginResult {
  instance: string;
  username: string;
  accessToken: string;
  tokenType: string;
  scopes: string[];
  clientId?: string;
  clientSecret?: string;
}

export interface LoginStrategy {
  readonly kind: "mastodon" | "misskey";
  authorize(ctx: AuthorizeContext): Promise<LoginResult>;
  /** Revoke the token server-side. Unimplemented on Misskey (no MiAuth revoke). */
  revoke?(account: StoredAccount): Promise<void>;
}
