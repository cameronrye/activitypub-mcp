/**
 * Unit tests for account manager module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AccountManager", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should start with no accounts when no env vars set", async () => {
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;

    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    expect(manager.hasAccounts()).toBe(false);
    expect(manager.accountCount).toBe(0);
    expect(manager.listAccounts()).toHaveLength(0);
  });

  it("should load default account from environment", async () => {
    process.env.ACTIVITYPUB_DEFAULT_INSTANCE = "mastodon.social";
    process.env.ACTIVITYPUB_DEFAULT_TOKEN = "test-token-123";
    process.env.ACTIVITYPUB_DEFAULT_USERNAME = "testuser";

    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    expect(manager.hasAccounts()).toBe(true);
    expect(manager.accountCount).toBe(1);

    const accounts = manager.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe("default");
    expect(accounts[0].instance).toBe("mastodon.social");
    expect(accounts[0].username).toBe("testuser");
    expect(accounts[0].isActive).toBe(true);
  });

  it("should add and remove accounts", async () => {
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;

    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    // Add an account
    const account = manager.addAccount({
      id: "test-account",
      instance: "fosstodon.org",
      username: "testuser",
      accessToken: "secret-token",
      tokenType: "Bearer",
      scopes: ["read", "write"],
    });

    expect(account.id).toBe("test-account");
    expect(manager.hasAccounts()).toBe(true);
    expect(manager.accountCount).toBe(1);

    // Check active account is set
    const active = manager.getActiveAccount();
    expect(active).toBeDefined();
    expect(active?.id).toBe("test-account");

    // Remove account
    const removed = manager.removeAccount("test-account");
    expect(removed).toBe(true);
    expect(manager.hasAccounts()).toBe(false);
  });

  it("should switch active account", async () => {
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;

    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    // Add two accounts
    manager.addAccount({
      id: "account-1",
      instance: "mastodon.social",
      username: "user1",
      accessToken: "token1",
      tokenType: "Bearer",
      scopes: ["read", "write"],
    });

    manager.addAccount({
      id: "account-2",
      instance: "fosstodon.org",
      username: "user2",
      accessToken: "token2",
      tokenType: "Bearer",
      scopes: ["read", "write"],
    });

    // First account should be active by default
    expect(manager.getActiveAccount()?.id).toBe("account-1");

    // Switch to second account
    const switched = manager.setActiveAccount("account-2");
    expect(switched).toBe(true);
    expect(manager.getActiveAccount()?.id).toBe("account-2");

    // Try to switch to non-existent account
    const failedSwitch = manager.setActiveAccount("non-existent");
    expect(failedSwitch).toBe(false);
    expect(manager.getActiveAccount()?.id).toBe("account-2"); // Should remain unchanged
  });

  it("should check scopes", async () => {
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;

    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    manager.addAccount({
      id: "read-only",
      instance: "mastodon.social",
      username: "readonly",
      accessToken: "token",
      tokenType: "Bearer",
      scopes: ["read"],
    });

    manager.addAccount({
      id: "full-access",
      instance: "fosstodon.org",
      username: "fullaccess",
      accessToken: "token",
      tokenType: "Bearer",
      scopes: ["read", "write", "follow"],
    });

    // Check scopes
    expect(manager.hasScope("read-only", "read")).toBe(true);
    expect(manager.hasScope("read-only", "follow")).toBe(false);
    expect(manager.hasScope("full-access", "write")).toBe(true);
    expect(manager.hasScope("full-access", "follow")).toBe(true);
    expect(manager.hasScope("non-existent", "read")).toBe(false);
  });

  it("should get account by instance", async () => {
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;

    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    manager.addAccount({
      id: "mastodon-account",
      instance: "mastodon.social",
      username: "user",
      accessToken: "token",
      tokenType: "Bearer",
      scopes: ["read"],
    });

    const found = manager.getAccountByInstance("mastodon.social");
    expect(found).toBeDefined();
    expect(found?.id).toBe("mastodon-account");

    const notFound = manager.getAccountByInstance("unknown.social");
    expect(notFound).toBeUndefined();
  });

  it("should export config without tokens", async () => {
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;

    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    manager.addAccount({
      id: "test",
      instance: "mastodon.social",
      username: "testuser",
      accessToken: "super-secret-token",
      tokenType: "Bearer",
      scopes: ["read", "write"],
      label: "Test Account",
    });

    const exported = manager.exportConfig();
    expect(exported).toHaveLength(1);
    expect(exported[0].id).toBe("test");
    expect(exported[0].instance).toBe("mastodon.social");
    expect(exported[0].username).toBe("testuser");
    expect(exported[0].label).toBe("Test Account");
    // Token should NOT be in export
    expect((exported[0] as Record<string, unknown>).accessToken).toBeUndefined();
  });
});

describe("ACTIVITYPUB_ACCOUNTS pipe delimiter (H6)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("parses pipe-delimited accounts correctly", async () => {
    process.env.ACTIVITYPUB_ACCOUNTS = "id1|inst1.test|tok-with:colons|user1|label1";
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();
    const accounts = manager.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe("id1");
    expect(accounts[0].instance).toBe("inst1.test");
    // The token (which contains a colon) must be preserved verbatim.
    const acct = manager.getAccount("id1");
    expect(acct?.accessToken).toBe("tok-with:colons");
  });

  it("throws clear migration error for legacy `:`-delimited entries", async () => {
    process.env.ACTIVITYPUB_ACCOUNTS = "id1:inst1.test:tok:user1";
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    // The singleton at module level also calls the constructor, so the import
    // itself rejects with the migration error.
    await expect(import("../../src/auth/account-manager.js")).rejects.toThrow(
      /ACTIVITYPUB_ACCOUNTS.*pipe/i,
    );
  });

  it("throws migration error when any single entry is legacy (mixed input)", async () => {
    process.env.ACTIVITYPUB_ACCOUNTS =
      "good|inst.test|tok1|user1|Label,legacy:inst.test:tok2:user2";
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    await expect(import("../../src/auth/account-manager.js")).rejects.toThrow(
      /Legacy entry detected/i,
    );
  });
});

describe("verifyAccount SSRF protection (M8)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("refuses to send credentials to a private-network instance", async () => {
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    manager.addAccount({
      id: "internal",
      instance: "10.0.0.1",
      username: "user",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: ["read"],
    });

    const result = await manager.verifyAccount("internal");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("refuses to send credentials to localhost", async () => {
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    manager.addAccount({
      id: "local",
      instance: "localhost",
      username: "user",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: ["read"],
    });

    const result = await manager.verifyAccount("local");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("verifyAccount delegates to the platform adapter", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    delete process.env.ACTIVITYPUB_ACCOUNTS;
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.doUnmock("../../src/auth/adapters/resolve.js");
  });

  it("returns adapter.verifyCredentials() result", async () => {
    const fakeInfo = {
      id: "u1",
      username: "alice",
      acct: "alice",
      url: "https://misskey.test/@alice",
      followers_count: 1,
      following_count: 2,
      statuses_count: 3,
    };
    vi.doMock("../../src/auth/adapters/resolve.js", () => ({
      resolveWriteAdapter: vi.fn().mockResolvedValue({
        verifyCredentials: vi.fn().mockResolvedValue(fakeInfo),
      }),
    }));
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();
    manager.addAccount({
      id: "mk",
      instance: "misskey.test",
      username: "alice",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: ["read", "write"],
    });
    const info = await manager.verifyAccount("mk");
    expect(info?.id).toBe("u1");
    expect(info?.statuses_count).toBe(3);
  });

  it("returns null when the adapter throws", async () => {
    vi.doMock("../../src/auth/adapters/resolve.js", () => ({
      resolveWriteAdapter: vi.fn().mockResolvedValue({
        verifyCredentials: vi.fn().mockRejectedValue(new Error("401")),
      }),
    }));
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();
    manager.addAccount({
      id: "x",
      instance: "example.test",
      username: "u",
      accessToken: "t",
      tokenType: "Bearer",
      scopes: ["read"],
    });
    expect(await manager.verifyAccount("x")).toBeNull();
  });
});
