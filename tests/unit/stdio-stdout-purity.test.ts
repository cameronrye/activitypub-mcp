import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A stdio MCP server speaks JSON-RPC over stdout. ANY non-protocol bytes on
 * stdout corrupt the stream the client parses. logtape's default console sink
 * routes info/debug to console.info/console.debug, which Node writes to stdout —
 * so at the default LOG_LEVEL=info the server pollutes its own protocol channel
 * (e.g. the "Server started (stdio transport)" line, plus every per-request
 * "Fetching ..." log). All logs must go to stderr instead.
 *
 * This spawns the real server entrypoint, drives a single `initialize`, and
 * asserts every line on stdout is valid JSON-RPC and that the startup log lands
 * on stderr.
 */
const ENTRY = fileURLToPath(new URL("../../src/mcp-main.ts", import.meta.url));

function initializeRequest(): string {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "purity-test", version: "1.0.0" },
    },
  })}\n`;
}

describe("stdio transport keeps stdout free of log output", () => {
  it("writes only JSON-RPC to stdout at the default info level", async () => {
    const { stdout, stderr } = await runServer();

    const stdoutLines = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(stdoutLines.length).toBeGreaterThan(0); // got the initialize response

    const nonJsonRpc = stdoutLines.filter((line) => {
      try {
        const msg = JSON.parse(line);
        return msg.jsonrpc !== "2.0";
      } catch {
        return true; // unparseable => a leaked log line
      }
    });
    expect(nonJsonRpc).toEqual([]);

    // The startup log must still be emitted — just on stderr.
    expect(stderr).toContain("stdio transport");
  }, 20000);
});

function runServer(): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", ENTRY], {
      env: { ...process.env, LOG_LEVEL: "info", MCP_TRANSPORT_MODE: "stdio" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settle: NodeJS.Timeout | undefined;
    const hardStop = setTimeout(() => finish(), 8000);

    const finish = () => {
      clearTimeout(hardStop);
      if (settle) clearTimeout(settle);
      child.kill("SIGKILL");
      resolve({ stdout, stderr });
    };

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      // Once the initialize response arrives, wait briefly for any interleaved
      // log line, then assess.
      if (stdout.includes('"id":1')) {
        if (settle) clearTimeout(settle);
        settle = setTimeout(finish, 400);
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);

    child.stdin.write(initializeRequest());
  });
}
