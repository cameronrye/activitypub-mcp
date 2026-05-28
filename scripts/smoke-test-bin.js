#!/usr/bin/env node
/**
 * Smoke-test the published bin entry by packing the package, installing
 * it into a temp dir, and invoking the bin once. Verifies that the bin
 * path in package.json is correct, the shebang is present, and the
 * module loads cleanly.
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const TIMEOUT_MS = 10000;

function main() {
  console.log("Building package...");
  execSync("npm run build", { stdio: "inherit" });

  console.log("Packing tarball...");
  const packOutput = execSync("npm pack --silent", { encoding: "utf8" }).trim();
  const tarballName = packOutput.split("\n").pop();
  const tarballPath = resolve(process.cwd(), tarballName);
  console.log(`Tarball: ${tarballPath}`);

  const tempDir = mkdtempSync(join(tmpdir(), "activitypub-mcp-smoke-"));
  console.log(`Temp dir: ${tempDir}`);

  console.log("Installing tarball in clean dir...");
  execSync(`npm init -y && npm install --omit=dev "${tarballPath}"`, {
    cwd: tempDir,
    stdio: "inherit",
  });

  console.log("Invoking the bin to verify it loads...");
  const binPath = join(tempDir, "node_modules", ".bin", "activitypub-mcp");
  // Send empty stdin and use a short timeout — the bin is a long-running
  // MCP server, so we just need to confirm it starts without throwing.
  const result = spawnSync(binPath, [], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    input: "",
  });

  // The bin starts an MCP server on stdio, then blocks waiting for input.
  // Our timeout kills it; spawnSync reports timeout as signal SIGTERM and
  // status null. If the bin failed to load (missing shebang, broken
  // import, etc.), we'd see a non-null status with stderr complaints.
  if (result.error && result.error.code !== "ETIMEDOUT") {
    console.error("Bin failed to start:", result.error);
    process.exit(1);
  }

  if (result.status !== null && result.status !== 0) {
    console.error("Bin exited with status:", result.status);
    console.error("stderr:", result.stderr);
    process.exit(1);
  }

  console.log("Bin smoke test passed.");
  // Cleanup tarball file in the project dir
  rmSync(tarballPath, { force: true });
}

main();
