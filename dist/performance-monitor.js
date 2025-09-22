/**
 * Performance monitoring and metrics collection for ActivityPub MCP Server
 */
import { getLogger } from "@logtape/logtape";
const logger = getLogger("activitypub-mcp-server:performance");
class PerformanceMonitor {
    metrics;
    requestHistory = [];
    responseTimes = [];
    maxHistorySize = 1000;
    metricsEnabled;
    metricsInterval;
    startTime;
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
    startRequest(operation, metadata) {
        if (!this.metricsEnabled)
            return "";
        const requestId = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const request = {
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
    endRequest(requestId, success, error) {
        if (!this.metricsEnabled || !requestId)
            return;
        const request = this.requestHistory.find((r) => requestId.includes(r.operation) && !r.endTime);
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
    recordRequest(operation, duration, success, error, metadata) {
        if (!this.metricsEnabled)
            return;
        const request = {
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
    updateMetrics(request) {
        if (!request.duration)
            return;
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
    getMetrics() {
        this.updateSystemMetrics();
        return { ...this.metrics };
    }
    /**
     * Get request history for analysis
     */
    getRequestHistory(limit) {
        const history = this.requestHistory.filter((r) => r.endTime);
        return limit ? history.slice(-limit) : history;
    }
    /**
     * Get metrics for a specific operation
     */
    getOperationMetrics(operation) {
        const operationRequests = this.requestHistory.filter((r) => r.operation === operation && r.endTime);
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
        const averageResponseTime = operationRequests.reduce((sum, r) => sum + (r.duration || 0), 0) /
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
    updateSystemMetrics() {
        this.metrics.memoryUsage = process.memoryUsage();
        this.metrics.cpuUsage = process.cpuUsage();
        this.metrics.uptime = Date.now() - this.startTime;
    }
    /**
     * Start periodic metrics collection
     */
    startMetricsCollection() {
        const interval = Number.parseInt(process.env.METRICS_INTERVAL || "60000", 10);
        this.metricsInterval = setInterval(() => {
            this.updateSystemMetrics();
            this.logMetrics();
        }, interval);
    }
    /**
     * Log current metrics
     */
    logMetrics() {
        const metrics = this.getMetrics();
        logger.info("Performance metrics", {
            requests: {
                total: metrics.requestCount,
                errors: metrics.errorCount,
                errorRate: metrics.requestCount > 0
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
    getHealthStatus() {
        const metrics = this.getMetrics();
        const checks = {
            memoryUsage: metrics.memoryUsage.heapUsed < 500 * 1024 * 1024, // < 500MB
            errorRate: metrics.requestCount === 0 ||
                metrics.errorCount / metrics.requestCount < 0.1, // < 10%
            responseTime: metrics.averageResponseTime < 5000, // < 5s
        };
        const healthyChecks = Object.values(checks).filter(Boolean).length;
        const totalChecks = Object.keys(checks).length;
        let status;
        if (healthyChecks === totalChecks) {
            status = "healthy";
        }
        else if (healthyChecks >= totalChecks * 0.5) {
            status = "degraded";
        }
        else {
            status = "unhealthy";
        }
        return { status, checks, metrics };
    }
    /**
     * Stop metrics collection
     */
    stop() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = undefined;
        }
        logger.info("Performance monitoring stopped");
    }
}
// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
//# sourceMappingURL=performance-monitor.js.map