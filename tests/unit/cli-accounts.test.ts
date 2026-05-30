import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("runLogout / runAccounts", () => {
  const originalEnv = process.env;
  let out: string;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    const dir = mkdtempSync(join(tmpdir(), "apmcp-acc-"));
    process.env.ACTIVITYPUB_CONFIG_DIR = join(dir, "cfg");
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;
    out = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      out += chunk.toString();
      return true;
    });
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const mastodonAccount = {
    id: "alice@mastodon.test",
    instance: "mastodon.test",
    username: "alice",
    accessToken: "tok",
    tokenType: "Bearer",
    scopes: ["read", "write"],
    clientId: "cid",
    clientSecret: "csecret",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("logout revokes (Mastodon) and removes the account", async () => {
    const { credentialStore } = await import("../../src/auth/credential-store.js");
    await credentialStore.upsert(mastodonAccount);

    const revoke = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/auth/login/resolve.js", () => ({
      resolveLoginStrategy: vi.fn().mockResolvedValue({ kind: "mastodon", revoke }),
    }));
    const { runLogout } = await import("../../src/cli/logout.js");
    await runLogout(["alice@mastodon.test"]);

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(await credentialStore.getAccount("alice@mastodon.test")).toBeUndefined();
  });

  it("logout errors clearly for an unknown id", async () => {
    const { runLogout } = await import("../../src/cli/logout.js");
    await expect(runLogout(["nope"])).rejects.toThrow(/not found|no persisted/i);
  });

  it("accounts lists persisted accounts (tagged) without secrets", async () => {
    const { credentialStore } = await import("../../src/auth/credential-store.js");
    await credentialStore.upsert(mastodonAccount);
    const { runAccounts } = await import("../../src/cli/accounts.js");
    await runAccounts();
    expect(out).toContain("alice@mastodon.test");
    expect(out).toContain("(persisted)");
    expect(out).not.toContain("tok");
    expect(out).not.toContain("csecret");
  });

  it("accounts merges env accounts, tagged (env)", async () => {
    process.env.ACTIVITYPUB_DEFAULT_INSTANCE = "env.test";
    process.env.ACTIVITYPUB_DEFAULT_TOKEN = "env-token";
    const { runAccounts } = await import("../../src/cli/accounts.js");
    await runAccounts();
    expect(out).toContain("env.test");
    expect(out).toContain("(env)");
    expect(out).not.toContain("env-token");
  });
});
