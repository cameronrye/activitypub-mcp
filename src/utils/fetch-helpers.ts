/**
 * Streaming response readers with safety caps + safe redirect helper.
 *
 * Replaces the legacy Content-Length-only checks scattered across
 * remote-client.ts and auth/authenticated-client.ts. The streaming
 * reader aborts the body once `maxBytes` is exceeded, regardless of
 * whether the server sent an accurate Content-Length header.
 */

import { MAX_RESPONSE_SIZE, REQUEST_TIMEOUT, USER_AGENT } from "../config.js";
import { instanceBlocklist } from "../policy/instance-blocklist.js";
import { validateExternalUrl } from "../validation/url.js";

/**
 * Fetch wrapper that follows up to `maxHops` redirects, but re-runs the
 * caller-supplied `validate` function on every redirect target before
 * following. This closes the "public host 302s to a private IP" gap
 * without breaking instances that legitimately redirect (Pleroma /
 * Pixelfed / Cloudflare-fronted Mastodons routinely 30x normalize paths).
 *
 * The validate callback should throw on disallowed targets. Same-origin
 * redirects are still validated — cheap, and protects against open
 * redirects on the origin host.
 */
export async function fetchWithRedirectGuard(
  url: string,
  init: RequestInit,
  validate: (target: string) => Promise<void> | void,
  maxHops = 3,
): Promise<Response> {
  let currentUrl = url;

  for (let hop = 0; hop <= maxHops; hop++) {
    const response = await fetch(currentUrl, { ...init, redirect: "manual" });

    // Not a redirect — return the response as-is.
    if (response.status < 300 || response.status >= 400 || response.status === 304) {
      return response;
    }

    if (hop === maxHops) {
      throw new Error(`Too many redirects (>${maxHops}) starting at ${url}`);
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Redirect from ${currentUrl} missing Location header`);
    }

    // Resolve relative redirects against the current URL.
    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new Error(`Redirect from ${currentUrl} has malformed Location: ${location}`);
    }

    await validate(nextUrl);
    currentUrl = nextUrl;
  }

  // Unreachable in practice — the loop either returns or throws.
  throw new Error(`Too many redirects (>${maxHops}) starting at ${url}`);
}

export class ResponseTooLargeError extends Error {
  constructor(
    public readonly bytesRead: number,
    public readonly maxBytes: number,
  ) {
    super(`Response too large: read ${bytesRead} bytes, cap ${maxBytes} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

/**
 * Read a Response body as JSON, aborting if it would exceed `maxBytes`.
 *
 * - Fast-path rejects when Content-Length is present and exceeds the cap.
 * - Otherwise streams the body and stops as soon as the running byte count
 *   passes the cap.
 */
export async function readJsonWithLimit<T = unknown>(
  response: Response,
  maxBytes: number,
): Promise<T> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new ResponseTooLargeError(declared, maxBytes);
    }
  }

  if (!response.body) {
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).length;
    if (byteLength > maxBytes) {
      throw new ResponseTooLargeError(byteLength, maxBytes);
    }
    return JSON.parse(text) as T;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel(`response exceeded ${maxBytes} bytes`);
        throw new ResponseTooLargeError(total, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(merged);
  return JSON.parse(text) as T;
}

export interface GuardedFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface GuardedResponse<T> {
  ok: boolean;
  status: number;
  statusText: string;
  /** Parsed JSON body, or undefined if the body was empty / not JSON. */
  data: T | undefined;
}

/**
 * Guarded UNauthenticated fetch: SSRF allow-list + operator blocklist on the
 * initial URL and every redirect hop, abort/timeout, streaming size cap, and
 * best-effort JSON parsing. Used by NodeInfo discovery and the login flows'
 * pre-token calls (which have no Bearer token, so they can't use
 * authenticatedFetch).
 */
export async function guardedFetch<T = unknown>(
  url: string,
  options: GuardedFetchOptions = {},
): Promise<GuardedResponse<T>> {
  await validateExternalUrl(url);
  instanceBlocklist.validateNotBlocked(new URL(url).hostname);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT);
  try {
    const response = await fetchWithRedirectGuard(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      },
      async (target) => {
        await validateExternalUrl(target);
        instanceBlocklist.validateNotBlocked(new URL(target).hostname);
      },
    );

    let data: T | undefined;
    if (response.status !== 204) {
      try {
        data = await readJsonWithLimit<T>(response, MAX_RESPONSE_SIZE);
      } catch (error) {
        // A too-large body is a real failure callers must see — don't mask it as
        // a successful empty response. Only an empty / non-JSON body → undefined.
        if (error instanceof ResponseTooLargeError) throw error;
        data = undefined;
      }
    }
    return { ok: response.ok, status: response.status, statusText: response.statusText, data };
  } finally {
    clearTimeout(timeoutId);
  }
}
