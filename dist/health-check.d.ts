/**
 * Health check endpoints and monitoring for ActivityPub MCP Server
 */
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
declare class HealthChecker {
    private healthCheckEnabled;
    private version;
    private startTime;
    constructor();
    /**
     * Perform a comprehensive health check
     */
    performHealthCheck(includeMetrics?: boolean): Promise<HealthCheckResult>;
    /**
     * Check memory usage
     */
    private checkMemoryUsage;
    /**
     * Check disk space (basic check)
     */
    private checkDiskSpace;
    /**
     * Check required environment variables
     */
    private checkEnvironmentVariables;
    /**
     * Check network connectivity
     */
    private checkNetworkConnectivity;
    /**
     * Check MCP server status
     */
    private checkMCPServerStatus;
    /**
     * Check rate limiting functionality
     */
    private checkRateLimiting;
    /**
     * Get a simple health status
     */
    getSimpleHealth(): Promise<{
        status: string;
        uptime: number;
    }>;
    /**
     * Check if health checks are enabled
     */
    isEnabled(): boolean;
}
export declare const healthChecker: HealthChecker;
export {};
//# sourceMappingURL=health-check.d.ts.map