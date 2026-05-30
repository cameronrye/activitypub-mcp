/**
 * Misskey / Foundkey MiAuth login. The user approves a session UUID in the
 * browser; the callback returns ?session=<uuid>, then POST /api/miauth/<uuid>/check
 * yields the access token + user inline (no app registration, no client secret,
 * no separate whoami). The session UUID is a secret (its bearer can call /check).
 *
 * Note: Foundkey is deprecating MiAuth in favor of OAuth2 — on a build where
 * /miauth is unavailable this surfaces a clear error.
 */

import { randomUUID } from "node:crypto";
import { guardedFetch } from "../../utils/fetch-helpers.js";
import type { AuthorizeContext, LoginResult, LoginStrategy } from "./login-strategy.js";

interface MiAuthCheck {
  ok: boolean;
  token?: string;
  user?: { username?: string };
  error?: { message?: string };
}

export class MisskeyMiAuthStrategy implements LoginStrategy {
  readonly kind = "misskey" as const;

  async authorize(ctx: AuthorizeContext): Promise<LoginResult> {
    const session = randomUUID();
    const base = `https://${ctx.instance}`;

    const consentUrl =
      `${base}/miauth/${session}?` +
      new URLSearchParams({
        name: "activitypub-mcp",
        callback: ctx.redirectUri,
        permission: ctx.scopes.join(","),
      }).toString();
    await ctx.openBrowser(consentUrl);

    // Loopback verifies the returned session matches.
    await ctx.waitForCallback({ session });

    const res = await guardedFetch<MiAuthCheck>(`${base}/api/miauth/${session}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok || !res.data?.ok || !res.data.token) {
      const detail = res.data?.error?.message
        ? `: ${res.data.error.message}`
        : ` (HTTP ${res.status})`;
      throw new Error(`MiAuth authorization was not approved${detail}`);
    }
    const username = res.data.user?.username;
    if (!username) throw new Error("MiAuth check returned no user identity");

    return {
      instance: ctx.instance,
      username, // bare local handle from /check; never falls back to the domain
      accessToken: res.data.token,
      tokenType: "Bearer",
      scopes: ctx.scopes, // /check does not report the granted subset
    };
  }
}

export const misskeyMiAuthStrategy = new MisskeyMiAuthStrategy();
