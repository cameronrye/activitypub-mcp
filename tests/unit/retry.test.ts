import { describe, expect, it } from "vitest";
import { isRetryableStatus, parseRetryAfter } from "../../src/utils/retry.js";

describe("isRetryableStatus", () => {
  it("retries rate-limit, request-timeout, and transient 5xx", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
  });

  it("does not retry permanent client errors", () => {
    for (const status of [400, 401, 403, 404, 410, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });

  it("does not retry 2xx/3xx or 501 Not Implemented", () => {
    for (const status of [200, 204, 301, 501]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });
});

describe("parseRetryAfter", () => {
  it("returns undefined for an absent or blank header", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter("   ")).toBeUndefined();
  });

  it("parses delta-seconds into milliseconds", () => {
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("120")).toBe(120_000);
  });

  it("parses an HTTP-date relative to now", () => {
    const now = Date.parse("2026-06-02T12:00:00Z");
    const future = new Date(now + 30_000).toUTCString();
    expect(parseRetryAfter(future, now)).toBe(30_000);
  });

  it("clamps a past HTTP-date to 0", () => {
    const now = Date.parse("2026-06-02T12:00:00Z");
    const past = new Date(now - 30_000).toUTCString();
    expect(parseRetryAfter(past, now)).toBe(0);
  });

  it("returns undefined for malformed values", () => {
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter("-5")).toBeUndefined();
  });
});
