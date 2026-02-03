import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLogger } from "../../src/audit-logger.js";

describe("AuditLogger", () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger({ maxEntries: 100, enabled: true });
  });

  afterEach(() => {
    auditLogger.clear();
  });

  describe("logToolInvocation", () => {
    it("should log successful tool invocation", () => {
      auditLogger.logToolInvocation(
        "discover-actor",
        { identifier: "user@mastodon.social" },
        { success: true, duration: 150 },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].eventType).toBe("tool_invocation");
      expect(entries[0].name).toBe("discover-actor");
      expect(entries[0].success).toBe(true);
      expect(entries[0].duration).toBe(150);
      expect(entries[0].domain).toBe("mastodon.social");
      expect(entries[0].actor).toBe("user@mastodon.social");
    });

    it("should log failed tool invocation", () => {
      auditLogger.logToolInvocation(
        "fetch-timeline",
        { identifier: "user@example.com" },
        { success: false, error: "Connection timeout" },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].success).toBe(false);
      expect(entries[0].error).toBe("Connection timeout");
    });

    it("should sanitize sensitive parameters", () => {
      auditLogger.logToolInvocation(
        "test-tool",
        {
          token: "secret-token-123",
          password: "my-password",
          normal_param: "visible",
        },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].params?.token).toBe("[REDACTED]");
      expect(entries[0].params?.password).toBe("[REDACTED]");
      expect(entries[0].params?.normal_param).toBe("visible");
    });

    it("should truncate long parameter values", () => {
      const longValue = "a".repeat(1000);
      auditLogger.logToolInvocation("test-tool", { longParam: longValue }, { success: true });

      const entries = auditLogger.getRecentEntries();
      const param = entries[0].params?.longParam as string;
      expect(param.length).toBeLessThan(600);
      expect(param).toContain("[truncated]");
    });
  });

  describe("logResourceAccess", () => {
    it("should log resource access", () => {
      auditLogger.logResourceAccess(
        "remote-actor",
        { identifier: "test@fosstodon.org" },
        { success: true, duration: 200 },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].eventType).toBe("resource_access");
      expect(entries[0].name).toBe("remote-actor");
    });
  });

  describe("logRateLimitExceeded", () => {
    it("should log rate limit exceeded event", () => {
      auditLogger.logRateLimitExceeded("user@mastodon.social", { requestCount: 100 });

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].eventType).toBe("rate_limit_exceeded");
      expect(entries[0].success).toBe(false);
      expect(entries[0].domain).toBe("mastodon.social");
    });
  });

  describe("logBlockedInstance", () => {
    it("should log blocked instance access attempt", () => {
      auditLogger.logBlockedInstance("blocked.example.com", "Admin policy");

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].eventType).toBe("blocked_instance");
      expect(entries[0].domain).toBe("blocked.example.com");
      expect(entries[0].error).toBe("Admin policy");
    });
  });

  describe("logSsrfBlocked", () => {
    it("should log SSRF blocked event", () => {
      auditLogger.logSsrfBlocked("http://localhost:8080/secret", "Private IP blocked");

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].eventType).toBe("ssrf_blocked");
      expect(entries[0].domain).toBe("localhost");
    });

    it("should handle invalid URLs gracefully", () => {
      auditLogger.logSsrfBlocked("not-a-valid-url", "Invalid URL");

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].domain).toBeUndefined();
    });
  });

  describe("entry management", () => {
    it("should respect maxEntries limit", () => {
      const smallLogger = new AuditLogger({ maxEntries: 5, enabled: true });

      for (let i = 0; i < 10; i++) {
        smallLogger.logToolInvocation(`tool-${i}`, {}, { success: true });
      }

      const entries = smallLogger.getRecentEntries();
      expect(entries).toHaveLength(5);
      expect(entries[0].name).toBe("tool-5");
      expect(entries[4].name).toBe("tool-9");
    });

    it("should filter entries by type", () => {
      auditLogger.logToolInvocation("tool1", {}, { success: true });
      auditLogger.logResourceAccess("resource1", {}, { success: true });
      auditLogger.logToolInvocation("tool2", {}, { success: true });

      const toolEntries = auditLogger.getEntriesByType("tool_invocation");
      expect(toolEntries).toHaveLength(2);

      const resourceEntries = auditLogger.getEntriesByType("resource_access");
      expect(resourceEntries).toHaveLength(1);
    });

    it("should filter entries by domain", () => {
      auditLogger.logToolInvocation(
        "tool1",
        { identifier: "user1@mastodon.social" },
        { success: true },
      );
      auditLogger.logToolInvocation(
        "tool2",
        { identifier: "user2@fosstodon.org" },
        { success: true },
      );
      auditLogger.logToolInvocation(
        "tool3",
        { identifier: "user3@mastodon.social" },
        { success: true },
      );

      const mastodonEntries = auditLogger.getEntriesByDomain("mastodon.social");
      expect(mastodonEntries).toHaveLength(2);
    });
  });

  describe("getStatistics", () => {
    it("should calculate statistics correctly", () => {
      auditLogger.logToolInvocation("tool1", {}, { success: true });
      auditLogger.logToolInvocation("tool2", {}, { success: true });
      auditLogger.logToolInvocation("tool3", {}, { success: false, error: "Failed" });
      auditLogger.logResourceAccess("resource1", {}, { success: true });

      const stats = auditLogger.getStatistics();
      expect(stats.totalEntries).toBe(4);
      expect(stats.byEventType.tool_invocation).toBe(3);
      expect(stats.byEventType.resource_access).toBe(1);
      expect(stats.successRate).toBe(0.75);
    });
  });

  describe("disabled logger", () => {
    it("should not log when disabled", () => {
      const disabledLogger = new AuditLogger({ enabled: false });

      disabledLogger.logToolInvocation("tool1", {}, { success: true });
      disabledLogger.logResourceAccess("resource1", {}, { success: true });

      const entries = disabledLogger.getRecentEntries();
      expect(entries).toHaveLength(0);
    });
  });

  describe("exportJson", () => {
    it("should export entries as JSON", () => {
      auditLogger.logToolInvocation("tool1", { param: "value" }, { success: true });

      const json = auditLogger.exportJson();
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe("tool1");
    });
  });

  describe("logError", () => {
    it("should log error events with context", () => {
      auditLogger.logError("connection_handler", "Connection refused", {
        host: "example.com",
        port: 443,
      });

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].eventType).toBe("error");
      expect(entries[0].name).toBe("connection_handler");
      expect(entries[0].error).toBe("Connection refused");
      expect(entries[0].success).toBe(false);
      expect(entries[0].metadata?.host).toBe("example.com");
    });

    it("should log error events without metadata", () => {
      auditLogger.logError("parser", "Invalid JSON input");

      const entries = auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].metadata).toBeUndefined();
    });
  });

  describe("domain extraction", () => {
    it("should extract domain from postUrl parameter", () => {
      auditLogger.logToolInvocation(
        "fetch-post",
        { postUrl: "https://mastodon.social/users/test/statuses/123" },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].domain).toBe("mastodon.social");
    });

    it("should handle invalid postUrl gracefully", () => {
      auditLogger.logToolInvocation(
        "fetch-post",
        { postUrl: "not-a-valid-url" },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].domain).toBeUndefined();
    });

    it("should extract domain from identifier with leading @", () => {
      auditLogger.logToolInvocation(
        "discover-actor",
        { identifier: "@user@fosstodon.org" },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].domain).toBe("fosstodon.org");
      expect(entries[0].actor).toBe("@user@fosstodon.org");
    });

    it("should return undefined for identifier without domain", () => {
      auditLogger.logToolInvocation(
        "discover-actor",
        { identifier: "localuser" },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].domain).toBeUndefined();
    });

    it("should prefer domain parameter over identifier", () => {
      auditLogger.logToolInvocation(
        "get-instance",
        { domain: "explicit.social", identifier: "user@implicit.social" },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].domain).toBe("explicit.social");
    });
  });

  describe("sanitization edge cases", () => {
    it("should sanitize nested sensitive keys", () => {
      auditLogger.logToolInvocation(
        "test-tool",
        {
          apiToken: "secret123",
          authCredential: "password456",
          secretKey: "key789",
        },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].params?.apiToken).toBe("[REDACTED]");
      expect(entries[0].params?.authCredential).toBe("[REDACTED]");
      expect(entries[0].params?.secretKey).toBe("[REDACTED]");
    });

    it("should handle non-string values correctly", () => {
      auditLogger.logToolInvocation(
        "test-tool",
        {
          count: 42,
          enabled: true,
          items: ["a", "b", "c"],
          nested: { key: "value" },
        },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].params?.count).toBe(42);
      expect(entries[0].params?.enabled).toBe(true);
      expect(entries[0].params?.items).toEqual(["a", "b", "c"]);
      expect(entries[0].params?.nested).toEqual({ key: "value" });
    });

    it("should truncate exactly at 500 characters plus suffix", () => {
      const exactlyLongValue = "x".repeat(501);
      auditLogger.logToolInvocation(
        "test-tool",
        { longParam: exactlyLongValue },
        { success: true },
      );

      const entries = auditLogger.getRecentEntries();
      const param = entries[0].params?.longParam as string;
      expect(param).toContain("[truncated]");
      expect(param.length).toBeLessThanOrEqual(520); // 500 + "... [truncated]"
    });

    it("should not truncate values at exactly 500 characters", () => {
      const exactly500 = "y".repeat(500);
      auditLogger.logToolInvocation("test-tool", { param: exactly500 }, { success: true });

      const entries = auditLogger.getRecentEntries();
      const param = entries[0].params?.param as string;
      expect(param).toBe(exactly500);
      expect(param).not.toContain("[truncated]");
    });
  });

  describe("event ID generation", () => {
    it("should generate unique event IDs", () => {
      auditLogger.logToolInvocation("tool1", {}, { success: true });
      auditLogger.logToolInvocation("tool2", {}, { success: true });
      auditLogger.logToolInvocation("tool3", {}, { success: true });

      const entries = auditLogger.getRecentEntries();
      const ids = entries.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it("should include timestamp prefix in event ID", () => {
      auditLogger.logToolInvocation("tool1", {}, { success: true });

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].id).toMatch(/^evt_\d+_\d+$/);
    });
  });

  describe("timestamp handling", () => {
    it("should record valid ISO timestamps", () => {
      auditLogger.logToolInvocation("tool1", {}, { success: true });

      const entries = auditLogger.getRecentEntries();
      const timestamp = new Date(entries[0].timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
      expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("getRecentEntries with limit", () => {
    it("should respect the limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        auditLogger.logToolInvocation(`tool-${i}`, {}, { success: true });
      }

      const entries = auditLogger.getRecentEntries(3);
      expect(entries).toHaveLength(3);
      expect(entries[0].name).toBe("tool-7");
      expect(entries[2].name).toBe("tool-9");
    });

    it("should return all entries if limit exceeds count", () => {
      auditLogger.logToolInvocation("tool1", {}, { success: true });
      auditLogger.logToolInvocation("tool2", {}, { success: true });

      const entries = auditLogger.getRecentEntries(100);
      expect(entries).toHaveLength(2);
    });
  });

  describe("recent errors in statistics", () => {
    it("should count recent errors within the last hour", () => {
      // Log some errors
      auditLogger.logToolInvocation("tool1", {}, { success: false, error: "Error 1" });
      auditLogger.logToolInvocation("tool2", {}, { success: false, error: "Error 2" });
      auditLogger.logToolInvocation("tool3", {}, { success: true });

      const stats = auditLogger.getStatistics();
      expect(stats.recentErrors).toBe(2);
    });
  });

  describe("rate limit metadata", () => {
    it("should include metadata in rate limit events", () => {
      auditLogger.logRateLimitExceeded("user@instance.social", {
        requestCount: 150,
        windowMs: 900000,
        ip: "192.168.1.1",
      });

      const entries = auditLogger.getRecentEntries();
      expect(entries[0].metadata?.requestCount).toBe(150);
      expect(entries[0].metadata?.windowMs).toBe(900000);
      expect(entries[0].metadata?.ip).toBe("192.168.1.1");
    });
  });
});
