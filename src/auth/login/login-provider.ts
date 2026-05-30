/**
 * Shared contracts for account-onboarding login providers and a guarded
 * no-auth JSON request helper (app registration / token exchange / MiAuth
 * check all happen before any token exists).
 */

import { MAX_RESPONSE_SIZE, USER_AGENT } from "../../config.js";
import { instanceBlocklist } from "../../policy/instance-blocklist.js";
import { fetchWithRedirectGuard, readJsonWithLimit } from "../../utils/fetch-helpers.js";
import { validateExternalUrl } from "../../validation/url.js";

export interface LoginResult {
  accessToken: string;
  tokenType: string;
}

export type MastodonPending = {
  kind: "mastodon";
  instance: string;
  clientId: string;
  clientSecret: string;
};
export type MisskeyPending = { kind: "misskey"; instance: string; uuid: string };
export type PendingLoginData = MastodonPending | MisskeyPending;

export interface LoginProvider {
  /** Register/initiate; return the URL the user must open + provider state. */
  begin(instance: string): Promise<{ authorizeUrl: string; pending: PendingLoginData }>;
  /** Finish. Mastodon requires the pasted code; Misskey ignores it. */
  complete(pending: PendingLoginData, code?: string): Promise<LoginResult>;
}

/** Normalize user-supplied instance input to a bare lowercased hostname. */
export function normalizeInstance(input: string): string {
  let s = input.trim().replace(/^https?:\/\//i, "");
  s = s.replace(/\/.*$/, ""); // strip path
  return s.toLowerCase();
}

/**
 * Guarded JSON request used during onboarding (no Authorization header).
 * Applies https-only SSRF allow-list, operator blocklist, redirect
 * re-validation and the response-size cap.
 */
export async function oauthJsonRequest<T = unknown>(
  url: string,
  init: RequestInit,
  failVerb: string,
): Promise<T> {
  await validateExternalUrl(url);
  instanceBlocklist.validateNotBlocked(new URL(url).hostname);
  const response = await fetchWithRedirectGuard(
    url,
    {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        ...init.headers,
      },
    },
    async (target) => {
      await validateExternalUrl(target);
      instanceBlocklist.validateNotBlocked(new URL(target).hostname);
    },
  );
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await readJsonWithLimit<{ error?: string; error_description?: string }>(
        response,
        MAX_RESPONSE_SIZE,
      );
      if (body?.error_description) detail = body.error_description;
      else if (body?.error) detail = body.error;
    } catch {
      // keep status
    }
    throw new Error(`Failed to ${failVerb}: ${detail}`);
  }
  return readJsonWithLimit<T>(response, MAX_RESPONSE_SIZE);
}
