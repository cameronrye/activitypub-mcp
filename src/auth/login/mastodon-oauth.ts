/**
 * Mastodon-family OAuth2 login (also Pleroma/Akkoma/GotoSocial/Sharkey/Firefish
 * where they expose the Mastodon OAuth API). Loopback redirect + always-on PKCE
 * S256. A fresh client app is registered per login because the ephemeral
 * redirect port changes and Mastodon matches redirect_uri exactly.
 */

import { createHash, randomBytes } from "node:crypto";
import { guardedFetch } from "../../utils/fetch-helpers.js";
import type { StoredAccount } from "../credential-store.js";
import type { AuthorizeContext, LoginResult, LoginStrategy } from "./login-strategy.js";

const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function platformError(data: unknown, status: number): string {
  const d = data as { error_description?: string; error?: string } | undefined;
  return d?.error_description || d?.error || `HTTP ${status}`;
}

export class MastodonOAuthStrategy implements LoginStrategy {
  readonly kind = "mastodon" as const;

  async authorize(ctx: AuthorizeContext): Promise<LoginResult> {
    const base = `https://${ctx.instance}`;
    const scope = ctx.scopes.join(" ");

    // 1. Register a fresh client app for this exact redirect_uri.
    const appRes = await guardedFetch<{ client_id: string; client_secret: string }>(
      `${base}/api/v1/apps`,
      {
        method: "POST",
        headers: FORM,
        body: new URLSearchParams({
          client_name: "activitypub-mcp",
          redirect_uris: ctx.redirectUri,
          scopes: scope,
          website: "https://github.com/cameronrye/activitypub-mcp",
        }).toString(),
      },
    );
    if (!appRes.ok || !appRes.data) {
      throw new Error(`Failed to register app: ${platformError(appRes.data, appRes.status)}`);
    }
    const { client_id, client_secret } = appRes.data;

    // 2. PKCE + state.
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const state = base64url(randomBytes(32));

    // 3. Authorize in the browser.
    const authorizeUrl =
      `${base}/oauth/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id,
        redirect_uri: ctx.redirectUri,
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
    await ctx.openBrowser(authorizeUrl);

    // 4. Capture the code (loopback verifies state).
    const params = await ctx.waitForCallback({ state });
    // Mix-up defense (RFC 9700 §4.4): if the AS returned an `iss`, it must be our instance.
    const iss = params.get("iss");
    if (iss && new URL(iss).host !== ctx.instance) {
      throw new Error("Authorization issuer mismatch (possible mix-up attack)");
    }
    const code = params.get("code");
    if (!code) throw new Error("Authorization callback returned no code");

    // 5. Exchange the code for a token (always send code_verifier).
    const tokenRes = await guardedFetch<{
      access_token: string;
      token_type: string;
      scope?: string;
    }>(`${base}/oauth/token`, {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id,
        client_secret,
        redirect_uri: ctx.redirectUri,
        code_verifier: verifier,
        scope,
      }).toString(),
    });
    if (!tokenRes.ok || !tokenRes.data?.access_token) {
      throw new Error(`Token exchange failed: ${platformError(tokenRes.data, tokenRes.status)}`);
    }
    const granted = tokenRes.data.scope ? tokenRes.data.scope.split(" ") : ctx.scopes;

    // 6. Whoami.
    const whoami = await guardedFetch<{ username: string }>(
      `${base}/api/v1/accounts/verify_credentials`,
      { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } },
    );
    if (!whoami.ok || !whoami.data?.username) {
      throw new Error(`Could not read account: ${platformError(whoami.data, whoami.status)}`);
    }

    return {
      instance: ctx.instance,
      username: whoami.data.username,
      accessToken: tokenRes.data.access_token,
      tokenType: tokenRes.data.token_type || "Bearer",
      scopes: granted,
      clientId: client_id,
      clientSecret: client_secret,
    };
  }

  async revoke(account: StoredAccount): Promise<void> {
    if (!account.clientId || !account.clientSecret) return;
    await guardedFetch(`https://${account.instance}/oauth/revoke`, {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({
        client_id: account.clientId,
        client_secret: account.clientSecret,
        token: account.accessToken,
      }).toString(),
    });
  }
}

export const mastodonOAuthStrategy = new MastodonOAuthStrategy();
