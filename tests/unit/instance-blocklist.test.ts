import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InstanceBlocklist } from "../../src/instance-blocklist.js";

describe("InstanceBlocklist", () => {
  let blocklist: InstanceBlocklist;

  beforeEach(() => {
    blocklist = new InstanceBlocklist();
    blocklist.clear(); // Clear any config-based blocks
  });

  afterEach(() => {
    blocklist.clear();
  });

  describe("addBlock", () => {
    it("should add an instance to the blocklist", () => {
      blocklist.addBlock({
        domain: "blocked.example.com",
        reason: "policy",
        description: "Test block",
        addedAt: new Date().toISOString(),
      });

      const result = blocklist.isBlocked("blocked.example.com");
      expect(result.blocked).toBe(true);
      expect(result.entry?.reason).toBe("policy");
    });

    it("should normalize domain names", () => {
      blocklist.addBlock({
        domain: "BLOCKED.EXAMPLE.COM",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("blocked.example.com").blocked).toBe(true);
      expect(blocklist.isBlocked("Blocked.Example.Com").blocked).toBe(true);
    });

    it("should support wildcard patterns", () => {
      blocklist.addBlock({
        domain: "*.badnetwork.example",
        reason: "safety",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("server1.badnetwork.example").blocked).toBe(true);
      expect(blocklist.isBlocked("server2.badnetwork.example").blocked).toBe(true);
      expect(blocklist.isBlocked("sub.server.badnetwork.example").blocked).toBe(true);
      expect(blocklist.isBlocked("badnetwork.example").blocked).toBe(true);
      expect(blocklist.isBlocked("goodnetwork.example").blocked).toBe(false);
    });
  });

  describe("removeBlock", () => {
    it("should remove an exact match block", () => {
      blocklist.addBlock({
        domain: "temporary.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("temporary.example.com").blocked).toBe(true);

      const removed = blocklist.removeBlock("temporary.example.com");
      expect(removed).toBe(true);
      expect(blocklist.isBlocked("temporary.example.com").blocked).toBe(false);
    });

    it("should remove a wildcard pattern block", () => {
      blocklist.addBlock({
        domain: "*.temp.example",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("sub.temp.example").blocked).toBe(true);

      const removed = blocklist.removeBlock("*.temp.example");
      expect(removed).toBe(true);
      expect(blocklist.isBlocked("sub.temp.example").blocked).toBe(false);
    });

    it("should return false when removing non-existent block", () => {
      const removed = blocklist.removeBlock("nonexistent.example.com");
      expect(removed).toBe(false);
    });
  });

  describe("isBlocked", () => {
    it("should return false for non-blocked domains", () => {
      const result = blocklist.isBlocked("mastodon.social");
      expect(result.blocked).toBe(false);
      expect(result.entry).toBeUndefined();
    });

    it("should respect expiration dates", () => {
      // Add an already expired block
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
      blocklist.addBlock({
        domain: "expired.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
        expiresAt: pastDate,
      });

      const result = blocklist.isBlocked("expired.example.com");
      expect(result.blocked).toBe(false);
    });

    it("should block non-expired entries", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      blocklist.addBlock({
        domain: "future.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
        expiresAt: futureDate,
      });

      const result = blocklist.isBlocked("future.example.com");
      expect(result.blocked).toBe(true);
    });
  });

  describe("validateNotBlocked", () => {
    it("should not throw for non-blocked domains", () => {
      expect(() => blocklist.validateNotBlocked("allowed.example.com")).not.toThrow();
    });

    it("should throw for blocked domains", () => {
      blocklist.addBlock({
        domain: "blocked.example.com",
        reason: "policy",
        description: "Blocked for testing",
        addedAt: new Date().toISOString(),
      });

      expect(() => blocklist.validateNotBlocked("blocked.example.com")).toThrow(
        /blocked.*Blocked for testing/i,
      );
    });
  });

  describe("getBlockedInstances", () => {
    it("should return all blocked instances", () => {
      blocklist.addBlock({
        domain: "block1.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });
      blocklist.addBlock({
        domain: "block2.example.com",
        reason: "safety",
        addedAt: new Date().toISOString(),
      });
      blocklist.addBlock({
        domain: "*.wildcard.example",
        reason: "spam",
        addedAt: new Date().toISOString(),
      });

      const blocked = blocklist.getBlockedInstances();
      expect(blocked).toHaveLength(3);
    });

    it("should filter out expired entries", () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      blocklist.addBlock({
        domain: "expired.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
        expiresAt: pastDate,
      });
      blocklist.addBlock({
        domain: "valid.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      const blocked = blocklist.getBlockedInstances();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].domain).toBe("valid.example.com");
    });
  });

  describe("getStatistics", () => {
    it("should calculate statistics correctly", () => {
      blocklist.addBlock({
        domain: "policy1.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });
      blocklist.addBlock({
        domain: "policy2.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });
      blocklist.addBlock({
        domain: "safety.example.com",
        reason: "safety",
        addedAt: new Date().toISOString(),
      });
      blocklist.addBlock({
        domain: "*.spam.example",
        reason: "spam",
        addedAt: new Date().toISOString(),
      });

      const stats = blocklist.getStatistics();
      expect(stats.totalBlocked).toBe(4);
      expect(stats.byReason.policy).toBe(2);
      expect(stats.byReason.safety).toBe(1);
      expect(stats.byReason.spam).toBe(1);
      expect(stats.wildcardPatterns).toBe(1);
    });
  });

  describe("import/export", () => {
    it("should export and import blocklist", () => {
      blocklist.addBlock({
        domain: "export1.example.com",
        reason: "policy",
        description: "Test export",
        addedAt: new Date().toISOString(),
      });
      blocklist.addBlock({
        domain: "export2.example.com",
        reason: "safety",
        addedAt: new Date().toISOString(),
      });

      const json = blocklist.exportToJson();
      const newBlocklist = new InstanceBlocklist();
      newBlocklist.clear();

      const imported = newBlocklist.importFromJson(json);
      expect(imported).toBe(2);

      expect(newBlocklist.isBlocked("export1.example.com").blocked).toBe(true);
      expect(newBlocklist.isBlocked("export2.example.com").blocked).toBe(true);
    });
  });

  describe("clear", () => {
    it("should remove all blocks", () => {
      blocklist.addBlock({
        domain: "test1.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });
      blocklist.addBlock({
        domain: "*.wildcard.example",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      blocklist.clear();

      expect(blocklist.getBlockedInstances()).toHaveLength(0);
      expect(blocklist.isBlocked("test1.example.com").blocked).toBe(false);
      expect(blocklist.isBlocked("sub.wildcard.example").blocked).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle domains with special characters", () => {
      blocklist.addBlock({
        domain: "test-instance.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("test-instance.example.com").blocked).toBe(true);
    });

    it("should handle domains with multiple subdomains", () => {
      blocklist.addBlock({
        domain: "sub.sub.sub.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("sub.sub.sub.example.com").blocked).toBe(true);
      expect(blocklist.isBlocked("sub.sub.example.com").blocked).toBe(false);
    });

    it("should handle whitespace in domain names", () => {
      blocklist.addBlock({
        domain: "  spaced.example.com  ",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("spaced.example.com").blocked).toBe(true);
      expect(blocklist.isBlocked("  spaced.example.com  ").blocked).toBe(true);
    });

    it("should handle mixed case in wildcard patterns", () => {
      blocklist.addBlock({
        domain: "*.UPPERCASE.example",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("sub.uppercase.example").blocked).toBe(true);
      expect(blocklist.isBlocked("SUB.UPPERCASE.EXAMPLE").blocked).toBe(true);
    });

    it("should not match partial domain names", () => {
      blocklist.addBlock({
        domain: "blocked.example",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("blocked.example").blocked).toBe(true);
      expect(blocklist.isBlocked("notblocked.example").blocked).toBe(false);
      expect(blocklist.isBlocked("blocked.example.com").blocked).toBe(false);
    });

    it("should handle empty domain gracefully", () => {
      blocklist.addBlock({
        domain: "",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      // Empty domain should be normalized and stored
      expect(blocklist.isBlocked("").blocked).toBe(true);
    });
  });

  describe("all block reasons", () => {
    it("should support all block reason types", () => {
      const reasons: Array<"policy" | "user" | "safety" | "spam" | "federation" | "custom"> = [
        "policy",
        "user",
        "safety",
        "spam",
        "federation",
        "custom",
      ];

      reasons.forEach((reason, index) => {
        blocklist.addBlock({
          domain: `${reason}-test${index}.example.com`,
          reason,
          addedAt: new Date().toISOString(),
        });
      });

      const stats = blocklist.getStatistics();
      expect(stats.byReason.policy).toBe(1);
      expect(stats.byReason.user).toBe(1);
      expect(stats.byReason.safety).toBe(1);
      expect(stats.byReason.spam).toBe(1);
      expect(stats.byReason.federation).toBe(1);
      expect(stats.byReason.custom).toBe(1);
    });
  });

  describe("wildcard pattern edge cases", () => {
    it("should match base domain with wildcard pattern", () => {
      blocklist.addBlock({
        domain: "*.example.net",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      // The wildcard *.example.net should match example.net too
      expect(blocklist.isBlocked("example.net").blocked).toBe(true);
      expect(blocklist.isBlocked("sub.example.net").blocked).toBe(true);
      expect(blocklist.isBlocked("deep.sub.example.net").blocked).toBe(true);
    });

    it("should not match similar but different domains", () => {
      blocklist.addBlock({
        domain: "*.bad.example",
        reason: "policy",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("verybad.example").blocked).toBe(false);
      expect(blocklist.isBlocked("notbad.example").blocked).toBe(false);
    });

    it("should handle multiple wildcard patterns", () => {
      blocklist.addBlock({
        domain: "*.spam.network",
        reason: "spam",
        addedAt: new Date().toISOString(),
      });
      blocklist.addBlock({
        domain: "*.malware.network",
        reason: "safety",
        addedAt: new Date().toISOString(),
      });

      expect(blocklist.isBlocked("server.spam.network").blocked).toBe(true);
      expect(blocklist.isBlocked("server.malware.network").blocked).toBe(true);
      expect(blocklist.isBlocked("server.good.network").blocked).toBe(false);
    });
  });

  describe("expiration edge cases", () => {
    it("should handle wildcard pattern expiration", () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      blocklist.addBlock({
        domain: "*.expired-wildcard.example",
        reason: "policy",
        addedAt: new Date().toISOString(),
        expiresAt: pastDate,
      });

      expect(blocklist.isBlocked("sub.expired-wildcard.example").blocked).toBe(false);
    });

    it("should correctly filter expired entries from getBlockedInstances", () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      blocklist.addBlock({
        domain: "expired1.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
        expiresAt: pastDate,
      });
      blocklist.addBlock({
        domain: "valid1.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
        expiresAt: futureDate,
      });
      blocklist.addBlock({
        domain: "permanent.example.com",
        reason: "policy",
        addedAt: new Date().toISOString(),
        // No expiration
      });

      const blocked = blocklist.getBlockedInstances();
      expect(blocked).toHaveLength(2);
      expect(blocked.some((b) => b.domain === "valid1.example.com")).toBe(true);
      expect(blocked.some((b) => b.domain === "permanent.example.com")).toBe(true);
      expect(blocked.some((b) => b.domain === "expired1.example.com")).toBe(false);
    });
  });

  describe("import edge cases", () => {
    it("should skip entries without required fields", () => {
      const json = JSON.stringify([
        { domain: "valid.example.com", reason: "policy" },
        { domain: "missing-reason.example.com" },
        { reason: "policy" },
      ]);

      const imported = blocklist.importFromJson(json);
      expect(imported).toBe(1); // Only valid.example.com (requires both domain AND reason)
    });

    it("should handle empty JSON array", () => {
      const imported = blocklist.importFromJson("[]");
      expect(imported).toBe(0);
    });

    it("should handle malformed JSON", () => {
      expect(() => blocklist.importFromJson("not valid json")).toThrow();
    });

    it("should preserve all fields during import", () => {
      // Use a future expiration date
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const entry = {
        domain: "full.example.com",
        reason: "custom",
        description: "Test description",
        addedAt: "2024-01-01T00:00:00Z",
        addedBy: "admin",
        expiresAt: futureDate,
      };

      blocklist.importFromJson(JSON.stringify([entry]));

      const blocked = blocklist.getBlockedInstances();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].description).toBe("Test description");
      expect(blocked[0].addedBy).toBe("admin");
      expect(blocked[0].expiresAt).toBe(futureDate);
    });
  });

  describe("validateNotBlocked error messages", () => {
    it("should include description in error when available", () => {
      blocklist.addBlock({
        domain: "with-description.example.com",
        reason: "safety",
        description: "Known malicious instance",
        addedAt: new Date().toISOString(),
      });

      expect(() => blocklist.validateNotBlocked("with-description.example.com")).toThrow(
        /Known malicious instance/,
      );
    });

    it("should fall back to reason when description is missing", () => {
      blocklist.addBlock({
        domain: "without-description.example.com",
        reason: "spam",
        addedAt: new Date().toISOString(),
      });

      expect(() => blocklist.validateNotBlocked("without-description.example.com")).toThrow(/spam/);
    });
  });
});
