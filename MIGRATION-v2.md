# Migration Guide: v1 → v2

This guide tracks every breaking change in the activitypub-mcp v2 release.
Each breaking commit appends its section as v2 is built out. The final
v2.0.0 release will present this as a complete migration walkthrough.

> Status: in progress. See `docs/superpowers/specs/2026-05-27-v2-release-design.md`
> for the full v2 design.

## Required actions to run v2.0.0

### 1. Upgrade Node to 20+

v1 supported Node 18, which reached end-of-life on April 30, 2025. v2
requires Node 20 LTS or later.

### 2. HTTP transport now requires a Bearer token (`MCP_HTTP_SECRET`)

If you use HTTP transport (`MCP_TRANSPORT_MODE=http`), v2 will refuse
to start unless `MCP_HTTP_SECRET` is set to a random string of at
least 16 characters. Recommended: 32+ characters.

Generate one with:

```bash
export MCP_HTTP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

Client requests must include this on the `/mcp` and `/metrics`
endpoints:

```
Authorization: Bearer <MCP_HTTP_SECRET>
```

The `/health` endpoint stays unauthenticated for load-balancer health
checks. (`stdio` transport ignores this setting.)

Reference commit: `f0c980c` — `feat!(server): require Bearer auth on /mcp and /metrics (H1)`

### 3. CORS default changed from `"*"` to `""`

`MCP_HTTP_CORS_ORIGINS` no longer defaults to wildcard. v2 starts
with no origins allowed. Set it explicitly if CORS is required:

```bash
export MCP_HTTP_CORS_ORIGINS="https://app.example.com,https://staging.example.com"
```

A startup warning is logged if you set `"*"` explicitly, since auth
is the only thing protecting `/mcp` and `/metrics` from arbitrary
web pages. Explicit origins are strongly recommended.

Reference commit: `d0827d9` — `feat!(config): default MCP_HTTP_CORS_ORIGINS to empty (H1)`

### 4. `ACTIVITYPUB_ACCOUNTS` now uses pipe `|` delimiter

The multi-account env var changed from colon-delimited to pipe-delimited
so tokens containing colons (e.g. JWTs) parse correctly.

**Before (v1):**

```env
ACTIVITYPUB_ACCOUNTS=id1:inst1:tok1:user1:label1,id2:inst2:tok2:user2:label2
```

**After (v2):**

```env
ACTIVITYPUB_ACCOUNTS=id1|inst1|tok1|user1|label1,id2|inst2|tok2|user2|label2
```

If you only have hostnames and ASCII tokens, a global replace works:

```bash
sed -i 's/:/|/g' .env   # Caveat: only safe if NO part of the value contains a literal :
```

Otherwise, edit by hand and replace the four field separators in each entry.

v2 will refuse to start if it sees a `:`-delimited value (no silent truncation).

Reference commit: `<H6 commit SHA>` — `fix!(auth): use pipe delimiter in ACTIVITYPUB_ACCOUNTS (H6)`

## Behavioral changes (non-breaking but visible)

### Audit logging is on by default for write tools

All write tools now record success/failure to the audit logger.
Configure log destination via existing `LOGTAPE_*` env vars.

### Thread traversal limits and cross-origin gating

`fetch-post-thread` now caps recursion depth at 5 and total replies
at 50 by default. Replies whose origin differs from the root post
are returned as stubs (not fetched) by default. To restore v1
unrestricted behavior:

```bash
export MCP_THREAD_CROSS_ORIGIN_FETCH=true
```

Or tune the caps:

```bash
export MCP_THREAD_MAX_DEPTH=10
export MCP_THREAD_MAX_REPLIES=100
```

### Streaming response-size enforcement

Outgoing HTTP requests now stream responses and abort if they
exceed `MAX_RESPONSE_SIZE` (default 10 MB), even when the remote
server omits the `Content-Length` header. v1 only checked the
header.

## Sections to be filled by future plans

- **Plans B–F** (other v2 work areas) will append their own sections as they land.
- A consolidated tool-API table will be added once Plans B/C land their schema changes.
