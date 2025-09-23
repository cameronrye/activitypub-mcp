/**
 * Performance monitoring and metrics collection for ActivityPub MCP Server
 */

import { getLogger } from "@logtape/logtape";

const logger = getLogger("activitypub-mcp:performance");

export interface PerformanceMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  lastUpdated: Date;
}

export interface RequestMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private requestHistory: RequestMetrics[] = [];
  private responseTimes: number[] = [];
  private maxHistorySize = 1000;
  private metricsEnabled: boolean;
  private metricsInterval?: NodeJS.Timeout;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.metricsEnabled = process.env.METRICS_ENABLED === "true";

    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: 0,
      lastUpdated: new Date(),
    };

    if (this.metricsEnabled) {
      this.startMetricsCollection();
      logger.info("Performance monitoring enabled");
    }
  }

  /**
   * Start a new request measurement
   */
  startRequest(operation: string, metadata?: Record<string, unknown>): string {
    if (!this.metricsEnabled) return "";

    const requestId = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const request: RequestMetrics = {
      operation,
      startTime: Date.now(),
      success: false,
      metadata,
    };

    this.requestHistory.push(request);

    // Keep history size manageable
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }

    return requestId;
  }

  /**
   * End a request measurement
   */
  endRequest(requestId: string, success: boolean, error?: string): void {
    if (!this.metricsEnabled || !requestId) return;

    const request = this.requestHistory.find(
      (r) => requestId.includes(r.operation) && !r.endTime,
    );

    if (request) {
      request.endTime = Date.now();
      request.duration = request.endTime - request.startTime;
      request.success = success;
      request.error = error;

      this.updateMetrics(request);
    }
  }

  /**
   * Record a completed request
   */
  recordRequest(
    operation: string,
    duration: number,
    success: boolean,
    error?: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.metricsEnabled) return;

    const request: RequestMetrics = {
      operation,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      duration,
      success,
      error,
      metadata,
    };

    this.requestHistory.push(request);
    this.updateMetrics(request);
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(request: RequestMetrics): void {
    if (!request.duration) return;

    this.metrics.requestCount++;
    if (!request.success) {
      this.metrics.errorCount++;
    }

    // Update response times
    this.responseTimes.push(request.duration);
    if (this.responseTimes.length > this.maxHistorySize) {
      this.responseTimes.shift();
    }

    // Calculate response time statistics
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    this.metrics.averageResponseTime =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    this.metrics.minResponseTime = Math.min(...this.responseTimes);
    this.metrics.maxResponseTime = Math.max(...this.responseTimes);

    // Calculate percentiles
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    this.metrics.p95ResponseTime = sortedTimes[p95Index] || 0;
    this.metrics.p99ResponseTime = sortedTimes[p99Index] || 0;

    this.metrics.lastUpdated = new Date();
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    this.updateSystemMetrics();
    return { ...this.metrics };
  }

  /**
   * Get request history for analysis
   */
  getRequestHistory(limit?: number): RequestMetrics[] {
    const history = this.requestHistory.filter((r) => r.endTime);
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Get metrics for a specific operation
   */
  getOperationMetrics(operation: string): {
    count: number;
    successCount: number;
    errorCount: number;
    averageResponseTime: number;
    successRate: number;
  } {
    const operationRequests = this.requestHistory.filter(
      (r) => r.operation === operation && r.endTime,
    );

    if (operationRequests.length === 0) {
      return {
        count: 0,
        successCount: 0,
        errorCount: 0,
        averageResponseTime: 0,
        successRate: 0,
      };
    }

    const successCount = operationRequests.filter((r) => r.success).length;
    const errorCount = operationRequests.length - successCount;
    const averageResponseTime =
      operationRequests.reduce((sum, r) => sum + (r.duration || 0), 0) /
      operationRequests.length;

    return {
      count: operationRequests.length,
      successCount,
      errorCount,
      averageResponseTime,
      successRate: successCount / operationRequests.length,
    };
  }

  /**
   * Update system-level metrics
   */
  private updateSystemMetrics(): void {
    this.metrics.memoryUsage = process.memoryUsage();
    this.metrics.cpuUsage = process.cpuUsage();
    this.metrics.uptime = Date.now() - this.startTime;
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    const interval = Number.parseInt(
      process.env.METRICS_INTERVAL || "60000",
      10,
    );

    this.metricsInterval = setInterval(() => {
      this.updateSystemMetrics();
      this.logMetrics();
    }, interval);
  }

  /**
   * Log current metrics
   */
  private logMetrics(): void {
    const metrics = this.getMetrics();

    logger.info("Performance metrics", {
      requests: {
        total: metrics.requestCount,
        errors: metrics.errorCount,
        errorRate:
          metrics.requestCount > 0
            ? (metrics.errorCount / metrics.requestCount) * 100
            : 0,
      },
      responseTime: {
        average: Math.round(metrics.averageResponseTime),
        min: metrics.minResponseTime,
        max: metrics.maxResponseTime,
        p95: Math.round(metrics.p95ResponseTime),
        p99: Math.round(metrics.p99ResponseTime),
      },
      system: {
        memoryMB: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
        uptimeMinutes: Math.round(metrics.uptime / 1000 / 60),
      },
    });
  }

  /**
   * Get health check status
   */
  getHealthStatus(): {
    status: "healthy" | "degraded" | "unhealthy";
    checks: Record<string, boolean>;
    metrics: PerformanceMetrics;
  } {
    const metrics = this.getMetrics();
    const checks = {
      memoryUsage: metrics.memoryUsage.heapUsed < 500 * 1024 * 1024, // < 500MB
      errorRate:
        metrics.requestCount === 0 ||
        metrics.errorCount / metrics.requestCount < 0.1, // < 10%
      responseTime: metrics.averageResponseTime < 5000, // < 5s
    };

    const healthyChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    let status: "healthy" | "degraded" | "unhealthy";
    if (healthyChecks === totalChecks) {
      status = "healthy";
    } else if (healthyChecks >= totalChecks * 0.5) {
      status = "degraded";
    } else {
      status = "unhealthy";
    }

    return { status, checks, metrics };
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
    logger.info("Performance monitoring stopped");
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
