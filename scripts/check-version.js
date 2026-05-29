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

// Read package-lock.json (both top-level "version" and the root "" packages entry)
const lockPath = join(rootDir, "package-lock.json");
const lockJson = JSON.parse(readFileSync(lockPath, "utf-8"));
const lockVersion = lockJson.version;
const lockRootPkgVersion = lockJson.packages?.[""]?.version;

// Read config.ts to find MCP_SERVER_VERSION default
const configPath = join(rootDir, "src", "config.ts");
const configContent = readFileSync(configPath, "utf-8");

const versionMatch = configContent.match(
  /SERVER_VERSION\s*=\s*process\.env\.MCP_SERVER_VERSION\s*\|\|\s*["']([^"']+)["']/,
);

if (!versionMatch) {
  console.error("❌ Could not find MCP_SERVER_VERSION default in src/config.ts");
  process.exit(1);
}

const codeVersion = versionMatch[1];

console.log("📦 Version Consistency Check");
console.log("─────────────────────────────");
console.log(`package.json version:           ${packageVersion}`);
console.log(`package-lock.json version:      ${lockVersion}`);
console.log(`package-lock.json root pkg:     ${lockRootPkgVersion}`);
console.log(`MCP_SERVER_VERSION default:     ${codeVersion}`);
console.log("─────────────────────────────");

const mismatches = [];
if (packageVersion !== codeVersion) {
  mismatches.push(`package.json (${packageVersion}) vs src/config.ts (${codeVersion})`);
}
if (packageVersion !== lockVersion) {
  mismatches.push(
    `package.json (${packageVersion}) vs package-lock.json top-level (${lockVersion})`,
  );
}
if (packageVersion !== lockRootPkgVersion) {
  mismatches.push(
    `package.json (${packageVersion}) vs package-lock.json packages[""] (${lockRootPkgVersion})`,
  );
}

if (mismatches.length === 0) {
  console.log("✅ Versions match!");
  process.exit(0);
}

console.error("❌ Version mismatch detected!");
console.error("");
for (const m of mismatches) {
  console.error(`  • ${m}`);
}
console.error("");
console.error("To fix package-lock.json drift, run: npm install --package-lock-only");
console.error("To fix src/config.ts drift, update the SERVER_VERSION default.");
process.exit(1);
