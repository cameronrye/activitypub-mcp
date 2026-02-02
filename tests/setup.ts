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

// Global setup - start MSW server
beforeAll(() => {
  server.listen({
    onUnhandledRequest: "warn", // Warn about unhandled requests
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
