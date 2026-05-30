/**
 * Verifies the server loads persisted accounts before connecting a transport.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("server startup loads persisted accounts", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("awaits accountManager.loadPersisted() during start()", async () => {
    const { accountManager } = await import("../../src/auth/account-manager.js");
    const spy = vi.spyOn(accountManager, "loadPersisted").mockResolvedValue(undefined);

    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");
    const server = new ActivityPubMCPServer();
    // Stub the transport connect so start() doesn't open stdio.
    // @ts-expect-error reaching into the private mcpServer for the test
    server.mcpServer.connect = vi.fn().mockResolvedValue(undefined);

    await server.start("stdio");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
