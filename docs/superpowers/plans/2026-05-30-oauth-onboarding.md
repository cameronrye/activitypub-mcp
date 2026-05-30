# Browser-Based Login + Credential Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `activitypub-mcp login/logout/accounts` CLI subcommands that acquire access tokens via Mastodon OAuth2 or Misskey MiAuth (routed by NodeInfo software detection) and persist them to an on-disk store the server loads at startup — so users stop hand-pasting tokens.

**Architecture:** A `LoginStrategy` interface with two implementations (`MastodonOAuthStrategy`, `MisskeyMiAuthStrategy`) selected by `getInstanceSoftware()`, exactly mirroring SP1's `WriteAdapter`. A CLI orchestrator owns the shared mechanics — an **ephemeral-port** one-shot `127.0.0.1` loopback callback (RFC 8252) and a cross-platform browser opener — and injects them into the strategy. Tokens persist via a `node:fs` JSON store (XDG dir, `0600`) that `AccountManager` loads at startup alongside the existing env-var path. Pre-token HTTP uses a new guarded **unauthenticated** fetch helper (the existing `authenticatedFetch` can't run without a token).

**Tech Stack:** TypeScript (ESM, NodeNext), Zod v4, Vitest + MSW, LogTape, `node:http`/`node:crypto`/`node:fs`/`node:child_process` (no new runtime dependency).

**Spec:** `docs/superpowers/specs/2026-05-29-oauth-onboarding-design.md`

**Conventions (read before starting):**
- All commands run from repo root `/Users/cameron/Developer/activitypub-mcp`.
- Run one test file: `npm run test -- tests/unit/<file>.test.ts`
- Run one test by name: `npm run test -- tests/unit/<file>.test.ts -t "name"`
- Typecheck: `npm run typecheck`  •  Lint+fix: `npm run lint:fix`  •  Version check stays green automatically.
- **Run `npm run lint:fix` before every commit.** Biome enforces 100-col line width and import ordering, and the pre-commit hook runs `biome check` (no auto-fix) — so unformatted code (long `throw new Error(...)` / `process.stdout.write(...)` lines, imports added below code) will reject the commit unless `lint:fix` ran first.
- ESM: import paths use the `.js` extension even for `.ts` files. Match existing style.
- Secrets (`accessToken`, `clientSecret`, `code`, `code_verifier`, MiAuth `session`/`token`) must **never** be logged. Log only `instance`/`username`/`scopes`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/config.ts` (modify) | Add `CONFIG_DIR` resolution (`ACTIVITYPUB_CONFIG_DIR` → XDG → `~/.config`). |
| `src/auth/credential-store.ts` (create) | `StoredAccount` schema/type + `CredentialStore` (load/upsert/remove/get) with atomic `0600` writes, perms/symlink refusal, malformed-file preservation. Exports `credentialStore` singleton. |
| `src/auth/account-manager.ts` (modify) | Add async `loadPersisted()` (collision-guarded; env wins). |
| `src/mcp-server.ts` (modify) | `await accountManager.loadPersisted()` at the top of `start()`. |
| `src/utils/fetch-helpers.ts` (modify) | Add `guardedFetch()` — guarded UNauthenticated fetch (method/headers/body). |
| `src/discovery/nodeinfo.ts` (modify) | Refactor private `fetchJson` to call `guardedFetch`. |
| `src/auth/login/loopback-server.ts` (create) | One-shot `127.0.0.1:0` callback server; resolves only on matching `state`/`session`. |
| `src/auth/login/browser.ts` (create) | `openBrowser(url)` — argv-array spawn, URL-print fallback. |
| `src/auth/login/login-strategy.ts` (create) | `LoginStrategy`/`LoginResult`/`AuthorizeContext` types. |
| `src/auth/login/scopes.ts` (create) | `MASTODON_SCOPES`, `MISSKEY_PERMISSIONS` constants. |
| `src/auth/login/mastodon-oauth.ts` (create) | `MastodonOAuthStrategy` (app registration, PKCE authorize, token, revoke). |
| `src/auth/login/miauth.ts` (create) | `MisskeyMiAuthStrategy` (session, consent, check). |
| `src/auth/login/resolve.ts` (create) | `resolveLoginStrategy(instance)` via `getInstanceSoftware()`. |
| `src/cli/login.ts` (create) | `runLogin()` orchestration + `LoginResult→StoredAccount` mapping. |
| `src/cli/logout.ts`, `src/cli/accounts.ts` (create) | `runLogout()`, `runAccounts()`. |
| `src/cli/index.ts` (create) | `dispatchCli(argv)` subcommand router. |
| `src/mcp-main.ts` (modify) | Call `dispatchCli` before `validateConfiguration()`/server start. |
| `src/utils/errors.ts` (modify) | Add `TokenRejectedError`. |
| `src/auth/adapters/write-adapter.ts` (modify) | `authenticatedFetch` throws `TokenRejectedError` on 401/403. |
| `src/mcp/tools-write.ts` (modify) | Add `login` hint to the "no account" guard messages. |
| `README.md`, `.env.example`, `.env.production.example`, `CHANGELOG.md` (modify) | Document login + storage + limitations. |

Tests are created alongside each task under `tests/unit/`.

---

## Task 1: Config dir + `CredentialStore` core (schema + CRUD + atomic write)

**Files:**
- Modify: `src/config.ts`
- Create: `src/auth/credential-store.ts`
- Test: `tests/unit/credential-store.test.ts`

- [ ] **Step 1: Add `CONFIG_DIR` to config**

In `src/config.ts`, after the `SERVER_VERSION` block (around line 40), add:

```ts
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Directory for the persisted credential store (accounts.json).
 * Precedence: ACTIVITYPUB_CONFIG_DIR → $XDG_CONFIG_HOME/activitypub-mcp → ~/.config/activitypub-mcp.
 */
export const CONFIG_DIR =
  process.env.ACTIVITYPUB_CONFIG_DIR ||
  join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "activitypub-mcp");
```

(Place the two `node:` imports with the other imports at the top of the file if imports are grouped there; otherwise inline above is fine for NodeNext.)

- [ ] **Step 2: Write the failing test**

Create `tests/unit/credential-store.test.ts`:

```ts
/**
 * Unit tests for the on-disk credential store.
 */

import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;

function freshStore() {
  // Re-import with a per-test CONFIG_DIR (config reads env at import time).
  dir = mkdtempSync(join(tmpdir(), "apmcp-store-"));
  process.env.ACTIVITYPUB_CONFIG_DIR = join(dir, "config");
  return import(`../../src/auth/credential-store.js?ts=${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    const mode = statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- tests/unit/credential-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the store**

Create `src/auth/credential-store.ts`:

```ts
/**
 * On-disk credential store for accounts acquired via `activitypub-mcp login`.
 *
 * Plain node:fs JSON file at CONFIG_DIR/accounts.json. Secrets are protected by
 * filesystem permissions (0600 file / 0700 dir) — the chosen trade-off (no
 * keychain/encryption). Writes are atomic (temp + rename) so a crash never
 * leaves a half-written file.
 */

import { getLogger } from "@logtape/logtape";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { open, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CONFIG_DIR } from "../config.js";

const logger = getLogger("activitypub-mcp:credential-store");

export const StoredAccountSchema = z.object({
  id: z.string(),
  instance: z.string(),
  username: z.string(),
  accessToken: z.string(),
  tokenType: z.string().default("Bearer"),
  scopes: z.array(z.string()),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  label: z.string().optional(),
  createdAt: z.string(),
});
export type StoredAccount = z.infer<typeof StoredAccountSchema>;

const FileSchema = z.object({
  version: z.literal(1),
  accounts: z.array(StoredAccountSchema),
});

export class CredentialStore {
  private readonly dir: string;
  private readonly file: string;

  constructor(dir: string = CONFIG_DIR) {
    this.dir = dir;
    this.file = join(dir, "accounts.json");
  }

  /** Load all persisted accounts. Absent file → []. */
  async loadAccounts(): Promise<StoredAccount[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const parsed = FileSchema.parse(JSON.parse(raw));
    return parsed.accounts;
  }

  async getAccount(id: string): Promise<StoredAccount | undefined> {
    return (await this.loadAccounts()).find((a) => a.id === id);
  }

  /** Insert or replace an account by id. */
  async upsert(account: StoredAccount): Promise<void> {
    const accounts = await this.loadAccounts();
    const next = accounts.filter((a) => a.id !== account.id);
    next.push(StoredAccountSchema.parse(account));
    await this.write(next);
    logger.info("Persisted account", { id: account.id, instance: account.instance });
  }

  /** Remove an account by id; returns whether it existed. */
  async remove(id: string): Promise<boolean> {
    const accounts = await this.loadAccounts();
    const next = accounts.filter((a) => a.id !== id);
    if (next.length === accounts.length) return false;
    await this.write(next);
    logger.info("Removed persisted account", { id });
    return true;
  }

  /** Atomic write: temp file (0600, O_EXCL) in the same dir, then rename. */
  private async write(accounts: StoredAccount[]): Promise<void> {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const body = `${JSON.stringify({ version: 1, accounts }, null, 2)}\n`;
    const tmp = join(this.dir, `accounts.json.${randomBytes(6).toString("hex")}.tmp`);
    const handle = await open(tmp, "wx", 0o600);
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, this.file);
    chmodSync(this.file, 0o600);
  }

  /** Exposed for the loader's permission hardening (Task 2). */
  get filePath(): string {
    return this.file;
  }
  get dirPath(): string {
    return this.dir;
  }

  // `stat` is imported for Task 2; referenced here to keep the import used.
  protected statFile(): ReturnType<typeof stat> {
    return stat(this.file);
  }
}

export const credentialStore = new CredentialStore();
```

> Note: `stat` is imported now and used fully in Task 2; the `statFile()` shim keeps
> the import live so this task typechecks. Task 2 replaces it with real hardening.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/unit/credential-store.test.ts`
Expected: PASS — 5 specs.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add src/config.ts src/auth/credential-store.ts tests/unit/credential-store.test.ts
git commit -m "feat(auth): credential store with atomic 0600 persistence + CONFIG_DIR"
```

---

## Task 2: `CredentialStore` hardening (perms/symlink refusal + malformed preservation)

**Files:**
- Modify: `src/auth/credential-store.ts`
- Test: `tests/unit/credential-store.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/credential-store.test.ts`:

```ts
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";

describe("CredentialStore hardening", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules(); // force config.js to re-read ACTIVITYPUB_CONFIG_DIR per test
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("relaxes an over-permissive file back to 0600 on load", async () => {
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
    mkdtempSync; // noop to keep import; real dir below
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/credential-store.test.ts -t "hardening"`
Expected: FAIL — current `loadAccounts` doesn't chmod, refuse symlinks, or preserve malformed files.

- [ ] **Step 3: Implement hardening**

In `src/auth/credential-store.ts`, replace the `loadAccounts` method (and delete the `statFile` shim) with:

```ts
  async loadAccounts(): Promise<StoredAccount[]> {
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`Refusing to read credential file: ${this.file} is a symlink`);
    }
    // Refuse a file owned by another user (POSIX only; getuid is undefined on Windows).
    // Not unit-tested: chown to a foreign uid needs root, so this is impl-only defense.
    if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
      throw new Error(`Refusing to read credential file: ${this.file} is not owned by the current user`);
    }
    // Relax over-permissive files back to 0600 rather than only warning.
    if ((info.mode & 0o077) !== 0) {
      logger.warn("Credential file was group/other-accessible; tightening to 0600", {
        file: this.file,
      });
      chmodSync(this.file, 0o600);
    }

    const raw = await readFile(this.file, "utf-8");
    try {
      return FileSchema.parse(JSON.parse(raw)).accounts;
    } catch (error) {
      const corrupt = `${this.file}.corrupt-${Date.now()}`;
      await rename(this.file, corrupt);
      logger.error("Credential file invalid; preserved and treating store as empty", {
        file: this.file,
        preservedAs: corrupt,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
```

Add `lstat` to the `node:fs/promises` import line and remove the now-unused `stat`:

```ts
import { lstat, open, readFile, rename } from "node:fs/promises";
```

Delete the `protected statFile()` method and the `get filePath`/`get dirPath` are kept (used by tests/loader).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/credential-store.test.ts`
Expected: PASS — core + hardening specs.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/auth/credential-store.ts tests/unit/credential-store.test.ts
git commit -m "feat(auth): harden credential store (symlink refusal, perms, corrupt-file preservation)"
```

---

## Task 3: `AccountManager.loadPersisted()` (collision-guarded; env wins)

**Files:**
- Modify: `src/auth/account-manager.ts`
- Test: `tests/unit/account-manager.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/account-manager.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("AccountManager.loadPersisted", () => {
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

  async function withStore() {
    const dir = mkdtempSync(join(tmpdir(), "apmcp-lp-"));
    process.env.ACTIVITYPUB_CONFIG_DIR = join(dir, "cfg");
    const { CredentialStore } = await import(
      `../../src/auth/credential-store.js?ts=${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    return new CredentialStore();
  }

  it("loads persisted accounts into the manager", async () => {
    const store = await withStore();
    await store.upsert({
      id: "bob@misskey.test",
      instance: "misskey.test",
      username: "bob",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: ["read:account"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();
    await manager.loadPersisted(store);
    expect(manager.getAccount("bob@misskey.test")?.username).toBe("bob");
  });

  it("env-var account wins on id collision (persisted skipped)", async () => {
    process.env.ACTIVITYPUB_DEFAULT_INSTANCE = "env.test";
    process.env.ACTIVITYPUB_DEFAULT_TOKEN = "env-token";
    const store = await withStore();
    await store.upsert({
      id: "default",
      instance: "persisted.test",
      username: "persisted",
      accessToken: "persisted-token",
      tokenType: "Bearer",
      scopes: ["read"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();
    await manager.loadPersisted(store);
    expect(manager.getAccount("default")?.instance).toBe("env.test");
  });

  it("never throws if the store read fails", async () => {
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();
    const brokenStore = {
      loadAccounts: () => Promise.reject(new Error("disk gone")),
    } as unknown as { loadAccounts: () => Promise<never> };
    await expect(manager.loadPersisted(brokenStore as never)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/account-manager.test.ts -t "loadPersisted"`
Expected: FAIL — `loadPersisted` is not a method.

- [ ] **Step 3: Implement**

In `src/auth/account-manager.ts`, add a type-only import near the top:

```ts
import type { CredentialStore } from "./credential-store.js";
```

Add this method to the `AccountManager` class (e.g. after `verifyAccount`):

```ts
  /**
   * Merge on-disk persisted accounts into the manager. Env-var accounts (loaded
   * in the constructor) WIN on id collision — deploy-time config is authoritative.
   * Never throws: a store failure logs and leaves env accounts intact.
   *
   * @param store - injected for testability; defaults to the shared singleton.
   */
  async loadPersisted(store?: CredentialStore): Promise<void> {
    try {
      const resolved = store ?? (await import("./credential-store.js")).credentialStore;
      const records = await resolved.loadAccounts();
      for (const rec of records) {
        if (this.accounts.has(rec.id)) {
          logger.warn("Persisted account shadowed by env account; skipping", { id: rec.id });
          continue;
        }
        this.addAccount({
          id: rec.id,
          instance: rec.instance,
          username: rec.username,
          accessToken: rec.accessToken,
          tokenType: rec.tokenType,
          scopes: rec.scopes,
          label: rec.label,
        });
      }
    } catch (error) {
      logger.error("Failed to load persisted accounts (env accounts unaffected)", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
```

> `addAccount` regenerates `createdAt` in-memory; the on-disk record keeps its
> original timestamp. That's acceptable — `createdAt` is local bookkeeping.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/account-manager.test.ts`
Expected: PASS — existing env tests plus the 3 new specs.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/auth/account-manager.ts tests/unit/account-manager.test.ts
git commit -m "feat(auth): AccountManager.loadPersisted merges store (env wins on collision)"
```

---

## Task 4: Load persisted accounts at server startup

**Files:**
- Modify: `src/mcp-server.ts`
- Test: `tests/unit/mcp-server-startup.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/mcp-server-startup.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/mcp-server-startup.test.ts`
Expected: FAIL — `loadPersisted` is never called by `start()`.

- [ ] **Step 3: Implement**

In `src/mcp-server.ts`, add the import (near the other auth imports):

```ts
import { accountManager } from "./auth/account-manager.js";
```

(If `accountManager` is already imported, don't duplicate.) Then change the top of `start()` so persisted accounts load before either transport connects:

```ts
  async start(transportMode?: "stdio" | "http"): Promise<void> {
    const mode = transportMode ?? CONFIG.transportMode;

    // Load persisted (logged-in) accounts before serving. Never throws.
    await accountManager.loadPersisted();

    if (mode === "http") {
      await this.startHttpTransport();
    } else {
      await this.startStdioTransport();
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/mcp-server-startup.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/mcp-server.ts tests/unit/mcp-server-startup.test.ts
git commit -m "feat(server): load persisted accounts before transport connect"
```

---

## Task 5: `guardedFetch` helper + nodeinfo refactor

**Files:**
- Modify: `src/utils/fetch-helpers.ts`
- Modify: `src/discovery/nodeinfo.ts`
- Test: `tests/unit/guarded-fetch.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/guarded-fetch.test.ts`:

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { guardedFetch } from "../../src/utils/fetch-helpers.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("guardedFetch", () => {
  it("performs a GET and parses JSON by default", async () => {
    server.use(http.get("https://x.test/thing", () => HttpResponse.json({ a: 1 })));
    const res = await guardedFetch<{ a: number }>("https://x.test/thing");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ a: 1 });
  });

  it("sends a form-encoded POST body and reads JSON", async () => {
    let contentType: string | null = null;
    let body = "";
    server.use(
      http.post("https://x.test/token", async ({ request }) => {
        contentType = request.headers.get("content-type");
        body = await request.text();
        return HttpResponse.json({ access_token: "t" });
      }),
    );
    const res = await guardedFetch<{ access_token: string }>("https://x.test/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: "c" }).toString(),
    });
    expect(contentType).toContain("application/x-www-form-urlencoded");
    expect(body).toContain("grant_type=authorization_code");
    expect(res.data?.access_token).toBe("t");
  });

  it("returns ok:false with parsed error body on 4xx", async () => {
    server.use(
      http.post("https://x.test/fail", () =>
        HttpResponse.json({ error: { message: "nope" } }, { status: 403 }),
      ),
    );
    const res = await guardedFetch<{ error: { message: string } }>("https://x.test/fail", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.data?.error.message).toBe("nope");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/guarded-fetch.test.ts`
Expected: FAIL — `guardedFetch` is not exported.

- [ ] **Step 3: Implement `guardedFetch`**

Put the three new `import` lines at the **top** of `src/utils/fetch-helpers.ts` (Biome's `organizeImports` requires imports first — appending them below the functions makes `npm run lint` report a diff), and add the rest of the code below the existing functions:

```ts
import { MAX_RESPONSE_SIZE, REQUEST_TIMEOUT, USER_AGENT } from "../config.js";
import { instanceBlocklist } from "../policy/instance-blocklist.js";
import { validateExternalUrl } from "../validation/url.js";

export interface GuardedFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface GuardedResponse<T> {
  ok: boolean;
  status: number;
  statusText: string;
  /** Parsed JSON body, or undefined if the body was empty / not JSON. */
  data: T | undefined;
}

/**
 * Guarded UNauthenticated fetch: SSRF allow-list + operator blocklist on the
 * initial URL and every redirect hop, abort/timeout, streaming size cap, and
 * best-effort JSON parsing. Used by NodeInfo discovery and the login flows'
 * pre-token calls (which have no Bearer token, so they can't use
 * authenticatedFetch).
 */
export async function guardedFetch<T = unknown>(
  url: string,
  options: GuardedFetchOptions = {},
): Promise<GuardedResponse<T>> {
  await validateExternalUrl(url);
  instanceBlocklist.validateNotBlocked(new URL(url).hostname);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT);
  try {
    const response = await fetchWithRedirectGuard(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      },
      async (target) => {
        await validateExternalUrl(target);
        instanceBlocklist.validateNotBlocked(new URL(target).hostname);
      },
    );

    let data: T | undefined;
    if (response.status !== 204) {
      try {
        data = await readJsonWithLimit<T>(response, MAX_RESPONSE_SIZE);
      } catch {
        data = undefined; // empty / non-JSON body
      }
    }
    return { ok: response.ok, status: response.status, statusText: response.statusText, data };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 4: Refactor nodeinfo to use it**

In `src/discovery/nodeinfo.ts`, replace the private `fetchJson` (lines ~216-241) with:

```ts
async function fetchJson(url: string): Promise<unknown> {
  const res = await guardedFetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.data;
}
```

Now fix `nodeinfo.ts`'s imports to the **exact** final set (the project has `noUnusedLocals: true` and Biome `noUnusedImports`, so any leftover import is a hard `tsc`/lint failure — `TS6133`). Replace the fetch-helpers import with just `guardedFetch`:

```ts
import { guardedFetch } from "../utils/fetch-helpers.js";
```

and trim the `../config.js` import down to only what the LRU caches still use — dropping the now-unused `MAX_RESPONSE_SIZE`, `REQUEST_TIMEOUT`, **and** `USER_AGENT`:

```ts
import { CACHE_MAX_SIZE, INSTANCE_SOFTWARE_TTL } from "../config.js";
```

Keep the `instanceBlocklist` and `validateExternalUrl` imports — `performDetection` still calls them directly on the discovery + linked URLs. The old `fetchJson` was the only user of `fetchWithRedirectGuard`/`readJsonWithLimit`/`USER_AGENT`/`MAX_RESPONSE_SIZE`/`REQUEST_TIMEOUT`, so all five are now gone. Verify with `npm run typecheck` (catches any missed unused import).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- tests/unit/guarded-fetch.test.ts tests/unit/nodeinfo.test.ts`
Expected: PASS — new helper specs AND all existing nodeinfo specs (behavior preserved).

- [ ] **Step 6: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint
git add src/utils/fetch-helpers.ts src/discovery/nodeinfo.ts tests/unit/guarded-fetch.test.ts
git commit -m "feat(utils): guardedFetch (unauthenticated guarded fetch); nodeinfo uses it"
```

---

## Task 6: Loopback callback server (ephemeral port, one-shot)

**Files:**
- Create: `src/auth/login/loopback-server.ts`
- Test: `tests/unit/loopback-server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/loopback-server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLoopbackServer } from "../../src/auth/login/loopback-server.js";

describe("createLoopbackServer", () => {
  it("binds 127.0.0.1 with an ephemeral port and a /callback redirect URI", async () => {
    const lb = await createLoopbackServer();
    try {
      expect(lb.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    } finally {
      lb.close();
    }
  });

  it("resolves with the query when state matches", async () => {
    const lb = await createLoopbackServer();
    const pending = lb.waitForCallback({ state: "abc" });
    await fetch(`${lb.redirectUri}?code=xyz&state=abc`);
    const params = await pending;
    expect(params.get("code")).toBe("xyz");
    lb.close();
  });

  it("does NOT resolve on a mismatched state (responds 404)", async () => {
    const lb = await createLoopbackServer();
    let resolved = false;
    lb.waitForCallback({ state: "abc" }).then(() => {
      resolved = true;
    });
    const res = await fetch(`${lb.redirectUri}?code=xyz&state=WRONG`);
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    lb.close();
  });

  it("matches on session for the MiAuth flow", async () => {
    const lb = await createLoopbackServer();
    const pending = lb.waitForCallback({ session: "sess-1" });
    await fetch(`${lb.redirectUri}?session=sess-1`);
    const params = await pending;
    expect(params.get("session")).toBe("sess-1");
    lb.close();
  });

  it("rejects after the timeout", async () => {
    const lb = await createLoopbackServer();
    await expect(lb.waitForCallback({ state: "abc", timeoutMs: 30 })).rejects.toThrow(/timed out/i);
    lb.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/loopback-server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/auth/login/loopback-server.ts`:

```ts
/**
 * One-shot OAuth loopback callback server (RFC 8252 §7.3).
 *
 * Binds to 127.0.0.1 on an OS-assigned EPHEMERAL port (never a fixed/predictable
 * one, never 0.0.0.0) so a co-resident local process cannot pre-bind and steal
 * the authorization code / MiAuth session. Resolves only when /callback carries
 * the exact expected `state` (Mastodon) or `session` (Misskey), compared in
 * constant time; everything else gets a static 404 and does not resolve.
 */

import { timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";

const SUCCESS_PAGE =
  "<!doctype html><meta charset=utf-8><title>activitypub-mcp</title>" +
  "<body style=\"font-family:sans-serif;padding:2rem\">" +
  "<h1>Authorized</h1><p>You can close this window and return to the terminal.</p>";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface CallbackExpectation {
  state?: string;
  session?: string;
  timeoutMs?: number;
}

export interface LoopbackServer {
  /** http://127.0.0.1:<port>/callback */
  redirectUri: string;
  /** Resolves once with the callback query params, or rejects on timeout. */
  waitForCallback(expected: CallbackExpectation): Promise<URLSearchParams>;
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

export function createLoopbackServer(port = 0): Promise<LoopbackServer> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCb: ((params: URLSearchParams) => void) | null = null;
    let expectation: CallbackExpectation | null = null;
    let activeTimer: ReturnType<typeof setTimeout> | null = null;

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback" || !resolveCb || !expectation) {
        res.writeHead(404).end();
        return;
      }
      const params = url.searchParams;
      const okState = expectation.state ? safeEqual(params.get("state") ?? "", expectation.state) : true;
      const okSession = expectation.session
        ? safeEqual(params.get("session") ?? "", expectation.session)
        : true;
      if (!okState || !okSession) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(SUCCESS_PAGE);
      const done = resolveCb;
      resolveCb = null;
      done(params);
    });

    server.on("error", rejectServer);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        rejectServer(new Error("Failed to bind loopback server"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${addr.port}/callback`;

      resolveServer({
        redirectUri,
        waitForCallback(expected) {
          expectation = expected;
          return new Promise<URLSearchParams>((resolve, reject) => {
            const ms = expected.timeoutMs ?? DEFAULT_TIMEOUT_MS;
            const timer = setTimeout(() => {
              resolveCb = null;
              activeTimer = null;
              reject(new Error(`Authorization timed out after ${ms}ms`));
            }, ms);
            timer.unref(); // never keep the process alive waiting on a callback
            activeTimer = timer;
            resolveCb = (params) => {
              clearTimeout(timer);
              activeTimer = null;
              resolve(params);
            };
          });
        },
        close() {
          if (activeTimer) {
            clearTimeout(activeTimer);
            activeTimer = null;
          }
          resolveCb = null;
          server.close();
        },
      });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/loopback-server.test.ts`
Expected: PASS — 5 specs.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/auth/login/loopback-server.ts tests/unit/loopback-server.test.ts
git commit -m "feat(login): ephemeral-port one-shot loopback callback server"
```

---

## Task 7: Cross-platform browser opener

**Files:**
- Create: `src/auth/login/browser.ts`
- Test: `tests/unit/browser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/browser.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    return { on: vi.fn(), unref: vi.fn() };
  },
}));

describe("openBrowser", () => {
  afterEach(() => {
    spawnMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("passes the URL as a discrete argv item (no shell string)", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const { openBrowser } = await import(`../../src/auth/login/browser.js?ts=${Date.now()}`);
    const url = "https://x.test/oauth/authorize?state=a&scope=read%20write&x=^%";
    await openBrowser(url);
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe("open");
    expect(args).toContain(url); // exact URL, never interpolated into a shell string
  });

  it("uses xdg-open on linux", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const { openBrowser } = await import(`../../src/auth/login/browser.js?ts=${Date.now()}`);
    await openBrowser("https://x.test/");
    expect(spawnMock.mock.calls[0][0]).toBe("xdg-open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/browser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/auth/login/browser.ts`:

```ts
/**
 * Opens the system browser to a URL using an argv-array spawn (never a shell
 * string), so query values containing &, %, ^ cannot be interpreted by a shell.
 * On failure the caller falls back to printing the URL.
 */

import { spawn } from "node:child_process";

export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];
    switch (process.platform) {
      case "darwin":
        command = "open";
        args = [url];
        break;
      case "win32":
        // `start` is a cmd builtin; "" is the (empty) window title, url is a discrete arg.
        command = "cmd";
        args = ["/c", "start", "", url];
        break;
      default:
        command = "xdg-open";
        args = [url];
        break;
    }
    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.on("error", reject);
      child.unref();
      resolve();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/browser.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/auth/login/browser.ts tests/unit/browser.test.ts
git commit -m "feat(login): cross-platform browser opener (argv-array spawn)"
```

---

## Task 8: `LoginStrategy` types + scope constants

**Files:**
- Create: `src/auth/login/login-strategy.ts`
- Create: `src/auth/login/scopes.ts`

- [ ] **Step 1: Create the scope constants**

Create `src/auth/login/scopes.ts`:

```ts
/**
 * Single source of truth for the OAuth scopes / MiAuth permissions requested
 * during login. Referenced by both app registration and the authorize URL.
 */

/**
 * Mastodon-family top-level scopes covering the SP1 write surface. Broad but
 * maximally compatible; `follow` is deprecated since 3.5.0 (redundant with
 * `write`) but kept for compatibility and to match the legacy default.
 */
export const MASTODON_SCOPES = "read write follow";

/**
 * Misskey/Foundkey permissions, trimmed to least-privilege for the SP1 write
 * surface. `read:account` covers whoami + home timeline + relationship reads
 * (Misskey has no separate read-timeline scope). Poll-voting and notification
 * writes are intentionally omitted (SP1 makes those Mastodon-only / read-only).
 */
export const MISSKEY_PERMISSIONS = [
  "read:account",
  "read:following",
  "write:notes",
  "write:reactions",
  "write:following",
  "write:blocks",
  "write:mutes",
  "write:drive",
  "read:notifications",
] as const;
```

- [ ] **Step 2: Create the strategy interface**

Create `src/auth/login/login-strategy.ts`:

```ts
/**
 * Contracts for platform login strategies. The CLI orchestrator owns the shared
 * mechanics (loopback server, browser opener, timeout) and injects them via
 * AuthorizeContext; each strategy implements only its platform's protocol.
 */

import type { StoredAccount } from "../credential-store.js";

export interface AuthorizeContext {
  /** Validated bare domain (DomainSchema), lowercased. */
  instance: string;
  /** http://127.0.0.1:<ephemeral-port>/callback */
  redirectUri: string;
  /** Platform-appropriate scope/permission list (from scopes.ts). */
  scopes: string[];
  openBrowser: (url: string) => Promise<void>;
  waitForCallback: (expected: { state?: string; session?: string }) => Promise<URLSearchParams>;
}

export interface LoginResult {
  instance: string;
  username: string;
  accessToken: string;
  tokenType: string;
  scopes: string[];
  clientId?: string;
  clientSecret?: string;
}

export interface LoginStrategy {
  readonly kind: "mastodon" | "misskey";
  authorize(ctx: AuthorizeContext): Promise<LoginResult>;
  /** Revoke the token server-side. Unimplemented on Misskey (no MiAuth revoke). */
  revoke?(account: StoredAccount): Promise<void>;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (types only; `StoredAccount` is a type-only import — no cycle).

- [ ] **Step 4: Commit**

```bash
git add src/auth/login/login-strategy.ts src/auth/login/scopes.ts
git commit -m "feat(login): LoginStrategy interface + scope/permission constants"
```

---

## Task 9: `MastodonOAuthStrategy`

**Files:**
- Create: `src/auth/login/mastodon-oauth.ts`
- Test: `tests/unit/mastodon-oauth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/mastodon-oauth.test.ts`:

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MastodonOAuthStrategy } from "../../src/auth/login/mastodon-oauth.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const strategy = new MastodonOAuthStrategy();

function ctx(overrides: Partial<Parameters<typeof strategy.authorize>[0]> = {}) {
  return {
    instance: "mastodon.test",
    redirectUri: "http://127.0.0.1:7777/callback",
    scopes: ["read", "write", "follow"],
    openBrowser: vi.fn().mockResolvedValue(undefined),
    // Default: hand back a code + the state the strategy generated.
    waitForCallback: vi.fn(async (exp: { state?: string }) => {
      const p = new URLSearchParams();
      p.set("code", "auth-code");
      if (exp.state) p.set("state", exp.state);
      return p;
    }),
    ...overrides,
  };
}

describe("MastodonOAuthStrategy.authorize", () => {
  it("registers an app, opens authorize with PKCE, exchanges the code, and returns a LoginResult", async () => {
    let appBody = "";
    let tokenBody = "";
    server.use(
      http.post("https://mastodon.test/api/v1/apps", async ({ request }) => {
        appBody = await request.text();
        return HttpResponse.json({ client_id: "cid", client_secret: "csecret" });
      }),
      http.post("https://mastodon.test/oauth/token", async ({ request }) => {
        tokenBody = await request.text();
        return HttpResponse.json({ access_token: "tok", token_type: "Bearer", scope: "read write follow" });
      }),
      http.get("https://mastodon.test/api/v1/accounts/verify_credentials", () =>
        HttpResponse.json({ id: "1", username: "alice", acct: "alice", url: "https://mastodon.test/@alice" }),
      ),
    );

    const c = ctx();
    const result = await strategy.authorize(c);

    expect(appBody).toContain("client_name=activitypub-mcp");
    expect(appBody).toContain(encodeURIComponent("http://127.0.0.1:7777/callback"));
    // Authorize URL carries PKCE + state.
    const openedUrl = (c.openBrowser as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(openedUrl).toContain("code_challenge=");
    expect(openedUrl).toContain("code_challenge_method=S256");
    expect(openedUrl).toContain("state=");
    // Token exchange includes the verifier + the code.
    expect(tokenBody).toContain("grant_type=authorization_code");
    expect(tokenBody).toContain("code=auth-code");
    expect(tokenBody).toContain("code_verifier=");
    expect(result).toMatchObject({
      instance: "mastodon.test",
      username: "alice",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: ["read", "write", "follow"],
      clientId: "cid",
      clientSecret: "csecret",
    });
  });

  it("rejects when the app registration fails with the platform error", async () => {
    server.use(
      http.post("https://mastodon.test/api/v1/apps", () =>
        HttpResponse.json({ error: "bad client" }, { status: 422 }),
      ),
    );
    await expect(strategy.authorize(ctx())).rejects.toThrow(/bad client|422/);
  });
});

describe("MastodonOAuthStrategy.revoke", () => {
  it("posts client creds + token to /oauth/revoke", async () => {
    let body = "";
    server.use(
      http.post("https://mastodon.test/oauth/revoke", async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({});
      }),
    );
    await strategy.revoke({
      id: "alice@mastodon.test",
      instance: "mastodon.test",
      username: "alice",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: [],
      clientId: "cid",
      clientSecret: "csecret",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(body).toContain("token=tok");
    expect(body).toContain("client_id=cid");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/mastodon-oauth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/auth/login/mastodon-oauth.ts`:

```ts
/**
 * Mastodon-family OAuth2 login (also Pleroma/Akkoma/GotoSocial/Sharkey/Firefish
 * where they expose the Mastodon OAuth API). Loopback redirect + always-on PKCE
 * S256. A fresh client app is registered per login because the ephemeral
 * redirect port changes and Mastodon matches redirect_uri exactly.
 */

import { createHash, randomBytes } from "node:crypto";
import { guardedFetch } from "../../utils/fetch-helpers.js";
import type { StoredAccount } from "../credential-store.js";
import type { AuthorizeContext, LoginResult, LoginStrategy } from "./login-strategy.js";

const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function platformError(data: unknown, status: number): string {
  const d = data as { error_description?: string; error?: string } | undefined;
  return d?.error_description || d?.error || `HTTP ${status}`;
}

export class MastodonOAuthStrategy implements LoginStrategy {
  readonly kind = "mastodon" as const;

  async authorize(ctx: AuthorizeContext): Promise<LoginResult> {
    const base = `https://${ctx.instance}`;
    const scope = ctx.scopes.join(" ");

    // 1. Register a fresh client app for this exact redirect_uri.
    const appRes = await guardedFetch<{ client_id: string; client_secret: string }>(
      `${base}/api/v1/apps`,
      {
        method: "POST",
        headers: FORM,
        body: new URLSearchParams({
          client_name: "activitypub-mcp",
          redirect_uris: ctx.redirectUri,
          scopes: scope,
          website: "https://github.com/cameronrye/activitypub-mcp",
        }).toString(),
      },
    );
    if (!appRes.ok || !appRes.data) {
      throw new Error(`Failed to register app: ${platformError(appRes.data, appRes.status)}`);
    }
    const { client_id, client_secret } = appRes.data;

    // 2. PKCE + state.
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const state = base64url(randomBytes(32));

    // 3. Authorize in the browser.
    const authorizeUrl =
      `${base}/oauth/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id,
        redirect_uri: ctx.redirectUri,
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
    await ctx.openBrowser(authorizeUrl);

    // 4. Capture the code (loopback verifies state).
    const params = await ctx.waitForCallback({ state });
    // Mix-up defense (RFC 9700 §4.4): if the AS returned an `iss`, it must be our instance.
    const iss = params.get("iss");
    if (iss && new URL(iss).host !== ctx.instance) {
      throw new Error("Authorization issuer mismatch (possible mix-up attack)");
    }
    const code = params.get("code");
    if (!code) throw new Error("Authorization callback returned no code");

    // 5. Exchange the code for a token (always send code_verifier).
    const tokenRes = await guardedFetch<{ access_token: string; token_type: string; scope?: string }>(
      `${base}/oauth/token`,
      {
        method: "POST",
        headers: FORM,
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id,
          client_secret,
          redirect_uri: ctx.redirectUri,
          code_verifier: verifier,
          scope,
        }).toString(),
      },
    );
    if (!tokenRes.ok || !tokenRes.data?.access_token) {
      throw new Error(`Token exchange failed: ${platformError(tokenRes.data, tokenRes.status)}`);
    }
    const granted = tokenRes.data.scope ? tokenRes.data.scope.split(" ") : ctx.scopes;

    // 6. Whoami.
    const whoami = await guardedFetch<{ username: string }>(
      `${base}/api/v1/accounts/verify_credentials`,
      { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } },
    );
    if (!whoami.ok || !whoami.data?.username) {
      throw new Error(`Could not read account: ${platformError(whoami.data, whoami.status)}`);
    }

    return {
      instance: ctx.instance,
      username: whoami.data.username,
      accessToken: tokenRes.data.access_token,
      tokenType: tokenRes.data.token_type || "Bearer",
      scopes: granted,
      clientId: client_id,
      clientSecret: client_secret,
    };
  }

  async revoke(account: StoredAccount): Promise<void> {
    if (!account.clientId || !account.clientSecret) return;
    await guardedFetch(`https://${account.instance}/oauth/revoke`, {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({
        client_id: account.clientId,
        client_secret: account.clientSecret,
        token: account.accessToken,
      }).toString(),
    });
  }
}

export const mastodonOAuthStrategy = new MastodonOAuthStrategy();
```

> Whoami uses `guardedFetch` with an explicit `Authorization` header here (rather
> than SP1 `authenticatedFetch`) so the strategy stays self-contained and testable;
> it is still SSRF/blocklist-guarded.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/mastodon-oauth.test.ts`
Expected: PASS — authorize + error + revoke specs.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/auth/login/mastodon-oauth.ts tests/unit/mastodon-oauth.test.ts
git commit -m "feat(login): Mastodon OAuth2 strategy (PKCE, loopback, revoke)"
```

---

## Task 10: `MisskeyMiAuthStrategy`

**Files:**
- Create: `src/auth/login/miauth.ts`
- Test: `tests/unit/miauth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/miauth.test.ts`:

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MisskeyMiAuthStrategy } from "../../src/auth/login/miauth.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const strategy = new MisskeyMiAuthStrategy();

describe("MisskeyMiAuthStrategy.authorize", () => {
  it("opens the miauth consent URL and exchanges the session for a token", async () => {
    server.use(
      http.post("https://misskey.test/api/miauth/:uuid/check", () =>
        HttpResponse.json({ ok: true, token: "mk-token", user: { username: "bob" } }),
      ),
    );

    const openBrowser = vi.fn().mockResolvedValue(undefined);
    const result = await strategy.authorize({
      instance: "misskey.test",
      redirectUri: "http://127.0.0.1:7777/callback",
      scopes: ["write:notes", "read:account"],
      openBrowser,
      // Echo back the session the strategy generated.
      waitForCallback: vi.fn(async (exp: { session?: string }) => {
        const p = new URLSearchParams();
        if (exp.session) p.set("session", exp.session);
        return p;
      }),
    });

    const openedUrl = openBrowser.mock.calls[0][0] as string;
    expect(openedUrl).toMatch(/^https:\/\/misskey\.test\/miauth\/[0-9a-f-]+\?/);
    expect(openedUrl).toContain("name=activitypub-mcp");
    expect(openedUrl).toContain(encodeURIComponent("write:notes,read:account"));
    expect(result).toMatchObject({
      instance: "misskey.test",
      username: "bob",
      accessToken: "mk-token",
      tokenType: "Bearer",
      scopes: ["write:notes", "read:account"],
    });
    expect(result.clientId).toBeUndefined();
  });

  it("rejects when check returns ok:false", async () => {
    server.use(
      http.post("https://misskey.test/api/miauth/:uuid/check", () => HttpResponse.json({ ok: false })),
    );
    await expect(
      strategy.authorize({
        instance: "misskey.test",
        redirectUri: "http://127.0.0.1:7777/callback",
        scopes: ["write:notes"],
        openBrowser: vi.fn().mockResolvedValue(undefined),
        waitForCallback: vi.fn(async (exp: { session?: string }) => {
          const p = new URLSearchParams();
          if (exp.session) p.set("session", exp.session);
          return p;
        }),
      }),
    ).rejects.toThrow(/authorization (was )?(not approved|failed|denied)|ok:false|not approved/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/miauth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/auth/login/miauth.ts`:

```ts
/**
 * Misskey / Foundkey MiAuth login. The user approves a session UUID in the
 * browser; the callback returns ?session=<uuid>, then POST /api/miauth/<uuid>/check
 * yields the access token + user inline (no app registration, no client secret,
 * no separate whoami). The session UUID is a secret (its bearer can call /check).
 *
 * Note: Foundkey is deprecating MiAuth in favor of OAuth2 — on a build where
 * /miauth is unavailable this surfaces a clear error.
 */

import { randomUUID } from "node:crypto";
import { guardedFetch } from "../../utils/fetch-helpers.js";
import type { AuthorizeContext, LoginResult, LoginStrategy } from "./login-strategy.js";

interface MiAuthCheck {
  ok: boolean;
  token?: string;
  user?: { username?: string };
}

export class MisskeyMiAuthStrategy implements LoginStrategy {
  readonly kind = "misskey" as const;

  async authorize(ctx: AuthorizeContext): Promise<LoginResult> {
    const session = randomUUID();
    const base = `https://${ctx.instance}`;

    const consentUrl =
      `${base}/miauth/${session}?` +
      new URLSearchParams({
        name: "activitypub-mcp",
        callback: ctx.redirectUri,
        permission: ctx.scopes.join(","),
      }).toString();
    await ctx.openBrowser(consentUrl);

    // Loopback verifies the returned session matches.
    await ctx.waitForCallback({ session });

    const res = await guardedFetch<MiAuthCheck>(`${base}/api/miauth/${session}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok || !res.data?.ok || !res.data.token) {
      throw new Error("MiAuth authorization was not approved");
    }
    const username = res.data.user?.username;
    if (!username) throw new Error("MiAuth check returned no user identity");

    return {
      instance: ctx.instance,
      username, // bare local handle from /check; never falls back to the domain
      accessToken: res.data.token,
      tokenType: "Bearer",
      scopes: ctx.scopes, // /check does not report the granted subset
    };
  }
}

export const misskeyMiAuthStrategy = new MisskeyMiAuthStrategy();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/miauth.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/auth/login/miauth.ts tests/unit/miauth.test.ts
git commit -m "feat(login): Misskey MiAuth strategy"
```

---

## Task 11: `resolveLoginStrategy`

**Files:**
- Create: `src/auth/login/resolve.ts`
- Test: `tests/unit/login-resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/login-resolve.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/discovery/nodeinfo.js", () => ({
  getInstanceSoftware: vi.fn(),
}));

import { mastodonOAuthStrategy } from "../../src/auth/login/mastodon-oauth.js";
import { misskeyMiAuthStrategy } from "../../src/auth/login/miauth.js";
import { resolveLoginStrategy } from "../../src/auth/login/resolve.js";
import { getInstanceSoftware } from "../../src/discovery/nodeinfo.js";

function detected(name: string | null) {
  return {
    domain: "x.test",
    detection: name ? "success" : "unavailable",
    software: name ? { name, version: "1" } : null,
    protocols: name ? ["activitypub"] : null,
    openRegistrations: null,
  };
}

afterEach(() => vi.clearAllMocks());

describe("resolveLoginStrategy", () => {
  it.each([
    ["misskey", misskeyMiAuthStrategy],
    ["Misskey", misskeyMiAuthStrategy],
    ["foundkey", misskeyMiAuthStrategy],
    ["mastodon", mastodonOAuthStrategy],
    ["pleroma", mastodonOAuthStrategy],
    ["sharkey", mastodonOAuthStrategy],
    ["firefish", mastodonOAuthStrategy],
    ["gotosocial", mastodonOAuthStrategy],
    ["totally-unknown", mastodonOAuthStrategy],
  ])("maps %s to the right strategy", async (name, expected) => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected(name) as never);
    expect(await resolveLoginStrategy("x.test")).toBe(expected);
  });

  it("defaults to Mastodon when detection is unavailable", async () => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected(null) as never);
    expect(await resolveLoginStrategy("x.test")).toBe(mastodonOAuthStrategy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/login-resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/auth/login/resolve.ts`:

```ts
/**
 * Picks the login strategy for an instance from detected software, mirroring
 * adapters/resolve.ts: only Misskey-family software uses MiAuth; everything else
 * (including detection failure / unknown) defaults to Mastodon OAuth2.
 */

import { getInstanceSoftware } from "../../discovery/nodeinfo.js";
import type { LoginStrategy } from "./login-strategy.js";
import { mastodonOAuthStrategy } from "./mastodon-oauth.js";
import { misskeyMiAuthStrategy } from "./miauth.js";

const MISSKEY_FAMILY = new Set(["misskey", "foundkey"]);

export async function resolveLoginStrategy(instance: string): Promise<LoginStrategy> {
  const info = await getInstanceSoftware(instance);
  const name = info.software?.name?.toLowerCase();
  return name && MISSKEY_FAMILY.has(name) ? misskeyMiAuthStrategy : mastodonOAuthStrategy;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/login-resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/auth/login/resolve.ts tests/unit/login-resolve.test.ts
git commit -m "feat(login): resolveLoginStrategy by detected software"
```

---

## Task 12: `runLogin` CLI orchestration

**Files:**
- Create: `src/cli/login.ts`
- Test: `tests/unit/cli-login.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cli-login.test.ts`:

```ts
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

import { resolveLoginStrategy } from "../../src/auth/login/resolve.js";
import { createLoopbackServer } from "../../src/auth/login/loopback-server.js";

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

    const { runLogin } = await import("../../src/cli/login.js");
    await runLogin(["mastodon.test"]);

    const { credentialStore } = await import("../../src/auth/credential-store.js");
    const stored = await credentialStore.getAccount("alice@mastodon.test");
    expect(stored?.accessToken).toBe("tok");
    expect(stored?.instance).toBe("mastodon.test");
  });

  it("rejects an invalid instance domain before opening a browser", async () => {
    const { runLogin } = await import("../../src/cli/login.js");
    await expect(runLogin(["not a domain"])).rejects.toThrow();
    expect(resolveLoginStrategy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/cli-login.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/cli/login.ts`:

```ts
/**
 * `activitypub-mcp login <instance> [--port N] [--id ID] [--label L]`
 *
 * Validates the instance, resolves the platform login strategy, runs the
 * interactive flow against an ephemeral loopback callback, and persists the
 * resulting token. Never logs secrets.
 */

import { credentialStore, type StoredAccount } from "../auth/credential-store.js";
import { openBrowser } from "../auth/login/browser.js";
import { createLoopbackServer } from "../auth/login/loopback-server.js";
import { resolveLoginStrategy } from "../auth/login/resolve.js";
import { MASTODON_SCOPES, MISSKEY_PERMISSIONS } from "../auth/login/scopes.js";
import { instanceBlocklist } from "../policy/instance-blocklist.js";
import { DomainSchema } from "../validation/schemas.js";

interface LoginFlags {
  port?: number;
  id?: string;
  label?: string;
}

function parseFlags(rest: string[]): LoginFlags {
  const flags: LoginFlags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--port") flags.port = Number.parseInt(rest[++i] ?? "", 10);
    else if (arg === "--id") flags.id = rest[++i];
    else if (arg === "--label") flags.label = rest[++i];
  }
  return flags;
}

export async function runLogin(argv: string[]): Promise<void> {
  const [rawInstance, ...rest] = argv;
  if (!rawInstance) throw new Error("Usage: activitypub-mcp login <instance> [--port N] [--id ID] [--label L]");

  const instance = DomainSchema.parse(rawInstance).toLowerCase();
  instanceBlocklist.validateNotBlocked(instance);
  const flags = parseFlags(rest);

  const strategy = await resolveLoginStrategy(instance);
  const scopes = strategy.kind === "misskey" ? [...MISSKEY_PERMISSIONS] : MASTODON_SCOPES.split(" ");

  const loopback = await createLoopbackServer(flags.port ?? 0);
  try {
    const result = await strategy.authorize({
      instance,
      redirectUri: loopback.redirectUri,
      scopes,
      openBrowser: async (url) => {
        try {
          await openBrowser(url);
          process.stdout.write("→ Opening your browser to authorize…\n");
        } catch {
          process.stdout.write(`→ Open this URL to authorize:\n  ${url}\n`);
        }
      },
      waitForCallback: (expected) => loopback.waitForCallback(expected),
    });

    const account: StoredAccount = {
      id: flags.id ?? `${result.username.toLowerCase()}@${instance}`,
      instance: result.instance,
      username: result.username,
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      scopes: result.scopes,
      clientId: result.clientId,
      clientSecret: result.clientSecret,
      label: flags.label,
      createdAt: new Date().toISOString(),
    };
    await credentialStore.upsert(account);
    process.stdout.write(`✓ Authorized as @${account.username}@${account.instance} (id: ${account.id})\n`);
  } finally {
    loopback.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/cli-login.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the secret-hygiene acceptance test (spec requirement)**

Create `tests/unit/secret-hygiene.test.ts` — a full MSW-backed login asserting no token/client-secret/verifier reaches stdout or stderr:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/discovery/nodeinfo.js", () => ({
  getInstanceSoftware: vi.fn().mockResolvedValue({
    domain: "mastodon.test",
    detection: "success",
    software: { name: "mastodon", version: "4.3.0" },
    protocols: ["activitypub"],
    openRegistrations: true,
  }),
}));
vi.mock("../../src/auth/login/loopback-server.js", () => ({
  createLoopbackServer: vi.fn().mockResolvedValue({
    redirectUri: "http://127.0.0.1:7777/callback",
    waitForCallback: vi.fn(async (exp: { state?: string }) => {
      const p = new URLSearchParams();
      p.set("code", "auth-code");
      if (exp.state) p.set("state", exp.state);
      return p;
    }),
    close: vi.fn(),
  }),
}));
vi.mock("../../src/auth/login/browser.js", () => ({
  openBrowser: vi.fn().mockResolvedValue(undefined),
}));

const SECRET_TOKEN = "SECRET-ACCESS-TOKEN-zzz";
const SECRET_CLIENT = "SECRET-CLIENT-SECRET-zzz";

const server = setupServer(
  http.post("https://mastodon.test/api/v1/apps", () =>
    HttpResponse.json({ client_id: "cid", client_secret: SECRET_CLIENT }),
  ),
  http.post("https://mastodon.test/oauth/token", () =>
    HttpResponse.json({ access_token: SECRET_TOKEN, token_type: "Bearer", scope: "read write follow" }),
  ),
  http.get("https://mastodon.test/api/v1/accounts/verify_credentials", () =>
    HttpResponse.json({ id: "1", username: "alice", acct: "alice", url: "https://mastodon.test/@alice" }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("secret hygiene: a full login leaks no secrets to stdout/stderr", () => {
  const originalEnv = process.env;
  let captured: string;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.ACTIVITYPUB_CONFIG_DIR = join(mkdtempSync(join(tmpdir(), "apmcp-hy-")), "cfg");
    captured = "";
    const sink = ((chunk: string | Uint8Array) => {
      captured += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    vi.spyOn(process.stdout, "write").mockImplementation(sink);
    vi.spyOn(process.stderr, "write").mockImplementation(sink);
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("prints the success line but no token / client secret / verifier", async () => {
    const { runLogin } = await import("../../src/cli/login.js");
    await runLogin(["mastodon.test"]);

    expect(captured).toContain("Authorized as @alice@mastodon.test");
    expect(captured).not.toContain(SECRET_TOKEN);
    expect(captured).not.toContain(SECRET_CLIENT);
    expect(captured).not.toContain("code_verifier");
  });
});
```

> This is the spec's acceptance criterion. Logger calls in `login/*`,
> `credential-store`, and `account-manager` pass only `instance`/`username`/`id` —
> never a token — so the LogTape sink (whatever stream it writes to) is also clean.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add src/cli/login.ts tests/unit/cli-login.test.ts tests/unit/secret-hygiene.test.ts
git commit -m "feat(cli): runLogin orchestration + secret-hygiene test"
```

---

## Task 13: `runLogout` + `runAccounts`

**Files:**
- Create: `src/cli/logout.ts`, `src/cli/accounts.ts`
- Test: `tests/unit/cli-accounts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cli-accounts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/cli-accounts.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `logout`**

Create `src/cli/logout.ts`:

```ts
/**
 * `activitypub-mcp logout <id>` — revoke (Mastodon) + remove from the store.
 */

import { credentialStore } from "../auth/credential-store.js";
import { resolveLoginStrategy } from "../auth/login/resolve.js";

export async function runLogout(argv: string[]): Promise<void> {
  const id = argv[0];
  if (!id) throw new Error("Usage: activitypub-mcp logout <id>");

  const account = await credentialStore.getAccount(id);
  if (!account) {
    throw new Error(`No persisted account found with id "${id}". Run \`activitypub-mcp accounts\` to list.`);
  }

  const strategy = await resolveLoginStrategy(account.instance);
  if (strategy.revoke && account.clientId && account.clientSecret) {
    try {
      await strategy.revoke(account);
    } catch {
      process.stdout.write("⚠ Server-side token revoke failed; removing the local record anyway.\n");
    }
  } else if (strategy.kind === "misskey") {
    process.stdout.write(
      "ℹ Misskey has no app-revoke endpoint; removing the local record. " +
        "To fully revoke, delete the app token in your instance's Settings → API.\n",
    );
  }

  await credentialStore.remove(id);
  process.stdout.write(`✓ Logged out @${account.username}@${account.instance} (id: ${id})\n`);
}
```

- [ ] **Step 4: Implement `accounts`**

Create `src/cli/accounts.ts`:

```ts
/**
 * `activitypub-mcp accounts` — list ALL configured accounts (env + persisted),
 * matching the in-conversation `list-accounts` tool so the two surfaces agree.
 * Each row is tagged with its source; no secrets are printed.
 */

import { accountManager } from "../auth/account-manager.js";
import { credentialStore } from "../auth/credential-store.js";

export async function runAccounts(): Promise<void> {
  await accountManager.loadPersisted();
  const persistedIds = new Set((await credentialStore.loadAccounts()).map((a) => a.id));
  const accounts = accountManager.listAccounts();
  if (accounts.length === 0) {
    process.stdout.write("No accounts. Run `activitypub-mcp login <instance>` to sign in.\n");
    return;
  }
  process.stdout.write(`Accounts (${accounts.length}):\n`);
  for (const a of accounts) {
    const source = persistedIds.has(a.id) ? "persisted" : "env";
    const label = a.label ? ` "${a.label}"` : "";
    const active = a.isActive ? " (active)" : "";
    process.stdout.write(
      `  • ${a.id}${label} — @${a.username}@${a.instance} [${a.scopes.join(", ")}] (${source})${active}\n`,
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/unit/cli-accounts.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add src/cli/logout.ts src/cli/accounts.ts tests/unit/cli-accounts.test.ts
git commit -m "feat(cli): logout (revoke + remove) and accounts list"
```

---

## Task 14: CLI dispatch + entry-point wiring

**Files:**
- Create: `src/cli/index.ts`
- Modify: `src/mcp-main.ts`
- Test: `tests/unit/cli-dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cli-dispatch.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/cli/logout.js", () => ({ runLogout: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/cli/accounts.js", () => ({ runAccounts: vi.fn().mockResolvedValue(undefined) }));

import { runAccounts } from "../../src/cli/accounts.js";
import { dispatchCli } from "../../src/cli/index.js";
import { runLogin } from "../../src/cli/login.js";

afterEach(() => vi.clearAllMocks());

describe("dispatchCli", () => {
  it("routes login and reports handled=true", async () => {
    expect(await dispatchCli(["login", "mastodon.test"])).toBe(true);
    expect(runLogin).toHaveBeenCalledWith(["mastodon.test"]);
  });

  it("routes accounts", async () => {
    expect(await dispatchCli(["accounts"])).toBe(true);
    expect(runAccounts).toHaveBeenCalledTimes(1);
  });

  it("returns false for no subcommand (server should start)", async () => {
    expect(await dispatchCli([])).toBe(false);
    expect(await dispatchCli(["--version"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/cli-dispatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dispatcher**

Create `src/cli/index.ts`:

```ts
/**
 * Subcommand router for the activitypub-mcp bin. Returns true if a subcommand
 * was handled (caller must then exit/return instead of starting the server),
 * false if there was no subcommand (start the MCP server as usual).
 */

import { runAccounts } from "./accounts.js";
import { runLogin } from "./login.js";
import { runLogout } from "./logout.js";

const COMMANDS = new Set(["login", "logout", "accounts"]);

export async function dispatchCli(argv: string[]): Promise<boolean> {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS.has(command)) return false;

  switch (command) {
    case "login":
      await runLogin(rest);
      return true;
    case "logout":
      await runLogout(rest);
      return true;
    case "accounts":
      await runAccounts();
      return true;
    default:
      return false;
  }
}
```

- [ ] **Step 4: Wire it into the entry point**

In `src/mcp-main.ts`, add the import and dispatch at the very top of `main()`, before `validateConfiguration()`:

```ts
import { dispatchCli } from "./cli/index.js";
```

```ts
async function main() {
  // Subcommands (login/logout/accounts) run instead of the server.
  try {
    if (await dispatchCli(process.argv.slice(2))) {
      return;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Parse remaining CLI flags (-h/-v) for the server path.
  parseArgs();

  try {
    validateConfiguration();
    const server = new ActivityPubMCPServer();
    await server.start();
  } catch (error) {
    logger.error("Failed to start ActivityPub MCP Server", { error });
    process.exit(1);
  }
}
```

(Leave `parseArgs()`/`printHelp()`/`printVersion()` as-is; `dispatchCli` returns false for flags/no-args so the server path is preserved.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/unit/cli-dispatch.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint
git add src/cli/index.ts src/mcp-main.ts tests/unit/cli-dispatch.test.ts
git commit -m "feat(cli): subcommand dispatch wired into the bin entry point"
```

---

## Task 15: `TokenRejectedError` + re-auth seam + guard hints

**Files:**
- Modify: `src/utils/errors.ts`
- Modify: `src/auth/adapters/write-adapter.ts`
- Modify: `src/mcp/tools-write.ts`
- Test: `tests/unit/utils.test.ts` (append), `tests/unit/authenticated-client.test.ts` (append)

- [ ] **Step 1: Write the failing test for the error class**

Append to `tests/unit/utils.test.ts`:

```ts
import { TokenRejectedError } from "../../src/utils/errors.js";

describe("TokenRejectedError", () => {
  it("formats a re-auth message with instance + username", () => {
    const err = new TokenRejectedError("mastodon.social", "alice");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TokenRejectedError");
    expect(err.instance).toBe("mastodon.social");
    expect(err.message).toContain("@alice@mastodon.social");
    expect(err.message).toContain("activitypub-mcp login mastodon.social");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/unit/utils.test.ts -t "TokenRejectedError"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement the error class**

Append to `src/utils/errors.ts`:

```ts
/**
 * Thrown when an authenticated request is rejected with HTTP 401 — the token was
 * revoked or expired. (403 is NOT treated as token rejection: it is also used for
 * per-operation permission/scope errors that adapters must surface verbatim, e.g.
 * Misskey's `{error:{message}}` body.) Carries the account identity so the message
 * can point the user at the exact re-login command.
 */
export class TokenRejectedError extends Error {
  constructor(
    public readonly instance: string,
    public readonly username: string,
  ) {
    super(
      `The token for @${username}@${instance} was rejected (revoked or expired). ` +
        `Run \`activitypub-mcp login ${instance}\` to re-authorize.`,
    );
    this.name = "TokenRejectedError";
  }
}
```

- [ ] **Step 4: Write the failing test for the fetch seam**

Append to `tests/unit/authenticated-client.test.ts` (this file already mocks `validation/url.js` and `discovery/nodeinfo.js` per SP1):

```ts
import { authenticatedFetch } from "../../src/auth/adapters/write-adapter.js";
import { TokenRejectedError } from "../../src/utils/errors.js";

describe("authenticatedFetch token rejection", () => {
  const account = {
    id: "a",
    instance: "example.social",
    username: "alice",
    accessToken: "tok",
    tokenType: "Bearer",
    scopes: ["read", "write"],
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("throws TokenRejectedError on HTTP 401", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(authenticatedFetch(account, "/api/v1/accounts/verify_credentials")).rejects.toBeInstanceOf(
      TokenRejectedError,
    );
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npm run test -- tests/unit/authenticated-client.test.ts -t "token rejection"`
Expected: FAIL — `authenticatedFetch` returns the 401 response instead of throwing.

- [ ] **Step 6: Implement the seam**

In `src/auth/adapters/write-adapter.ts`, import the error:

```ts
import { TokenRejectedError } from "../../utils/errors.js";
```

In `authenticatedFetch`, after the response is received (just before `return response;` at the end of the success path), add:

```ts
    if (response.status === 401) {
      throw new TokenRejectedError(account.instance, account.username);
    }
```

Make sure this is inside the `try` after `clearTimeout(timeoutId);` and before `return response;`, so the timeout is always cleared. **Only 401** is caught — 403 must keep flowing back as a `Response` so adapters can extract platform error bodies (SP1's `tests/unit/misskey-adapter.test.ts` "extracts Misskey error messages" returns HTTP 403 `{error:{message:"Permission denied"}}` and asserts that message; throwing on 403 would break it). The thrown `TokenRejectedError` passes through the existing `catch (error)` unchanged — its `name` is not `"AbortError"`, so it is re-thrown to the tool catch blocks where `getErrorMessage()`/`formatErrorWithSuggestion()` render its message. (The existing adapter methods that check `!response.ok` for other statuses are unaffected.)

- [ ] **Step 7: Add the "no account" login hint to the guards**

In `src/mcp/tools-write.ts`, update the two guard messages to mention `login`:

```ts
function requireWriteEnabled(): void {
  if (!authenticatedClient.isWriteEnabled()) {
    throw new McpError(
      ErrorCode.InternalError,
      "This write operation requires authentication. Run `activitypub-mcp login <instance>` to sign in, " +
        "or set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables.",
    );
  }
}
```

```ts
function requireAuthEnabled(): void {
  if (!authenticatedClient.isWriteEnabled()) {
    throw new McpError(
      ErrorCode.InternalError,
      "This tool requires an authenticated account. Run `activitypub-mcp login <instance>` to sign in, " +
        "or set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables.",
    );
  }
}
```

Also wire the **second** re-auth hook the spec requires: the `verify-account` tool's
"invalid or expired" message (the `if (!info)` branch, around line 305 in
`tools-write.ts`). Change its closing line so a rejected token points at `login`:

```ts
Account credentials for \`${targetId}\` (@${account.username}@${account.instance}) are invalid or expired.

Run \`activitypub-mcp login ${account.instance}\` to re-authorize.
```

(Replace the existing "Please update your access token." line; keep the surrounding
`return { content: [...], isError: true }` structure intact.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test -- tests/unit/utils.test.ts tests/unit/authenticated-client.test.ts tests/unit/misskey-adapter.test.ts`
Expected: PASS — new specs plus the existing SP1 specs. Because only **401** throws (not 403), the Misskey adapter's 403 body-extraction test ("extracts Misskey error messages") still gets a `Response` and passes unchanged.

- [ ] **Step 9: Full suite + typecheck + lint**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS across the tree. (`TokenRejectedError` messages flow through the existing `formatErrorWithSuggestion(getErrorMessage(error))` in the ~28 write-tool catch blocks unchanged — `getErrorMessage` returns the error's `message`.)

- [ ] **Step 10: Commit**

```bash
git add src/utils/errors.ts src/auth/adapters/write-adapter.ts src/mcp/tools-write.ts tests/unit/utils.test.ts tests/unit/authenticated-client.test.ts
git commit -m "feat(auth): TokenRejectedError on 401/403 + login hints in write guards"
```

---

## Task 16: Documentation

**Files:**
- Modify: `README.md`, `.env.example`, `.env.production.example`, `CHANGELOG.md`

- [ ] **Step 1: README — login section**

In `README.md`, under the authentication/multi-platform section, add:

```md
### Signing in (OAuth / MiAuth)

Acquire and persist an access token without hand-copying it:

```bash
# Mastodon-family (Mastodon, Pleroma, Akkoma, GotoSocial, Sharkey, Firefish)
activitypub-mcp login mastodon.social

# Misskey / Foundkey (uses MiAuth)
activitypub-mcp login misskey.io
```

This opens your browser to authorize, captures the response on a temporary
`127.0.0.1` callback, and saves the token to
`${XDG_CONFIG_HOME:-~/.config}/activitypub-mcp/accounts.json` (file mode `0600`).
The MCP server loads persisted accounts at startup alongside any env-var accounts.

- `activitypub-mcp accounts` — list signed-in accounts (no secrets shown).
- `activitypub-mcp logout <id>` — revoke (Mastodon) and remove the account.

**Notes & limitations**
- Tokens are stored in plaintext, protected by file permissions (like `gh`/`npm`).
  For stronger at-rest protection, use the env-var path with a secret manager.
- Interactive login needs a local browser + reachable loopback. Headless/CI
  deployments keep using `ACTIVITYPUB_DEFAULT_INSTANCE` / `ACTIVITYPUB_DEFAULT_TOKEN`.
- IDs are platform-scoped — a token works only against the instance it was issued for.
- Misskey has no app-revoke endpoint; `logout` removes the local record (revoke the
  token in your instance's Settings → API to fully invalidate it).
- Foundkey is migrating off MiAuth; login may fail on builds that have removed it.
```

- [ ] **Step 2: `.env.example` + `.env.production.example`**

Add to both, near the authentication section:

```ini
# Directory for the persisted credential store (accounts.json) created by
# `activitypub-mcp login`. Default: ${XDG_CONFIG_HOME:-~/.config}/activitypub-mcp
# ACTIVITYPUB_CONFIG_DIR=/path/to/config
```

- [ ] **Step 3: CHANGELOG**

Add an `### Added` entry under a new `## [Unreleased]` heading:

```md
## [Unreleased]

### Added

- **Browser-based login.** New `activitypub-mcp login <instance>` acquires an
  access token via Mastodon OAuth2 (PKCE) or Misskey/Foundkey MiAuth — routed by
  NodeInfo software detection — using an ephemeral `127.0.0.1` loopback callback,
  and persists it to `${XDG_CONFIG_HOME:-~/.config}/activitypub-mcp/accounts.json`
  (mode `0600`). The server loads persisted accounts at startup alongside env-var
  accounts. Adds `activitypub-mcp logout <id>` and `activitypub-mcp accounts`.
- **`ACTIVITYPUB_CONFIG_DIR`** to override the credential-store location.
- **Clearer auth errors.** A rejected token (401/403) now returns a
  `TokenRejectedError` telling you to run `activitypub-mcp login <instance>`.
```

- [ ] **Step 4: Verify docs build / links**

Run: `npm run build`
Expected: PASS (no code changed; this confirms the tree still compiles).

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example .env.production.example CHANGELOG.md
git commit -m "docs: document login/logout/accounts, credential storage, and limitations"
```

---

## Final verification

- [ ] **Run the entire suite, typecheck, lint, build, version check**

```bash
npm run validate:version && npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all PASS. Investigate any regression before considering the plan complete
(most likely a moved/renamed import — search for the symbol and fix the path).

- [ ] **Manual smoke (optional, needs a real account)**

```bash
node dist/mcp-main.js login <your-instance>
node dist/mcp-main.js accounts
node dist/mcp-main.js logout <id>
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- CLI + ephemeral loopback → Tasks 6, 12, 14. ✓
- node:fs 0600 store + CONFIG_DIR + hardening → Tasks 1, 2. ✓
- Both platforms via strategy interface (OAuth2 + MiAuth) → Tasks 8–11. ✓
- guarded UNauthenticated fetch (not authenticatedFetch) + nodeinfo refactor → Task 5. ✓
- AccountManager.loadPersisted (env-wins, guarded) + startup await → Tasks 3, 4. ✓
- Re-auth seam at the 401-observing fetch + "no account" guard hints → Task 15. ✓
- logout/revoke, accounts list, list/switch integration (via loadPersisted) → Tasks 13, 3. ✓
- Trimmed Misskey perms + Mastodon scope constant → Task 8. ✓
- Browser argv-array spawn → Task 7. ✓
- Config registration + docs/limitations → Tasks 1, 16. ✓
- Build sequence honored (store → manager → fetch → mechanics → strategies → CLI → re-auth → docs). ✓

**Type consistency:** `StoredAccount` (Task 1) is the single shape used by the store,
`loadPersisted` (Task 3), strategies' `revoke` (Tasks 8–10), and the CLI (Tasks 12–13).
`LoginResult`/`AuthorizeContext`/`LoginStrategy` (Task 8) match the strategy
implementations (Tasks 9–10) and `resolveLoginStrategy` return type (Task 11).
`guardedFetch`/`GuardedResponse` (Task 5) signatures match every call site
(Tasks 9–10). `createLoopbackServer`→`LoopbackServer` (Task 6) matches the
`AuthorizeContext.waitForCallback` shape consumed by strategies and produced by the CLI.

**Placeholder scan:** none — every step contains complete code or an exact command.
