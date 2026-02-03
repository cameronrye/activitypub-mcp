/**
 * Audit logging infrastructure for the ActivityPub MCP Server.
 *
 * Provides comprehensive logging of tool invocations, resource access,
 * and security-relevant events for compliance and debugging.
 */

import { getLogger } from "@logtape/logtape";
import { AUDIT_LOG_ENABLED, AUDIT_LOG_MAX_ENTRIES } from "./config.js";

const logger = getLogger("activitypub-mcp:audit");

/**
 * Types of auditable events.
 */
export type AuditEventType =
  | "tool_invocation"
  | "resource_access"
  | "rate_limit_exceeded"
  | "blocked_instance"
  | "ssrf_blocked"
  | "auth_attempt"
  | "error";

/**
 * Audit log entry structure.
 */
export interface AuditLogEntry {
  /** Unique event ID */
  id: string;
  /** Event timestamp */
  timestamp: string;
  /** Type of event */
  eventType: AuditEventType;
  /** Tool or resource name */
  name: string;
  /** Input parameters (sanitized) */
  params?: Record<string, unknown>;
  /** Whether the operation succeeded */
  success: boolean;
  /** Duration in milliseconds */
  duration?: number;
  /** Error message if failed */
  error?: string;
  /** Domain/instance involved */
  domain?: string;
  /** Actor identifier involved */
  actor?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Audit logger class for tracking all operations.
 */
export class AuditLogger {
  private readonly entries: AuditLogEntry[] = [];
  private readonly maxEntries: number;
  private readonly enabled: boolean;
  private eventCounter = 0;

  constructor(options?: { maxEntries?: number; enabled?: boolean }) {
    this.maxEntries = options?.maxEntries ?? AUDIT_LOG_MAX_ENTRIES;
    this.enabled = options?.enabled ?? AUDIT_LOG_ENABLED;
  }

  /**
   * Generate a unique event ID.
   */
  private generateEventId(): string {
    this.eventCounter++;
    return `evt_${Date.now()}_${this.eventCounter}`;
  }

  /**
   * Sanitize parameters to remove sensitive data.
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ["password", "token", "secret", "key", "auth", "credential"];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string" && value.length > 500) {
        sanitized[key] = `${value.slice(0, 500)}... [truncated]`;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log a tool invocation.
   */
  logToolInvocation(
    toolName: string,
    params: Record<string, unknown>,
    result: { success: boolean; duration?: number; error?: string },
  ): void {
    if (!this.enabled) return;

    const entry: AuditLogEntry = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType: "tool_invocation",
      name: toolName,
      params: this.sanitizeParams(params),
      success: result.success,
      duration: result.duration,
      error: result.error,
      domain: this.extractDomain(params),
      actor: this.extractActor(params),
    };

    this.addEntry(entry);

    if (result.success) {
      logger.info("Tool invocation", {
        tool: toolName,
        duration: result.duration,
        domain: entry.domain,
      });
    } else {
      logger.warn("Tool invocation failed", {
        tool: toolName,
        error: result.error,
        domain: entry.domain,
      });
    }
  }

  /**
   * Log a resource access.
   */
  logResourceAccess(
    resourceName: string,
    params: Record<string, unknown>,
    result: { success: boolean; duration?: number; error?: string },
  ): void {
    if (!this.enabled) return;

    const entry: AuditLogEntry = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType: "resource_access",
      name: resourceName,
      params: this.sanitizeParams(params),
      success: result.success,
      duration: result.duration,
      error: result.error,
      domain: this.extractDomain(params),
      actor: this.extractActor(params),
    };

    this.addEntry(entry);

    logger.debug("Resource access", {
      resource: resourceName,
      success: result.success,
      domain: entry.domain,
    });
  }

  /**
   * Log a rate limit exceeded event.
   */
  logRateLimitExceeded(identifier: string, metadata?: Record<string, unknown>): void {
    if (!this.enabled) return;

    const entry: AuditLogEntry = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType: "rate_limit_exceeded",
      name: "rate_limit",
      params: { identifier },
      success: false,
      domain: this.extractDomainFromIdentifier(identifier),
      metadata,
    };

    this.addEntry(entry);

    logger.warn("Rate limit exceeded", { identifier, metadata });
  }

  /**
   * Log a blocked instance access attempt.
   */
  logBlockedInstance(domain: string, reason: string): void {
    if (!this.enabled) return;

    const entry: AuditLogEntry = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType: "blocked_instance",
      name: "instance_block",
      params: { domain, reason },
      success: false,
      error: reason,
      domain,
    };

    this.addEntry(entry);

    logger.warn("Blocked instance access attempt", { domain, reason });
  }

  /**
   * Log an SSRF blocked event.
   */
  logSsrfBlocked(url: string, reason: string): void {
    if (!this.enabled) return;

    let domain: string | undefined;
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = undefined;
    }

    const entry: AuditLogEntry = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType: "ssrf_blocked",
      name: "ssrf_protection",
      params: { url: url.slice(0, 200) }, // Truncate URL for safety
      success: false,
      error: reason,
      domain,
    };

    this.addEntry(entry);

    logger.warn("SSRF attempt blocked", { url: url.slice(0, 200), reason });
  }

  /**
   * Log an error event.
   */
  logError(context: string, error: string, metadata?: Record<string, unknown>): void {
    if (!this.enabled) return;

    const entry: AuditLogEntry = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType: "error",
      name: context,
      success: false,
      error,
      metadata,
    };

    this.addEntry(entry);

    logger.error("Error occurred", { context, error, metadata });
  }

  /**
   * Add an entry to the log, managing size limits.
   */
  private addEntry(entry: AuditLogEntry): void {
    this.entries.push(entry);

    // Trim to max size
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /**
   * Extract domain from params.
   */
  private extractDomain(params: Record<string, unknown>): string | undefined {
    if (typeof params.domain === "string") {
      return params.domain;
    }
    if (typeof params.identifier === "string") {
      return this.extractDomainFromIdentifier(params.identifier);
    }
    if (typeof params.postUrl === "string") {
      try {
        return new URL(params.postUrl).hostname;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Extract actor from params.
   */
  private extractActor(params: Record<string, unknown>): string | undefined {
    if (typeof params.identifier === "string") {
      return params.identifier;
    }
    return undefined;
  }

  /**
   * Extract domain from an identifier (user@domain).
   */
  private extractDomainFromIdentifier(identifier: string): string | undefined {
    const parts = identifier.split("@").filter(Boolean);
    if (parts.length >= 2) {
      return parts[parts.length - 1];
    }
    return undefined;
  }

  /**
   * Get recent audit log entries.
   */
  getRecentEntries(limit = 100): AuditLogEntry[] {
    return this.entries.slice(-limit);
  }

  /**
   * Get entries filtered by type.
   */
  getEntriesByType(eventType: AuditEventType, limit = 100): AuditLogEntry[] {
    return this.entries.filter((e) => e.eventType === eventType).slice(-limit);
  }

  /**
   * Get entries filtered by domain.
   */
  getEntriesByDomain(domain: string, limit = 100): AuditLogEntry[] {
    return this.entries.filter((e) => e.domain === domain).slice(-limit);
  }

  /**
   * Get audit statistics.
   */
  getStatistics(): {
    totalEntries: number;
    byEventType: Record<AuditEventType, number>;
    successRate: number;
    recentErrors: number;
  } {
    const byEventType: Record<AuditEventType, number> = {
      tool_invocation: 0,
      resource_access: 0,
      rate_limit_exceeded: 0,
      blocked_instance: 0,
      ssrf_blocked: 0,
      auth_attempt: 0,
      error: 0,
    };

    let successCount = 0;
    let recentErrors = 0;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const entry of this.entries) {
      byEventType[entry.eventType]++;
      if (entry.success) {
        successCount++;
      }
      if (!entry.success && new Date(entry.timestamp).getTime() > oneHourAgo) {
        recentErrors++;
      }
    }

    return {
      totalEntries: this.entries.length,
      byEventType,
      successRate: this.entries.length > 0 ? successCount / this.entries.length : 1,
      recentErrors,
    };
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.length = 0;
  }

  /**
   * Export entries as JSON.
   */
  exportJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
