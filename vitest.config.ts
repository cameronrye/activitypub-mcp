import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Enable globals for describe, it, expect, etc.
    globals: true,

    // Use Node.js environment
    environment: "node",

    // Test file patterns
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],

    // Exclude patterns
    exclude: ["node_modules", "dist", "tests/test-*.ts", "tests/integration/**"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/site-config.ts",
        "src/components/**",
        "src/layouts/**",
        "src/pages/**",
        "src/styles/**",
      ],
      // Coverage thresholds
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },

    // Timeout for each test
    testTimeout: 30000,

    // Setup files to run before tests
    setupFiles: ["./tests/setup.ts"],

    // Reporter configuration
    reporters: ["default"],

    // Retry failed tests
    retry: 0,
  },

  // Resolve configuration
  resolve: {
    alias: {
      "@": "./src",
    },
  },
});
