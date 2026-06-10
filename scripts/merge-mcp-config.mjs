#!/usr/bin/env node
/**
 * Safely add or remove the activitypub-mcp entry in an MCP client config file.
 *
 * Used by scripts/install.sh. All inputs arrive via the environment — NEVER
 * interpolated into program text — and the existing file is read with JSON.parse
 * (as data), not eval'd as JavaScript. This replaces the previous
 * `node -e "... const config = $existing_config ..."` in install.sh, which
 * treated the user's config file as trusted source and could execute arbitrary
 * code (or break the install) for any non-canonical existing config.
 *
 * Environment:
 *   AP_MCP_CONFIG_PATH   path to the client config JSON (required)
 *   AP_MCP_SERVER_NAME   key under mcpServers to add/remove (required)
 *   AP_MCP_PACKAGE_NAME  npm package for the `add` action (required for add)
 *   AP_MCP_ACTION        "add" (default) or "remove"
 */
import fs from "node:fs";

const configPath = process.env.AP_MCP_CONFIG_PATH;
const serverName = process.env.AP_MCP_SERVER_NAME;
const packageName = process.env.AP_MCP_PACKAGE_NAME;
const action = process.env.AP_MCP_ACTION || "add";

if (!configPath || !serverName) {
  console.error("merge-mcp-config: AP_MCP_CONFIG_PATH and AP_MCP_SERVER_NAME are required");
  process.exit(2);
}

function readExisting(path) {
  if (!fs.existsSync(path)) return {};
  let raw;
  try {
    raw = fs.readFileSync(path, "utf8");
  } catch (error) {
    console.error(`merge-mcp-config: cannot read ${path}: ${error.message}`);
    process.exit(1);
  }
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("config root is not a JSON object");
    }
    return parsed;
  } catch (error) {
    // Refuse to clobber a file we don't understand — surface it instead.
    console.error(
      `merge-mcp-config: existing config at ${path} is not valid JSON, refusing to overwrite it: ${error.message}`,
    );
    process.exit(1);
  }
}

const config = readExisting(configPath);
if (!config.mcpServers || typeof config.mcpServers !== "object") {
  config.mcpServers = {};
}

if (action === "remove") {
  if (config.mcpServers[serverName]) {
    delete config.mcpServers[serverName];
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Removed ${serverName} from configuration`);
  } else {
    console.log(`${serverName} not found in configuration`);
  }
} else {
  if (!packageName) {
    console.error("merge-mcp-config: AP_MCP_PACKAGE_NAME is required for the add action");
    process.exit(2);
  }
  config.mcpServers[serverName] = {
    command: "npx",
    args: ["-y", packageName],
    env: { LOG_LEVEL: "info" },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("Configuration updated successfully!");
}
