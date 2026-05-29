# Account & Content Feature Tools — Design

**Date:** 2026-05-29
**Status:** Approved (design)
**Sub-project:** 3 of 4 (stacked on SP2 — OAuth onboarding)

## Problem

The server can post/boost/favourite/follow but lacks many natural Mastodon
actions an LLM would reach for: editing a post, pinning, following hashtags,
managing lists, keyword filters, editing one's profile, and handling follow
requests. These are all standard Mastodon REST features absent today.

## Goal

Add tools for six feature groups, all against the Mastodon API. On a Misskey
active account they fail fast with `UnsupportedOnPlatformError` (the SP1 pattern
for bookmarks/polls/scheduled posts). Keep `AuthenticatedClient` and
`tools-write.ts` untouched by putting the new code in focused modules.

Non-goals: Misskey equivalents (deferred); editing media; list `replies_policy`
beyond pass-through; filter expiry/whole-word nuance beyond the documented
fields.

## Architecture

```
src/auth/mastodon-features/
  guard.ts            // requireMastodonAccount(op, accountId?)
  posts.ts            // editPost, pinPost, unpinPost
  hashtags.ts         // followHashtag, unfollowHashtag
  lists.ts            // createList, getLists, updateList, deleteList,
                      //   getListTimeline, addListAccounts, removeListAccounts, getListAccounts
  filters.ts          // getFilters, createFilter, deleteFilter   (Mastodon v2 filters)
  profile.ts          // updateProfile
  follow-requests.ts  // getFollowRequests, acceptFollowRequest, rejectFollowRequest
src/mcp/
  tools-content.ts    // registerContentTools(mcpServer, rateLimiter) — all new tools
```

- **`guard.ts`** — `requireMastodonAccount(op: string, accountId?: string):
  Promise<AccountCredentials>`. Resolves the account (active or by id; throws
  `Account not found` / `No authenticated account configured`), calls SP1's
  `resolveSoftwareKind`, and throws `new UnsupportedOnPlatformError(op,
  "Misskey")` if the account is Misskey. Returns the account otherwise.
- **Feature modules** — plain functions `fn(account: AccountCredentials, …args)`
  that call SP1's `authenticatedFetch(account, endpoint, init)` and parse the
  response with a Zod schema. Reuse `StatusSchema`, `RelationshipSchema`,
  `AccountInfoSchema` from `src/auth/adapters/write-adapter.ts`; define new
  `ListSchema`, `TagSchema`, `FilterSchema`, and a lightweight `AccountSchema`
  (id, username, acct, display_name?, url) locally in the modules that need them.
- **`tools-content.ts`** — registers the ~15 tools. Each tool: validate input
  (Zod), `const account = await requireMastodonAccount(<op>, accountId)`, call
  the feature fn, format a prose result, audit-log via `auditLogger
  .logToolInvocation` and rate-limit via the existing `checkRateLimit` helper
  pattern. `AuthenticatedClient` is not modified.

## Endpoint map & tools

| Tool | Method + path | Returns |
|---|---|---|
| `edit-post` | `PUT /api/v1/statuses/{id}` `{status, spoiler_text?, sensitive?, language?, media_ids?}` | Status |
| `pin-post` | `POST /api/v1/statuses/{id}/pin` | Status |
| `unpin-post` | `POST /api/v1/statuses/{id}/unpin` | Status |
| `follow-hashtag` | `POST /api/v1/tags/{name}/follow` | Tag |
| `unfollow-hashtag` | `POST /api/v1/tags/{name}/unfollow` | Tag |
| `create-list` | `POST /api/v1/lists` `{title, replies_policy?, exclusive?}` | List |
| `get-lists` | `GET /api/v1/lists` | List[] |
| `update-list` | `PUT /api/v1/lists/{id}` `{title, replies_policy?, exclusive?}` | List |
| `delete-list` | `DELETE /api/v1/lists/{id}` | void |
| `get-list-timeline` | `GET /api/v1/timelines/list/{id}?limit=&max_id=&min_id=` | Status[] |
| `add-list-accounts` | `POST /api/v1/lists/{id}/accounts` `{account_ids}` | void |
| `remove-list-accounts` | `DELETE /api/v1/lists/{id}/accounts` `{account_ids}` | void |
| `get-list-accounts` | `GET /api/v1/lists/{id}/accounts?limit=` | Account[] |
| `get-filters` | `GET /api/v2/filters` | Filter[] |
| `create-filter` | `POST /api/v2/filters` `{title, context, filter_action?, keywords_attributes}` | Filter |
| `delete-filter` | `DELETE /api/v2/filters/{id}` | void |
| `update-profile` | `PATCH /api/v1/accounts/update_credentials` `{display_name?, note?, bot?, locked?, fields_attributes?}` | AccountInfo |
| `get-follow-requests` | `GET /api/v1/follow_requests?limit=` | Account[] |
| `accept-follow-request` | `POST /api/v1/follow_requests/{account_id}/authorize` | Relationship |
| `reject-follow-request` | `POST /api/v1/follow_requests/{account_id}/reject` | Relationship |

### New Zod schemas
- `TagSchema`: `{ name, url, following?: boolean, history?: unknown[] }`.
- `ListSchema`: `{ id, title, replies_policy?: "followed"|"list"|"none", exclusive?: boolean }`.
- `FilterSchema`: `{ id, title, context: string[], filter_action: "warn"|"hide", keywords: { id, keyword, whole_word }[] }`.
- `AccountSchema` (lite): `{ id, username, acct, display_name?: string, url }`.

### Input validation highlights
- `edit-post`: `status` 1–5000 chars; optional `mediaIds` max 4.
- `follow-hashtag`: strip a leading `#` from the tag name; URL-encode the path.
- `create-filter`: `context` is a non-empty subset of
  `["home","notifications","public","thread","account"]`; `keywords` non-empty;
  `filter_action` default `"warn"`.
- `update-profile`: `fields` max 4 items (`{name, value}`); `display_name` ≤ 30,
  `note` ≤ 500 (Mastodon defaults; over-limit is rejected server-side anyway, so
  Zod limits are advisory and lenient).
- List/timeline pagination via `limit`/`max_id`/`min_id` like existing tools.

## Error handling
- Misskey active account → `UnsupportedOnPlatformError` before any request.
- HTTP failures → `Failed to <op>: HTTP <status> - <body>`, surfaced through the
  tool with `formatErrorWithSuggestion`; every invocation audit-logged
  (success + failure) per the existing write-tool convention.
- All requests inherit SP1's SSRF/blocklist/redirect/size guards via
  `authenticatedFetch`.

## Testing (TDD)
- `mastodon-features-posts.test.ts`, `-hashtags`, `-lists`, `-filters`,
  `-profile`, `-follow-requests`: msw-mock each endpoint; assert request
  method/path/body and parsed output; assert HTTP-error message formatting.
- `mastodon-features-guard.test.ts`: resolves active account; resolves by id;
  throws `UnsupportedOnPlatformError` for a Misskey account and makes no request
  (mock `resolveSoftwareKind`).
- `tools-content.test.ts`: one representative tool per area — success path
  (mock feature fn) and Misskey-error path (mock guard to throw) returns
  `isError`.
- No live network.

## Registration
`registerContentTools(mcpServer, rateLimiter)` called from `src/mcp/tools.ts`
next to `registerWriteTools`. The dynamic `server-info` capability registry
picks up the new tools automatically.

## Out of scope (later)
- Misskey equivalents for these features.
- SP4: per-instance circuit breaker, persistent response cache.
