import { describe, expect, it } from "vitest";
import { stdioStartupHint } from "../../src/mcp-server.js";

/**
 * A real MCP client connects over piped stdio (stdin is not a TTY). A human who
 * runs `npx activitypub-mcp` directly in a terminal gets a stdio server that
 * blocks on stdin with no output — it looks hung. When stdin is a TTY we emit a
 * one-line stderr hint explaining what's happening and how to use the server.
 */
describe("stdioStartupHint", () => {
  it("returns a guidance hint when stdin is an interactive TTY", () => {
    const hint = stdioStartupHint(true);
    expect(hint).not.toBeNull();
    expect(hint).toContain("stdio");
    expect(hint).toContain("MCP client");
    // Points the user at the actual auth subcommand and the install docs.
    expect(hint).toContain("login");
  });

  it("returns null when stdin is piped (a real MCP client is attached)", () => {
    expect(stdioStartupHint(false)).toBeNull();
    expect(stdioStartupHint(undefined)).toBeNull();
  });
});
