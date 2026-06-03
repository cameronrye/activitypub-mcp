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
      // Coverage thresholds. Global floors are kept a few points under current
      // actuals (≈78/66/87/80) so a real regression fails CI without flaking on
      // minor legitimate changes. Per-directory floors guard the security-critical
      // paths, which would otherwise be free to erode under the global aggregate
      // (dominated by the larger, less-covered files like remote-client.ts).
      thresholds: {
        statements: 76,
        branches: 63,
        functions: 84,
        lines: 77,
        "src/validation/**": { statements: 88, branches: 74, functions: 92, lines: 88 },
        "src/utils/**": { statements: 90, branches: 80, functions: 86, lines: 92 },
        "src/policy/**": { statements: 94, branches: 84, functions: 100, lines: 94 },
        "src/audit/**": { statements: 94, branches: 88, functions: 100, lines: 97 },
        "src/transport/**": { statements: 84, branches: 84, functions: 86, lines: 84 },
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
