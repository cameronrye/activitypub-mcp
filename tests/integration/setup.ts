/**
 * Vitest setup file for integration tests.
 *
 * Unlike unit tests, integration tests hit real network endpoints
 * so we do NOT use MSW for mocking.
 */

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "warn"; // Less verbose for integration tests
process.env.RATE_LIMIT_ENABLED = "false"; // Disable rate limiting for integration tests
