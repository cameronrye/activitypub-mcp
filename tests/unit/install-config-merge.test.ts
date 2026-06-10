import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * install.sh used to splice the user's existing config file contents straight
 * into a `node -e "... const config = $existing_config ..."` program, treating
 * the file as trusted JS source — a code-injection / install-breakage vector.
 * The JSON merge now lives in this standalone, env-driven script that reads the
 * file with JSON.parse. These tests pin the safe behavior.
 */
const SCRIPT = fileURLToPath(new URL("../../scripts/merge-mcp-config.mjs", import.meta.url));

function run(env: Record<string, string>): void {
  execFileSync(process.execPath, [SCRIPT], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "pipe",
  });
}

describe("merge-mcp-config.mjs (safe config update for install.sh)", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "apmcp-cfg-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("adds the server to a missing config file", () => {
    const cfg = path.join(dir, "config.json");
    run({
      AP_MCP_CONFIG_PATH: cfg,
      AP_MCP_SERVER_NAME: "activitypub",
      AP_MCP_PACKAGE_NAME: "activitypub-mcp",
      AP_MCP_ACTION: "add",
    });
    const out = JSON.parse(fs.readFileSync(cfg, "utf8"));
    expect(out.mcpServers.activitypub.command).toBe("npx");
    expect(out.mcpServers.activitypub.args).toEqual(["-y", "activitypub-mcp"]);
  });

  it("preserves existing servers when adding", () => {
    const cfg = path.join(dir, "config.json");
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    run({
      AP_MCP_CONFIG_PATH: cfg,
      AP_MCP_SERVER_NAME: "activitypub",
      AP_MCP_PACKAGE_NAME: "activitypub-mcp",
      AP_MCP_ACTION: "add",
    });
    const out = JSON.parse(fs.readFileSync(cfg, "utf8"));
    expect(out.mcpServers.other.command).toBe("x");
    expect(out.mcpServers.activitypub).toBeDefined();
  });

  it("does not execute code in the existing config and refuses to clobber malformed JSON", () => {
    const cfg = path.join(dir, "config.json");
    const pwned = path.join(dir, "pwned");
    // The old interpolated `node -e` would EXECUTE this. JSON.parse must reject it.
    fs.writeFileSync(cfg, `{}; require('fs').writeFileSync(${JSON.stringify(pwned)}, 'x'); ({})`);
    expect(() =>
      run({
        AP_MCP_CONFIG_PATH: cfg,
        AP_MCP_SERVER_NAME: "activitypub",
        AP_MCP_PACKAGE_NAME: "activitypub-mcp",
        AP_MCP_ACTION: "add",
      }),
    ).toThrow();
    expect(fs.existsSync(pwned)).toBe(false);
    // The malformed file must be left untouched, not overwritten.
    expect(fs.readFileSync(cfg, "utf8")).toContain("require(");
  });

  it("removes the server entry without touching others", () => {
    const cfg = path.join(dir, "config.json");
    fs.writeFileSync(
      cfg,
      JSON.stringify({ mcpServers: { activitypub: { command: "npx" }, other: {} } }),
    );
    run({ AP_MCP_CONFIG_PATH: cfg, AP_MCP_SERVER_NAME: "activitypub", AP_MCP_ACTION: "remove" });
    const out = JSON.parse(fs.readFileSync(cfg, "utf8"));
    expect(out.mcpServers.activitypub).toBeUndefined();
    expect(out.mcpServers.other).toBeDefined();
  });

  it("handles a config path containing a single quote without breaking", () => {
    const weird = path.join(dir, "o'brien.json");
    run({
      AP_MCP_CONFIG_PATH: weird,
      AP_MCP_SERVER_NAME: "activitypub",
      AP_MCP_PACKAGE_NAME: "activitypub-mcp",
      AP_MCP_ACTION: "add",
    });
    expect(fs.existsSync(weird)).toBe(true);
  });
});
