#!/usr/bin/env node

/**
 * Version Consistency Check Script
 *
 * Verifies that the version in package.json matches the MCP_SERVER_VERSION
 * environment variable default in the source code.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Read package.json
const packageJsonPath = join(rootDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const packageVersion = packageJson.version;

// Read mcp-server.ts to find MCP_SERVER_VERSION default
const mcpServerPath = join(rootDir, "src", "mcp-server.ts");
const mcpServerContent = readFileSync(mcpServerPath, "utf-8");

// Extract the default version from: serverVersion: process.env.MCP_SERVER_VERSION || "1.0.0"
const versionMatch = mcpServerContent.match(
  /serverVersion:\s*process\.env\.MCP_SERVER_VERSION\s*\|\|\s*["']([^"']+)["']/,
);

if (!versionMatch) {
  console.error("❌ Could not find MCP_SERVER_VERSION default in src/mcp-server.ts");
  process.exit(1);
}

const codeVersion = versionMatch[1];

// Compare versions
console.log("📦 Version Consistency Check");
console.log("─────────────────────────────");
console.log(`package.json version:        ${packageVersion}`);
console.log(`MCP_SERVER_VERSION default:  ${codeVersion}`);
console.log("─────────────────────────────");

if (packageVersion === codeVersion) {
  console.log("✅ Versions match!");
  process.exit(0);
} else {
  console.error("❌ Version mismatch detected!");
  console.error("");
  console.error("Please update one of the following:");
  console.error(`  1. package.json version to "${codeVersion}"`);
  console.error(`  2. MCP_SERVER_VERSION default in src/mcp-server.ts to "${packageVersion}"`);
  console.error("");
  process.exit(1);
}
