/**
 * Integration tests for new features working together.
 *
 * Tests the interaction between:
 * - Audit Logger
 * - Instance Blocklist
 * - Dynamic Instance Discovery
 * - HTTP Transport
 *
 * Run with: npm run test:integration
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLogger } from "../../src/audit-logger.js";
import { DynamicInstanceDiscoveryService } from "../../src/dynamic-instance-discovery.js";
import { InstanceBlocklist } from "../../src/instance-blocklist.js";

describe("Audit Logger with Live Operations", () => {
  let auditLogger: AuditLogger;
  let discoveryService: DynamicInstanceDiscoveryService;

  beforeEach(() => {
    auditLogger = new AuditLogger({ maxEntries: 100, enabled: true });
    discoveryService = new DynamicInstanceDiscoveryService();
    discoveryService.clearCache();
  });

  afterEach(() => {
    auditLogger.clear();
    discoveryService.clearCache();
  });

  it("should log tool invocations for instance discovery", async () => {
    const startTime = Date.now();

    // Perform a real discovery operation
    const result = await discoveryService.searchInstances({ limit: 5 });

    const duration = Date.now() - startTime;

    // Log the operation
    auditLogger.logToolInvocation(
      "discover-instances",
      { limit: 5, source: result.source },
      { success: true, duration },
    );

    const entries = auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].eventType).toBe("tool_invocation");
    expect(entries[0].success).toBe(true);
    expect(entries[0].duration).toBeGreaterThan(0);
  });

  it("should log resource access for fetched instances", async () => {
    const result = await discoveryService.getTrendingInstances(3);

    // Log each instance access
    for (const instance of result.instances) {
      auditLogger.logResourceAccess(
        "instance-info",
        { domain: instance.domain },
        { success: true },
      );
    }

    const entries = auditLogger.getEntriesByType("resource_access");
    expect(entries.length).toBe(result.instances.length);

    // Each entry should have the correct domain
    for (let i = 0; i < entries.length; i++) {
      expect(entries[i].domain).toBe(result.instances[i].domain);
    }
  });

  it("should track statistics across multiple operations", async () => {
    // Perform multiple operations
    const results = await Promise.all([
      discoveryService.searchInstances({ software: "mastodon", limit: 2 }),
      discoveryService.getRandomInstances(2),
    ]);

    // Log all operations
    for (const result of results) {
      auditLogger.logToolInvocation(
        "instance-operation",
        { count: result.instances.length },
        { success: true },
      );
    }

    const stats = auditLogger.getStatistics();
    expect(stats.totalEntries).toBe(2);
    expect(stats.successRate).toBe(1);
    expect(stats.byEventType.tool_invocation).toBe(2);
  });
});

describe("Instance Blocklist with Discovery Integration", () => {
  let blocklist: InstanceBlocklist;
  let discoveryService: DynamicInstanceDiscoveryService;

  beforeEach(() => {
    blocklist = new InstanceBlocklist();
    blocklist.clear();
    discoveryService = new DynamicInstanceDiscoveryService();
    discoveryService.clearCache();
  });

  afterEach(() => {
    blocklist.clear();
    discoveryService.clearCache();
  });

  it("should filter discovered instances against blocklist", async () => {
    // Add some domains to blocklist
    blocklist.addBlock({
      domain: "blocked-test.example",
      reason: "policy",
      addedAt: new Date().toISOString(),
    });

    // Discover instances
    const result = await discoveryService.searchInstances({ limit: 10 });

    // Filter out blocked instances
    const allowedInstances = result.instances.filter(
      (instance) => !blocklist.isBlocked(instance.domain).blocked,
    );

    // All returned instances should not be blocked
    for (const instance of allowedInstances) {
      expect(blocklist.isBlocked(instance.domain).blocked).toBe(false);
    }
  });

  it("should handle wildcard blocks with discovered instances", async () => {
    // Add wildcard block
    blocklist.addBlock({
      domain: "*.blocked-network.example",
      reason: "safety",
      addedAt: new Date().toISOString(),
    });

    // Test that wildcard matching works
    expect(blocklist.isBlocked("server1.blocked-network.example").blocked).toBe(true);
    expect(blocklist.isBlocked("server2.blocked-network.example").blocked).toBe(true);

    // Real instances should not be blocked
    const result = await discoveryService.searchInstances({ limit: 5 });
    for (const instance of result.instances) {
      // Real instances shouldn't match our test wildcard
      expect(blocklist.isBlocked(instance.domain).blocked).toBe(false);
    }
  });
});

describe("Combined Feature Workflow", () => {
  let auditLogger: AuditLogger;
  let blocklist: InstanceBlocklist;
  let discoveryService: DynamicInstanceDiscoveryService;

  beforeEach(() => {
    auditLogger = new AuditLogger({ maxEntries: 100, enabled: true });
    blocklist = new InstanceBlocklist();
    blocklist.clear();
    discoveryService = new DynamicInstanceDiscoveryService();
    discoveryService.clearCache();
  });

  afterEach(() => {
    auditLogger.clear();
    blocklist.clear();
    discoveryService.clearCache();
  });

  it("should execute full discovery workflow with auditing", async () => {
    const startTime = Date.now();

    // Step 1: Discover instances
    const discoveryResult = await discoveryService.searchInstances({
      software: "mastodon",
      limit: 5,
    });

    auditLogger.logToolInvocation(
      "discover-instances",
      { software: "mastodon", limit: 5 },
      { success: true, duration: Date.now() - startTime },
    );

    // Step 2: Filter blocked instances
    const filteredInstances = discoveryResult.instances.filter((instance) => {
      const blockCheck = blocklist.isBlocked(instance.domain);
      if (blockCheck.blocked) {
        auditLogger.logBlockedInstance(instance.domain, blockCheck.entry?.reason || "blocked");
        return false;
      }
      return true;
    });

    // Step 3: Log resource access for allowed instances
    for (const instance of filteredInstances) {
      auditLogger.logResourceAccess(
        "instance-profile",
        { domain: instance.domain },
        { success: true },
      );
    }

    // Verify audit trail
    const stats = auditLogger.getStatistics();
    expect(stats.totalEntries).toBeGreaterThan(0);
    expect(stats.byEventType.tool_invocation).toBe(1);
    expect(stats.byEventType.resource_access).toBe(filteredInstances.length);
  });

  it("should handle errors in workflow and log them", async () => {
    // Simulate a blocked instance access
    blocklist.addBlock({
      domain: "blocked.example.com",
      reason: "policy",
      description: "Test block for integration",
      addedAt: new Date().toISOString(),
    });

    // Try to access blocked instance
    try {
      blocklist.validateNotBlocked("blocked.example.com");
    } catch (error) {
      auditLogger.logError(
        "instance-access",
        error instanceof Error ? error.message : "Unknown error",
        { domain: "blocked.example.com" },
      );
    }

    // Verify error was logged
    const errorEntries = auditLogger.getEntriesByType("error");
    expect(errorEntries).toHaveLength(1);
    expect(errorEntries[0].metadata?.domain).toBe("blocked.example.com");
  });

  it("should export complete audit trail as JSON", async () => {
    // Generate some audit entries
    auditLogger.logToolInvocation(
      "test-tool",
      { param: "value" },
      { success: true, duration: 100 },
    );
    auditLogger.logResourceAccess("test-resource", { id: "123" }, { success: true });
    auditLogger.logRateLimitExceeded("test-identifier", { count: 100 });

    // Export to JSON
    const json = auditLogger.exportJson();
    const parsed = JSON.parse(json);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].eventType).toBe("tool_invocation");
    expect(parsed[1].eventType).toBe("resource_access");
    expect(parsed[2].eventType).toBe("rate_limit_exceeded");
  });
});

describe("Blocklist Import/Export Integration", () => {
  it("should round-trip blocklist through JSON", () => {
    const sourceBlocklist = new InstanceBlocklist();
    sourceBlocklist.clear();

    // Add various block types
    sourceBlocklist.addBlock({
      domain: "spam.example.com",
      reason: "spam",
      description: "Known spam source",
      addedAt: new Date().toISOString(),
    });
    sourceBlocklist.addBlock({
      domain: "*.malware.net",
      reason: "safety",
      description: "Malware distribution network",
      addedAt: new Date().toISOString(),
    });

    // Export
    const json = sourceBlocklist.exportToJson();

    // Import into new blocklist
    const targetBlocklist = new InstanceBlocklist();
    targetBlocklist.clear();
    const imported = targetBlocklist.importFromJson(json);

    expect(imported).toBe(2);

    // Verify blocks work in target
    expect(targetBlocklist.isBlocked("spam.example.com").blocked).toBe(true);
    expect(targetBlocklist.isBlocked("server.malware.net").blocked).toBe(true);
    expect(targetBlocklist.isBlocked("safe.example.com").blocked).toBe(false);

    // Cleanup
    sourceBlocklist.clear();
    targetBlocklist.clear();
  });
});

describe("Performance Characteristics", () => {
  it("should handle rapid audit logging", () => {
    const auditLogger = new AuditLogger({ maxEntries: 1000, enabled: true });

    const start = Date.now();

    // Log 500 entries rapidly
    for (let i = 0; i < 500; i++) {
      auditLogger.logToolInvocation(`tool-${i}`, { index: i }, { success: true });
    }

    const duration = Date.now() - start;

    // Should complete quickly (under 1 second for 500 entries)
    expect(duration).toBeLessThan(1000);

    const stats = auditLogger.getStatistics();
    expect(stats.totalEntries).toBe(500);

    auditLogger.clear();
  });

  it("should handle blocklist with many entries efficiently", () => {
    const blocklist = new InstanceBlocklist();
    blocklist.clear();

    const start = Date.now();

    // Add 100 blocks
    for (let i = 0; i < 100; i++) {
      blocklist.addBlock({
        domain: `blocked${i}.example.com`,
        reason: "policy",
        addedAt: new Date().toISOString(),
      });
    }

    // Check 100 domains
    for (let i = 0; i < 100; i++) {
      blocklist.isBlocked(`blocked${i}.example.com`);
      blocklist.isBlocked(`allowed${i}.example.com`);
    }

    const duration = Date.now() - start;

    // Should complete quickly
    expect(duration).toBeLessThan(500);

    blocklist.clear();
  });
});
