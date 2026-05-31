# Migration Guide: v2 → v3

This is the v3.0.0 release migration guide. See
[`CHANGELOG.md`](./CHANGELOG.md) for the full list of changes.

## Breaking changes at a glance

- **Read-only by default.** Mutation tools are not registered unless you set
  `ACTIVITYPUB_ENABLE_WRITES=true`. Most Claude Desktop users who only read the
  Fediverse need no config change.
- **Several tools were removed or consolidated.** The export tools, health
  tools, batch tools, and several timeline/search tools are gone; use their
  replacements documented below.
- **Six prompts were removed.** Five remain.
- **Several env vars were removed.** See the env-var table below.
- **`/metrics` HTTP endpoint removed.** `/health` is now a trivial liveness
  probe.

---

## Part 1: Required actions

### 1. Decide whether you need writes

v3 does **not** register mutation tools (post-status, reply-to-post,
delete-post, boost/unboost, favourite/unfavourite, bookmark/unbookmark,
follow/unfollow, mute/unmute, block/unblock, vote-on-poll, upload-media,
get/cancel/update-scheduled-post) by default.

If your workflow requires any of those tools, add the `ACTIVITYPUB_ENABLE_WRITES`
env var before the server starts.

**Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "activitypub-mcp": {
      "command": "npx",
      "args": ["-y", "activitypub-mcp"],
      "env": {
        "ACTIVITYPUB_DEFAULT_INSTANCE": "mastodon.social",
        "ACTIVITYPUB_DEFAULT_TOKEN": "<your-token>",
        "ACTIVITYPUB_DEFAULT_USERNAME": "<your-username>",
        "ACTIVITYPUB_ENABLE_WRITES": "true"
      }
    }
  }
}
```

If you omit `ACTIVITYPUB_ENABLE_WRITES` (or leave it `false`), only read tools
are available.

### 2. Non-localhost HTTP binding: set `MCP_HTTP_ALLOWED_HOSTS`

v3 adds DNS-rebinding IP-pinning to all outbound fetch paths. If you run the
HTTP transport bound to anything other than `127.0.0.1` (for example,
`MCP_HTTP_HOST=0.0.0.0` or a public hostname), set the allowlist env vars so
legitimate clients are not rejected with `403`:

```bash
# Host header(s) your clients actually send — include port if non-standard
export MCP_HTTP_ALLOWED_HOSTS=mcp.example.com,mcp.example.com:3000
# Optionally, restrict by Origin header too
export MCP_HTTP_ALLOWED_ORIGINS=https://app.example.com
```

Clients connecting to the default `127.0.0.1` binding need no change.

### 3. Remove any references to the removed env vars

The following variables are no longer read by v3. Leaving them in your `.env`
is harmless but they have no effect:

- `HEALTH_CHECK_TIMEOUT`
- `HEALTH_CHECK_URL`
- `HEALTH_CHECK_EXTERNAL_PROBE`
- `MEMORY_WARN_THRESHOLD_MB`
- `MEMORY_WARN_THRESHOLD_PERCENT`
- `MAX_REQUEST_HISTORY`

---

## Part 2: Removed and renamed tools

Update any automation, chat macros, or scripts that call these tools by name.

| v2 tool | v3 replacement |
|---|---|
| `export-timeline` | None — ask the model to format the fetched data |
| `export-thread` | None — ask the model to format the fetched data |
| `export-account-info` | None — ask the model to format the fetched data |
| `export-hashtag` | None — ask the model to format the fetched data |
| `health-check` | Removed — use the HTTP `/health` endpoint for liveness |
| `performance-metrics` | Removed — `/metrics` endpoint removed entirely |
| `batch-fetch-actors` | Call `discover-actor` repeatedly |
| `batch-fetch-posts` | Use `get-post-thread` for an individual post (returns the post and its thread) |
| `convert-url` | Removed — no replacement |
| `recommend-instances` | Use `discover-instances` (now live via instances.social) |
| `discover-instances` (static) | Use `discover-instances` (same name, now live) |
| `get-instance-software` | Use `get-instance-info` (includes software field) |
| `discover-instances-live` | Renamed to `discover-instances` |
| `search-instance` | Use `search` with `type: "all"` or appropriate type |
| `search-accounts` | Use `search` with `type: "accounts"` |
| `search-hashtags` | Use `search` with `type: "hashtags"` |
| `search-posts` | Use `search` with `type: "posts"` |
| `get-local-timeline` | Use `get-public-timeline` with `scope: "local"` |
| `get-federated-timeline` | Use `get-public-timeline` with `scope: "federated"` |

---

## Part 3: Removed prompts

The following MCP prompts were removed in v3. Five prompts remain:
`explore-fediverse`, `summarize-trending`, `analyze-user-activity`,
`compare-accounts`, `find-experts`.

**Removed:**

- `community-health`
- `compare-instances`
- `content-strategy`
- `discover-content`
- `migration-helper`
- `thread-composer`

---

## Part 4: Env var changes

### Removed env vars

| Variable | Was used for | Notes |
|---|---|---|
| `HEALTH_CHECK_TIMEOUT` | Health-check request timeout | Health tool removed |
| `HEALTH_CHECK_URL` | External probe URL | Health tool removed |
| `HEALTH_CHECK_EXTERNAL_PROBE` | Toggle external probe | Health tool removed |
| `MEMORY_WARN_THRESHOLD_MB` | Memory usage warning | Telemetry removed |
| `MEMORY_WARN_THRESHOLD_PERCENT` | Memory usage warning | Telemetry removed |
| `MAX_REQUEST_HISTORY` | Request history buffer | Telemetry removed |

### Added env vars

| Variable | Default | Description |
|---|---|---|
| `ACTIVITYPUB_ENABLE_WRITES` | `false` | Set `true` to register mutation tools |
| `MCP_HTTP_ALLOWED_HOSTS` | (auto) | Comma-separated Host header allowlist for DNS-rebinding protection. Required when binding to a non-localhost host |
| `MCP_HTTP_ALLOWED_ORIGINS` | (auto) | Comma-separated Origin header allowlist for DNS-rebinding protection |

`MCP_HTTP_ALLOWED_HOSTS` and `MCP_HTTP_ALLOWED_ORIGINS` apply only to HTTP
transport. If you do not set them and bind to a public interface, all HTTP
requests will be rejected with `403 Forbidden`.

---

## Part 5: HTTP endpoint changes

The `/metrics` endpoint has been removed. `/health` is now a trivial liveness
probe (returns `200 OK`; no longer performs an outbound connectivity check to
`mastodon.social`).

If you have load-balancer health checks pointed at `/health`, they continue to
work unchanged. If you scraped `/metrics` for Prometheus data, remove that
scrape target.

---

## Part 6: Documentation

The full tool reference, configuration reference, and guides have moved to the
documentation site. The `README.md` in the repo is now a project overview and
quick-start. Visit the docs site for detailed per-tool documentation:

```
https://cameronrye.github.io/activitypub-mcp/
```

The Astro site source has moved to the `site/` directory in the repository.

---

## Behavioral changes (non-breaking but visible)

### `<untrusted-content>` envelope

All remote Fediverse content (posts, profiles, instance descriptions) is now
wrapped in an `<untrusted-content>` envelope before it reaches the model. This
is defense in depth against prompt-injection from Fediverse content. No user
action is required; the model sees the wrapper and treats it accordingly.

### MCP tool annotations

All tools now carry MCP `annotations` metadata (`readOnly: true` or
`destructive: true`). MCP clients that display this metadata will show richer
hints, but existing integrations that call tools by name are unaffected.

### DNS-rebinding IP-pinning on all outbound fetch paths

v3 blocks outbound requests to private/loopback IPs across all fetch paths
(not just the HTTP transport). This closes the remaining gap where a crafted
Fediverse response could redirect the server to an internal host. No operator
action is required for typical Fediverse deployments.

---

## Explicitly not changed

The following are intentionally **unchanged** in v3:

- **Auth configuration.** `ACTIVITYPUB_ACCOUNTS`, `ACTIVITYPUB_DEFAULT_INSTANCE`,
  `ACTIVITYPUB_DEFAULT_TOKEN`, `ACTIVITYPUB_DEFAULT_USERNAME`,
  `ACTIVITYPUB_CONFIG_DIR` all work as before.
- **HTTP transport auth.** `MCP_HTTP_SECRET` is still required for HTTP transport.
- **CORS config.** `MCP_HTTP_CORS_ORIGINS` and `MCP_HTTP_CORS_ENABLED` are
  unchanged.
- **Stdio transport.** Default transport, unchanged.
- **Read-only tool names** not mentioned in the removal/renamed/consolidated tables above
  (`discover-actor`, `fetch-timeline`, `get-post-thread`,
  `get-instance-info`, `get-trending-hashtags`, `get-trending-posts`,
  `get-home-timeline`, `get-notifications`, `get-bookmarks`, `get-favourites`,
  `get-relationship`, `list-accounts`, `switch-account`, `verify-account`) are unchanged.
  Mutation tools keep the same interface but are gated behind `ACTIVITYPUB_ENABLE_WRITES`.
- **MCP resource scheme.** Resources are still served under `activitypub://`.
- **`ACTIVITYPUB_ACCOUNTS` pipe delimiter.** Still `id|instance|token|username|label`.
- **Node version requirement.** Still `>=20.0.0`.
