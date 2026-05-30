# Account & Content Feature Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mastodon feature tools — edit/pin posts, follow-hashtag, lists, keyword filters, profile editing, follow-request management — that fail fast with `UnsupportedOnPlatformError` on Misskey accounts.

**Architecture:** Focused feature modules under `src/auth/mastodon-features/` that reuse SP1's guarded `authenticatedFetch` and a shared `requireMastodonAccount` guard; thin MCP tools in `src/mcp/tools-content.ts`. `AuthenticatedClient` and `tools-write.ts` are untouched.

**Tech Stack:** TypeScript (ESM), Zod v4, Vitest + MSW, LogTape.

**Spec:** `docs/superpowers/specs/2026-05-29-account-content-feature-tools-design.md`. Builds on SP1 (`authenticatedFetch`, `resolveSoftwareKind`, shared schemas) and SP2.

**Conventions:** commands from repo root; `npm run test -- tests/unit/<file>.test.ts`; `npm run typecheck`; `npm run lint:fix`. `.js` import extensions. Reuse `StatusSchema`/`RelationshipSchema`/`AccountInfoSchema` from `src/auth/adapters/write-adapter.js`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/auth/mastodon-features/guard.ts` (create) | `requireMastodonAccount(op, accountId?)`. |
| `src/auth/mastodon-features/posts.ts` (create) | editPost, pinPost, unpinPost. |
| `src/auth/mastodon-features/hashtags.ts` (create) | followHashtag, unfollowHashtag. |
| `src/auth/mastodon-features/lists.ts` (create) | list CRUD + timeline + members. |
| `src/auth/mastodon-features/filters.ts` (create) | v2 filters CRUD. |
| `src/auth/mastodon-features/profile.ts` (create) | updateProfile. |
| `src/auth/mastodon-features/follow-requests.ts` (create) | list/accept/reject follow requests. |
| `src/mcp/tools-content.ts` (create) | `registerContentTools` — all new tools. |
| `src/mcp/tools.ts` (modify) | call `registerContentTools`. |
| `README.md`, `CHANGELOG.md` (modify) | document the new tools. |

---

## Task 1: Misskey guard

**Files:**
- Create: `src/auth/mastodon-features/guard.ts`
- Test: `tests/unit/mastodon-features-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/account-manager.js", () => ({
  accountManager: { getActiveAccount: vi.fn(), getAccount: vi.fn() },
}));
vi.mock("../../src/auth/adapters/resolve.js", () => ({ resolveSoftwareKind: vi.fn() }));

import { accountManager } from "../../src/auth/account-manager.js";
import { resolveSoftwareKind } from "../../src/auth/adapters/resolve.js";
import { requireMastodonAccount } from "../../src/auth/mastodon-features/guard.js";
import { UnsupportedOnPlatformError } from "../../src/utils/errors.js";

const acct = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

afterEach(() => vi.clearAllMocks());

describe("requireMastodonAccount", () => {
  it("returns the active account when it is a Mastodon-API instance", async () => {
    vi.mocked(accountManager.getActiveAccount).mockReturnValue(acct);
    vi.mocked(resolveSoftwareKind).mockResolvedValue("mastodon");
    expect(await requireMastodonAccount("edit-post")).toBe(acct);
  });

  it("resolves a specific account by id", async () => {
    vi.mocked(accountManager.getAccount).mockReturnValue(acct);
    vi.mocked(resolveSoftwareKind).mockResolvedValue("mastodon");
    expect(await requireMastodonAccount("edit-post", "a")).toBe(acct);
    expect(accountManager.getAccount).toHaveBeenCalledWith("a");
  });

  it("throws UnsupportedOnPlatformError for a Misskey account", async () => {
    vi.mocked(accountManager.getActiveAccount).mockReturnValue(acct);
    vi.mocked(resolveSoftwareKind).mockResolvedValue("misskey");
    await expect(requireMastodonAccount("edit-post")).rejects.toBeInstanceOf(
      UnsupportedOnPlatformError,
    );
  });

  it("throws when no account is configured", async () => {
    vi.mocked(accountManager.getActiveAccount).mockReturnValue(undefined);
    await expect(requireMastodonAccount("edit-post")).rejects.toThrow(/No authenticated account/);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- tests/unit/mastodon-features-guard.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/auth/mastodon-features/guard.ts`:

```ts
/**
 * Resolve the account for a Mastodon-only feature tool and reject Misskey
 * accounts up front (mirrors AuthenticatedClient.assertMastodonApi for the
 * SP1 Mastodon-only ops).
 */

import type { AccountCredentials } from "../account-manager.js";
import { accountManager } from "../account-manager.js";
import { resolveSoftwareKind } from "../adapters/resolve.js";
import { UnsupportedOnPlatformError } from "../../utils/errors.js";

export async function requireMastodonAccount(
  op: string,
  accountId?: string,
): Promise<AccountCredentials> {
  const account = accountId
    ? accountManager.getAccount(accountId)
    : accountManager.getActiveAccount();
  if (!account) {
    if (accountId) throw new Error(`Account not found: ${accountId}`);
    throw new Error(
      "No authenticated account configured. Set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables, or use the account management tools.",
    );
  }
  const kind = await resolveSoftwareKind(account);
  if (kind === "misskey") throw new UnsupportedOnPlatformError(op, "Misskey");
  return account;
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit**

```bash
git add src/auth/mastodon-features/guard.ts tests/unit/mastodon-features-guard.test.ts
git commit -m "feat: add Mastodon-only feature guard"
```

---

## Task 2: Posts (edit/pin/unpin) + hashtags (follow/unfollow)

**Files:**
- Create: `src/auth/mastodon-features/posts.ts`, `src/auth/mastodon-features/hashtags.ts`
- Test: `tests/unit/mastodon-features-posts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as hashtags from "../../src/auth/mastodon-features/hashtags.js";
import * as posts from "../../src/auth/mastodon-features/posts.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const account = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

const status = {
  id: "s1",
  uri: "https://m.test/s1",
  url: "https://m.test/s1",
  created_at: "2026-01-01T00:00:00Z",
  content: "<p>hi</p>",
  visibility: "public",
  sensitive: false,
  spoiler_text: "",
  reblogs_count: 0,
  favourites_count: 0,
  replies_count: 0,
  account: { id: "1", username: "u", acct: "u", url: "https://m.test/@u" },
};

describe("posts.editPost", () => {
  it("PUTs the new content and returns the Status", async () => {
    let method: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.put("https://m.test/api/v1/statuses/s1", async ({ request }) => {
        method = request.method;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...status, content: "<p>edited</p>" });
      }),
    );
    const result = await posts.editPost(account, "s1", { status: "edited" });
    expect(method).toBe("PUT");
    expect(body?.status).toBe("edited");
    expect(result.content).toBe("<p>edited</p>");
  });
});

describe("posts.pinPost / unpinPost", () => {
  it("pins via POST /pin", async () => {
    server.use(http.post("https://m.test/api/v1/statuses/s1/pin", () => HttpResponse.json(status)));
    expect((await posts.pinPost(account, "s1")).id).toBe("s1");
  });
  it("unpins via POST /unpin", async () => {
    server.use(
      http.post("https://m.test/api/v1/statuses/s1/unpin", () => HttpResponse.json(status)),
    );
    expect((await posts.unpinPost(account, "s1")).id).toBe("s1");
  });
});

describe("hashtags.followHashtag / unfollowHashtag", () => {
  it("follows, stripping a leading # and encoding the path", async () => {
    server.use(
      http.post("https://m.test/api/v1/tags/typescript/follow", () =>
        HttpResponse.json({ name: "typescript", url: "https://m.test/tags/typescript", following: true }),
      ),
    );
    const tag = await hashtags.followHashtag(account, "#typescript");
    expect(tag.name).toBe("typescript");
    expect(tag.following).toBe(true);
  });
  it("unfollows", async () => {
    server.use(
      http.post("https://m.test/api/v1/tags/ts/unfollow", () =>
        HttpResponse.json({ name: "ts", url: "https://m.test/tags/ts", following: false }),
      ),
    );
    expect((await hashtags.unfollowHashtag(account, "ts")).following).toBe(false);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `src/auth/mastodon-features/posts.ts`:

```ts
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { type Status, StatusSchema, authenticatedFetch } from "../adapters/write-adapter.js";

export interface EditPostOptions {
  status: string;
  spoilerText?: string;
  sensitive?: boolean;
  language?: string;
  mediaIds?: string[];
}

async function parseStatus(response: Response, verb: string): Promise<Status> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to ${verb}: HTTP ${response.status} - ${text}`);
  }
  return StatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function editPost(
  account: AccountCredentials,
  statusId: string,
  options: EditPostOptions,
): Promise<Status> {
  const body: Record<string, unknown> = { status: options.status };
  if (options.spoilerText !== undefined) body.spoiler_text = options.spoilerText;
  if (options.sensitive !== undefined) body.sensitive = options.sensitive;
  if (options.language) body.language = options.language;
  if (options.mediaIds?.length) body.media_ids = options.mediaIds;
  const response = await authenticatedFetch(account, `/api/v1/statuses/${statusId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return parseStatus(response, "edit post");
}

export async function pinPost(account: AccountCredentials, statusId: string): Promise<Status> {
  return parseStatus(
    await authenticatedFetch(account, `/api/v1/statuses/${statusId}/pin`, { method: "POST" }),
    "pin post",
  );
}

export async function unpinPost(account: AccountCredentials, statusId: string): Promise<Status> {
  return parseStatus(
    await authenticatedFetch(account, `/api/v1/statuses/${statusId}/unpin`, { method: "POST" }),
    "unpin post",
  );
}
```

And `src/auth/mastodon-features/hashtags.ts`:

```ts
import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { authenticatedFetch } from "../adapters/write-adapter.js";

export const TagSchema = z.object({
  name: z.string(),
  url: z.string(),
  following: z.boolean().optional(),
  history: z.array(z.unknown()).optional(),
});
export type Tag = z.infer<typeof TagSchema>;

function normalizeTag(name: string): string {
  return encodeURIComponent(name.trim().replace(/^#/, ""));
}

async function tagAction(
  account: AccountCredentials,
  name: string,
  action: "follow" | "unfollow",
): Promise<Tag> {
  const response = await authenticatedFetch(
    account,
    `/api/v1/tags/${normalizeTag(name)}/${action}`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to ${action} hashtag: HTTP ${response.status} - ${text}`);
  }
  return TagSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export function followHashtag(account: AccountCredentials, name: string): Promise<Tag> {
  return tagAction(account, name, "follow");
}
export function unfollowHashtag(account: AccountCredentials, name: string): Promise<Tag> {
  return tagAction(account, name, "unfollow");
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Typecheck.** **Step 6: Commit**

```bash
git add src/auth/mastodon-features/posts.ts src/auth/mastodon-features/hashtags.ts tests/unit/mastodon-features-posts.test.ts
git commit -m "feat: add edit/pin post + follow-hashtag feature modules"
```

---

## Task 3: Lists

**Files:**
- Create: `src/auth/mastodon-features/lists.ts`
- Test: `tests/unit/mastodon-features-lists.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as lists from "../../src/auth/mastodon-features/lists.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const account = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

describe("lists", () => {
  it("creates a list", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("https://m.test/api/v1/lists", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "l1", title: "News" });
      }),
    );
    const list = await lists.createList(account, { title: "News" });
    expect(body?.title).toBe("News");
    expect(list.id).toBe("l1");
  });

  it("gets all lists", async () => {
    server.use(
      http.get("https://m.test/api/v1/lists", () => HttpResponse.json([{ id: "l1", title: "News" }])),
    );
    expect(await lists.getLists(account)).toHaveLength(1);
  });

  it("updates a list", async () => {
    server.use(
      http.put("https://m.test/api/v1/lists/l1", () => HttpResponse.json({ id: "l1", title: "Tech" })),
    );
    expect((await lists.updateList(account, "l1", { title: "Tech" })).title).toBe("Tech");
  });

  it("deletes a list", async () => {
    server.use(http.delete("https://m.test/api/v1/lists/l1", () => HttpResponse.json({})));
    await expect(lists.deleteList(account, "l1")).resolves.toBeUndefined();
  });

  it("fetches the list timeline", async () => {
    server.use(
      http.get("https://m.test/api/v1/timelines/list/l1", () =>
        HttpResponse.json([
          {
            id: "s1",
            uri: "https://m.test/s1",
            created_at: "2026-01-01T00:00:00Z",
            content: "<p>x</p>",
            visibility: "public",
            sensitive: false,
            spoiler_text: "",
            reblogs_count: 0,
            favourites_count: 0,
            replies_count: 0,
            account: { id: "1", username: "u", acct: "u", url: "https://m.test/@u" },
          },
        ]),
      ),
    );
    expect(await lists.getListTimeline(account, "l1", { limit: 5 })).toHaveLength(1);
  });

  it("adds and removes list accounts", async () => {
    let addBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://m.test/api/v1/lists/l1/accounts", async ({ request }) => {
        addBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
      http.delete("https://m.test/api/v1/lists/l1/accounts", () => HttpResponse.json({})),
    );
    await lists.addListAccounts(account, "l1", ["42"]);
    expect(addBody?.account_ids).toEqual(["42"]);
    await expect(lists.removeListAccounts(account, "l1", ["42"])).resolves.toBeUndefined();
  });

  it("gets list members", async () => {
    server.use(
      http.get("https://m.test/api/v1/lists/l1/accounts", () =>
        HttpResponse.json([{ id: "42", username: "bob", acct: "bob", url: "https://m.test/@bob" }]),
      ),
    );
    expect((await lists.getListAccounts(account, "l1"))[0].username).toBe("bob");
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `src/auth/mastodon-features/lists.ts`:

```ts
import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { type Status, StatusSchema, authenticatedFetch } from "../adapters/write-adapter.js";

export const ListSchema = z.object({
  id: z.string(),
  title: z.string(),
  replies_policy: z.enum(["followed", "list", "none"]).optional(),
  exclusive: z.boolean().optional(),
});
export type List = z.infer<typeof ListSchema>;

export const AccountLiteSchema = z.object({
  id: z.string(),
  username: z.string(),
  acct: z.string(),
  display_name: z.string().optional(),
  url: z.string(),
});
export type AccountLite = z.infer<typeof AccountLiteSchema>;

export interface ListOptions {
  title: string;
  repliesPolicy?: "followed" | "list" | "none";
  exclusive?: boolean;
}

function listBody(options: Partial<ListOptions>): string {
  const body: Record<string, unknown> = {};
  if (options.title !== undefined) body.title = options.title;
  if (options.repliesPolicy) body.replies_policy = options.repliesPolicy;
  if (options.exclusive !== undefined) body.exclusive = options.exclusive;
  return JSON.stringify(body);
}

async function fail(response: Response, verb: string): Promise<never> {
  const text = await response.text();
  throw new Error(`Failed to ${verb}: HTTP ${response.status} - ${text}`);
}

export async function createList(
  account: AccountCredentials,
  options: ListOptions,
): Promise<List> {
  const response = await authenticatedFetch(account, "/api/v1/lists", {
    method: "POST",
    body: listBody(options),
  });
  if (!response.ok) await fail(response, "create list");
  return ListSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function getLists(account: AccountCredentials): Promise<List[]> {
  const response = await authenticatedFetch(account, "/api/v1/lists", { method: "GET" });
  if (!response.ok) await fail(response, "get lists");
  return z.array(ListSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function updateList(
  account: AccountCredentials,
  listId: string,
  options: Partial<ListOptions>,
): Promise<List> {
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}`, {
    method: "PUT",
    body: listBody(options),
  });
  if (!response.ok) await fail(response, "update list");
  return ListSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function deleteList(account: AccountCredentials, listId: string): Promise<void> {
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}`, {
    method: "DELETE",
  });
  if (!response.ok) await fail(response, "delete list");
}

export async function getListTimeline(
  account: AccountCredentials,
  listId: string,
  options?: { limit?: number; maxId?: string; minId?: string },
): Promise<Status[]> {
  const params = new URLSearchParams({ limit: String(options?.limit ?? 20) });
  if (options?.maxId) params.set("max_id", options.maxId);
  if (options?.minId) params.set("min_id", options.minId);
  const response = await authenticatedFetch(
    account,
    `/api/v1/timelines/list/${listId}?${params}`,
    { method: "GET" },
  );
  if (!response.ok) await fail(response, "get list timeline");
  return z.array(StatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function addListAccounts(
  account: AccountCredentials,
  listId: string,
  accountIds: string[],
): Promise<void> {
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}/accounts`, {
    method: "POST",
    body: JSON.stringify({ account_ids: accountIds }),
  });
  if (!response.ok) await fail(response, "add list accounts");
}

export async function removeListAccounts(
  account: AccountCredentials,
  listId: string,
  accountIds: string[],
): Promise<void> {
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}/accounts`, {
    method: "DELETE",
    body: JSON.stringify({ account_ids: accountIds }),
  });
  if (!response.ok) await fail(response, "remove list accounts");
}

export async function getListAccounts(
  account: AccountCredentials,
  listId: string,
  options?: { limit?: number },
): Promise<AccountLite[]> {
  const params = new URLSearchParams({ limit: String(options?.limit ?? 40) });
  const response = await authenticatedFetch(
    account,
    `/api/v1/lists/${listId}/accounts?${params}`,
    { method: "GET" },
  );
  if (!response.ok) await fail(response, "get list accounts");
  return z.array(AccountLiteSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Typecheck.** **Step 6: Commit**

```bash
git add src/auth/mastodon-features/lists.ts tests/unit/mastodon-features-lists.test.ts
git commit -m "feat: add list management feature module"
```

---

## Task 4: Filters (v2)

**Files:**
- Create: `src/auth/mastodon-features/filters.ts`
- Test: `tests/unit/mastodon-features-filters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as filters from "../../src/auth/mastodon-features/filters.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const account = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

const filter = {
  id: "f1",
  title: "Spoilers",
  context: ["home"],
  filter_action: "warn",
  keywords: [{ id: "k1", keyword: "spoiler", whole_word: true }],
};

describe("filters", () => {
  it("lists filters", async () => {
    server.use(http.get("https://m.test/api/v2/filters", () => HttpResponse.json([filter])));
    expect(await filters.getFilters(account)).toHaveLength(1);
  });

  it("creates a filter with keywords_attributes", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("https://m.test/api/v2/filters", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(filter);
      }),
    );
    const created = await filters.createFilter(account, {
      title: "Spoilers",
      context: ["home"],
      keywords: ["spoiler"],
    });
    expect(body?.context).toEqual(["home"]);
    expect(body?.filter_action).toBe("warn");
    expect((body?.keywords_attributes as unknown[]).length).toBe(1);
    expect(created.id).toBe("f1");
  });

  it("deletes a filter", async () => {
    server.use(http.delete("https://m.test/api/v2/filters/f1", () => HttpResponse.json({})));
    await expect(filters.deleteFilter(account, "f1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `src/auth/mastodon-features/filters.ts`:

```ts
import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { authenticatedFetch } from "../adapters/write-adapter.js";

export const FilterSchema = z.object({
  id: z.string(),
  title: z.string(),
  context: z.array(z.string()),
  filter_action: z.enum(["warn", "hide"]),
  keywords: z
    .array(z.object({ id: z.string(), keyword: z.string(), whole_word: z.boolean() }))
    .default([]),
});
export type Filter = z.infer<typeof FilterSchema>;

export type FilterContext = "home" | "notifications" | "public" | "thread" | "account";

export interface CreateFilterOptions {
  title: string;
  context: FilterContext[];
  keywords: string[];
  filterAction?: "warn" | "hide";
  wholeWord?: boolean;
}

async function fail(response: Response, verb: string): Promise<never> {
  const text = await response.text();
  throw new Error(`Failed to ${verb}: HTTP ${response.status} - ${text}`);
}

export async function getFilters(account: AccountCredentials): Promise<Filter[]> {
  const response = await authenticatedFetch(account, "/api/v2/filters", { method: "GET" });
  if (!response.ok) await fail(response, "get filters");
  return z.array(FilterSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function createFilter(
  account: AccountCredentials,
  options: CreateFilterOptions,
): Promise<Filter> {
  const body = {
    title: options.title,
    context: options.context,
    filter_action: options.filterAction ?? "warn",
    keywords_attributes: options.keywords.map((keyword) => ({
      keyword,
      whole_word: options.wholeWord ?? false,
    })),
  };
  const response = await authenticatedFetch(account, "/api/v2/filters", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) await fail(response, "create filter");
  return FilterSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function deleteFilter(account: AccountCredentials, filterId: string): Promise<void> {
  const response = await authenticatedFetch(account, `/api/v2/filters/${filterId}`, {
    method: "DELETE",
  });
  if (!response.ok) await fail(response, "delete filter");
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Typecheck.** **Step 6: Commit**

```bash
git add src/auth/mastodon-features/filters.ts tests/unit/mastodon-features-filters.test.ts
git commit -m "feat: add keyword filter feature module"
```

---

## Task 5: Profile + follow-requests

**Files:**
- Create: `src/auth/mastodon-features/profile.ts`, `src/auth/mastodon-features/follow-requests.ts`
- Test: `tests/unit/mastodon-features-account.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as followReqs from "../../src/auth/mastodon-features/follow-requests.js";
import * as profile from "../../src/auth/mastodon-features/profile.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const account = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

const accountInfo = {
  id: "1",
  username: "u",
  acct: "u",
  url: "https://m.test/@u",
  followers_count: 1,
  following_count: 2,
  statuses_count: 3,
};

const relationship = {
  id: "42",
  following: false,
  followed_by: true,
  blocking: false,
  blocked_by: false,
  muting: false,
  muting_notifications: false,
  requested: false,
  domain_blocking: false,
  endorsed: false,
};

describe("profile.updateProfile", () => {
  it("PATCHes update_credentials with fields_attributes", async () => {
    let method: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch("https://m.test/api/v1/accounts/update_credentials", async ({ request }) => {
        method = request.method;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(accountInfo);
      }),
    );
    const info = await profile.updateProfile(account, {
      displayName: "New Name",
      note: "bio",
      fields: [{ name: "Web", value: "https://x.test" }],
    });
    expect(method).toBe("PATCH");
    expect(body?.display_name).toBe("New Name");
    expect((body?.fields_attributes as unknown[]).length).toBe(1);
    expect(info.id).toBe("1");
  });
});

describe("follow-requests", () => {
  it("lists follow requests", async () => {
    server.use(
      http.get("https://m.test/api/v1/follow_requests", () =>
        HttpResponse.json([{ id: "42", username: "bob", acct: "bob", url: "https://m.test/@bob" }]),
      ),
    );
    expect((await followReqs.getFollowRequests(account))[0].username).toBe("bob");
  });

  it("accepts a follow request", async () => {
    server.use(
      http.post("https://m.test/api/v1/follow_requests/42/authorize", () =>
        HttpResponse.json({ ...relationship, followed_by: true }),
      ),
    );
    expect((await followReqs.acceptFollowRequest(account, "42")).followed_by).toBe(true);
  });

  it("rejects a follow request", async () => {
    server.use(
      http.post("https://m.test/api/v1/follow_requests/42/reject", () =>
        HttpResponse.json(relationship),
      ),
    );
    expect((await followReqs.rejectFollowRequest(account, "42")).id).toBe("42");
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `src/auth/mastodon-features/profile.ts`:

```ts
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { type AccountInfo, AccountInfoSchema, authenticatedFetch } from "../adapters/write-adapter.js";

export interface UpdateProfileOptions {
  displayName?: string;
  note?: string;
  bot?: boolean;
  locked?: boolean;
  fields?: Array<{ name: string; value: string }>;
}

export async function updateProfile(
  account: AccountCredentials,
  options: UpdateProfileOptions,
): Promise<AccountInfo> {
  const body: Record<string, unknown> = {};
  if (options.displayName !== undefined) body.display_name = options.displayName;
  if (options.note !== undefined) body.note = options.note;
  if (options.bot !== undefined) body.bot = options.bot;
  if (options.locked !== undefined) body.locked = options.locked;
  if (options.fields) {
    body.fields_attributes = options.fields.map((f) => ({ name: f.name, value: f.value }));
  }
  const response = await authenticatedFetch(account, "/api/v1/accounts/update_credentials", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update profile: HTTP ${response.status} - ${text}`);
  }
  return AccountInfoSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}
```

And `src/auth/mastodon-features/follow-requests.ts`:

```ts
import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { type Relationship, RelationshipSchema, authenticatedFetch } from "../adapters/write-adapter.js";
import { type AccountLite, AccountLiteSchema } from "./lists.js";

export async function getFollowRequests(
  account: AccountCredentials,
  options?: { limit?: number },
): Promise<AccountLite[]> {
  const params = new URLSearchParams({ limit: String(options?.limit ?? 40) });
  const response = await authenticatedFetch(account, `/api/v1/follow_requests?${params}`, {
    method: "GET",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get follow requests: HTTP ${response.status} - ${text}`);
  }
  return z.array(AccountLiteSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

async function decide(
  account: AccountCredentials,
  accountId: string,
  action: "authorize" | "reject",
): Promise<Relationship> {
  const response = await authenticatedFetch(
    account,
    `/api/v1/follow_requests/${accountId}/${action}`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to ${action} follow request: HTTP ${response.status} - ${text}`);
  }
  return RelationshipSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export function acceptFollowRequest(
  account: AccountCredentials,
  accountId: string,
): Promise<Relationship> {
  return decide(account, accountId, "authorize");
}
export function rejectFollowRequest(
  account: AccountCredentials,
  accountId: string,
): Promise<Relationship> {
  return decide(account, accountId, "reject");
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Typecheck.** **Step 6: Commit**

```bash
git add src/auth/mastodon-features/profile.ts src/auth/mastodon-features/follow-requests.ts tests/unit/mastodon-features-account.test.ts
git commit -m "feat: add profile editing + follow-request feature modules"
```

---

## Task 6: MCP tools + wiring

**Files:**
- Create: `src/mcp/tools-content.ts`
- Modify: `src/mcp/tools.ts`
- Test: `tests/unit/tools-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/mastodon-features/guard.js", () => ({
  requireMastodonAccount: vi.fn(),
}));
vi.mock("../../src/auth/mastodon-features/posts.js", () => ({
  editPost: vi.fn(),
  pinPost: vi.fn(),
  unpinPost: vi.fn(),
}));

import { requireMastodonAccount } from "../../src/auth/mastodon-features/guard.js";
import * as posts from "../../src/auth/mastodon-features/posts.js";
import { __handleEditPost } from "../../src/mcp/tools-content.js";

const account = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

describe("edit-post tool handler", () => {
  it("edits and reports success", async () => {
    vi.mocked(requireMastodonAccount).mockResolvedValue(account);
    vi.mocked(posts.editPost).mockResolvedValue({ id: "s1", content: "<p>new</p>" } as never);
    const res = await __handleEditPost({ statusId: "s1", status: "new" });
    expect(posts.editPost).toHaveBeenCalledWith(account, "s1", expect.objectContaining({ status: "new" }));
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text as string).toContain("s1");
  });

  it("returns isError when the guard rejects (Misskey)", async () => {
    const { UnsupportedOnPlatformError } = await import("../../src/utils/errors.js");
    vi.mocked(requireMastodonAccount).mockRejectedValue(
      new UnsupportedOnPlatformError("edit-post", "Misskey"),
    );
    const res = await __handleEditPost({ statusId: "s1", status: "new" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text as string).toContain("not supported on Misskey");
  });
});
```

- [ ] **Step 2: Run** `npm run test -- tests/unit/tools-content.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/mcp/tools-content.ts`. The file exports testable `__handle*` functions and `registerContentTools`. Below is the complete file:

```ts
/**
 * MCP feature tools: post editing/pinning, hashtag follows, lists, keyword
 * filters, profile editing, and follow-request management. All Mastodon-only —
 * requireMastodonAccount rejects Misskey accounts before any request.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditLogger } from "../audit/logger.js";
import { requireMastodonAccount } from "../auth/mastodon-features/guard.js";
import * as filters from "../auth/mastodon-features/filters.js";
import * as followReqs from "../auth/mastodon-features/follow-requests.js";
import * as hashtags from "../auth/mastodon-features/hashtags.js";
import * as lists from "../auth/mastodon-features/lists.js";
import * as posts from "../auth/mastodon-features/posts.js";
import * as profile from "../auth/mastodon-features/profile.js";
import { formatErrorWithSuggestion, getErrorMessage } from "../utils/errors.js";
import { trackedMcpServer } from "./capabilities.js";

const logger = getLogger("activitypub-mcp:tools-content");

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** Run a guarded feature op with audit logging + uniform error formatting. */
async function run(
  op: string,
  accountId: string | undefined,
  params: Record<string, unknown>,
  fn: (account: Awaited<ReturnType<typeof requireMastodonAccount>>) => Promise<ToolResult>,
): Promise<ToolResult> {
  const startTime = Date.now();
  try {
    const account = await requireMastodonAccount(op, accountId);
    const result = await fn(account);
    auditLogger.logToolInvocation(op, params, { success: true, duration: Date.now() - startTime });
    return result;
  } catch (error) {
    auditLogger.logToolInvocation(op, params, {
      success: false,
      duration: Date.now() - startTime,
      error: getErrorMessage(error),
    });
    return {
      content: [{ type: "text", text: `❌ ${formatErrorWithSuggestion(getErrorMessage(error))}` }],
      isError: true,
    };
  }
}

// ---- Handlers (exported for tests) ----

export async function __handleEditPost(args: {
  statusId: string;
  status: string;
  spoilerText?: string;
  sensitive?: boolean;
  language?: string;
  accountId?: string;
}): Promise<ToolResult> {
  return run("edit-post", args.accountId, { statusId: args.statusId }, async (account) => {
    const s = await posts.editPost(account, args.statusId, {
      status: args.status,
      spoilerText: args.spoilerText,
      sensitive: args.sensitive,
      language: args.language,
    });
    return ok(`✅ Edited post \`${s.id}\`.`);
  });
}

export function registerContentTools(mcpServer: McpServer): void {
  trackedMcpServer(mcpServer);

  // --- Posts ---
  mcpServer.registerTool(
    "edit-post",
    {
      title: "Edit Post",
      description: "Edit the text/CW of one of your existing posts (Mastodon only).",
      inputSchema: {
        statusId: z.string().min(1).describe("ID of the post to edit"),
        status: z.string().min(1).max(5000).describe("New post content"),
        spoilerText: z.string().max(500).optional().describe("New content warning"),
        sensitive: z.boolean().optional(),
        language: z.string().optional(),
        accountId: z.string().optional(),
      },
    },
    async (args) => __handleEditPost(args),
  );

  mcpServer.registerTool(
    "pin-post",
    {
      title: "Pin Post",
      description: "Pin one of your posts to your profile (Mastodon only).",
      inputSchema: {
        statusId: z.string().min(1),
        accountId: z.string().optional(),
      },
    },
    async ({ statusId, accountId }) =>
      run("pin-post", accountId, { statusId }, async (a) => {
        const s = await posts.pinPost(a, statusId);
        return ok(`📌 Pinned post \`${s.id}\`.`);
      }),
  );

  mcpServer.registerTool(
    "unpin-post",
    {
      title: "Unpin Post",
      description: "Unpin one of your posts (Mastodon only).",
      inputSchema: { statusId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ statusId, accountId }) =>
      run("unpin-post", accountId, { statusId }, async (a) => {
        const s = await posts.unpinPost(a, statusId);
        return ok(`📌 Unpinned post \`${s.id}\`.`);
      }),
  );

  // --- Hashtags ---
  mcpServer.registerTool(
    "follow-hashtag",
    {
      title: "Follow Hashtag",
      description: "Follow a hashtag so its posts appear in your home timeline (Mastodon only).",
      inputSchema: { name: z.string().min(1).describe("Hashtag (with or without #)"), accountId: z.string().optional() },
    },
    async ({ name, accountId }) =>
      run("follow-hashtag", accountId, { name }, async (a) => {
        const t = await hashtags.followHashtag(a, name);
        return ok(`#️⃣ Now following **#${t.name}**.`);
      }),
  );

  mcpServer.registerTool(
    "unfollow-hashtag",
    {
      title: "Unfollow Hashtag",
      description: "Unfollow a hashtag (Mastodon only).",
      inputSchema: { name: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ name, accountId }) =>
      run("unfollow-hashtag", accountId, { name }, async (a) => {
        const t = await hashtags.unfollowHashtag(a, name);
        return ok(`#️⃣ Unfollowed **#${t.name}**.`);
      }),
  );

  // --- Lists ---
  const repliesPolicy = z.enum(["followed", "list", "none"]).optional();
  mcpServer.registerTool(
    "create-list",
    {
      title: "Create List",
      description: "Create a new list (Mastodon only).",
      inputSchema: {
        title: z.string().min(1).max(255),
        repliesPolicy,
        exclusive: z.boolean().optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ title, repliesPolicy, exclusive, accountId }) =>
      run("create-list", accountId, { title }, async (a) => {
        const l = await lists.createList(a, { title, repliesPolicy, exclusive });
        return ok(`📋 Created list **${l.title}** (\`${l.id}\`).`);
      }),
  );

  mcpServer.registerTool(
    "get-lists",
    {
      title: "Get Lists",
      description: "List your lists (Mastodon only).",
      inputSchema: { accountId: z.string().optional() },
    },
    async ({ accountId }) =>
      run("get-lists", accountId, {}, async (a) => {
        const all = await lists.getLists(a);
        if (all.length === 0) return ok("You have no lists.");
        return ok(`📋 **Your lists:**\n${all.map((l) => `- ${l.title} (\`${l.id}\`)`).join("\n")}`);
      }),
  );

  mcpServer.registerTool(
    "update-list",
    {
      title: "Update List",
      description: "Rename or reconfigure a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        title: z.string().min(1).max(255).optional(),
        repliesPolicy,
        exclusive: z.boolean().optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, title, repliesPolicy, exclusive, accountId }) =>
      run("update-list", accountId, { listId }, async (a) => {
        const l = await lists.updateList(a, listId, { title: title ?? "", repliesPolicy, exclusive });
        return ok(`📋 Updated list **${l.title}** (\`${l.id}\`).`);
      }),
  );

  mcpServer.registerTool(
    "delete-list",
    {
      title: "Delete List",
      description: "Delete a list (Mastodon only).",
      inputSchema: { listId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ listId, accountId }) =>
      run("delete-list", accountId, { listId }, async (a) => {
        await lists.deleteList(a, listId);
        return ok(`🗑️ Deleted list \`${listId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "get-list-timeline",
    {
      title: "Get List Timeline",
      description: "Read recent posts from a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        limit: z.number().int().min(1).max(40).optional(),
        maxId: z.string().optional(),
        minId: z.string().optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, limit, maxId, minId, accountId }) =>
      run("get-list-timeline", accountId, { listId }, async (a) => {
        const tl = await lists.getListTimeline(a, listId, { limit, maxId, minId });
        return ok(`📋 ${tl.length} posts in list \`${listId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "add-list-accounts",
    {
      title: "Add Accounts to List",
      description: "Add accounts (by account ID) to a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        accountIds: z.array(z.string()).min(1),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, accountIds, accountId }) =>
      run("add-list-accounts", accountId, { listId }, async (a) => {
        await lists.addListAccounts(a, listId, accountIds);
        return ok(`➕ Added ${accountIds.length} account(s) to list \`${listId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "remove-list-accounts",
    {
      title: "Remove Accounts from List",
      description: "Remove accounts (by account ID) from a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        accountIds: z.array(z.string()).min(1),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, accountIds, accountId }) =>
      run("remove-list-accounts", accountId, { listId }, async (a) => {
        await lists.removeListAccounts(a, listId, accountIds);
        return ok(`➖ Removed ${accountIds.length} account(s) from list \`${listId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "get-list-accounts",
    {
      title: "Get List Members",
      description: "List the accounts in a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        limit: z.number().int().min(1).max(80).optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, limit, accountId }) =>
      run("get-list-accounts", accountId, { listId }, async (a) => {
        const members = await lists.getListAccounts(a, listId, { limit });
        if (members.length === 0) return ok(`List \`${listId}\` has no members.`);
        return ok(`📋 **Members:**\n${members.map((m) => `- @${m.acct} (\`${m.id}\`)`).join("\n")}`);
      }),
  );

  // --- Filters ---
  mcpServer.registerTool(
    "get-filters",
    {
      title: "Get Filters",
      description: "List your keyword filters (Mastodon only).",
      inputSchema: { accountId: z.string().optional() },
    },
    async ({ accountId }) =>
      run("get-filters", accountId, {}, async (a) => {
        const all = await filters.getFilters(a);
        if (all.length === 0) return ok("You have no filters.");
        return ok(
          `🔇 **Filters:**\n${all
            .map((f) => `- ${f.title} (\`${f.id}\`): ${f.keywords.map((k) => k.keyword).join(", ")}`)
            .join("\n")}`,
        );
      }),
  );

  mcpServer.registerTool(
    "create-filter",
    {
      title: "Create Filter",
      description: "Create a keyword filter (Mastodon only).",
      inputSchema: {
        title: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(1),
        context: z
          .array(z.enum(["home", "notifications", "public", "thread", "account"]))
          .min(1)
          .describe("Where the filter applies"),
        filterAction: z.enum(["warn", "hide"]).optional(),
        wholeWord: z.boolean().optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ title, keywords, context, filterAction, wholeWord, accountId }) =>
      run("create-filter", accountId, { title }, async (a) => {
        const f = await filters.createFilter(a, { title, keywords, context, filterAction, wholeWord });
        return ok(`🔇 Created filter **${f.title}** (\`${f.id}\`).`);
      }),
  );

  mcpServer.registerTool(
    "delete-filter",
    {
      title: "Delete Filter",
      description: "Delete a keyword filter (Mastodon only).",
      inputSchema: { filterId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ filterId, accountId }) =>
      run("delete-filter", accountId, { filterId }, async (a) => {
        await filters.deleteFilter(a, filterId);
        return ok(`🗑️ Deleted filter \`${filterId}\`.`);
      }),
  );

  // --- Profile ---
  mcpServer.registerTool(
    "update-profile",
    {
      title: "Update Profile",
      description: "Update your display name, bio, fields, or bot/locked flags (Mastodon only).",
      inputSchema: {
        displayName: z.string().max(30).optional(),
        note: z.string().max(500).optional().describe("Profile bio"),
        bot: z.boolean().optional(),
        locked: z.boolean().optional(),
        fields: z
          .array(z.object({ name: z.string(), value: z.string() }))
          .max(4)
          .optional()
          .describe("Profile metadata fields (max 4)"),
        accountId: z.string().optional(),
      },
    },
    async ({ displayName, note, bot, locked, fields, accountId }) =>
      run("update-profile", accountId, {}, async (a) => {
        const info = await profile.updateProfile(a, { displayName, note, bot, locked, fields });
        return ok(`👤 Updated profile for **@${info.acct}**.`);
      }),
  );

  // --- Follow requests ---
  mcpServer.registerTool(
    "get-follow-requests",
    {
      title: "Get Follow Requests",
      description: "List pending follow requests (locked accounts) (Mastodon only).",
      inputSchema: {
        limit: z.number().int().min(1).max(80).optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ limit, accountId }) =>
      run("get-follow-requests", accountId, {}, async (a) => {
        const reqs = await followReqs.getFollowRequests(a, { limit });
        if (reqs.length === 0) return ok("No pending follow requests.");
        return ok(
          `🙋 **Pending requests:**\n${reqs.map((r) => `- @${r.acct} (\`${r.id}\`)`).join("\n")}`,
        );
      }),
  );

  mcpServer.registerTool(
    "accept-follow-request",
    {
      title: "Accept Follow Request",
      description: "Approve a pending follow request by account ID (Mastodon only).",
      inputSchema: { requestAccountId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ requestAccountId, accountId }) =>
      run("accept-follow-request", accountId, { requestAccountId }, async (a) => {
        await followReqs.acceptFollowRequest(a, requestAccountId);
        return ok(`✅ Approved follow request from \`${requestAccountId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "reject-follow-request",
    {
      title: "Reject Follow Request",
      description: "Deny a pending follow request by account ID (Mastodon only).",
      inputSchema: { requestAccountId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ requestAccountId, accountId }) =>
      run("reject-follow-request", accountId, { requestAccountId }, async (a) => {
        await followReqs.rejectFollowRequest(a, requestAccountId);
        return ok(`🚫 Rejected follow request from \`${requestAccountId}\`.`);
      }),
  );

  logger.info("Registered content feature tools");
}
```

- [ ] **Step 4: Wire into `src/mcp/tools.ts`** — add import:

```ts
import { registerContentTools } from "./tools-content.js";
```

and the call next to `registerWriteTools(mcpServer, rateLimiter);`:

```ts
  // Content & account feature tools (Mastodon)
  registerContentTools(mcpServer);
```

- [ ] **Step 5: Run** `npm run test -- tests/unit/tools-content.test.ts` → PASS.

- [ ] **Step 6: Typecheck + full suite** `npm run typecheck && npm run test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/mcp/tools-content.ts src/mcp/tools.ts tests/unit/tools-content.test.ts
git commit -m "feat: add content & account feature MCP tools"
```

---

## Task 7: Docs

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: README** — under the authenticated tools area, add a short bullet list of the new tools (edit/pin/unpin post; follow/unfollow-hashtag; list management; keyword filters; update-profile; follow-request management), noting they are Mastodon-only and return a clear error on Misskey.

- [ ] **Step 2: CHANGELOG** — under `## [Unreleased] / ### Added`:

```md
- **Account & content feature tools (Mastodon).** `edit-post`, `pin-post`/`unpin-post`,
  `follow-hashtag`/`unfollow-hashtag`, list management (`create-list`, `get-lists`,
  `update-list`, `delete-list`, `get-list-timeline`, `add-list-accounts`,
  `remove-list-accounts`, `get-list-accounts`), keyword filters (`get-filters`,
  `create-filter`, `delete-filter`), `update-profile`, and follow-request
  management (`get-follow-requests`, `accept-follow-request`,
  `reject-follow-request`). All Mastodon-only; they return a clear
  "not supported on Misskey" error on Misskey accounts.
```

- [ ] **Step 3: Verify + commit**

```bash
npm run typecheck && npm run lint && npm run test
git add README.md CHANGELOG.md
git commit -m "docs: document account & content feature tools"
```

---

## Self-Review (completed during planning)

**Spec coverage:** guard → Task 1; edit/pin/hashtags → Task 2; lists → Task 3; filters → Task 4; profile + follow-requests → Task 5; tools + wiring → Task 6; docs → Task 7. Every endpoint-map row maps to a tool in Task 6. ✓

**Type consistency:** feature fns take `(account, …)` and return shared types (`Status`, `Relationship`, `AccountInfo`) or local `Tag`/`List`/`Filter`/`AccountLite`. `AccountLite`/`AccountLiteSchema` defined in `lists.ts` (Task 3) and imported by `follow-requests.ts` (Task 5) — import path consistent. Tool handler names (`__handleEditPost`) match the test. `requireMastodonAccount(op, accountId?)` signature consistent across guard (Task 1) and all callers (Task 6).

**Placeholder scan:** none. Task 7 Step 1 is a prose doc edit (no code), acceptable.

**No-cycle check:** `mastodon-features/*` import only `write-adapter` (authenticatedFetch + schemas), `account-manager` (type), `adapters/resolve`, config, fetch-helpers, errors. None import `tools-content` or each other except `follow-requests → lists` (one-way, for `AccountLiteSchema`). No cycles.
