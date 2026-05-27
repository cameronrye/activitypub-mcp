# activitypub-mcp v2.0.0 — Release Design

**Date:** 2026-05-27
**Status:** Design approved; awaiting written-spec review before implementation plan
**Source:** Synthesizes 29 confirmed findings from the end-to-end review of 2026-05-27 (7 High, 12 Medium, 10 Low)

---

## Goals

1. Resolve every confirmed finding from the end-to-end review.
2. Use the major-version bump to fix API drift, harden security boundaries, and finish a long-stalled topic-directory refactor.
3. Tighten the schema-vs-documentation feedback loop so this class of drift does not recur.

## Non-goals

- No net-new MCP tools or resources beyond what the punch list implies.
- No protocol-level changes to ActivityPub support; no new instance integrations.
- No move off Astro for the docs site.
- No support for Node 18 (EOL April 2025).

## Locked decisions

| Decision | Value |
|---|---|
| Scope | All H + M + L findings (29 total) |
| Breaking changes | Embraced where they improve the API |
| Empty `src/` placeholder dirs | Finish the reorg (move existing files into topic dirs) |
| Release shape | Single `v2` branch → one `v2.0.0` release |
| Minimum Node version | 20 |
| Integration-test workflow cadence | Daily `schedule:` trigger |
| `scheduledId` → `scheduledPostId` rename | Hard-break in 2.0.0, no deprecation alias |
| `ACTIVITYPUB_ACCOUNTS` delimiter | `\|` (pipe), not JSON |
| `src/server/` directory | Delete after moves; fold `index.ts` wiring into `mcp-main.ts` |

If any of the above assumptions are wrong, flag at written-spec review before the implementation plan is drafted.

---

## 1. Release strategy & branch model

- New branch `v2` cut from `master`. All work lands there.
- `master` continues to receive 1.x patches (security backports only) until v2 ships.
- Pre-release publishes: `2.0.0-alpha.N` from the `v2` branch for early testing.
- Final cut: `2.0.0` published when `v2` is merged to `master`.
- One commit per finding (or tight cluster). Conventional Commits prefixes. `!` marks breaking changes for CHANGELOG generation.
- `MIGRATION-v2.md` written incrementally — each breaking commit appends its migration note.
- README and `docs/` updates land in the same commit as the code change they describe (prevents drift recurrence).

---

## 2. Security hardening

### H1 — HTTP transport authentication
- Add required `MCP_HTTP_SECRET` env var (32+ char random string).
- New `src/transport/auth-middleware.ts` runs before route dispatch in `transport/http.ts`. Checks `Authorization: Bearer <secret>` via constant-time comparison. Returns 401 + `WWW-Authenticate: Bearer` on miss.
- Startup hard-fails if HTTP transport is enabled without `MCP_HTTP_SECRET` set.
- `/health` stays unauthenticated (load balancer use); `/metrics` and `/mcp` are gated.
- Change `HTTP_CORS_ORIGINS` default from `"*"` to `""`. Setting it explicitly to `"*"` is allowed (and only safe because auth is also required) but a startup warning is logged recommending an explicit origin list.

### M2 — Streaming response-size enforcement
- New `src/utils/fetch-helpers.ts` exports `readJsonWithLimit(response, maxBytes)`.
- Reads body as a stream, accumulates bytes, aborts via `AbortController` and throws `ResponseTooLargeError` when the cap is exceeded — regardless of whether `Content-Length` was sent.
- Adopted by both `remote-client.ts` and `auth/authenticated-client.ts`. Existing `Content-Length` short-circuit is removed.

### M3 — Thread-traversal cross-origin SSRF / fan-out
- In `fetchPostThread`, validate that each recursive `reply.id` shares the **origin** of the root `postUrl`.
- Replies from other origins are returned as stubs `{ id, origin, fetched: false }` so the LLM knows they exist.
- Hard caps (defaults, env-configurable):
  - `MCP_THREAD_MAX_DEPTH=5`
  - `MCP_THREAD_MAX_REPLIES=50`
  - `MCP_THREAD_CROSS_ORIGIN_FETCH=false` (set to `true` to restore old fetch-everything behavior)

### M8 — `verifyAccount` SSRF/timeout bypass
- Refactor to route through `fetchWithTimeout` + `validateExternalUrl` like every other call.

### L4 — `instance-discovery.ts` raw fetch
- `checkInstanceHealth` and `getInstanceStats`: route through `fetchWithTimeout` + `validateExternalUrl`, with `DomainSchema.parse(domain)` at entry. Defense in depth.

### L5 — `DomainSchema` accepts IP literals
- Reject IPv4 and IPv6 literals explicitly in the schema. `validateExternalUrl` remains the real safety net, but the schema name now matches its contract.

### L2 — Wire `auditLogger` into write tools
- Every write tool handler (post-status, delete-status, follow, unfollow, boost, favourite, bookmark, upload-media, schedule-related tools) and `setActiveAccount` call `auditLogger.log(...)`.
- Entry shape: `{ tool, actor, timestamp, params (sanitized), result: success|error, error? }`.
- `auditLogging: true` in `server-info` becomes truthful.

**New files in this section:** `src/utils/fetch-helpers.ts`, `src/server/auth-middleware.ts`.

---

## 3. MCP tool surface

### H2 — `post-status` missing `mediaIds` and `scheduledAt`
- Add both to the input schema:
  - `mediaIds: z.array(z.string()).max(4).optional()`
  - `scheduledAt: z.string().datetime().refine(d => new Date(d) > new Date(), "scheduledAt must be in the future").optional()`
- Wire through `authenticatedClient.createPost` to Mastodon's `media_ids[]` and `scheduled_at` API fields.
- New end-to-end MSW test: `upload-media → post-status with mediaIds` round-trips successfully.

### H3 — README ↔ code drift (5 tools)
Code is the truth except where the README's parameter name is clearly better:

| Tool | Resolution |
|---|---|
| `get-relationship` | Code stays (`acct` single string). README updated. Schema uses `z.object({...}).strict()` so passing `accountIds` produces a clear "Unrecognized key" error (Zod's default `strip` would silently drop it). Tool description explicitly mentions: "If you have multiple accounts to check, call this tool once per account." |
| `update-scheduled-post` / `cancel-scheduled-post` | **Rename code:** `scheduledId` → `scheduledPostId`. Breaking. |
| `search.domain` | Code stays (optional, default `mastodon.social`). README updated. |
| `upload-media.focus` | Code stays (`focusX` + `focusY` floats). README updated. |
| `discover-content` prompt | Code stays (`topics` plural). README updated. |

### M4 — `search-instance` raw JSON
- Reformat to match other search tools: prose rendering with title, description, user count, registration status, top languages, version.
- If structured data is needed, callers use `get-instance-info` instead.

### M5 — `fetch-timeline` renders only 10 of up to 50
- Render all fetched posts (already capped at 50 by schema), not `.slice(0, 10)`.
- Truncate per-post content to 500 chars + `…` to keep LLM-readable summaries tractable at 50 entries.

### M6 — `server-info` lists 7 prompts but server registers 11
- New `src/mcp/capabilities.ts` builds the prompts/tools/resources lists at server start from the actual registries, not hardcoded arrays.
- Eliminates this drift class permanently.

### M7 — Dead `HEALTH_CHECK_ENABLED` flag
- Delete the flag. Health checks always work.
- Add narrower `HEALTH_CHECK_EXTERNAL_PROBE` (default `true`) for users who want to disable the outbound `mastodon.social` connectivity probe specifically.

### L8 — Past-dated scheduling example
- Replace `2024-12-25T10:00:00Z` in the `get-scheduled-posts` tip with "e.g., one hour from now in ISO 8601 format". Doesn't rot.

### L10 — `post-thread` resource URI template
- Replace `activitypub://post-thread/{postUrl}` with `activitypub://post-thread/{domain}/{statusId}`.
- One-time deprecation warning logged if old form is encountered (detect `://` in first path segment). Removed in 2.1.0.
- Audit other resource templates for similar URL-in-path issues.

**New files in this section:** `src/mcp/capabilities.ts`.

---

## 4. Correctness fixes

### H4 — Spurious `HTTP 304: Not Modified` errors
- In `executeWithRetry`, guard the `!response.ok` branch with `response.status !== 304`.
- If 304 returns without a cache entry, retry once without `If-None-Match`, cache the fresh response normally.
- Unit test: simulate 304 with no cached body, assert re-fetch + success.

### H5 — `PerformanceMonitor` interval leak
1. `metricsInterval.unref()` after creation.
2. Add `performanceMonitor.stop()` (clears interval, mirrors `RateLimiter.stop`).
3. Call from `ActivityPubMCPServer.stop()` in the shutdown sequence.
4. **Remove the forced `process.exit(0)`** at end of shutdown. If something keeps the loop alive after `stop()`, we want it surfaced.

### H6 — `ACTIVITYPUB_ACCOUNTS` colon-split
- New format: `id|instance|token|username|label`, delimited by `|`.
- Runtime check: if `ACTIVITYPUB_ACCOUNTS` contains `:` but no `|`, log a clear migration error and exit (no silent truncation).
- Documented in `MIGRATION-v2.md` with a sed one-liner.

### H7 — `discover-instances` filter composition
- Rewrite as a chain of `.filter()` calls on a single `instances` variable. Each predicate composes.
- Test: `{topic: "tech", size: "large", region: "EU"}` narrows correctly.

### M1 — `fetchActorOutboxPaginated` overrides cursor params
- Gate `searchParams.set(...)` calls on `if (!cursor)`. Cursor and id-filters are mutually exclusive.
- Test both modes.

### M12 — `extractNextCursor` falls back to `collection.first`
- `extractNextCursor(collection)` returns `collection.next` only.
- New `extractFirstPageCursor(collection)` returns `collection.first`.
- Caller decides: if root collection has no items and no cursor was supplied, follow `first` once to reach the data page. Subsequent pagination uses `next` only.

### L6 — `LRUCache.has()` doesn't promote
- Remove `has()` from the public API. Internal callers switch to `get() !== undefined`.

### L7 — `importFromJson` no runtime validation
- Add `BlockedInstanceSchema` (Zod). Parse with `z.array(BlockedInstanceSchema).parse(JSON.parse(json))`.
- Bad entries → clear validation error.

### L3 — Dead double-start guard
- Delete the `if (import.meta.url === ...)` block in `mcp-server.ts`. `mcp-main.ts` is the only entry point.

---

## 5. Build, test & CI

### M9 — CI runs `lint:fix` before `lint`
- Delete the `lint:fix` step from `.github/workflows/ci.yml`. Keep only the read-only `lint` check.
- Add precommit hook recommendation in `CONTRIBUTING.md`.

### M10 — `test:all` doesn't run integration tests
- Fix the alias: `"test:all": "vitest run && vitest run --config vitest.config.integration.ts"`.
- Guard live-network tests with `describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)`.
- New `.github/workflows/integration.yml`: daily `schedule:` trigger, runs with `RUN_INTEGRATION_TESTS=1`. Non-blocking, reports failures.

### M11 — Source/declaration maps ship to npm
- Add explicit `"files"` whitelist to `package.json` (opt-in is safer than `.npmignore`):
  ```json
  "files": ["dist/**/*.js", "dist/**/*.d.ts", "README.md", "LICENSE", "CHANGELOG.md", "MIGRATION-v2.md"]
  ```
- Set `"declarationMap": false` in `tsconfig.json`.
- Keep `"sourceMap": true` for local debugging; they no longer ship.

### L9 — Dead code accumulation
- Enable `"noUnusedLocals": true` and `"noUnusedParameters": true` in `tsconfig.json`.
- Re-enable Biome's `noUnusedVariables` (remove the `"off"` override).
- Fix resulting errors as part of v2.

### New: typecheck step in CI
- Add `"typecheck": "tsc --noEmit"` to `package.json`.
- Run as its own CI step on every PR (faster feedback than full build).
- Run on the full Node matrix (20, 22).

### New: Node version matrix
- Drop Node 18 from `.github/workflows/ci.yml`. Keep `[20.x, 22.x]`.
- Update `engines.node` in `package.json` to `">=20.0.0"`.
- Update README installation prerequisites.

### New: `npm pack --dry-run` check in CI
- One-liner script that asserts the published tarball contains only whitelisted files.
- Catches future drift where someone adds `coverage/`, `src/`, etc. to the publish.

### New: smoke test of published bin
- After `npm pack`, install the tarball in a clean dir, run `activitypub-mcp --help`, assert exit 0.
- Catches missing shebang, wrong bin path, broken ESM imports.

---

## 6. Repo hygiene & topic-dir refactor

### L1 — Finish the 13-empty-dir reorg

Each move is a separate `refactor:` commit using `git mv` (history follows) plus the import-rewrite commit for its callers.

| Existing path | New path |
|---|---|
| `src/audit-logger.ts` | `src/audit/logger.ts` |
| `src/instance-blocklist.ts` | `src/policy/instance-blocklist.ts` |
| `src/instance-discovery.ts` | `src/discovery/instance-discovery.ts` |
| `src/dynamic-instance-discovery.ts` | `src/discovery/dynamic-instance-discovery.ts` |
| `src/webfinger.ts` | `src/discovery/webfinger.ts` |
| `src/remote-client.ts` | `src/activitypub/remote-client.ts` |
| `src/performance-monitor.ts` | `src/telemetry/performance-monitor.ts` |
| `src/health-check.ts` | `src/telemetry/health-check.ts` |
| `src/logging.ts` | `src/telemetry/logging.ts` |
| `src/server/http-transport.ts` | `src/transport/http.ts` |
| `src/server/rate-limiter.ts` | `src/resilience/rate-limiter.ts` |
| `src/server/adaptive-rate-limiter.ts` | `src/resilience/adaptive-rate-limiter.ts` |
| `src/server/validators.ts` | `src/validation/validators.ts` |
| `src/utils.ts` | 3-way split: `src/validation/url.ts` (isPrivateIP*, isBlockedHostname, validateExternalUrl, validateExternalUrlSync) + `src/utils/errors.ts` (getErrorMessage, getErrorSuggestion, formatErrorWithSuggestion) + `src/utils/html.ts` (stripHtmlTags) |

**Populated dirs after refactor:** `audit`, `policy`, `discovery`, `activitypub`, `telemetry`, `transport`, `resilience`, `validation`.

**Deleted dirs (no clear current owner):** `async`, `security`, `streaming`, `errors`, `translation`, `media`.

**`src/server/` directory:** delete entirely after moves; fold remaining `index.ts` wiring into `mcp-main.ts`.

No re-export shims — clean break. TypeScript's `tsc --noEmit` catches any missed import.

### Repo cleanup
- `.DS_Store` files: `git rm` and confirm `.gitignore` covers them.
- Empty `.env` in root: `git rm` (`.env.example` is the template).
- `coverage/` and `dist/` are already untracked — leave alone.

### README + CHANGELOG
- README: per-change edits in the same commit as the code; one final sweep before release.
- Add "Migration from v1" section linking to `MIGRATION-v2.md`.
- CHANGELOG: `!`-marked breaking commits auto-generate entries; final v2.0.0 release notes are an edited summary.

### docs/ Astro site
- Tool reference pages updated alongside README changes.
- No structural changes to the site.

---

## 7. Migration documentation (`MIGRATION-v2.md`)

Written incrementally — each breaking commit appends its section.

1. **Overview** — one paragraph, link to changelog.
2. **Required actions** to run 2.0.0:
   - Upgrade Node to 20+.
   - HTTP transport: set `MCP_HTTP_SECRET`, send `Authorization: Bearer $MCP_HTTP_SECRET`.
   - `ACTIVITYPUB_ACCOUNTS`: change delimiter to `|`. Sed one-liner with caveat about colon-containing values.
   - `MCP_HTTP_CORS_ORIGINS`: if previously relying on the `"*"` default, set explicitly.
3. **Tool API changes** — table of tool / parameter / before / after / notes.
4. **Resource URI changes** — `post-thread` template, old form parsed in 2.0.x with deprecation warning, removed in 2.1.0.
5. **Removed env vars** — `HEALTH_CHECK_ENABLED` (replaced by `HEALTH_CHECK_EXTERNAL_PROBE`).
6. **Behavioral changes** — thread cross-origin replies, recursion caps, audit logging on by default.
7. **Internal refactor** (FYI) — `src/` reorganized; deep imports were never supported but path changes listed for completeness.
8. **Explicitly not changed** — tool names, resource scheme, read-only tool surface.

### `CONTRIBUTING.md` additions
- Schema-first rule: new tool parameters must be added to the Zod schema in the same commit they're described in README. CI enforces via a doc-drift check (new script — diff schema fields against README parameter tables per tool).
- Precommit hook recommendation.
- How to run integration tests locally (`RUN_INTEGRATION_TESTS=1 npm run test:integration`).

---

## Findings ↔ section traceability

Every confirmed finding from the 2026-05-27 review is addressed:

| ID | Severity | Section |
|---|---|---|
| H1 | High | 2 |
| H2 | High | 3 |
| H3 | High | 3 |
| H4 | High | 4 |
| H5 | High | 4 |
| H6 | High | 4 |
| H7 | High | 4 |
| M1 | Medium | 4 |
| M2 | Medium | 2 |
| M3 | Medium | 2 |
| M4 | Medium | 3 |
| M5 | Medium | 3 |
| M6 | Medium | 3 |
| M7 | Medium | 3 |
| M8 | Medium | 2 |
| M9 | Medium | 5 |
| M10 | Medium | 5 |
| M11 | Medium | 5 |
| M12 | Medium | 4 |
| L1 | Low | 6 |
| L2 | Low | 2 |
| L3 | Low | 4 (also referenced in 6) |
| L4 | Low | 2 |
| L5 | Low | 2 |
| L6 | Low | 4 |
| L7 | Low | 4 |
| L8 | Low | 3 |
| L9 | Low | 5 |
| L10 | Low | 3 |

---

## New files added by v2

- `src/utils/fetch-helpers.ts`
- `src/transport/auth-middleware.ts`
- `src/mcp/capabilities.ts`
- `MIGRATION-v2.md`
- `.github/workflows/integration.yml`
- Doc-drift check script under `scripts/`

## Files removed by v2

- `src/utils.ts` (split into `src/validation/url.ts` + `src/utils/errors.ts` + `src/utils/html.ts`)
- `src/server/index.ts` (folded into `src/mcp-main.ts`)
- Empty placeholder dirs without clear owner: `src/async/`, `src/security/`, `src/streaming/`, `src/errors/`, `src/translation/`, `src/media/`
- `src/server/` (after all its contents are moved)
- Empty `.env`, tracked `.DS_Store` files

## Files moved by v2

See Section 6's move table.

---

## Open assumptions to verify at spec review

These were not explicitly answered during brainstorming; recorded here so the user can correct before the implementation plan is drafted:

1. **`scheduledId` → `scheduledPostId`** is a hard break with no deprecation alias.
2. **`ACTIVITYPUB_ACCOUNTS`** uses pipe delimiter, not JSON.
3. **`src/server/`** directory deleted after content moves; `index.ts` folded into `mcp-main.ts`.
4. **Integration test workflow** runs on a daily schedule.
5. **M3 thread cross-origin reply** behavior change to "stub by default" (vs. unlimited fetch by default with a configurable cap).
