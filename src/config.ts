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
 * Coercions/rejections recorded while parsing numeric env vars, surfaced as
 * warnings by validateConfiguration() (logtape isn't safe to import at module
 * load on the stdio transport, so we defer emitting these).
 */
const numericEnvWarnings: string[] = [];

/**
 * Parse an integer from an environment variable with a fallback, validating and
 * clamping the result.
 *
 * Plain `Number.parseInt` is too permissive for security-relevant knobs: it
 * parses the prefix of `"10MB"` as `10` (so MAX_RESPONSE_SIZE='10MB' silently
 * becomes a 10-BYTE cap), and it happily returns 0 or a negative number that can
 * disable the audit trail (AUDIT_LOG_MAX_ENTRIES=0) or abort every request
 * (REQUEST_TIMEOUT=-5). This rejects non-integer strings outright and clamps the
 * result into [min, max], recording a warning for either case.
 *
 * @param name  Env var name (for warning messages)
 * @param value Raw env value
 * @param defaultValue Fallback when unset/invalid
 * @param opts.min Inclusive lower bound (clamped up)
 * @param opts.max Inclusive upper bound (clamped down)
 */
function parseIntEnv(
  name: string,
  value: string | undefined,
  defaultValue: number,
  opts: { min?: number; max?: number } = {},
): number {
  const clamp = (n: number): number => {
    let v = n;
    if (opts.min !== undefined && v < opts.min) {
      numericEnvWarnings.push(
        `${name}=${n} is below the minimum ${opts.min}; clamped to ${opts.min}.`,
      );
      v = opts.min;
    }
    if (opts.max !== undefined && v > opts.max) {
      numericEnvWarnings.push(
        `${name}=${n} is above the maximum ${opts.max}; clamped to ${opts.max}.`,
      );
      v = opts.max;
    }
    return v;
  };

  if (value === undefined || value === null || value.trim() === "") return clamp(defaultValue);
  const trimmed = value.trim();
  // Require the WHOLE string to be an integer — reject "10MB", "5s", "abc",
  // "1.5" so a typo'd suffix can't silently become a misleading prefix value.
  if (!/^[+-]?\d+$/.test(trimmed)) {
    numericEnvWarnings.push(`${name}="${value}" is not an integer; using default ${defaultValue}.`);
    return clamp(defaultValue);
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed)) return clamp(defaultValue);
  return clamp(parsed);
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
export const SERVER_VERSION = process.env.MCP_SERVER_VERSION || "3.1.5";

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
export const USER_AGENT = process.env.USER_AGENT || `ActivityPub-MCP-Client/${SERVER_VERSION}`;

/** Request timeout in milliseconds (default: 10 seconds) */
export const REQUEST_TIMEOUT = parseIntEnv("REQUEST_TIMEOUT", process.env.REQUEST_TIMEOUT, 10000, {
  min: 1,
});

/** Maximum response size in bytes to prevent DoS attacks (default: 10MB) */
export const MAX_RESPONSE_SIZE = parseIntEnv(
  "MAX_RESPONSE_SIZE",
  process.env.MAX_RESPONSE_SIZE,
  10 * 1024 * 1024,
  // Floor at 1: prevents the silent footguns (0/negative reject every body;
  // "10MB" is already rejected as a non-integer and falls back to the default),
  // without overriding a deliberately small operator value.
  { min: 1 },
);

/**
 * Maximum size (bytes) of a local file upload-media will read into memory before
 * sniffing/forwarding it (default: 100MB). Guards against a coerced/oversized
 * path OOM-ing the process; the target instance still enforces its own real
 * media limit. Raise it if your instance accepts larger media.
 */
export const MAX_UPLOAD_SIZE = parseIntEnv(
  "MAX_UPLOAD_SIZE",
  process.env.MAX_UPLOAD_SIZE,
  100 * 1024 * 1024,
  { min: 1 },
);

/** Maximum number of retry attempts for failed requests */
export const MAX_RETRIES = parseIntEnv("MAX_RETRIES", process.env.MAX_RETRIES, 3, { min: 0 });

/** Base delay for retry backoff in milliseconds */
export const RETRY_BASE_DELAY = parseIntEnv(
  "RETRY_BASE_DELAY",
  process.env.RETRY_BASE_DELAY,
  1000,
  {
    min: 0,
  },
);

/** Maximum delay for retry backoff in milliseconds (default: 30 seconds) */
export const RETRY_MAX_DELAY = parseIntEnv("RETRY_MAX_DELAY", process.env.RETRY_MAX_DELAY, 30000, {
  min: 0,
});

// =============================================================================
// Cache Configuration
// =============================================================================

/** Cache TTL in milliseconds (default: 5 minutes) */
export const CACHE_TTL = parseIntEnv("CACHE_TTL", process.env.CACHE_TTL, 300000, { min: 0 });

/** Maximum number of items in LRU caches */
export const CACHE_MAX_SIZE = parseIntEnv("CACHE_MAX_SIZE", process.env.CACHE_MAX_SIZE, 1000, {
  min: 1,
});

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

/** Whether rate limiting is enabled (default: true for production safety) */
export const RATE_LIMIT_ENABLED = parseBoolEnv(process.env.RATE_LIMIT_ENABLED, true);

/** Maximum requests per window */
export const RATE_LIMIT_MAX = parseIntEnv("RATE_LIMIT_MAX", process.env.RATE_LIMIT_MAX, 100, {
  min: 1,
});

/** Rate limit window in milliseconds (default: 15 minutes) */
export const RATE_LIMIT_WINDOW = parseIntEnv(
  "RATE_LIMIT_WINDOW",
  process.env.RATE_LIMIT_WINDOW,
  900000,
  { min: 1 },
);

/** Rate limit cleanup interval in milliseconds (default: 1 minute) */
export const RATE_LIMIT_CLEANUP_INTERVAL = parseIntEnv(
  "RATE_LIMIT_CLEANUP_INTERVAL",
  process.env.RATE_LIMIT_CLEANUP_INTERVAL,
  60000,
  { min: 1 },
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
// Thread Traversal Configuration (M3)
// =============================================================================

/** Maximum recursion depth when fetching a post thread (default: 5) */
export const THREAD_MAX_DEPTH = parseIntEnv(
  "MCP_THREAD_MAX_DEPTH",
  process.env.MCP_THREAD_MAX_DEPTH,
  5,
  {
    min: 0,
  },
);

/** Maximum total replies fetched per thread, across all depths (default: 50) */
export const THREAD_MAX_REPLIES = parseIntEnv(
  "MCP_THREAD_MAX_REPLIES",
  process.env.MCP_THREAD_MAX_REPLIES,
  50,
  { min: 0 },
);

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
export const HTTP_PORT = parseIntEnv("MCP_HTTP_PORT", process.env.MCP_HTTP_PORT, 3000, {
  min: 0,
  max: 65535,
});

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

/**
 * Optional explicit Host allowlist for HTTP DNS-rebinding protection
 * (comma-separated). Empty → auto-derive from host:port.
 * Set MCP_HTTP_ALLOWED_HOSTS to the Host value(s) clients send when binding
 * to a public interface (e.g. 0.0.0.0 or a hostname other than 127.0.0.1).
 */
export const HTTP_ALLOWED_HOSTS = (process.env.MCP_HTTP_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Optional explicit Origin allowlist for HTTP DNS-rebinding protection
 * (comma-separated). Empty → derive from CORS origins.
 */
export const HTTP_ALLOWED_ORIGINS = (process.env.MCP_HTTP_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
  "DYNAMIC_INSTANCE_CACHE_TTL",
  process.env.DYNAMIC_INSTANCE_CACHE_TTL,
  3600000,
  { min: 0 },
);

/** Maximum instances to fetch from external API */
export const MAX_DYNAMIC_INSTANCES = parseIntEnv(
  "MAX_DYNAMIC_INSTANCES",
  process.env.MAX_DYNAMIC_INSTANCES,
  100,
  { min: 1 },
);

// =============================================================================
// Instance Software Detection (NodeInfo) Configuration
// =============================================================================

/**
 * TTL for cached NodeInfo software-detection results, in milliseconds.
 * Default: 24h. Negative-cache TTL (for detection failures) is hardcoded at 1h.
 */
export const INSTANCE_SOFTWARE_TTL = parseIntEnv(
  "MCP_INSTANCE_SOFTWARE_TTL_MS",
  process.env.MCP_INSTANCE_SOFTWARE_TTL_MS,
  86_400_000,
  { min: 0 },
);

// =============================================================================
// Audit Logging Configuration
// =============================================================================

/** Whether audit logging is enabled (default: true) */
export const AUDIT_LOG_ENABLED = parseBoolEnv(process.env.AUDIT_LOG_ENABLED, true);

/**
 * Maximum audit log entries to keep in memory. Floored at 1: a value of 0 made
 * the eviction loop drop every entry on write, silently disabling the audit
 * trail that records prompt-injection-driven write/upload calls.
 */
export const AUDIT_LOG_MAX_ENTRIES = parseIntEnv(
  "AUDIT_LOG_MAX_ENTRIES",
  process.env.AUDIT_LOG_MAX_ENTRIES,
  10000,
  { min: 1 },
);

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
  const warnings: string[] = [...numericEnvWarnings];

  // Check for recommended environment variables
  if (!process.env.NODE_ENV) {
    warnings.push("NODE_ENV is not set (recommended: 'production' or 'development')");
  }

  // Warn if rate limiting is disabled in production
  if (process.env.NODE_ENV === "production" && !RATE_LIMIT_ENABLED) {
    warnings.push("Rate limiting is disabled in production environment");
  }

  // Surface the highest-risk config combinations for the prompt-injection threat
  // model so an operator who enables writes (or exposes them over HTTP) sees it.
  if (ENABLE_WRITES) {
    warnings.push(
      "ACTIVITYPUB_ENABLE_WRITES=true: mutation tools (post, follow, delete, …) are registered. " +
        "Untrusted fediverse content the model reads could attempt to drive them — keep accounts least-privilege.",
    );
    if (TRANSPORT_MODE === "http") {
      warnings.push(
        "Writes are enabled on the HTTP transport — ensure MCP_HTTP_SECRET is strong and the port is not publicly reachable.",
      );
    }
  }

  // Log warnings via logtape — never via console.warn, which on stdio
  // transport would land on stderr at startup and mix with the MCP
  // protocol stream.
  if (warnings.length > 0) {
    // Lazy import to avoid pulling logtape into config-only consumers
    // (the build is ESM/tsc, so this stays tree-shakable in dist).
    void import("@logtape/logtape").then(({ getLogger }) => {
      const logger = getLogger(["activitypub-mcp", "config"]);
      for (const warning of warnings) {
        logger.warn(warning);
      }
    });
  }
}
