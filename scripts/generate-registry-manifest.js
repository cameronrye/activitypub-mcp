#!/usr/bin/env node

/**
 * Build-time registry manifest generator (spec §5.1).
 *
 * Scans every .ts file under src/ for TRUE registration call-sites
 * (.registerTool(/.registerResource(/.registerPrompt() and writes
 * site/src/data/registry-manifest.json with { tools, resources, prompts,
 * toolNames, resourceNames, promptNames }.
 *
 * EXCLUDES src/mcp/capabilities.ts: it wraps/instruments registerTool etc.
 * Excluding it is a cheap safety belt so a future instrumented call-form in
 * that file can never inflate the counts. The verified counts are 37 / 10 / 5.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Files excluded from counting (instrumentation wrappers, not registrars).
const EXCLUDED_BASENAMES = new Set(["capabilities.ts"]);

// Match the call form .registerTool("name", ... and capture the name.
const PATTERNS = {
  tools: /\.registerTool\(\s*["'`]([^"'`]+)["'`]/g,
  resources: /\.registerResource\(\s*["'`]([^"'`]+)["'`]/g,
  prompts: /\.registerPrompt\(\s*["'`]([^"'`]+)["'`]/g,
};

/** Recursively collect all .ts files under dir, skipping .d.ts and excluded basenames. */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...collectTsFiles(full));
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !EXCLUDED_BASENAMES.has(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function extractNames(content, regex) {
  const names = [];
  regex.lastIndex = 0;
  let m = regex.exec(content);
  while (m !== null) {
    names.push(m[1]);
    m = regex.exec(content);
  }
  return names;
}

/**
 * Pure counter — no side effects. Returns counts and deduped, sorted name lists.
 * @param {string} srcDir absolute path to the src/ directory
 */
export function countRegistry(srcDir) {
  const files = collectTsFiles(srcDir);
  const toolNames = [];
  const resourceNames = [];
  const promptNames = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    toolNames.push(...extractNames(content, PATTERNS.tools));
    resourceNames.push(...extractNames(content, PATTERNS.resources));
    promptNames.push(...extractNames(content, PATTERNS.prompts));
  }

  const uniqSorted = (a) => [...new Set(a)].sort();
  const tools = uniqSorted(toolNames);
  const resources = uniqSorted(resourceNames);
  const prompts = uniqSorted(promptNames);

  return {
    tools: tools.length,
    resources: resources.length,
    prompts: prompts.length,
    toolNames: tools,
    resourceNames: resources,
    promptNames: prompts,
  };
}

/** CLI: scan src/, write the manifest, verify the locked counts. */
function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "..");
  const srcDir = path.join(repoRoot, "src");
  const outDir = path.join(repoRoot, "site", "src", "data");
  const outFile = path.join(outDir, "registry-manifest.json");

  const manifest = countRegistry(srcDir);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);

  if (manifest.tools !== 37 || manifest.resources !== 10 || manifest.prompts !== 5) {
    console.error(
      `Count mismatch: expected 37/10/5, got ${manifest.tools}/${manifest.resources}/${manifest.prompts}. ` +
        "Check that capabilities.ts is excluded and all .registerX( call-sites are matched.",
    );
    process.exit(1);
  }

  console.log(
    `Counts verified: ${manifest.tools} tools / ${manifest.resources} resources / ${manifest.prompts} prompts -> ${outFile}`,
  );
}

// Run side effects only when invoked directly (not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
