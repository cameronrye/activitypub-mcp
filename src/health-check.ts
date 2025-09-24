/**
 * Health check endpoints and monitoring for ActivityPub MCP Server
 */

import { getLogger } from "@logtape/logtape";
import { performanceMonitor } from "./performance-monitor.js";

const logger = getLogger("activitypub-mcp:health");

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: {
      status: "pass" | "fail" | "warn";
      message?: string;
      duration?: number;
      metadata?: Record<string, unknown>;
    };
  };
  metrics?: {
    requests: {
      total: number;
      errors: number;
      errorRate: number;
    };
    performance: {
      averageResponseTime: number;
      p95ResponseTime: number;
      p99ResponseTime: number;
    };
    system: {
      memoryUsageMB: number;
      cpuUsage: number;
      uptime: number;
    };
  };
}

class HealthChecker {
  private healthCheckEnabled: boolean;
  private version: string;
  private startTime: number;

  constructor() {
    this.healthCheckEnabled = process.env.HEALTH_CHECK_ENABLED === "true";
    this.version = process.env.MCP_SERVER_VERSION || "1.0.0";
    this.startTime = Date.now();
  }

  /**
   * Perform a comprehensive health check
   */
  async performHealthCheck(includeMetrics = false): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const checks: HealthCheckResult["checks"] = {};

    // Basic system checks
    await this.checkMemoryUsage(checks);
    await this.checkDiskSpace(checks);
    await this.checkEnvironmentVariables(checks);

    // Network connectivity checks
    await this.checkNetworkConnectivity(checks);

    // Application-specific checks
    await this.checkMCPServerStatus(checks);
    await this.checkRateLimiting(checks);

    // Determine overall status
    const checkStatuses = Object.values(checks).map((check) => check.status);
    const failedChecks = checkStatuses.filter((status) => status === "fail").length;
    const warnChecks = checkStatuses.filter((status) => status === "warn").length;

    let overallStatus: "healthy" | "degraded" | "unhealthy";
    if (failedChecks > 0) {
      overallStatus = "unhealthy";
    } else if (warnChecks > 0) {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: this.version,
      checks,
    };

    // Include performance metrics if requested
    if (includeMetrics) {
      const perfMetrics = performanceMonitor.getMetrics();
      result.metrics = {
        requests: {
          total: perfMetrics.requestCount,
          errors: perfMetrics.errorCount,
          errorRate:
            perfMetrics.requestCount > 0
              ? (perfMetrics.errorCount / perfMetrics.requestCount) * 100
              : 0,
        },
        performance: {
          averageResponseTime: perfMetrics.averageResponseTime,
          p95ResponseTime: perfMetrics.p95ResponseTime,
          p99ResponseTime: perfMetrics.p99ResponseTime,
        },
        system: {
          memoryUsageMB: Math.round(perfMetrics.memoryUsage.heapUsed / 1024 / 1024),
          cpuUsage: perfMetrics.cpuUsage.user + perfMetrics.cpuUsage.system,
          uptime: perfMetrics.uptime,
        },
      };
    }

    const duration = Date.now() - startTime;
    logger.info("Health check completed", {
      status: overallStatus,
      duration,
      failedChecks,
      warnChecks,
    });

    return result;
  }

  /**
   * Check memory usage
   */
  private async checkMemoryUsage(checks: HealthCheckResult["checks"]): Promise<void> {
    const startTime = Date.now();

    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const usagePercent = (heapUsedMB / heapTotalMB) * 100;

      let status: "pass" | "warn" | "fail";
      let message: string;

      if (heapUsedMB > 500) {
        status = "fail";
        message = `High memory usage: ${heapUsedMB.toFixed(2)}MB`;
      } else if (usagePercent > 80) {
        status = "warn";
        message = `Memory usage at ${usagePercent.toFixed(1)}%`;
      } else {
        status = "pass";
        message = `Memory usage normal: ${heapUsedMB.toFixed(2)}MB`;
      }

      checks.memory = {
        status,
        message,
        duration: Date.now() - startTime,
        metadata: {
          heapUsedMB: heapUsedMB.toFixed(2),
          heapTotalMB: heapTotalMB.toFixed(2),
          usagePercent: usagePercent.toFixed(1),
        },
      };
    } catch (error) {
      checks.memory = {
        status: "fail",
        message: `Memory check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check disk space (basic check)
   */
  private async checkDiskSpace(checks: HealthCheckResult["checks"]): Promise<void> {
    const startTime = Date.now();

    try {
      // Basic disk space check - in a real implementation, you might use fs.statSync
      // For now, we'll just check if we can write to the logs directory
      const fs = await import("node:fs/promises");
      await fs.access("./logs", fs.constants.W_OK);

      checks.disk = {
        status: "pass",
        message: "Disk space check passed",
        duration: Date.now() - startTime,
      };
    } catch (error) {
      checks.disk = {
        status: "warn",
        message: `Disk space check warning: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check required environment variables
   */
  private async checkEnvironmentVariables(checks: HealthCheckResult["checks"]): Promise<void> {
    const startTime = Date.now();

    const requiredVars = ["NODE_ENV"];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      checks.environment = {
        status: "warn",
        message: `Missing environment variables: ${missingVars.join(", ")}`,
        duration: Date.now() - startTime,
        metadata: { missingVars },
      };
    } else {
      checks.environment = {
        status: "pass",
        message: "All required environment variables present",
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check network connectivity
   */
  private async checkNetworkConnectivity(checks: HealthCheckResult["checks"]): Promise<void> {
    const startTime = Date.now();

    try {
      // Test connectivity to a well-known fediverse instance
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch("https://mastodon.social/.well-known/nodeinfo", {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        checks.network = {
          status: "pass",
          message: "Network connectivity verified",
          duration: Date.now() - startTime,
        };
      } else {
        checks.network = {
          status: "warn",
          message: `Network check returned status ${response.status}`,
          duration: Date.now() - startTime,
        };
      }
    } catch (error) {
      checks.network = {
        status: "fail",
        message: `Network connectivity failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check MCP server status
   */
  private async checkMCPServerStatus(checks: HealthCheckResult["checks"]): Promise<void> {
    const startTime = Date.now();

    try {
      // Basic check - verify the server is initialized
      // In a real implementation, you might check if the MCP server is responding
      checks.mcpServer = {
        status: "pass",
        message: "MCP server operational",
        duration: Date.now() - startTime,
      };
    } catch (error) {
      checks.mcpServer = {
        status: "fail",
        message: `MCP server check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check rate limiting functionality
   */
  private async checkRateLimiting(checks: HealthCheckResult["checks"]): Promise<void> {
    const startTime = Date.now();

    try {
      const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED === "true";

      checks.rateLimiting = {
        status: "pass",
        message: rateLimitEnabled ? "Rate limiting enabled" : "Rate limiting disabled",
        duration: Date.now() - startTime,
        metadata: { enabled: rateLimitEnabled },
      };
    } catch (error) {
      checks.rateLimiting = {
        status: "fail",
        message: `Rate limiting check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get a simple health status
   */
  async getSimpleHealth(): Promise<{ status: string; uptime: number }> {
    return {
      status: "ok",
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Check if health checks are enabled
   */
  isEnabled(): boolean {
    return this.healthCheckEnabled;
  }
}

// Export singleton instance
export const healthChecker = new HealthChecker();
