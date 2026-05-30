/**
 * Misskey MiAuth login provider.
 *
 * Generates a session UUID, builds the /miauth/<uuid> approval URL, and after
 * the user approves, checks the session to retrieve the access token. No app
 * registration or code exchange is required.
 */

import { OAUTH_APP_NAME } from "../../config.js";
import {
  type LoginProvider,
  type LoginResult,
  normalizeInstance,
  oauthJsonRequest,
  type PendingLoginData,
} from "./login-provider.js";

const PERMISSIONS = [
  "read:account",
  "write:notes",
  "write:following",
  "write:reactions",
  "write:blocks",
  "write:mutes",
  "write:drive",
].join(",");

export class MisskeyMiAuthProvider implements LoginProvider {
  async begin(instance: string): Promise<{ authorizeUrl: string; pending: PendingLoginData }> {
    const host = normalizeInstance(instance);
    const uuid = crypto.randomUUID();
    const url = new URL(`https://${host}/miauth/${uuid}`);
    url.searchParams.set("name", OAUTH_APP_NAME);
    url.searchParams.set("permission", PERMISSIONS);
    return { authorizeUrl: url.toString(), pending: { kind: "misskey", instance: host, uuid } };
  }

  async complete(pending: PendingLoginData, _code?: string): Promise<LoginResult> {
    if (pending.kind !== "misskey") throw new Error("Mismatched provider for pending login");
    const result = await oauthJsonRequest<{ ok: boolean; token?: string }>(
      `https://${pending.instance}/api/miauth/${pending.uuid}/check`,
      { method: "POST", body: "{}" },
      "check MiAuth session",
    );
    if (!result.ok || !result.token) {
      throw new Error("MiAuth session not approved yet — approve in your browser, then retry");
    }
    return { accessToken: result.token, tokenType: "Bearer" };
  }
}

export const misskeyMiAuthProvider = new MisskeyMiAuthProvider();
