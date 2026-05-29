#!/usr/bin/env node
/**
 * Verify `npm pack --dry-run` output matches the expected publish
 * whitelist. Fails CI if anything unexpected (src/, tests/, coverage/,
 * *.map, etc.) is about to be published.
 */

import { execSync } from "node:child_process";

const FORBIDDEN_PATTERNS = [
  /\.map$/, // source maps and declaration maps
  /\.bak$/, // editor / sed -i.bak leftovers
  /\.orig$/, // merge-conflict leftovers
  /^src\//, // source dirs should not ship
  /^tests\//,
  /^scripts\//,
  /^docs\//,
  /^coverage\//,
  /^\.github\//,
  /^\.astro\//,
  /^\.vscode\//,
  /^node_modules\//,
];

const REQUIRED_FILES = [/^dist\/.*\.js$/, /^dist\/.*\.d\.ts$/, /^README\.md$/, /^LICENSE$/];

function main() {
  const output = execSync("npm pack --dry-run --json", { encoding: "utf8" });
  const packed = JSON.parse(output);
  const entries = packed[0]?.files ?? [];
  const paths = entries.map((e) => e.path);

  let failed = false;

  for (const path of paths) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(path)) {
        console.error(`FORBIDDEN: ${path} matches ${pattern}`);
        failed = true;
      }
    }
  }

  for (const required of REQUIRED_FILES) {
    if (!paths.some((p) => required.test(p))) {
      console.error(`MISSING: no file matches ${required}`);
      failed = true;
    }
  }

  if (failed) {
    console.error("\nTarball contents check FAILED.");
    process.exit(1);
  }

  console.log(`Tarball contents OK (${paths.length} files).`);
}

main();
