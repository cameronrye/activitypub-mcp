import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Enable globals for describe, it, expect, etc.
    globals: true,

    // Use Node.js environment
    environment: "node",

    // Integration test patterns - these may hit real network endpoints
    include: ["tests/integration/**/*.test.ts", "tests/integration/**/*.spec.ts"],

    // Exclude patterns
    exclude: ["node_modules", "dist"],

    // Longer timeout for integration tests
    testTimeout: 60000,

    // Setup files - uses integration-specific setup (no MSW mocking)
    setupFiles: ["./tests/integration/setup.ts"],

    // Run tests sequentially for integration tests
    fileParallelism: false,

    // Retry failed tests (network can be flaky)
    retry: 2,
  },

  // Resolve configuration
  resolve: {
    alias: {
      "@": "./src",
    },
  },
});
