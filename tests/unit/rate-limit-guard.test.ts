import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { auditLogger } from "../../src/audit/logger.js";
import { checkRateLimit } from "../../src/mcp/rate-limit-guard.js";
import type { RateLimiter } from "../../src/resilience/rate-limiter.js";

const limiter = (allowed: boolean) => ({ checkLimit: () => allowed }) as unknown as RateLimiter;

describe("checkRateLimit", () => {
  it("throws and records a rate-limit-exceeded audit event when the limit is hit", () => {
    const spy = vi.spyOn(auditLogger, "logRateLimitExceeded");
    try {
      expect(() => checkRateLimit(limiter(false), "mastodon.test")).toThrow(McpError);
      expect(spy).toHaveBeenCalledWith("mastodon.test");
    } finally {
      spy.mockRestore();
    }
  });

  it("uses the InternalError code on the thrown McpError", () => {
    try {
      checkRateLimit(limiter(false), "id");
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(ErrorCode.InternalError);
    }
  });

  it("does nothing when the request is within the limit", () => {
    const spy = vi.spyOn(auditLogger, "logRateLimitExceeded");
    try {
      expect(() => checkRateLimit(limiter(true), "mastodon.test")).not.toThrow();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
