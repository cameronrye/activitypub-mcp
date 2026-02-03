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
