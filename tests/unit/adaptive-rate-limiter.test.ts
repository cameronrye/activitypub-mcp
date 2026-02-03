/**
 * Unit tests for adaptive rate limiter module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AdaptiveRateLimiter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow requests when no limit info exists", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    const result = limiter.checkLimit("mastodon.social");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("should parse rate limit headers correctly", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    const headers = new Headers({
      "x-ratelimit-limit": "300",
      "x-ratelimit-remaining": "150",
      "x-ratelimit-reset": new Date(Date.now() + 60000).toISOString(),
    });

    const info = limiter.parseHeaders("mastodon.social", headers);

    expect(info.domain).toBe("mastodon.social");
    expect(info.limit).toBe(300);
    expect(info.remaining).toBe(150);
    expect(info.isLimited).toBe(false);
  });

  it("should detect rate limiting from headers", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    const headers = new Headers({
      "x-ratelimit-limit": "300",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": new Date(Date.now() + 60000).toISOString(),
    });

    const info = limiter.parseHeaders("mastodon.social", headers);

    expect(info.isLimited).toBe(true);
    expect(info.remaining).toBe(0);
  });

  it("should handle retry-after header", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    const headers = new Headers({
      "retry-after": "30",
    });

    const info = limiter.parseHeaders("mastodon.social", headers);

    expect(info.isLimited).toBe(true);
    expect(info.retryAfter).toBe(30000); // 30 seconds in ms
  });

  it("should decrement remaining on checkLimit", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    // Set up initial limit info
    const headers = new Headers({
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": "10",
      "x-ratelimit-reset": new Date(Date.now() + 60000).toISOString(),
    });
    limiter.parseHeaders("mastodon.social", headers);

    // Check limit should decrement remaining
    const result1 = limiter.checkLimit("mastodon.social");
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(9);

    const result2 = limiter.checkLimit("mastodon.social");
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(8);
  });

  it("should block requests when rate limited", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    // Set up rate limited state
    const headers = new Headers({
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": new Date(Date.now() + 60000).toISOString(),
    });
    limiter.parseHeaders("mastodon.social", headers);

    const result = limiter.checkLimit("mastodon.social");
    expect(result.allowed).toBe(false);
    expect(result.waitMs).toBeGreaterThan(0);
  });

  it("should reset limits after reset time", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    // Set up rate limited state with reset in 1 second
    const headers = new Headers({
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": new Date(Date.now() + 1000).toISOString(),
    });
    limiter.parseHeaders("mastodon.social", headers);

    // Should be blocked initially
    let result = limiter.checkLimit("mastodon.social");
    expect(result.allowed).toBe(false);

    // Advance time past reset
    vi.advanceTimersByTime(2000);

    // Should be allowed now
    result = limiter.checkLimit("mastodon.social");
    expect(result.allowed).toBe(true);
  });

  it("should handle rate limit errors", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    limiter.handleRateLimitError("mastodon.social", 60);

    const info = limiter.getInstanceLimit("mastodon.social");
    expect(info).toBeDefined();
    expect(info?.isLimited).toBe(true);
    expect(info?.remaining).toBe(0);
  });

  it("should track multiple instances independently", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    // Set up different limits for different instances
    limiter.parseHeaders(
      "mastodon.social",
      new Headers({
        "x-ratelimit-limit": "300",
        "x-ratelimit-remaining": "100",
      }),
    );

    limiter.parseHeaders(
      "fosstodon.org",
      new Headers({
        "x-ratelimit-limit": "200",
        "x-ratelimit-remaining": "50",
      }),
    );

    const mastodon = limiter.getInstanceLimit("mastodon.social");
    const fosstodon = limiter.getInstanceLimit("fosstodon.org");

    expect(mastodon?.limit).toBe(300);
    expect(mastodon?.remaining).toBe(100);
    expect(fosstodon?.limit).toBe(200);
    expect(fosstodon?.remaining).toBe(50);
  });

  it("should get all limited instances", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    // Set up one limited, one not limited
    limiter.parseHeaders(
      "limited.social",
      new Headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": new Date(Date.now() + 60000).toISOString(),
      }),
    );

    limiter.parseHeaders(
      "ok.social",
      new Headers({
        "x-ratelimit-remaining": "100",
      }),
    );

    const limited = limiter.getLimitedInstances();
    expect(limited).toHaveLength(1);
    expect(limited[0].domain).toBe("limited.social");
  });

  it("should calculate recommended delay", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    // No info = no delay
    expect(limiter.getRecommendedDelay("unknown.social")).toBe(0);

    // Plenty remaining = no delay
    limiter.parseHeaders(
      "plenty.social",
      new Headers({
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "80",
      }),
    );
    expect(limiter.getRecommendedDelay("plenty.social")).toBe(0);

    // Low remaining = some delay
    limiter.parseHeaders(
      "low.social",
      new Headers({
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "5", // 5% remaining
      }),
    );
    expect(limiter.getRecommendedDelay("low.social")).toBeGreaterThan(0);
  });

  it("should get stats", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    limiter.parseHeaders("instance1.social", new Headers({ "x-ratelimit-remaining": "100" }));
    limiter.parseHeaders("instance2.social", new Headers({ "x-ratelimit-remaining": "0" }));

    const stats = limiter.getStats();
    expect(stats.trackedInstances).toBe(2);
    expect(stats.instances).toHaveLength(2);
  });

  it("should clear instance and all limits", async () => {
    const { AdaptiveRateLimiter } = await import("../../src/server/adaptive-rate-limiter.js");
    const limiter = new AdaptiveRateLimiter();

    limiter.parseHeaders("instance1.social", new Headers({ "x-ratelimit-remaining": "100" }));
    limiter.parseHeaders("instance2.social", new Headers({ "x-ratelimit-remaining": "50" }));

    // Clear one
    limiter.clearInstance("instance1.social");
    expect(limiter.getInstanceLimit("instance1.social")).toBeUndefined();
    expect(limiter.getInstanceLimit("instance2.social")).toBeDefined();

    // Clear all
    limiter.clearAll();
    expect(limiter.getStats().trackedInstances).toBe(0);
  });
});
