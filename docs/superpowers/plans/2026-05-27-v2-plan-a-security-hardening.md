# v2 Plan A — Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 7 security-related findings from the v2 design spec (H1 HTTP auth, M2 streaming response cap, M3 thread cross-origin SSRF, M8 verifyAccount SSRF bypass, L2 audit wiring, L4 instance-discovery raw fetch, L5 DomainSchema IP literals) without breaking any existing functionality.

**Architecture:** Add two new modules (`src/utils/fetch-helpers.ts`, `src/server/auth-middleware.ts`) and tighten safety helpers used by existing fetch paths. Wire `auditLogger.logToolInvocation` into every write-tool handler. Use existing TDD patterns (Vitest + MSW). All file paths use the **current pre-refactor structure**; the topic-dir refactor lands in Plan E and will move these files later.

**Tech Stack:** TypeScript (ESM), Vitest, Zod, `@modelcontextprotocol/sdk`, `@logtape/logtape`, Node 20+ standard `fetch`/streams.

**Spec reference:** [docs/superpowers/specs/2026-05-27-v2-release-design.md §2](../specs/2026-05-27-v2-release-design.md)

---

## Pre-flight (one-time, do before Task 1)

- Make sure you are on the `v2` branch. If it doesn't exist yet, create it from `master`:
  ```bash
  git fetch origin
  git checkout -b v2 origin/master
  ```
- Run the existing test suite once to establish a clean baseline:
  ```bash
  npm install
  npm test
  ```
  Expected: all tests pass on the current `master`.

---

## Task 1: Reject IP literals in `DomainSchema` (L5)

**Files:**
- Modify: `src/validation/schemas.ts`
- Test: `tests/unit/schemas.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

If `tests/unit/schemas.test.ts` doesn't exist, create it. Otherwise add the new `describe` block to the existing file:

```typescript
import { describe, expect, it } from "vitest";
import { DomainSchema } from "../../../src/validation/schemas.js";

describe("DomainSchema — IP literal rejection (L5)", () => {
  it("rejects IPv4 literal", () => {
    const result = DomainSchema.safeParse("192.168.1.1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/IP addresses are not allowed/i);
    }
  });

  it("rejects IPv4 literal (public range)", () => {
    expect(DomainSchema.safeParse("8.8.8.8").success).toBe(false);
  });

  it("rejects bracketed IPv6 literal", () => {
    expect(DomainSchema.safeParse("[::1]").success).toBe(false);
  });

  it("rejects unbracketed IPv6 literal", () => {
    expect(DomainSchema.safeParse("2001:db8::1").success).toBe(false);
  });

  it("accepts normal hostname", () => {
    expect(DomainSchema.safeParse("mastodon.social").success).toBe(true);
  });

  it("accepts hostname with numbers", () => {
    expect(DomainSchema.safeParse("9to5mac.com").success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/schemas.test.ts`
Expected: FAIL — the IPv4 case currently passes the regex (digits + dots match the existing pattern).

- [ ] **Step 3: Add the IP-literal refinement to `DomainSchema`**

In `src/validation/schemas.ts`, append a refinement to the existing `DomainSchema` (after the existing `.refine` block):

```typescript
export const DomainSchema = z
  .string()
  .min(1, "Domain cannot be empty")
  .max(253, "Domain too long")
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    "Invalid domain format",
  )
  .refine(
    (domain) =>
      !domain.includes("..") &&
      !domain.startsWith(".") &&
      !domain.endsWith(".") &&
      domain.includes("."),
    "Invalid domain format",
  )
  .refine(
    (domain) => !/^\d{1,3}(\.\d{1,3}){3}$/.test(domain),
    "IP addresses are not allowed as domain names (got IPv4 literal)",
  )
  .refine(
    (domain) => !/[:[\]]/.test(domain),
    "IP addresses are not allowed as domain names (got IPv6 literal)",
  );
```

The IPv6 check rejects any string containing `:`, `[`, or `]` — none of which can appear in a valid DNS hostname per the existing regex above, but the explicit refinement gives a clearer error message.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/schemas.test.ts`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Run the full test suite to ensure no regressions**

Run: `npm test`
Expected: PASS — no existing test breaks.

- [ ] **Step 6: Commit**

```bash
git add src/validation/schemas.ts tests/unit/schemas.test.ts
git commit -m "fix(validation): reject IP literals in DomainSchema (L5)"
```

---

## Task 2: Streaming `readJsonWithLimit` helper (M2 — module + tests)

**Files:**
- Create: `src/utils/fetch-helpers.ts`
- Test: `tests/unit/fetch-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/fetch-helpers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ResponseTooLargeError, readJsonWithLimit } from "../../../src/utils/fetch-helpers.js";

function makeResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("readJsonWithLimit (M2)", () => {
  it("returns parsed JSON when body is under the limit", async () => {
    const payload = { hello: "world" };
    const res = makeResponse(JSON.stringify(payload));
    const out = await readJsonWithLimit<typeof payload>(res, 1024);
    expect(out).toEqual(payload);
  });

  it("throws ResponseTooLargeError when Content-Length exceeds limit", async () => {
    const body = JSON.stringify({ data: "x".repeat(200) });
    const res = makeResponse(body, { "Content-Length": String(body.length) });
    await expect(readJsonWithLimit(res, 50)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("throws ResponseTooLargeError when streamed bytes exceed limit even without Content-Length", async () => {
    // Construct a Response from a ReadableStream so Content-Length is unknown
    const big = "x".repeat(200);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const res = new Response(stream, { headers: { "Content-Type": "application/json" } });
    await expect(readJsonWithLimit(res, 50)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("propagates JSON parse errors", async () => {
    const res = makeResponse("not valid json");
    await expect(readJsonWithLimit(res, 1024)).rejects.toThrow(/JSON/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (module doesn't exist)**

Run: `npx vitest run tests/unit/fetch-helpers.test.ts`
Expected: FAIL — `Cannot find module '../../../src/utils/fetch-helpers.js'`.

- [ ] **Step 3: Implement the helper**

Create `src/utils/fetch-helpers.ts`:

```typescript
/**
 * Streaming response readers with safety caps.
 *
 * Replaces the legacy Content-Length-only checks scattered across
 * remote-client.ts and auth/authenticated-client.ts. The streaming
 * reader aborts the body once `maxBytes` is exceeded, regardless of
 * whether the server sent an accurate Content-Length header.
 */

export class ResponseTooLargeError extends Error {
  constructor(public readonly bytesRead: number, public readonly maxBytes: number) {
    super(`Response too large: read ${bytesRead} bytes, cap ${maxBytes} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

/**
 * Read a Response body as JSON, aborting if it would exceed `maxBytes`.
 *
 * - Fast-path rejects when Content-Length is present and exceeds the cap.
 * - Otherwise streams the body and stops as soon as the running byte count
 *   passes the cap.
 */
export async function readJsonWithLimit<T = unknown>(
  response: Response,
  maxBytes: number,
): Promise<T> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new ResponseTooLargeError(declared, maxBytes);
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new ResponseTooLargeError(text.length, maxBytes);
    }
    return JSON.parse(text) as T;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel(`response exceeded ${maxBytes} bytes`);
        throw new ResponseTooLargeError(total, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(merged);
  return JSON.parse(text) as T;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/fetch-helpers.test.ts`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/fetch-helpers.ts tests/unit/fetch-helpers.test.ts
git commit -m "feat(utils): add streaming readJsonWithLimit helper (M2)"
```

---

## Task 3: Adopt `readJsonWithLimit` in `remote-client.ts` (M2 — call site 1)

**Files:**
- Modify: `src/remote-client.ts` (the `fetchWithTimeout` method and every `response.json()` call inside the client)
- Test: `tests/unit/remote-client.test.ts` (add a regression test if not already there)

- [ ] **Step 1: Locate every `response.json()` call in `src/remote-client.ts`**

Run: `grep -n "\.json()" src/remote-client.ts`
Read the surrounding context for each hit so you understand the call shape.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/remote-client.test.ts`. `MAX_RESPONSE_SIZE` in `src/config.ts` is captured at module load, so we use `vi.resetModules()` + dynamic import to re-evaluate it with a tiny cap:

```typescript
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("RemoteActivityPubClient response size cap (M2)", () => {
  const originalEnv = process.env;
  afterEach(() => {
    process.env = originalEnv;
  });

  it("aborts fetch when streamed body exceeds MAX_RESPONSE_SIZE without Content-Length", async () => {
    vi.resetModules();
    process.env = { ...originalEnv, MAX_RESPONSE_SIZE: "100" };
    const { RemoteActivityPubClient } = await import("../../src/remote-client.js");
    const { ResponseTooLargeError } = await import("../../src/utils/fetch-helpers.js");
    const huge = "x".repeat(500);
    server.use(
      http.get("https://example.test/actor", () =>
        new HttpResponse(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(JSON.stringify({ name: huge })));
              c.close();
            },
          }),
          { headers: { "Content-Type": "application/activity+json" } },
        ),
      ),
    );
    const client = new RemoteActivityPubClient();
    await expect(client.fetchObject("https://example.test/actor")).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/remote-client.test.ts`
Expected: FAIL — current code only checks Content-Length and reads the whole body.

- [ ] **Step 4: Replace `response.json()` calls with `readJsonWithLimit`**

In `src/remote-client.ts`:

1. Add the import at the top:
   ```typescript
   import { readJsonWithLimit } from "./utils/fetch-helpers.js";
   ```
2. In `fetchWithTimeout` (around line 693), **remove** the legacy Content-Length check (lines 714–719). Leave the rest of the method unchanged; the new helper handles size at the JSON-read step instead.
3. For every `await response.json()` call inside the client, replace with:
   ```typescript
   const data = await readJsonWithLimit<TypeNameHere>(response, MAX_RESPONSE_SIZE);
   ```
   Use the same type argument the caller previously expected. `MAX_RESPONSE_SIZE` is already imported from `./config.js`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/remote-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — every existing remote-client test still green.

- [ ] **Step 7: Commit**

```bash
git add src/remote-client.ts tests/unit/remote-client.test.ts
git commit -m "fix(remote-client): enforce response size cap via streaming reader (M2)"
```

---

## Task 4: Adopt `readJsonWithLimit` in `auth/authenticated-client.ts` (M2 — call site 2)

**Files:**
- Modify: `src/auth/authenticated-client.ts`
- Test: `tests/unit/authenticated-client.test.ts` (add regression test if not present)

- [ ] **Step 1: Locate every `response.json()` call and the existing Content-Length check (lines ~212–215)**

Run: `grep -n "\.json()\|content-length" src/auth/authenticated-client.ts`

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/authenticated-client.test.ts`. Use `createPost` (the simplest write call) and POST to an MSW handler that returns an oversize body. Same `vi.resetModules()` pattern as Task 3:

```typescript
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AuthenticatedClient response size cap (M2)", () => {
  const originalEnv = process.env;
  afterEach(() => { process.env = originalEnv; });

  it("aborts createPost when remote body exceeds MAX_RESPONSE_SIZE without Content-Length", async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      MAX_RESPONSE_SIZE: "100",
      ACTIVITYPUB_DEFAULT_INSTANCE: "example.test",
      ACTIVITYPUB_DEFAULT_TOKEN: "tok",
    };
    const { AuthenticatedClient } = await import("../../src/auth/authenticated-client.js");
    const { ResponseTooLargeError } = await import("../../src/utils/fetch-helpers.js");

    server.use(
      http.post("https://example.test/api/v1/statuses", () =>
        new HttpResponse(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(JSON.stringify({ id: "x".repeat(500) })));
              c.close();
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const client = new AuthenticatedClient();
    await expect(client.createPost({ content: "hi", visibility: "public" })).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/authenticated-client.test.ts`
Expected: FAIL — body is read in full despite exceeding cap.

- [ ] **Step 4: Apply the same swap as Task 3**

In `src/auth/authenticated-client.ts`:
1. Import `readJsonWithLimit` from `../utils/fetch-helpers.js`.
2. Remove the Content-Length check at lines 212–215.
3. Replace every `await response.json()` with `await readJsonWithLimit<T>(response, MAX_RESPONSE_SIZE)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/authenticated-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/auth/authenticated-client.ts tests/unit/authenticated-client.test.ts
git commit -m "fix(auth): enforce response size cap via streaming reader (M2)"
```

---

## Task 5: `verifyAccount` routes through `fetchWithTimeout` + `validateExternalUrl` (M8)

**Files:**
- Modify: `src/auth/account-manager.ts` (the `verifyAccount` method around lines 262–295)
- Test: `tests/unit/account-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/account-manager.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { accountManager } from "../../../src/auth/account-manager.js";

describe("verifyAccount SSRF protection (M8)", () => {
  it("refuses to send credentials to a private-network instance", async () => {
    accountManager.addAccount({
      id: "internal",
      instance: "10.0.0.1",   // private range
      accessToken: "tok",
      tokenType: "Bearer",
    });
    const result = await accountManager.verifyAccount("internal");
    expect(result).toBeNull(); // or: await expect(...).rejects.toThrow(/private|SSRF/i)
  });

  it("refuses to send credentials to localhost", async () => {
    accountManager.addAccount({
      id: "local",
      instance: "localhost",
      accessToken: "tok",
      tokenType: "Bearer",
    });
    const result = await accountManager.verifyAccount("local");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/account-manager.test.ts`
Expected: FAIL — current `verifyAccount` uses raw `fetch()` and would attempt the request.

- [ ] **Step 3: Refactor `verifyAccount`**

In `src/auth/account-manager.ts`, replace the `verifyAccount` method body. Import `validateExternalUrl` from `../utils.js` and `REQUEST_TIMEOUT` from `../config.js`. New body:

```typescript
async verifyAccount(accountId: string): Promise<AccountInfo | null> {
  const account = this.accounts.get(accountId);
  if (!account) {
    logger.warn("Cannot verify account - not found", { id: accountId });
    return null;
  }

  const url = `https://${account.instance}/api/v1/accounts/verify_credentials`;

  try {
    await validateExternalUrl(url);
  } catch (error) {
    logger.error("Account verification refused (URL validation failed)", {
      id: accountId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `${account.tokenType} ${account.accessToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("Account verification failed", { id: accountId, status: response.status });
      return null;
    }

    const data = await readJsonWithLimit<unknown>(response, MAX_RESPONSE_SIZE);
    return AccountInfoSchema.parse(data);
  } catch (error) {
    logger.error("Account verification error", { id: accountId, error });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Add the imports at the top:
```typescript
import { MAX_RESPONSE_SIZE, REQUEST_TIMEOUT } from "../config.js";
import { validateExternalUrl } from "../utils.js";
import { readJsonWithLimit } from "../utils/fetch-helpers.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/account-manager.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/account-manager.ts tests/unit/account-manager.test.ts
git commit -m "fix(auth): route verifyAccount through SSRF + timeout helpers (M8)"
```

---

## Task 6: `instance-discovery` raw fetch → validated helpers (L4)

**Files:**
- Modify: `src/instance-discovery.ts` (methods `checkInstanceHealth` at line ~168 and `getInstanceStats` at line ~205)
- Test: `tests/unit/instance-discovery.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/instance-discovery.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { InstanceDiscoveryService } from "../../src/instance-discovery.js";

describe("InstanceDiscoveryService SSRF defence (L4)", () => {
  const service = new InstanceDiscoveryService();

  it("checkInstanceHealth refuses private IP", async () => {
    const r = await service.checkInstanceHealth("10.0.0.1");
    expect(r.online).toBe(false);
    expect(r.error).toMatch(/IP|private|invalid/i);
  });

  it("checkInstanceHealth refuses localhost", async () => {
    const r = await service.checkInstanceHealth("localhost");
    expect(r.online).toBe(false);
  });

  it("getInstanceStats refuses link-local address", async () => {
    const r = await service.getInstanceStats("169.254.169.254");
    expect(r.online).toBe(false);
  });

  it("getInstanceStats refuses single-label domain", async () => {
    const r = await service.getInstanceStats("not-a-domain");
    expect(r.online).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/instance-discovery.test.ts`
Expected: FAIL — current methods attempt the fetch (which will throw an unrelated network error rather than an SSRF rejection, depending on environment).

- [ ] **Step 3: Refactor both methods**

In `src/instance-discovery.ts`, add imports:
```typescript
import { DomainSchema } from "./validation/schemas.js";
import { validateExternalUrl } from "./utils.js";
```

Wrap each method body with validation. New `checkInstanceHealth`:

```typescript
async checkInstanceHealth(domain: string): Promise<{
  online: boolean;
  responseTime?: number;
  software?: string;
  version?: string;
  error?: string;
}> {
  const validDomain = DomainSchema.safeParse(domain);
  if (!validDomain.success) {
    return { online: false, error: validDomain.error.issues[0]?.message ?? "Invalid domain" };
  }
  const url = `https://${validDomain.data}/api/v1/instance`;
  try {
    await validateExternalUrl(url);
  } catch (error) {
    return { online: false, error: error instanceof Error ? error.message : String(error) };
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeoutId);
    return { online: response.ok, responseTime: Date.now() - startTime };
  } catch (error) {
    return { online: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
```

Apply the analogous treatment to `getInstanceStats` — domain-validate, `validateExternalUrl` the URL, then proceed with the existing body.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/instance-discovery.test.ts`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/instance-discovery.ts tests/unit/instance-discovery.test.ts
git commit -m "fix(discovery): route instance-discovery raw fetches through SSRF guard (L4)"
```

---

## Task 7: Thread cross-origin + recursion cap config (M3, part 1)

**Files:**
- Modify: `src/config.ts`
- Test: `tests/unit/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("Thread traversal config (M3)", () => {
  it("MCP_THREAD_MAX_DEPTH defaults to 5", async () => {
    delete process.env.MCP_THREAD_MAX_DEPTH;
    const mod = await import(`../../src/config.js?cachebust=${Date.now()}`);
    expect(mod.THREAD_MAX_DEPTH).toBe(5);
  });

  it("MCP_THREAD_MAX_REPLIES defaults to 50", async () => {
    delete process.env.MCP_THREAD_MAX_REPLIES;
    const mod = await import(`../../src/config.js?cachebust=${Date.now()}`);
    expect(mod.THREAD_MAX_REPLIES).toBe(50);
  });

  it("MCP_THREAD_CROSS_ORIGIN_FETCH defaults to false", async () => {
    delete process.env.MCP_THREAD_CROSS_ORIGIN_FETCH;
    const mod = await import(`../../src/config.js?cachebust=${Date.now()}`);
    expect(mod.THREAD_CROSS_ORIGIN_FETCH).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: FAIL — constants are undefined.

- [ ] **Step 3: Add the three constants to `src/config.ts`**

After the existing "Performance Monitoring Configuration" section (around line 140), add a new section:

```typescript
// =============================================================================
// Thread Traversal Configuration (M3)
// =============================================================================

/** Maximum recursion depth when fetching a post thread (default: 5) */
export const THREAD_MAX_DEPTH = parseIntEnv(process.env.MCP_THREAD_MAX_DEPTH, 5);

/** Maximum total replies fetched per thread, across all depths (default: 50) */
export const THREAD_MAX_REPLIES = parseIntEnv(process.env.MCP_THREAD_MAX_REPLIES, 50);

/**
 * Whether to follow replies whose origin differs from the root post.
 * Default: false — replies from other origins are returned as stubs.
 * Set to true to restore v1 unrestricted fan-out behavior.
 */
export const THREAD_CROSS_ORIGIN_FETCH = parseBoolEnv(
  process.env.MCP_THREAD_CROSS_ORIGIN_FETCH,
  false,
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts
git commit -m "feat(config): add THREAD_MAX_DEPTH / MAX_REPLIES / CROSS_ORIGIN_FETCH (M3)"
```

---

## Task 8: Apply thread caps and cross-origin gate in `fetchPostThread` (M3, part 2)

**Files:**
- Modify: `src/remote-client.ts` (the `fetchPostThread` method around line 847)
- Test: `tests/unit/remote-client-thread.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/remote-client-thread.test.ts`:

```typescript
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { RemoteActivityPubClient } from "../../src/remote-client.js";

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchPostThread cross-origin guard (M3)", () => {
  it("returns reply from same origin as a full object", async () => {
    process.env.MCP_THREAD_CROSS_ORIGIN_FETCH = "false";
    server.use(
      http.get("https://a.test/post/1", () =>
        HttpResponse.json({
          id: "https://a.test/post/1",
          type: "Note",
          replies: "https://a.test/post/1/replies",
        }),
      ),
      http.get("https://a.test/post/1/replies", () =>
        HttpResponse.json({
          type: "Collection",
          orderedItems: ["https://a.test/post/2"],
        }),
      ),
      http.get("https://a.test/post/2", () =>
        HttpResponse.json({ id: "https://a.test/post/2", type: "Note", content: "hi" }),
      ),
    );
    const client = new RemoteActivityPubClient();
    const thread = await client.fetchPostThread("https://a.test/post/1", { depth: 2, maxReplies: 10 });
    expect(thread.replies.some((r) => r.id === "https://a.test/post/2")).toBe(true);
  });

  it("returns cross-origin reply as a stub (not fetched) when gate is off", async () => {
    process.env.MCP_THREAD_CROSS_ORIGIN_FETCH = "false";
    server.use(
      http.get("https://a.test/post/1", () =>
        HttpResponse.json({
          id: "https://a.test/post/1",
          type: "Note",
          replies: "https://a.test/post/1/replies",
        }),
      ),
      http.get("https://a.test/post/1/replies", () =>
        HttpResponse.json({
          type: "Collection",
          orderedItems: ["https://b.test/post/9"],
        }),
      ),
      // Note: NO handler for https://b.test — if the test fetches it, MSW will throw
    );
    const client = new RemoteActivityPubClient();
    const thread = await client.fetchPostThread("https://a.test/post/1", { depth: 2, maxReplies: 10 });
    const stub = thread.replies.find((r) => r.id === "https://b.test/post/9");
    expect(stub).toBeDefined();
    expect((stub as { fetched?: boolean }).fetched).toBe(false);
  });

  it("caps total replies to THREAD_MAX_REPLIES", async () => {
    process.env.MCP_THREAD_MAX_REPLIES = "3";
    const ids = Array.from({ length: 10 }, (_, i) => `https://a.test/post/r${i}`);
    server.use(
      http.get("https://a.test/post/1", () =>
        HttpResponse.json({
          id: "https://a.test/post/1",
          type: "Note",
          replies: "https://a.test/post/1/replies",
        }),
      ),
      http.get("https://a.test/post/1/replies", () =>
        HttpResponse.json({ type: "Collection", orderedItems: ids }),
      ),
      ...ids.map((id) =>
        http.get(id, () => HttpResponse.json({ id, type: "Note", content: "x" })),
      ),
    );
    const client = new RemoteActivityPubClient();
    const thread = await client.fetchPostThread("https://a.test/post/1", { depth: 1, maxReplies: 100 });
    expect(thread.replies.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/remote-client-thread.test.ts`
Expected: FAIL — current code fetches everything regardless of origin and ignores the new caps.

- [ ] **Step 3: Implement the gating logic in `fetchPostThread`**

In `src/remote-client.ts`:

1. Add imports:
   ```typescript
   import {
     THREAD_CROSS_ORIGIN_FETCH,
     THREAD_MAX_DEPTH,
     THREAD_MAX_REPLIES,
   } from "./config.js";
   ```

2. Inside `fetchPostThread`, clamp the incoming depth/maxReplies to the configured caps at the very top:
   ```typescript
   const effectiveDepth = Math.min(depth, THREAD_MAX_DEPTH);
   const effectiveMaxReplies = Math.min(maxReplies, THREAD_MAX_REPLIES);
   ```
   Use `effectiveDepth` and `effectiveMaxReplies` throughout the method instead of the raw parameters.

3. Compute the root origin once:
   ```typescript
   const rootOrigin = new URL(postUrl).origin;
   ```

4. Replace the loop that fetches each reply object with the origin-gated version. For each `item`:
   - If `item` is a string URL whose origin matches `rootOrigin`, fetch it as before.
   - If the origin differs and `THREAD_CROSS_ORIGIN_FETCH === true`, fetch it as before.
   - Otherwise, push a stub `{ id: item, type: "Note", crossOrigin: true, fetched: false }` (use a type compatible with `ActivityPubObject`).

5. Apply the same gate inside the nested-replies loop, and stop adding replies once `replies.length >= effectiveMaxReplies`.

Code sketch for the inner loop:

```typescript
for (const item of items.slice(0, effectiveMaxReplies)) {
  if (replies.length >= effectiveMaxReplies) break;

  const itemUrl = typeof item === "string" ? item : (item as ActivityPubObject)?.id;
  if (!itemUrl) continue;

  let sameOrigin = false;
  try {
    sameOrigin = new URL(itemUrl).origin === rootOrigin;
  } catch {
    continue; // skip unparseable
  }

  if (!sameOrigin && !THREAD_CROSS_ORIGIN_FETCH) {
    replies.push({
      id: itemUrl,
      type: "Note",
      crossOrigin: true,
      fetched: false,
    } as unknown as ActivityPubObject);
    continue;
  }

  try {
    if (typeof item === "string") {
      const reply = await this.fetchObject(itemUrl);
      replies.push(reply);
    } else if (item && typeof item === "object") {
      replies.push(item as ActivityPubObject);
    }
  } catch {
    // skip replies we can't fetch
  }
}
```

Apply the same `sameOrigin` test before the recursive `this.fetchPostThread(reply.id, …)` call inside the depth-recursion block (around line 924). If origin differs and the gate is off, skip the recursion.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/remote-client-thread.test.ts`
Expected: PASS — all 3 cases green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — existing thread tests still green (cross-origin replies that used to be fetched now appear as stubs; if a prior test asserted full fetch behavior, update it to set `MCP_THREAD_CROSS_ORIGIN_FETCH=true` for that test only).

- [ ] **Step 6: Commit**

```bash
git add src/remote-client.ts tests/unit/remote-client-thread.test.ts
git commit -m "fix(remote-client): gate cross-origin thread fetch and cap depth/replies (M3)"
```

---

## Task 9: HTTP transport auth — config + middleware module (H1, part 1)

**Files:**
- Modify: `src/config.ts`
- Create: `src/server/auth-middleware.ts`
- Test: `tests/unit/auth-middleware.test.ts`

- [ ] **Step 1: Write the failing tests for the middleware**

Create `tests/unit/auth-middleware.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { checkBearerAuth } from "../../../src/server/auth-middleware.js";

function makeReq(headers: Record<string, string>): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  Object.assign(req.headers, headers);
  return req;
}
function makeRes(): ServerResponse & { _status?: number; _body?: string } {
  const req = new IncomingMessage(new Socket());
  const res = new ServerResponse(req) as ServerResponse & { _status?: number; _body?: string };
  const writeHead = res.writeHead.bind(res);
  res.writeHead = (status: number, ...rest: any[]) => {
    res._status = status;
    return writeHead(status, ...rest as []);
  };
  const end = res.end.bind(res);
  res.end = (chunk?: any, ...rest: any[]) => {
    if (typeof chunk === "string") res._body = chunk;
    return end(chunk, ...rest as []);
  };
  return res;
}

describe("checkBearerAuth (H1)", () => {
  it("returns true when Authorization header matches secret", () => {
    const req = makeReq({ authorization: "Bearer s3cret" });
    const res = makeRes();
    expect(checkBearerAuth(req, res, "s3cret")).toBe(true);
    expect(res._status).toBeUndefined();
  });

  it("returns false and writes 401 when header is missing", () => {
    const req = makeReq({});
    const res = makeRes();
    expect(checkBearerAuth(req, res, "s3cret")).toBe(false);
    expect(res._status).toBe(401);
    expect(res.getHeader("WWW-Authenticate")).toBe("Bearer");
  });

  it("returns false and writes 401 when secret mismatches", () => {
    const req = makeReq({ authorization: "Bearer wrong" });
    const res = makeRes();
    expect(checkBearerAuth(req, res, "s3cret")).toBe(false);
    expect(res._status).toBe(401);
  });

  it("uses constant-time comparison (does not short-circuit on length)", () => {
    // Smoke check — we cannot directly measure timing, but ensure the function
    // still returns false for different-length tokens without throwing.
    const req = makeReq({ authorization: "Bearer s" });
    const res = makeRes();
    expect(checkBearerAuth(req, res, "s3cret")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (module doesn't exist)**

Run: `npx vitest run tests/unit/auth-middleware.test.ts`
Expected: FAIL — `Cannot find module ../../../src/server/auth-middleware.js`.

- [ ] **Step 3: Add `MCP_HTTP_SECRET` to config**

In `src/config.ts`, after the existing `HTTP_CORS_ORIGINS` line (around line 159), add:

```typescript
/**
 * Shared secret required as Bearer token for HTTP transport requests.
 * If unset, HTTP transport refuses to start (see http-transport.ts).
 * stdio transport ignores this value.
 */
export const HTTP_SECRET = process.env.MCP_HTTP_SECRET || "";
```

- [ ] **Step 4: Implement the middleware**

Create `src/server/auth-middleware.ts`:

```typescript
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Constant-time string comparison.
 * Returns false (without throwing) when lengths differ.
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // timingSafeEqual throws on length mismatch; compare against a same-length
    // padding buffer to keep timing roughly constant, then return false.
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Check the `Authorization: Bearer <secret>` header against the configured
 * secret. Returns true on match; on miss, writes a 401 + WWW-Authenticate
 * response and returns false. The caller MUST stop processing if false.
 */
export function checkBearerAuth(
  req: IncomingMessage,
  res: ServerResponse,
  secret: string,
): boolean {
  const header = req.headers.authorization;
  const provided = header && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  if (provided && safeEqual(provided, secret)) {
    return true;
  }

  res.setHeader("WWW-Authenticate", "Bearer");
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth-middleware.test.ts`
Expected: PASS — all 4 cases green.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/server/auth-middleware.ts tests/unit/auth-middleware.test.ts
git commit -m "feat(server): add Bearer auth middleware + MCP_HTTP_SECRET config (H1)"
```

---

## Task 10: Wire auth middleware into HTTP transport, hard-fail without secret (H1, part 2)

**Files:**
- Modify: `src/server/http-transport.ts`
- Test: `tests/unit/http-transport.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/http-transport.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpTransportServer } from "../../../src/server/http-transport.js";

describe("HttpTransportServer auth (H1)", () => {
  beforeEach(() => {
    delete process.env.MCP_HTTP_SECRET;
  });
  afterEach(async () => {
    delete process.env.MCP_HTTP_SECRET;
  });

  it("refuses to start without MCP_HTTP_SECRET", async () => {
    const t = new HttpTransportServer({ port: 0 });
    await expect(t.start()).rejects.toThrow(/MCP_HTTP_SECRET/);
  });

  it("starts when MCP_HTTP_SECRET is set", async () => {
    process.env.MCP_HTTP_SECRET = "x".repeat(32);
    const t = new HttpTransportServer({ port: 0 });
    await t.start();
    await t.stop();
  });

  it("/mcp returns 401 without Authorization", async () => {
    process.env.MCP_HTTP_SECRET = "x".repeat(32);
    const t = new HttpTransportServer({ port: 0 });
    await t.start();
    const address = t.getAddress();
    if (!address) throw new Error("no address");
    const res = await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: "POST" });
    expect(res.status).toBe(401);
    await t.stop();
  });

  it("/health is reachable without auth", async () => {
    process.env.MCP_HTTP_SECRET = "x".repeat(32);
    const t = new HttpTransportServer({ port: 0 });
    await t.start();
    const address = t.getAddress();
    if (!address) throw new Error("no address");
    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect([200, 503]).toContain(res.status); // health-check may legitimately fail
    await t.stop();
  });
});
```


- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/http-transport.test.ts`
Expected: FAIL — `start()` currently succeeds without a secret and `/mcp` doesn't return 401.

- [ ] **Step 3: Modify `http-transport.ts`**

In `src/server/http-transport.ts`:

1. Import the middleware and secret:
   ```typescript
   import { HTTP_SECRET } from "../config.js";
   import { checkBearerAuth } from "./auth-middleware.js";
   ```

2. At the top of `start()` (line ~135), add a hard-fail guard:
   ```typescript
   async start(): Promise<Transport> {
     if (!HTTP_SECRET || HTTP_SECRET.length < 16) {
       throw new Error(
         "MCP_HTTP_SECRET is required for HTTP transport. Set it to a random " +
         "string of at least 16 characters (32+ recommended).",
       );
     }
     return new Promise((resolve, reject) => { /* existing body */ });
   }
   ```

3. Inside the request handler, after CORS and OPTIONS but before route dispatch, gate `/metrics` and `/mcp` with the middleware:
   ```typescript
   if (pathname === "/metrics" || pathname === "/metrics/") {
     if (!checkBearerAuth(req, res, HTTP_SECRET)) return;
     this.handleMetrics(res);
     return;
   }

   if (pathname === "/mcp" || pathname === "/mcp/") {
     if (!checkBearerAuth(req, res, HTTP_SECRET)) return;
     try {
       /* existing transport.handleRequest body unchanged */
     } catch (error) { /* unchanged */ }
     return;
   }
   ```
   Leave `/health` and `/` unauthenticated.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/http-transport.test.ts`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. (If any existing http-transport test fails because it expected a start without a secret, update those tests to set `MCP_HTTP_SECRET` in `beforeEach`.)

- [ ] **Step 6: Commit**

```bash
git add src/server/http-transport.ts tests/unit/http-transport.test.ts
git commit -m "feat!(server): require Bearer auth on /mcp and /metrics (H1)

BREAKING CHANGE: HTTP transport now requires MCP_HTTP_SECRET to start.
Send Authorization: Bearer <secret> on /mcp and /metrics requests."
```

---

## Task 11: CORS default change + warning (H1, part 3)

**Files:**
- Modify: `src/config.ts`
- Modify: `src/server/http-transport.ts`
- Test: extend `tests/unit/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/config.test.ts`:

```typescript
describe("CORS defaults (H1)", () => {
  it("HTTP_CORS_ORIGINS defaults to empty string (no origins)", async () => {
    delete process.env.MCP_HTTP_CORS_ORIGINS;
    const mod = await import(`../../src/config.js?cachebust=${Date.now()}`);
    expect(mod.HTTP_CORS_ORIGINS).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: FAIL — current default is `"*"`.

- [ ] **Step 3: Change the default**

In `src/config.ts` at line 159:

```typescript
/**
 * CORS allowed origins (comma-separated). Default: empty (no cross-origin
 * requests allowed). Set explicitly to a list of origins or "*" to enable.
 * Setting "*" logs a startup warning since auth is the only thing keeping
 * arbitrary web pages from talking to the local server.
 */
export const HTTP_CORS_ORIGINS = process.env.MCP_HTTP_CORS_ORIGINS ?? "";
```

In `src/server/http-transport.ts`, inside `start()` (after the secret check, before creating the server), add the warning:

```typescript
if (this.corsEnabled && this.corsOrigins.includes("*")) {
  logger.warn(
    "CORS is enabled with wildcard origin '*'. Auth still protects /mcp " +
    "and /metrics, but explicit origins are strongly recommended.",
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/server/http-transport.ts tests/unit/config.test.ts
git commit -m "feat!(config): default MCP_HTTP_CORS_ORIGINS to empty (H1)

BREAKING CHANGE: HTTP_CORS_ORIGINS no longer defaults to '*'. Set it
explicitly if CORS is required."
```

---

## Task 12: Wire `auditLogger` into `post-status` write tool (L2, exemplar)

**Files:**
- Modify: `src/mcp/tools-write.ts` (the `registerPostStatusTool` function around line 308)
- Test: extend `tests/unit/mcp-tools-write.test.ts` (it already mocks `accountManager` and `authenticatedClient` and captures registered tools into a `registeredTools` map)

- [ ] **Step 1: Add an audit-logger mock to the top of the test file**

In `tests/unit/mcp-tools-write.test.ts`, add this `vi.mock` block alongside the existing ones (near the top of the file):

```typescript
const auditLoggerMock = {
  logToolInvocation: vi.fn(),
};
vi.mock("../../src/audit-logger.js", () => ({
  auditLogger: auditLoggerMock,
}));
```

- [ ] **Step 2: Append the failing tests**

Append a new `describe` block at the bottom of the file. This reuses the existing `registeredTools` map and mocked dependencies — no new harness is needed:

```typescript
describe("post-status audit logging (L2)", () => {
  beforeEach(() => {
    auditLoggerMock.logToolInvocation.mockClear();
  });

  it("calls auditLogger.logToolInvocation on success", async () => {
    const tool = registeredTools.get("post-status");
    expect(tool).toBeDefined();
    const result = await tool?.handler({ content: "hi" });
    expect(result?.isError).toBeFalsy();
    expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
      "post-status",
      expect.objectContaining({ content: "hi" }),
      expect.objectContaining({ success: true }),
    );
  });

  it("calls auditLogger.logToolInvocation on failure (no account)", async () => {
    // Force the "no account configured" branch
    const { accountManager } = await import("../../src/auth/index.js");
    (accountManager.getActiveAccount as Mock).mockReturnValueOnce(undefined);
    (accountManager.getAccount as Mock).mockReturnValueOnce(undefined);

    const tool = registeredTools.get("post-status");
    const result = await tool?.handler({ content: "hi" });
    expect(result?.isError).toBe(true);
    expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
      "post-status",
      expect.objectContaining({ content: "hi" }),
      expect.objectContaining({ success: false }),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts`
Expected: FAIL — the handler does not call `auditLogger`.

- [ ] **Step 4: Add audit calls to the post-status handler**

In `src/mcp/tools-write.ts`:

1. Add the import (if not already):
   ```typescript
   import { auditLogger } from "../audit-logger.js";
   ```

2. In `registerPostStatusTool`'s async handler, wrap the existing body. Capture start time, then call `auditLogger.logToolInvocation` on both success and failure paths:

   ```typescript
   async ({ content, visibility = "public", spoilerText, sensitive, language, accountId }) => {
     requireWriteEnabled();
     const startTime = Date.now();
     const auditParams = { content, visibility, spoilerText, sensitive, language, accountId };

     const account = accountId
       ? accountManager.getAccount(accountId)
       : accountManager.getActiveAccount();

     if (!account) {
       auditLogger.logToolInvocation("post-status", auditParams, {
         success: false,
         duration: Date.now() - startTime,
         error: "No account configured",
       });
       return {
         content: [{ type: "text", text: "❌ No account configured for posting." }],
         isError: true,
       };
     }

     checkRateLimit(rateLimiter, account.instance);

     const requestId = performanceMonitor.startRequest("post-status", {
       instance: account.instance,
       visibility,
     });

     try {
       logger.info("Creating post", { instance: account.instance, visibility });
       const status = await authenticatedClient.createPost(
         { content, visibility, spoilerText, sensitive, language },
         accountId,
       );
       performanceMonitor.endRequest(requestId, true);
       auditLogger.logToolInvocation("post-status", auditParams, {
         success: true,
         duration: Date.now() - startTime,
       });
       return /* existing success-shaped return — unchanged */;
     } catch (error) {
       performanceMonitor.endRequest(requestId, false);
       const message = error instanceof Error ? error.message : String(error);
       auditLogger.logToolInvocation("post-status", auditParams, {
         success: false,
         duration: Date.now() - startTime,
         error: message,
       });
       /* existing catch body — unchanged */
     }
   }
   ```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/mcp/tools-write.ts tests/unit/mcp-tools-write.test.ts
git commit -m "feat(audit): wire auditLogger into post-status handler (L2)"
```

---

## Task 13: Wire `auditLogger` into the remaining write tools (L2, repeat)

**Files:**
- Modify: `src/mcp/tools-write.ts` — every other write tool registration function
- Test: extend `tests/unit/mcp-tools-write.test.ts`

The tools registered in `src/mcp/tools-write.ts` that need the same treatment (real names, verified from the file):

- `switch-account`, `verify-account`
- `reply-to-post`, `delete-post`
- `boost-post` / `unboost-post`
- `favourite-post` / `unfavourite-post`
- `bookmark-post` / `unbookmark-post`
- `follow-account` / `unfollow-account`
- `mute-account` / `unmute-account`
- `block-account` / `unblock-account`
- `get-home-timeline`, `get-notifications`, `get-bookmarks`, `get-favourites`
- `get-relationship`
- `vote-on-poll`
- `upload-media`
- `get-scheduled-posts`, `cancel-scheduled-post`, `update-scheduled-post`

(`list-accounts` and `post-status` are already done — `list-accounts` is pure local listing with no remote effect; `post-status` was Task 12.)

Recommended grouping into 3 commits to keep diffs reviewable:
- **Group 1:** post manipulation — `reply-to-post`, `delete-post`, `boost-post`, `unboost-post`, `favourite-post`, `unfavourite-post`, `bookmark-post`, `unbookmark-post`
- **Group 2:** account relationships — `switch-account`, `verify-account`, `follow-account`, `unfollow-account`, `mute-account`, `unmute-account`, `block-account`, `unblock-account`, `get-relationship`
- **Group 3:** media, polls, timeline, scheduled — `upload-media`, `vote-on-poll`, `get-home-timeline`, `get-notifications`, `get-bookmarks`, `get-favourites`, `get-scheduled-posts`, `cancel-scheduled-post`, `update-scheduled-post`

For **each group**, repeat the same 6 steps:

- [ ] **Step 1: Append failing tests for every tool in the group**

For each tool name in the group, append a test block to `tests/unit/mcp-tools-write.test.ts` modeled on Task 12's success test. Concrete template — replace `<TOOL_NAME>` and `<MINIMAL_VALID_ARGS>` per tool:

```typescript
it("<TOOL_NAME>: calls auditLogger.logToolInvocation on success", async () => {
  auditLoggerMock.logToolInvocation.mockClear();
  const tool = registeredTools.get("<TOOL_NAME>");
  expect(tool).toBeDefined();
  await tool?.handler(<MINIMAL_VALID_ARGS>);
  expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
    "<TOOL_NAME>",
    expect.anything(),
    expect.objectContaining({ success: true }),
  );
});
```

Minimal valid args per tool (use existing mock return shapes already in the file):

| Tool | `<MINIMAL_VALID_ARGS>` |
|---|---|
| `switch-account` | `{ accountId: "1" }` |
| `verify-account` | `{}` |
| `reply-to-post` | `{ statusId: "status-1", content: "ok" }` |
| `delete-post` | `{ statusId: "status-1" }` |
| `boost-post` | `{ statusId: "status-1" }` |
| `unboost-post` | `{ statusId: "status-1" }` |
| `favourite-post` | `{ statusId: "status-1" }` |
| `unfavourite-post` | `{ statusId: "status-1" }` |
| `bookmark-post` | `{ statusId: "status-1" }` |
| `unbookmark-post` | `{ statusId: "status-1" }` |
| `follow-account` | `{ targetAccountId: "2" }` |
| `unfollow-account` | `{ targetAccountId: "2" }` |
| `mute-account` | `{ targetAccountId: "2" }` |
| `unmute-account` | `{ targetAccountId: "2" }` |
| `block-account` | `{ targetAccountId: "2" }` |
| `unblock-account` | `{ targetAccountId: "2" }` |
| `get-relationship` | `{ acct: "u@example.social" }` |
| `vote-on-poll` | `{ pollId: "poll-1", choices: [0] }` |
| `upload-media` | `{ filePath: "/tmp/x.png" }` |
| `get-home-timeline` | `{}` |
| `get-notifications` | `{}` |
| `get-bookmarks` | `{}` |
| `get-favourites` | `{}` |
| `get-scheduled-posts` | `{}` |
| `cancel-scheduled-post` | `{ scheduledId: "scheduled-1" }` |
| `update-scheduled-post` | `{ scheduledId: "scheduled-1", scheduledAt: "2099-01-01T00:00:00Z" }` |

If a tool's existing mock isn't already set up in the file, add the matching mock entry to the existing `vi.mock("../../src/auth/index.js", …)` block — model the new entry on the nearby `createPost` / `boostPost` mock that returns a sensible fixture.

- [ ] **Step 2: Run tests to confirm they all fail**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts`
Expected: FAIL — every new test fails because no handler in the group calls `auditLogger`.

- [ ] **Step 3: Apply the wiring pattern to each handler in the group**

In `src/mcp/tools-write.ts`, for every tool in the group, wrap its handler with audit calls. **Verbatim pattern** — copy and substitute `<TOOL_NAME>` and the relevant input field list per tool:

```typescript
async (args) => {
  requireWriteEnabled(); // keep if the existing handler has it
  const startTime = Date.now();
  const auditParams = { ...args }; // or list specific fields you want recorded

  // ... any early-return failure branches: call auditLogger.logToolInvocation
  //     with success:false, duration:Date.now()-startTime, error:"<reason>"
  //     BEFORE the `return` statement.

  try {
    // existing happy-path body
    auditLogger.logToolInvocation("<TOOL_NAME>", auditParams, {
      success: true,
      duration: Date.now() - startTime,
    });
    return /* existing return */;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditLogger.logToolInvocation("<TOOL_NAME>", auditParams, {
      success: false,
      duration: Date.now() - startTime,
      error: message,
    });
    throw error; // or return the existing isError response if that's the existing pattern
  }
}
```

Make sure `auditLogger` is imported at the top of `tools-write.ts` (added once in Task 12, so likely already present).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit this group**

```bash
git add src/mcp/tools-write.ts tests/unit/mcp-tools-write.test.ts
git commit -m "feat(audit): wire auditLogger into <group description> (L2)"
```

(Substitute "post manipulation tools", "account relationship tools", or "media/poll/timeline tools" for `<group description>`.)

---

## Task 14: Integration smoke + lint/typecheck/coverage

**Files:** none modified — verification step.

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors. (Plan D will add `npm run typecheck` as a real script; for now invoke `tsc` directly.)

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Run full test suite with coverage**

Run: `npm run test:coverage`
Expected: PASS. Confirm the new files (`src/utils/fetch-helpers.ts`, `src/server/auth-middleware.ts`) appear in the coverage report and meet the existing thresholds (70/60/70/70 per `vitest.config.ts`).

- [ ] **Step 4: Manual smoke — HTTP transport refuses to start without secret**

```bash
unset MCP_HTTP_SECRET
MCP_TRANSPORT_MODE=http npx tsx src/mcp-main.ts
```
Expected: process exits with an error message mentioning `MCP_HTTP_SECRET`.

- [ ] **Step 5: Manual smoke — HTTP transport rejects request without bearer**

In one terminal:
```bash
export MCP_HTTP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
MCP_TRANSPORT_MODE=http npx tsx src/mcp-main.ts &
```
In another:
```bash
curl -i -X POST http://127.0.0.1:3000/mcp
```
Expected: `HTTP/1.1 401 Unauthorized`, `WWW-Authenticate: Bearer`.

Then with the right header:
```bash
curl -i -X POST -H "Authorization: Bearer $MCP_HTTP_SECRET" http://127.0.0.1:3000/mcp
```
Expected: a 4xx/5xx that is *not* 401 (transport-level error is fine — we're only confirming auth passed). Tear down the background process.

- [ ] **Step 6: Update the `server-info` resource's `auditLogging` claim**

`src/mcp/resources.ts:150` already sets `auditLogging: true`. Confirm it is still truthful (every write tool now calls `auditLogger`). No code change expected; just verify by reading the file.

- [ ] **Step 7: Final commit if anything changed in Step 6**

Only commit if a change was actually needed:
```bash
git add -p
git commit -m "chore(audit): verify auditLogging capability flag truthful"
```

- [ ] **Step 8: Push the branch**

```bash
git push -u origin v2
```

---

## Done

When all 14 tasks are checked off, Plan A is complete. The next plan in the v2 series is **Plan B — Correctness fixes**. The user will hand back to writing-plans to draft it.
