#!/usr/bin/env node

/**
 * Inject the live tool manifest into a .mcpb manifest.json.
 *
 * Why query the running server instead of parsing TypeScript: this captures the
 * EXACT JSON Schema the MCP SDK emits for each tool — including `outputSchema`,
 * which only exists after the SDK serializes the registered Zod shapes. There is
 * no source-parsing drift, and new schemas are picked up automatically.
 *
 * Why this replaces `mcpb pack`: `mcpb validate`/`pack` reject `inputSchema`/
 * `outputSchema`/`annotations` as unrecognized keys and emit only
 * `{name, description}` per tool, so the rich schemas Smithery scores would be
 * stripped from the shipped bundle. The release workflow zips the bundle plainly
 * instead (a .mcpb IS a zip with manifest.json at root).
 *
 * What it does:
 *   1. Spawns the built server over stdio with writes DISABLED, so only the
 *      default (read/always-on) tools register.
 *   2. Sends initialize + tools/list and collects each tool.
 *   3. Filters to the default tools (excludes the destructive write mutators),
 *      strips `annotations`, keeps name/title/description/inputSchema/outputSchema.
 *   4. Writes the array into the target manifest.json's `tools` field.
 *   5. Fails loudly (exit 1) on no server response within the timeout, and if the
 *      final tool count is not exactly EXPECTED_TOOL_COUNT — a registration
 *      regression must break the release, not ship a short/wrong manifest.
 *
 * Usage:
 *   node scripts/inject-tools-manifest.js <manifest.json> <dist/mcp-main.js>
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const TIMEOUT_MS = 10000;
// The default tools Smithery scores: 9 read tools + 9 always-on (account
// management + authenticated reads). The 19 write-gated mutators are excluded.
const EXPECTED_TOOL_COUNT = 18;

function fail(message) {
  console.error(`inject-tools-manifest: ${message}`);
  process.exit(1);
}

function main() {
  const [, , manifestPath, serverPath] = process.argv;
  if (!manifestPath || !serverPath) {
    fail("usage: node scripts/inject-tools-manifest.js <manifest.json> <dist/mcp-main.js>");
  }

  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      MCP_TRANSPORT_MODE: "stdio",
      LOG_LEVEL: "error",
      // Writes OFF: only the default tools register. We additionally filter out
      // any destructive mutator below as belt-and-suspenders.
      ACTIVITYPUB_ENABLE_WRITES: undefined,
    },
    stdio: ["pipe", "pipe", "inherit"],
  });

  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    child.kill();
    fail("timed out waiting for the server to respond to tools/list");
  }, TIMEOUT_MS);

  child.on("error", (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fail(`failed to spawn server: ${err.message}`);
  });

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    // The server speaks newline-delimited JSON-RPC over stdout. Keep the trailing
    // partial line (if any) in the buffer for the next chunk.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        // Non-JSON noise (shouldn't happen on stdout, but be defensive).
        continue;
      }
      if (message.id === 2 && message.result && Array.isArray(message.result.tools)) {
        handleTools(message.result.tools, manifestPath, child, timer, () => {
          settled = true;
        });
        return;
      }
    }
  });

  const send = (obj) => child.stdin.write(`${JSON.stringify(obj)}\n`);
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "inject-tools-manifest", version: "0" },
    },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
}

function handleTools(allTools, manifestPath, child, timer, markSettled) {
  clearTimeout(timer);
  markSettled();
  child.kill();

  // Keep the default tools, drop the destructive write mutators. switch-account
  // is a default tool that carries `readOnlyHint: false` (it flips the active
  // account) but is NOT destructive, so a strict readOnlyHint filter would wrongly
  // drop it; filtering by `destructiveHint !== true` keeps exactly the 18 defaults.
  const tools = allTools
    .filter((tool) => tool.annotations?.destructiveHint !== true)
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    }));

  if (tools.length !== EXPECTED_TOOL_COUNT) {
    fail(
      `expected ${EXPECTED_TOOL_COUNT} default tools but found ${tools.length}: ` +
        `[${tools.map((t) => t.name).join(", ")}] — a tool-registration regression?`,
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.tools = tools;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`inject-tools-manifest: wrote ${tools.length} tools into ${manifestPath}`);
  for (const tool of tools) {
    console.log(`  - ${tool.name}${tool.outputSchema ? " (outputSchema ✓)" : ""}`);
  }
  process.exit(0);
}

main();
