/**
 * Configuration constants for the ActivityPub MCP Server
 *
 * All magic numbers and configurable values are centralized here.
 * Values can be overridden via environment variables.
 */

import { homedir } from "node:os";
import { join } from "node:path";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse an integer from environment variable with fallback.
 * Returns the default value if parsing fails or results in NaN.
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse a boolean from environment variable.
 * Returns true if value is "true", false if "false", otherwise returns default.
 */
function parseBoolEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return defaultValue;
}

// =============================================================================
// Server Configuration
// =============================================================================

/** MCP Server name */
export const SERVER_NAME = process.env.MCP_SERVER_NAME || "activitypub-mcp";

/** MCP Server version */
export const SERVER_VERSION = process.env.MCP_SERVER_VERSION || "2.2.0";

/**
 * Directory for the persisted credential store (accounts.json).
 * Precedence: ACTIVITYPUB_CONFIG_DIR → $XDG_CONFIG_HOME/activitypub-mcp → ~/.config/activitypub-mcp.
 */
export const CONFIG_DIR =
  process.env.ACTIVITYPUB_CONFIG_DIR ||
  join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "activitypub-mcp");

/** Log level for the application */
export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// =============================================================================
// HTTP Client Configuration
// =============================================================================

/** User-Agent string for HTTP requests */
export const USER_AGENT = process.env.USER_AGENT || "ActivityPub-MCP-Client/1.0.0";

/** Request timeout in milliseconds (default: 10 seconds) */
export const REQUEST_TIMEOUT = parseIntEnv(process.env.REQUEST_TIMEOUT, 10000);

/** Maximum response size in bytes to prevent DoS attacks (default: 10MB) */
export const MAX_RESPONSE_SIZE = parseIntEnv(process.env.MAX_RESPONSE_SIZE, 10 * 1024 * 1024);

/** Maximum number of retry attempts for failed requests */
export const MAX_RETRIES = parseIntEnv(process.env.MAX_RETRIES, 3);

/** Base delay for retry backoff in milliseconds */
export const RETRY_BASE_DELAY = parseIntEnv(process.env.RETRY_BASE_DELAY, 1000);

/** Maximum delay for retry backoff in milliseconds (default: 30 seconds) */
export const RETRY_MAX_DELAY = parseIntEnv(process.env.RETRY_MAX_DELAY, 30000);

// =============================================================================
// Cache Configuration
// =============================================================================

/** Cache TTL in milliseconds (default: 5 minutes) */
export const CACHE_TTL = parseIntEnv(process.env.CACHE_TTL, 300000);

/** Maximum number of items in LRU caches */
export const CACHE_MAX_SIZE = parseIntEnv(process.env.CACHE_MAX_SIZE, 1000);

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

/** Whether rate limiting is enabled (default: true for production safety) */
export const RATE_LIMIT_ENABLED = parseBoolEnv(process.env.RATE_LIMIT_ENABLED, true);

/** Maximum requests per window */
export const RATE_LIMIT_MAX = parseIntEnv(process.env.RATE_LIMIT_MAX, 100);

/** Rate limit window in milliseconds (default: 15 minutes) */
export const RATE_LIMIT_WINDOW = parseIntEnv(process.env.RATE_LIMIT_WINDOW, 900000);

/** Rate limit cleanup interval in milliseconds (default: 1 minute) */
export const RATE_LIMIT_CLEANUP_INTERVAL = parseIntEnv(
  process.env.RATE_LIMIT_CLEANUP_INTERVAL,
  60000,
);

// =============================================================================
// Pagination & Limits
// =============================================================================

/** Default limit for timeline/collection fetches */
export const DEFAULT_FETCH_LIMIT = 20;

/** Maximum limit for timeline/collection fetches */
export const MAX_FETCH_LIMIT = 100;

/** Minimum limit for timeline/collection fetches */
export const MIN_FETCH_LIMIT = 1;

/** Maximum number of instances to return in discovery results */
export const MAX_INSTANCE_RESULTS = 20;

// =============================================================================
// Health Check Configuration
// =============================================================================

/** Health check network timeout in milliseconds */
export const HEALTH_CHECK_TIMEOUT = parseIntEnv(process.env.HEALTH_CHECK_TIMEOUT, 5000);

/** URL to use for network connectivity health checks */
export const HEALTH_CHECK_URL =
  process.env.HEALTH_CHECK_URL || "https://mastodon.social/.well-known/nodeinfo";

/** Memory usage threshold for health warning (in MB) */
export const MEMORY_WARN_THRESHOLD_MB = parseIntEnv(process.env.MEMORY_WARN_THRESHOLD_MB, 500);

/** Memory usage percentage threshold for health warning */
export const MEMORY_WARN_THRESHOLD_PERCENT = parseIntEnv(
  process.env.MEMORY_WARN_THRESHOLD_PERCENT,
  80,
);

/**
 * Whether to perform the outbound network connectivity probe in health checks.
 * Default: true. Set to false to skip the external probe (useful when the
 * server runs in an air-gapped environment or under strict outbound network
 * policies).
 */
export const HEALTH_CHECK_EXTERNAL_PROBE = parseBoolEnv(
  process.env.HEALTH_CHECK_EXTERNAL_PROBE,
  true,
);

// =============================================================================
// Performance Monitoring Configuration
// =============================================================================

/** Maximum request history entries to keep */
export const MAX_REQUEST_HISTORY = parseIntEnv(process.env.MAX_REQUEST_HISTORY, 1000);

// =============================================================================
// Thread Traversal Configuration (M3)
// =============================================================================

/** Maximum recursion depth when fetching a post thread (default: 5) */
export const THREAD_MAX_DEPTH = parseIntEnv(process.env.MCP_THREAD_MAX_DEPTH, 5);

/** Maximum total replies fetched per thread, across all depths (default: 50) */
export const THREAD_MAX_REPLIES = parseIntEnv(process.env.MCP_THREAD_MAX_REPLIES, 50);

/**
 * Whether to follow replies whose origin differs from the root post.
 * Default: false — replies from other origins are returned as stubs.
 * Set to true to restore v1 unrestricted fan-out behavior.
 */
export const THREAD_CROSS_ORIGIN_FETCH = parseBoolEnv(
  process.env.MCP_THREAD_CROSS_ORIGIN_FETCH,
  false,
);

// =============================================================================
// HTTP Transport Configuration
// =============================================================================

/** Transport mode: 'stdio' or 'http' (default: stdio) */
export const TRANSPORT_MODE = (process.env.MCP_TRANSPORT_MODE || "stdio") as "stdio" | "http";

/** HTTP server port (default: 3000) */
export const HTTP_PORT = parseIntEnv(process.env.MCP_HTTP_PORT, 3000);

/** HTTP server host (default: 127.0.0.1 for security) */
export const HTTP_HOST = process.env.MCP_HTTP_HOST || "127.0.0.1";

/** Enable CORS for HTTP transport (default: false) */
export const HTTP_CORS_ENABLED = parseBoolEnv(process.env.MCP_HTTP_CORS_ENABLED, false);

/**
 * CORS allowed origins (comma-separated). Default: empty (no cross-origin
 * requests allowed). Set explicitly to a list of origins or "*" to enable.
 * Setting "*" logs a startup warning since auth is the only thing keeping
 * arbitrary web pages from talking to the local server.
 */
export const HTTP_CORS_ORIGINS = process.env.MCP_HTTP_CORS_ORIGINS ?? "";

/**
 * Shared secret required as Bearer token for HTTP transport requests.
 * If unset, HTTP transport refuses to start (see http-transport.ts).
 * stdio transport ignores this value.
 */
export const HTTP_SECRET = process.env.MCP_HTTP_SECRET || "";

// =============================================================================
// Write Authorization
// =============================================================================

/**
 * Master switch for mutation tools (post, reply, delete, boost, follow, block,
 * etc.). Default: false. When false, mutation tools are NOT registered at all,
 * so prompt-injected content cannot name a tool that does not exist. Read tools
 * (public and authenticated) are unaffected.
 */
export const ENABLE_WRITES = parseBoolEnv(process.env.ACTIVITYPUB_ENABLE_WRITES, false);

// =============================================================================
// Dynamic Instance Discovery Configuration
// =============================================================================

/** instances.social API token (optional, for higher rate limits) */
export const INSTANCES_SOCIAL_TOKEN = process.env.INSTANCES_SOCIAL_TOKEN || "";

/** Cache TTL for dynamic instance data in milliseconds (default: 1 hour) */
export const DYNAMIC_INSTANCE_CACHE_TTL = parseIntEnv(
  process.env.DYNAMIC_INSTANCE_CACHE_TTL,
  3600000,
);

/** Maximum instances to fetch from external API */
export const MAX_DYNAMIC_INSTANCES = parseIntEnv(process.env.MAX_DYNAMIC_INSTANCES, 100);

// =============================================================================
// Instance Software Detection (NodeInfo) Configuration
// =============================================================================

/**
 * TTL for cached NodeInfo software-detection results, in milliseconds.
 * Default: 24h. Negative-cache TTL (for detection failures) is hardcoded at 1h.
 */
export const INSTANCE_SOFTWARE_TTL = parseIntEnv(
  process.env.MCP_INSTANCE_SOFTWARE_TTL_MS,
  86_400_000,
);

// =============================================================================
// Audit Logging Configuration
// =============================================================================

/** Whether audit logging is enabled (default: true) */
export const AUDIT_LOG_ENABLED = parseBoolEnv(process.env.AUDIT_LOG_ENABLED, true);

/** Maximum audit log entries to keep in memory */
export const AUDIT_LOG_MAX_ENTRIES = parseIntEnv(process.env.AUDIT_LOG_MAX_ENTRIES, 10000);

// =============================================================================
// Instance Blocklist Configuration
// =============================================================================

/**
 * Parse blocked instances from environment variable.
 * Expects comma-separated list of domains.
 */
function parseBlockedInstances(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
}

/** Blocked instances (comma-separated list in env var) */
export const BLOCKED_INSTANCES = parseBlockedInstances(process.env.BLOCKED_INSTANCES);

/** Whether instance blocking is enabled (default: true) */
export const INSTANCE_BLOCKING_ENABLED = parseBoolEnv(process.env.INSTANCE_BLOCKING_ENABLED, true);

// =============================================================================
// Configuration Validation
// =============================================================================

/**
 * Validates configuration on startup and logs warnings for missing recommended settings.
 */
export function validateConfiguration(): void {
  const warnings: string[] = [];

  // Check for recommended environment variables
  if (!process.env.NODE_ENV) {
    warnings.push("NODE_ENV is not set (recommended: 'production' or 'development')");
  }

  // Warn if rate limiting is disabled in production
  if (process.env.NODE_ENV === "production" && !RATE_LIMIT_ENABLED) {
    warnings.push("Rate limiting is disabled in production environment");
  }

  // Log warnings via logtape — never via console.warn, which on stdio
  // transport would land on stderr at startup and mix with the MCP
  // protocol stream.
  if (warnings.length > 0) {
    // Lazy import to avoid pulling logtape into config-only consumers
    // (the build is ESM/tsc, so this stays tree-shakable in dist).
    void import("@logtape/logtape").then(({ getLogger }) => {
      const logger = getLogger("activitypub-mcp:config");
      for (const warning of warnings) {
        logger.warn(warning);
      }
    });
  }
}
