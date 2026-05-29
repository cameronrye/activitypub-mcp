/**
 * Vitest test setup file.
 *
 * This file runs before all tests and sets up the test environment.
 * Includes MSW (Mock Service Worker) for HTTP mocking.
 */

import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server.js";

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error"; // Reduce noise during tests
process.env.RATE_LIMIT_ENABLED = "false"; // Disable rate limiting in tests by default
// Collapse retry backoff in tests — remote-client retries 3x with
// exponential backoff (default base 1000ms → ~7s per failing test).
// 1ms keeps the retry logic exercised without burning wall clock.
process.env.RETRY_BASE_DELAY = "1";
process.env.RETRY_MAX_DELAY = "2";

// Global setup - start MSW server
beforeAll(() => {
  server.listen({
    // Note: 'warn' rather than 'error' so loopback fetches (HTTP transport
    // tests spin up a real server and hit it via fetch) pass through MSW
    // without being intercepted. Tightening to 'error' is tracked as a v2.x
    // follow-up.
    onUnhandledRequest: "warn",
  });
});

// Global teardown - close MSW server
afterAll(() => {
  server.close();
});

// Cleanup after each test - reset handlers to defaults
afterEach(() => {
  server.resetHandlers();
});
