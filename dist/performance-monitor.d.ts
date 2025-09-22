/**
 * Performance monitoring and metrics collection for ActivityPub MCP Server
 */
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
declare class PerformanceMonitor {
    private metrics;
    private requestHistory;
    private responseTimes;
    private maxHistorySize;
    private metricsEnabled;
    private metricsInterval?;
    private startTime;
    constructor();
    /**
     * Start a new request measurement
     */
    startRequest(operation: string, metadata?: Record<string, unknown>): string;
    /**
     * End a request measurement
     */
    endRequest(requestId: string, success: boolean, error?: string): void;
    /**
     * Record a completed request
     */
    recordRequest(operation: string, duration: number, success: boolean, error?: string, metadata?: Record<string, unknown>): void;
    /**
     * Update performance metrics
     */
    private updateMetrics;
    /**
     * Get current performance metrics
     */
    getMetrics(): PerformanceMetrics;
    /**
     * Get request history for analysis
     */
    getRequestHistory(limit?: number): RequestMetrics[];
    /**
     * Get metrics for a specific operation
     */
    getOperationMetrics(operation: string): {
        count: number;
        successCount: number;
        errorCount: number;
        averageResponseTime: number;
        successRate: number;
    };
    /**
     * Update system-level metrics
     */
    private updateSystemMetrics;
    /**
     * Start periodic metrics collection
     */
    private startMetricsCollection;
    /**
     * Log current metrics
     */
    private logMetrics;
    /**
     * Get health check status
     */
    getHealthStatus(): {
        status: "healthy" | "degraded" | "unhealthy";
        checks: Record<string, boolean>;
        metrics: PerformanceMetrics;
    };
    /**
     * Stop metrics collection
     */
    stop(): void;
}
export declare const performanceMonitor: PerformanceMonitor;
export {};
//# sourceMappingURL=performance-monitor.d.ts.map