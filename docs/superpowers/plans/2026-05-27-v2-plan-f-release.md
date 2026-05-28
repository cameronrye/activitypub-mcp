# v2 Plan F — Migration Finalization + Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize all v2 release artifacts (`MIGRATION-v2.md`, `CHANGELOG.md`, `README.md`, version bump in `package.json` + `src/config.ts`) so the v2.0.0 tag can be cut. The actual publish (tag push → CI publishes to npm + creates GitHub Release) is a manual operation the human triggers explicitly.

**Architecture:** Pure docs and version-bump work. No code changes, no new tests. The plan prepares everything that needs to land in commits before the tag; the tag-and-publish sequence is documented but executed by the user (npm/GitHub credentials are theirs).

**Tech Stack:** Markdown, package.json, a one-line change in `src/config.ts`. The `npm run validate:version` script enforces version sync between the two locations.

**Spec reference:** [docs/superpowers/specs/2026-05-27-v2-release-design.md §7](../specs/2026-05-27-v2-release-design.md)

**Plan A/B/C/D/E context:**
- v2 branch baseline: 628 tests passing.
- All app work is done. All breaking changes and behavioral changes have MIGRATION-v2.md entries except the Plan E refactor note (intentionally deferred to Plan F).
- Current `package.json` version: `1.1.2`. Current `src/config.ts` `SERVER_VERSION` default: `1.1.2`.
- Target version: `2.0.0`.

---

## Pre-flight

- Confirm branch: `git branch --show-current` → `v2`.
- Baseline: `npm test` → 628 passing.
- `npm run typecheck && npm run lint` → clean.
- Read `MIGRATION-v2.md` end-to-end so you know its current structure.

---

## Task 1: Append Plan E internal-refactor section to `MIGRATION-v2.md`

**File:** `MIGRATION-v2.md`

The Plan E spec said this section should land in Plan F: a FYI note for users that the `src/` paths changed during the v2 reorg. Deep imports from `activitypub-mcp/dist/...` were never officially supported, but listing the changes helps anyone who relied on them.

- [ ] **Step 1: Read the current MIGRATION-v2.md outline**

```bash
grep -n "^##\|^###" MIGRATION-v2.md
```

Expect sections in this order:
- Overview (top of doc)
- ## Required actions to run v2.0.0 (1-4)
- ## Behavioral changes (non-breaking but visible)
- ## Tool API changes
- ## Removed env vars
- ## Resource URI changes
- ## Sections to be filled by future plans (placeholder — Task 2 deletes this)

- [ ] **Step 2: Append a new section before "Sections to be filled by future plans"**

Add this section before the placeholder:

```markdown
## Internal refactor (FYI, not breaking)

v2 reorganized the `src/` tree from a flat layout into topic directories.
**The public API of the `activitypub-mcp` package is the bin (`activitypub-mcp` on the command line) and its MCP protocol surface — internal source paths are not part of the API.** Deep imports like `activitypub-mcp/dist/audit-logger.js` were never officially supported.

The new layout, for anyone curious:

| Old path | New path |
|---|---|
| `src/audit-logger.ts` | `src/audit/logger.ts` |
| `src/instance-blocklist.ts` | `src/policy/instance-blocklist.ts` |
| `src/webfinger.ts` | `src/discovery/webfinger.ts` |
| `src/instance-discovery.ts` | `src/discovery/instance-discovery.ts` |
| `src/dynamic-instance-discovery.ts` | `src/discovery/dynamic-instance-discovery.ts` |
| `src/remote-client.ts` | `src/activitypub/remote-client.ts` |
| `src/performance-monitor.ts` | `src/telemetry/performance-monitor.ts` |
| `src/health-check.ts` | `src/telemetry/health-check.ts` |
| `src/logging.ts` | `src/telemetry/logging.ts` |
| `src/server/http-transport.ts` | `src/transport/http.ts` |
| `src/server/auth-middleware.ts` | `src/transport/auth-middleware.ts` |
| `src/server/rate-limiter.ts` | `src/resilience/rate-limiter.ts` |
| `src/server/adaptive-rate-limiter.ts` | `src/resilience/adaptive-rate-limiter.ts` |
| `src/server/validators.ts` | `src/validation/validators.ts` |
| `src/utils.ts` | 3-way split: `src/validation/url.ts` + `src/utils/errors.ts` + `src/utils/html.ts` |
| `src/server/index.ts` | deleted; consumers use direct imports |

`src/server/` and the six unused placeholder directories (`async/`, `security/`, `streaming/`, `errors/`, `translation/`, `media/`) were removed.
```

- [ ] **Step 3: Verify the section landed correctly**

```bash
grep -n "^## " MIGRATION-v2.md
```

Expect the new "Internal refactor (FYI, not breaking)" heading to appear before the placeholder section.

- [ ] **Step 4: Commit**

```bash
git add MIGRATION-v2.md
git commit -m "docs(migration): note v2 internal src/ reorg as FYI (Plan F)"
```

---

## Task 2: Final polish on `MIGRATION-v2.md`

**File:** `MIGRATION-v2.md`

Remove the "Sections to be filled by future plans" placeholder (no plans remain), fix any lingering SHA placeholders that were left behind for later cleanup, tighten the opening prose.

- [ ] **Step 1: Check for unfilled commit SHAs**

```bash
grep -n "<H[0-9]\+ commit SHA>\|<M[0-9]\+ commit SHA>\|<L[0-9]\+ commit SHA>\|<.* commit SHA>" MIGRATION-v2.md
```

If any are left, replace each with the actual commit SHA. Find each SHA via `git log --all --oneline --grep="<ticket-id>"` or by searching commit subjects, e.g.:

```bash
git log --all --oneline --grep="(H6)"     # for H6
git log --all --oneline --grep="(L7)"     # for L7
```

Replace `<H6 commit SHA>` with the short SHA. (If you'd rather link to the commit on GitHub, that requires knowing the repo URL — skip the GitHub link and just use the SHA.)

- [ ] **Step 2: Delete the "Sections to be filled by future plans" placeholder**

Find the heading via `grep -n "Sections to be filled" MIGRATION-v2.md` and delete that heading PLUS the body text under it (everything from the heading down to the end of the file or to the next `## ` heading).

- [ ] **Step 3: Tighten the opening prose**

Open MIGRATION-v2.md and read the first 10 lines. The current opening says "Status: in progress". Update for the release:

Before:
```markdown
> Status: in progress. See `docs/superpowers/specs/2026-05-27-v2-release-design.md`
> for the full v2 design.
```

After:
```markdown
> This is the v2.0.0 release migration guide. See
> `docs/superpowers/specs/2026-05-27-v2-release-design.md` for the design
> that drove the release.
```

- [ ] **Step 4: Verify the doc reads cleanly**

```bash
cat MIGRATION-v2.md | head -10
grep -n "^## " MIGRATION-v2.md
```

Confirm structure (in order):
1. Title + opening
2. Required actions to run v2.0.0
3. Behavioral changes (non-breaking but visible)
4. Tool API changes
5. Removed env vars
6. Resource URI changes
7. Internal refactor (FYI, not breaking)

No remaining `<X commit SHA>` placeholders, no "in progress" status, no "Sections to be filled" placeholder.

- [ ] **Step 5: Commit**

```bash
git add MIGRATION-v2.md
git commit -m "docs(migration): polish for v2.0.0 release (Plan F)"
```

---

## Task 3: Write the v2.0.0 entry in `CHANGELOG.md`

**File:** `CHANGELOG.md`

Add a new top-level v2.0.0 section. Use Keep a Changelog format (the file already follows this convention — see the existing 1.1.0 entry for style).

- [ ] **Step 1: Build the v2.0.0 commit list**

```bash
git log --oneline v2 ^master | head -80
```

Note: 77 commits between v2 and master (per Plan E completion check). This includes plan docs (`docs:` prefix) and design docs.

- [ ] **Step 2: Categorize the changes for the CHANGELOG**

Use the spec + the actual commits to produce a clean release summary. The categories per Keep a Changelog: Added, Changed, Deprecated, Removed, Fixed, Security.

For v2.0.0, the structure should mirror the spec findings, not the commit list (commits are implementation detail; the changelog is user-facing).

- [ ] **Step 3: Insert the new section at the top of CHANGELOG.md (before [1.1.0])**

Insert this block:

```markdown
## [2.0.0] - YYYY-MM-DD

> **Major release.** v2 is a security, correctness, and ergonomics overhaul of the v1 server. See `MIGRATION-v2.md` for the full upgrade guide.

### Breaking changes

- **Node 20+ required.** Node 18 reached EOL April 30, 2025. v2's minimum is `node >=20.0.0`.
- **HTTP transport requires `MCP_HTTP_SECRET`.** The HTTP transport now refuses to start without a `MCP_HTTP_SECRET` env var (32+ random chars recommended). All requests to `/mcp` and `/metrics` must include `Authorization: Bearer <secret>`. `/health` remains unauthenticated. stdio transport is unaffected.
- **CORS default changed.** `MCP_HTTP_CORS_ORIGINS` no longer defaults to `"*"`. Set it explicitly if cross-origin requests are needed.
- **`ACTIVITYPUB_ACCOUNTS` delimiter changed.** Format is now `id|instance|token|username|label` (pipe), not colon. v2 refuses to start if it sees the legacy `:`-delimited value.
- **`scheduledId` → `scheduledPostId`.** The `cancel-scheduled-post` and `update-scheduled-post` tools renamed their identifier parameter for clarity and to match the README.
- **`HEALTH_CHECK_ENABLED` env var removed.** Replaced by the narrower `HEALTH_CHECK_EXTERNAL_PROBE` (default `true`) which gates only the outbound `mastodon.social` connectivity probe.

### Added

- **`post-status` now supports `mediaIds` and `scheduledAt`.** Round-trip flow with `upload-media` works end-to-end.
- **`get-relationship` rejects legacy `accountIds` form with a helpful error.** The README previously documented `accountIds` (array); v2 makes the actual `acct` (single string) interface authoritative.
- **`search-instance` returns prose output** matching the other search tools (was raw JSON in v1).
- **`fetch-timeline` renders all posts** (was capped at 10) and truncates per-post content to 500 chars.
- **Dynamic `server-info` capabilities.** The `activitypub://server-info` resource now lists tools/resources/prompts from a live registry — no more hand-maintained arrays that drift.
- **Thread traversal caps.** `fetch-post-thread` caps recursion depth at 5 and total replies at 50 (configurable via `MCP_THREAD_MAX_DEPTH` and `MCP_THREAD_MAX_REPLIES`).
- **Cross-origin thread gate.** Replies whose origin differs from the root post are returned as stubs by default (set `MCP_THREAD_CROSS_ORIGIN_FETCH=true` to opt in to v1 fetch-everything behavior).
- **Audit logging wired into every write tool.** `auditLogger.logToolInvocation` fires on success and failure across all 27 write-effect handlers.
- **`post-thread` resource URI template.** New form `activitypub://post-thread/{domain}/{statusId}` (Mastodon-compatible). Legacy `{postUrl}` form still accepted with a deprecation warning; removed in 2.1.0.
- **`npm run typecheck`** script and CI step.
- **Daily integration test workflow** (`.github/workflows/integration.yml`) runs against the live Fediverse on a schedule.
- **`npm pack` contents check + published-bin smoke test** in CI.

### Changed

- **Streaming response-size enforcement.** Outgoing HTTP requests stream the body and abort if `MAX_RESPONSE_SIZE` (10 MB default) is exceeded, even when the remote server omits `Content-Length`.
- **`verifyAccount` routes through SSRF guard.** No more raw `fetch` with a bearer token; private IPs and localhost are blocked before the request.
- **`instance-discovery` raw fetches gated** by `DomainSchema` + `validateExternalUrl`.
- **`DomainSchema` rejects IP literals.** Was permissive in v1.
- **`discover-instances` filter composition fixed.** Multiple filters now compose cumulatively (v1 silently dropped all but the last filter).
- **HTTP transport CORS warning** at startup if wildcard origin is set.
- **`fetchActorOutboxPaginated` preserves cursor URL query params** (v1 silently overwrote `max_id`/`min_id` with caller-supplied filters when both were passed).
- **ETag 304 handling.** When the server returns 304 without a cache entry (TTL eviction), v2 re-fetches without `If-None-Match` instead of throwing a spurious `HTTP 304: Not Modified`.
- **`PerformanceMonitor` interval is `.unref()`'d** and properly stopped on graceful shutdown. Removed the forced `process.exit(0)` in the SIGTERM handler.
- **`InstanceBlocklist.importFromJson` validates input via Zod.** Malformed entries throw instead of being silently skipped.
- **`LRUCache.has()` removed.** Use `get(key) !== undefined` for consistent promotion semantics.
- **`auditLogging: true` capability flag is now truthful.** Was advertised but unwired in v1.

### Fixed

- **`extractNextCursor` no longer loops back to `collection.first`.** v1 fell back to `first` when `next` was absent, causing pagination to bounce back to page 1.

### Removed

- **`HEALTH_CHECK_ENABLED` env var** (dead code in v1 — replaced by `HEALTH_CHECK_EXTERNAL_PROBE`).
- **`LRUCache.has()` method** (see Changed).
- **Six unused placeholder directories** under `src/` (`async/`, `security/`, `streaming/`, `errors/`, `translation/`, `media/`).
- **Dead double-start guard** in `src/mcp-server.ts`.

### Security

- **HTTP transport Bearer auth.** Closes the gap where `/mcp` was reachable by any local client.
- **Thread traversal cross-origin gating.** Reduces attack surface from following untrusted `inReplyTo` chains.
- **Streaming response size cap.** DoS protection against servers that omit `Content-Length`.
- **`InstanceBlocklist.importFromJson` runtime validation** prevents silent corruption of the blocklist.
- **`DomainSchema` rejects IP literals.** Defense in depth against bypass attempts.

### Internal

- **Topic-dir refactor.** `src/` reorganized into 11 topic directories. `src/utils.ts` split into `src/validation/url.ts`, `src/utils/errors.ts`, `src/utils/html.ts`. `src/server/` removed (re-exports inlined). See `MIGRATION-v2.md` § "Internal refactor (FYI, not breaking)".
- **Stricter TypeScript and Biome flags** enabled: `noUnusedLocals`, `noUnusedParameters`, Biome `noUnusedVariables`.
- **`files` whitelist** in `package.json` controls npm publish contents. Source maps and declaration maps no longer ship.
- **628 unit tests** (up from 533 at v2 start) covering every behavior change.
```

Replace `YYYY-MM-DD` with the actual release date when the tag is cut. For now, use today's date: `2026-05-27`.

- [ ] **Step 4: Verify CHANGELOG.md renders cleanly**

```bash
head -120 CHANGELOG.md
```

Confirm the new section is at the top, properly formatted, and doesn't break the existing entries below.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): write v2.0.0 release entry (Plan F)"
```

---

## Task 4: Add v2 migration link to README

**File:** `README.md`

Add a prominent link to `MIGRATION-v2.md` near the top of the README so v1 users upgrading find it immediately.

- [ ] **Step 1: Find an insertion point near the top**

Read the first 60 lines of README.md. There's typically a badges section, then a one-line description, then a section header (e.g., "Features" or "Quick start"). Insert the migration callout between the description and the first major section.

- [ ] **Step 2: Insert a migration callout**

Add a block like this (adjust placement to match README's existing tone):

```markdown
> **Upgrading from v1?** See [MIGRATION-v2.md](./MIGRATION-v2.md) for the
> full v2.0.0 upgrade guide. v2 includes breaking changes (Node 20+,
> required HTTP secret, env var format change) — read the migration
> notes before upgrading.
```

- [ ] **Step 3: Confirm it renders**

```bash
head -60 README.md
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add prominent v2 migration link (Plan F)"
```

---

## Task 5: Bump version to 2.0.0 in `package.json` and `src/config.ts`

**Files:**
- Modify: `package.json` (the `version` field)
- Modify: `src/config.ts` (`SERVER_VERSION` env-var default)

The `npm run validate:version` script enforces these two values match. Update both in the same commit.

- [ ] **Step 1: Update `package.json`**

In `package.json`, change:

```json
"version": "1.1.2",
```

to:

```json
"version": "2.0.0",
```

- [ ] **Step 2: Update `src/config.ts`**

Find the line that looks like:

```typescript
export const SERVER_VERSION = process.env.MCP_SERVER_VERSION || "1.1.2";
```

Change the fallback to `"2.0.0"`:

```typescript
export const SERVER_VERSION = process.env.MCP_SERVER_VERSION || "2.0.0";
```

- [ ] **Step 3: Verify the version-check passes**

```bash
npm run validate:version
```

Expected output: `✅ Versions match!` with `package.json version: 2.0.0` and `MCP_SERVER_VERSION default: 2.0.0`.

- [ ] **Step 4: Run full verification**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: PASS (628 tests).

- [ ] **Step 5: Commit**

```bash
git add package.json src/config.ts
git commit -m "chore(release): bump version to 2.0.0"
```

---

## Task 6: Final verification + release-sequence documentation

**Files:** none modified — verification + handoff.

This task verifies everything is ready for tagging and documents the user-driven release steps.

- [ ] **Step 1: Run every CI check locally**

```bash
npm run validate:version && \
npm run typecheck && \
npm run lint && \
npm test && \
npm run build && \
node scripts/check-tarball-contents.js && \
node scripts/smoke-test-bin.js
```

Expected: every check passes. This mirrors what CI will run on the tag.

- [ ] **Step 2: Verify `MIGRATION-v2.md` cross-references**

```bash
grep -c "<.*commit SHA>" MIGRATION-v2.md
```

Expected: `0` (no remaining SHA placeholders).

- [ ] **Step 3: Verify CHANGELOG date**

```bash
grep -n "^## \[2.0.0\]" CHANGELOG.md
```

Confirm the date is today (`2026-05-27`) — if the release is being cut on a different day, the user should update it before tagging.

- [ ] **Step 4: Confirm Plan E refactor section is in MIGRATION**

```bash
grep -n "Internal refactor" MIGRATION-v2.md
```

Expected: one hit at "Internal refactor (FYI, not breaking)".

- [ ] **Step 5: Inspect the v2 commit log size**

```bash
git log --oneline v2 ^master | wc -l
```

Expected: a number ~85-90 (78 from Plans A-E + 6 from Plan F).

- [ ] **Step 6: Confirm `dist/` is excluded from git**

```bash
git status dist/
```

Expected: `dist/` shows as untracked or ignored. Should NOT show files staged for commit.

- [ ] **Step 7: Push the v2 branch to origin (optional — user discretion)**

This is the FIRST point in the v2 work where the branch leaves the local machine. Before running this command, the user should:
- Decide whether to push v2 first (as a long-lived branch) or merge to master directly.
- Confirm GitHub credentials are configured.

The recommended sequence (the user runs these — not the implementer):

```bash
# Push the v2 branch so collaborators / CI can see it
git push -u origin v2

# Wait for CI to complete. Address any platform-specific failures.

# Once CI is green on v2:
git checkout master
git pull
git merge --no-ff v2 -m "Merge v2 into master for 2.0.0 release"
git push origin master

# Tag and push (triggers release.yml: test → publish-npm → create-release):
git tag v2.0.0
git push origin v2.0.0
```

After `git push origin v2.0.0`, GitHub Actions will:
1. Run the test job (npm test, lint, build).
2. If green, run publish-npm (`npm publish` using `NPM_TOKEN` secret).
3. Create a GitHub Release with the dist artifacts attached.

If any CI step fails:
- The tag stays in the repo but the publish does not happen.
- Investigate, fix, and either retry or delete the tag and re-cut after fixes.

To delete a tag (only if no publish occurred):
```bash
git tag -d v2.0.0
git push --delete origin v2.0.0
```

- [ ] **Step 8: Document the release in MIGRATION-v2.md (optional)**

If the release publishes successfully, add the release date and any post-release adjustments under the doc opening as a "Release notes" appendix. This step happens AFTER publish — not part of pre-tag prep.

## Report Format

- Status (DONE / DONE_WITH_CONCERNS / BLOCKED)
- Each verification step's result
- Any concerns about the release sequence
- Confirmation that the branch is ready to tag (but NOT yet tagged or pushed)

---

## Done

When all 6 tasks check off, v2 is ready for the user to tag and publish. The actual `git tag v2.0.0` + `git push origin v2.0.0` are user actions — Plan F prepares the commits and verifies they're clean. The agent should NOT auto-publish.

The v2 release is the terminal state of the project plan that started with the 2026-05-27 codebase review. After publish, the user can decide whether to delete or archive the `v2` branch (typically: merge to master and let v2 branch lie dormant or be deleted).
