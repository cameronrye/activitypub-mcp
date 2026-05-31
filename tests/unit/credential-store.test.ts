/**
 * Unit tests for the on-disk credential store.
 */

import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Windows can't represent POSIX file modes — chmod() only toggles the read-only
// bit, so a 0600 file reads back as 0666. The 0600 guarantee is POSIX-only.
const isWindows = process.platform === "win32";

let dir: string;

function freshStore() {
  // Re-import with a per-test CONFIG_DIR (config reads env at import time).
  dir = mkdtempSync(join(tmpdir(), "apmcp-store-"));
  process.env.ACTIVITYPUB_CONFIG_DIR = join(dir, "config");
  return import(
    /* @vite-ignore */ `../../src/auth/credential-store.js?ts=${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

const sample = {
  id: "alice@mastodon.test",
  instance: "mastodon.test",
  username: "alice",
  accessToken: "tok-123",
  tokenType: "Bearer",
  scopes: ["read", "write", "follow"],
  clientId: "cid",
  clientSecret: "csecret",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("CredentialStore", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules(); // force config.js to re-read ACTIVITYPUB_CONFIG_DIR per test
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns an empty list when the file is absent", async () => {
    const { CredentialStore } = await freshStore();
    const store = new CredentialStore();
    expect(await store.loadAccounts()).toEqual([]);
  });

  it("upserts and loads an account, writing the file 0600", async () => {
    const { CredentialStore } = await freshStore();
    const store = new CredentialStore();
    await store.upsert(sample);

    const loaded = await store.loadAccounts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(sample);

    const filePath = join(process.env.ACTIVITYPUB_CONFIG_DIR as string, "accounts.json");
    if (!isWindows) {
      const mode = statSync(filePath).mode & 0o777;
      expect(mode).toBe(0o600);
    }
    // File must be parseable JSON.
    expect(() => JSON.parse(readFileSync(filePath, "utf-8"))).not.toThrow();
  });

  it("upsert replaces an existing id", async () => {
    const { CredentialStore } = await freshStore();
    const store = new CredentialStore();
    await store.upsert(sample);
    await store.upsert({ ...sample, accessToken: "tok-NEW" });
    const loaded = await store.loadAccounts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].accessToken).toBe("tok-NEW");
  });

  it("get returns one account or undefined", async () => {
    const { CredentialStore } = await freshStore();
    const store = new CredentialStore();
    await store.upsert(sample);
    expect((await store.getAccount("alice@mastodon.test"))?.username).toBe("alice");
    expect(await store.getAccount("nope")).toBeUndefined();
  });

  it("remove deletes by id and reports success", async () => {
    const { CredentialStore } = await freshStore();
    const store = new CredentialStore();
    await store.upsert(sample);
    expect(await store.remove("alice@mastodon.test")).toBe(true);
    expect(await store.remove("alice@mastodon.test")).toBe(false);
    expect(await store.loadAccounts()).toEqual([]);
  });
});

describe("CredentialStore hardening", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules(); // force config.js to re-read ACTIVITYPUB_CONFIG_DIR per test
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it.skipIf(isWindows)("relaxes an over-permissive file back to 0600 on load", async () => {
    const { CredentialStore } = await freshStore();
    const store = new CredentialStore();
    await store.upsert(sample);
    const filePath = join(process.env.ACTIVITYPUB_CONFIG_DIR as string, "accounts.json");
    chmodSync(filePath, 0o644);

    await store.loadAccounts();
    const mode = statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("refuses to read a symlinked accounts file", async () => {
    const { CredentialStore } = await freshStore();
    const cfg = process.env.ACTIVITYPUB_CONFIG_DIR as string;
    const target = join(dir, "evil.json");
    writeFileSync(target, JSON.stringify({ version: 1, accounts: [] }));
    // Build the config dir and symlink accounts.json -> evil.json.
    const store = new CredentialStore();
    await store.upsert(sample); // creates cfg + a real file
    const filePath = join(cfg, "accounts.json");
    // Replace with a symlink.
    const { rmSync } = await import("node:fs");
    rmSync(filePath);
    symlinkSync(target, filePath);

    await expect(store.loadAccounts()).rejects.toThrow(/symlink|refus/i);
  });

  it("preserves a malformed file as .corrupt and returns []", async () => {
    const { CredentialStore } = await freshStore();
    const store = new CredentialStore();
    await store.upsert(sample);
    const filePath = join(process.env.ACTIVITYPUB_CONFIG_DIR as string, "accounts.json");
    writeFileSync(filePath, "{ this is not valid json");

    expect(await store.loadAccounts()).toEqual([]);
    const dirContents = readdirSync(process.env.ACTIVITYPUB_CONFIG_DIR as string);
    expect(dirContents.some((f) => f.startsWith("accounts.json.corrupt-"))).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });
});
