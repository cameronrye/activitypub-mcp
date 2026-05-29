/**
 * Rate limiting service for the ActivityPub MCP Server
 * Prevents abuse by limiting request frequency per identifier
 */

import { getLogger } from "@logtape/logtape";
import { RATE_LIMIT_CLEANUP_INTERVAL } from "../config.js";

const logger = getLogger("activitypub-mcp:rate-limiter");

export interface RateLimitConfig {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Rate limiter with automatic cleanup of expired entries
 */
export class RateLimiter {
  private readonly requestCounts = new Map<string, RateLimitEntry>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private readonly config: RateLimitConfig) {
    this.startCleanup();
  }

  /**
   * Check if a request is allowed for the given identifier
   * Returns true if allowed, false if rate limited
   */
  checkLimit(identifier: string): boolean {
    if (!this.config.enabled) {
      return true;
    }

    const now = Date.now();
    const key = identifier || "anonymous";
    const current = this.requestCounts.get(key);

    if (!current || now > current.resetTime) {
      this.requestCounts.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return true;
    }

    if (current.count >= this.config.maxRequests) {
      return false;
    }

    current.count++;
    return true;
  }

  /**
   * Get current rate limit status for an identifier
   */
  getStatus(identifier: string): {
    remaining: number;
    resetTime: number;
    isLimited: boolean;
  } {
    const key = identifier || "anonymous";
    const current = this.requestCounts.get(key);
    const now = Date.now();

    if (!current || now > current.resetTime) {
      return {
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        isLimited: false,
      };
    }

    const remaining = Math.max(0, this.config.maxRequests - current.count);
    return {
      remaining,
      resetTime: current.resetTime,
      isLimited: remaining === 0,
    };
  }

  /**
   * Start periodic cleanup of expired rate limit entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, RATE_LIMIT_CLEANUP_INTERVAL);

    // Don't prevent process exit
    this.cleanupInterval.unref();
  }

  /**
   * Clean up expired rate limit entries to prevent memory leaks
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, value] of this.requestCounts) {
      if (now > value.resetTime) {
        this.requestCounts.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug("Cleaned up expired rate limit entries", { count: cleanedCount });
    }
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Get statistics about rate limiting
   */
  getStats(): {
    trackedIdentifiers: number;
    config: RateLimitConfig;
  } {
    return {
      trackedIdentifiers: this.requestCounts.size,
      config: this.config,
    };
  }
}
