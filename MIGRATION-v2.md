# Migration Guide: v1 → v2

This is the v2.0.0 release migration guide. See
[`CHANGELOG.md`](./CHANGELOG.md) for the full list of changes, and
`docs/superpowers/specs/2026-05-27-v2-release-design.md` for the design
that drove the release.

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

To migrate the line, use a targeted `sed` that leaves the rest of your `.env` untouched:

```bash
# Apply only to the ACTIVITYPUB_ACCOUNTS line; everything else is left untouched.
# Still review afterward — if any field value (e.g., a token) contains a `:`,
# the resulting `|` separators will be wrong inside that field.
sed -i.bak '/^ACTIVITYPUB_ACCOUNTS=/{s/:/|/g}' .env
```

**Important:** Even the targeted command above is unsafe if any field value
(especially the token) contains a literal `:`. In that case, edit the line
by hand and only replace the four field separators between
`id|instance|token|username|label`.

v2 will refuse to start if it sees a `:`-delimited value (no silent truncation).

If you generate `ACTIVITYPUB_ACCOUNTS` programmatically (from a secret manager,
provisioning script, or CI pipeline), update those generators to emit `|` as the
field delimiter. The startup migration guard will catch silently-generated legacy
format, but the diagnostic is much clearer if the generator emits the right format
directly.

Reference commit: `61f1b56` — `fix!(auth): use pipe delimiter in ACTIVITYPUB_ACCOUNTS (H6)`

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

### Instance blocklist JSON imports now validate strictly

`InstanceBlocklist.importFromJson` previously silently skipped entries
missing required fields (e.g., `domain` or `reason`). v2 validates the
input against a Zod schema and throws on the first invalid entry instead.
This prevents partial imports that could silently leave gaps in a
security-critical blocklist.

If you have an existing JSON dump from v1 that includes malformed
entries, clean them up before re-importing.

Also note: the `reason` field is now constrained to one of `policy`, `user`,
`safety`, `spam`, `federation`, `custom`. If your v1 JSON dump uses free-text
reasons (e.g., `"offensive content"`), map them to one of these values before
importing.

Reference commit: `3413c1d` — `fix(policy): runtime-validate instance-blocklist JSON imports (L7)`

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

Reference commit: `5428c32` — `fix!(tools): rename scheduledId to scheduledPostId (H3b)`

## Removed env vars

### `HEALTH_CHECK_ENABLED` removed

This env var was dead code in v1 — setting it had no effect because no
consumer checked it. v2 deletes it. If you specifically want to skip
the outbound connectivity probe (the `/health` endpoint's reach test to
`mastodon.social`), use the new `HEALTH_CHECK_EXTERNAL_PROBE=false`
instead.

Reference commit: `1c70764`

## Resource URI changes

### `post-thread` resource URI template

The URI template changed from `activitypub://post-thread/{postUrl}` to
`activitypub://post-thread/{domain}/{statusId}`. The new form is RFC 6570
URI-template safe.

v2.0.x continues to accept the legacy form with a deprecation warning.
The legacy form will be removed in 2.1.0.

**Before:**

```text
activitypub://post-thread/https%3A%2F%2Fmastodon.social%2F%40alice%2F123456
```

**After:**

```text
activitypub://post-thread/mastodon.social/123456
```

The new form constructs `https://{domain}/web/statuses/{statusId}` internally,
which is the Mastodon-compatible ActivityPub URL. Non-Mastodon instances
(Pleroma, Misskey, etc.) that do not support this path can continue using the
legacy `{postUrl}` form until 2.1.0.

> **Note:** The new `{domain}/{statusId}` template constructs a Mastodon-style URL
> (`https://{domain}/web/statuses/{statusId}`). Non-Mastodon ActivityPub implementations
> (Pleroma, Akkoma, Misskey, etc.) have different status URL shapes and may not resolve
> via this form. For non-Mastodon instances, continue using the legacy `{postUrl}` form
> until instance-software detection lands in a future release.

Reference commit: `a6f8049`

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

## Explicitly not changed

The following are intentionally **unchanged** in v2 so existing integrations
that touch only these surfaces do not need code edits:

- **MCP tool names.** Every tool keeps its v1 name (e.g., `post-status`,
  `fetch-timeline`, `discover-instances`). Only specific tool *parameters*
  changed — see "Tool API changes" above.
- **MCP resource scheme.** Resources are still served under the
  `activitypub://` scheme. Only the `post-thread` template path shape
  changed — see "Resource URI changes" above.
- **Read-only tool surface.** The set of read-only tools (timelines,
  instance discovery, post lookup, etc.) is unchanged. No read-only tool
  was renamed, removed, or had a required parameter added.
- **MCP prompts.** All v1 prompts remain available; only the
  `discover-content` prompt's `topics` (plural) parameter is now documented
  to match the long-standing schema name.
- **Stdio transport.** Stdio transport (`MCP_TRANSPORT_MODE=stdio`,
  the default) is unchanged. The new `MCP_HTTP_SECRET` requirement applies
  only to `http` transport.
