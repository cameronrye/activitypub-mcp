import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { auditLogger } from "../audit/logger.js";
import type { RateLimiter } from "../resilience/rate-limiter.js";

/**
 * Enforce the per-identifier rate limit for an MCP tool/resource call. Shared by
 * the read tools, write tools, and resources so the limit — and its audit-trail
 * entry — behave identically everywhere. On rejection the event is recorded via
 * `logRateLimitExceeded` before the error is thrown; previously that audit method
 * had no caller, so rate-limit denials were invisible in the trail.
 */
export function checkRateLimit(rateLimiter: RateLimiter, identifier: string): void {
  if (!rateLimiter.checkLimit(identifier)) {
    auditLogger.logRateLimitExceeded(identifier);
    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
  }
}
