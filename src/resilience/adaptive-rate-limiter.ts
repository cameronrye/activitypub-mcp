/**
 * Adaptive Rate Limiter for per-instance rate limit management.
 *
 * This module extends basic rate limiting with the ability to:
 * - Parse rate limit headers from instance responses
 * - Adapt to each instance's specific rate limits
 * - Queue requests when limits are reached
 * - Provide backoff recommendations
 */

import { getLogger } from "@logtape/logtape";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from "../config.js";

const logger = getLogger("activitypub-mcp:adaptive-rate-limiter");

/**
 * Rate limit information for a specific instance
 */
export interface InstanceRateLimit {
  /** Instance domain */
  domain: string;
  /** Maximum requests allowed in the window */
  limit: number;
  /** Remaining requests in current window */
  remaining: number;
  /** Unix timestamp when the rate limit resets */
  resetAt: number;
  /** Last time we updated this info */
  updatedAt: number;
  /** Whether we're currently rate limited */
  isLimited: boolean;
  /** Recommended retry time (if limited) */
  retryAfter?: number;
}

/**
 * Standard rate limit headers from Mastodon API
 */
interface RateLimitHeaders {
  "x-ratelimit-limit"?: string;
  "x-ratelimit-remaining"?: string;
  "x-ratelimit-reset"?: string;
  "retry-after"?: string;
}

/**
 * Adaptive rate limiter that learns from instance responses.
 */
export class AdaptiveRateLimiter {
  /** Per-instance rate limit tracking */
  private instanceLimits: Map<string, InstanceRateLimit> = new Map();

  /** Default limits when we don't have instance-specific info */
  private readonly defaultLimit: number;
  private readonly defaultWindowMs: number;

  constructor(options?: { defaultLimit?: number; defaultWindowMs?: number }) {
    this.defaultLimit = options?.defaultLimit || RATE_LIMIT_MAX;
    this.defaultWindowMs = options?.defaultWindowMs || RATE_LIMIT_WINDOW;
  }

  /**
   * Parse rate limit headers from an HTTP response.
   */
  parseHeaders(domain: string, headers: Headers | RateLimitHeaders): InstanceRateLimit {
    const getHeader = (name: string): string | undefined => {
      if (headers instanceof Headers) {
        return headers.get(name) || undefined;
      }
      return (headers as Record<string, string | undefined>)[name];
    };

    const now = Date.now();
    const existing = this.instanceLimits.get(domain);

    // Parse standard Mastodon rate limit headers
    const limitHeader = getHeader("x-ratelimit-limit");
    const remainingHeader = getHeader("x-ratelimit-remaining");
    const resetHeader = getHeader("x-ratelimit-reset");
    const retryAfterHeader = getHeader("retry-after");

    // Calculate limit values
    let limit = existing?.limit || this.defaultLimit;
    let remaining = existing?.remaining ?? this.defaultLimit;
    let resetAt = existing?.resetAt || now + this.defaultWindowMs;
    let retryAfter: number | undefined;

    if (limitHeader) {
      const parsed = Number.parseInt(limitHeader, 10);
      if (!Number.isNaN(parsed)) {
        limit = parsed;
      }
    }

    if (remainingHeader) {
      const parsed = Number.parseInt(remainingHeader, 10);
      if (!Number.isNaN(parsed)) {
        remaining = parsed;
      }
    }

    if (resetHeader) {
      // Reset can be ISO date or Unix timestamp
      const resetDate = new Date(resetHeader);
      if (!Number.isNaN(resetDate.getTime())) {
        resetAt = resetDate.getTime();
      } else {
        const parsed = Number.parseInt(resetHeader, 10);
        if (!Number.isNaN(parsed)) {
          // Could be seconds since epoch or seconds until reset
          resetAt = parsed > 1e10 ? parsed : now + parsed * 1000;
        }
      }
    }

    if (retryAfterHeader) {
      const parsed = Number.parseInt(retryAfterHeader, 10);
      if (!Number.isNaN(parsed)) {
        retryAfter = parsed * 1000; // Convert to milliseconds
        resetAt = now + retryAfter;
      }
    }

    const isLimited = remaining <= 0 || retryAfter !== undefined;

    const rateLimit: InstanceRateLimit = {
      domain,
      limit,
      remaining,
      resetAt,
      updatedAt: now,
      isLimited,
      retryAfter,
    };

    this.instanceLimits.set(domain, rateLimit);

    if (isLimited) {
      logger.warn("Instance rate limit reached", {
        domain,
        resetAt: new Date(resetAt).toISOString(),
        retryAfter,
      });
    }

    return rateLimit;
  }

  /**
   * Check if a request to an instance is allowed.
   */
  checkLimit(domain: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    waitMs?: number;
  } {
    const normalizedDomain = domain.toLowerCase();
    const now = Date.now();
    const limit = this.instanceLimits.get(normalizedDomain);

    // If no info, allow with default limits
    if (!limit) {
      return {
        allowed: true,
        remaining: this.defaultLimit,
        resetAt: now + this.defaultWindowMs,
      };
    }

    // Check if rate limit window has reset
    if (now >= limit.resetAt) {
      // Reset the limit
      limit.remaining = limit.limit;
      limit.isLimited = false;
      limit.resetAt = now + this.defaultWindowMs;
      limit.retryAfter = undefined;
      return {
        allowed: true,
        remaining: limit.remaining,
        resetAt: limit.resetAt,
      };
    }

    // Check if we're rate limited
    if (limit.isLimited || limit.remaining <= 0) {
      const waitMs = limit.resetAt - now;
      return {
        allowed: false,
        remaining: 0,
        resetAt: limit.resetAt,
        waitMs,
      };
    }

    // Decrement remaining and allow
    limit.remaining--;
    return {
      allowed: true,
      remaining: limit.remaining,
      resetAt: limit.resetAt,
    };
  }

  /**
   * Record a request to an instance (decrements remaining).
   */
  recordRequest(domain: string): void {
    const normalizedDomain = domain.toLowerCase();
    const limit = this.instanceLimits.get(normalizedDomain);

    if (limit && limit.remaining > 0) {
      limit.remaining--;
    }
  }

  /**
   * Handle a rate limit error (429 response).
   */
  handleRateLimitError(domain: string, retryAfterSeconds?: number): void {
    const normalizedDomain = domain.toLowerCase();
    const now = Date.now();
    const retryAfter = retryAfterSeconds ? retryAfterSeconds * 1000 : 60000; // Default 1 minute

    const existing = this.instanceLimits.get(normalizedDomain);

    const rateLimit: InstanceRateLimit = {
      domain: normalizedDomain,
      limit: existing?.limit || this.defaultLimit,
      remaining: 0,
      resetAt: now + retryAfter,
      updatedAt: now,
      isLimited: true,
      retryAfter,
    };

    this.instanceLimits.set(normalizedDomain, rateLimit);

    logger.warn("Rate limit error recorded", {
      domain: normalizedDomain,
      retryAfter,
      resetAt: new Date(rateLimit.resetAt).toISOString(),
    });
  }

  /**
   * Get rate limit info for an instance.
   */
  getInstanceLimit(domain: string): InstanceRateLimit | undefined {
    return this.instanceLimits.get(domain.toLowerCase());
  }

  /**
   * Get rate limit info for all tracked instances.
   */
  getAllLimits(): InstanceRateLimit[] {
    return Array.from(this.instanceLimits.values());
  }

  /**
   * Get instances that are currently rate limited.
   */
  getLimitedInstances(): InstanceRateLimit[] {
    const now = Date.now();
    return Array.from(this.instanceLimits.values()).filter(
      (limit) => limit.isLimited && limit.resetAt > now,
    );
  }

  /**
   * Calculate recommended delay before next request to an instance.
   */
  getRecommendedDelay(domain: string): number {
    const normalizedDomain = domain.toLowerCase();
    const limit = this.instanceLimits.get(normalizedDomain);

    if (!limit) return 0;

    const now = Date.now();

    // If rate limited, return time until reset
    if (limit.isLimited || limit.remaining <= 0) {
      return Math.max(0, limit.resetAt - now);
    }

    // If running low on remaining requests, add some delay
    const remainingPercent = limit.remaining / limit.limit;
    if (remainingPercent < 0.1) {
      // Less than 10% remaining, slow down
      return 1000; // 1 second delay
    }
    if (remainingPercent < 0.25) {
      // Less than 25% remaining
      return 500; // 0.5 second delay
    }

    return 0;
  }

  /**
   * Wait until rate limit allows a request.
   */
  async waitForLimit(domain: string): Promise<void> {
    const check = this.checkLimit(domain);

    if (check.allowed) return;

    if (check.waitMs && check.waitMs > 0) {
      logger.info("Waiting for rate limit reset", {
        domain,
        waitMs: check.waitMs,
        resetAt: new Date(check.resetAt).toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, check.waitMs));
    }
  }

  /**
   * Get statistics about rate limiting.
   */
  getStats(): {
    trackedInstances: number;
    limitedInstances: number;
    instances: Array<{
      domain: string;
      remaining: number;
      limit: number;
      isLimited: boolean;
      resetIn: number;
    }>;
  } {
    const now = Date.now();
    const instances = Array.from(this.instanceLimits.values()).map((limit) => ({
      domain: limit.domain,
      remaining: limit.remaining,
      limit: limit.limit,
      isLimited: limit.isLimited,
      resetIn: Math.max(0, limit.resetAt - now),
    }));

    return {
      trackedInstances: this.instanceLimits.size,
      limitedInstances: instances.filter((i) => i.isLimited).length,
      instances,
    };
  }

  /**
   * Clear rate limit tracking for an instance.
   */
  clearInstance(domain: string): void {
    this.instanceLimits.delete(domain.toLowerCase());
  }

  /**
   * Clear all rate limit tracking.
   */
  clearAll(): void {
    this.instanceLimits.clear();
  }
}

// Export singleton instance
export const adaptiveRateLimiter = new AdaptiveRateLimiter();
