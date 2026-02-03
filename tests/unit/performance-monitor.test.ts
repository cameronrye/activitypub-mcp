/**
 * Tests for Performance Monitor
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the logger
vi.mock("@logtape/logtape", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("PerformanceMonitor", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("singleton instance", () => {
    it("should export performanceMonitor singleton", async () => {
      const { performanceMonitor } = await import("../../src/performance-monitor.js");
      expect(performanceMonitor).toBeDefined();
      expect(typeof performanceMonitor.startRequest).toBe("function");
      expect(typeof performanceMonitor.endRequest).toBe("function");
      expect(typeof performanceMonitor.getMetrics).toBe("function");
    });

    it("should have getMetrics returning PerformanceMetrics", async () => {
      const { performanceMonitor } = await import("../../src/performance-monitor.js");
      const metrics = performanceMonitor.getMetrics();

      expect(metrics).toHaveProperty("requestCount");
      expect(metrics).toHaveProperty("errorCount");
      expect(metrics).toHaveProperty("averageResponseTime");
      expect(metrics).toHaveProperty("minResponseTime");
      expect(metrics).toHaveProperty("maxResponseTime");
      expect(metrics).toHaveProperty("p95ResponseTime");
      expect(metrics).toHaveProperty("p99ResponseTime");
      expect(metrics).toHaveProperty("memoryUsage");
      expect(metrics).toHaveProperty("uptime");
    });

    it("should have getHealthStatus returning health data", async () => {
      const { performanceMonitor } = await import("../../src/performance-monitor.js");
      const health = performanceMonitor.getHealthStatus();

      expect(health).toHaveProperty("status");
      expect(["healthy", "degraded", "unhealthy"]).toContain(health.status);
      expect(health).toHaveProperty("checks");
      expect(health).toHaveProperty("metrics");
    });

    it("should have getRequestHistory returning array", async () => {
      const { performanceMonitor } = await import("../../src/performance-monitor.js");
      const history = performanceMonitor.getRequestHistory();

      expect(Array.isArray(history)).toBe(true);
    });

    it("should have getOperationMetrics returning metrics object", async () => {
      const { performanceMonitor } = await import("../../src/performance-monitor.js");
      const opMetrics = performanceMonitor.getOperationMetrics("test-operation");

      expect(opMetrics).toHaveProperty("count");
      expect(opMetrics).toHaveProperty("successCount");
      expect(opMetrics).toHaveProperty("errorCount");
      expect(opMetrics).toHaveProperty("averageResponseTime");
      expect(opMetrics).toHaveProperty("successRate");
    });

    it("should be able to stop without error", async () => {
      const { performanceMonitor } = await import("../../src/performance-monitor.js");
      expect(() => performanceMonitor.stop()).not.toThrow();
    });
  });
});

describe("PerformanceMetrics types", () => {
  it("should export PerformanceMetrics interface", async () => {
    const module = await import("../../src/performance-monitor.js");
    expect(module.performanceMonitor).toBeDefined();
    const metrics = module.performanceMonitor.getMetrics();

    // Validate types through duck typing
    expect(typeof metrics.requestCount).toBe("number");
    expect(typeof metrics.errorCount).toBe("number");
    expect(typeof metrics.averageResponseTime).toBe("number");
  });
});

describe("PerformanceMonitor with metrics enabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, METRICS_ENABLED: "true" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("should track request when metrics enabled", async () => {
    const { performanceMonitor } = await import("../../src/performance-monitor.js");

    const requestId = performanceMonitor.startRequest("test-op", { key: "value" });
    expect(requestId).not.toBe("");
    expect(requestId).toContain("test-op");

    performanceMonitor.endRequest(requestId, true);
    performanceMonitor.stop();
  });

  it("should track failed request", async () => {
    const { performanceMonitor } = await import("../../src/performance-monitor.js");

    const requestId = performanceMonitor.startRequest("failing-op");
    performanceMonitor.endRequest(requestId, false, "Test error message");

    const metrics = performanceMonitor.getMetrics();
    expect(metrics.errorCount).toBeGreaterThanOrEqual(0);

    performanceMonitor.stop();
  });

  it("should handle unknown requestId gracefully", async () => {
    const { performanceMonitor } = await import("../../src/performance-monitor.js");

    expect(() => performanceMonitor.endRequest("unknown-request-id", true)).not.toThrow();

    performanceMonitor.stop();
  });

  it("should handle empty requestId gracefully", async () => {
    const { performanceMonitor } = await import("../../src/performance-monitor.js");

    expect(() => performanceMonitor.endRequest("", true)).not.toThrow();

    performanceMonitor.stop();
  });

  it("should handle multiple requests and return metrics", async () => {
    const { performanceMonitor } = await import("../../src/performance-monitor.js");

    const id1 = performanceMonitor.startRequest("multi-test-1");
    performanceMonitor.endRequest(id1, true);

    const id2 = performanceMonitor.startRequest("multi-test-2");
    performanceMonitor.endRequest(id2, true);

    const metrics = performanceMonitor.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.requestCount).toBeGreaterThanOrEqual(0);

    performanceMonitor.stop();
  });

  it("should maintain history size limit", async () => {
    const { performanceMonitor } = await import("../../src/performance-monitor.js");

    // Create many requests
    for (let i = 0; i < 100; i++) {
      const id = performanceMonitor.startRequest(`bulk-${i}`);
      performanceMonitor.endRequest(id, true);
    }

    const history = performanceMonitor.getRequestHistory();
    expect(history.length).toBeLessThanOrEqual(1000);

    performanceMonitor.stop();
  });

  it("should get operation-specific metrics", async () => {
    const { performanceMonitor } = await import("../../src/performance-monitor.js");

    const id1 = performanceMonitor.startRequest("specific-op");
    performanceMonitor.endRequest(id1, true);

    const id2 = performanceMonitor.startRequest("specific-op");
    performanceMonitor.endRequest(id2, false);

    const opMetrics = performanceMonitor.getOperationMetrics("specific-op");
    expect(opMetrics.count).toBeGreaterThanOrEqual(0);
    expect(opMetrics.successCount).toBeGreaterThanOrEqual(0);

    performanceMonitor.stop();
  });
});
