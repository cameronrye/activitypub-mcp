# Platform-Aware Write Layer + Misskey Adapter — Design

**Date:** 2026-05-29
**Status:** Approved (design)
**Sub-project:** 1 of 4 (foundation-first sequencing)

## Problem

The README claims the server "works with Mastodon, Pleroma, Misskey, etc.", but every
authenticated write/read call hardcodes the **Mastodon REST API** (`/api/v1/statuses`,
`/api/v1/accounts/verify_credentials`, `/api/v2/media`, …) in
`src/auth/authenticated-client.ts` and `src/auth/account-manager.ts`. Pleroma, Akkoma,
GotoSocial, Sharkey, and Firefish all expose a Mastodon-compatible API, so they work
incidentally. **Misskey (and Foundkey) do not** — their API is structurally different
(`/api/notes/create`, renote instead of boost, reactions instead of favourites), so all
authenticated operations against a real Misskey account fail today.

v2.1.0 added NodeInfo software detection (`getInstanceSoftware()` in
`src/discovery/nodeinfo.ts`), which is the foundation this design builds on: detect the
instance software, then route writes to the correct adapter.

## Goal

Introduce a platform-aware write abstraction so authenticated operations route to the
correct API per instance, and add a **Misskey adapter** covering the high-value
"core parity" surface. Behavior must be **identical for existing Mastodon-family users**
(pure refactor on that path) and **additive** for Misskey.

Non-goals: changing read-side discovery (`remote-client.ts`); ID translation between
platforms; OAuth onboarding (sub-project 2); new feature tools (sub-project 3).

## Architecture

New `src/auth/adapters/` directory:

```
src/auth/
  adapters/
    write-adapter.ts     // WriteAdapter interface + shared authenticatedFetch() helper
    mastodon-adapter.ts  // existing AuthenticatedClient method bodies moved here, ~unchanged
    misskey-adapter.ts   // new: Misskey endpoints → normalized Status/Relationship
    resolve.ts           // resolveWriteAdapter(account) — picks adapter via getInstanceSoftware()
  authenticated-client.ts // becomes a thin router; public API + exported types UNCHANGED
  account-manager.ts      // verifyAccount() routes through resolveWriteAdapter()
```

### `WriteAdapter` interface

One method per **core-parity** op. Each takes `(account: AccountCredentials, …args)` and
returns the **existing normalized types** (`Status`, `Relationship`, `MediaAttachment`,
notification array) already exported from `authenticated-client.ts`:

- `createPost(account, options): Status`
- `deletePost(account, statusId): void`
- `boostPost(account, statusId): Status` / `unboostPost(account, statusId): Status`
- `favouritePost(account, statusId): Status` / `unfavouritePost(account, statusId): Status`
- `followAccount(account, targetId, options?): Relationship` / `unfollowAccount(account, targetId): Relationship`
- `muteAccount(account, targetId, options?): Relationship` / `unmuteAccount(account, targetId): Relationship`
- `blockAccount(account, targetId): Relationship` / `unblockAccount(account, targetId): Relationship`
- `getRelationship(account, targetId): Relationship` / `getRelationships(account, targetIds): Relationship[]`
- `lookupAccount(account, acct): { id, username, acct, url }`
- `verifyCredentials(account): { id, username, acct, url }` (used by `account-manager.verifyAccount`)
- `uploadMedia(account, file, options?): MediaAttachment`
- `getHomeTimeline(account, options?): Status[]`
- `getNotifications(account, options?): NotificationItem[]`

The return types stay **Mastodon-shaped** deliberately: `tools-write.ts` (2,690 lines)
formats those shapes today, so keeping them means **zero changes** there and the Mastodon
adapter is essentially the current code moved verbatim. Introducing neutral domain types
was rejected as high-churn/high-risk for this sub-project (YAGNI until a third platform
needs a genuinely different shape).

### Shared request plumbing

The private `authenticatedFetch` in `authenticated-client.ts:185-231` (SSRF guard via
`validateExternalUrl`, blocklist check, abort/timeout, redirect guard) is extracted into
`write-adapter.ts` and reused by both adapters. No new SSRF surface is introduced — the
Misskey adapter goes through the same guarded fetch.

### Unsupported-on-platform operations

Ops with **no real Misskey equivalent** — `bookmarkPost`/`unbookmarkPost`,
`voteOnPoll`/`getPoll`, and the scheduled-post methods (`getScheduledPosts`,
`getScheduledPost`, `updateScheduledPost`, `cancelScheduledPost`) — are **not** in the
`WriteAdapter` interface. They remain Mastodon-only methods directly on
`AuthenticatedClient`. When the resolved software for the active account is Misskey, these
methods throw `UnsupportedOnPlatformError("<op> is not supported on Misskey")` before
making any request.

Rationale: keeps the interface honest (every adapter implements every interface method,
no stub throwers polluting the Misskey adapter) and gives the LLM a precise, actionable
error instead of a confusing HTTP failure.

### `AuthenticatedClient` as a router

Public signatures and the exported `authenticatedClient` singleton are unchanged. Each
interface-backed method becomes a thin delegation:

```ts
async createPost(options: CreatePostOptions, accountId?: string): Promise<Status> {
  const { account, adapter } = await this.resolve(accountId);
  return adapter.createPost(account, options);
}
```

`resolve(accountId?)` calls `getAccountOrActive(accountId)` then `resolveWriteAdapter(account)`.

### Adapter selection (`resolve.ts`)

```
resolveWriteAdapter(account):
  info = await getInstanceSoftware(account.instance)   // cached + single-flight
  name = info.software?.name?.toLowerCase()
  if name in { "misskey", "foundkey" }  -> misskeyWriteAdapter
  else (incl. detection "unavailable" / unknown name) -> mastodonWriteAdapter
```

Fail-safe default is the Mastodon adapter, which is correct for Pleroma, Akkoma,
GotoSocial, Sharkey, Firefish, Iceshrimp (all Mastodon-API-compatible) and for any
instance where NodeInfo detection failed. Adapters are stateless singletons.

## Misskey mapping (core parity)

All Misskey calls are `POST` with a JSON body and `Authorization: Bearer <token>`
(supported by Misskey ≥12 and Foundkey), reusing the shared guarded fetch.

| Op | Misskey endpoint | Body / notes |
|----|------------------|--------------|
| createPost | `/api/notes/create` | `{ text, cw, visibility, replyId, fileIds, poll }`; visibility map public→public, unlisted→home, private→followers, direct→specified. Response `{ createdNote }`. |
| deletePost | `/api/notes/delete` | `{ noteId }` |
| boostPost | `/api/notes/create` | `{ renoteId }` → `{ createdNote }` |
| unboostPost | `/api/notes/unrenote` | `{ noteId }` |
| favouritePost | `/api/notes/reactions/create` | `{ noteId, reaction: "👍" }` (default reaction) |
| unfavouritePost | `/api/notes/reactions/delete` | `{ noteId }` |
| followAccount | `/api/following/create` | `{ userId }`, then `users/relation` for accurate `Relationship` |
| unfollowAccount | `/api/following/delete` | `{ userId }`, then `users/relation` |
| muteAccount / unmuteAccount | `/api/mute/create` / `/api/mute/delete` | `{ userId }` |
| blockAccount / unblockAccount | `/api/blocking/create` / `/api/blocking/delete` | `{ userId }` |
| getRelationship | `/api/users/relation` | `{ userId }` (or `{ userId: [...] }` for batch) → normalized `Relationship` |
| lookupAccount | `/api/users/show` | `{ username, host }` parsed from `acct` |
| verifyCredentials | `/api/i` | returns own user |
| uploadMedia | `/api/drive/files/create` | multipart; `comment` = alt text; returns drive file `id` for `fileIds` |
| getHomeTimeline | `/api/notes/timeline` | `{ limit, untilId?, sinceId? }` |
| getNotifications | `/api/i/notifications` | `{ limit, untilId?, sinceId? }` |

### Normalization

- **Note → `Status`:** `id`, `uri`/`url` from note, `createdAt`→`created_at`, `text`→`content`
  (note: Misskey text is plain/MFM, not HTML — passed through as-is), `renoteCount`→`reblogs_count`,
  summed `reactions`→`favourites_count`, `repliesCount`→`replies_count`, `user`→`account`,
  Misskey visibility mapped back to Mastodon vocabulary, `cw`→`spoiler_text`.
- **users/relation → `Relationship`:** `isFollowing`→`following`, `isFollowed`→`followed_by`,
  `isBlocking`→`blocking`, `isMuted`→`muting`, `hasPendingFollowRequestFromYou`→`requested`,
  remaining boolean fields defaulted to `false`.
- **User → lookup/verify shape:** `id`, `username`, `acct` = `username@host` (host null ⇒ local),
  `url` from user `url`/`uri`.

### Known limitation (to document in README / tool docs)

IDs are **platform-scoped**. A `statusId` or `accountId` passed to a write tool must come
from the same instance's API. This design does not translate IDs across platforms.

## Error handling

- Unsupported op on a Misskey account → `UnsupportedOnPlatformError` (new class in
  `src/utils/errors.ts`), thrown before any request; surfaced as a clear tool error.
- Misskey API errors return `{ error: { message, code, id } }`; the adapter extracts
  `error.message` so messages stay readable, paralleling the existing
  `Failed to <op>: HTTP <status> - <text>` pattern on the Mastodon path.
- Detection `unavailable` is **not** an error — it yields the Mastodon adapter.
- All existing guards (SSRF allow-list, instance blocklist, response-size cap, redirect
  guard, timeout) apply unchanged via the shared fetch helper.

## Testing (TDD)

- **Unit — `misskey-adapter.test.ts`:** msw-mocked Misskey endpoints for each op; assert
  request shape (path, body) and normalized output; assert Misskey `{error:{message}}`
  extraction.
- **Unit — `resolve.test.ts`:** selection matrix — `misskey`/`foundkey` → Misskey adapter;
  `mastodon`/`pleroma`/`akkoma`/`sharkey`/`firefish`/unknown/`unavailable` → Mastodon adapter.
- **Unit — unsupported ops:** `bookmarkPost`/`voteOnPoll`/scheduled-post methods throw
  `UnsupportedOnPlatformError` when active account software is Misskey, and make no request.
- **Regression:** existing `tests/unit/mcp-server.test.ts` write-tool coverage and
  `account-manager` tests pass **unchanged**, proving the Mastodon path is behavior-preserving.
- **No live Misskey write tests** (requires a real account/token). NodeInfo detection
  already has a live integration test.

## Dependency / cycle note

Adapters import only: `config`, `utils/fetch-helpers`, `validation/url`,
`policy/instance-blocklist`, `discovery/nodeinfo`, and the **type-only**
`AccountCredentials` from `account-manager`. `account-manager` and `authenticated-client`
import `resolveWriteAdapter` at runtime. Because adapters never import `account-manager` at
runtime (type-only import), there is no import cycle.

## Out of scope (later sub-projects)

- OAuth onboarding flow (SP2)
- Edit/pin/follow-hashtag, lists, filters, profile editing, follow-request management (SP3)
- Per-instance circuit breaker, persistent cache (SP4)
