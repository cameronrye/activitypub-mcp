/**
 * Streaming response readers with safety caps + safe redirect helper.
 *
 * Replaces the legacy Content-Length-only checks scattered across
 * remote-client.ts and auth/authenticated-client.ts. The streaming
 * reader aborts the body once `maxBytes` is exceeded, regardless of
 * whether the server sent an accurate Content-Length header.
 */

import type { Agent } from "undici";
import { MAX_RESPONSE_SIZE, REQUEST_TIMEOUT, USER_AGENT } from "../config.js";
import { instanceBlocklist } from "../policy/instance-blocklist.js";
import { resolveAndPin } from "../validation/url.js";

/** RequestInit augmented with the undici `dispatcher` (not in the DOM types). */
export type DispatchInit = RequestInit & { dispatcher?: Agent };

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
  init: DispatchInit,
  // biome-ignore lint/suspicious/noConfusingVoidType: validators may return nothing (no re-pin) or an Agent pinned to the next hop
  validate: (target: string) => Promise<Agent | void> | Agent | void,
  maxHops = 3,
): Promise<Response> {
  let currentUrl = url;
  // The dispatcher pinned for the current hop. Starts from the caller-supplied
  // init (pinned to the initial URL's validated IP) and is replaced per hop with
  // the dispatcher the validator returns for the next target.
  let currentDispatcher = init.dispatcher;

  for (let hop = 0; hop <= maxHops; hop++) {
    const response = await fetch(currentUrl, {
      ...init,
      dispatcher: currentDispatcher,
      redirect: "manual",
    } as DispatchInit);

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

    // Re-validate the next hop. The validator may return a dispatcher pinned to
    // the next target's validated IP; use it for the next fetch. When it returns
    // nothing we deliberately drop the previous hop's pinned dispatcher rather
    // than carrying it over — reusing it would force this hop's connection onto
    // the prior hop's IP (wrong host). An unpinned fetch re-resolves the new
    // hostname itself, which is the correct behaviour (e.g. ENOTFOUND fails as
    // it should) and matches the non-pinning callers' expectations.
    currentDispatcher = (await validate(nextUrl)) ?? undefined;
    currentUrl = nextUrl;
  }

  // Unreachable in practice — the loop either returns or throws.
  throw new Error(`Too many redirects (>${maxHops}) starting at ${url}`);
}

/**
 * Outbound fetch with full SSRF protection: resolves + validates + PINS the
 * connection to a validated IP, re-pinning on every redirect hop so a public
 * host can't 302 to a private IP. `onHop(target)` runs an optional extra
 * per-hop check (e.g. operator instance-blocklist) for both the initial URL
 * and every redirect target; throw from it to reject.
 *
 * Note: a fresh undici Agent is created per request and intentionally NOT
 * closed here — the Response body is streamed to the caller AFTER this returns,
 * so closing the dispatcher now would abort it. Undici unref()s idle sockets
 * and closes them after keepAliveTimeout (~4s), so they self-clean.
 */
export async function pinnedFetch(
  url: string,
  init: DispatchInit,
  onHop?: (target: string) => Promise<void> | void,
): Promise<Response> {
  const { dispatcher } = await resolveAndPin(url);
  if (onHop) await onHop(url);
  return fetchWithRedirectGuard(url, { ...init, dispatcher }, async (target) => {
    const pinned = await resolveAndPin(target);
    if (onHop) await onHop(target);
    return pinned.dispatcher;
  });
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

/**
 * Read a Response body as text for an ERROR message, bounded to `maxBytes`.
 *
 * Error bodies are attacker-influenceable (a hostile/misconfigured instance
 * controls them) and flow into thrown Error messages, logs, and the audit trail.
 * Unlike the success readers, the legacy error path used an UNcapped
 * `response.text()`, giving the remote an unbounded write channel into those
 * sinks. This streams and stops at the cap, appending a truncation marker, and
 * never throws (returns "" if the body can't be read) so it is safe in a catch.
 */
export async function readErrorText(response: Response, maxBytes = 2048): Promise<string> {
  const mark = (t: string) => (t.length > maxBytes ? `${t.slice(0, maxBytes)}…[truncated]` : t);
  try {
    const reader = response.body?.getReader();
    if (!reader) return mark(await response.text());

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
      }
      await reader.cancel().catch(() => {});
    } finally {
      reader.releaseLock();
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return mark(new TextDecoder("utf-8").decode(merged));
  } catch {
    return "";
  }
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT);
  try {
    const response = await pinnedFetch(
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
      // Operator blocklist on the initial URL and every redirect hop.
      (target) => instanceBlocklist.validateNotBlocked(new URL(target).hostname),
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
