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

// Read server.json (the MCP registry manifest). Its version must track
// package.json so a release bump can't publish a stale manifest. The tests run
// the full structural contract; this guard runs at prepublish, where they do not.
const serverJsonPath = join(rootDir, "server.json");
const serverJson = JSON.parse(readFileSync(serverJsonPath, "utf-8"));
const serverJsonVersion = serverJson.version;
const serverJsonPkgVersion = serverJson.packages?.[0]?.version;

// Read manifest.json (the .mcpb Claude Desktop Extension bundle). It is built and
// uploaded by hand, so its version can silently drift from package.json and ship
// a stale bundle. Guard it here at prepublish.
const manifestJsonPath = join(rootDir, "manifest.json");
const manifestJson = JSON.parse(readFileSync(manifestJsonPath, "utf-8"));
const manifestJsonVersion = manifestJson.version;

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
console.log(`server.json version:            ${serverJsonVersion}`);
console.log(`server.json package version:    ${serverJsonPkgVersion}`);
console.log(`manifest.json (.mcpb) version:  ${manifestJsonVersion}`);
console.log(`MCP_SERVER_VERSION default:     ${codeVersion}`);
console.log("─────────────────────────────");

const mismatches = [];
if (packageVersion !== codeVersion) {
  mismatches.push(`package.json (${packageVersion}) vs src/config.ts (${codeVersion})`);
}
if (packageVersion !== serverJsonVersion) {
  mismatches.push(`package.json (${packageVersion}) vs server.json (${serverJsonVersion})`);
}
if (packageVersion !== serverJsonPkgVersion) {
  mismatches.push(
    `package.json (${packageVersion}) vs server.json packages[0] (${serverJsonPkgVersion})`,
  );
}
if (packageVersion !== manifestJsonVersion) {
  mismatches.push(`package.json (${packageVersion}) vs manifest.json (${manifestJsonVersion})`);
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
console.error("To fix server.json drift, update both 'version' and packages[0].version.");
console.error("To fix manifest.json drift, update the .mcpb bundle's 'version' field.");
process.exit(1);
