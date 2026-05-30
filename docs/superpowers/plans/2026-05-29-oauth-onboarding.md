# OAuth / MiAuth Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an LLM walk a user through connecting a Mastodon (OAuth) or Misskey (MiAuth) account end-to-end via out-of-band code paste, persisting acquired credentials to a 0600 file so they survive restarts.

**Architecture:** Per-platform `LoginProvider` implementations behind a `login-manager` that holds ephemeral pending-login state and orchestrates token acquisition → verification → persistence. A standalone `token-store` persists accounts; `account-manager` loads them at startup. Two MCP tools (`start-login`, `complete-login`) drive the flow.

**Tech Stack:** TypeScript (ESM), Zod v4, Vitest + MSW, LogTape, Node `fs`/`os`/`path`, global `crypto.randomUUID`.

**Spec:** `docs/superpowers/specs/2026-05-29-oauth-onboarding-design.md`. Builds on SP1 (`resolveSoftwareKind`, `resolveWriteAdapter().verifyCredentials`).

**Conventions:** commands from repo root; single file: `npm run test -- tests/unit/<file>.test.ts`; `npm run typecheck`; `npm run lint:fix`. `.js` import extensions even for `.ts`. Never log or return tokens.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/config.ts` (modify) | Add `TOKEN_STORE_PATH`, `OAUTH_APP_NAME`, `OAUTH_APP_WEBSITE`. |
| `src/auth/token-store.ts` (create) | Load/save/remove acquired accounts in a 0600 JSON file. |
| `src/auth/account-manager.ts` (modify) | Load store accounts at startup (env wins); `addAndPersistAccount`. |
| `src/auth/login/login-provider.ts` (create) | `LoginProvider` interface, `PendingLoginData` union, `LoginResult`, shared `oauthJsonRequest`. |
| `src/auth/login/mastodon-oauth.ts` (create) | `MastodonOAuthProvider`. |
| `src/auth/login/misskey-miauth.ts` (create) | `MisskeyMiAuthProvider`. |
| `src/auth/login/login-manager.ts` (create) | `beginLogin`/`completeLogin`, pending state + expiry. |
| `src/mcp/tools-auth.ts` (create) | `start-login` + `complete-login` tools + `registerAuthTools`. |
| `src/mcp/tools.ts` (modify) | Call `registerAuthTools`. |
| `README.md`, `CHANGELOG.md`, `.env.example` (modify) | Document onboarding + token store. |

---

## Task 1: Config additions

**Files:**
- Modify: `src/config.ts`
- Test: `tests/unit/config.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/unit/config.test.ts`:

```ts
describe("OAuth onboarding config", () => {
  const orig = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...orig };
  });
  afterEach(() => {
    process.env = orig;
  });

  it("defaults the token store path under the home config dir", async () => {
    delete process.env.MCP_TOKEN_STORE;
    const { TOKEN_STORE_PATH } = await import("../../src/config.js");
    expect(TOKEN_STORE_PATH).toMatch(/activitypub-mcp[/\\]accounts\.json$/);
  });

  it("honors MCP_TOKEN_STORE override and app-name default", async () => {
    process.env.MCP_TOKEN_STORE = "/tmp/custom-accounts.json";
    delete process.env.MCP_OAUTH_APP_NAME;
    const { TOKEN_STORE_PATH, OAUTH_APP_NAME } = await import("../../src/config.js");
    expect(TOKEN_STORE_PATH).toBe("/tmp/custom-accounts.json");
    expect(OAUTH_APP_NAME).toBe("activitypub-mcp");
  });
});
```

Add `import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";` if the file doesn't already import these (check the top of the file; most config tests already import `describe/it/expect`).

- [ ] **Step 2: Run** `npm run test -- tests/unit/config.test.ts -t "OAuth onboarding config"` → FAIL (undefined exports).

- [ ] **Step 3: Implement** — at the top of `src/config.ts`, add Node imports after the file's opening comment block (before the helper functions):

```ts
import { homedir } from "node:os";
import { join } from "node:path";
```

Then add a new section (place near the authentication-related config, e.g. after the dynamic-instance block):

```ts
// =============================================================================
// OAuth / MiAuth Onboarding
// =============================================================================

/** Path to the persisted acquired-accounts store (0600). */
export const TOKEN_STORE_PATH =
  process.env.MCP_TOKEN_STORE || join(homedir(), ".config", "activitypub-mcp", "accounts.json");

/** App name used for Mastodon app registration / MiAuth. */
export const OAUTH_APP_NAME = process.env.MCP_OAUTH_APP_NAME || "activitypub-mcp";

/** Optional website advertised during Mastodon app registration. */
export const OAUTH_APP_WEBSITE =
  process.env.MCP_OAUTH_APP_WEBSITE || "https://github.com/cameronrye/activitypub-mcp";
```

- [ ] **Step 4: Run** `npm run test -- tests/unit/config.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts
git commit -m "feat: add OAuth onboarding + token store config"
```

---

## Task 2: Token store

**Files:**
- Create: `src/auth/token-store.ts`
- Test: `tests/unit/token-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
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
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(storePath, "{ not json");
    expect(await store.loadAll()).toEqual([]);
  });

  it("skips entries that fail schema validation", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(storePath, JSON.stringify([account, { id: "bad" }]));
    const store = await import("../../src/auth/token-store.js");
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(account.id);
  });
});

// Reference: file content is JSON array; verify shape directly.
it("persists a JSON array", async () => {
  const store = await import("../../src/auth/token-store.js");
  await store.save(account);
  const raw = JSON.parse(readFileSync(storePath, "utf8"));
  expect(Array.isArray(raw)).toBe(true);
});
```

- [ ] **Step 2: Run** `npm run test -- tests/unit/token-store.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/auth/token-store.ts`:

```ts
/**
 * Persistence for OAuth/MiAuth-acquired accounts.
 *
 * Writes a JSON array of account credentials to a 0600 file (default under the
 * user's config dir, overridable via MCP_TOKEN_STORE). Loaded at startup by the
 * account manager alongside env-configured accounts. Never throws on read —
 * a missing/corrupt file yields an empty list so the server always starts.
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { TOKEN_STORE_PATH } from "../config.js";
import type { AccountCredentials } from "./account-manager.js";

const logger = getLogger("activitypub-mcp:token-store");

// Own schema (not imported from account-manager) to avoid an import cycle:
// account-manager imports this module at runtime.
const PersistedAccountSchema = z.object({
  id: z.string(),
  instance: z.string(),
  username: z.string(),
  accessToken: z.string(),
  tokenType: z.string().default("Bearer"),
  scopes: z.array(z.string()).default(["read", "write", "follow"]),
  createdAt: z.string(),
  label: z.string().optional(),
});

async function readAll(): Promise<AccountCredentials[]> {
  let raw: string;
  try {
    raw = await readFile(TOKEN_STORE_PATH, "utf8");
  } catch {
    return []; // missing file is normal
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn("Token store is not valid JSON; ignoring", { path: TOKEN_STORE_PATH });
    return [];
  }
  if (!Array.isArray(parsed)) {
    logger.warn("Token store is not a JSON array; ignoring", { path: TOKEN_STORE_PATH });
    return [];
  }
  const valid: AccountCredentials[] = [];
  for (const entry of parsed) {
    const result = PersistedAccountSchema.safeParse(entry);
    if (result.success) valid.push(result.data);
    else logger.warn("Skipping invalid token-store entry");
  }
  return valid;
}

async function writeAll(accounts: AccountCredentials[]): Promise<void> {
  await mkdir(dirname(TOKEN_STORE_PATH), { recursive: true, mode: 0o700 });
  await writeFile(TOKEN_STORE_PATH, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  // Ensure perms even if the file pre-existed with a looser mode.
  await chmod(TOKEN_STORE_PATH, 0o600);
}

export async function loadAll(): Promise<AccountCredentials[]> {
  return readAll();
}

export async function save(account: AccountCredentials): Promise<void> {
  const accounts = await readAll();
  const idx = accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) accounts[idx] = account;
  else accounts.push(account);
  await writeAll(accounts);
  logger.info("Persisted account to token store", { id: account.id, instance: account.instance });
}

export async function remove(id: string): Promise<void> {
  const accounts = await readAll();
  const next = accounts.filter((a) => a.id !== id);
  if (next.length !== accounts.length) await writeAll(next);
}
```

- [ ] **Step 4: Run** `npm run test -- tests/unit/token-store.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/token-store.ts tests/unit/token-store.test.ts
git commit -m "feat: add 0600 token store for acquired accounts"
```

---

## Task 3: Account manager integration

**Files:**
- Modify: `src/auth/account-manager.ts`
- Test: `tests/unit/account-manager.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append:

```ts
describe("token-store integration", () => {
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
    vi.doUnmock("../../src/auth/token-store.js");
  });

  it("loads persisted accounts at construction", async () => {
    vi.doMock("../../src/auth/token-store.js", () => ({
      loadAll: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    }));
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const mgr = new AccountManager();
    await mgr.ready();
    expect(mgr.accountCount).toBe(0);
  });

  it("env accounts win over store accounts with the same id", async () => {
    process.env.ACTIVITYPUB_DEFAULT_INSTANCE = "mastodon.social";
    process.env.ACTIVITYPUB_DEFAULT_TOKEN = "env-token";
    vi.doMock("../../src/auth/token-store.js", () => ({
      loadAll: vi.fn().mockResolvedValue([
        {
          id: "default",
          instance: "evil.example",
          username: "x",
          accessToken: "store-token",
          tokenType: "Bearer",
          scopes: ["read"],
          createdAt: "2026-05-29T00:00:00.000Z",
        },
      ]),
      save: vi.fn(),
      remove: vi.fn(),
    }));
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const mgr = new AccountManager();
    await mgr.ready();
    expect(mgr.getAccount("default")?.instance).toBe("mastodon.social");
    expect(mgr.getAccount("default")?.accessToken).toBe("env-token");
  });

  it("addAndPersistAccount adds and calls token-store.save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/auth/token-store.js", () => ({
      loadAll: vi.fn().mockResolvedValue([]),
      save,
      remove: vi.fn(),
    }));
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const mgr = new AccountManager();
    await mgr.ready();
    await mgr.addAndPersistAccount({
      id: "mastodon:fosstodon.org:alice",
      instance: "fosstodon.org",
      username: "alice",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: ["read", "write"],
    });
    expect(mgr.getAccount("mastodon:fosstodon.org:alice")).toBeDefined();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mastodon:fosstodon.org:alice", accessToken: "tok" }),
    );
  });
});
```

- [ ] **Step 2: Run** `npm run test -- tests/unit/account-manager.test.ts -t "token-store integration"` → FAIL (`ready`/`addAndPersistAccount` undefined).

- [ ] **Step 3: Implement** — in `src/auth/account-manager.ts`:

Add import near the other auth imports:

```ts
import * as tokenStore from "./token-store.js";
```

Add a private field and kick off async load in the constructor. Replace the constructor:

```ts
  private accounts: Map<string, AccountCredentials> = new Map();
  private activeAccountId: string | null = null;
  private readyPromise: Promise<void>;

  constructor() {
    // Synchronous env load keeps existing behavior; store load is async.
    this.loadFromEnvironment();
    this.readyPromise = this.loadFromTokenStore();
  }

  /** Resolves once persisted accounts have finished loading. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /** Load persisted accounts, skipping ids already present from env (env wins). */
  private async loadFromTokenStore(): Promise<void> {
    try {
      const persisted = await tokenStore.loadAll();
      for (const account of persisted) {
        if (this.accounts.has(account.id)) {
          logger.debug("Skipping persisted account (id already loaded from env)", {
            id: account.id,
          });
          continue;
        }
        this.accounts.set(account.id, account);
        if (!this.activeAccountId) this.activeAccountId = account.id;
      }
    } catch (error) {
      logger.warn("Failed to load persisted accounts", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Add an account and persist it to the token store. */
  async addAndPersistAccount(
    credentials: Omit<AccountCredentials, "createdAt">,
  ): Promise<AccountCredentials> {
    const account = this.addAccount(credentials);
    await tokenStore.save(account);
    return account;
  }
```

> Note: the singleton `accountManager` constructs synchronously (env accounts
> available immediately); persisted accounts become available once
> `accountManager.ready()` resolves. The MCP server should `await
> accountManager.ready()` during startup — see Task 8 wiring note.

- [ ] **Step 4: Run** `npm run test -- tests/unit/account-manager.test.ts` → PASS (all, including existing).

- [ ] **Step 5: Typecheck** `npm run typecheck` → PASS. (No cycle: `token-store` imports only `type AccountCredentials` from `account-manager`, erased at runtime.)

- [ ] **Step 6: Commit**

```bash
git add src/auth/account-manager.ts tests/unit/account-manager.test.ts
git commit -m "feat: load persisted accounts at startup; addAndPersistAccount"
```

---

## Task 4: Login provider interface + shared request helper

**Files:**
- Create: `src/auth/login/login-provider.ts`

- [ ] **Step 1: Create the file**

```ts
/**
 * Shared contracts for account-onboarding login providers and a guarded
 * no-auth JSON request helper (app registration / token exchange / MiAuth
 * check all happen before any token exists).
 */

import { MAX_RESPONSE_SIZE, USER_AGENT } from "../../config.js";
import { instanceBlocklist } from "../../policy/instance-blocklist.js";
import { fetchWithRedirectGuard, readJsonWithLimit } from "../../utils/fetch-helpers.js";
import { validateExternalUrl } from "../../validation/url.js";

export interface LoginResult {
  accessToken: string;
  tokenType: string;
}

export type MastodonPending = {
  kind: "mastodon";
  instance: string;
  clientId: string;
  clientSecret: string;
};
export type MisskeyPending = { kind: "misskey"; instance: string; uuid: string };
export type PendingLoginData = MastodonPending | MisskeyPending;

export interface LoginProvider {
  /** Register/initiate; return the URL the user must open + provider state. */
  begin(instance: string): Promise<{ authorizeUrl: string; pending: PendingLoginData }>;
  /** Finish. Mastodon requires the pasted code; Misskey ignores it. */
  complete(pending: PendingLoginData, code?: string): Promise<LoginResult>;
}

/** Normalize user-supplied instance input to a bare lowercased hostname. */
export function normalizeInstance(input: string): string {
  let s = input.trim().replace(/^https?:\/\//i, "");
  s = s.replace(/\/.*$/, ""); // strip path
  return s.toLowerCase();
}

/**
 * Guarded JSON request used during onboarding (no Authorization header).
 * Applies https-only SSRF allow-list, operator blocklist, redirect
 * re-validation and the response-size cap.
 */
export async function oauthJsonRequest<T = unknown>(
  url: string,
  init: RequestInit,
  failVerb: string,
): Promise<T> {
  await validateExternalUrl(url);
  instanceBlocklist.validateNotBlocked(new URL(url).hostname);
  const response = await fetchWithRedirectGuard(
    url,
    {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        ...init.headers,
      },
    },
    async (target) => {
      await validateExternalUrl(target);
      instanceBlocklist.validateNotBlocked(new URL(target).hostname);
    },
  );
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await readJsonWithLimit<{ error?: string; error_description?: string }>(
        response,
        MAX_RESPONSE_SIZE,
      );
      if (body?.error_description) detail = body.error_description;
      else if (body?.error) detail = body.error;
    } catch {
      // keep status
    }
    throw new Error(`Failed to ${failVerb}: ${detail}`);
  }
  return readJsonWithLimit<T>(response, MAX_RESPONSE_SIZE);
}
```

- [ ] **Step 2: Typecheck** `npm run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/auth/login/login-provider.ts
git commit -m "feat: add LoginProvider interface + guarded onboarding request helper"
```

---

## Task 5: Mastodon OAuth provider

**Files:**
- Create: `src/auth/login/mastodon-oauth.ts`
- Test: `tests/unit/mastodon-oauth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MastodonOAuthProvider } from "../../src/auth/login/mastodon-oauth.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const provider = new MastodonOAuthProvider();

describe("MastodonOAuthProvider.begin", () => {
  it("registers an app and returns an OOB authorize URL", async () => {
    let appBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://mastodon.social/api/v1/apps", async ({ request }) => {
        appBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ client_id: "cid", client_secret: "csecret" });
      }),
    );
    const { authorizeUrl, pending } = await provider.begin("mastodon.social");
    expect(appBody?.redirect_uris).toBe("urn:ietf:wg:oauth:2.0:oob");
    expect(pending).toMatchObject({ kind: "mastodon", clientId: "cid", clientSecret: "csecret" });
    const u = new URL(authorizeUrl);
    expect(u.origin).toBe("https://mastodon.social");
    expect(u.pathname).toBe("/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe("urn:ietf:wg:oauth:2.0:oob");
  });
});

describe("MastodonOAuthProvider.complete", () => {
  const pending = {
    kind: "mastodon" as const,
    instance: "mastodon.social",
    clientId: "cid",
    clientSecret: "csecret",
  };

  it("exchanges the code for a token", async () => {
    let tokenBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://mastodon.social/oauth/token", async ({ request }) => {
        tokenBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ access_token: "at", token_type: "Bearer" });
      }),
    );
    const result = await provider.complete(pending, "the-code");
    expect(tokenBody?.grant_type).toBe("authorization_code");
    expect(tokenBody?.code).toBe("the-code");
    expect(result).toEqual({ accessToken: "at", tokenType: "Bearer" });
  });

  it("throws when code is missing", async () => {
    await expect(provider.complete(pending)).rejects.toThrow(/code/i);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- tests/unit/mastodon-oauth.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/auth/login/mastodon-oauth.ts`:

```ts
import { OAUTH_APP_NAME, OAUTH_APP_WEBSITE } from "../../config.js";
import {
  type LoginProvider,
  type LoginResult,
  type PendingLoginData,
  normalizeInstance,
  oauthJsonRequest,
} from "./login-provider.js";

const OOB = "urn:ietf:wg:oauth:2.0:oob";
const SCOPES = "read write follow";

export class MastodonOAuthProvider implements LoginProvider {
  async begin(instance: string): Promise<{ authorizeUrl: string; pending: PendingLoginData }> {
    const host = normalizeInstance(instance);
    const app = await oauthJsonRequest<{ client_id: string; client_secret: string }>(
      `https://${host}/api/v1/apps`,
      {
        method: "POST",
        body: JSON.stringify({
          client_name: OAUTH_APP_NAME,
          redirect_uris: OOB,
          scopes: SCOPES,
          website: OAUTH_APP_WEBSITE,
        }),
      },
      "register application",
    );
    const authorize = new URL(`https://${host}/oauth/authorize`);
    authorize.searchParams.set("client_id", app.client_id);
    authorize.searchParams.set("scope", SCOPES);
    authorize.searchParams.set("redirect_uri", OOB);
    authorize.searchParams.set("response_type", "code");
    return {
      authorizeUrl: authorize.toString(),
      pending: {
        kind: "mastodon",
        instance: host,
        clientId: app.client_id,
        clientSecret: app.client_secret,
      },
    };
  }

  async complete(pending: PendingLoginData, code?: string): Promise<LoginResult> {
    if (pending.kind !== "mastodon") throw new Error("Mismatched provider for pending login");
    if (!code) throw new Error("An authorization code is required to complete Mastodon login");
    const token = await oauthJsonRequest<{ access_token: string; token_type?: string }>(
      `https://${pending.instance}/oauth/token`,
      {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: pending.clientId,
          client_secret: pending.clientSecret,
          redirect_uri: OOB,
          code,
          scope: SCOPES,
        }),
      },
      "exchange authorization code",
    );
    return { accessToken: token.access_token, tokenType: token.token_type || "Bearer" };
  }
}

export const mastodonOAuthProvider = new MastodonOAuthProvider();
```

- [ ] **Step 4: Run** `npm run test -- tests/unit/mastodon-oauth.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/login/mastodon-oauth.ts tests/unit/mastodon-oauth.test.ts
git commit -m "feat: add Mastodon OAuth login provider (OOB)"
```

---

## Task 6: Misskey MiAuth provider

**Files:**
- Create: `src/auth/login/misskey-miauth.ts`
- Test: `tests/unit/misskey-miauth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MisskeyMiAuthProvider } from "../../src/auth/login/misskey-miauth.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const provider = new MisskeyMiAuthProvider();

describe("MisskeyMiAuthProvider.begin", () => {
  it("builds a /miauth/<uuid> URL with permissions", async () => {
    const { authorizeUrl, pending } = await provider.begin("misskey.io");
    expect(pending.kind).toBe("misskey");
    const u = new URL(authorizeUrl);
    expect(u.origin).toBe("https://misskey.io");
    expect(u.pathname).toBe(`/miauth/${(pending as { uuid: string }).uuid}`);
    expect(u.searchParams.get("permission")).toContain("write:notes");
  });
});

describe("MisskeyMiAuthProvider.complete", () => {
  const pending = { kind: "misskey" as const, instance: "misskey.io", uuid: "abc-uuid" };

  it("checks the session and returns the token", async () => {
    server.use(
      http.post("https://misskey.io/api/miauth/abc-uuid/check", () =>
        HttpResponse.json({ ok: true, token: "mk-token" }),
      ),
    );
    const result = await provider.complete(pending);
    expect(result).toEqual({ accessToken: "mk-token", tokenType: "Bearer" });
  });

  it("throws when the session is not approved", async () => {
    server.use(
      http.post("https://misskey.io/api/miauth/abc-uuid/check", () =>
        HttpResponse.json({ ok: false }),
      ),
    );
    await expect(provider.complete(pending)).rejects.toThrow(/not approved|ok/i);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- tests/unit/misskey-miauth.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/auth/login/misskey-miauth.ts`:

```ts
import { OAUTH_APP_NAME } from "../../config.js";
import {
  type LoginProvider,
  type LoginResult,
  type PendingLoginData,
  normalizeInstance,
  oauthJsonRequest,
} from "./login-provider.js";

const PERMISSIONS = [
  "read:account",
  "write:notes",
  "write:following",
  "write:reactions",
  "write:blocks",
  "write:mutes",
  "write:drive",
].join(",");

export class MisskeyMiAuthProvider implements LoginProvider {
  async begin(instance: string): Promise<{ authorizeUrl: string; pending: PendingLoginData }> {
    const host = normalizeInstance(instance);
    const uuid = crypto.randomUUID();
    const url = new URL(`https://${host}/miauth/${uuid}`);
    url.searchParams.set("name", OAUTH_APP_NAME);
    url.searchParams.set("permission", PERMISSIONS);
    return { authorizeUrl: url.toString(), pending: { kind: "misskey", instance: host, uuid } };
  }

  async complete(pending: PendingLoginData, _code?: string): Promise<LoginResult> {
    if (pending.kind !== "misskey") throw new Error("Mismatched provider for pending login");
    const result = await oauthJsonRequest<{ ok: boolean; token?: string }>(
      `https://${pending.instance}/api/miauth/${pending.uuid}/check`,
      { method: "POST", body: "{}" },
      "check MiAuth session",
    );
    if (!result.ok || !result.token) {
      throw new Error("MiAuth session not approved yet — approve in your browser, then retry");
    }
    return { accessToken: result.token, tokenType: "Bearer" };
  }
}

export const misskeyMiAuthProvider = new MisskeyMiAuthProvider();
```

- [ ] **Step 4: Run** `npm run test -- tests/unit/misskey-miauth.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/login/misskey-miauth.ts tests/unit/misskey-miauth.test.ts
git commit -m "feat: add Misskey MiAuth login provider"
```

---

## Task 7: Login manager

**Files:**
- Create: `src/auth/login/login-manager.ts`
- Test: `tests/unit/login-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/adapters/resolve.js", () => ({
  resolveSoftwareKind: vi.fn(),
  resolveWriteAdapter: vi.fn(),
}));
vi.mock("../../src/auth/login/mastodon-oauth.js", () => ({
  mastodonOAuthProvider: { begin: vi.fn(), complete: vi.fn() },
}));
vi.mock("../../src/auth/login/misskey-miauth.js", () => ({
  misskeyMiAuthProvider: { begin: vi.fn(), complete: vi.fn() },
}));
vi.mock("../../src/auth/account-manager.js", () => ({
  accountManager: { addAndPersistAccount: vi.fn() },
}));

import { resolveSoftwareKind, resolveWriteAdapter } from "../../src/auth/adapters/resolve.js";
import { accountManager } from "../../src/auth/account-manager.js";
import { beginLogin, completeLogin, __clearPending } from "../../src/auth/login/login-manager.js";
import { mastodonOAuthProvider } from "../../src/auth/login/mastodon-oauth.js";

beforeEach(() => {
  __clearPending();
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("beginLogin", () => {
  it("selects the Mastodon provider and returns a loginId + URL", async () => {
    vi.mocked(resolveSoftwareKind).mockResolvedValue("mastodon");
    vi.mocked(mastodonOAuthProvider.begin).mockResolvedValue({
      authorizeUrl: "https://m.test/oauth/authorize?x=1",
      pending: { kind: "mastodon", instance: "m.test", clientId: "c", clientSecret: "s" },
    });
    const res = await beginLogin("m.test");
    expect(res.kind).toBe("mastodon");
    expect(res.authorizeUrl).toContain("/oauth/authorize");
    expect(typeof res.loginId).toBe("string");
  });
});

describe("completeLogin", () => {
  it("completes, verifies, and persists the account", async () => {
    vi.mocked(resolveSoftwareKind).mockResolvedValue("mastodon");
    vi.mocked(mastodonOAuthProvider.begin).mockResolvedValue({
      authorizeUrl: "https://m.test/oauth/authorize",
      pending: { kind: "mastodon", instance: "m.test", clientId: "c", clientSecret: "s" },
    });
    vi.mocked(mastodonOAuthProvider.complete).mockResolvedValue({
      accessToken: "at",
      tokenType: "Bearer",
    });
    vi.mocked(resolveWriteAdapter).mockResolvedValue({
      verifyCredentials: vi.fn().mockResolvedValue({ id: "1", username: "alice", acct: "alice" }),
    } as never);
    vi.mocked(accountManager.addAndPersistAccount).mockResolvedValue({} as never);

    const { loginId } = await beginLogin("m.test");
    const res = await completeLogin(loginId, "code123");
    expect(mastodonOAuthProvider.complete).toHaveBeenCalled();
    expect(accountManager.addAndPersistAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mastodon:m.test:alice",
        instance: "m.test",
        username: "alice",
        accessToken: "at",
      }),
    );
    expect(res.username).toBe("alice");
    expect((res as Record<string, unknown>).accessToken).toBeUndefined();
  });

  it("throws for an unknown loginId", async () => {
    await expect(completeLogin("nope")).rejects.toThrow(/login session/i);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- tests/unit/login-manager.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/auth/login/login-manager.ts`:

```ts
/**
 * Orchestrates account onboarding: selects the platform login provider, holds
 * ephemeral pending-login state, and on completion verifies + persists the
 * acquired account. Tokens are never returned to callers.
 */

import { getLogger } from "@logtape/logtape";
import { accountManager } from "../account-manager.js";
import { resolveSoftwareKind, resolveWriteAdapter } from "../adapters/resolve.js";
import type { AccountCredentials } from "../account-manager.js";
import type { LoginProvider, PendingLoginData } from "./login-provider.js";
import { mastodonOAuthProvider } from "./mastodon-oauth.js";
import { misskeyMiAuthProvider } from "./misskey-miauth.js";

const logger = getLogger("activitypub-mcp:login-manager");

const PENDING_TTL_MS = 10 * 60 * 1000;

type StoredPending = PendingLoginData & { createdAt: number };
const pending = new Map<string, StoredPending>();

/** Test-only: clear pending state. */
export function __clearPending(): void {
  pending.clear();
}

function prune(): void {
  const now = Date.now();
  for (const [id, p] of pending) {
    if (now - p.createdAt > PENDING_TTL_MS) pending.delete(id);
  }
}

function providerFor(kind: "mastodon" | "misskey"): LoginProvider {
  return kind === "misskey" ? misskeyMiAuthProvider : mastodonOAuthProvider;
}

export interface BeginLoginResult {
  loginId: string;
  authorizeUrl: string;
  kind: "mastodon" | "misskey";
}

export async function beginLogin(instance: string): Promise<BeginLoginResult> {
  const kind = await resolveSoftwareKind({ instance } as AccountCredentials);
  const provider = providerFor(kind);
  const { authorizeUrl, pending: data } = await provider.begin(instance);
  const loginId = crypto.randomUUID();
  pending.set(loginId, { ...data, createdAt: Date.now() });
  logger.info("Started login", { loginId, kind, instance: data.instance });
  return { loginId, authorizeUrl, kind };
}

export interface CompleteLoginResult {
  accountId: string;
  username: string;
  instance: string;
  isActive: boolean;
}

export async function completeLogin(loginId: string, code?: string): Promise<CompleteLoginResult> {
  prune();
  const data = pending.get(loginId);
  if (!data) {
    throw new Error("Unknown or expired login session. Start over with start-login.");
  }
  const provider = providerFor(data.kind);
  const { accessToken, tokenType } = await provider.complete(data, code);

  // Verify to fetch the canonical username/id for this platform.
  const temp: AccountCredentials = {
    id: `pending:${loginId}`,
    instance: data.instance,
    username: "pending",
    accessToken,
    tokenType,
    scopes: ["read", "write", "follow"],
    createdAt: new Date().toISOString(),
  };
  const adapter = await resolveWriteAdapter(temp);
  const info = await adapter.verifyCredentials(temp);

  const accountId = `${data.kind}:${data.instance}:${info.username}`;
  const wasEmpty = !accountManager.hasAccounts();
  await accountManager.addAndPersistAccount({
    id: accountId,
    instance: data.instance,
    username: info.username,
    accessToken,
    tokenType,
    scopes: ["read", "write", "follow"],
    label: `${info.username}@${data.instance}`,
  });
  pending.delete(loginId);
  logger.info("Completed login", { accountId, instance: data.instance });
  return { accountId, username: info.username, instance: data.instance, isActive: wasEmpty };
}
```

- [ ] **Step 4: Run** `npm run test -- tests/unit/login-manager.test.ts` → PASS.

- [ ] **Step 5: Typecheck** `npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/login/login-manager.ts tests/unit/login-manager.test.ts
git commit -m "feat: add login-manager orchestrating onboarding + persistence"
```

---

## Task 8: MCP tools (`start-login`, `complete-login`)

**Files:**
- Create: `src/mcp/tools-auth.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp-server.ts` (await `accountManager.ready()` at startup)
- Test: `tests/unit/tools-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/login/login-manager.js", () => ({
  beginLogin: vi.fn(),
  completeLogin: vi.fn(),
}));

import { beginLogin, completeLogin } from "../../src/auth/login/login-manager.js";
import { __handleStartLogin, __handleCompleteLogin } from "../../src/mcp/tools-auth.js";

describe("start-login tool handler", () => {
  it("returns the authorize URL and loginId without errors", async () => {
    vi.mocked(beginLogin).mockResolvedValue({
      loginId: "lid",
      authorizeUrl: "https://m.test/oauth/authorize?x=1",
      kind: "mastodon",
    });
    const res = await __handleStartLogin({ instance: "m.test" });
    const text = res.content[0].text as string;
    expect(text).toContain("https://m.test/oauth/authorize");
    expect(text).toContain("lid");
    expect(res.isError).toBeFalsy();
  });
});

describe("complete-login tool handler", () => {
  it("reports success without echoing a token", async () => {
    vi.mocked(completeLogin).mockResolvedValue({
      accountId: "mastodon:m.test:alice",
      username: "alice",
      instance: "m.test",
      isActive: true,
    });
    const res = await __handleCompleteLogin({ loginId: "lid", code: "c" });
    const text = res.content[0].text as string;
    expect(text).toContain("alice");
    expect(text).toContain("mastodon:m.test:alice");
    expect(text).not.toMatch(/token/i);
  });

  it("surfaces errors as isError", async () => {
    vi.mocked(completeLogin).mockRejectedValue(new Error("Unknown or expired login session."));
    const res = await __handleCompleteLogin({ loginId: "bad" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text as string).toContain("expired");
  });
});
```

- [ ] **Step 2: Run** `npm run test -- tests/unit/tools-auth.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/mcp/tools-auth.ts`:

```ts
/**
 * MCP onboarding tools: start-login / complete-login.
 *
 * Drives the out-of-band OAuth (Mastodon) / MiAuth (Misskey) flow so an LLM can
 * connect a fediverse account end-to-end. Tokens are never echoed back.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditLogger } from "../audit/logger.js";
import { beginLogin, completeLogin } from "../auth/login/login-manager.js";
import { getErrorMessage } from "../utils/errors.js";
import { trackedMcpServer } from "./capabilities.js";

const logger = getLogger("activitypub-mcp:tools-auth");

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export async function __handleStartLogin({ instance }: { instance: string }): Promise<ToolResult> {
  const startTime = Date.now();
  try {
    const { loginId, authorizeUrl, kind } = await beginLogin(instance);
    auditLogger.logToolInvocation("start-login", { instance }, {
      success: true,
      duration: Date.now() - startTime,
    });
    const codeStep =
      kind === "mastodon"
        ? "3. Copy the authorization code it shows you.\n4. Call `complete-login` with this `loginId` and that `code`."
        : "3. After approving, call `complete-login` with this `loginId` (no code needed).";
    return {
      content: [
        {
          type: "text",
          text: `🔐 **Connect your account** (${kind})

1. Open this URL in your browser:
${authorizeUrl}

2. Approve access for **${instance}**.
${codeStep}

\`loginId\`: \`${loginId}\`
(This login expires in 10 minutes.)`,
        },
      ],
    };
  } catch (error) {
    auditLogger.logToolInvocation("start-login", { instance }, {
      success: false,
      duration: Date.now() - startTime,
      error: getErrorMessage(error),
    });
    return {
      content: [{ type: "text", text: `❌ Could not start login: ${getErrorMessage(error)}` }],
      isError: true,
    };
  }
}

export async function __handleCompleteLogin({
  loginId,
  code,
}: {
  loginId: string;
  code?: string;
}): Promise<ToolResult> {
  const startTime = Date.now();
  try {
    const { accountId, username, instance, isActive } = await completeLogin(loginId, code);
    auditLogger.logToolInvocation("complete-login", { loginId }, {
      success: true,
      duration: Date.now() - startTime,
    });
    return {
      content: [
        {
          type: "text",
          text: `✅ **Account connected**

**@${username}@${instance}** is now configured (id: \`${accountId}\`).${
            isActive ? "\n\nIt is now the active account for write operations." : ""
          }

The credentials are saved and will persist across restarts.`,
        },
      ],
    };
  } catch (error) {
    auditLogger.logToolInvocation("complete-login", { loginId }, {
      success: false,
      duration: Date.now() - startTime,
      error: getErrorMessage(error),
    });
    return {
      content: [{ type: "text", text: `❌ Login failed: ${getErrorMessage(error)}` }],
      isError: true,
    };
  }
}

export function registerAuthTools(mcpServer: McpServer): void {
  trackedMcpServer(mcpServer);

  mcpServer.registerTool(
    "start-login",
    {
      title: "Start Account Login",
      description:
        "Begin connecting a fediverse account (Mastodon OAuth or Misskey MiAuth). Returns a URL " +
        "to open in a browser and a loginId to pass to complete-login.",
      inputSchema: {
        instance: z
          .string()
          .min(1)
          .describe("Instance hostname to log in to (e.g., mastodon.social)"),
      },
    },
    async ({ instance }) => __handleStartLogin({ instance }),
  );

  mcpServer.registerTool(
    "complete-login",
    {
      title: "Complete Account Login",
      description:
        "Finish connecting an account started with start-login. For Mastodon, pass the " +
        "authorization code you copied; for Misskey, just pass the loginId after approving.",
      inputSchema: {
        loginId: z.string().min(1).describe("The loginId returned by start-login"),
        code: z
          .string()
          .optional()
          .describe("Mastodon authorization code (omit for Misskey MiAuth)"),
      },
    },
    async ({ loginId, code }) => __handleCompleteLogin({ loginId, code }),
  );

  logger.info("Registered onboarding tools (start-login, complete-login)");
}
```

- [ ] **Step 4: Wire into `src/mcp/tools.ts`** — add the import near the other tool imports (line ~29):

```ts
import { registerAuthTools } from "./tools-auth.js";
```

And call it inside the tools-registration function, next to `registerWriteTools(mcpServer, rateLimiter);` (around line 78):

```ts
  registerAuthTools(mcpServer);
```

- [ ] **Step 5: Await persisted-account load at startup** — in `src/mcp-server.ts`, find the `start()`/startup path (where the server begins listening) and `await accountManager.ready();` before tools handle traffic. If `accountManager` isn't already imported there, add `import { accountManager } from "./auth/index.js";`. Place the await at the start of the async startup method (e.g., immediately inside `async start()` before connecting the transport). This ensures persisted accounts are loaded before the first tool call.

- [ ] **Step 6: Run** `npm run test -- tests/unit/tools-auth.test.ts` → PASS.

- [ ] **Step 7: Typecheck + full suite**

Run: `npm run typecheck && npm run test`
Expected: PASS (all suites).

- [ ] **Step 8: Commit**

```bash
git add src/mcp/tools-auth.ts src/mcp/tools.ts src/mcp-server.ts tests/unit/tools-auth.test.ts
git commit -m "feat: add start-login/complete-login onboarding tools"
```

---

## Task 9: Docs

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `.env.example`

- [ ] **Step 1: README** — add an onboarding subsection under the authenticated/Quick Start area:

```md
### Connecting an account (OAuth / MiAuth)

Instead of manually creating an app and copying a token, ask your LLM to connect
an account:

1. "Connect my fosstodon.org account" → the `start-login` tool returns a URL.
2. Open the URL, approve access. For Mastodon, copy the authorization code it
   shows; for Misskey, just approve.
3. The LLM calls `complete-login` (with the code for Mastodon) and the account is
   saved to `~/.config/activitypub-mcp/accounts.json` (mode 0600), persisting
   across restarts. Override the path with `MCP_TOKEN_STORE`.

Tokens are never shown in tool output or logs. Add the token-store path to your
`.gitignore` if it lives in a repo.
```

- [ ] **Step 2: CHANGELOG** — under `## [Unreleased] / ### Added`:

```md
- **Account onboarding via `start-login` / `complete-login`.** Connect a Mastodon
  (OAuth) or Misskey (MiAuth) account end-to-end through an out-of-band code
  paste — no manual app registration. Acquired credentials persist to a 0600
  token-store file (`MCP_TOKEN_STORE`, default `~/.config/activitypub-mcp/accounts.json`),
  loaded at startup alongside env-configured accounts (env wins on id conflict).
```

- [ ] **Step 3: `.env.example`** — add near the auth section:

```env
# Account onboarding (start-login / complete-login). Acquired tokens persist here:
# MCP_TOKEN_STORE=~/.config/activitypub-mcp/accounts.json   # default
# MCP_OAUTH_APP_NAME=activitypub-mcp
# MCP_OAUTH_APP_WEBSITE=https://github.com/cameronrye/activitypub-mcp
```

- [ ] **Step 4: Verify + commit**

```bash
npm run typecheck && npm run lint && npm run test
git add README.md CHANGELOG.md .env.example
git commit -m "docs: document account onboarding flow and token store"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- OOB callback (Mastodon) → Task 5. ✓ MiAuth (Misskey) → Task 6. ✓
- 0600 file persistence + startup load (env wins) → Tasks 2, 3. ✓
- LoginProvider interface + guarded request → Task 4. ✓
- login-manager (selection, 10-min expiry, verify, persist, no token returned) → Task 7. ✓
- start-login/complete-login tools, registered, audit-logged, token never echoed → Task 8. ✓
- Config (`MCP_TOKEN_STORE`, app name/website) → Task 1. ✓
- Security (guarded fetch, client_secret in-memory only, perms) → Tasks 2, 4. ✓
- Docs → Task 9. ✓

**Type consistency:** `LoginProvider`/`PendingLoginData`/`LoginResult` (Task 4) are used unchanged by Tasks 5–7. `beginLogin`/`completeLogin` shapes (Task 7) match the tool handlers (Task 8) and the login-manager test. `addAndPersistAccount` (Task 3) signature matches its caller (Task 7).

**Placeholder scan:** none. The only non-code instruction is Task 8 Step 5 (locate the server startup method) — unavoidable since the exact line depends on `mcp-server.ts` structure; the engineer adds one `await accountManager.ready()` there.

**No-cycle check:** `token-store` imports only `type AccountCredentials` from `account-manager` (erased); `account-manager` imports `token-store` at runtime. `login-manager` imports `account-manager` + `resolve` (SP1) + providers; no provider imports `login-manager`. No runtime cycles.
