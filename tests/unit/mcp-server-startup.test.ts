/**
 * Verifies the server loads persisted accounts before connecting a transport.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the account-manager module so the spy attaches to the same instance the
// server imports, regardless of dynamic-import evaluation order. (Same pattern as
// mcp-server.test.ts.)
vi.mock("../../src/auth/account-manager.js", () => ({
  accountManager: {
    loadPersisted: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("server startup loads persisted accounts", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("awaits accountManager.loadPersisted() during start()", async () => {
    const { accountManager } = await import("../../src/auth/account-manager.js");
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");
    const server = new ActivityPubMCPServer();
    // StdioServerTransport.connect() reads from stdin; stub it so start() doesn't
    // block the test process on fd 0.
    // @ts-expect-error reaching into the private mcpServer for the test
    server.mcpServer.connect = vi.fn().mockResolvedValue(undefined);

    await server.start("stdio");
    expect(vi.mocked(accountManager.loadPersisted)).toHaveBeenCalledTimes(1);
  });
});
