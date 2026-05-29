# Platform-Aware Write Layer + Misskey Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route authenticated write/read operations to the correct fediverse API per instance, adding a Misskey adapter so the "works with Misskey" claim becomes true, while keeping the Mastodon path behavior-preserving.

**Architecture:** A `WriteAdapter` interface with two implementations (`MastodonWriteAdapter` = today's logic moved verbatim; `MisskeyWriteAdapter` = new, normalizing Misskey responses into the existing Mastodon-shaped types). `AuthenticatedClient` becomes a thin router that resolves an adapter via the existing `getInstanceSoftware()` NodeInfo detection. Ops with no Misskey equivalent stay Mastodon-only and throw `UnsupportedOnPlatformError` on Misskey accounts.

**Tech Stack:** TypeScript (ESM), Zod v4, Vitest + MSW, LogTape.

**Spec:** `docs/superpowers/specs/2026-05-29-platform-aware-write-layer-design.md`

**Conventions (read before starting):**
- All commands run from repo root `/Users/cameron/Developer/activitypub-mcp`.
- Run a single test file: `npm run test -- tests/unit/<file>.test.ts`
- Run one test by name: `npm run test -- tests/unit/<file>.test.ts -t "name"`
- Typecheck: `npm run typecheck`  •  Lint+fix: `npm run lint:fix`
- Import paths use the `.js` extension even for `.ts` files (ESM/NodeNext). Match existing style.
- Misskey responses are normalized into the **existing** `Status`/`Relationship`/`AccountInfo` shapes — never invent new return types in this sub-project.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/utils/errors.ts` (modify) | Add `UnsupportedOnPlatformError` class. |
| `src/auth/adapters/write-adapter.ts` (create) | Shared schemas + types (moved from `authenticated-client.ts`), `WriteAdapter` interface, shared `authenticatedFetch()` helper, `NotificationItem` type. |
| `src/auth/adapters/mastodon-adapter.ts` (create) | `MastodonWriteAdapter implements WriteAdapter` — interface-method bodies moved from `authenticated-client.ts`, unchanged behavior. Exports `mastodonWriteAdapter` singleton. |
| `src/auth/adapters/misskey-adapter.ts` (create) | `MisskeyWriteAdapter implements WriteAdapter` — Misskey endpoints + normalizers. Exports `misskeyWriteAdapter` singleton. |
| `src/auth/adapters/resolve.ts` (create) | `resolveSoftwareKind(account)` and `resolveWriteAdapter(account)`. |
| `src/auth/authenticated-client.ts` (modify) | Becomes a router: interface ops delegate to the resolved adapter; Mastodon-only ops guard then use `authenticatedFetch`. Re-exports types for back-compat. |
| `src/auth/account-manager.ts` (modify) | `verifyAccount()` delegates to `resolveWriteAdapter(account).verifyCredentials(account)`. |
| `tests/unit/misskey-adapter.test.ts` (create) | Unit tests for the Misskey adapter (each op + normalization + error extraction). |
| `tests/unit/write-adapter-resolve.test.ts` (create) | Selection matrix tests. |
| `tests/unit/authenticated-client.test.ts` (modify) | Add a `getInstanceSoftware` mock; add unsupported-op-on-Misskey tests. |
| `README.md`, `CHANGELOG.md`, `.env.example` (modify) | Document Misskey support + platform-scoped-ID limitation. |

---

## Task 1: `UnsupportedOnPlatformError`

**Files:**
- Modify: `src/utils/errors.ts`
- Test: `tests/unit/utils.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/utils.test.ts`:

```ts
import { UnsupportedOnPlatformError } from "../../src/utils/errors.js";

describe("UnsupportedOnPlatformError", () => {
  it("formats a clear message with op and platform", () => {
    const err = new UnsupportedOnPlatformError("vote-on-poll", "Misskey");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnsupportedOnPlatformError");
    expect(err.op).toBe("vote-on-poll");
    expect(err.platform).toBe("Misskey");
    expect(err.message).toBe("vote-on-poll is not supported on Misskey");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/utils.test.ts -t "UnsupportedOnPlatformError"`
Expected: FAIL — `UnsupportedOnPlatformError` is not exported.

- [ ] **Step 3: Implement**

Append to `src/utils/errors.ts`:

```ts
/**
 * Thrown when an operation has no equivalent on the target fediverse software
 * (e.g. poll voting or scheduled posts on Misskey). Surfaced to the LLM as a
 * clear, actionable error instead of an opaque HTTP failure.
 */
export class UnsupportedOnPlatformError extends Error {
  constructor(
    public readonly op: string,
    public readonly platform: string,
  ) {
    super(`${op} is not supported on ${platform}`);
    this.name = "UnsupportedOnPlatformError";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/utils.test.ts -t "UnsupportedOnPlatformError"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/errors.ts tests/unit/utils.test.ts
git commit -m "feat: add UnsupportedOnPlatformError for platform-divergent ops"
```

---

## Task 2: Shared `write-adapter.ts` (types + interface + shared fetch)

This task **moves** the schemas/types currently in `authenticated-client.ts` into a shared module and defines the interface + the extracted `authenticatedFetch`. No behavior change yet — `authenticated-client.ts` will re-export and keep working.

**Files:**
- Create: `src/auth/adapters/write-adapter.ts`

- [ ] **Step 1: Create the file**

```ts
/**
 * Shared contracts for platform write adapters.
 *
 * Owns the normalized response schemas/types (Mastodon-shaped — Misskey
 * responses are normalized into these), the WriteAdapter interface every
 * platform implements, and the guarded authenticatedFetch helper both
 * adapters share.
 */

import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { MAX_RESPONSE_SIZE, REQUEST_TIMEOUT, USER_AGENT } from "../../config.js";
import { instanceBlocklist } from "../../policy/instance-blocklist.js";
import { fetchWithRedirectGuard } from "../../utils/fetch-helpers.js";
import { validateExternalUrl } from "../../validation/url.js";
import type { AccountCredentials } from "../account-manager.js";

const logger = getLogger("activitypub-mcp:write-adapter");

export type PostVisibility = "public" | "unlisted" | "private" | "direct";

export interface CreatePostOptions {
  content: string;
  spoilerText?: string;
  visibility?: PostVisibility;
  inReplyToId?: string;
  language?: string;
  sensitive?: boolean;
  mediaIds?: string[];
  poll?: { options: string[]; expiresIn: number; multiple?: boolean; hideTotals?: boolean };
  scheduledAt?: string;
  idempotencyKey?: string;
}

export const StatusSchema = z.object({
  id: z.string(),
  uri: z.string(),
  url: z.string().nullable().optional(),
  created_at: z.string(),
  content: z.string(),
  visibility: z.enum(["public", "unlisted", "private", "direct"]),
  sensitive: z.boolean(),
  spoiler_text: z.string(),
  reblogs_count: z.number(),
  favourites_count: z.number(),
  replies_count: z.number(),
  in_reply_to_id: z.string().nullable().optional(),
  in_reply_to_account_id: z.string().nullable().optional(),
  account: z.object({
    id: z.string(),
    username: z.string(),
    acct: z.string(),
    display_name: z.string().optional(),
    url: z.string(),
  }),
  media_attachments: z.array(z.any()).optional(),
  mentions: z.array(z.any()).optional(),
  tags: z.array(z.any()).optional(),
  poll: z.any().nullable().optional(),
});
export type Status = z.infer<typeof StatusSchema>;

export const RelationshipSchema = z.object({
  id: z.string(),
  following: z.boolean(),
  followed_by: z.boolean(),
  blocking: z.boolean(),
  blocked_by: z.boolean(),
  muting: z.boolean(),
  muting_notifications: z.boolean(),
  requested: z.boolean(),
  domain_blocking: z.boolean(),
  endorsed: z.boolean(),
  note: z.string().optional(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const MediaAttachmentSchema = z.object({
  id: z.string(),
  type: z.enum(["unknown", "image", "gifv", "video", "audio"]),
  url: z.string().nullable(),
  preview_url: z.string().nullable().optional(),
  remote_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  blurhash: z.string().nullable().optional(),
});
export type MediaAttachment = z.infer<typeof MediaAttachmentSchema>;

export const AccountInfoSchema = z.object({
  id: z.string(),
  username: z.string(),
  acct: z.string(),
  display_name: z.string().optional(),
  note: z.string().optional(),
  url: z.string(),
  avatar: z.string().optional(),
  header: z.string().optional(),
  followers_count: z.number(),
  following_count: z.number(),
  statuses_count: z.number(),
  created_at: z.string().optional(),
});
export type AccountInfo = z.infer<typeof AccountInfoSchema>;

export interface AccountLookup {
  id: string;
  username: string;
  acct: string;
  url: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  created_at: string;
  account: { id: string; username: string; acct: string };
  status?: Status;
}

export interface ListPageOptions {
  limit?: number;
  maxId?: string;
  minId?: string;
  sinceId?: string;
}

export interface FollowOptions {
  reblogs?: boolean;
  notify?: boolean;
  languages?: string[];
}

export interface MuteOptions {
  notifications?: boolean;
  duration?: number;
}

export interface UploadMediaOptions {
  filename?: string;
  description?: string;
  focus?: { x: number; y: number };
}

/**
 * The authenticated operations every platform adapter implements. Ops with no
 * cross-platform equivalent (bookmarks, polls, scheduled posts) are NOT here —
 * they remain Mastodon-only on AuthenticatedClient.
 */
export interface WriteAdapter {
  createPost(account: AccountCredentials, options: CreatePostOptions): Promise<Status>;
  deletePost(account: AccountCredentials, statusId: string): Promise<void>;
  boostPost(account: AccountCredentials, statusId: string): Promise<Status>;
  unboostPost(account: AccountCredentials, statusId: string): Promise<Status>;
  favouritePost(account: AccountCredentials, statusId: string): Promise<Status>;
  unfavouritePost(account: AccountCredentials, statusId: string): Promise<Status>;
  followAccount(
    account: AccountCredentials,
    targetId: string,
    options?: FollowOptions,
  ): Promise<Relationship>;
  unfollowAccount(account: AccountCredentials, targetId: string): Promise<Relationship>;
  muteAccount(
    account: AccountCredentials,
    targetId: string,
    options?: MuteOptions,
  ): Promise<Relationship>;
  unmuteAccount(account: AccountCredentials, targetId: string): Promise<Relationship>;
  blockAccount(account: AccountCredentials, targetId: string): Promise<Relationship>;
  unblockAccount(account: AccountCredentials, targetId: string): Promise<Relationship>;
  getRelationship(account: AccountCredentials, targetId: string): Promise<Relationship>;
  getRelationships(account: AccountCredentials, targetIds: string[]): Promise<Relationship[]>;
  lookupAccount(account: AccountCredentials, acct: string): Promise<AccountLookup>;
  verifyCredentials(account: AccountCredentials): Promise<AccountInfo>;
  uploadMedia(
    account: AccountCredentials,
    file: Buffer | Blob,
    options?: UploadMediaOptions,
  ): Promise<MediaAttachment>;
  getHomeTimeline(account: AccountCredentials, options?: ListPageOptions): Promise<Status[]>;
  getNotifications(
    account: AccountCredentials,
    options?: { limit?: number; maxId?: string; minId?: string; types?: string[]; excludeTypes?: string[] },
  ): Promise<NotificationItem[]>;
}

/**
 * Make a guarded authenticated request to `https://<account.instance><endpoint>`.
 * Applies SSRF allow-list, operator blocklist, timeout, and redirect re-validation.
 * Moved verbatim from authenticated-client.ts:185-231.
 */
export async function authenticatedFetch(
  account: AccountCredentials,
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `https://${account.instance}${endpoint}`;
  await validateExternalUrl(url);
  instanceBlocklist.validateNotBlocked(account.instance);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetchWithRedirectGuard(
      url,
      {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `${account.tokenType} ${account.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
      },
      async (target) => {
        await validateExternalUrl(target);
        instanceBlocklist.validateNotBlocked(new URL(target).hostname);
      },
    );
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out: ${endpoint}`);
    }
    throw error;
  }
}

export { logger as writeAdapterLogger, MAX_RESPONSE_SIZE };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (file is self-contained; `AccountCredentials` is a type-only import so no cycle).

- [ ] **Step 3: Commit**

```bash
git add src/auth/adapters/write-adapter.ts
git commit -m "feat: add WriteAdapter interface and shared authenticated fetch"
```

---

## Task 3: `MastodonWriteAdapter`

Move the interface-method bodies out of `authenticated-client.ts` into the adapter, changing only the signatures (account is now an explicit first arg instead of resolved internally). Bodies are otherwise the current code.

**Files:**
- Create: `src/auth/adapters/mastodon-adapter.ts`

- [ ] **Step 1: Create the adapter**

```ts
/**
 * Mastodon REST API write adapter. Also serves all Mastodon-API-compatible
 * software (Pleroma, Akkoma, GotoSocial, Sharkey, Firefish, Iceshrimp) and is
 * the fail-safe default when software detection is unavailable.
 */

import { z } from "zod";
import { MAX_RESPONSE_SIZE, USER_AGENT } from "../../config.js";
import { instanceBlocklist } from "../../policy/instance-blocklist.js";
import { fetchWithRedirectGuard, readJsonWithLimit } from "../../utils/fetch-helpers.js";
import { validateExternalUrl } from "../../validation/url.js";
import type { AccountCredentials } from "../account-manager.js";
import {
  type AccountInfo,
  AccountInfoSchema,
  type AccountLookup,
  type CreatePostOptions,
  type FollowOptions,
  type ListPageOptions,
  type MediaAttachment,
  MediaAttachmentSchema,
  type MuteOptions,
  type NotificationItem,
  type Relationship,
  RelationshipSchema,
  type Status,
  StatusSchema,
  type UploadMediaOptions,
  type WriteAdapter,
  authenticatedFetch,
} from "./write-adapter.js";

async function postAndParseStatus(
  account: AccountCredentials,
  endpoint: string,
  init: RequestInit,
  failVerb: string,
): Promise<Status> {
  const response = await authenticatedFetch(account, endpoint, init);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to ${failVerb}: HTTP ${response.status} - ${errorText}`);
  }
  return StatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

async function postAndParseRelationship(
  account: AccountCredentials,
  endpoint: string,
  init: RequestInit,
  failVerb: string,
): Promise<Relationship> {
  const response = await authenticatedFetch(account, endpoint, init);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to ${failVerb}: HTTP ${response.status} - ${errorText}`);
  }
  return RelationshipSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export class MastodonWriteAdapter implements WriteAdapter {
  async createPost(account: AccountCredentials, options: CreatePostOptions): Promise<Status> {
    const body: Record<string, unknown> = { status: options.content };
    if (options.spoilerText) body.spoiler_text = options.spoilerText;
    if (options.visibility) body.visibility = options.visibility;
    if (options.inReplyToId) body.in_reply_to_id = options.inReplyToId;
    if (options.language) body.language = options.language;
    if (options.sensitive !== undefined) body.sensitive = options.sensitive;
    if (options.mediaIds?.length) body.media_ids = options.mediaIds;
    if (options.poll) body.poll = options.poll;
    if (options.scheduledAt) body.scheduled_at = options.scheduledAt;

    const headers: Record<string, string> = {};
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    return postAndParseStatus(
      account,
      "/api/v1/statuses",
      { method: "POST", headers, body: JSON.stringify(body) },
      "create post",
    );
  }

  async deletePost(account: AccountCredentials, statusId: string): Promise<void> {
    const response = await authenticatedFetch(account, `/api/v1/statuses/${statusId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete post: HTTP ${response.status} - ${errorText}`);
    }
  }

  boostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    return postAndParseStatus(
      account,
      `/api/v1/statuses/${statusId}/reblog`,
      { method: "POST" },
      "boost post",
    );
  }

  unboostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    return postAndParseStatus(
      account,
      `/api/v1/statuses/${statusId}/unreblog`,
      { method: "POST" },
      "unboost post",
    );
  }

  favouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    return postAndParseStatus(
      account,
      `/api/v1/statuses/${statusId}/favourite`,
      { method: "POST" },
      "favourite post",
    );
  }

  unfavouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    return postAndParseStatus(
      account,
      `/api/v1/statuses/${statusId}/unfavourite`,
      { method: "POST" },
      "unfavourite post",
    );
  }

  followAccount(
    account: AccountCredentials,
    targetId: string,
    options?: FollowOptions,
  ): Promise<Relationship> {
    const body: Record<string, unknown> = {};
    if (options?.reblogs !== undefined) body.reblogs = options.reblogs;
    if (options?.notify !== undefined) body.notify = options.notify;
    if (options?.languages) body.languages = options.languages;
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/follow`,
      { method: "POST", body: Object.keys(body).length ? JSON.stringify(body) : undefined },
      "follow account",
    );
  }

  unfollowAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/unfollow`,
      { method: "POST" },
      "unfollow account",
    );
  }

  muteAccount(
    account: AccountCredentials,
    targetId: string,
    options?: MuteOptions,
  ): Promise<Relationship> {
    const body: Record<string, unknown> = {};
    if (options?.notifications !== undefined) body.notifications = options.notifications;
    if (options?.duration !== undefined) body.duration = options.duration;
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/mute`,
      { method: "POST", body: Object.keys(body).length ? JSON.stringify(body) : undefined },
      "mute account",
    );
  }

  unmuteAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/unmute`,
      { method: "POST" },
      "unmute account",
    );
  }

  blockAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/block`,
      { method: "POST" },
      "block account",
    );
  }

  unblockAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/unblock`,
      { method: "POST" },
      "unblock account",
    );
  }

  async getRelationship(account: AccountCredentials, targetId: string): Promise<Relationship> {
    const results = await this.getRelationships(account, [targetId]);
    if (results.length === 0) throw new Error("No relationship data returned");
    return results[0];
  }

  async getRelationships(
    account: AccountCredentials,
    targetIds: string[],
  ): Promise<Relationship[]> {
    const params = new URLSearchParams();
    for (const id of targetIds) params.append("id[]", id);
    const response = await authenticatedFetch(
      account,
      `/api/v1/accounts/relationships?${params}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get relationship: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(RelationshipSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async lookupAccount(account: AccountCredentials, acct: string): Promise<AccountLookup> {
    const response = await authenticatedFetch(
      account,
      `/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to lookup account: HTTP ${response.status} - ${errorText}`);
    }
    return await readJsonWithLimit<AccountLookup>(response, MAX_RESPONSE_SIZE);
  }

  async verifyCredentials(account: AccountCredentials): Promise<AccountInfo> {
    const response = await authenticatedFetch(account, "/api/v1/accounts/verify_credentials", {
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Failed to verify credentials: HTTP ${response.status}`);
    }
    return AccountInfoSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async uploadMedia(
    account: AccountCredentials,
    file: Buffer | Blob,
    options?: UploadMediaOptions,
  ): Promise<MediaAttachment> {
    const formData = new FormData();
    const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)]);
    formData.append("file", blob, options?.filename || "upload");
    if (options?.description) formData.append("description", options.description);
    if (options?.focus) formData.append("focus", `${options.focus.x},${options.focus.y}`);

    const url = `https://${account.instance}/api/v2/media`;
    await validateExternalUrl(url);
    instanceBlocklist.validateNotBlocked(account.instance);

    const response = await fetchWithRedirectGuard(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `${account.tokenType} ${account.accessToken}`,
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: formData,
      },
      async (target) => {
        await validateExternalUrl(target);
        instanceBlocklist.validateNotBlocked(new URL(target).hostname);
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload media: HTTP ${response.status} - ${errorText}`);
    }
    return MediaAttachmentSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getHomeTimeline(
    account: AccountCredentials,
    options?: ListPageOptions,
  ): Promise<Status[]> {
    const { limit = 20, maxId, minId, sinceId } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    if (sinceId) params.set("since_id", sinceId);
    const response = await authenticatedFetch(account, `/api/v1/timelines/home?${params}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get home timeline: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(StatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getNotifications(
    account: AccountCredentials,
    options?: { limit?: number; maxId?: string; minId?: string; types?: string[]; excludeTypes?: string[] },
  ): Promise<NotificationItem[]> {
    const { limit = 20, maxId, minId, types, excludeTypes } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    if (types) for (const t of types) params.append("types[]", t);
    if (excludeTypes) for (const t of excludeTypes) params.append("exclude_types[]", t);
    const response = await authenticatedFetch(account, `/api/v1/notifications?${params}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get notifications: HTTP ${response.status} - ${errorText}`);
    }
    return await readJsonWithLimit<NotificationItem[]>(response, MAX_RESPONSE_SIZE);
  }
}

export const mastodonWriteAdapter = new MastodonWriteAdapter();
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/auth/adapters/mastodon-adapter.ts
git commit -m "feat: add MastodonWriteAdapter implementing WriteAdapter"
```

---

## Task 4: `MisskeyWriteAdapter` — normalizers + post ops

Misskey ops are `POST` with JSON body and Bearer auth (reuse `authenticatedFetch`). Build the adapter in two tasks: normalizers + note ops here (Task 4), social/account/media/timeline ops in Task 5.

**Files:**
- Create: `src/auth/adapters/misskey-adapter.ts`
- Test: `tests/unit/misskey-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MisskeyWriteAdapter } from "../../src/auth/adapters/misskey-adapter.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const account = {
  id: "mk",
  instance: "misskey.test",
  accessToken: "tok",
  tokenType: "Bearer",
  username: "alice",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

const adapter = new MisskeyWriteAdapter();

const sampleNote = {
  id: "note1",
  createdAt: "2026-01-01T00:00:00Z",
  text: "hello mfm",
  cw: null,
  visibility: "home",
  renoteCount: 2,
  repliesCount: 1,
  reactions: { "👍": 3, "🎉": 1 },
  user: { id: "u1", username: "alice", host: null, name: "Alice" },
};

describe("MisskeyWriteAdapter.createPost", () => {
  it("maps visibility and normalizes the created note to a Status", async () => {
    let received: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/notes/create", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ createdNote: sampleNote });
      }),
    );

    const status = await adapter.createPost(account, {
      content: "hello mfm",
      visibility: "unlisted",
      spoilerText: "cw",
    });

    expect(received?.text).toBe("hello mfm");
    expect(received?.visibility).toBe("home"); // unlisted -> home
    expect(received?.cw).toBe("cw");
    expect(status.id).toBe("note1");
    expect(status.content).toBe("hello mfm");
    expect(status.visibility).toBe("unlisted"); // home -> unlisted
    expect(status.reblogs_count).toBe(2);
    expect(status.favourites_count).toBe(4); // 3 + 1 reactions
    expect(status.replies_count).toBe(1);
    expect(status.account.acct).toBe("alice");
  });

  it("extracts Misskey error messages", async () => {
    server.use(
      http.post("https://misskey.test/api/notes/create", () =>
        HttpResponse.json({ error: { message: "Permission denied", code: "PERMISSION" } }, { status: 403 }),
      ),
    );
    await expect(adapter.createPost(account, { content: "x" })).rejects.toThrow(/Permission denied/);
  });
});

describe("MisskeyWriteAdapter.boostPost", () => {
  it("renotes via notes/create with renoteId", async () => {
    let received: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/notes/create", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ createdNote: { ...sampleNote, id: "renote1" } });
      }),
    );
    const status = await adapter.boostPost(account, "note1");
    expect(received?.renoteId).toBe("note1");
    expect(status.id).toBe("renote1");
  });
});

describe("MisskeyWriteAdapter.favouritePost", () => {
  it("creates a default reaction and returns the target note as Status", async () => {
    let reactBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/notes/reactions/create", async ({ request }) => {
        reactBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("https://misskey.test/api/notes/show", () => HttpResponse.json(sampleNote)),
    );
    const status = await adapter.favouritePost(account, "note1");
    expect(reactBody?.noteId).toBe("note1");
    expect(reactBody?.reaction).toBe("👍");
    expect(status.id).toBe("note1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/unit/misskey-adapter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement normalizers + note ops**

```ts
/**
 * Misskey / Foundkey write adapter. Misskey's API diverges from Mastodon's
 * (reactions instead of favourites, renote instead of boost), so responses are
 * normalized into the shared Mastodon-shaped Status/Relationship/AccountInfo.
 *
 * Auth: Authorization: Bearer <token> (Misskey >= 12, Foundkey).
 * IDs are platform-scoped — a noteId/userId must come from the same instance.
 */

import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import {
  type AccountInfo,
  type AccountLookup,
  type CreatePostOptions,
  type FollowOptions,
  type ListPageOptions,
  type MediaAttachment,
  type MuteOptions,
  type NotificationItem,
  type PostVisibility,
  type Relationship,
  type Status,
  type UploadMediaOptions,
  type WriteAdapter,
  authenticatedFetch,
} from "./write-adapter.js";

const DEFAULT_REACTION = "👍";

interface MisskeyUser {
  id: string;
  username: string;
  host: string | null;
  name?: string | null;
  url?: string | null;
  uri?: string | null;
  followersCount?: number;
  followingCount?: number;
  notesCount?: number;
  description?: string | null;
  avatarUrl?: string | null;
}

interface MisskeyNote {
  id: string;
  createdAt: string;
  text: string | null;
  cw?: string | null;
  visibility: "public" | "home" | "followers" | "specified";
  renoteCount?: number;
  repliesCount?: number;
  reactions?: Record<string, number>;
  uri?: string;
  url?: string;
  user: MisskeyUser;
}

function mastodonToMisskeyVisibility(v?: PostVisibility): string {
  switch (v) {
    case "unlisted":
      return "home";
    case "private":
      return "followers";
    case "direct":
      return "specified";
    default:
      return "public";
  }
}

function misskeyToMastodonVisibility(v: string): PostVisibility {
  switch (v) {
    case "home":
      return "unlisted";
    case "followers":
      return "private";
    case "specified":
      return "direct";
    default:
      return "public";
  }
}

function userToAccount(user: MisskeyUser, instance: string): Status["account"] {
  const acct = user.host ? `${user.username}@${user.host}` : user.username;
  const base = user.host ? `https://${user.host}` : `https://${instance}`;
  return {
    id: user.id,
    username: user.username,
    acct,
    display_name: user.name ?? undefined,
    url: user.url ?? user.uri ?? `${base}/@${user.username}`,
  };
}

function noteToStatus(note: MisskeyNote, instance: string): Status {
  const reactionsTotal = note.reactions
    ? Object.values(note.reactions).reduce((a, b) => a + b, 0)
    : 0;
  const fallbackUrl = `https://${instance}/notes/${note.id}`;
  return {
    id: note.id,
    uri: note.uri ?? fallbackUrl,
    url: note.url ?? fallbackUrl,
    created_at: note.createdAt,
    content: note.text ?? "",
    visibility: misskeyToMastodonVisibility(note.visibility),
    sensitive: !!note.cw,
    spoiler_text: note.cw ?? "",
    reblogs_count: note.renoteCount ?? 0,
    favourites_count: reactionsTotal,
    replies_count: note.repliesCount ?? 0,
    account: userToAccount(note.user, instance),
  };
}

/** POST a Misskey endpoint; throw with the Misskey error message on failure. */
async function misskeyPost<T = unknown>(
  account: AccountCredentials,
  endpoint: string,
  body: Record<string, unknown>,
  failVerb: string,
): Promise<T | undefined> {
  const response = await authenticatedFetch(account, endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await readJsonWithLimit<{ error?: { message?: string } }>(
        response,
        MAX_RESPONSE_SIZE,
      ));
      if (data?.error?.message) message = data.error.message;
    } catch {
      // body not JSON — keep the HTTP status message
    }
    throw new Error(`Failed to ${failVerb}: ${message}`);
  }
  if (response.status === 204) return undefined;
  return (await readJsonWithLimit<T>(response, MAX_RESPONSE_SIZE)) as T;
}

export class MisskeyWriteAdapter implements WriteAdapter {
  async createPost(account: AccountCredentials, options: CreatePostOptions): Promise<Status> {
    const body: Record<string, unknown> = {
      text: options.content,
      visibility: mastodonToMisskeyVisibility(options.visibility),
    };
    if (options.spoilerText) body.cw = options.spoilerText;
    if (options.inReplyToId) body.replyId = options.inReplyToId;
    if (options.mediaIds?.length) body.fileIds = options.mediaIds;
    if (options.poll) {
      body.poll = {
        choices: options.poll.options,
        expiredAfter: options.poll.expiresIn * 1000,
        multiple: options.poll.multiple ?? false,
      };
    }
    const data = await misskeyPost<{ createdNote: MisskeyNote }>(
      account,
      "/api/notes/create",
      body,
      "create post",
    );
    return noteToStatus(data!.createdNote, account.instance);
  }

  async deletePost(account: AccountCredentials, statusId: string): Promise<void> {
    await misskeyPost(account, "/api/notes/delete", { noteId: statusId }, "delete post");
  }

  async boostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    const data = await misskeyPost<{ createdNote: MisskeyNote }>(
      account,
      "/api/notes/create",
      { renoteId: statusId },
      "boost post",
    );
    return noteToStatus(data!.createdNote, account.instance);
  }

  async unboostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPost(account, "/api/notes/unrenote", { noteId: statusId }, "unboost post");
    return this.showNoteAsStatus(account, statusId);
  }

  async favouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPost(
      account,
      "/api/notes/reactions/create",
      { noteId: statusId, reaction: DEFAULT_REACTION },
      "favourite post",
    );
    return this.showNoteAsStatus(account, statusId);
  }

  async unfavouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPost(
      account,
      "/api/notes/reactions/delete",
      { noteId: statusId },
      "unfavourite post",
    );
    return this.showNoteAsStatus(account, statusId);
  }

  /** Fetch a note and normalize it (used after reaction/renote ops that return 204). */
  private async showNoteAsStatus(account: AccountCredentials, noteId: string): Promise<Status> {
    const note = await misskeyPost<MisskeyNote>(
      account,
      "/api/notes/show",
      { noteId },
      "fetch note",
    );
    return noteToStatus(note!, account.instance);
  }

  // --- social / account / media / timeline ops added in Task 5 ---
  followAccount!: WriteAdapter["followAccount"];
  unfollowAccount!: WriteAdapter["unfollowAccount"];
  muteAccount!: WriteAdapter["muteAccount"];
  unmuteAccount!: WriteAdapter["unmuteAccount"];
  blockAccount!: WriteAdapter["blockAccount"];
  unblockAccount!: WriteAdapter["unblockAccount"];
  getRelationship!: WriteAdapter["getRelationship"];
  getRelationships!: WriteAdapter["getRelationships"];
  lookupAccount!: WriteAdapter["lookupAccount"];
  verifyCredentials!: WriteAdapter["verifyCredentials"];
  uploadMedia!: WriteAdapter["uploadMedia"];
  getHomeTimeline!: WriteAdapter["getHomeTimeline"];
  getNotifications!: WriteAdapter["getNotifications"];
}

export const misskeyWriteAdapter = new MisskeyWriteAdapter();
```

> Note: the `!:` definite-assignment stubs let Task 4 compile and pass its tests
> before Task 5 fills in the remaining methods. Task 5 replaces each stub with a
> real method. (Helpers `mastodonToMisskeyVisibility`, `userToAccount`, etc. are
> used by Task 5 too — leave them in place.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/unit/misskey-adapter.test.ts`
Expected: PASS (createPost, boostPost, favouritePost specs).

- [ ] **Step 5: Commit**

```bash
git add src/auth/adapters/misskey-adapter.ts tests/unit/misskey-adapter.test.ts
git commit -m "feat: add Misskey adapter note ops + normalizers"
```

---

## Task 5: `MisskeyWriteAdapter` — social, account, media, timeline ops

**Files:**
- Modify: `src/auth/adapters/misskey-adapter.ts`
- Test: `tests/unit/misskey-adapter.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("MisskeyWriteAdapter social ops", () => {
  it("follows then normalizes users/relation to a Relationship", async () => {
    let relBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/following/create", () => HttpResponse.json({ id: "u2" })),
      http.post("https://misskey.test/api/users/relation", async ({ request }) => {
        relBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ isFollowing: true, isFollowed: false, isBlocking: false, isMuted: false, hasPendingFollowRequestFromYou: false });
      }),
    );
    const rel = await adapter.followAccount(account, "u2");
    expect(relBody?.userId).toBe("u2");
    expect(rel.following).toBe(true);
    expect(rel.muting).toBe(false);
    expect(rel.id).toBe("u2");
  });

  it("mutes an account", async () => {
    server.use(
      http.post("https://misskey.test/api/mute/create", () => new HttpResponse(null, { status: 204 })),
      http.post("https://misskey.test/api/users/relation", () => HttpResponse.json({ isMuted: true })),
    );
    const rel = await adapter.muteAccount(account, "u2");
    expect(rel.muting).toBe(true);
  });
});

describe("MisskeyWriteAdapter account ops", () => {
  it("verifyCredentials maps /api/i to AccountInfo", async () => {
    server.use(
      http.post("https://misskey.test/api/i", () =>
        HttpResponse.json({
          id: "u1",
          username: "alice",
          host: null,
          name: "Alice",
          followersCount: 10,
          followingCount: 5,
          notesCount: 42,
          url: "https://misskey.test/@alice",
        }),
      ),
    );
    const info = await adapter.verifyCredentials(account);
    expect(info.id).toBe("u1");
    expect(info.acct).toBe("alice");
    expect(info.followers_count).toBe(10);
    expect(info.statuses_count).toBe(42);
  });

  it("lookupAccount splits acct into username/host", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/users/show", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "u3", username: "bob", host: "remote.example", url: "https://remote.example/@bob" });
      }),
    );
    const r = await adapter.lookupAccount(account, "bob@remote.example");
    expect(body?.username).toBe("bob");
    expect(body?.host).toBe("remote.example");
    expect(r.acct).toBe("bob@remote.example");
  });
});

describe("MisskeyWriteAdapter timeline", () => {
  it("getHomeTimeline normalizes notes", async () => {
    server.use(
      http.post("https://misskey.test/api/notes/timeline", () => HttpResponse.json([sampleNote])),
    );
    const tl = await adapter.getHomeTimeline(account, { limit: 5 });
    expect(tl).toHaveLength(1);
    expect(tl[0].id).toBe("note1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/unit/misskey-adapter.test.ts -t "social ops"`
Expected: FAIL — stub methods throw / are undefined.

- [ ] **Step 3: Implement — replace the stub block**

Replace the `// --- social / account / media / timeline ops added in Task 5 ---` block and all the `!:` stub lines with:

```ts
  private async relation(account: AccountCredentials, userId: string): Promise<Relationship> {
    const rel = await misskeyPost<{
      isFollowing?: boolean;
      isFollowed?: boolean;
      isBlocking?: boolean;
      isMuted?: boolean;
      hasPendingFollowRequestFromYou?: boolean;
    }>(account, "/api/users/relation", { userId }, "get relationship");
    return {
      id: userId,
      following: rel?.isFollowing ?? false,
      followed_by: rel?.isFollowed ?? false,
      blocking: rel?.isBlocking ?? false,
      blocked_by: false,
      muting: rel?.isMuted ?? false,
      muting_notifications: false,
      requested: rel?.hasPendingFollowRequestFromYou ?? false,
      domain_blocking: false,
      endorsed: false,
    };
  }

  async followAccount(
    account: AccountCredentials,
    targetId: string,
    _options?: FollowOptions,
  ): Promise<Relationship> {
    await misskeyPost(account, "/api/following/create", { userId: targetId }, "follow account");
    return this.relation(account, targetId);
  }

  async unfollowAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    await misskeyPost(account, "/api/following/delete", { userId: targetId }, "unfollow account");
    return this.relation(account, targetId);
  }

  async muteAccount(
    account: AccountCredentials,
    targetId: string,
    _options?: MuteOptions,
  ): Promise<Relationship> {
    await misskeyPost(account, "/api/mute/create", { userId: targetId }, "mute account");
    return this.relation(account, targetId);
  }

  async unmuteAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    await misskeyPost(account, "/api/mute/delete", { userId: targetId }, "unmute account");
    return this.relation(account, targetId);
  }

  async blockAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    await misskeyPost(account, "/api/blocking/create", { userId: targetId }, "block account");
    return this.relation(account, targetId);
  }

  async unblockAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    await misskeyPost(account, "/api/blocking/delete", { userId: targetId }, "unblock account");
    return this.relation(account, targetId);
  }

  getRelationship(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return this.relation(account, targetId);
  }

  async getRelationships(
    account: AccountCredentials,
    targetIds: string[],
  ): Promise<Relationship[]> {
    return Promise.all(targetIds.map((id) => this.relation(account, id)));
  }

  async lookupAccount(account: AccountCredentials, acct: string): Promise<AccountLookup> {
    const trimmed = acct.startsWith("@") ? acct.slice(1) : acct;
    const [username, host] = trimmed.split("@");
    const body: Record<string, unknown> = { username };
    if (host) body.host = host;
    const user = await misskeyPost<MisskeyUser>(account, "/api/users/show", body, "lookup account");
    const a = userToAccount(user!, account.instance);
    return { id: a.id, username: a.username, acct: a.acct, url: a.url };
  }

  async verifyCredentials(account: AccountCredentials): Promise<AccountInfo> {
    const user = await misskeyPost<MisskeyUser>(account, "/api/i", {}, "verify credentials");
    const a = userToAccount(user!, account.instance);
    return {
      id: a.id,
      username: a.username,
      acct: a.acct,
      display_name: a.display_name,
      note: user!.description ?? undefined,
      url: a.url,
      avatar: user!.avatarUrl ?? undefined,
      followers_count: user!.followersCount ?? 0,
      following_count: user!.followingCount ?? 0,
      statuses_count: user!.notesCount ?? 0,
    };
  }

  async uploadMedia(
    account: AccountCredentials,
    file: Buffer | Blob,
    options?: UploadMediaOptions,
  ): Promise<MediaAttachment> {
    const formData = new FormData();
    const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)]);
    formData.append("file", blob, options?.filename || "upload");
    if (options?.filename) formData.append("name", options.filename);
    if (options?.description) formData.append("comment", options.description);
    // Drive file create uses multipart; authenticatedFetch sets Content-Type
    // to application/json by default, so override via FormData (undefined lets
    // fetch set the multipart boundary).
    const response = await authenticatedFetch(account, "/api/drive/files/create", {
      method: "POST",
      headers: { "Content-Type": "" },
      body: formData,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to upload media: HTTP ${response.status} - ${text}`);
    }
    const f = await readJsonWithLimit<{
      id: string;
      type?: string;
      url?: string | null;
      thumbnailUrl?: string | null;
      comment?: string | null;
      blurhash?: string | null;
    }>(response, MAX_RESPONSE_SIZE);
    const mt = (f.type ?? "").split("/")[0];
    const type =
      mt === "image" || mt === "video" || mt === "audio"
        ? (mt as MediaAttachment["type"])
        : "unknown";
    return {
      id: f.id,
      type,
      url: f.url ?? null,
      preview_url: f.thumbnailUrl ?? null,
      description: f.comment ?? null,
      blurhash: f.blurhash ?? null,
    };
  }

  async getHomeTimeline(
    account: AccountCredentials,
    options?: ListPageOptions,
  ): Promise<Status[]> {
    const body: Record<string, unknown> = { limit: options?.limit ?? 20 };
    if (options?.maxId) body.untilId = options.maxId;
    if (options?.sinceId) body.sinceId = options.sinceId;
    const notes = await misskeyPost<MisskeyNote[]>(
      account,
      "/api/notes/timeline",
      body,
      "get home timeline",
    );
    return (notes ?? []).map((n) => noteToStatus(n, account.instance));
  }

  async getNotifications(
    account: AccountCredentials,
    options?: { limit?: number; maxId?: string; minId?: string },
  ): Promise<NotificationItem[]> {
    const body: Record<string, unknown> = { limit: options?.limit ?? 20 };
    if (options?.maxId) body.untilId = options.maxId;
    if (options?.minId) body.sinceId = options.minId;
    const items = await misskeyPost<
      Array<{ id: string; type: string; createdAt: string; user?: MisskeyUser; note?: MisskeyNote }>
    >(account, "/api/i/notifications", body, "get notifications");
    return (items ?? []).map((n) => {
      const acc = n.user
        ? userToAccount(n.user, account.instance)
        : { id: "", username: "", acct: "", url: "" };
      return {
        id: n.id,
        type: n.type,
        created_at: n.createdAt,
        account: { id: acc.id, username: acc.username, acct: acc.acct },
        status: n.note ? noteToStatus(n.note, account.instance) : undefined,
      };
    });
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/unit/misskey-adapter.test.ts`
Expected: PASS (all Misskey adapter specs).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `MisskeyWriteAdapter` fully satisfies `WriteAdapter`.

- [ ] **Step 6: Commit**

```bash
git add src/auth/adapters/misskey-adapter.ts tests/unit/misskey-adapter.test.ts
git commit -m "feat: complete Misskey adapter social/account/media/timeline ops"
```

---

## Task 6: Adapter resolution (`resolve.ts`)

**Files:**
- Create: `src/auth/adapters/resolve.ts`
- Test: `tests/unit/write-adapter-resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/discovery/nodeinfo.js", () => ({
  getInstanceSoftware: vi.fn(),
}));

import { getInstanceSoftware } from "../../src/discovery/nodeinfo.js";
import { mastodonWriteAdapter } from "../../src/auth/adapters/mastodon-adapter.js";
import { misskeyWriteAdapter } from "../../src/auth/adapters/misskey-adapter.js";
import { resolveSoftwareKind, resolveWriteAdapter } from "../../src/auth/adapters/resolve.js";

const account = {
  id: "a",
  instance: "example.test",
  accessToken: "t",
  tokenType: "Bearer",
  username: "u",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

function detected(name: string | null) {
  return {
    domain: "example.test",
    detection: name ? "success" : "unavailable",
    software: name ? { name, version: "1.0" } : null,
    protocols: name ? ["activitypub"] : null,
    openRegistrations: null,
  };
}

afterEach(() => vi.clearAllMocks());

describe("resolveSoftwareKind", () => {
  it.each([
    ["misskey", "misskey"],
    ["Misskey", "misskey"],
    ["foundkey", "misskey"],
    ["mastodon", "mastodon"],
    ["pleroma", "mastodon"],
    ["akkoma", "mastodon"],
    ["sharkey", "mastodon"],
    ["firefish", "mastodon"],
    ["iceshrimp", "mastodon"],
    ["gotosocial", "mastodon"],
    ["totally-unknown", "mastodon"],
  ])("maps software %s -> %s", async (name, kind) => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected(name) as never);
    expect(await resolveSoftwareKind(account)).toBe(kind);
  });

  it("defaults to mastodon when detection is unavailable", async () => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected(null) as never);
    expect(await resolveSoftwareKind(account)).toBe("mastodon");
  });
});

describe("resolveWriteAdapter", () => {
  it("returns the Misskey adapter for misskey", async () => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected("misskey") as never);
    expect(await resolveWriteAdapter(account)).toBe(misskeyWriteAdapter);
  });
  it("returns the Mastodon adapter otherwise", async () => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected("pleroma") as never);
    expect(await resolveWriteAdapter(account)).toBe(mastodonWriteAdapter);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/unit/write-adapter-resolve.test.ts`
Expected: FAIL — `resolve.js` not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Picks the write adapter for an account based on detected instance software.
 * Only Misskey-family software (no Mastodon-compatible API) uses the Misskey
 * adapter; everything else — including detection failures — defaults to the
 * Mastodon adapter, which is correct for Pleroma/Akkoma/GotoSocial/Sharkey/
 * Firefish/Iceshrimp.
 */

import { getInstanceSoftware } from "../../discovery/nodeinfo.js";
import type { AccountCredentials } from "../account-manager.js";
import { mastodonWriteAdapter } from "./mastodon-adapter.js";
import { misskeyWriteAdapter } from "./misskey-adapter.js";
import type { WriteAdapter } from "./write-adapter.js";

export type SoftwareKind = "mastodon" | "misskey";

const MISSKEY_FAMILY = new Set(["misskey", "foundkey"]);

export async function resolveSoftwareKind(account: AccountCredentials): Promise<SoftwareKind> {
  const info = await getInstanceSoftware(account.instance);
  const name = info.software?.name?.toLowerCase();
  return name && MISSKEY_FAMILY.has(name) ? "misskey" : "mastodon";
}

export async function resolveWriteAdapter(account: AccountCredentials): Promise<WriteAdapter> {
  const kind = await resolveSoftwareKind(account);
  return kind === "misskey" ? misskeyWriteAdapter : mastodonWriteAdapter;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/unit/write-adapter-resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/adapters/resolve.ts tests/unit/write-adapter-resolve.test.ts
git commit -m "feat: add write-adapter resolution by detected software"
```

---

## Task 7: Turn `AuthenticatedClient` into a router

Rewrite `authenticated-client.ts` so interface ops delegate to the resolved adapter and Mastodon-only ops guard against Misskey. Public method signatures and the `authenticatedClient` singleton are unchanged. Types are re-exported from `write-adapter.ts`.

**Files:**
- Modify: `src/auth/authenticated-client.ts`
- Modify: `tests/unit/authenticated-client.test.ts`

- [ ] **Step 1: Add the offline `getInstanceSoftware` mock + unsupported-op tests**

At the top of `tests/unit/authenticated-client.test.ts`, after the existing `vi.mock("../../src/validation/url.js", …)` block, add:

```ts
// Force the Mastodon path offline: without this the router would fetch
// /.well-known/nodeinfo from example.social over the real network.
vi.mock("../../src/discovery/nodeinfo.js", () => ({
  getInstanceSoftware: vi.fn().mockResolvedValue({
    domain: "example.social",
    detection: "success",
    software: { name: "mastodon", version: "4.3.0" },
    protocols: ["activitypub"],
    openRegistrations: true,
  }),
  clearNodeInfoCache: vi.fn(),
}));
```

Then append a describe block:

```ts
import { getInstanceSoftware } from "../../src/discovery/nodeinfo.js";
import { UnsupportedOnPlatformError } from "../../src/utils/errors.js";

describe("AuthenticatedClient Mastodon-only ops on Misskey", () => {
  beforeEach(() => {
    vi.mocked(getInstanceSoftware).mockResolvedValue({
      domain: "example.social",
      detection: "success",
      software: { name: "misskey", version: "2024.1" },
      protocols: ["activitypub"],
      openRegistrations: true,
    } as never);
  });

  it("throws UnsupportedOnPlatformError for voteOnPoll", async () => {
    await expect(client.voteOnPoll("poll-1", [0])).rejects.toBeInstanceOf(
      UnsupportedOnPlatformError,
    );
  });

  it("throws UnsupportedOnPlatformError for bookmarkPost without making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(client.bookmarkPost("post-1")).rejects.toThrow(/not supported on Misskey/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("throws UnsupportedOnPlatformError for getScheduledPosts", async () => {
    await expect(client.getScheduledPosts()).rejects.toBeInstanceOf(UnsupportedOnPlatformError);
  });
});
```

> Note: this `beforeEach` overrides the file-level default mock only inside this
> describe block. The existing describe blocks keep the Mastodon default.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm run test -- tests/unit/authenticated-client.test.ts -t "Mastodon-only ops on Misskey"`
Expected: FAIL — methods don't guard yet (they'd attempt a Mastodon call).

- [ ] **Step 3: Rewrite `authenticated-client.ts`**

Replace the entire file with:

```ts
/**
 * Authenticated client for write operations.
 *
 * Thin router over platform write adapters: interface ops delegate to the
 * adapter resolved from the instance's detected software; Mastodon-only ops
 * (bookmarks, polls, scheduled posts) guard against Misskey accounts and
 * otherwise call the Mastodon REST API directly via the shared fetch helper.
 */

import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../config.js";
import { UnsupportedOnPlatformError } from "../utils/errors.js";
import { readJsonWithLimit } from "../utils/fetch-helpers.js";
import { type AccountCredentials, accountManager } from "./account-manager.js";
import { resolveSoftwareKind, resolveWriteAdapter } from "./adapters/resolve.js";
import {
  type CreatePostOptions,
  type ListPageOptions,
  type MediaAttachment,
  type NotificationItem,
  type Relationship,
  type Status,
  StatusSchema,
  type WriteAdapter,
  authenticatedFetch,
} from "./adapters/write-adapter.js";

// Re-export shared types so existing importers (tools-write.ts) are unaffected.
export type {
  CreatePostOptions,
  MediaAttachment,
  PostVisibility,
  Relationship,
  Status,
} from "./adapters/write-adapter.js";

const logger = getLogger("activitypub-mcp:authenticated-client");

// Poll + scheduled-status schemas stay here — they back Mastodon-only ops.
const PollSchema = z.object({
  id: z.string(),
  expires_at: z.string().nullable(),
  expired: z.boolean(),
  multiple: z.boolean(),
  votes_count: z.number(),
  voters_count: z.number().nullable().optional(),
  voted: z.boolean().optional(),
  own_votes: z.array(z.number()).optional(),
  options: z.array(z.object({ title: z.string(), votes_count: z.number().nullable() })),
});
export type Poll = z.infer<typeof PollSchema>;

const ScheduledStatusSchema = z.object({
  id: z.string(),
  scheduled_at: z.string(),
  params: z.object({
    text: z.string().optional(),
    visibility: z.enum(["public", "unlisted", "private", "direct"]).optional(),
    spoiler_text: z.string().optional(),
    media_ids: z.array(z.string()).nullable().optional(),
    in_reply_to_id: z.string().nullable().optional(),
    poll: z
      .object({
        options: z.array(z.string()),
        expires_in: z.number(),
        multiple: z.boolean().optional(),
        hide_totals: z.boolean().optional(),
      })
      .nullable()
      .optional(),
  }),
  media_attachments: z.array(z.any()).optional(),
});
export type ScheduledStatus = z.infer<typeof ScheduledStatusSchema>;

export class AuthenticatedClient {
  private requireActiveAccount(): AccountCredentials {
    const account = accountManager.getActiveAccount();
    if (!account) {
      throw new Error(
        "No authenticated account configured. Set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables, or use the account management tools.",
      );
    }
    return account;
  }

  private getAccountOrActive(accountId?: string): AccountCredentials {
    if (accountId) {
      const account = accountManager.getAccount(accountId);
      if (!account) throw new Error(`Account not found: ${accountId}`);
      return account;
    }
    return this.requireActiveAccount();
  }

  /** Resolve account + its platform adapter for an interface op. */
  private async resolve(
    accountId?: string,
  ): Promise<{ account: AccountCredentials; adapter: WriteAdapter }> {
    const account = this.getAccountOrActive(accountId);
    const adapter = await resolveWriteAdapter(account);
    return { account, adapter };
  }

  /** Guard a Mastodon-only op; throw a clear error on Misskey accounts. */
  private async assertMastodonApi(
    op: string,
    accountId?: string,
  ): Promise<AccountCredentials> {
    const account = this.getAccountOrActive(accountId);
    const kind = await resolveSoftwareKind(account);
    if (kind === "misskey") throw new UnsupportedOnPlatformError(op, "Misskey");
    return account;
  }

  // --- Interface ops: delegate to the resolved adapter ---

  async createPost(options: CreatePostOptions, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    logger.info("Creating post", { instance: account.instance, visibility: options.visibility || "public" });
    return adapter.createPost(account, options);
  }

  async deletePost(statusId: string, accountId?: string): Promise<void> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.deletePost(account, statusId);
  }

  async boostPost(statusId: string, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.boostPost(account, statusId);
  }

  async unboostPost(statusId: string, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unboostPost(account, statusId);
  }

  async favouritePost(statusId: string, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.favouritePost(account, statusId);
  }

  async unfavouritePost(statusId: string, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unfavouritePost(account, statusId);
  }

  async followAccount(
    targetAccountId: string,
    options?: { reblogs?: boolean; notify?: boolean; languages?: string[] },
    accountId?: string,
  ): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.followAccount(account, targetAccountId, options);
  }

  async unfollowAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unfollowAccount(account, targetAccountId);
  }

  async muteAccount(
    targetAccountId: string,
    options?: { notifications?: boolean; duration?: number },
    accountId?: string,
  ): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.muteAccount(account, targetAccountId, options);
  }

  async unmuteAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unmuteAccount(account, targetAccountId);
  }

  async blockAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.blockAccount(account, targetAccountId);
  }

  async unblockAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unblockAccount(account, targetAccountId);
  }

  async getRelationship(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.getRelationship(account, targetAccountId);
  }

  async getRelationships(targetAccountIds: string[], accountId?: string): Promise<Relationship[]> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.getRelationships(account, targetAccountIds);
  }

  async lookupAccount(
    acct: string,
    accountId?: string,
  ): Promise<{ id: string; username: string; acct: string; url: string }> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.lookupAccount(account, acct);
  }

  async uploadMedia(
    file: Buffer | Blob,
    options?: { filename?: string; description?: string; focus?: { x: number; y: number } },
    accountId?: string,
  ): Promise<MediaAttachment> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.uploadMedia(account, file, options);
  }

  async getHomeTimeline(options?: ListPageOptions, accountId?: string): Promise<Status[]> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.getHomeTimeline(account, options);
  }

  async getNotifications(
    options?: { limit?: number; maxId?: string; minId?: string; types?: string[]; excludeTypes?: string[] },
    accountId?: string,
  ): Promise<NotificationItem[]> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.getNotifications(account, options);
  }

  // --- Status helpers (unchanged) ---

  isWriteEnabled(): boolean {
    return accountManager.hasAccounts();
  }

  getWriteStatus(): {
    enabled: boolean;
    accountCount: number;
    activeAccount: { id: string; instance: string; username: string } | null;
  } {
    const active = accountManager.getActiveAccount();
    return {
      enabled: accountManager.hasAccounts(),
      accountCount: accountManager.accountCount,
      activeAccount: active
        ? { id: active.id, instance: active.instance, username: active.username }
        : null,
    };
  }

  // --- Mastodon-only ops: guard against Misskey, else call Mastodon REST ---

  async getBookmarks(
    options?: { limit?: number; maxId?: string; minId?: string },
    accountId?: string,
  ): Promise<Status[]> {
    const account = await this.assertMastodonApi("get-bookmarks", accountId);
    const { limit = 20, maxId, minId } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    const response = await authenticatedFetch(account, `/api/v1/bookmarks?${params}`, { method: "GET" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get bookmarks: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(StatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getFavourites(
    options?: { limit?: number; maxId?: string; minId?: string },
    accountId?: string,
  ): Promise<Status[]> {
    const account = await this.assertMastodonApi("get-favourites", accountId);
    const { limit = 20, maxId, minId } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    const response = await authenticatedFetch(account, `/api/v1/favourites?${params}`, { method: "GET" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get favourites: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(StatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async bookmarkPost(statusId: string, accountId?: string): Promise<Status> {
    const account = await this.assertMastodonApi("bookmark-post", accountId);
    const response = await authenticatedFetch(account, `/api/v1/statuses/${statusId}/bookmark`, { method: "POST" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to bookmark post: HTTP ${response.status} - ${errorText}`);
    }
    return StatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async unbookmarkPost(statusId: string, accountId?: string): Promise<Status> {
    const account = await this.assertMastodonApi("unbookmark-post", accountId);
    const response = await authenticatedFetch(account, `/api/v1/statuses/${statusId}/unbookmark`, { method: "POST" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unbookmark post: HTTP ${response.status} - ${errorText}`);
    }
    return StatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async voteOnPoll(pollId: string, choices: number[], accountId?: string): Promise<Poll> {
    const account = await this.assertMastodonApi("vote-on-poll", accountId);
    const response = await authenticatedFetch(account, `/api/v1/polls/${pollId}/votes`, {
      method: "POST",
      body: JSON.stringify({ choices }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to vote on poll: HTTP ${response.status} - ${errorText}`);
    }
    return PollSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getPoll(pollId: string, accountId?: string): Promise<Poll> {
    const account = await this.assertMastodonApi("get-poll", accountId);
    const response = await authenticatedFetch(account, `/api/v1/polls/${pollId}`, { method: "GET" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get poll: HTTP ${response.status} - ${errorText}`);
    }
    return PollSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async updateMedia(
    mediaId: string,
    options: { description?: string; focus?: { x: number; y: number } },
    accountId?: string,
  ): Promise<MediaAttachment> {
    const account = await this.assertMastodonApi("update-media", accountId);
    const body: Record<string, unknown> = {};
    if (options.description !== undefined) body.description = options.description;
    if (options.focus) body.focus = `${options.focus.x},${options.focus.y}`;
    const response = await authenticatedFetch(account, `/api/v1/media/${mediaId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update media: HTTP ${response.status} - ${errorText}`);
    }
    const { MediaAttachmentSchema } = await import("./adapters/write-adapter.js");
    return MediaAttachmentSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getScheduledPosts(
    options?: { limit?: number; maxId?: string; sinceId?: string; minId?: string },
    accountId?: string,
  ): Promise<ScheduledStatus[]> {
    const account = await this.assertMastodonApi("get-scheduled-posts", accountId);
    const { limit = 20, maxId, sinceId, minId } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (sinceId) params.set("since_id", sinceId);
    if (minId) params.set("min_id", minId);
    const response = await authenticatedFetch(account, `/api/v1/scheduled_statuses?${params}`, { method: "GET" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get scheduled posts: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(ScheduledStatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getScheduledPost(scheduledId: string, accountId?: string): Promise<ScheduledStatus> {
    const account = await this.assertMastodonApi("get-scheduled-post", accountId);
    const response = await authenticatedFetch(account, `/api/v1/scheduled_statuses/${scheduledId}`, { method: "GET" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get scheduled post: HTTP ${response.status} - ${errorText}`);
    }
    return ScheduledStatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async updateScheduledPost(
    scheduledId: string,
    scheduledAt: string,
    accountId?: string,
  ): Promise<ScheduledStatus> {
    const account = await this.assertMastodonApi("update-scheduled-post", accountId);
    const response = await authenticatedFetch(account, `/api/v1/scheduled_statuses/${scheduledId}`, {
      method: "PUT",
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update scheduled post: HTTP ${response.status} - ${errorText}`);
    }
    return ScheduledStatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async cancelScheduledPost(scheduledId: string, accountId?: string): Promise<void> {
    const account = await this.assertMastodonApi("cancel-scheduled-post", accountId);
    const response = await authenticatedFetch(account, `/api/v1/scheduled_statuses/${scheduledId}`, { method: "DELETE" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to cancel scheduled post: HTTP ${response.status} - ${errorText}`);
    }
  }
}

export const authenticatedClient = new AuthenticatedClient();
```

- [ ] **Step 4: Run the full authenticated-client suite**

Run: `npm run test -- tests/unit/authenticated-client.test.ts`
Expected: PASS — existing Mastodon specs (now offline via the nodeinfo mock) and the new Misskey-guard specs all green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `tools-write.ts` references a removed method (e.g. `getPoll`), it remains present — verify by grep: `grep -n "authenticatedClient\.\|getPoll\|updateMedia" src/mcp/tools-write.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/auth/authenticated-client.ts tests/unit/authenticated-client.test.ts
git commit -m "refactor: route AuthenticatedClient through platform write adapters"
```

---

## Task 8: Route account verification through the adapter

**Files:**
- Modify: `src/auth/account-manager.ts`
- Test: `tests/unit/account-manager.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append a describe block:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/unit/account-manager.test.ts -t "delegates to the platform adapter"`
Expected: FAIL — `verifyAccount` still does a direct Mastodon fetch (the resolve mock isn't used).

- [ ] **Step 3: Implement**

In `src/auth/account-manager.ts`, replace the body of `verifyAccount` (lines 281-333) with a delegation. Keep `AccountInfo`/`AccountInfoSchema` exports for back-compat (re-export from the adapter module to avoid drift). Replace the `verifyAccount` method with:

```ts
  /**
   * Verify an access token is still valid by calling the platform adapter's
   * verifyCredentials. Returns null on any failure (not found, network, auth).
   */
  async verifyAccount(accountId: string): Promise<AccountInfo | null> {
    const account = this.accounts.get(accountId);
    if (!account) {
      logger.warn("Cannot verify account - not found", { id: accountId });
      return null;
    }
    try {
      const { resolveWriteAdapter } = await import("./adapters/resolve.js");
      const adapter = await resolveWriteAdapter(account);
      return await adapter.verifyCredentials(account);
    } catch (error) {
      logger.error("Account verification error", {
        id: accountId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
```

Then update the top-of-file `AccountInfo` definition: replace the local `AccountInfoSchema`/`AccountInfo` (lines 44-59) with a re-export so there is one source of truth:

```ts
export { AccountInfoSchema, type AccountInfo } from "./adapters/write-adapter.js";
```

Remove now-unused imports (`MAX_RESPONSE_SIZE`, `REQUEST_TIMEOUT`, `fetchWithRedirectGuard`, `readJsonWithLimit`, `validateExternalUrl`, `instanceBlocklist`) **only if** no longer referenced — verify with `npm run lint`. (`AccountCredentialsSchema`, `z`, `getLogger` stay.)

> The dynamic `import("./adapters/resolve.js")` avoids a static import cycle
> (`account-manager → resolve → mastodon-adapter → account-manager` type-only).
> Static type-only imports are fine, but the runtime import is loaded lazily to
> be safe and keep module init order simple.

- [ ] **Step 4: Run the account-manager suite**

Run: `npm run test -- tests/unit/account-manager.test.ts`
Expected: PASS, including the existing SSRF tests. (The SSRF tests add private-IP/localhost accounts and assert `verifyAccount` returns null and never calls `fetch`. With delegation, `resolveWriteAdapter` → `getInstanceSoftware` → `performDetection` → `validateExternalUrl` throws for private hosts → detection returns "unavailable" → Mastodon adapter → `authenticatedFetch` → `validateExternalUrl` throws again → caught → null, and global `fetch` is never reached. Confirm these two tests still pass; if `getInstanceSoftware` is not mocked there, it short-circuits via the blocklist/SSRF guard without calling `fetch`.)

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/account-manager.ts tests/unit/account-manager.test.ts
git commit -m "refactor: route account verification through platform adapter"
```

---

## Task 9: Full suite + docs

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `.env.example` (doc only)

- [ ] **Step 1: Run the entire unit suite**

Run: `npm run test`
Expected: PASS. Investigate and fix any regression before continuing (most likely a test that imported a type from `authenticated-client.js` that moved — those are re-exported, so this should be clean).

- [ ] **Step 2: Typecheck + lint the whole tree**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Document Misskey support**

In `README.md`, under "Multi-Platform Support" / the Fediverse Interaction Features list, add a short note:

```md
- **Misskey/Foundkey write support**: Authenticated actions (post, renote, react,
  follow, mute/block, media upload, home timeline, notifications) route to the
  native Misskey API automatically when an instance is detected as Misskey or
  Foundkey. All other software (Mastodon, Pleroma, Akkoma, GotoSocial, Sharkey,
  Firefish) uses the Mastodon-compatible API. Bookmarks, poll voting, and
  scheduled posts are Mastodon-only and return a clear "not supported on Misskey"
  message on Misskey accounts.
- **Platform-scoped IDs**: status/account IDs passed to write tools must come from
  the same instance's API — IDs are not translated across platforms.
```

- [ ] **Step 4: Update CHANGELOG**

Add an `### Added` entry under a new `## [Unreleased]` heading (or the existing one):

```md
## [Unreleased]

### Added

- **Platform-aware write layer.** Authenticated operations now route to the
  correct fediverse API per instance via NodeInfo software detection. A new
  Misskey/Foundkey adapter covers core-parity ops (post/reply, renote, reaction,
  follow/unfollow, mute/block, account verify, media upload, home timeline,
  notifications), normalizing responses into the existing Mastodon-shaped types.
  Mastodon-API-compatible software (Pleroma, Akkoma, GotoSocial, Sharkey,
  Firefish) and undetected instances continue to use the Mastodon adapter.
- **`UnsupportedOnPlatformError`.** Bookmarks, poll voting, and scheduled posts —
  which have no Misskey equivalent — now return a clear "not supported on
  Misskey" error instead of an opaque HTTP failure.
```

- [ ] **Step 5: Update `.env.example`** (only if a comment helps — optional)

Add near the authentication section:

```env
# Misskey/Foundkey accounts are supported. The server auto-detects instance
# software via NodeInfo; no extra config is needed. The token must be a Misskey
# API access token with the needed permissions.
```

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md .env.example
git commit -m "docs: document Misskey write support and platform-scoped IDs"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Adapter interface + shared fetch → Task 2. ✓
- MastodonWriteAdapter (behavior-preserving) → Task 3. ✓
- MisskeyWriteAdapter core-parity ops + normalization → Tasks 4-5 (every interface method + mapping table row covered). ✓
- Adapter selection (misskey/foundkey → Misskey; else/unavailable → Mastodon) → Task 6. ✓
- AuthenticatedClient router + UnsupportedOnPlatformError for bookmark/poll/scheduled → Tasks 1, 7. ✓
- Account verification routed through adapter → Task 8. ✓
- Error handling (Misskey `{error:{message}}` extraction) → Task 4 (`misskeyPost`). ✓
- Testing (adapter units, selection matrix, regression offline mock, unsupported-op tests) → Tasks 4-8. ✓
- Docs (Misskey support, platform-scoped IDs) → Task 9. ✓

**Known deviations from spec wording:**
- Spec said existing write tests "pass unchanged." Reality: `authenticated-client.test.ts` needs a one-time `getInstanceSoftware` mock added (Task 7, Step 1) so the router stays offline. Assertions are unchanged; the Mastodon path is still behavior-preserving. This is the only test edit to existing assertions-bearing files.

**Type consistency:** `WriteAdapter` method names/signatures are identical across `write-adapter.ts` (Task 2), `mastodon-adapter.ts` (Task 3), `misskey-adapter.ts` (Tasks 4-5), and the router calls in `authenticated-client.ts` (Task 7). `AccountInfo` has one source of truth after Task 8 (re-exported from `write-adapter.ts`).

**Placeholder scan:** none.
