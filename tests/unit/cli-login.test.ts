import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/login/resolve.js", () => ({
  resolveLoginStrategy: vi.fn(),
}));
vi.mock("../../src/auth/login/loopback-server.js", () => ({
  createLoopbackServer: vi.fn(),
}));
vi.mock("../../src/auth/login/browser.js", () => ({
  openBrowser: vi.fn().mockResolvedValue(undefined),
}));

import { createLoopbackServer } from "../../src/auth/login/loopback-server.js";
import { resolveLoginStrategy } from "../../src/auth/login/resolve.js";

describe("runLogin", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    const dir = mkdtempSync(join(tmpdir(), "apmcp-cli-"));
    process.env.ACTIVITYPUB_CONFIG_DIR = join(dir, "cfg");
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("runs the strategy and persists the resulting account", async () => {
    vi.mocked(createLoopbackServer).mockResolvedValue({
      redirectUri: "http://127.0.0.1:7777/callback",
      waitForCallback: vi.fn(),
      close: vi.fn(),
    });
    const authorize = vi.fn().mockResolvedValue({
      instance: "mastodon.test",
      username: "alice",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: ["read", "write", "follow"],
      clientId: "cid",
      clientSecret: "csecret",
    });
    vi.mocked(resolveLoginStrategy).mockResolvedValue({ kind: "mastodon", authorize } as never);

    const { runLogin } = await import(/* @vite-ignore */ "../../src/cli/login.js");
    await runLogin(["mastodon.test"]);

    const { credentialStore } = await import(
      /* @vite-ignore */ "../../src/auth/credential-store.js"
    );
    const stored = await credentialStore.getAccount("alice@mastodon.test");
    expect(stored?.accessToken).toBe("tok");
    expect(stored?.instance).toBe("mastodon.test");
  });

  it("rejects an invalid instance domain before opening a browser", async () => {
    const { runLogin } = await import(/* @vite-ignore */ "../../src/cli/login.js");
    await expect(runLogin(["not a domain"])).rejects.toThrow();
    expect(resolveLoginStrategy).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric --port", async () => {
    const { runLogin } = await import(/* @vite-ignore */ "../../src/cli/login.js");
    await expect(runLogin(["mastodon.test", "--port", "abc"])).rejects.toThrow(/--port must be/);
  });
});
