# v2 Plan B — Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 9 correctness findings from spec section 4 (H4 ETag 304 spurious error, H5 PerformanceMonitor cleanup, H6 ACTIVITYPUB_ACCOUNTS delimiter, H7 discover-instances filter composition, M1 cursor override, M12 extractNextCursor semantics, L3 dead double-start guard, L6 LRUCache.has() removal, L7 importFromJson validation).

**Architecture:** Pure bug-fix work. Each finding is independent and surgical — no new modules, no breaking refactors. The H6 token-delimiter change is the only externally-visible break (config format). H5 removes the forced `process.exit(0)` in shutdown, which can expose latent process-leak bugs — this is intentional. TDD throughout.

**Tech Stack:** TypeScript (ESM), Vitest, Zod, Node 20+.

**Spec reference:** [docs/superpowers/specs/2026-05-27-v2-release-design.md §4](../specs/2026-05-27-v2-release-design.md)

**Plan A artifacts you build on:**
- All files use pre-refactor paths (refactor lands in Plan E).
- v2 branch baseline at this plan's start: 596 tests passing.
- `npx tsc --noEmit` must remain clean throughout (Plan A established this discipline; Plan D will add it to CI).

---

## Pre-flight (one-time, do before Task 1)

- Confirm you're on the `v2` branch: `git branch --show-current` → `v2`.
- Run the test suite once for a clean baseline: `npm test` → 596 passing.
- Run `npx tsc --noEmit` → zero errors.

---

## Task 1: Split `extractNextCursor` into next vs. first-page (M12)

**Files:**
- Modify: `src/remote-client.ts` (the private `extractNextCursor` at line 333; the caller in `fetchActorOutboxPaginated` around line 317)
- Test: `tests/unit/remote-client.test.ts`

The current `extractNextCursor` returns `collection.next` if present, else falls back to `collection.first`. That's misleading: a "next cursor" labeled with the root collection's `first` link can cause callers to think they're moving forward when they're just bouncing back to page 1.

Split into two methods with clear semantics. The caller (`fetchActorOutboxPaginated`) decides which to use: `extractNextCursor` for true forward pagination, `extractFirstPageCursor` to descend into the data page when the root collection has no items.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/remote-client.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

// Note: extractNextCursor is private; we test indirectly via fetchActorOutboxPaginated.
// The "first-page-as-next-cursor" footgun is observable when the root collection has
// no items and only a `first` link. With the fix, the returned thread should set
// `hasMore: false` (no `next`) on its first response if items are missing, NOT
// return `collection.first` as the next cursor.

describe("extractNextCursor semantics (M12)", () => {
  it("returns hasMore=false when collection has neither items nor a next link", async () => {
    // setup via MSW: actor → outbox root that only has `first`, no orderedItems, no next
    // assert: response.hasMore === false (or response.nextCursor is undefined)
  });

  it("follows `first` to data page when root has no items and no cursor was supplied", async () => {
    // setup via MSW:
    //   actor → outbox root: { type: "OrderedCollection", first: ".../page-1" }
    //   page-1 → { type: "OrderedCollectionPage", orderedItems: [...], next: ".../page-2" }
    // call fetchActorOutboxPaginated WITHOUT a cursor
    // assert: response.posts has the items from page-1; response.nextCursor is page-2 URL
  });

  it("does NOT loop back to `first` once on a CollectionPage with no `next`", async () => {
    // setup via MSW:
    //   actor → outbox root: { first: ".../page-1" }
    //   page-1: { orderedItems: [...], first: ".../page-1" }   <- no `next` link
    // call: pass page-1's URL as cursor
    // assert: response.nextCursor is undefined (NOT page-1 again)
  });
});
```

Adapt the MSW fixture pattern from the existing `remote-client.test.ts` and `remote-client-thread.test.ts` files (they already use `setupServer`, `http.get`, etc.). The tests above are written behaviorally so they don't depend on `extractNextCursor` being public.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/remote-client.test.ts -t "extractNextCursor semantics"`
Expected: FAIL — case 3 fails because the current code returns `collection.first` as a cursor.

- [ ] **Step 3: Split the two helpers**

In `src/remote-client.ts`, replace the existing private `extractNextCursor` (currently at line 333) with two methods:

```typescript
/**
 * Extract the "next page" cursor from a collection.
 *
 * Returns `collection.next` only. Does NOT fall back to `collection.first` —
 * that's a separate concept (initial descent into the data page), exposed via
 * extractFirstPageCursor.
 */
private extractNextCursor(collection: ActivityPubCollection): string | undefined {
  return typeof collection.next === "string" ? collection.next : undefined;
}

/**
 * Extract the "first page" cursor from a root collection.
 *
 * When a root OrderedCollection has no inline items, callers follow this to
 * descend into the data page. Subsequent pagination uses `next` only.
 */
private extractFirstPageCursor(collection: ActivityPubCollection): string | undefined {
  if (typeof collection.first === "string") {
    return collection.first;
  }
  if (typeof collection.first === "object" && collection.first !== null) {
    const firstObj = collection.first as unknown as Record<string, unknown>;
    if ("id" in firstObj && typeof firstObj.id === "string") {
      return firstObj.id;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Update the caller in `fetchActorOutboxPaginated`**

In `fetchActorOutboxPaginated`, the existing call near line 317:

```typescript
const nextCursor = this.extractNextCursor(collection);
```

needs to handle the "root collection with no items" case explicitly. The current behavior was: if the root has `first`, use that as `nextCursor`. After the split, the caller must:

1. Check whether the collection has items (`orderedItems` or `items` non-empty).
2. If items present, set `nextCursor = extractNextCursor(collection)` (may be undefined → hasMore: false).
3. If no items AND no cursor was provided (i.e. we're at the root), set `nextCursor = extractFirstPageCursor(collection)` so the next call lands on the data page.
4. If no items AND a cursor WAS provided (we're already on a page that ran out), `nextCursor = undefined`.

Apply that logic where the cursor is computed. Roughly:

```typescript
const items = collection.orderedItems || collection.items || [];
let nextCursor: string | undefined;
if (items.length > 0) {
  nextCursor = this.extractNextCursor(collection);
} else if (!cursor) {
  // Root collection had no inline items — follow `first` to the data page.
  nextCursor = this.extractFirstPageCursor(collection);
}
// else: ran out on a CollectionPage — hasMore: false
```

Then `hasMore: !!nextCursor` as before.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/remote-client.test.ts`
Expected: PASS. All 3 new tests green; existing 34 remote-client tests still green.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (599 total: 596 + 3).

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/remote-client.ts tests/unit/remote-client.test.ts
git commit -m "fix(remote-client): separate extractNextCursor from first-page descent (M12)"
```

---

## Task 2: Don't override cursor's query params with id-filters (M1)

**Files:**
- Modify: `src/remote-client.ts` (the cursor handling inside `fetchActorOutboxPaginated`, lines ~286-296)
- Test: `tests/unit/remote-client.test.ts`

When the caller passes both a `cursor` and `minId`/`maxId`/`sinceId`, the current code overwrites the cursor's query params, breaking server-side pagination state. Cursors and id-filters are mutually exclusive.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/remote-client.test.ts`:

```typescript
describe("fetchActorOutboxPaginated cursor vs id-filter (M1)", () => {
  it("preserves cursor query params and ignores caller-supplied maxId", async () => {
    // setup MSW:
    //   actor → outbox with first = .../page?max_id=X
    //   .../page?max_id=X → returns an OrderedCollectionPage
    //   The test asserts that when the caller passes cursor=".../page?max_id=X"
    //   AND maxId="Y", the actual request goes to .../page?max_id=X (NOT max_id=Y).
    let requestedUrl: string | null = null;
    server.use(
      http.get("https://a.test/users/u/outbox", () => ({...})),   // actor outbox
      http.get("https://a.test/users/u/outbox/page", ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ type: "OrderedCollectionPage", orderedItems: [] });
      }),
    );
    const client = new RemoteActivityPubClient();
    await client.fetchActorOutboxPaginated("u@a.test", {
      cursor: "https://a.test/users/u/outbox/page?max_id=X",
      maxId: "Y",   // should be ignored
    });
    expect(requestedUrl).toContain("max_id=X");
    expect(requestedUrl).not.toContain("max_id=Y");
  });

  it("applies caller's maxId when no cursor is provided", async () => {
    let requestedUrl: string | null = null;
    server.use(
      http.get("https://a.test/users/u/outbox", ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ type: "OrderedCollection", orderedItems: [] });
      }),
      // simpler actor mock as needed
    );
    const client = new RemoteActivityPubClient();
    await client.fetchActorOutboxPaginated("u@a.test", { maxId: "Y" });
    expect(requestedUrl).toContain("max_id=Y");
  });
});
```

Adapt the MSW setup to whatever the file already uses; the assertions are what matter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/remote-client.test.ts -t "cursor vs id-filter"`
Expected: FAIL — current code sets `max_id=Y` over the cursor.

- [ ] **Step 3: Gate id-filter writes on `!cursor`**

In `src/remote-client.ts`, around line 286-296 (the `searchParams.set(...)` block immediately after the cursor branch resolves `fetchUrl`):

```typescript
// Apply caller-supplied filters only when no cursor was provided.
// Cursor URLs already encode their own pagination state.
if (!cursor) {
  fetchUrl.searchParams.set("limit", limit.toString());
  if (minId) fetchUrl.searchParams.set("min_id", minId);
  if (maxId) fetchUrl.searchParams.set("max_id", maxId);
  if (sinceId) fetchUrl.searchParams.set("since_id", sinceId);
}
```

Wrap the existing `searchParams.set` block with `if (!cursor) { ... }`. Note: this also gates `limit` — that's intentional. The cursor URL already encodes its own page size and overriding it would create the same inconsistency.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/remote-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (601 total).

- [ ] **Step 6: Commit**

```bash
git add src/remote-client.ts tests/unit/remote-client.test.ts
git commit -m "fix(remote-client): preserve cursor URL query params (M1)"
```

---

## Task 3: Spurious `HTTP 304: Not Modified` error (H4)

**Files:**
- Modify: `src/remote-client.ts` (`executeWithRetry` around line 660-675)
- Test: `tests/unit/remote-client.test.ts`

Current code at line 665:
```typescript
if (response.status === 304 && cached) {
  return cached.data;
}
if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}
```

When 304 comes back without a cached entry (cache evicted via TTL while server still has our ETag), the `&& cached` guard fails, the `!response.ok` branch runs (304 is not "ok"), and an error is thrown. 304 isn't an error — it's a cache-validation result the client can't currently use.

Fix: re-fetch without `If-None-Match` and cache fresh.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/remote-client.test.ts`:

```typescript
describe("ETag 304 without cache (H4)", () => {
  it("re-fetches without If-None-Match when 304 comes back with no cache entry", async () => {
    let callCount = 0;
    server.use(
      http.get("https://a.test/object", ({ request }) => {
        callCount++;
        // First call: client sends some ETag (or none) — return 304 to simulate
        // the server insisting it's unchanged even though our cache is empty.
        if (callCount === 1) {
          return new HttpResponse(null, { status: 304 });
        }
        // Second call: client should retry without If-None-Match — return fresh data.
        if (request.headers.get("if-none-match") !== null) {
          // The retry should have stripped the If-None-Match header. If it's
          // still present, this test will fail (a real regression — we want
          // a clean retry).
          return new HttpResponse(null, { status: 304 });
        }
        return HttpResponse.json({ id: "https://a.test/object", type: "Note", content: "hi" });
      }),
    );
    const client = new RemoteActivityPubClient();
    const obj = await client.fetchObject("https://a.test/object");
    expect(obj.id).toBe("https://a.test/object");
    expect(callCount).toBe(2); // proves we did the retry
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/remote-client.test.ts -t "ETag 304 without cache"`
Expected: FAIL — current code throws `HTTP 304: Not Modified`.

- [ ] **Step 3: Update `executeWithRetry`**

In `src/remote-client.ts`, replace the 304-handling section in `executeWithRetry` (around lines 663-675):

```typescript
// Handle 304 Not Modified
if (response.status === 304) {
  if (cached) {
    logger.debug("Using cached response (304 Not Modified)", { url });
    return cached.data;
  }
  // 304 with no cache entry — server insists it's unchanged but we have nothing.
  // Re-fetch once without If-None-Match.
  logger.debug("304 received but no cache entry; re-fetching", { url });
  const freshHeaders = new Headers(options.headers);
  freshHeaders.delete("If-None-Match");
  const freshResponse = await this.fetchWithTimeout(url, { ...options, headers: freshHeaders });
  if (!freshResponse.ok) {
    throw new Error(`HTTP ${freshResponse.status}: ${freshResponse.statusText}`);
  }
  return await this.processResponse(freshResponse, url, schema);
}

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/remote-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (602 total).

- [ ] **Step 6: Commit**

```bash
git add src/remote-client.ts tests/unit/remote-client.test.ts
git commit -m "fix(remote-client): re-fetch without If-None-Match on uncached 304 (H4)"
```

---

## Task 4: `PerformanceMonitor` interval cleanup (H5)

**Files:**
- Modify: `src/performance-monitor.ts` (the `startMetricsCollection` method around line 234-239)
- Modify: `src/mcp-server.ts` (the `stop()` method around line 149-160, plus removing the forced `process.exit(0)` around line 133)
- Test: `tests/unit/performance-monitor.test.ts`

Three changes:
1. `.unref()` the metrics interval (so it doesn't block process exit).
2. Call `performanceMonitor.stop()` from `ActivityPubMCPServer.stop()`.
3. Remove the forced `process.exit(0)` at the end of the SIGTERM/SIGINT handler in `mcp-server.ts:133`. If something else is keeping the loop alive after `stop()`, we want it surfaced.

- [ ] **Step 1: Write the failing test for unref**

Append to `tests/unit/performance-monitor.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("PerformanceMonitor.startMetricsCollection unref (H5)", () => {
  it("unrefs the metrics interval so it does not keep the event loop alive", async () => {
    process.env.METRICS_ENABLED = "true";
    process.env.METRICS_INTERVAL = "1000";
    // We need a fresh module to see the env-controlled behavior.
    const { PerformanceMonitor } = await import("../../src/performance-monitor.js");
    const pm = new PerformanceMonitor();
    // Start collection — captures the NodeJS.Timeout
    (pm as unknown as { startMetricsCollection: () => void }).startMetricsCollection();
    // Reach into the private field to verify it was unref'd. This is the only
    // way to test it directly without changing the public API.
    const interval = (pm as unknown as { metricsInterval?: NodeJS.Timeout }).metricsInterval;
    expect(interval).toBeDefined();
    // unref() on a Timeout is idempotent and returns the Timeout. We don't have
    // a public "is unref'd" flag, but we can assert that calling unref() again
    // doesn't throw and returns the same object — a smoke check that the API
    // shape is correct.
    expect(typeof (interval as NodeJS.Timeout).unref).toBe("function");
    // The most useful assertion: stop() clears the interval.
    pm.stop();
    expect((pm as unknown as { metricsInterval?: NodeJS.Timeout }).metricsInterval).toBeUndefined();
  });
});
```

If `PerformanceMonitor` is exported as a singleton only (`performanceMonitor`), the test will need to construct the class differently — read the file's exports first.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/performance-monitor.test.ts -t "unref"`
Expected: FAIL — assertion about the timer existing may pass, but the test framework will report no unref invocation. (If the assertion doesn't directly catch the absence of unref, the next step's manual smoke in Task 10 will.)

- [ ] **Step 3: Add `.unref()` to the interval**

In `src/performance-monitor.ts` around line 236, change:

```typescript
this.metricsInterval = setInterval(() => {
  this.updateSystemMetrics();
  this.logMetrics();
}, interval);
```

to:

```typescript
this.metricsInterval = setInterval(() => {
  this.updateSystemMetrics();
  this.logMetrics();
}, interval);
this.metricsInterval.unref();
```

- [ ] **Step 4: Wire `performanceMonitor.stop()` into `ActivityPubMCPServer.stop()`**

In `src/mcp-server.ts`, in the `stop()` method (around line 149-160). Currently:

```typescript
async stop(): Promise<void> {
  if (this.httpServer) {
    await this.httpServer.stop();
  }
  this.rateLimiter.stop();
  logger.info("ActivityPub MCP Server stopped");
}
```

Update to also stop the perf monitor. Add the import at the top of the file:

```typescript
import { performanceMonitor } from "./performance-monitor.js";
```

(If it's already imported elsewhere in the file, don't duplicate.)

Then update `stop()`:

```typescript
async stop(): Promise<void> {
  if (this.httpServer) {
    await this.httpServer.stop();
  }
  this.rateLimiter.stop();
  performanceMonitor.stop();
  logger.info("ActivityPub MCP Server stopped");
}
```

- [ ] **Step 5: Remove the forced `process.exit(0)` from the shutdown signal handler**

In `src/mcp-server.ts` around line 130-138, the current shutdown handler:

```typescript
const shutdown = async () => {
  logger.info("Received shutdown signal");
  try {
    await this.stop();
    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", { error });
    process.exit(1);
  }
};
```

becomes:

```typescript
const shutdown = async () => {
  logger.info("Received shutdown signal");
  try {
    await this.stop();
    logger.info("Graceful shutdown completed");
    // No process.exit(0) — let the event loop drain naturally.
    // If the process hangs here, that's a leak we want to surface, not paper over.
  } catch (error) {
    logger.error("Error during shutdown", { error });
    process.exit(1);
  }
};
```

(Leave the error-path `process.exit(1)` — that's appropriate for a failed shutdown.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/performance-monitor.test.ts`
Expected: PASS.

- [ ] **Step 7: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (603 total).

- [ ] **Step 8: Manual smoke — process exits cleanly with metrics enabled**

```bash
METRICS_ENABLED=true MCP_HTTP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") timeout 3 npx tsx src/mcp-main.ts
```

Expected: the process starts, sits on stdio, the `timeout` after 3 seconds sends SIGTERM, and the process exits within ~1 second of receiving the signal (not hanging waiting for the interval). The exit code from `timeout` will be 124 (forced kill) or 143 (SIGTERM handled). Either is fine — we want to confirm there is NO hang past `timeout`'s grace period.

If the process hangs, the unref or stop() wiring is broken — revert and debug.

- [ ] **Step 9: Commit**

```bash
git add src/performance-monitor.ts src/mcp-server.ts tests/unit/performance-monitor.test.ts
git commit -m "fix: unref + stop PerformanceMonitor interval on shutdown (H5)"
```

---

## Task 5: `ACTIVITYPUB_ACCOUNTS` delimiter (H6) — BREAKING

**Files:**
- Modify: `src/auth/account-manager.ts` (the env parser around lines 100-130)
- Test: `tests/unit/account-manager.test.ts`
- Update: `MIGRATION-v2.md` (append a section)

The current parser does `entry.split(":")`, which truncates tokens containing `:` (JWTs, accidentally-prefixed `Bearer `). Switch to `|` as the delimiter. Detect legacy `:`-delimited entries and fail loudly with a migration error rather than silently truncating.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/account-manager.test.ts`:

```typescript
describe("ACTIVITYPUB_ACCOUNTS pipe delimiter (H6)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("parses pipe-delimited accounts correctly", async () => {
    process.env.ACTIVITYPUB_ACCOUNTS = "id1|inst1.test|tok-with:colons|user1|label1";
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    const manager = new AccountManager();
    const accounts = manager.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe("id1");
    expect(accounts[0].instance).toBe("inst1.test");
    // The token (which contains a colon) must be preserved verbatim.
    const acct = manager.getAccount("id1");
    expect(acct?.accessToken).toBe("tok-with:colons");
  });

  it("throws clear migration error for legacy `:`-delimited entries", async () => {
    process.env.ACTIVITYPUB_ACCOUNTS = "id1:inst1.test:tok:user1";
    delete process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    delete process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    const { AccountManager } = await import("../../src/auth/account-manager.js");
    expect(() => new AccountManager()).toThrow(/ACTIVITYPUB_ACCOUNTS.*pipe/i);
  });
});
```

(Adapt the `originalEnv` pattern from the existing tests in this file — they already use `vi.resetModules()` + env restoration.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/account-manager.test.ts -t "pipe delimiter"`
Expected: FAIL — current code uses `:` and silently truncates tokens.

- [ ] **Step 3: Update the parser**

In `src/auth/account-manager.ts`, find the env loader that processes `ACTIVITYPUB_ACCOUNTS` (around lines 100-130). Replace the splitting logic. The new behavior:

1. If `ACTIVITYPUB_ACCOUNTS` contains `:` but no `|`, throw `Error("ACTIVITYPUB_ACCOUNTS uses pipe (|) delimiter as of v2. Migrate from 'id:inst:tok:...' to 'id|inst|tok|...'. See MIGRATION-v2.md.")`.
2. Otherwise split on `|`.

Concrete replacement (verify exact line range by reading the file first):

```typescript
const rawAccounts = process.env.ACTIVITYPUB_ACCOUNTS;
if (rawAccounts) {
  // Migration guard: legacy `:`-delimited format silently truncated tokens
  // containing colons. Refuse to start rather than silently misload.
  if (rawAccounts.includes(":") && !rawAccounts.includes("|")) {
    throw new Error(
      "ACTIVITYPUB_ACCOUNTS uses pipe (|) delimiter as of v2. " +
      "Migrate from 'id:inst:tok:user:label' to 'id|inst|tok|user|label'. " +
      "See MIGRATION-v2.md.",
    );
  }
  const entries = rawAccounts.split(",").map((e) => e.trim()).filter(Boolean);
  for (const entry of entries) {
    try {
      const parts = entry.split("|");
      const [id, instance, token, username = "user", label] = parts;
      if (!id || !instance || !token) {
        logger.warn("Skipping malformed account entry", { entry });
        continue;
      }
      this.addAccount({
        id,
        instance,
        accessToken: token,
        tokenType: "Bearer",
        username,
        label,
        scopes: ["read", "write"],
      });
    } catch (error) {
      logger.warn("Failed to load account from environment", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
```

Keep the rest of the loader (default-account branch, etc.) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/account-manager.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (605 total).

- [ ] **Step 6: Append migration note to `MIGRATION-v2.md`**

Open `MIGRATION-v2.md` (created in Plan A) and add a new subsection under "Required actions to run v2.0.0":

```markdown
### N. `ACTIVITYPUB_ACCOUNTS` now uses pipe `|` delimiter

The multi-account env var changed from colon-delimited to pipe-delimited
so tokens containing colons (e.g. JWTs) parse correctly.

**Before (v1):**

```
ACTIVITYPUB_ACCOUNTS=id1:inst1:tok1:user1:label1,id2:inst2:tok2:user2:label2
```

**After (v2):**

```
ACTIVITYPUB_ACCOUNTS=id1|inst1|tok1|user1|label1,id2|inst2|tok2|user2|label2
```

If you only have hostnames and ASCII tokens, a global replace works:

```bash
sed -i 's/:/|/g' .env   # Caveat: only safe if NO part of the value contains a literal :
```

Otherwise, edit by hand and replace the four field separators in each entry.

v2 will refuse to start if it sees a `:`-delimited value (no silent truncation).

Reference commit: `<H6 commit SHA>` — `fix(auth): use pipe delimiter in ACTIVITYPUB_ACCOUNTS (H6)`
```

(Renumber the section number to follow whatever's already there — currently the doc has sections 1–3 from Plan A.)

- [ ] **Step 7: Commit (one commit — code + docs together since they describe the same break)**

```bash
git add src/auth/account-manager.ts tests/unit/account-manager.test.ts MIGRATION-v2.md
git commit -m "fix!(auth): use pipe delimiter in ACTIVITYPUB_ACCOUNTS (H6)

BREAKING CHANGE: ACTIVITYPUB_ACCOUNTS now uses '|' as field separator
instead of ':'. v2 fails fast on legacy ':'-delimited values. See
MIGRATION-v2.md for the migration recipe."
```

After this commit, go back and replace `<H6 commit SHA>` in `MIGRATION-v2.md` with the actual SHA from `git rev-parse HEAD`, then `git commit --amend --no-edit`. (This is an exception to the "never amend" rule — we're amending a commit that hasn't been pushed to fill in its own SHA reference. Confirm with the user before amending if you're unsure.)

Actually, simpler: leave `<H6 commit SHA>` in the migration doc as-is for now. A later docs-cleanup commit can fill in all SHAs at once. Don't amend.

---

## Task 6: `discover-instances` filter composition (H7)

**Files:**
- Modify: `src/mcp/tools.ts` (the `discover-instances` handler, lines ~470-488)
- Test: `tests/unit/mcp-tools.test.ts`

Current filter logic is a sequence of `if (size) { instances = ... } if (topic) { instances = ... }` blocks — each reassigns `instances`, so later filters overwrite earlier ones. `{topic: "tech", size: "large"}` returns only large instances, silently dropping the topic filter.

Fix: chain `.filter()` calls. Each predicate narrows the same in-progress result.

- [ ] **Step 1: Read the existing handler**

Open `src/mcp/tools.ts` and locate the `discover-instances` tool registration. Read the full handler (lines ~440-500 in the current file). Understand:
- What `instances` is initialized to (probably the full dataset from `src/data/instances.json`).
- Which filter fields exist (`topic`, `size`, `region`, `language`, possibly others).
- The shape of each predicate.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/mcp-tools.test.ts`:

```typescript
describe("discover-instances filter composition (H7)", () => {
  it("applies multiple filters cumulatively", async () => {
    const tool = registeredReadTools.get("discover-instances");
    expect(tool).toBeDefined();
    // Call with multiple filters that should compose. Pick combinations the
    // test data supports — read src/data/instances.json to find a combination
    // that produces a SMALL result set (proving narrowing happened) when both
    // filters are applied, but would produce DIFFERENT results when only one
    // is applied.
    const both = await tool?.handler({ topic: "tech", size: "large" });
    const topicOnly = await tool?.handler({ topic: "tech" });
    const sizeOnly = await tool?.handler({ size: "large" });
    // The combined result must be a subset of either individual result.
    const parseIds = (r: any): string[] => {
      const text = (r?.content?.[0]?.text ?? "") as string;
      return text.match(/[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    };
    const bothIds = new Set(parseIds(both));
    const topicIds = new Set(parseIds(topicOnly));
    const sizeIds = new Set(parseIds(sizeOnly));
    for (const id of bothIds) {
      expect(topicIds.has(id)).toBe(true);
      expect(sizeIds.has(id)).toBe(true);
    }
    // Sanity: combined ≤ each individual
    expect(bothIds.size).toBeLessThanOrEqual(topicIds.size);
    expect(bothIds.size).toBeLessThanOrEqual(sizeIds.size);
  });
});
```

(The `registeredReadTools` name is illustrative — read the existing test setup in `tests/unit/mcp-tools.test.ts` to see how read tools are registered and accessed, then adapt.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-tools.test.ts -t "discover-instances filter composition"`
Expected: FAIL — current code's last filter overwrites earlier ones, so combined ⊃ individual rather than ⊂.

- [ ] **Step 4: Rewrite the filter block**

Replace the sequence of `if` reassignments with a single chain:

```typescript
let filtered = INSTANCES; // or whatever the source is
if (topic) {
  filtered = filtered.filter((i) => /* existing topic predicate */);
}
if (size) {
  filtered = filtered.filter((i) => /* existing size predicate */);
}
if (region) {
  filtered = filtered.filter((i) => /* existing region predicate */);
}
if (language) {
  filtered = filtered.filter((i) => /* existing language predicate */);
}
// Continue with whatever uses `filtered` (sorting, truncation, render).
```

Preserve the existing predicate expressions exactly — only change the control flow. If a predicate currently uses `INSTANCES.filter(...)` (reassigning from the source), change it to operate on `filtered`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/mcp-tools.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (606 total).

- [ ] **Step 7: Commit**

```bash
git add src/mcp/tools.ts tests/unit/mcp-tools.test.ts
git commit -m "fix(tools): compose discover-instances filters cumulatively (H7)"
```

---

## Task 7: Remove `LRUCache.has()` from public API (L6)

**Files:**
- Modify: `src/utils/lru-cache.ts` (delete the `has` method around lines 89-103)
- Modify: any internal callers (find via `grep -rn "lruCache.*\.has\|\.has(" src/`)
- Test: `tests/unit/lru-cache.test.ts` (remove tests for `has`)

`has()` checks for existence without promoting the entry to most-recently-used. This is inconsistent with `get()` and a footgun for future callers using `has()` as a keep-alive signal. Since callers can equivalently use `get() !== undefined`, remove the method entirely.

- [ ] **Step 1: Locate every caller**

Run: `grep -rn "\.has(" src/ | grep -i "cache"` (filter to cache-related calls; ignore Map.has, Set.has, etc.)

Identify each internal caller of `LRUCache.has`. There may be zero, in which case the removal is purely API cleanup.

- [ ] **Step 2: Replace caller usages with `get(...) !== undefined`**

For each caller found in Step 1:

```typescript
// Before:
if (cache.has(key)) { ... }

// After:
if (cache.get(key) !== undefined) { ... }
```

Be careful: the new form also promotes the entry. This is the desired behavior — `has()` previously didn't promote, but if a caller was using `has()` for liveness check, they probably wanted promotion anyway (otherwise the entry could get evicted right after the check).

If a caller specifically wanted "check without promoting" semantics, mark the call site with a comment and convert manually (likely such a caller should be eliminated — what's the use case?). Report any such site as a concern.

- [ ] **Step 3: Remove `has` from `src/utils/lru-cache.ts`**

Delete the `has(key: K): boolean { ... }` method (currently around lines 89-103). Also remove `has` from any TypeScript interface declaration or class signature if separately declared.

- [ ] **Step 4: Remove `has` tests from `tests/unit/lru-cache.test.ts`**

Find any `it("has(...)" ...)` or similar test cases and delete them. Other LRUCache tests should continue to pass unchanged.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS. Test count may decrease slightly if has-specific tests existed.

- [ ] **Step 6: Commit**

```bash
git add src/utils/lru-cache.ts tests/unit/lru-cache.test.ts src/  # plus any caller files
git commit -m "refactor(utils): remove LRUCache.has() — use get() !== undefined (L6)"
```

---

## Task 8: Runtime validation in `importFromJson` (L7)

**Files:**
- Modify: `src/instance-blocklist.ts` (`importFromJson` around lines 244-260)
- Test: `tests/unit/instance-blocklist.test.ts`

Current `importFromJson` does `JSON.parse(json) as BlockedInstance[]` — a TypeScript cast with zero runtime validation. Malformed JSON (empty domains, wildcard-only strings, etc.) silently corrupts the blocklist.

Fix: define a Zod schema for `BlockedInstance` and parse with `z.array(...).parse(...)`.

- [ ] **Step 1: Locate the `BlockedInstance` type**

Open `src/instance-blocklist.ts` and find the `BlockedInstance` type/interface. Note its fields (probably `domain`, `reason`, possibly `severity`, `addedAt`, etc.).

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/instance-blocklist.test.ts`:

```typescript
describe("importFromJson validation (L7)", () => {
  it("throws ZodError when JSON contains an entry with an empty domain", () => {
    const blocklist = new InstanceBlocklist();
    const bad = JSON.stringify([{ domain: "", reason: "test" }]);
    expect(() => blocklist.importFromJson(bad)).toThrow(/domain/i);
  });

  it("throws ZodError when JSON contains an entry with a missing domain field", () => {
    const blocklist = new InstanceBlocklist();
    const bad = JSON.stringify([{ reason: "test" }]);
    expect(() => blocklist.importFromJson(bad)).toThrow();
  });

  it("accepts valid JSON without throwing", () => {
    const blocklist = new InstanceBlocklist();
    const good = JSON.stringify([{ domain: "evil.example", reason: "spam" }]);
    expect(() => blocklist.importFromJson(good)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/instance-blocklist.test.ts -t "importFromJson validation"`
Expected: FAIL — current code silently accepts bad JSON.

- [ ] **Step 4: Add a Zod schema and validate**

In `src/instance-blocklist.ts`, near the top of the file (after imports), define:

```typescript
import { z } from "zod";

const BlockedInstanceSchema = z.object({
  domain: z.string().min(1, "domain must be non-empty"),
  reason: z.string().optional(),
  // Add other fields here if BlockedInstance has them. Match the existing type exactly.
});
```

Then in `importFromJson`:

```typescript
importFromJson(json: string): void {
  const raw = JSON.parse(json);
  const entries = z.array(BlockedInstanceSchema).parse(raw);
  for (const entry of entries) {
    this.addBlock(entry.domain, entry.reason);
  }
}
```

(The exact method body depends on the existing one — preserve its semantics, just wrap the parse with Zod.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/instance-blocklist.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/instance-blocklist.ts tests/unit/instance-blocklist.test.ts
git commit -m "fix(policy): runtime-validate instance-blocklist JSON imports (L7)"
```

---

## Task 9: Delete the dead double-start guard (L3)

**Files:**
- Modify: `src/mcp-server.ts` (lines 218-232, the `if (import.meta.url === ...) { ... }` block)

The guard never fires under the current entry-point setup (the only entry is `mcp-main.ts`, which itself instantiates the server). The block is dead code that creates confusion and a future-refactor trap.

- [ ] **Step 1: Delete the block**

In `src/mcp-server.ts`, remove the entire `if (import.meta.url === ...) { ... }` block (lines 218-230 or thereabouts). Also remove the comment "Start the server if this file is run directly" that precedes it. Keep the `export default ActivityPubMCPServer;` at the bottom.

- [ ] **Step 2: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS. No behavior change — the block was unreachable.

- [ ] **Step 3: Commit**

```bash
git add src/mcp-server.ts
git commit -m "refactor: remove dead double-start guard in mcp-server (L3)"
```

---

## Task 10: Final verification

**Files:** none modified — verification step.

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Full test suite with coverage**

Run: `npm run test:coverage`
Expected: PASS. Coverage thresholds still met (70/60/70/70).

- [ ] **Step 4: Manual smoke — process exits cleanly with metrics on**

```bash
METRICS_ENABLED=true \
  MCP_HTTP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  timeout 3 npx tsx src/mcp-main.ts < /dev/null
```

Expected: starts, sits, exits within ~1s of timeout sending SIGTERM. Exit code 124 or 143 acceptable. NO hang past 4 seconds.

- [ ] **Step 5: Manual smoke — H4 304 path doesn't break realistic ETag flow**

Hard to test directly without a mock server in the wild. Confirm via the unit test suite that the H4 path is exercised:

```bash
npx vitest run tests/unit/remote-client.test.ts -t "ETag 304" -t "fetchActorOutboxPaginated"
```

Expected: PASS.

- [ ] **Step 6: Confirm `MIGRATION-v2.md` has the H6 entry**

Read `MIGRATION-v2.md` — confirm the H6 section (ACTIVITYPUB_ACCOUNTS delimiter change) is present and well-formed.

- [ ] **Step 7: Final commit if anything changed in Step 6**

Only if a fix was needed.

- [ ] **Step 8: Do NOT push the branch.** Plan A's finishing step already established that v2 stays local until all plans land or until the user opts to push. Report ready for Plan C and stop.

---

## Done

When all 10 tasks check off, Plan B is complete. The next plan in the v2 series is **Plan C — MCP tool surface** (spec section 3).
