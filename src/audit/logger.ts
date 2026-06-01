/**
 * Audit logging infrastructure for the ActivityPub MCP Server.
 *
 * Provides comprehensive logging of tool invocations, resource access,
 * and security-relevant events for compliance and debugging.
 */

import { getLogger } from "@logtape/logtape";
import { AUDIT_LOG_ENABLED, AUDIT_LOG_MAX_ENTRIES } from "../config.js";

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
   *
   * - Keys whose name suggests a credential are fully redacted.
   * - User-authored content (post body, content warning, alt text) is
   *   reduced to a length-only marker. Audit logs are often shipped to
   *   SIEMs or shared dashboards; v1 stored DM content verbatim.
   * - Other strings >500 chars are truncated for storage hygiene.
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ["password", "token", "secret", "key", "auth", "credential"];
    // User-authored content that should never be stored verbatim. Audit
    // logs must remain useful (we keep length/presence) without leaking
    // post bodies, DM content, or content-warning labels.
    const contentKeys = new Set(["content", "spoilertext", "description", "summary"]);
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        sanitized[key] = "[REDACTED]";
      } else if (contentKeys.has(lowerKey) && typeof value === "string") {
        sanitized[key] = `[content omitted: ${value.length} chars]`;
      } else if (typeof value === "string" && value.length > 500) {
        sanitized[key] = `${value.slice(0, 500)}... [truncated]`;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Redact credential-bearing patterns from an attacker-influenceable string:
   * bearer tokens, credential key=value pairs, and credential values carried in
   * URL query strings. Idempotent, no length cap. The query-string pass is
   * anchored on `?`/`&` so it redacts `?code=AUTHCODE` without touching prose
   * like "error code: 500".
   */
  private redactSecrets(text: string): string {
    return text
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(
        /\b(access_token|refresh_token|client_secret|token|secret|password|authorization|api[-_]?key|session[-_]?id|sid)\b(["':=\s]+)\S+/gi,
        "$1$2[REDACTED]",
      )
      .replace(
        /([?&](?:code|access_token|refresh_token|client_secret|token|api[-_]?key|session_id|sid)=)[^&\s#]+/gi,
        "$1[REDACTED]",
      );
  }

  /**
   * Scrub the `error` field: redact credential patterns and cap length for
   * storage. Error strings are attacker-influenceable — they embed remote (now
   * length-capped) response bodies a hostile instance can fill with bearer-token
   * reflections, log-injection bytes, or second-order prompt-injection text.
   */
  private scrubError(error?: string): string | undefined {
    if (!error) return error;
    const redacted = this.redactSecrets(error);
    return redacted.length > 500 ? `${redacted.slice(0, 500)}... [truncated]` : redacted;
  }

  /** Redact credential patterns from the string values of a params/metadata record. */
  private scrubValues(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = typeof value === "string" ? this.redactSecrets(value) : value;
    }
    return out;
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
      params,
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
        error: entry.error,
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
      params,
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

    logger.warn("Blocked instance access attempt", { domain, reason: entry.error });
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

    logger.warn("SSRF attempt blocked", { url: entry.params?.url, reason: entry.error });
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

    logger.error("Error occurred", { context, error: entry.error, metadata });
  }

  /**
   * Add an entry to the log, managing size limits.
   *
   * This is the single scrubbing chokepoint: every entry, whichever logXxx
   * method built it, has its attacker-influenceable fields redacted here — so no
   * present or future event type can leak by forgetting to scrub at its own site.
   */
  private addEntry(entry: AuditLogEntry): void {
    entry.error = this.scrubError(entry.error);
    if (entry.params) entry.params = this.scrubValues(this.sanitizeParams(entry.params));
    if (entry.metadata) entry.metadata = this.scrubValues(entry.metadata);

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
