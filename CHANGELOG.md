# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-05-31

> **Major release.** v3 is a security and surface-reduction overhaul of the v2 server. See `MIGRATION-v3.md` for the full upgrade guide.

### Added

- **`ACTIVITYPUB_ENABLE_WRITES` env var.** Master switch for all mutation tools. Default `false` — mutation tools are not registered at server start unless explicitly opted in, so prompt-injected Fediverse content cannot name a tool that does not exist.
- **`MCP_HTTP_ALLOWED_HOSTS` / `MCP_HTTP_ALLOWED_ORIGINS` env vars.** Explicit allowlists for HTTP transport DNS-rebinding protection. Required when binding to a non-localhost interface.

### Changed

- **Read-only by default.** Mutation tools (post-status, reply-to-post, delete-post, boost/unboost, favourite/unfavourite, bookmark/unbookmark, follow/unfollow, mute/unmute, block/unblock, vote-on-poll, upload-media, get/cancel/update-scheduled-post) are only registered when `ACTIVITYPUB_ENABLE_WRITES=true`.
- **`discover-instances-live` renamed to `discover-instances`.** The static fallback `recommend-instances` and old static `discover-instances` are removed; the live instances.social-backed implementation is now the only `discover-instances`.
- **`search-instance`, `search-accounts`, `search-hashtags`, `search-posts` consolidated into `search`.** Pass `type: "all" | "accounts" | "posts" | "hashtags"` to the unified `search` tool.
- **`get-local-timeline` + `get-federated-timeline` consolidated into `get-public-timeline`.** Pass `scope: "local" | "federated"`.
- **`get-instance-software` removed.** `get-instance-info` now includes the software detection block.
- **All remote Fediverse content wrapped in `<untrusted-content>` envelope** before it reaches the model. Defense in depth against prompt-injection from posts, profiles, and instance descriptions.
- **MCP tool annotations added.** All tools carry `readOnly: true` or `destructive: true` annotations per MCP spec.
- **`/health` is now a trivial liveness probe.** No longer performs an outbound connectivity check. Returns `200 OK`.
- **Full DNS-rebinding IP-pinning on all outbound fetch paths** (previously only on HTTP transport). All `undici`-based fetches block requests that resolve to private/loopback IPs.
- **Docs consolidated to the site; README is a project overview.**

### Removed

- **Export tools** (`export-timeline`, `export-thread`, `export-account-info`, `export-hashtag`) — the model formats fetched data directly.
- **`health-check` tool** — removed along with the `/metrics` HTTP endpoint and the telemetry subsystem.
- **`performance-metrics` tool** — telemetry subsystem removed.
- **`batch-fetch-actors` / `batch-fetch-posts`** — call single-item tools in a loop.
- **`convert-url` tool** — no replacement.
- **`recommend-instances`** — superseded by the live `discover-instances`.
- **`get-instance-software` tool** — superseded by `get-instance-info`.
- **`/metrics` HTTP endpoint** — removed entirely.
- **MCP prompts:** `community-health`, `compare-instances`, `content-strategy`, `discover-content`, `migration-helper`, `thread-composer`. Five prompts remain: `explore-fediverse`, `summarize-trending`, `analyze-user-activity`, `compare-accounts`, `find-experts`.
- **Removed env vars:** `HEALTH_CHECK_TIMEOUT`, `HEALTH_CHECK_URL`, `HEALTH_CHECK_EXTERNAL_PROBE`, `MEMORY_WARN_THRESHOLD_MB`, `MEMORY_WARN_THRESHOLD_PERCENT`, `MAX_REQUEST_HISTORY`.

### Security

- **Read-only by default.** Unregistered mutation tools cannot be invoked by model or user, eliminating the prompt-injection write surface entirely when writes are not needed.
- **`<untrusted-content>` envelope.** Fediverse-sourced text is structurally isolated from trusted context before reaching the model.
- **Complete DNS-rebinding IP-pinning.** All outbound HTTP paths now pin resolved IPs via `undici`, blocking SSRF to internal hosts regardless of trigger path.
- **HTTP transport `MCP_HTTP_ALLOWED_HOSTS` / `MCP_HTTP_ALLOWED_ORIGINS` checks.** Requests to the HTTP transport from unexpected Host/Origin headers are rejected `403`, closing the DNS-rebinding attack surface for non-localhost deployments.

### Added

- **Browser-based login.** New `activitypub-mcp login <instance>` acquires an
  access token via Mastodon OAuth2 (PKCE) or Misskey/Foundkey MiAuth — routed by
  NodeInfo software detection — using an ephemeral `127.0.0.1` loopback callback,
  and persists it to `${XDG_CONFIG_HOME:-~/.config}/activitypub-mcp/accounts.json`
  (mode `0600`). The server loads persisted accounts at startup alongside env-var
  accounts. Adds `activitypub-mcp logout <id>` and `activitypub-mcp accounts`.
- **`ACTIVITYPUB_CONFIG_DIR`** to override the credential-store location.
- **Clearer auth errors.** A rejected token (401/403) now returns a
  `TokenRejectedError` telling you to run `activitypub-mcp login <instance>`.

## [2.2.0] - 2026-05-29

### Added

- **Platform-aware write layer.** Authenticated operations now route to the
  correct fediverse API per instance via NodeInfo software detection. A new
  Misskey/Foundkey adapter covers core-parity ops (post/reply, renote, reaction,
  follow/unfollow, mute/block, account verify, media upload, home timeline,
  notifications), normalizing responses into the existing Mastodon-shaped types.
  Mastodon-API-compatible software (Pleroma, Akkoma, GotoSocial, Sharkey,
  Firefish) and undetected instances continue to use the Mastodon adapter.
- **`UnsupportedOnPlatformError`.** Bookmarks, poll voting, and scheduled posts —
  which have no Misskey equivalent — now return a clear "not supported on
  Misskey" error instead of an opaque HTTP failure.

### Internal

- New `src/auth/adapters/` module: `WriteAdapter` interface + shared guarded
  `authenticatedFetch`, `MastodonWriteAdapter` (existing logic), and
  `MisskeyWriteAdapter`. `AuthenticatedClient` is now a thin router resolving the
  adapter from detected software; `account-manager.verifyAccount` routes through
  the adapter so Misskey accounts verify against `/api/i`.

## [2.1.0] - 2026-05-28

### Added

- **`get-instance-software` tool.** Detects ActivityPub software (Mastodon, Pleroma, Misskey, Akkoma, Sharkey, GotoSocial, Friendica, etc.) and version via NodeInfo 2.0/2.1. Returns a structured `{detection, software, protocols, openRegistrations}` shape, rendered as prose in the MCP response. Failure modes return `detection: "unavailable"` with a one-line reason — the tool never throws on detection failure.
- **`activitypub://instance-info/{domain}` resource enrichment.** Resource responses now include a structured `software:` block from the same NodeInfo detection, fetched in parallel with the existing instance-info payload. Resource fetches succeed even when software detection returns `unavailable`.
- **`MCP_INSTANCE_SOFTWARE_TTL_MS` env var.** Tunes the positive-cache TTL for NodeInfo detection results. Default: `86_400_000` (24h). Negative-cache TTL (for detection failures) is hardcoded at 1h.
- **Dependabot config.** Weekly npm and GitHub Actions update PRs, with minor+patch updates grouped to reduce noise; major bumps surface as individual PRs for explicit review.

### Breaking changes

- **`activitypub://post-thread/{postUrl}` URI form removed.** Deprecated in v2.0.0 with a warning; removed in 2.1.0. Use the canonical `activitypub://post-thread/{domain}/{statusId}` form. Callers using the legacy form receive an `InvalidParams` error with a migration message.
- **`activitypub://instance-info/{domain}` `software` field is now an object.** Previously a plain string (e.g. `"mastodon"`) sourced from the upstream instance metadata. v2.1 replaces it with the structured `{detection, software, protocols, openRegistrations}` block from NodeInfo detection. The old string is no longer present in the response. Consumers reading `body.software` as a string should switch to `body.software.software?.name`.

### Internal

- Windows smoke-test bin-shim resolution.
- Windows CRLF lint failure + CodeQL URL-sanitization alert.
- Replaced hardcoded absolute path in `upload-media` test with relative resolution.
- New `src/discovery/nodeinfo.ts` module: NodeInfo Zod schemas, `getInstanceSoftware` with positive + negative LRU caches, SSRF/blocklist guards, same-host/subdomain check on the linked NodeInfo URL, single-flight dedup for concurrent lookups.
- Live-Fediverse integration test against `mastodon.social` for NodeInfo detection.

## [2.0.0] - 2026-05-27

> **Major release.** v2 is a security, correctness, and ergonomics overhaul of the v1 server. See `MIGRATION-v2.md` for the full upgrade guide.

### Breaking changes

- **Node 20+ required.** Node 18 reached EOL April 30, 2025. v2's minimum is `node >=20.0.0`.
- **HTTP transport requires `MCP_HTTP_SECRET`.** The HTTP transport now refuses to start without a `MCP_HTTP_SECRET` env var (32+ random chars recommended). All requests to `/mcp` and `/metrics` must include `Authorization: Bearer <secret>`. `/health` remains unauthenticated. stdio transport is unaffected.
- **CORS default changed.** `MCP_HTTP_CORS_ORIGINS` no longer defaults to `"*"`. Set it explicitly if cross-origin requests are needed.
- **`ACTIVITYPUB_ACCOUNTS` delimiter changed.** Format is now `id|instance|token|username|label` (pipe), not colon. v2 refuses to start if it sees the legacy `:`-delimited value.
- **`scheduledId` → `scheduledPostId`.** The `cancel-scheduled-post` and `update-scheduled-post` tools renamed their identifier parameter for clarity and to match the README.
- **`HEALTH_CHECK_ENABLED` env var removed.** Replaced by the narrower `HEALTH_CHECK_EXTERNAL_PROBE` (default `true`) which gates only the outbound `mastodon.social` connectivity probe.
- **`get-relationship` no longer accepts the legacy `accountIds` array.** The v1 README documented `accountIds: string[]`; the actual handler took `acct: string`. v2 makes `acct` (single string) authoritative and throws a helpful error if `accountIds` is passed. Callers scripting against the old README must update.
- **Outbound URL scheme allow-list.** `validateExternalUrl` now rejects non-https schemes (`file:`, `data:`, `http:`, `ftp:`, …). Defence in depth — affects only callers that constructed non-https URLs (no v1 user code path did this), but flagged here for completeness.

### Added

- **`post-status` now supports `mediaIds` and `scheduledAt`.** Round-trip flow with `upload-media` works end-to-end.
- **`search-instance` returns prose output** matching the other search tools (was raw JSON in v1).
- **`fetch-timeline` renders all posts** (was capped at 10) and truncates per-post content to 500 chars.
- **Dynamic `server-info` capabilities.** The `activitypub://server-info` resource now lists tools/resources/prompts from a live registry — no more hand-maintained arrays that drift.
- **Thread traversal caps.** `get-post-thread` caps recursion depth at 5 and total replies at 50 (configurable via `MCP_THREAD_MAX_DEPTH` and `MCP_THREAD_MAX_REPLIES`).
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
- **`src/main.ts`** — informational entrypoint never exposed publicly.
- **`src/utils/index.ts`** — barrel export replaced by direct imports.
- **`src/resilience/adaptive-rate-limiter.ts`** — was never wired into any tool.

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
- **624 unit tests** (up from 533 at v2 start) covering every behavior change.

## [1.1.0] - 2026-02-02

### Added

#### Authenticated Write Operations (NEW)

- **Multi-account support** with secure credential management
- **Account management tools**: `list-accounts`, `switch-account`, `verify-account`
- **Posting tools**: `post-status`, `reply-to-post`, `delete-post`
- **Interaction tools**: `boost-post`, `unboost-post`, `favourite-post`, `unfavourite-post`, `bookmark-post`, `unbookmark-post`
- **Relationship tools**: `follow-account`, `unfollow-account`, `mute-account`, `unmute-account`, `block-account`, `unblock-account`, `get-relationship`
- **Authenticated timelines**: `get-home-timeline`, `get-notifications`, `get-bookmarks`, `get-favourites`
- **Poll tools**: `vote-on-poll` with visual results display
- **Media tools**: `upload-media` with alt text and focal point support
- **Scheduling tools**: `get-scheduled-posts`, `update-scheduled-post`, `cancel-scheduled-post`
- Environment variable configuration for accounts:
  - `ACTIVITYPUB_DEFAULT_INSTANCE` - Default instance domain
  - `ACTIVITYPUB_DEFAULT_TOKEN` - OAuth access token
  - `ACTIVITYPUB_DEFAULT_USERNAME` - Username
  - `ACTIVITYPUB_ACCOUNTS` - Multi-account configuration

#### Content Export Tools (NEW)

- `export-timeline` - Export actor timeline to JSON, Markdown, or CSV
- `export-thread` - Export post thread with ancestors and replies
- `export-account-info` - Comprehensive account data export
- `export-hashtag` - Export posts containing a specific hashtag

#### New MCP Prompts (4 additional prompts)

- `content-strategy` - Plan fediverse content strategy based on trends and audience
- `community-health` - Analyze instance moderation and community health
- `migration-helper` - Evaluate and plan instance migration
- `thread-composer` - Help compose well-structured threaded posts

#### Adaptive Rate Limiting (NEW)

- Per-instance rate limit tracking from response headers
- Automatic parsing of `X-RateLimit-*` headers
- Recommended delay calculations based on remaining quota
- Rate-limited instance tracking and statistics

#### HTTP Transport Support

- New HTTP/SSE transport mode for production deployments (`MCP_TRANSPORT_MODE=http`)
- Built-in endpoints: `/mcp`, `/health`, `/metrics`, `/` (server info)
- CORS support with configurable origins
- Graceful shutdown with active connection tracking

#### Audit Logging System

- Comprehensive logging of tool invocations, resource access, and security events
- Automatic sensitive data redaction (passwords, tokens, secrets)
- In-memory circular buffer with configurable size
- Statistics and filtering by event type/domain
- JSON export capability

#### Instance Blocklist

- Block specific fediverse instances by domain or wildcard pattern
- Multiple block reasons: policy, user, safety, spam, federation, custom
- Expiration support for temporary blocks
- Import/export blocklist as JSON

#### Dynamic Instance Discovery

- Real-time instance discovery via instances.social API
- Fediverse Observer GraphQL API as fallback
- Filter by software, language, user count, registration status
- Caching with configurable TTL

#### New MCP Tools (13 read-only tools)

- `discover-instances-live` - Real-time instance discovery with advanced filters
- `get-post-thread` - Fetch post with full conversation thread
- `get-trending-hashtags` - Trending hashtags on an instance
- `get-trending-posts` - Trending posts on an instance
- `get-local-timeline` - Local public timeline
- `get-federated-timeline` - Federated public timeline
- `search-accounts` - Specialized account search
- `search-hashtags` - Specialized hashtag search
- `search-posts` - Specialized post search
- `search` - Unified search across accounts, posts, and hashtags with type filtering
- `convert-url` - URL conversion utility
- `batch-fetch-actors` - Fetch multiple actors at once
- `batch-fetch-posts` - Fetch multiple posts at once

#### New MCP Resources (4 resources)

- `activitypub://trending/{domain}` - Trending content from an instance
- `activitypub://local-timeline/{domain}` - Local timeline resource
- `activitypub://federated-timeline/{domain}` - Federated timeline resource
- `activitypub://post-thread/{postUrl}` - Post thread resource

#### Previous Prompts (4 prompts)

- `compare-accounts` - Compare fediverse accounts side by side
- `analyze-user-activity` - Detailed user activity analysis
- `find-experts` - Find experts on specific topics
- `summarize-trending` - Summarize what's trending

#### CLI Improvements

- Added `--help` / `-h` flag with comprehensive usage documentation
- Added `--version` / `-v` flag
- Environment variable documentation in help output

### Changed

- `fetch-timeline` now supports pagination (cursor, minId, maxId, sinceId parameters)
- Improved error messages with `formatErrorWithSuggestion()` helper
- Better organized tool/resource/prompt registration with categorized groupings
- Enhanced server-info resource with categorized capabilities and feature flags

### New Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT_MODE` | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_HTTP_PORT` | `3000` | HTTP server port |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP server host |
| `MCP_HTTP_CORS_ENABLED` | `false` | Enable CORS |
| `MCP_HTTP_CORS_ORIGINS` | `*` | Allowed CORS origins |
| `INSTANCES_SOCIAL_TOKEN` | - | API token for instances.social |
| `DYNAMIC_INSTANCE_CACHE_TTL` | `3600000` | Cache TTL for discovery (1hr) |
| `MAX_DYNAMIC_INSTANCES` | `100` | Max instances to fetch |
| `AUDIT_LOG_ENABLED` | `true` | Enable audit logging |
| `AUDIT_LOG_MAX_ENTRIES` | `10000` | Max audit log entries |
| `BLOCKED_INSTANCES` | - | Comma-separated blocked domains |
| `INSTANCE_BLOCKING_ENABLED` | `true` | Enable instance blocking |
| `RESPECT_CONTENT_WARNINGS` | `true` | Respect CW in output |
| `SHOW_CONTENT_WARNINGS` | `true` | Include CW in responses |
| `ACTIVITYPUB_DEFAULT_INSTANCE` | - | Default instance for auth |
| `ACTIVITYPUB_DEFAULT_TOKEN` | - | OAuth access token |
| `ACTIVITYPUB_DEFAULT_USERNAME` | - | Account username |
| `ACTIVITYPUB_ACCOUNTS` | - | Multi-account config |

## [1.0.3] - 2025-11-16

### Added
- OG image generation for social media sharing
- Enhanced documentation site with improved navigation and search
- Production-ready deployment configurations

### Changed
- Upgraded dependencies to latest versions for security and performance
- Updated Astro to 5.15.8 for improved site building
- Updated MCP SDK to 1.22.0 for latest protocol features
- Replaced deprecated npm-run-all with npm-run-all2
- Improved site styling and mobile responsiveness
- Enhanced code review findings and documentation clarity

### Fixed
- Documentation formatting and broken links
- Mobile search functionality
- Code block horizontal scrolling issues
- Biome configuration schema validation
- Various text and formatting improvements

### Security
- Fixed security vulnerabilities in dependencies
- Updated packages with known security issues

## [1.0.2] - 2024-09-24

### Fixed
- Fixed GitHub token permissions for automated release creation
- Resolved 403 "Resource not accessible by integration" error
- GitHub releases now create automatically when tags are pushed

## [1.0.1] - 2024-09-24

### Added
- Automated CI/CD pipeline with GitHub Actions
- GitHub Pages deployment workflow for documentation site
- Automated release workflow that creates tags on version changes
- Comprehensive test suite with multiple test scenarios
- Security scanning with CodeQL and dependency audits
- Cross-platform support (Windows, macOS, Linux)
- Biome linting and formatting configuration

### Changed
- Improved error handling and logging throughout the codebase
- Enhanced documentation with detailed setup guides
- Updated dependencies to latest stable versions
- Optimized build process for better performance

### Fixed
- Resolved linting issues and improved code quality
- Fixed Windows compatibility issues in scripts
- Corrected TypeScript configuration for better type safety
- Fixed package.json scripts for cross-platform compatibility

### Security
- Added automated security vulnerability scanning
- Implemented dependency review for pull requests
- Added license compliance checking
- Enhanced input validation and sanitization

## [1.0.0] - 2024-09-20

### Added
- Initial release of ActivityPub MCP Server
- Core ActivityPub protocol implementation
- Model Context Protocol (MCP) server functionality
- Fediverse exploration and interaction tools
- WebFinger protocol support
- ActivityStreams vocabulary implementation
- Fedify integration for ActivityPub operations
- Comprehensive documentation and guides
- Example configurations and usage scenarios
- Cross-platform installation scripts

### Features
- **ActivityPub Tools**: Complete set of tools for ActivityPub operations
  - Actor management and discovery
  - Activity creation and processing
  - Object handling and validation
  - Collection management
- **Fediverse Integration**: Native support for Fediverse protocols
  - WebFinger lookups
  - Actor following and unfollowing
  - Content federation
  - Instance discovery
- **MCP Compliance**: Full Model Context Protocol implementation
  - Resource management
  - Tool execution
  - Prompt handling
  - Logging and monitoring
- **Developer Experience**: Rich development tools and documentation
  - TypeScript support
  - Comprehensive test suite
  - Development server with hot reload
  - Production-ready build process

### Documentation
- Complete API documentation
- Setup and configuration guides
- Usage examples and tutorials
- Security best practices
- Cross-platform installation instructions
- Troubleshooting guides

### Supported Platforms
- Node.js 18.0.0 or higher
- Windows, macOS, and Linux
- Claude Desktop integration
- Cursor IDE integration
- Shell/terminal usage

---

## Release Notes

### Version 1.0.1 Highlights

This release focuses on improving the development experience and establishing a robust CI/CD pipeline:

- **Automated Deployments**: GitHub Pages site now deploys automatically on every push
- **Release Automation**: Version bumps in package.json automatically trigger releases and NPM publishing
- **Enhanced Testing**: Comprehensive test suite covering all major functionality
- **Security First**: Automated security scanning and dependency management
- **Cross-Platform**: Improved Windows, macOS, and Linux compatibility

### Upgrade Instructions

To upgrade from version 1.0.0:

```bash
npm update -g activitypub-mcp
```

Or install the latest version:

```bash
npm install -g activitypub-mcp@latest
```

### Breaking Changes

No breaking changes in this release. All existing configurations and usage patterns remain compatible.

### Contributors

- Cameron Rye (@cameronrye) - Lead Developer

### Links

- [GitHub Repository](https://github.com/cameronrye/activitypub-mcp)
- [Documentation Site](https://cameronrye.github.io/activitypub-mcp/)
- [NPM Package](https://www.npmjs.com/package/activitypub-mcp)
- [Issue Tracker](https://github.com/cameronrye/activitypub-mcp/issues)
