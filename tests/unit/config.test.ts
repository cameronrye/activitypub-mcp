/**
 * Unit tests for configuration module.
 */

import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Read version from package.json to keep test in sync
const require = createRequire(import.meta.url);
const packageJson = require("../../package.json");

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should use default values when env vars are not set", async () => {
    // Clear relevant env vars (including the test-suite-wide retry overrides
    // from tests/setup.ts so we can assert true defaults).
    delete process.env.MCP_SERVER_NAME;
    delete process.env.MCP_SERVER_VERSION;
    delete process.env.REQUEST_TIMEOUT;
    delete process.env.CACHE_TTL;
    delete process.env.RETRY_BASE_DELAY;
    delete process.env.RETRY_MAX_DELAY;

    const config = await import("../../src/config.js");

    expect(config.SERVER_NAME).toBe("activitypub-mcp");
    expect(config.SERVER_VERSION).toBe(packageJson.version);
    expect(config.REQUEST_TIMEOUT).toBe(10000);
    expect(config.CACHE_TTL).toBe(300000);
    expect(config.MAX_RETRIES).toBe(3);
    expect(config.RETRY_BASE_DELAY).toBe(1000);
    expect(config.CACHE_MAX_SIZE).toBe(1000);
  });

  it("should use custom values from env vars", async () => {
    process.env.MCP_SERVER_NAME = "custom-server";
    process.env.MCP_SERVER_VERSION = "2.0.0";
    process.env.REQUEST_TIMEOUT = "5000";
    process.env.CACHE_TTL = "60000";
    process.env.MAX_RETRIES = "5";

    const config = await import("../../src/config.js");

    expect(config.SERVER_NAME).toBe("custom-server");
    expect(config.SERVER_VERSION).toBe("2.0.0");
    expect(config.REQUEST_TIMEOUT).toBe(5000);
    expect(config.CACHE_TTL).toBe(60000);
    expect(config.MAX_RETRIES).toBe(5);
  });

  it("should handle rate limit configuration", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX = "50";
    process.env.RATE_LIMIT_WINDOW = "60000";

    const config = await import("../../src/config.js");

    expect(config.RATE_LIMIT_ENABLED).toBe(true);
    expect(config.RATE_LIMIT_MAX).toBe(50);
    expect(config.RATE_LIMIT_WINDOW).toBe(60000);
  });

  it("should have correct default pagination limits", async () => {
    const config = await import("../../src/config.js");

    expect(config.DEFAULT_FETCH_LIMIT).toBe(20);
    expect(config.MAX_FETCH_LIMIT).toBe(100);
    expect(config.MIN_FETCH_LIMIT).toBe(1);
    expect(config.MAX_INSTANCE_RESULTS).toBe(20);
  });

  it("should have correct health check defaults", async () => {
    const config = await import("../../src/config.js");

    expect(config.HEALTH_CHECK_TIMEOUT).toBe(5000);
    expect(config.MEMORY_WARN_THRESHOLD_MB).toBe(500);
    expect(config.MEMORY_WARN_THRESHOLD_PERCENT).toBe(80);
  });
});

describe("Thread traversal config (M3)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("MCP_THREAD_MAX_DEPTH defaults to 5", async () => {
    delete process.env.MCP_THREAD_MAX_DEPTH;
    const mod = await import("../../src/config.js");
    expect(mod.THREAD_MAX_DEPTH).toBe(5);
  });

  it("MCP_THREAD_MAX_REPLIES defaults to 50", async () => {
    delete process.env.MCP_THREAD_MAX_REPLIES;
    const mod = await import("../../src/config.js");
    expect(mod.THREAD_MAX_REPLIES).toBe(50);
  });

  it("MCP_THREAD_CROSS_ORIGIN_FETCH defaults to false", async () => {
    delete process.env.MCP_THREAD_CROSS_ORIGIN_FETCH;
    const mod = await import("../../src/config.js");
    expect(mod.THREAD_CROSS_ORIGIN_FETCH).toBe(false);
  });
});

describe("CORS defaults (H1)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("HTTP_CORS_ORIGINS defaults to empty string (no origins)", async () => {
    delete process.env.MCP_HTTP_CORS_ORIGINS;
    const mod = await import("../../src/config.js");
    expect(mod.HTTP_CORS_ORIGINS).toBe("");
  });
});

describe("INSTANCE_SOFTWARE_TTL", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to 24h (86_400_000 ms) when env var is unset", async () => {
    delete process.env.MCP_INSTANCE_SOFTWARE_TTL_MS;
    const mod = await import("../../src/config.js");
    expect(mod.INSTANCE_SOFTWARE_TTL).toBe(86_400_000);
  });
});

describe("HEALTH_CHECK_EXTERNAL_PROBE config (M7)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to true", async () => {
    delete process.env.HEALTH_CHECK_EXTERNAL_PROBE;
    const mod = await import("../../src/config.js");
    expect(mod.HEALTH_CHECK_EXTERNAL_PROBE).toBe(true);
  });

  it("can be disabled via env", async () => {
    process.env.HEALTH_CHECK_EXTERNAL_PROBE = "false";
    const mod = await import("../../src/config.js");
    expect(mod.HEALTH_CHECK_EXTERNAL_PROBE).toBe(false);
  });
});

describe("OAuth onboarding config", () => {
  const orig = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...orig };
  });
  afterEach(() => {
    process.env = orig;
  });

  it("defaults the token store path under the home config dir", async () => {
    delete process.env.MCP_TOKEN_STORE;
    const { TOKEN_STORE_PATH } = await import("../../src/config.js");
    expect(TOKEN_STORE_PATH).toMatch(/activitypub-mcp[/\\]accounts\.json$/);
  });

  it("honors MCP_TOKEN_STORE override and app-name default", async () => {
    process.env.MCP_TOKEN_STORE = "/tmp/custom-accounts.json";
    delete process.env.MCP_OAUTH_APP_NAME;
    const { TOKEN_STORE_PATH, OAUTH_APP_NAME } = await import("../../src/config.js");
    expect(TOKEN_STORE_PATH).toBe("/tmp/custom-accounts.json");
    expect(OAUTH_APP_NAME).toBe("activitypub-mcp");
  });
});
