import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The default stdio transport must terminate cleanly on SIGINT/SIGTERM. The
 * server installs its own SIGINT handler (which suppresses Node's default
 * terminate action), so if the graceful-shutdown path never closes the MCP
 * transport, the StdioServerTransport's stdin 'data' listener keeps the event
 * loop alive forever and the process hangs after Ctrl+C — the startup hint even
 * tells users "Press Ctrl+C to exit", which would be a lie.
 *
 * This spawns the real entrypoint, drives an `initialize`, sends SIGINT, and
 * asserts the process exits on its own within a short window (the test never has
 * to SIGKILL it).
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
      clientInfo: { name: "shutdown-test", version: "1.0.0" },
    },
  })}\n`;
}

describe("stdio transport shuts down cleanly on SIGINT", () => {
  it("exits on its own after SIGINT instead of hanging", async () => {
    const result = await runUntilExitOnSigint();
    expect(result.killedByTest).toBe(false); // the test never had to force-kill it
    expect(result.exited).toBe(true);
  }, 20000);
});

function runUntilExitOnSigint(): Promise<{ exited: boolean; killedByTest: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", ENTRY], {
      env: { ...process.env, LOG_LEVEL: "info", MCP_TRANSPORT_MODE: "stdio" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let sentSigint = false;
    let killedByTest = false;

    // If the process doesn't exit a while after SIGINT, it hung — force-kill so
    // the test can fail (and so we don't leak a process).
    const giveUp = setTimeout(() => {
      killedByTest = true;
      child.kill("SIGKILL");
    }, 10000);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (!sentSigint && stdout.includes('"id":1')) {
        sentSigint = true;
        child.kill("SIGINT");
      }
    });
    child.on("error", reject);
    child.on("exit", () => {
      clearTimeout(giveUp);
      resolve({ exited: true, killedByTest });
    });

    child.stdin.write(initializeRequest());
  });
}
