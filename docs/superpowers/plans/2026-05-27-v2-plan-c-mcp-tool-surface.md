# v2 Plan C — MCP Tool Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 8 MCP tool surface findings from spec section 3 (H2 post-status missing mediaIds/scheduledAt, H3 five README↔code drift items, M4 search-instance raw JSON, M5 fetch-timeline truncation, M6 server-info hardcoded capabilities, M7 dead HEALTH_CHECK_ENABLED flag, L8 stale date example, L10 post-thread URI template).

**Architecture:** Touch the MCP boundary surface — schemas in `src/mcp/tools-write.ts` and `src/mcp/tools.ts`, resource templates in `src/mcp/resources.ts`, prompt-arg docs in `src/mcp/prompts.ts`, and the matching README sections. Where code and docs diverge, the code-as-truth wins except where the README's name is clearly better (covered in the plan per item). One `feat!` commit (`scheduledId` → `scheduledPostId` rename, plus the dead env-var removal). One new dynamic-capabilities module to eliminate the drift class permanently.

**Tech Stack:** TypeScript (ESM), Zod, `@modelcontextprotocol/sdk` 1.26+, Vitest, Biome.

**Spec reference:** [docs/superpowers/specs/2026-05-27-v2-release-design.md §3](../specs/2026-05-27-v2-release-design.md)

**Plan A/B context:**
- v2 branch baseline: 608 tests passing.
- `auditLogger` wiring complete on all write handlers (Plan A L2).
- `npx tsc --noEmit` must remain clean (will become a CI step in Plan D).
- File paths are pre-refactor; Plan E moves them.

---

## Pre-flight

- Confirm branch: `git branch --show-current` → `v2`.
- Baseline: `npm test` → 608 passing.
- `npx tsc --noEmit` → zero errors.

---

## Task 1: Add `mediaIds` and `scheduledAt` to `post-status` schema (H2)

**Files:**
- Modify: `src/mcp/tools-write.ts` (the `registerPostStatusTool` function around lines 352-450)
- Test: extend `tests/unit/mcp-tools-write.test.ts`

The `CreatePostOptions` type and `authenticatedClient.createPost` already accept `mediaIds` and `scheduledAt` (verified at `src/auth/authenticated-client.ts:39, 48, 271, 273`). The MCP-facing `inputSchema` and the destructured handler args are the only gap — `upload-media` and `get-scheduled-posts` already tell the LLM to pass these.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/mcp-tools-write.test.ts` (the existing file has the `registeredTools` map and the `authenticatedClient` mock):

```typescript
describe("post-status mediaIds and scheduledAt (H2)", () => {
  beforeEach(() => {
    auditLoggerMock.logToolInvocation.mockClear();
    (authenticatedClient.createPost as Mock).mockClear();
  });

  it("passes mediaIds through to authenticatedClient.createPost", async () => {
    const tool = registeredTools.get("post-status");
    expect(tool).toBeDefined();
    await tool?.handler({ content: "look at this", mediaIds: ["m1", "m2"] });
    expect(authenticatedClient.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ content: "look at this", mediaIds: ["m1", "m2"] }),
      undefined,
    );
  });

  it("passes scheduledAt through to authenticatedClient.createPost", async () => {
    const tool = registeredTools.get("post-status");
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await tool?.handler({ content: "later", scheduledAt: future });
    expect(authenticatedClient.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ content: "later", scheduledAt: future }),
      undefined,
    );
  });

  it("rejects scheduledAt in the past via Zod refinement", async () => {
    const tool = registeredTools.get("post-status");
    const past = "2020-01-01T00:00:00Z";
    // The MCP SDK validates inputs with the Zod schema before invoking the
    // handler. The exact error shape depends on how the SDK surfaces it; the
    // key assertion is that the handler is NOT called with the past date.
    await expect(
      tool?.handler({ content: "no time machine", scheduledAt: past }),
    ).rejects.toThrow(/scheduledAt|future|past/i);
  });

  it("rejects more than 4 mediaIds via Zod max(4)", async () => {
    const tool = registeredTools.get("post-status");
    await expect(
      tool?.handler({ content: "too much", mediaIds: ["a", "b", "c", "d", "e"] }),
    ).rejects.toThrow(/4|max/i);
  });
});
```

(Note: depending on how the test harness invokes the handler — directly vs. through the SDK's `callTool` — Zod-level validation may happen before the handler runs OR may need to be invoked explicitly. If the direct `.handler({...})` bypasses Zod validation, the last two tests will need to validate against the schema explicitly: `expect(() => tool?.config.inputSchema.parse(badArgs)).toThrow(...)`. Adjust to match the harness pattern in the existing file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts -t "mediaIds and scheduledAt"`
Expected: FAIL — the schema doesn't accept these fields; they're stripped by Zod and the createPost mock is called without them.

- [ ] **Step 3: Extend the schema and destructured args**

In `src/mcp/tools-write.ts`, update `registerPostStatusTool`. Change the `inputSchema` (currently at lines ~355-365) to:

```typescript
inputSchema: {
  content: z.string().min(1).max(5000).describe("The content of your post"),
  visibility: z
    .enum(["public", "unlisted", "private", "direct"])
    .optional()
    .describe("Post visibility (default: public)"),
  spoilerText: z.string().max(500).optional().describe("Content warning / spoiler text"),
  sensitive: z.boolean().optional().describe("Mark media as sensitive"),
  language: z.string().optional().describe("Language code (ISO 639-1, e.g., 'en')"),
  accountId: z.string().optional().describe("Account ID to post from (defaults to active)"),
  mediaIds: z
    .array(z.string())
    .max(4, "post-status accepts at most 4 media IDs")
    .optional()
    .describe("Media IDs from upload-media (max 4)"),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be ISO 8601 (e.g., 2026-06-01T15:00:00Z)" })
    .refine((d) => new Date(d).getTime() > Date.now(), {
      message: "scheduledAt must be in the future",
    })
    .optional()
    .describe("ISO 8601 datetime to schedule the post (e.g., one hour from now in ISO 8601)"),
},
```

Update the handler signature to destructure the new fields, and pass them through to `authenticatedClient.createPost`:

```typescript
async ({
  content,
  visibility = "public",
  spoilerText,
  sensitive,
  language,
  accountId,
  mediaIds,
  scheduledAt,
}) => {
  requireWriteEnabled();
  const startTime = Date.now();
  const auditParams = { content, visibility, spoilerText, sensitive, language, accountId, mediaIds, scheduledAt };

  // ... existing account lookup unchanged ...

  try {
    logger.info("Creating post", { instance: account.instance, visibility });
    const status = await authenticatedClient.createPost(
      {
        content,
        visibility,
        spoilerText,
        sensitive,
        language,
        mediaIds,       // <- pass through
        scheduledAt,    // <- pass through
      },
      accountId,
    );
    // ... rest of success path unchanged ...
  } catch (error) {
    // ... existing catch unchanged ...
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts -t "mediaIds and scheduledAt"`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (612 total).

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools-write.ts tests/unit/mcp-tools-write.test.ts
git commit -m "feat(tools): add mediaIds and scheduledAt to post-status schema (H2)"
```

---

## Task 2: `get-relationship` strict schema + README fix (H3a)

**Files:**
- Modify: `src/mcp/tools-write.ts` (the `get-relationship` tool registration around line 1654)
- Modify: `README.md` (lines ~943-955)
- Test: extend `tests/unit/mcp-tools-write.test.ts`

README documents `accountIds: ["12345", "67890"]` array. Code accepts `acct: "username@instance"` single string. README is wrong — fix it. Also strengthen the schema with `.strict()` so passing the wrong field name gets a clear "Unrecognized key" error instead of silent strip.

- [ ] **Step 1: Locate the existing schema**

Read `src/mcp/tools-write.ts` around lines 1640-1680 to confirm the exact `inputSchema` shape for `get-relationship`. The current schema has `acct: z.string()` and `accountId: z.string().optional()`.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/mcp-tools-write.test.ts`:

```typescript
describe("get-relationship strict schema (H3a)", () => {
  it("rejects accountIds with a helpful error", async () => {
    const tool = registeredTools.get("get-relationship");
    expect(tool).toBeDefined();
    await expect(
      tool?.handler({ accountIds: ["1", "2"] } as unknown as { acct: string }),
    ).rejects.toThrow(/acct|unrecognized|unknown/i);
  });

  it("accepts the documented acct field", async () => {
    const tool = registeredTools.get("get-relationship");
    const result = await tool?.handler({ acct: "user@example.social" });
    expect(result).toBeDefined();
  });
});
```

(If the direct `.handler({...})` bypasses Zod validation, validate against the schema directly: `expect(() => tool?.config.inputSchema.parse({ accountIds: [...] })).toThrow(...)`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts -t "get-relationship strict"`
Expected: FAIL — Zod strips `accountIds` silently and `acct` becomes undefined, then the handler probably throws a different error (e.g. "acct required") that doesn't match the helpful "Unrecognized key" phrasing.

- [ ] **Step 4: Make the schema strict**

In `src/mcp/tools-write.ts` for `get-relationship`, change the registration to use a `.strict()` object schema. The MCP SDK's `inputSchema` field accepts either an object of fields or a Zod schema directly — confirm by reading nearby registrations and pick the form that compiles. Concretely:

```typescript
// If the existing pattern is `inputSchema: { acct: z.string(), accountId: z.string().optional() }`,
// switch to a Zod object with .strict() so Zod surfaces unknown keys:
inputSchema: z.object({
  acct: z.string().describe("Account to check relationship with (username@instance)"),
  accountId: z.string().optional().describe("Your account ID"),
}).strict(),
```

If the MCP SDK requires the field-by-field form (some versions do), keep the field-form and add a custom `.refine()` on a wrapper or use `z.preprocess` to detect `accountIds` and throw early. Concrete fallback:

```typescript
inputSchema: {
  acct: z
    .string()
    .describe("Account to check relationship with (username@instance). If you have multiple accounts to check, call this tool once per account."),
  accountId: z.string().optional().describe("Your account ID"),
  // Detector for the legacy/wrong field name from old docs:
  accountIds: z
    .never({
      message: "get-relationship takes 'acct' (a single username@instance string), not 'accountIds'. Call this tool once per account.",
    })
    .optional(),
},
```

The second form is portable across SDK versions and gives the LLM an actionable error message. Prefer it.

Also update the tool's `description` field to mention the one-at-a-time pattern explicitly:

```typescript
description: "Check your relationship status with another account (following, followed by, blocking, muting, etc.). Pass a single acct like 'username@instance'. To check multiple accounts, call this tool once per account.",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts -t "get-relationship strict"`
Expected: PASS.

- [ ] **Step 6: Fix the README**

In `README.md`, locate the `get-relationship` documentation (around lines 938-955). Replace the example and the parameter table:

```markdown
### get-relationship

Check your relationship status with another account (following, followed by, blocking, muting, etc.).

**Parameters:**
- `acct` (string, required): Account to check relationship with, in `username@instance` format.
- `accountId` (string, optional): Your account ID (defaults to active account).

**Example:**

```json
{
  "name": "get-relationship",
  "arguments": {
    "acct": "alice@mastodon.social"
  }
}
```

**Note:** This tool checks one account at a time. To check multiple, call it once per account.
```

(Adapt to the README's existing formatting style.)

- [ ] **Step 7: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (614 total).

- [ ] **Step 8: Commit**

```bash
git add src/mcp/tools-write.ts tests/unit/mcp-tools-write.test.ts README.md
git commit -m "fix(tools): strict schema for get-relationship + README accuracy (H3a)"
```

---

## Task 3: Rename `scheduledId` to `scheduledPostId` (H3b — BREAKING)

**Files:**
- Modify: `src/mcp/tools-write.ts` (`update-scheduled-post` around line 2500, `cancel-scheduled-post` around line 2440)
- Modify: `src/auth/authenticated-client.ts` if its method takes a positional `scheduledId` (check both `updateScheduledPost` and `cancelScheduledPost`)
- Test: extend `tests/unit/mcp-tools-write.test.ts`
- Update: `MIGRATION-v2.md`

README uses `scheduledPostId` in two scheduled-post tool examples. Code currently uses `scheduledId`. The README name is clearer (less ambiguous about what it identifies). Rename the code to match. Breaking — covered by `feat!` commit and migration doc.

- [ ] **Step 1: Locate all uses of `scheduledId`**

```bash
grep -rn "scheduledId\b" src/ tests/
```

You'll see the MCP schema field, the destructured handler arg, the `authenticatedClient` method param, the test references. Catalog all sites.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/mcp-tools-write.test.ts`:

```typescript
describe("scheduled-post rename to scheduledPostId (H3b)", () => {
  beforeEach(() => {
    auditLoggerMock.logToolInvocation.mockClear();
    (authenticatedClient.cancelScheduledPost as Mock).mockClear();
    (authenticatedClient.updateScheduledPost as Mock).mockClear();
  });

  it("cancel-scheduled-post accepts scheduledPostId (new name)", async () => {
    const tool = registeredTools.get("cancel-scheduled-post");
    expect(tool).toBeDefined();
    await tool?.handler({ scheduledPostId: "sched-1" });
    expect(authenticatedClient.cancelScheduledPost).toHaveBeenCalledWith("sched-1", undefined);
  });

  it("update-scheduled-post accepts scheduledPostId (new name)", async () => {
    const tool = registeredTools.get("update-scheduled-post");
    await tool?.handler({
      scheduledPostId: "sched-1",
      scheduledAt: "2099-01-01T00:00:00Z",
    });
    expect(authenticatedClient.updateScheduledPost).toHaveBeenCalledWith(
      "sched-1",
      "2099-01-01T00:00:00Z",
      undefined,
    );
  });

  it("rejects legacy scheduledId with a helpful error", async () => {
    const tool = registeredTools.get("cancel-scheduled-post");
    await expect(
      tool?.handler({ scheduledId: "sched-1" } as unknown as { scheduledPostId: string }),
    ).rejects.toThrow(/scheduledPostId|scheduledId|renamed|unrecognized/i);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts -t "scheduledPostId"`
Expected: FAIL — current code uses `scheduledId`.

- [ ] **Step 4: Rename in schemas and handlers**

In `src/mcp/tools-write.ts`:

- For `cancel-scheduled-post` (around line 2440-2470): rename `scheduledId` to `scheduledPostId` in the `inputSchema`, in the destructure, in the `auditParams` object, and in the call to `authenticatedClient.cancelScheduledPost`. Also add a detector field for the old name:

```typescript
inputSchema: {
  scheduledPostId: z.string().describe("ID of the scheduled post to cancel"),
  accountId: z.string().optional().describe("Account ID (defaults to active)"),
  // Legacy field detector — gives a clear error to anyone using the old name.
  scheduledId: z
    .never({
      message: "scheduledId was renamed to scheduledPostId in v2. Update your call.",
    })
    .optional(),
},
async ({ scheduledPostId, accountId }) => {
  requireWriteEnabled();
  const startTime = Date.now();
  const auditParams = { scheduledPostId, accountId };
  // ... existing body, but pass scheduledPostId instead of scheduledId ...
  await authenticatedClient.cancelScheduledPost(scheduledPostId, accountId);
  // ...
}
```

- Same treatment for `update-scheduled-post` (around line 2500-2570): rename `scheduledId` → `scheduledPostId` everywhere in the registration.

- [ ] **Step 5: Update `authenticatedClient` if needed**

Check `src/auth/authenticated-client.ts` (around line 1066 has `updateScheduledPost(scheduledAt: string, ...)`). If the method's first param is named `scheduledId` rather than `scheduledPostId`, leave it — that's an internal name with no public API exposure. The rename is only at the MCP-facing layer.

Actually re-confirm: read the methods' signatures and decide. The plan's preference: keep `authenticatedClient` method params as-is (internal); only the MCP `inputSchema` field name changes. If the methods use `scheduledId` internally, the MCP handler does `await authenticatedClient.cancelScheduledPost(scheduledPostId, accountId)` — the parameter is positional so the name doesn't have to match.

If the methods take an options object like `{ scheduledId: string }`, rename the field in the call site to match what the method expects — DO NOT rename the internal field unless that's a separate concern.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/mcp-tools-write.test.ts -t "scheduledPostId"`
Expected: PASS — all 3 cases green.

- [ ] **Step 7: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (617 total).

- [ ] **Step 8: Update `MIGRATION-v2.md`**

Append a new section under "Tool API changes" (creating that subsection if it doesn't exist yet — Plan A's MIGRATION doc has sections 1-4 under "Required actions"; this can be its own top-level section "Tool API changes" or appended to existing structure):

```markdown
## Tool API changes

### `cancel-scheduled-post` and `update-scheduled-post`: `scheduledId` → `scheduledPostId`

The parameter `scheduledId` was renamed to `scheduledPostId` to match how
the README documented it and to be less ambiguous about what kind of ID
it is. The Zod schema rejects the legacy name with a clear error:

> "scheduledId was renamed to scheduledPostId in v2. Update your call."

**Before (v1):**

```json
{ "name": "cancel-scheduled-post", "arguments": { "scheduledId": "123" } }
```

**After (v2):**

```json
{ "name": "cancel-scheduled-post", "arguments": { "scheduledPostId": "123" } }
```

Reference commit: `<H3b commit SHA>` — `fix!(tools): rename scheduledId to scheduledPostId (H3b)`
```

- [ ] **Step 9: Commit**

```bash
git add src/mcp/tools-write.ts tests/unit/mcp-tools-write.test.ts MIGRATION-v2.md src/auth/authenticated-client.ts
git commit -m "fix!(tools): rename scheduledId to scheduledPostId (H3b)

BREAKING CHANGE: cancel-scheduled-post and update-scheduled-post now
accept 'scheduledPostId' instead of 'scheduledId'. The legacy name is
explicitly rejected with a helpful error. See MIGRATION-v2.md."
```

(Only include `src/auth/authenticated-client.ts` in the `git add` if you changed it.)

---

## Task 4: Fix README `search.domain` documentation (H3c)

**Files:**
- Modify: `README.md` (around line 930)

README says `domain` is required. Code makes it optional with a default. Documentation fix only.

- [ ] **Step 1: Locate the search documentation**

Grep: `grep -n "search\|Instance domain" README.md | head -20`. Find the `search` tool's parameter table.

- [ ] **Step 2: Update the parameter description**

Change the existing line (likely something like `- domain (string, required): Instance domain to search`):

```markdown
- `domain` (string, optional): Instance domain to search on. Defaults to `mastodon.social`.
```

If there's a JSON example showing `domain: "..."` as if it were required, leave it (the example can still pass the field — the field is optional, not forbidden).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(tools): correct search.domain as optional in README (H3c)"
```

---

## Task 5: Fix README `upload-media.focus` documentation (H3d)

**Files:**
- Modify: `README.md` (around line 995)

README shows `"focus": "0.0,0.5"` (single comma string). Code has separate `focusX` and `focusY` floats. Doc fix.

- [ ] **Step 1: Locate the upload-media docs**

Grep: `grep -n "focus" README.md`

- [ ] **Step 2: Replace the example and the parameter row**

Update the JSON example:

```json
{
  "name": "upload-media",
  "arguments": {
    "filePath": "/tmp/image.png",
    "focusX": 0.0,
    "focusY": 0.5,
    "description": "alt text"
  }
}
```

Update the parameter table:

```markdown
- `focusX` (number, optional): Horizontal focal point for crop, range -1.0 to 1.0 (default 0).
- `focusY` (number, optional): Vertical focal point for crop, range -1.0 to 1.0 (default 0).
```

(Remove the old `focus` row entirely.)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(tools): correct upload-media focus → focusX/focusY in README (H3d)"
```

---

## Task 6: Fix README `discover-content` prompt arg (H3e)

**Files:**
- Modify: `README.md` (around lines 755-760)

README example passes `"topic": "..."`. Code argSchema field is `topics` (plural). Doc fix.

- [ ] **Step 1: Locate the prompt docs**

Grep: `grep -n "discover-content\|\"topic\"" README.md`

- [ ] **Step 2: Update the example**

Replace the `"topic": "artificial intelligence"` line with:

```json
{
  "name": "discover-content",
  "arguments": {
    "topics": "artificial intelligence"
  }
}
```

If the README's surrounding prose explains "the `topic` argument", change to "the `topics` argument" (plural).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(prompts): correct discover-content arg to 'topics' (H3e)"
```

---

## Task 7: `search-instance` prose render (M4)

**Files:**
- Modify: `src/mcp/tools.ts` (the `search-instance` handler around lines 295-340)
- Test: extend `tests/unit/mcp-tools.test.ts`

Current handler returns `JSON.stringify(results, null, 2)`. Reformat to match other search tools (`search-accounts`, `search-posts`, etc. — read those handlers for the pattern).

- [ ] **Step 1: Read the other search tools' render style**

In `src/mcp/tools.ts`, find `search-accounts`, `search-posts`, `search-hashtags` handlers (grep `register.*Tool\b` or `"search-`). Note the prose format — typically a numbered list with key fields.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/mcp-tools.test.ts`:

```typescript
describe("search-instance prose render (M4)", () => {
  it("renders results as prose, not raw JSON", async () => {
    const tool = registeredTools.get("search-instance");
    expect(tool).toBeDefined();
    // The handler will hit the live MSW mock used elsewhere in this file
    // (or pull from the mocked remoteClient.searchInstance method — check the
    // existing mock setup). Adapt the mock so it returns a known-shape result.
    const result = await tool?.handler({
      domain: "example.social",
      query: "test",
      type: "accounts",
    });
    const text = (result?.content?.[0]?.text ?? "") as string;
    // The bad behavior renders `{` `"id":` etc. — assert that's gone.
    expect(text).not.toMatch(/^\{\s*"/m); // no leading JSON object
    expect(text).not.toMatch(/^\s*\{\s*"accounts":/);
    // The good behavior renders something human-readable (depends on shape).
    // At minimum the query and domain should be mentioned.
    expect(text).toContain("test");
    expect(text).toContain("example.social");
  });
});
```

(The exact assertion depends on what `remoteClient.searchInstance` returns. If the mock is missing, add one mirroring how the existing `search-accounts` tests mock the underlying client.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-tools.test.ts -t "search-instance prose"`
Expected: FAIL — raw JSON output matches the leading-`{` regex.

- [ ] **Step 4: Rewrite the render**

In `src/mcp/tools.ts` (search-instance handler around lines 326-336), replace the `JSON.stringify` block with a prose render that mirrors the style of nearby search tools. Concrete pattern:

```typescript
// Build the text body — adapt to actual results shape from remoteClient.searchInstance.
const items = Array.isArray(results) ? results : results?.accounts ?? results?.statuses ?? results?.hashtags ?? [];
const formatted = items.length === 0
  ? `No ${type} results for "${validQuery}" on ${validDomain}.`
  : items
      .slice(0, 20)
      .map((item: unknown, idx: number) => {
        const it = item as Record<string, unknown>;
        // Pick fields that make sense for the result type. Adapt based on
        // what the existing search-accounts / search-posts handlers do.
        if (type === "accounts") {
          return `${idx + 1}. @${it.acct ?? it.username} — ${it.display_name ?? ""}`;
        }
        if (type === "statuses") {
          const content = (it.content as string | undefined) ?? "";
          const truncated = content.length > 200 ? `${content.slice(0, 200)}…` : content;
          return `${idx + 1}. ${truncated}`;
        }
        if (type === "hashtags") {
          return `${idx + 1}. #${it.name ?? it.title}`;
        }
        return `${idx + 1}. ${JSON.stringify(it)}`;
      })
      .join("\n");

return {
  content: [
    {
      type: "text",
      text: `Search results for "${validQuery}" on ${validDomain} (${type}):\n\n${formatted}`,
    },
  ],
};
```

Read the existing `search-accounts` handler in `src/mcp/tools.ts` BEFORE writing this — copy its field-extraction style so the output looks consistent with sibling tools rather than introducing yet another format.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/mcp-tools.test.ts -t "search-instance prose"`
Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (618 total).

- [ ] **Step 7: Commit**

```bash
git add src/mcp/tools.ts tests/unit/mcp-tools.test.ts
git commit -m "fix(tools): render search-instance as prose, not raw JSON (M4)"
```

---

## Task 8: `fetch-timeline` render all posts (M5)

**Files:**
- Modify: `src/mcp/tools.ts` (the `fetch-timeline` render block around lines 228-258)
- Test: extend `tests/unit/mcp-tools.test.ts`

Current code: `.slice(0, 10)` then truncates each post to 200 chars and appends "and N more posts in this page". Spec: render all fetched posts (up to schema max of 50), bump per-post truncation to 500 chars.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/mcp-tools.test.ts`:

```typescript
describe("fetch-timeline renders all posts (M5)", () => {
  it("renders more than 10 posts when fetched", async () => {
    // Mock remoteClient.fetchActorOutboxPaginated (or whatever fetch-timeline calls)
    // to return 25 posts. The existing test file likely already has this mock
    // shape — extend it for this test.
    const tool = registeredTools.get("fetch-timeline");
    expect(tool).toBeDefined();
    const result = await tool?.handler({
      identifier: "user@example.social",
      limit: 25,
    });
    const text = (result?.content?.[0]?.text ?? "") as string;
    // The bad behavior renders only 10 lines. Assert at least 15 numbered posts.
    const numberedLines = text.match(/^\d+\. /gm) || [];
    expect(numberedLines.length).toBeGreaterThanOrEqual(15);
    // No "and N more posts" footer because we rendered everything.
    expect(text).not.toMatch(/\d+ more posts in this page/);
  });

  it("truncates each post to 500 chars (not 200)", async () => {
    const tool = registeredTools.get("fetch-timeline");
    // Mock to return one post with a 1000-char body.
    // Then assert the rendered text contains a 500-char prefix followed by '…'.
    // (Adapt the mock to whatever the file's existing pattern is.)
    const result = await tool?.handler({
      identifier: "user@example.social",
      limit: 1,
    });
    const text = (result?.content?.[0]?.text ?? "") as string;
    expect(text).toMatch(/.{400,}/);  // at least 400 chars in the body
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-tools.test.ts -t "fetch-timeline renders all"`
Expected: FAIL — only 10 posts shown; "more posts" footer appears; truncation at 200.

- [ ] **Step 3: Update the render**

In `src/mcp/tools.ts` (around line 230-244):

Change:
```typescript
const postsSection = posts
  .slice(0, 10)
  .map((post: unknown, index: number) => {
    const p = post as { type?: string; content?: string; summary?: string; id?: string };
    const content = p.content || p.summary || "No content";
    const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
    const postType = p.type || "Post";
    return `${index + 1}. [${postType}] ${truncated}`;
  })
  .join("\n\n");

const remainingPosts = postCount - 10;
const morePostsNote =
  postCount > 10 ? `\n... and ${remainingPosts} more posts in this page` : "";
```

to:
```typescript
const postsSection = posts
  .map((post: unknown, index: number) => {
    const p = post as { type?: string; content?: string; summary?: string; id?: string };
    const content = p.content || p.summary || "No content";
    const truncated = content.length > 500 ? `${content.slice(0, 500)}…` : content;
    const postType = p.type || "Post";
    return `${index + 1}. [${postType}] ${truncated}`;
  })
  .join("\n\n");

const morePostsNote = ""; // no longer truncating
```

And in the returned text template, remove the `${morePostsNote}` reference (or keep it as an empty string for now — it'll render as nothing).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/mcp-tools.test.ts -t "fetch-timeline renders all"`
Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (620 total).

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools.ts tests/unit/mcp-tools.test.ts
git commit -m "fix(tools): render all fetched posts in fetch-timeline (M5)"
```

---

## Task 9: Dynamic `server-info` capabilities (M6)

**Files:**
- Create: `src/mcp/capabilities.ts`
- Modify: `src/mcp-server.ts` (capture registered names during registration)
- Modify: `src/mcp/resources.ts` (server-info handler builds capabilities from the registry, not hardcoded)
- Test: `tests/unit/mcp-resources.test.ts`

Currently `server-info` resource lists 7 prompts (hardcoded array at `src/mcp/resources.ts:139-147`), but the server actually registers 11. Same drift class for tools and resources. Build dynamically by maintaining a registry that records names during registration.

- [ ] **Step 1: Decide on the registry shape**

Simplest viable approach: a singleton `capabilitiesRegistry` with three string arrays (`tools`, `resources`, `prompts`) and an `add*` method per kind. `register*` functions in `tools-write.ts`, `tools.ts`, `resources.ts`, `prompts.ts` call into the registry when they register each item. The `server-info` resource reads the arrays at response time.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/mcp-resources.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("server-info dynamic capabilities (M6)", () => {
  it("lists every prompt the server actually registered", async () => {
    // Set up a full server and read the server-info resource. Use whatever
    // pattern the existing tests use to construct McpServer + register all
    // tools/resources/prompts. Then read the activitypub://server-info URI.
    // Adapt to the existing harness.

    // Assertion: every prompt in the actual server matches the server-info list.
    const text = await readServerInfoResource(); // helper from existing tests
    const data = JSON.parse(text);
    const advertisedPrompts: string[] = data.capabilities.prompts;
    // The actual prompts the server registers (11 of them per spec analysis).
    // Replace this set with what's actually wired in by reading prompts.ts.
    const actualPrompts = [
      "explore-fediverse",
      "discover-content",
      "compare-instances",
      "compare-accounts",
      "analyze-user-activity",
      "find-experts",
      "summarize-trending",
      "content-strategy",
      "community-health",
      "migration-helper",
      "thread-composer",
    ];
    for (const name of actualPrompts) {
      expect(advertisedPrompts).toContain(name);
    }
    // No phantom prompts:
    for (const name of advertisedPrompts) {
      expect(actualPrompts).toContain(name);
    }
  });
});
```

(`readServerInfoResource()` and the constructor pattern are file-specific — read the existing tests in `tests/unit/mcp-resources.test.ts` to learn how a resource is invoked. Adapt.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-resources.test.ts -t "dynamic capabilities"`
Expected: FAIL — hardcoded list omits 4 prompts.

- [ ] **Step 4: Create the registry**

Create `src/mcp/capabilities.ts`:

```typescript
/**
 * Lightweight registry that records the names of MCP tools, resources,
 * and prompts as they are registered. Consumed by the `server-info`
 * resource to advertise capabilities without drift.
 */

class CapabilitiesRegistry {
  private readonly tools = new Set<string>();
  private readonly resources = new Set<string>();
  private readonly prompts = new Set<string>();

  addTool(name: string): void {
    this.tools.add(name);
  }

  addResource(name: string): void {
    this.resources.add(name);
  }

  addPrompt(name: string): void {
    this.prompts.add(name);
  }

  list(): { tools: string[]; resources: string[]; prompts: string[] } {
    return {
      tools: [...this.tools].sort(),
      resources: [...this.resources].sort(),
      prompts: [...this.prompts].sort(),
    };
  }

  /** For testing: clear the registry between test cases. */
  reset(): void {
    this.tools.clear();
    this.resources.clear();
    this.prompts.clear();
  }
}

export const capabilitiesRegistry = new CapabilitiesRegistry();
```

- [ ] **Step 5: Wire the registry into each registration helper via a wrapper**

To avoid touching ~40 individual `mcpServer.registerTool(...)` call sites, wrap the `McpServer` once at the top-level orchestrators (`registerTools`, `registerWriteTools`, `registerResources`, `registerPrompts`) with a thin proxy that records names as a side effect.

Add this helper at the bottom of `src/mcp/capabilities.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Wrap an McpServer so that every registerTool / registerResource /
 * registerPrompt call also records the name into the capabilities registry.
 * Used by the orchestrators in tools.ts, tools-write.ts, resources.ts,
 * prompts.ts to keep the server-info advertised capabilities honest.
 */
export function trackedMcpServer(mcpServer: McpServer): McpServer {
  const originalRegisterTool = mcpServer.registerTool.bind(mcpServer);
  const originalRegisterResource = mcpServer.registerResource.bind(mcpServer);
  const originalRegisterPrompt = mcpServer.registerPrompt.bind(mcpServer);

  mcpServer.registerTool = ((name: string, ...rest: unknown[]) => {
    capabilitiesRegistry.addTool(name);
    return originalRegisterTool(name, ...(rest as Parameters<typeof originalRegisterTool> extends [string, ...infer R] ? R : never));
  }) as typeof mcpServer.registerTool;

  mcpServer.registerResource = ((name: string, ...rest: unknown[]) => {
    capabilitiesRegistry.addResource(name);
    return originalRegisterResource(name, ...(rest as Parameters<typeof originalRegisterResource> extends [string, ...infer R] ? R : never));
  }) as typeof mcpServer.registerResource;

  mcpServer.registerPrompt = ((name: string, ...rest: unknown[]) => {
    capabilitiesRegistry.addPrompt(name);
    return originalRegisterPrompt(name, ...(rest as Parameters<typeof originalRegisterPrompt> extends [string, ...infer R] ? R : never));
  }) as typeof mcpServer.registerPrompt;

  return mcpServer;
}
```

(Adjust the `...rest` typing if Biome / tsc complains — the goal is just to forward the call. A simpler `as never` or `as Parameters<typeof originalRegisterTool>` cast may suffice; the type-level gymnastics are secondary to the runtime behavior.)

Then at the top of each orchestrator function in `src/mcp/tools.ts`, `src/mcp/tools-write.ts`, `src/mcp/resources.ts`, `src/mcp/prompts.ts`:

```typescript
import { trackedMcpServer } from "./capabilities.js";

export function registerTools(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  const tracked = trackedMcpServer(mcpServer);
  // ... use `tracked` for every subsequent register*Tool(tracked, ...) call ...
  // OR: just mutate `mcpServer` in place (the wrap above mutates the methods),
  // in which case use `mcpServer` throughout as before.
}
```

The wrapper mutates `mcpServer.registerTool` etc. in place, so callers don't actually need to switch to `tracked` — calling `mcpServer.registerTool` after wrapping records into the registry automatically. The cleanest invocation: call `trackedMcpServer(mcpServer)` once at the top of EACH orchestrator (idempotent — re-binding to the already-wrapped methods is safe).

Add a single `trackedMcpServer(mcpServer)` line at the top of each of the 4 orchestrator functions; don't touch any individual `register*` call.

- [ ] **Step 6: Update `server-info` handler**

In `src/mcp/resources.ts` (the `server-info` resource handler), replace the hardcoded `tools`, `resources`, `prompts` arrays in the response with:

```typescript
import { capabilitiesRegistry } from "./capabilities.js";

// inside the handler:
const caps = capabilitiesRegistry.list();
// ... and use caps.tools, caps.resources, caps.prompts in the JSON payload ...
```

Replace the entire hardcoded `capabilities` block with the dynamic one. Note that the existing handler also groups tools by category (`accounts`, `posts`, `instance`, `utility`, `system`); preserve that grouping if possible, OR flatten and document the change. The simpler choice: flat arrays, drop the grouping. Document the change in the test note if you flatten.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/mcp-resources.test.ts -t "dynamic capabilities"`
Expected: PASS.

- [ ] **Step 8: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (621 total).

- [ ] **Step 9: Commit**

```bash
git add src/mcp/capabilities.ts src/mcp/tools-write.ts src/mcp/tools.ts src/mcp/resources.ts src/mcp/prompts.ts tests/unit/mcp-resources.test.ts
git commit -m "feat(mcp): build server-info capabilities from a live registry (M6)"
```

---

## Task 10: Replace `HEALTH_CHECK_ENABLED` with `HEALTH_CHECK_EXTERNAL_PROBE` (M7)

**Files:**
- Modify: `src/health-check.ts` (delete the unused `healthCheckEnabled` field, line 55)
- Modify: `src/config.ts` (add `HEALTH_CHECK_EXTERNAL_PROBE`, default true)
- Modify: `src/health-check.ts` (the external-probe section around line 241 gates on the new flag)
- Test: `tests/unit/config.test.ts` and/or extend health-check tests

`HEALTH_CHECK_ENABLED` is a dead flag — `isEnabled()` is defined but never checked from `http-transport.ts`. Delete it. Add a narrower `HEALTH_CHECK_EXTERNAL_PROBE` (default true) that gates the outbound `mastodon.social` connectivity probe specifically.

- [ ] **Step 1: Confirm the dead flag**

```bash
grep -rn "healthCheckEnabled\|HEALTH_CHECK_ENABLED\|isEnabled" src/
```

Confirm: the field is set in the constructor but never read by any consumer. `isEnabled()` (if it exists) is never called.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/config.test.ts`:

```typescript
describe("HEALTH_CHECK_EXTERNAL_PROBE config (M7)", () => {
  it("defaults to true", async () => {
    delete process.env.HEALTH_CHECK_EXTERNAL_PROBE;
    const mod = await import(`../../src/config.js?cachebust=${Date.now()}`);
    expect(mod.HEALTH_CHECK_EXTERNAL_PROBE).toBe(true);
  });

  it("can be disabled via env", async () => {
    process.env.HEALTH_CHECK_EXTERNAL_PROBE = "false";
    const mod = await import(`../../src/config.js?cachebust=${Date.now()}`);
    expect(mod.HEALTH_CHECK_EXTERNAL_PROBE).toBe(false);
  });
});
```

Also append to `tests/unit/http-transport.test.ts` (or wherever health-check tests live) a behavioral test that confirms the external probe is skipped when the flag is false. Pattern:

```typescript
it("skips the external probe when HEALTH_CHECK_EXTERNAL_PROBE=false", async () => {
  process.env.HEALTH_CHECK_EXTERNAL_PROBE = "false";
  vi.resetModules();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const { healthChecker } = await import("../../src/health-check.js");
  await healthChecker.performHealthCheck(true);
  // The connectivity probe to HEALTH_CHECK_URL must NOT have fired.
  const probeCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes("mastodon.social"));
  expect(probeCalls).toHaveLength(0);
  fetchSpy.mockRestore();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/config.test.ts -t "HEALTH_CHECK_EXTERNAL_PROBE"`
Expected: FAIL — the constant doesn't exist yet.

- [ ] **Step 4: Add the new config and delete the dead flag**

In `src/config.ts`, near the existing `HEALTH_CHECK_*` config block:

```typescript
/**
 * Whether to perform the outbound network connectivity probe in health checks.
 * Default: true. Set to false to skip the external probe (useful when the
 * server runs in an air-gapped environment or under strict outbound network
 * policies).
 */
export const HEALTH_CHECK_EXTERNAL_PROBE = parseBoolEnv(
  process.env.HEALTH_CHECK_EXTERNAL_PROBE,
  true,
);
```

In `src/health-check.ts`:
- Remove the `healthCheckEnabled` field assignment at line 55 and any reference to it.
- Remove the `isEnabled()` method if present.
- In `checkNetworkConnectivity` (or wherever the outbound probe to `HEALTH_CHECK_URL` happens, around line 243), gate the probe on the new flag:

```typescript
import { HEALTH_CHECK_EXTERNAL_PROBE } from "./config.js";

private async checkNetworkConnectivity(): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!HEALTH_CHECK_EXTERNAL_PROBE) {
    return { ok: true, skipped: true };
  }
  // existing implementation unchanged
}
```

The return type expansion (`skipped?: boolean`) lets the rendering code optionally note that the probe was skipped, but that's optional. Minimum: skip the fetch.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/config.test.ts tests/unit/http-transport.test.ts -t "HEALTH_CHECK"`
Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (624 total).

- [ ] **Step 7: Update `MIGRATION-v2.md`**

Under "Removed env vars" (creating that subsection if needed), append:

```markdown
### `HEALTH_CHECK_ENABLED` removed

This env var was dead code in v1 — setting it had no effect because no
consumer checked it. v2 deletes it. If you specifically want to skip
the outbound connectivity probe (the `/health` endpoint's reach test to
`mastodon.social`), use the new `HEALTH_CHECK_EXTERNAL_PROBE=false`
instead.

Reference commit: `<M7 commit SHA>`
```

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/health-check.ts tests/unit/config.test.ts tests/unit/http-transport.test.ts MIGRATION-v2.md
git commit -m "fix(health): replace dead HEALTH_CHECK_ENABLED with HEALTH_CHECK_EXTERNAL_PROBE (M7)"
```

(Not marked as breaking even though we removed an env var — the var had no effect in v1, so removing it changes no observable behavior. Document in MIGRATION-v2.md but skip `feat!`.)

---

## Task 11: Replace stale scheduling date example (L8)

**Files:**
- Modify: `src/mcp/tools-write.ts` (the `get-scheduled-posts` tip at line 2366)

Change `e.g., 2024-12-25T10:00:00Z` to a non-rotting phrase.

- [ ] **Step 1: Locate the line**

```bash
grep -n "2024-12-25\|scheduledAt.*example\|one hour from now" src/mcp/tools-write.ts
```

- [ ] **Step 2: Replace the literal date with a phrase**

In the `get-scheduled-posts` tip text (around line 2366):

```typescript
💡 **Tip:** Use `post-status` with the `scheduledAt` parameter to schedule a post for later (ISO 8601 datetime, e.g., one hour from now in UTC).
```

- [ ] **Step 3: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools-write.ts
git commit -m "docs(tools): drop stale 2024 date from scheduled-posts tip (L8)"
```

---

## Task 12: `post-thread` URI template change (L10)

**Files:**
- Modify: `src/mcp/resources.ts` (the `post-thread` resource registration around lines 735-790)
- Test: `tests/unit/mcp-resources.test.ts`
- Update: `MIGRATION-v2.md`

Replace `activitypub://post-thread/{postUrl}` with `activitypub://post-thread/{domain}/{statusId}`. Add a one-shot deprecation warning for the legacy form (detect `://` in the first segment) so 2.0.x is back-compatible; the legacy form is fully removed in 2.1.0.

- [ ] **Step 1: Read the existing handler**

Read `src/mcp/resources.ts:735-790` so you understand how the URI template is parsed and how the resource is fetched.

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/mcp-resources.test.ts`:

```typescript
describe("post-thread URI template (L10)", () => {
  it("accepts the new {domain}/{statusId} form", async () => {
    // Construct the resource read with the new URI form, verify success.
    const uri = "activitypub://post-thread/mastodon.social/123456";
    const result = await readResource(uri); // adapt to existing helper
    expect(result).toBeDefined();
  });

  it("logs a deprecation warning and still works for the legacy {postUrl} form", async () => {
    const legacyUri = "activitypub://post-thread/https%3A%2F%2Fmastodon.social%2F%40user%2F123456";
    // Spy on the logger to confirm a deprecation warning fires.
    const loggerSpy = vi.spyOn(/* logger module */, "warn");
    const result = await readResource(legacyUri);
    expect(result).toBeDefined();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringMatching(/deprecat/i),
      expect.anything(),
    );
    loggerSpy.mockRestore();
  });
});
```

(Adapt to whatever helper exists for reading resources in the test file. The `readResource` shape may differ.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/mcp-resources.test.ts -t "post-thread URI"`
Expected: FAIL — new form unsupported.

- [ ] **Step 4: Update the resource registration**

The new template needs to construct a fetcher-compatible URL from `{domain}/{statusId}`. `fetchPostThread` calls `fetchObject(postUrl)` which expects a Mastodon-style ActivityPub status URL. The Mastodon canonical form is `https://{domain}/api/v1/statuses/{statusId}` — but `fetchObject` uses the ActivityPub representation, not the API. The reliable cross-instance form that resolves via Mastodon's existing routing is **`https://{domain}/web/statuses/{statusId}`**, which Mastodon redirects to the canonical actor-prefixed URL.

Concrete approach for v2.0.x: accept the new `{domain}/{statusId}` template, construct `https://{domain}/web/statuses/{statusId}` and pass that to `fetchPostThread`. If the instance is non-Mastodon (Pleroma, Misskey, etc.) and rejects this URL, the user can still fall back to the legacy `{postUrl}` form. Document the limitation; a future plan can add instance-software detection.

Replace `src/mcp/resources.ts:735-790` with:

```typescript
function registerPostThreadResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "post-thread",
    new ResourceTemplate("activitypub://post-thread/{domain}/{statusId}", {
      list: async () => ({
        resources: [
          {
            uri: "activitypub://post-thread/{domain}/{statusId}",
            name: "post-thread",
            description:
              "Get a post and its full conversation thread (replies and ancestors). " +
              "For Mastodon-compatible instances, addressable as {domain}/{statusId}.",
            mimeType: "application/json",
          },
        ],
      }),
    }),
    {
      title: "Post Thread",
      description: "Get a post and its full conversation thread including replies and parent posts",
      mimeType: "application/json",
    },
    async (uri, params) => {
      try {
        // The {domain} segment will look like a hostname for the new form
        // (e.g. "mastodon.social") or an encoded URL for the legacy form
        // (e.g. "https%3A%2F%2Fmastodon.social%2F%40user%2F123456").
        const firstSegment = extractSingleValue(params.domain ?? "");

        let postUrl: string;
        const looksLikeEncodedUrl =
          firstSegment.includes("%3A%2F%2F") || firstSegment.includes("://");

        if (looksLikeEncodedUrl) {
          // Legacy form — still supported in 2.0.x with a deprecation warning.
          logger.warn(
            "post-thread URI template `{postUrl}` is deprecated; pass `{domain}/{statusId}` instead. Will be removed in 2.1.0.",
            { receivedUri: uri.href },
          );
          try {
            postUrl = new URL(decodeURIComponent(firstSegment)).href;
          } catch {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Invalid post URL in legacy template: ${firstSegment}`,
            );
          }
        } else {
          // New form: {domain}/{statusId}
          const domain = firstSegment;
          const statusId = extractSingleValue(params.statusId ?? "");
          if (!domain || !statusId) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "post-thread requires {domain} and {statusId} in the URI (e.g. activitypub://post-thread/mastodon.social/123456)",
            );
          }
          // Mastodon-compatible URL — works for Mastodon and most Mastodon-API-compatible
          // implementations. Non-Mastodon instances may need the legacy {postUrl} form.
          postUrl = `https://${domain}/web/statuses/${statusId}`;
        }

        const parsedUrl = new URL(postUrl);
        checkRateLimit(rateLimiter, parsedUrl.hostname);

        logger.info("Fetching post thread", { postUrl, legacyForm: looksLikeEncodedUrl });

        const threadData = await remoteClient.fetchPostThread(parsedUrl.href, {
          depth: 2,
          maxReplies: 50,
        });

        const resourceData = {
          postUrl: parsedUrl.href,
          timestamp: new Date().toISOString(),
          post: threadData.post,
          ancestors: threadData.ancestors,
          replies: threadData.replies,
          totalReplies: threadData.totalReplies,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(resourceData, null, 2),
            },
          ],
        };
      } catch (error) {
        // Preserve existing error-handling pattern from the rest of the handler.
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch post thread: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
```

Key behaviors:
- New form addresses `{domain}/{statusId}` → constructs `https://{domain}/web/statuses/{statusId}`.
- Legacy form (encoded full URL in the first segment) → decoded directly, deprecation warning logged.
- Both forms produce a working `fetchPostThread` call for Mastodon-compatible instances.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/mcp-resources.test.ts -t "post-thread URI"`
Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS (626 total).

- [ ] **Step 7: Update `MIGRATION-v2.md`**

Append to the "Resource URI changes" section:

```markdown
### `post-thread` resource URI template

The URI template changed from `activitypub://post-thread/{postUrl}` to
`activitypub://post-thread/{domain}/{statusId}`. The new form is RFC 6570
URI-template safe.

v2.0.x continues to accept the legacy form with a deprecation warning.
The legacy form will be removed in 2.1.0.

**Before:**

```
activitypub://post-thread/https%3A%2F%2Fmastodon.social%2F%40alice%2F123456
```

**After:**

```
activitypub://post-thread/mastodon.social/123456
```

Reference commit: `<L10 commit SHA>`
```

- [ ] **Step 8: Commit**

```bash
git add src/mcp/resources.ts tests/unit/mcp-resources.test.ts MIGRATION-v2.md
git commit -m "feat(resources): switch post-thread URI to {domain}/{statusId} (L10)

Legacy {postUrl} form is still accepted with a deprecation warning;
will be removed in 2.1.0."
```

---

## Task 13: Final verification

**Files:** none modified — verification step.

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Full test suite with coverage**

Run: `npm run test:coverage`
Expected: PASS. Coverage thresholds met.

- [ ] **Step 4: Smoke — post-status accepts mediaIds**

A short script test (you can do this via Vitest or by calling the registered handler in a Node REPL):

```bash
node -e "
import('./src/mcp/tools-write.js').then(({ registerWriteTools }) => {
  const tools = new Map();
  const mcp = { registerTool: (name, _cfg, handler) => tools.set(name, handler) };
  registerWriteTools(mcp);
  console.log('post-status registered:', tools.has('post-status'));
});
"
```

Optional — the test suite already covers this.

- [ ] **Step 5: Confirm MIGRATION-v2.md sections**

Read `MIGRATION-v2.md` and verify:
- Section for H3b (`scheduledId` → `scheduledPostId`) under "Tool API changes" (added in Task 3).
- Section for M7 (`HEALTH_CHECK_ENABLED` removed) under "Removed env vars" (added in Task 10).
- Section for L10 (`post-thread` URI template) under "Resource URI changes" (added in Task 12).

If any of these sections aren't well-formed or missing, file a small docs fix.

- [ ] **Step 6: Confirm README is internally consistent**

```bash
grep -n "scheduledId\|accountIds.*get-relationship\|\"focus\":\|\"topic\":" README.md
```

Expected: zero matches. (If any remain, they're leftover docs that should also be fixed.)

- [ ] **Step 7: Final commit if anything changed in Step 5 or 6**

Only if a fix was needed.

- [ ] **Step 8: Do NOT push the branch.** Report ready for Plan D and stop.

## Report Format

- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED
- Each step's result
- Any concerns

---

## Done

When all 13 tasks check off, Plan C is complete. The next plan in the v2 series is **Plan D — Build, test & CI hardening** (spec section 5).
