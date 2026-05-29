/**
 * Mastodon OAuth login provider (out-of-band code paste).
 *
 * Registers a confidential client, builds the authorize URL with
 * redirect_uri = urn:ietf:wg:oauth:2.0:oob, and exchanges the pasted code for
 * an access token. PKCE is skipped — the client_secret authenticates the
 * exchange, which is broadly compatible across Mastodon versions.
 */

import { OAUTH_APP_NAME, OAUTH_APP_WEBSITE } from "../../config.js";
import {
  type LoginProvider,
  type LoginResult,
  normalizeInstance,
  oauthJsonRequest,
  type PendingLoginData,
} from "./login-provider.js";

const OOB = "urn:ietf:wg:oauth:2.0:oob";
const SCOPES = "read write follow";

export class MastodonOAuthProvider implements LoginProvider {
  async begin(instance: string): Promise<{ authorizeUrl: string; pending: PendingLoginData }> {
    const host = normalizeInstance(instance);
    const app = await oauthJsonRequest<{ client_id: string; client_secret: string }>(
      `https://${host}/api/v1/apps`,
      {
        method: "POST",
        body: JSON.stringify({
          client_name: OAUTH_APP_NAME,
          redirect_uris: OOB,
          scopes: SCOPES,
          website: OAUTH_APP_WEBSITE,
        }),
      },
      "register application",
    );
    const authorize = new URL(`https://${host}/oauth/authorize`);
    authorize.searchParams.set("client_id", app.client_id);
    authorize.searchParams.set("scope", SCOPES);
    authorize.searchParams.set("redirect_uri", OOB);
    authorize.searchParams.set("response_type", "code");
    return {
      authorizeUrl: authorize.toString(),
      pending: {
        kind: "mastodon",
        instance: host,
        clientId: app.client_id,
        clientSecret: app.client_secret,
      },
    };
  }

  async complete(pending: PendingLoginData, code?: string): Promise<LoginResult> {
    if (pending.kind !== "mastodon") throw new Error("Mismatched provider for pending login");
    if (!code) throw new Error("An authorization code is required to complete Mastodon login");
    const token = await oauthJsonRequest<{ access_token: string; token_type?: string }>(
      `https://${pending.instance}/oauth/token`,
      {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: pending.clientId,
          client_secret: pending.clientSecret,
          redirect_uri: OOB,
          code,
          scope: SCOPES,
        }),
      },
      "exchange authorization code",
    );
    return { accessToken: token.access_token, tokenType: token.token_type || "Bearer" };
  }
}

export const mastodonOAuthProvider = new MastodonOAuthProvider();
