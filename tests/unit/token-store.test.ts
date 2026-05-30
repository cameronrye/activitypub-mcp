import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;
let storePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tokenstore-"));
  storePath = join(dir, "nested", "accounts.json");
  vi.resetModules();
  process.env.MCP_TOKEN_STORE = storePath;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MCP_TOKEN_STORE;
});

const account = {
  id: "mastodon:fosstodon.org:alice",
  instance: "fosstodon.org",
  username: "alice",
  accessToken: "secret-token",
  tokenType: "Bearer",
  scopes: ["read", "write", "follow"],
  createdAt: "2026-05-29T00:00:00.000Z",
};

describe("token-store", () => {
  it("saves an account and reloads it (round-trip), creating dirs", async () => {
    const store = await import("../../src/auth/token-store.js");
    await store.save(account);
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(account.id);
    expect(loaded[0].accessToken).toBe("secret-token");
  });

  it("writes the file with 0600 permissions", async () => {
    const store = await import("../../src/auth/token-store.js");
    await store.save(account);
    const mode = statSync(storePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("upserts by id rather than duplicating", async () => {
    const store = await import("../../src/auth/token-store.js");
    await store.save(account);
    await store.save({ ...account, accessToken: "rotated" });
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].accessToken).toBe("rotated");
  });

  it("removes by id", async () => {
    const store = await import("../../src/auth/token-store.js");
    await store.save(account);
    await store.remove(account.id);
    expect(await store.loadAll()).toHaveLength(0);
  });

  it("returns [] for a missing file and tolerates corrupt JSON", async () => {
    const store = await import("../../src/auth/token-store.js");
    expect(await store.loadAll()).toEqual([]);
    mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(storePath, "{ not json");
    expect(await store.loadAll()).toEqual([]);
  });

  it("skips entries that fail schema validation", async () => {
    mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(storePath, JSON.stringify([account, { id: "bad" }]));
    const store = await import("../../src/auth/token-store.js");
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(account.id);
  });

  it("persists a JSON array", async () => {
    const store = await import("../../src/auth/token-store.js");
    await store.save(account);
    const raw = JSON.parse(readFileSync(storePath, "utf8"));
    expect(Array.isArray(raw)).toBe(true);
  });
});
