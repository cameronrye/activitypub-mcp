/**
 * HTTP retry-policy helpers.
 *
 * Pure functions so the policy (which statuses are worth retrying, and how to
 * honor a server's Retry-After header) is unit-testable independently of the
 * network client. Used by the remote ActivityPub client's retry loop.
 */

/**
 * Status codes worth retrying: rate-limit (429), request timeout (408), and
 * transient server errors (500/502/503/504). Permanent client errors (400, 401,
 * 403, 404, 410, …) and 501 Not Implemented are NOT retried — retrying them only
 * wastes the budget and, for 429, can worsen rate-limit standing.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 429 || status === 408) return true;
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Parse a `Retry-After` header into milliseconds. Supports both delta-seconds
 * (e.g. "120") and an HTTP-date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT"). Returns
 * `undefined` for an absent or malformed value; a past HTTP-date clamps to 0.
 * `nowMs` is injectable so the date branch is deterministic under test.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (trimmed === "") return undefined;

  // delta-seconds (non-negative integer)
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000;
  }

  // HTTP-date — always contains a weekday/month name, so require a letter before
  // calling Date.parse (which otherwise coerces numeric junk like "-5" to a date).
  if (/[a-z]/i.test(trimmed)) {
    const dateMs = Date.parse(trimmed);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, dateMs - nowMs);
    }
  }

  return undefined;
}
