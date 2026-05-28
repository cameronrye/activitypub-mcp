# v2 Plan E — Topic-Dir Refactor + Repo Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the topic-directory reorganization (spec section 6, finding L1). Move 14 flat `src/` files into 8 topic directories, split `src/utils.ts` into 3 focused files, delete `src/server/` (folding its `index.ts` re-exports inline), delete 6 still-empty placeholder directories, and clean up `.DS_Store` files left in the repo.

**Architecture:** Pure mechanical refactor. No behavior changes, no new features. Each move is its own commit using `git mv` so history follows. Import sites are updated in the same commit as the move. TypeScript catches any missed import via `npx tsc --noEmit`. After Plan E, the `src/` tree is organized by responsibility (audit/, policy/, discovery/, activitypub/, telemetry/, transport/, resilience/, validation/, utils/, mcp/, auth/) and contains no orphan directories.

**Tech Stack:** Just `git mv` + Edit + tsc. No new dependencies.

**Spec reference:** [docs/superpowers/specs/2026-05-27-v2-release-design.md §6](../specs/2026-05-27-v2-release-design.md)

**Plan A/B/C/D context:**
- v2 branch baseline: 628 tests passing.
- All app-level work from §2/§3/§4/§5 is complete.
- This is the LAST big content plan before Plan F (release).
- Plan F's MIGRATION-v2.md update will note the internal-import path changes as "FYI, not breaking" since deep imports were never supported.
- Tests live flat in `tests/unit/` — they don't move.

---

## Pre-flight

- Confirm branch: `git branch --show-current` → `v2`.
- Baseline: `npm test` → 628 passing.
- `npx tsc --noEmit` → zero errors.
- `npm run lint` → clean.

---

## Move map (reference table — used throughout this plan)

| Existing path | New path |
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
| `src/server/index.ts` | deleted; inline its 4 re-exports into consumers |

**Populated dirs after this plan:** `audit/`, `policy/`, `discovery/`, `activitypub/`, `telemetry/`, `transport/`, `resilience/`, `validation/`, `utils/`, plus existing `auth/` and `mcp/`.

**Deleted dirs:** `src/server/`, `src/async/`, `src/security/`, `src/streaming/`, `src/errors/`, `src/translation/`, `src/media/`.

---

## Task 1: Move `audit-logger.ts` → `audit/logger.ts`

**Files moved:** `src/audit-logger.ts` → `src/audit/logger.ts`
**Files updated (import paths):** every importer of `audit-logger`

- [ ] **Step 1: Identify importers**

```bash
grep -rn 'from "\./audit-logger\|from "\.\./audit-logger\|from "@/audit-logger' src/ tests/
```

Expected hits (verify with the actual grep output — these are typical):
- `src/mcp/tools-write.ts` — `from "../audit-logger.js"`
- `src/mcp/resources.ts` — `from "../audit-logger.js"`
- `tests/unit/audit-logger.test.ts` — `from "../../src/audit-logger.js"`
- Anywhere else that grep finds.

- [ ] **Step 2: Move the file with `git mv`**

```bash
git mv src/audit-logger.ts src/audit/logger.ts
```

- [ ] **Step 3: Update each importer**

For each hit from Step 1, change the import path:
- `from "./audit-logger.js"` → `from "./audit/logger.js"`
- `from "../audit-logger.js"` → `from "../audit/logger.js"`
- `from "../../src/audit-logger.js"` → `from "../../src/audit/logger.js"`

Use the Edit tool per file. Don't bulk-sed across the whole tree (different files use different relative depths; one-by-one is safer).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. If any "Cannot find module" appears, you missed a caller — find and fix.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: 628 passing (no behavior change).

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move audit-logger.ts to audit/logger.ts (Plan E)"
```

---

## Task 2: Move `instance-blocklist.ts` → `policy/instance-blocklist.ts`

**Files moved:** `src/instance-blocklist.ts` → `src/policy/instance-blocklist.ts`

- [ ] **Step 1: Identify importers**

```bash
grep -rn 'from "\./instance-blocklist\|from "\.\./instance-blocklist\|from "@/instance-blocklist' src/ tests/
```

- [ ] **Step 2: Move**

```bash
git mv src/instance-blocklist.ts src/policy/instance-blocklist.ts
```

- [ ] **Step 3: Update each importer**

Adjust the relative path from `./instance-blocklist.js` to `./policy/instance-blocklist.js` (and similar for `../` depths).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move instance-blocklist.ts to policy/ (Plan E)"
```

---

## Task 3: Move discovery cluster (webfinger, instance-discovery, dynamic-instance-discovery)

Three files moving into `src/discovery/`. Do them in one commit since they're a coherent cluster.

**Files moved:**
- `src/webfinger.ts` → `src/discovery/webfinger.ts`
- `src/instance-discovery.ts` → `src/discovery/instance-discovery.ts`
- `src/dynamic-instance-discovery.ts` → `src/discovery/dynamic-instance-discovery.ts`

- [ ] **Step 1: Identify importers (any of the three)**

```bash
grep -rn 'from "\.[\./]*webfinger\|from "\.[\./]*instance-discovery\|from "\.[\./]*dynamic-instance-discovery' src/ tests/
```

- [ ] **Step 2: Move the three files**

```bash
git mv src/webfinger.ts src/discovery/webfinger.ts
git mv src/instance-discovery.ts src/discovery/instance-discovery.ts
git mv src/dynamic-instance-discovery.ts src/discovery/dynamic-instance-discovery.ts
```

- [ ] **Step 3: Update each importer**

For each hit:
- `from "./webfinger.js"` → `from "./discovery/webfinger.js"`
- `from "./instance-discovery.js"` → `from "./discovery/instance-discovery.js"`
- `from "./dynamic-instance-discovery.js"` → `from "./discovery/dynamic-instance-discovery.js"`
- And `../` variants accordingly.

**Also handle cross-references between the three moved files** — they may import each other (e.g., `instance-discovery.ts` may import from `dynamic-instance-discovery.ts`). After moving, those become same-directory imports: `from "./dynamic-instance-discovery.js"` (no need to change the relative form if they were already in the same dir, but the imports of utility modules above will need updating from `./utils.js` to `../utils.js` since they're one level deeper now).

Specifically: each moved file's imports of files that did NOT move need to bump from `./` to `../`. Use the typecheck output as a guide — `Cannot find module './config.js'` from a moved file means: change to `'../config.js'`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. Iterate on import path fixes until clean.

- [ ] **Step 5: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move webfinger + instance-discovery into discovery/ (Plan E)"
```

---

## Task 4: Move `remote-client.ts` → `activitypub/remote-client.ts`

**Files moved:** `src/remote-client.ts` → `src/activitypub/remote-client.ts`

`remote-client.ts` is the largest file in the project (~1400 lines). Its move is just a path change; the file content is unaffected.

- [ ] **Step 1: Identify importers**

```bash
grep -rn 'from "\.[\./]*remote-client' src/ tests/
```

Expect hits in `mcp-server.ts`, `mcp/tools.ts`, `mcp/tools-write.ts`, `mcp/tools-export.ts`, `mcp/resources.ts`, and the test file.

- [ ] **Step 2: Move**

```bash
git mv src/remote-client.ts src/activitypub/remote-client.ts
```

- [ ] **Step 3: Update importers (paths)**

Each `./remote-client.js` → `./activitypub/remote-client.js` (and `../` variants).

- [ ] **Step 4: Update `remote-client.ts`'s own imports**

`remote-client.ts` itself imports things that DIDN'T move:
- `./config.js` → `../config.js`
- `./utils.js` (current path; will become `../utils.js`) — `../utils.js` (Task 9 will further split this; for now, just bump the relative path)
- `./utils/fetch-helpers.js` → `../utils/fetch-helpers.js`
- `./validation/schemas.js` → `../validation/schemas.js`

Run typecheck to identify each broken import; fix them one by one.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move remote-client.ts into activitypub/ (Plan E)"
```

---

## Task 5: Move telemetry cluster (performance-monitor, health-check, logging)

**Files moved:**
- `src/performance-monitor.ts` → `src/telemetry/performance-monitor.ts`
- `src/health-check.ts` → `src/telemetry/health-check.ts`
- `src/logging.ts` → `src/telemetry/logging.ts`

- [ ] **Step 1: Identify importers**

```bash
grep -rn 'from "\.[\./]*performance-monitor\|from "\.[\./]*health-check\|from "\.[\./]*logging' src/ tests/
```

Expect hits in `mcp-server.ts`, `mcp/tools.ts`, `mcp/tools-write.ts`, `mcp/resources.ts`, `mcp-main.ts`, and `tests/unit/performance-monitor.test.ts` / `health-check.test.ts` if those exist.

- [ ] **Step 2: Move**

```bash
git mv src/performance-monitor.ts src/telemetry/performance-monitor.ts
git mv src/health-check.ts src/telemetry/health-check.ts
git mv src/logging.ts src/telemetry/logging.ts
```

- [ ] **Step 3: Update importers**

For each hit:
- `from "./performance-monitor.js"` → `from "./telemetry/performance-monitor.js"`
- `from "./health-check.js"` → `from "./telemetry/health-check.js"`
- `from "./logging.js"` → `from "./telemetry/logging.js"`
- And `../` variants.

- [ ] **Step 4: Update the three moved files' own imports**

Each may import from `./config.js`, `./utils.js`, etc. Bump those to `../config.js`, `../utils.js`. Use typecheck to find them.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move performance/health/logging into telemetry/ (Plan E)"
```

---

## Task 6: Move resilience cluster (rate-limiter, adaptive-rate-limiter)

**Files moved:**
- `src/server/rate-limiter.ts` → `src/resilience/rate-limiter.ts`
- `src/server/adaptive-rate-limiter.ts` → `src/resilience/adaptive-rate-limiter.ts`

- [ ] **Step 1: Identify importers**

```bash
grep -rn 'from "\.[\./]*server/rate-limiter\|from "\.[\./]*server/adaptive-rate-limiter\|from "\.[\./]*server/index\.js' src/ tests/
```

Also check the `src/server/index.ts` re-exports — those will be inlined when `server/` is deleted in Task 10.

- [ ] **Step 2: Move**

```bash
git mv src/server/rate-limiter.ts src/resilience/rate-limiter.ts
git mv src/server/adaptive-rate-limiter.ts src/resilience/adaptive-rate-limiter.ts
```

- [ ] **Step 3: Update importers**

- `from "../server/rate-limiter.js"` → `from "../resilience/rate-limiter.js"`
- `from "../server/adaptive-rate-limiter.js"` → `from "../resilience/adaptive-rate-limiter.js"`
- `from "./rate-limiter.js"` and `./adaptive-rate-limiter.js` (within server/) — those importers will move/disappear in Tasks 7/10. Update the path now for any file that's still in src/server/ but imports rate-limiter: change to `../resilience/rate-limiter.js`.
- `src/server/index.ts` re-exports rate-limiter — temporarily update to re-export from `../resilience/rate-limiter.js`. This file gets deleted in Task 10.

- [ ] **Step 4: Update moved files' own imports**

Both files may import from `../config.js`, `../utils.js` (the prior `../server/` → `../`); after move they remain `../config.js`, `../utils.js` since the depth stayed the same. But verify with typecheck.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move rate-limiters into resilience/ (Plan E)"
```

---

## Task 7: Move transport cluster (http-transport, auth-middleware)

**Files moved:**
- `src/server/http-transport.ts` → `src/transport/http.ts` (rename to drop the redundant "transport" suffix since the dir already says it)
- `src/server/auth-middleware.ts` → `src/transport/auth-middleware.ts`

- [ ] **Step 1: Identify importers**

```bash
grep -rn 'from "\.[\./]*server/http-transport\|from "\.[\./]*server/auth-middleware\|HttpTransportServer\b\|checkBearerAuth\b' src/ tests/
```

- [ ] **Step 2: Move**

```bash
git mv src/server/http-transport.ts src/transport/http.ts
git mv src/server/auth-middleware.ts src/transport/auth-middleware.ts
```

- [ ] **Step 3: Update importers**

- `from "../server/http-transport.js"` → `from "../transport/http.js"`
- `from "../server/auth-middleware.js"` → `from "../transport/auth-middleware.js"`
- `from "./auth-middleware.js"` inside the moved http.ts — already in same dir, just keep as `./auth-middleware.js`
- `src/server/index.ts` re-exports `HttpTransportServer` from `./http-transport.js` — update to `from "../transport/http.js"` (this file gets deleted in Task 10).

- [ ] **Step 4: Update moved files' own imports**

`src/transport/http.ts` imports things like `../config.js`, `../telemetry/...`, `../resilience/rate-limiter.js`. Depths stay the same (one level deep). Use typecheck to verify.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move http-transport + auth-middleware into transport/ (Plan E)"
```

---

## Task 8: Move validators to `validation/`

**Files moved:** `src/server/validators.ts` → `src/validation/validators.ts`

- [ ] **Step 1: Identify importers**

```bash
grep -rn 'from "\.[\./]*server/validators\|from "\.[\./]*server/index\.js' src/ tests/
```

Validators are re-exported via `src/server/index.ts` — most importers come through there.

- [ ] **Step 2: Move**

```bash
git mv src/server/validators.ts src/validation/validators.ts
```

- [ ] **Step 3: Update importers**

- `from "../server/validators.js"` → `from "../validation/validators.js"`
- `src/server/index.ts` `from "./validators.js"` → `from "../validation/validators.js"` (this file gets deleted in Task 10).

- [ ] **Step 4: Update moved file's own imports**

`validators.ts` may import from `../config.js`, `../validation/schemas.js`. Depths stay the same. Use typecheck to verify.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move validators into validation/ (Plan E)"
```

---

## Task 9: Split `src/utils.ts` (3-way)

**Files:**
- Create: `src/validation/url.ts` — `isPrivateIPv4`, `isPrivateIPv6`, `isPrivateIP`, `isBlockedHostname`, `validateExternalUrl`, `validateExternalUrlSync`, plus the internal helpers `validateIpHostname`, `isIpAddress`, `handleDnsLookupError`
- Create: `src/utils/errors.ts` — `getErrorMessage`, `getErrorSuggestion`, `formatErrorWithSuggestion`
- Create: `src/utils/html.ts` — `stripHtmlTags`
- Delete: `src/utils.ts`
- Update: every importer

This task is more involved than the moves. Take it step-by-step.

- [ ] **Step 1: Read `src/utils.ts` end-to-end**

```bash
cat src/utils.ts
```

Note: function-level boundaries, internal helpers, top-of-file imports.

- [ ] **Step 2: Create `src/validation/url.ts`**

Extract the URL/IP validation functions and their internal helpers from `src/utils.ts`. Include `import` statements they need (e.g., `node:dns/promises`, `node:net`). Copy:

- `isPrivateIPv4` (line ~217)
- `isPrivateIPv6` (line ~227)
- `isPrivateIP` (line ~247)
- `isBlockedHostname` (line ~261)
- `validateIpHostname` (line ~283, internal helper — used by validateExternalUrl)
- `isIpAddress` (line ~301, internal helper)
- `handleDnsLookupError` (line ~308, internal helper)
- `validateExternalUrl` (line ~333)
- `validateExternalUrlSync` (line ~372)

Plus any imports the originals used (DNS, blocklist, etc.). The blocklist import currently is `import { instanceBlocklist } from "./instance-blocklist.js"` — Task 2 moved it to `src/policy/instance-blocklist.ts`, so the new path from `src/validation/url.ts` is `../policy/instance-blocklist.js`.

- [ ] **Step 3: Create `src/utils/errors.ts`**

Extract:
- `getErrorMessage` (line ~129)
- `getErrorSuggestion` (line ~100)
- `formatErrorWithSuggestion` (line ~114)

Plus any constants these functions use (look for top-of-file `const`s referenced by these functions only — move those too).

- [ ] **Step 4: Create `src/utils/html.ts`**

Extract:
- `stripHtmlTags` (line ~393)

- [ ] **Step 5: Identify importers of utils.ts**

```bash
grep -rn 'from "\.[\./]*utils\.js"\|from "@/utils"' src/ tests/
```

Catalog each importer's exact import line. Each imports a SUBSET of the exports — that determines which new file each importer points at.

- [ ] **Step 6: Update each importer**

For each hit, replace the single `import { ... } from "./utils.js"` with one or more imports from the three new files:

- `validateExternalUrl`, `isPrivateIP`, etc. → from `./validation/url.js`
- `getErrorMessage`, `getErrorSuggestion`, `formatErrorWithSuggestion` → from `./utils/errors.js`
- `stripHtmlTags` → from `./utils/html.js`

Example before:
```typescript
import { validateExternalUrl, getErrorMessage, stripHtmlTags } from "./utils.js";
```

After:
```typescript
import { validateExternalUrl } from "./validation/url.js";
import { getErrorMessage } from "./utils/errors.js";
import { stripHtmlTags } from "./utils/html.js";
```

Adjust `../` depth per importer.

- [ ] **Step 7: Delete `src/utils.ts`**

```bash
git rm src/utils.ts
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. Any "Cannot find module './utils.js'" or "has no exported member 'X'" means an importer wasn't updated correctly — find and fix.

- [ ] **Step 9: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS (628). All URL validation, error formatting, and HTML stripping should work identically.

- [ ] **Step 10: Update existing tests for the split**

If `tests/unit/utils.test.ts` exists, it imports from `../../src/utils.js`. The test file probably tests multiple categories. Two options:

A) Split the test file: `tests/unit/url-validation.test.ts` (validation tests), `tests/unit/errors.test.ts` (error helper tests), `tests/unit/html.test.ts` (stripHtmlTags tests).

B) Keep `tests/unit/utils.test.ts` as a single file but import from all three new modules.

Recommendation: B is simpler and matches the project's flat test layout convention. Just update the imports in the existing test file.

If you go with A, do it as a separate sub-commit so the diff is clear.

- [ ] **Step 11: Re-run test suite**

Run: `npm test`
Expected: 628 passing.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: split utils.ts into validation/url + utils/errors + utils/html (Plan E)"
```

---

## Task 10: Delete `src/server/` (fold `index.ts` re-exports inline)

After Tasks 6, 7, 8, the only file left in `src/server/` is `index.ts`. Delete the directory entirely and update consumers that imported from `../server/index.js`.

- [ ] **Step 1: Confirm src/server/ has only index.ts left**

```bash
ls src/server/
```

Expected: `index.ts` only. If anything else remains (e.g., a leftover file), it means a previous task missed something — go back and fix before proceeding.

- [ ] **Step 2: Read the current `src/server/index.ts`**

```bash
cat src/server/index.ts
```

After Tasks 6-8, it should re-export from the new locations:
- `AdaptiveRateLimiter`, `adaptiveRateLimiter`, `InstanceRateLimit` from `../resilience/adaptive-rate-limiter.js`
- `HttpTransportOptions`, `HttpTransportServer` from `../transport/http.js`
- `RateLimitConfig`, `RateLimiter` from `../resilience/rate-limiter.js`
- `extractSingleValue`, `validateActorIdentifier`, `validateDomain`, `validateQuery` from `../validation/validators.js`

- [ ] **Step 3: Find every importer of `src/server/index.ts`**

```bash
grep -rn 'from "\.[\./]*server/index\.js\|from "\.[\./]*server"' src/ tests/
```

Expect hits in `mcp-server.ts`, `mcp/tools.ts`, `mcp/tools-write.ts`, `mcp/tools-export.ts`, `mcp/resources.ts`.

- [ ] **Step 4: Replace each `from "../server/index.js"` import with direct imports**

For each importer, replace the `from "../server/index.js"` line with direct imports from the new locations. Example:

Before:
```typescript
import { HttpTransportServer, RateLimiter } from "./server/index.js";
```

After:
```typescript
import { HttpTransportServer } from "./transport/http.js";
import { RateLimiter } from "./resilience/rate-limiter.js";
```

Another example:
```typescript
// Before
import { extractSingleValue, validateActorIdentifier } from "../server/index.js";

// After
import { extractSingleValue, validateActorIdentifier } from "../validation/validators.js";
```

- [ ] **Step 5: Delete the server directory**

```bash
git rm src/server/index.ts
rmdir src/server   # cleans up the now-empty dir
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. Any `Cannot find module "./server/..."` indicates a missed importer.

- [ ] **Step 7: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: delete src/server/ — inline re-exports into consumers (Plan E)"
```

---

## Task 11: Delete still-empty placeholder dirs

After Tasks 1-10, these dirs should still be empty (the spec deliberately did not assign them content):
- `src/async/`
- `src/security/`
- `src/streaming/`
- `src/errors/`
- `src/translation/`
- `src/media/`

- [ ] **Step 1: Confirm each is empty**

```bash
for dir in async security streaming errors translation media; do
  count=$(find src/$dir -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "src/$dir: $count files"
done
```

Each should report `0 files`. If any non-zero, investigate before deleting — that file would be content that needs a real home.

- [ ] **Step 2: Delete the empty dirs**

```bash
rmdir src/async src/security src/streaming src/errors src/translation src/media
```

(`rmdir` only removes empty dirs — it'll error if any aren't empty. That's a safety net.)

- [ ] **Step 3: Typecheck + lint + test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS. No code changes, so nothing should break.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete unused placeholder directories under src/ (Plan E)

Removes async/, security/, streaming/, errors/, translation/, media/.
These were created as part of a never-finished refactor plan; the
v2 reorg (Plan E) covers the directories that actually correspond
to current code."
```

---

## Task 12: Repo hygiene — clean up `.DS_Store` files

**Files:** `.DS_Store` files on disk (not currently tracked in git).

The repo has `.DS_Store` files at `./.DS_Store`, `./src/.DS_Store`, and possibly elsewhere. They're NOT tracked in git (already confirmed). Verify they're in `.gitignore` so they stay untracked.

- [ ] **Step 1: Confirm .gitignore covers them**

```bash
grep -n "DS_Store" .gitignore
```

If there's a line like `.DS_Store` or `**/.DS_Store`, the pattern is in place.

- [ ] **Step 2: Locally delete the on-disk files (optional but tidy)**

```bash
find . -name ".DS_Store" -not -path "./node_modules/*" -delete 2>/dev/null
```

This is a local-workspace cleanup, no commit needed.

- [ ] **Step 3: Empty `.env` file at repo root**

The `.env` file at `./.env` is empty (0 bytes). It is NOT tracked in git. The template `.env.example` is the documented source.

Action: leave the empty `.env` alone — many dev tools expect to be able to write to it without errors, and removing it could trip up local-dev tooling. Just confirm `.gitignore` covers `.env`:

```bash
grep -n "^\.env\b\|^\.env$" .gitignore
```

Should match (it's already in there from the standard Node gitignore).

- [ ] **Step 4: No commit needed if Steps 1 and 3 confirm gitignore coverage**

If gitignore is missing a `.DS_Store` line, add it and commit:

```bash
# Only if needed:
echo ".DS_Store" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .DS_Store across the repo"
```

If gitignore already covers everything, skip this step. Just report it as a no-op in your verification.

---

## Task 13: Final verification

**Files:** none modified — verification step.

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: 628 passing.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds; `dist/` populated.

- [ ] **Step 5: Tarball check + bin smoke (from Plan D)**

Run: `node scripts/check-tarball-contents.js && node scripts/smoke-test-bin.js`
Expected: both pass. The smoke test exercises the entire compiled module graph; if any import is broken, it surfaces here.

- [ ] **Step 6: Inspect the final src/ tree**

```bash
find src -maxdepth 2 -type d | sort
```

Expected: shows the populated topic dirs (audit, policy, discovery, activitypub, telemetry, transport, resilience, validation, utils, plus pre-existing auth and mcp) and the docs-site dirs (components, layouts, pages, styles, data). No remnants of `server/`, `async/`, `security/`, `streaming/`, `errors/`, `translation/`, `media/`.

- [ ] **Step 7: Inspect the final flat src/ files**

```bash
find src -maxdepth 1 -type f | sort
```

Expected: `mcp-main.ts`, `mcp-server.ts`, `main.ts`, `config.ts`, `site-config.ts` (Astro docs config). NO `utils.ts`, `audit-logger.ts`, `webfinger.ts`, etc. — those all moved.

- [ ] **Step 8: Do NOT push the branch.** Report ready for Plan F (release) and stop.

## Report Format

- Status (DONE / DONE_WITH_CONCERNS / BLOCKED)
- Each step's result
- Final `src/` tree shape
- Test count (must be 628)
- Tarball file count
- Any concerns (especially around the utils.ts split — did all callers route to the right new module?)

---

## Done

When all 13 tasks check off, Plan E is complete. The v2 codebase is fully reorganized. The next and last plan is **Plan F — Migration finalization + release** (spec section 7), which polishes `MIGRATION-v2.md`, finalizes `CHANGELOG.md`, and walks through the 2.0.0-alpha → 2.0.0 release process.
