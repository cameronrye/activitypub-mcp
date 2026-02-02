/**
 * Unit tests for the RateLimiter class.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/server/rate-limiter.js";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    // Use fake timers for predictable time-based tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clean up rate limiter and restore real timers
    rateLimiter?.stop();
    vi.useRealTimers();
  });

  describe("when disabled", () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter({
        enabled: false,
        maxRequests: 10,
        windowMs: 60000,
      });
    });

    it("should allow all requests when disabled", () => {
      for (let i = 0; i < 100; i++) {
        expect(rateLimiter.checkLimit("test-id")).toBe(true);
      }
    });

    it("should report correct stats when disabled", () => {
      const stats = rateLimiter.getStats();
      expect(stats.config.enabled).toBe(false);
      expect(stats.trackedIdentifiers).toBe(0);
    });
  });

  describe("when enabled", () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter({
        enabled: true,
        maxRequests: 5,
        windowMs: 60000, // 1 minute
      });
    });

    it("should allow requests within limit", () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.checkLimit("user1")).toBe(true);
      }
    });

    it("should block requests exceeding limit", () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit("user1");
      }

      // Next request should be blocked
      expect(rateLimiter.checkLimit("user1")).toBe(false);
    });

    it("should track limits separately per identifier", () => {
      // Use up limit for user1
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit("user1");
      }
      expect(rateLimiter.checkLimit("user1")).toBe(false);

      // user2 should still have full quota
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.checkLimit("user2")).toBe(true);
      }
    });

    it("should reset limit after window expires", () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit("user1");
      }
      expect(rateLimiter.checkLimit("user1")).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(60001);

      // Should be allowed again
      expect(rateLimiter.checkLimit("user1")).toBe(true);
    });

    it("should handle anonymous identifier", () => {
      // Empty string should be treated as "anonymous"
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.checkLimit("")).toBe(true);
      }
      expect(rateLimiter.checkLimit("")).toBe(false);
    });
  });

  describe("getStatus", () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter({
        enabled: true,
        maxRequests: 5,
        windowMs: 60000,
      });
    });

    it("should return full quota for new identifier", () => {
      const status = rateLimiter.getStatus("new-user");
      expect(status.remaining).toBe(5);
      expect(status.isLimited).toBe(false);
    });

    it("should return correct remaining count", () => {
      rateLimiter.checkLimit("user1");
      rateLimiter.checkLimit("user1");

      const status = rateLimiter.getStatus("user1");
      expect(status.remaining).toBe(3);
      expect(status.isLimited).toBe(false);
    });

    it("should indicate when limited", () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit("user1");
      }

      const status = rateLimiter.getStatus("user1");
      expect(status.remaining).toBe(0);
      expect(status.isLimited).toBe(true);
    });

    it("should include reset time", () => {
      const now = Date.now();
      rateLimiter.checkLimit("user1");

      const status = rateLimiter.getStatus("user1");
      expect(status.resetTime).toBeGreaterThan(now);
      expect(status.resetTime).toBeLessThanOrEqual(now + 60000);
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter({
        enabled: true,
        maxRequests: 10,
        windowMs: 60000,
      });
    });

    it("should return config and tracked count", () => {
      rateLimiter.checkLimit("user1");
      rateLimiter.checkLimit("user2");
      rateLimiter.checkLimit("user3");

      const stats = rateLimiter.getStats();
      expect(stats.config.enabled).toBe(true);
      expect(stats.config.maxRequests).toBe(10);
      expect(stats.config.windowMs).toBe(60000);
      expect(stats.trackedIdentifiers).toBe(3);
    });
  });

  describe("cleanup", () => {
    it("should clean up expired entries", () => {
      rateLimiter = new RateLimiter({
        enabled: true,
        maxRequests: 5,
        windowMs: 60000,
      });

      // Create some entries
      rateLimiter.checkLimit("user1");
      rateLimiter.checkLimit("user2");

      expect(rateLimiter.getStats().trackedIdentifiers).toBe(2);

      // Advance time past window + cleanup interval
      vi.advanceTimersByTime(120000);

      // After cleanup runs, entries should be removed
      expect(rateLimiter.getStats().trackedIdentifiers).toBe(0);
    });
  });

  describe("stop", () => {
    it("should stop the cleanup interval", () => {
      rateLimiter = new RateLimiter({
        enabled: true,
        maxRequests: 5,
        windowMs: 60000,
      });

      // This should not throw
      rateLimiter.stop();
      rateLimiter.stop(); // Should be safe to call multiple times
    });
  });
});
