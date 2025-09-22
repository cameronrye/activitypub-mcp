# Performance Monitoring Guide

This guide explains the performance monitoring capabilities of the ActivityPub MCP Server.

## Overview

The ActivityPub MCP Server includes comprehensive performance monitoring to help you:

- Track request performance and error rates
- Monitor system resource usage
- Identify performance bottlenecks
- Ensure service health and reliability
- Debug performance issues

## Features

### Performance Metrics Collection

- **Request Tracking**: Monitors all MCP tool operations
- **Response Times**: Tracks average, min, max, and percentile response times
- **Error Rates**: Monitors success/failure rates for all operations
- **System Metrics**: Memory usage, CPU usage, and uptime tracking
- **Operation-Specific Metrics**: Detailed metrics for individual operations

### Health Checks

- **System Health**: Memory usage, disk space, environment variables
- **Network Connectivity**: Tests connection to fediverse instances
- **Application Health**: MCP server status and rate limiting functionality
- **Comprehensive Status**: Overall health assessment with detailed checks

## Configuration

### Environment Variables

Enable performance monitoring with these environment variables:

```bash
# Enable performance monitoring
METRICS_ENABLED=true

# Metrics collection interval (milliseconds)
METRICS_INTERVAL=60000

# Enable health checks
HEALTH_CHECK_ENABLED=true
```

### Production Configuration

For production deployments, add to your `.env` file:

```bash
# Performance Monitoring (Production)
METRICS_ENABLED=true
METRICS_INTERVAL=60000
HEALTH_CHECK_ENABLED=true

# Optional: Metrics export
METRICS_PORT=9090
METRICS_ENDPOINT=/metrics
```

## Using the Monitoring Tools

### Health Check Tool

Check the overall health of your server:

```bash
# Basic health check
health-check

# Health check with detailed metrics
health-check --includeMetrics=true
```

**Example Output:**
```
🏥 Server Health Check

Overall Status: HEALTHY ✅
Uptime: 45 minutes
Version: 1.0.0

Health Checks:
• memory: ✅ Memory usage normal: 125.34MB (2.5s)
• disk: ✅ Disk space check passed (1.2s)
• environment: ✅ All required environment variables present (0.1s)
• network: ✅ Network connectivity verified (234ms)
• mcpServer: ✅ MCP server operational (0.5s)
• rateLimiting: ✅ Rate limiting enabled (0.1s)
```

### Performance Metrics Tool

Get detailed performance metrics:

```bash
# Overall performance metrics
performance-metrics

# Metrics for specific operation
performance-metrics --operation="discover-actor"
```

**Example Output:**
```
📊 Overall Performance Metrics

Request Statistics:
• Total Requests: 1,247
• Errors: 23 (1.84% error rate)

Response Times:
• Average: 1,234.56ms
• Min: 45ms
• Max: 8,901ms
• 95th Percentile: 3,456.78ms
• 99th Percentile: 6,789.01ms

System Resources:
• Memory Usage: 156MB heap used
• Uptime: 67 minutes

Recent Requests (last 10):
• discover-actor: 1,234ms ✅
• fetch-timeline: 2,345ms ✅
• get-instance-info: 567ms ❌
```

## Monitoring in Production

### Health Check Endpoints

The server provides health check capabilities that can be integrated with monitoring systems:

```javascript
// Example: Custom health check integration
import { healthChecker } from './src/health-check.js';

// Simple health check
const simpleHealth = await healthChecker.getSimpleHealth();
console.log(simpleHealth); // { status: "ok", uptime: 12345 }

// Detailed health check
const detailedHealth = await healthChecker.performHealthCheck(true);
console.log(detailedHealth.status); // "healthy" | "degraded" | "unhealthy"
```

### Metrics Integration

#### Prometheus Integration

Export metrics for Prometheus monitoring:

```javascript
// Example: Prometheus metrics export
import { performanceMonitor } from './src/performance-monitor.js';

function exportPrometheusMetrics() {
  const metrics = performanceMonitor.getMetrics();
  
  return `
# HELP activitypub_mcp_requests_total Total number of requests
# TYPE activitypub_mcp_requests_total counter
activitypub_mcp_requests_total ${metrics.requestCount}

# HELP activitypub_mcp_errors_total Total number of errors
# TYPE activitypub_mcp_errors_total counter
activitypub_mcp_errors_total ${metrics.errorCount}

# HELP activitypub_mcp_response_time_seconds Response time in seconds
# TYPE activitypub_mcp_response_time_seconds histogram
activitypub_mcp_response_time_seconds_sum ${metrics.averageResponseTime * metrics.requestCount / 1000}
activitypub_mcp_response_time_seconds_count ${metrics.requestCount}

# HELP activitypub_mcp_memory_usage_bytes Memory usage in bytes
# TYPE activitypub_mcp_memory_usage_bytes gauge
activitypub_mcp_memory_usage_bytes ${metrics.memoryUsage.heapUsed}
`;
}
```

#### Grafana Dashboard

Create dashboards to visualize metrics:

```json
{
  "dashboard": {
    "title": "ActivityPub MCP Server",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(activitypub_mcp_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(activitypub_mcp_errors_total[5m]) / rate(activitypub_mcp_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(activitypub_mcp_response_time_seconds_bucket[5m]))"
          }
        ]
      }
    ]
  }
}
```

## Performance Optimization

### Identifying Bottlenecks

1. **High Response Times**: Check network connectivity and external service performance
2. **High Error Rates**: Review logs for common error patterns
3. **Memory Usage**: Monitor for memory leaks or excessive caching
4. **CPU Usage**: Identify computationally expensive operations

### Optimization Strategies

1. **Caching**: Implement caching for frequently accessed data
2. **Rate Limiting**: Adjust rate limits based on performance metrics
3. **Connection Pooling**: Use connection pooling for external requests
4. **Async Processing**: Use asynchronous processing for heavy operations

### Performance Thresholds

Recommended thresholds for alerts:

- **Response Time**: > 5 seconds (95th percentile)
- **Error Rate**: > 5%
- **Memory Usage**: > 500MB heap
- **CPU Usage**: > 80% sustained

## Troubleshooting

### Common Issues

**High Memory Usage**
```bash
# Check memory metrics
performance-metrics

# Look for memory leaks in logs
grep "memory" logs/activitypub-mcp.log
```

**High Error Rates**
```bash
# Check error patterns
performance-metrics --operation="discover-actor"

# Review recent errors
grep "ERROR" logs/activitypub-mcp.log | tail -20
```

**Slow Response Times**
```bash
# Check network connectivity
health-check

# Monitor response time trends
performance-metrics
```

### Debug Mode

Enable debug mode for detailed performance logging:

```bash
# Enable debug logging
LOG_LEVEL=debug
DEBUG_MODE=true
VERBOSE_LOGGING=true

# Start server
npm run mcp:dev
```

## Best Practices

1. **Regular Monitoring**: Check health and metrics regularly
2. **Set Up Alerts**: Configure alerts for critical thresholds
3. **Trend Analysis**: Monitor trends over time, not just point-in-time metrics
4. **Capacity Planning**: Use metrics to plan for scaling
5. **Performance Testing**: Test performance under load before deploying
6. **Documentation**: Document performance baselines and optimization efforts

## Integration Examples

### Docker Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "
    import('./src/health-check.js').then(({ healthChecker }) => {
      healthChecker.getSimpleHealth().then(health => {
        if (health.status === 'ok') process.exit(0);
        else process.exit(1);
      });
    });
  "
```

### Kubernetes Probes

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: activitypub-mcp
    livenessProbe:
      exec:
        command:
        - node
        - -e
        - "import('./src/health-check.js').then(({healthChecker}) => healthChecker.getSimpleHealth().then(h => h.status === 'ok' ? process.exit(0) : process.exit(1)));"
      initialDelaySeconds: 30
      periodSeconds: 10
```
