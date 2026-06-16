# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.6] - 2026-06-15

Correctness, hardening, and docs patch from a third end-to-end review. Fixes a
silent read-path data loss, several remote-input edge cases, and a cluster of
tool-reference documentation drift. No breaking changes.

### Fixed

- **`get-public-timeline` silent data loss** — the handler fetched up to `limit`
  posts (default 20, max 40) but rendered only the first 15, while advertising a
  pagination cursor derived from the last *fetched* post. Following the cursor
  skipped the unshown tail, which was then unreachable. It now renders all fetched
  posts, so the cursor never jumps over unseen content.
- **`fetch-timeline` strips content warnings no more** — a Mastodon CW post
  (`summary` = warning, `content` = body) was rendered with the sensitive body and
  no warning, unlike every other read tool. `summarizeOutboxItem` now returns the
  CW separately and the renderer prefixes a `⚠️ CW:` marker.
- **Mastodon timeline cursor off-by-one** — `nextMaxId` was taken from the last
  *surviving* post after normalization dropped malformed records, so a dropped
  trailing record made the next page re-fetch and duplicate posts. The cursor is
  now derived from the last *raw* item the server returned.
- **Misskey account search missing-username guard** — a hostile instance returning
  a user with no `username` produced an `undefined@host` handle; such records are
  now dropped, mirroring the Mastodon accounts path.
- **`instances.social` `hasMore` under-report** — `hasMore` was computed from the
  post-filter array length, so dropping a row with an empty domain on a full page
  falsely reported no more results. It now uses the raw page row count.
- **NodeInfo positive cache ignored later blocks** — a positive software-detection
  entry (24h TTL) kept serving pre-block metadata after an operator blocked the
  instance. Cache hits now re-check the blocklist and go `unavailable` if blocked.

### Security

- **Untrusted-content envelope label not fully defanged** — `safeLabel()` left a
  lone `>` (or unpaired `<`) intact, so an unvalidated remote domain rendered into
  the `<untrusted-content source="…">` opening tag could close the delimiter early.
  The label now escapes `<`/`>`.
- **Malformed `Host` header dropped the connection** — the HTTP transport built the
  request URL from `req.headers.host` before routing/auth, which threw on an
  empty/malformed Host and left the client with no response. The path is now parsed
  against a fixed base; the real Host is still validated by the SDK's DNS-rebinding
  protection.
- **Malformed OAuth `iss` threw instead of failing closed** — a non-URL issuer from
  a hostile authorization server raised an uncaught `TypeError`; it now produces the
  intended "issuer mismatch (possible mix-up attack)" error.

### Changed

- **`MAX_RETRIES` floored at 1** — the retry loop runs `attempt <= MAX_RETRIES`, so
  the previously-allowed `0` made the body never execute, silently issuing no request
  and bricking every remote read/write.
- **Tool reference (`tools.mdx`) reconciled with the validators** — removed inputs
  the tools reject (`discover-actor` profile URLs, `search --resolve`,
  `get-notifications --excludeTypes`, `maxId` on `get-bookmarks`/`get-favourites`/
  `get-scheduled-posts`, `upload-media` URL), corrected the `get-public-timeline`
  `scope` default to `federated`, relaxed the overstated one-hour `scheduledAt` rule
  to "must be in the future," and added the `status`/`update` notification types.

## [3.1.5] - 2026-06-15

Maintenance release: dependency, toolchain, and CI/security hardening. No runtime
behavior changes — the published server is functionally identical to 3.1.4.

### Changed

- Migrated the build to **TypeScript 6** and refreshed the dev/test/build dependency
  groups (vitest, msw, biome, astro, and others via Dependabot).
- Cleaned up `tsconfig.json` for TypeScript 6: explicit `rootDir`, dropped the
  deprecated `baseUrl` and an unused path alias.

### Security

- Deduplicated **esbuild** to the patched `0.28.1`, clearing two dev-toolchain
  advisories (GHSA-gv7w-rqvm-qjhr, GHSA-g7r4-m6w7-qqqr). esbuild is build-time only and
  never shipped, but the dependency tree is now clean.
- Scoped the blocking CI `npm audit` gate to **production** dependencies (what ships in
  `dist/`), so dev-only docs-site advisories no longer block releases. The strict
  production audit remains required and is clean.

## [3.1.4] - 2026-06-10

Security, correctness, and distribution patch from a second end-to-end review.

### Fixed

- **`fetch-timeline` shows real post content again.** Outbox items are activities
  (`Create`/`Announce`), so reading `content` straight off the wrapper rendered every
  post as `[Create] (empty)` against real Mastodon/Pleroma/Misskey servers. The
  formatter now unwraps the nested object (and renders boosts by their URL).
- **Subsystem logs are no longer silently dropped.** logtape categories are
  array-based, so `getLogger("activitypub-mcp:http")` was a sibling of the configured
  logger with no sink — about 13 subsystems (including the operator security and audit
  warnings) emitted nothing. All call sites now use the array-child form, with a
  regression test guarding against the colon form returning.
- **Read timeouts now cover the response body, not just the headers.** A hostile
  instance could send headers promptly then trickle the body forever, evading
  `REQUEST_TIMEOUT` and pinning the tool call. The request deadline now spans the
  body read across every AP-native read.
- **`get-scheduled-posts` works without `ACTIVITYPUB_ENABLE_WRITES`.** It is an
  authenticated read (`readOnlyHint`), but was registered inside the write-gated block,
  contradicting the docs. It now ships with the other authenticated reads.
- **`post-thread` resource resolves the real ActivityPub URI.** It built a
  `/web/statuses/{id}` SPA URL that modern Mastodon does not serve as ActivityPub (it
  302s to HTML), so the resource timed out and retried. It now resolves the canonical
  `uri` via the REST API and validates `{statusId}` against path-segment injection.
- **Windows `login` opens the browser correctly.** `cmd /c start` treated the OAuth
  URL's `&` separators as command separators, truncating the URL and breaking login on
  every Windows machine. It now uses rundll32's FileProtocolHandler (no shell parsing).

### Security

- **Thread reads no longer beacon to attacker-chosen hosts.** The cross-origin gate
  added in 3.1.3 covered ancestors and reply items but not the root post's
  `replies`-collection URL; with `THREAD_CROSS_ORIGIN_FETCH` off (the default) that URL
  is now skipped when off-origin.
- **SSRF private-range coverage corrected.** The IPv4 multicast (`224.0.0.0/4`) and
  reserved (`240.0.0.0/4`) blocks, and the IPv6 multicast (`ff00::/8`) and Teredo
  (`2001::/32`) blocks, matched only a fraction of each CIDR; they now cover the full
  ranges.
- **Mastodon read adapter hardened to parity with Misskey.** Public timeline, trending,
  and search results from a (default-adapter) hostile server are now structurally
  validated, count-coerced, and capped at the requested limit instead of passed through
  unbounded.
- **`install.ps1` no longer wipes other MCP servers on Windows PowerShell 5.1.** The
  `ConvertFrom-Json -AsHashtable` path is PowerShell 6+ only; on 5.1 it threw and the
  fallback overwrote the user's config with only our entry. Install/uninstall now
  delegate to the shared Node merge helper, which preserves existing servers and
  refuses to clobber unparseable configs.
- **Release supply chain tightened.** The `.mcpb` builder (`@anthropic-ai/mcpb`) is now
  version-pinned and installed with `--ignore-scripts`; the release/auto-release jobs
  drop workflow-level write permissions to least privilege and check out with
  `persist-credentials: false`, so the full dependency tree and tests never run with a
  push-capable token.

### Changed

- CI now enforces the per-directory coverage thresholds (a dedicated coverage job runs
  `vitest --coverage`); previously the matrix ran tests without coverage so the floors
  were never checked.
- The README "Add to Cursor" one-click button uses Cursor's `https://cursor.com/install-mcp`
  wrapper; GitHub strips the raw `cursor://` href, leaving a dead button.

## [3.1.3] - 2026-06-09

Security & correctness hardening patch from an end-to-end review.

### Fixed

- **`Ctrl+C`/SIGTERM now actually exits the stdio server.** Graceful shutdown
  stopped the HTTP server and rate limiter but never closed the MCP transport, so
  the `StdioServerTransport`'s stdin listener kept the event loop alive and the
  process hung after the first Ctrl+C (the startup hint even says "Press Ctrl+C to
  exit"). `stop()` now closes the transport so the loop drains and the process exits.
- **Misskey `direct` messages fail loud instead of vanishing.** Mapping Mastodon
  `direct` to Misskey `specified` with no `visibleUserIds` produced an author-only
  note, so the intended DM silently went nowhere. The adapter now rejects `direct`
  with a clear "not supported on Misskey" error.
- **One malformed remote item no longer fails an entire read.** The Misskey read
  adapter drops a structurally-invalid note (rather than throwing), coerces
  non-numeric reaction counts (no more string-concatenated `favourites_count`), and
  enforces the requested `limit` even when a server ignores it.
- **Numeric env vars are validated and clamped.** `AUDIT_LOG_MAX_ENTRIES=0` no
  longer silently disables the audit trail, `MAX_RESPONSE_SIZE=10MB` no longer
  parses to a 10-byte cap (non-integer values fall back to the default), and
  negative/zero values for size/timeout knobs are floored. Out-of-range values are
  reported as startup warnings, and enabling writes (or writes over HTTP) now warns.

### Security

- **`upload-media` enforces a size cap before reading a file.** It `stat`s the path
  and refuses anything over `MAX_UPLOAD_SIZE` (default 100 MB) — and non-regular
  files — before buffering it into memory, so a coerced/oversized path can't OOM the
  process. The target instance still enforces its own real media limit.
- **`upload-media` no longer leaks absolute paths or errno on failure.** Local
  filesystem errors are rendered with the file basename only (never the absolute
  path, never an ENOENT-vs-EACCES distinction), removing a filesystem-enumeration
  oracle for a prompt-injected model. `formatRemoteError` stays reserved for remote
  HTTP bodies. The audit log also records only the basename, not the full path.
- **Cross-origin thread fetches are gated for ancestors, not just replies.** The
  `inReplyTo` ancestor walk now honors `MCP_THREAD_CROSS_ORIGIN_FETCH=false` (the
  default) like the reply branch, closing a privacy-control bypass / cross-origin
  fetch-amplification primitive driven by an attacker-controlled root post.
- **`get-scheduled-posts` is annotated read-only** (it was mislabeled
  `destructiveHint: true` despite only performing a GET).
- **Install/release supply-chain hardening.** `install.sh` now merges client config
  via a standalone helper that parses the existing file with `JSON.parse` (the old
  `node -e "const config = $existing_config"` treated the file as executable JS, a
  code-injection vector); the registry publish job pins `mcp-publisher` to a tagged
  release and verifies its SHA-256 before running it, and no longer inherits
  `NPM_TOKEN`; and the token-holding npm publish/release jobs run
  `npm ci --ignore-scripts`.

### Changed

- **Docs accuracy.** The site API reference no longer files the always-on
  authenticated read tools (home timeline, notifications, bookmarks, favourites,
  relationship, scheduled-posts) under "Write Tools / disabled by default"; the
  on-site Security page now describes the real threat model (prompt injection, SSRF,
  the untrusted-content envelope, read-only default) instead of generic compliance
  boilerplate; the security/limits env vars are documented; and the `search` default
  is corrected (10, not 20).

### Known limitations

- The HTTP transport still serves a single MCP session per process; proper
  multi-session support is tracked for a focused follow-up. The default stdio
  transport is unaffected.

## [3.1.2] - 2026-06-09

### Fixed

- **Logs no longer corrupt the stdio JSON-RPC stream.** logtape's console sink maps
  `info`/`debug` to `console.info`/`console.debug`, which Node writes to **stdout** — the
  same channel the stdio transport uses for MCP JSON-RPC. At the default `LOG_LEVEL=info`
  the startup line and every per-request "Fetching …" log were emitted onto that stream,
  so a strict client could see malformed frames. All log levels now go to stderr, and a
  test drives the real server and asserts stdout carries only JSON-RPC.
- **`CACHE_MAX_SIZE=0` no longer hangs the server.** The value reached the LRU cache
  unvalidated, and a non-positive `maxSize` made the eviction loop spin forever on the
  first cache write — the server hung on its first request. A non-positive or non-finite
  `maxSize` is now clamped to 1.
- **Mastodon posts send an `Idempotency-Key`.** The adapter read the option but no caller
  set it, so a retried post (model- or transport-driven) could duplicate. A key derived
  from the post's content is now sent, so an identical retry collapses to the original
  status server-side.
- **`LOG_LEVEL=warn` works as documented.** The CLI documents `warn`, but logtape's level
  is `warning`. The env value is now normalized (`warn` → `warning`, unknown values →
  `info`) so a documented or mistyped level can't misconfigure logging.

### Security

- **SSRF blocks and rate-limit denials are now recorded in the audit trail.** The
  `logSsrfBlocked` and `logRateLimitExceeded` audit methods existed but had no callers, so
  the two most security-relevant events never appeared in the log. SSRF rejections are now
  audited at the central pinned-fetch path (initial URL and every redirect hop), and the
  three duplicated rate-limit guards are unified into one helper that audits before
  rejecting.

### Changed

- **Dead GitHub Discussions links removed.** Discussions is disabled on the repository, so
  the `/discussions` links in the site footer, the troubleshooting page, and both
  `llms.txt` artifacts 404'd. They now point at GitHub Issues (the real support channel),
  with a test guarding against reintroducing them.

## [3.1.1] - 2026-06-05

### Security

- **`upload-media` validates file content before sending.** The tool read whatever
  `filePath` the model supplied and forwarded it to the instance with no type check, so a
  prompt-injected model (injection arriving through the read tools that surface fediverse
  content) could name an arbitrary path — an SSH key, the credential store, a `.env` — and
  exfiltrate it to a public media URL. Files are now sniffed by magic bytes and rejected
  unless they are a recognized image/video/audio type, neutralizing the exfiltration vector
  while preserving the ability to upload media from anywhere on disk.

### Fixed

- **Misskey relationship results.** `users/relation` returns the relation wrapped in a
  one-element array for a single user id (its `res` schema is `oneOf: [object, array]`); the
  adapter read it as a bare object, so `following` / `followed_by` / `muting` / `blocking` /
  `requested` silently came back `false` after every Misskey follow, mute, or block. Both
  response shapes are now handled.
- **Outbox pagination no longer reports phantom "more".** `fetchActorOutboxPaginated` set
  `hasMore: true` whenever a page was full (`items.length === limit`), even with no `next`
  cursor to follow — so a caller on a full final page would loop on the same page. `hasMore`
  is now true only when there is a cursor to follow.

### Distribution

- **The Claude Desktop Extension (`.mcpb`) is built and attached to every release.** The
  README's one-click install points at this asset on the latest release, but it had only
  ever been attached to v3.0.1 by hand; `release.yml` now builds the bundle and uploads it
  on every release, and a test fails CI if the workflow stops doing so.

### Changed

- **LLM-facing reference files reconciled with the code.** `public/llms.txt` and
  `public/llms-full.txt` no longer describe removed surfaces (the `/metrics` endpoint,
  a "metrics tool", the `HEALTH_CHECK_EXTERNAL_PROBE` / `ENABLE_PERFORMANCE_MONITORING`
  env vars) or non-existent tool/prompt names in their examples, and now document the
  read-only-by-default posture and the `ACTIVITYPUB_ENABLE_WRITES` master switch.

## [3.1.0] - 2026-06-04

### Added

- **Misskey / Foundkey read support.** `search`, `get-trending-hashtags`, `get-trending-posts`, and `get-public-timeline` now work on Misskey-family instances. Reads are routed per instance by NodeInfo software detection through a new read adapter and normalized into the same Mastodon-shaped results, so these tools no longer silently fail on platforms already supported for writes.
- **Authentication guide on the docs site** covering the `activitypub-mcp login` (Mastodon OAuth2 / Misskey MiAuth) flow, credential storage, and multi-account usage.

### Fixed

- **Install command on the site.** The "Quick install" step shipped `npx activitypub-mcp install`, a subcommand the CLI does not dispatch — it silently started a stdio server that blocked on stdin. Corrected to `npx -y activitypub-mcp`.
- **Interactive runs no longer look hung.** Starting the stdio server directly in a terminal now prints a one-line stderr hint that it is waiting for an MCP client; the hint never appears for a connected (piped) client.
- **Getting-started docs reconciled with the code.** Removed phantom env vars (`ACTOR_/INSTANCE_/TIMELINE_CACHE_TTL`, `CONCURRENT_REQUESTS`), a removed `HEALTH_CHECK_EXTERNAL_PROBE` setting, and non-existent npm scripts; corrected the `REQUEST_TIMEOUT`/`CACHE_TTL` defaults and a false CORS "renamed from" claim. A new drift test fails CI if a config page documents an env var the code never reads.

### Security

- **Full IPv6 private-range SSRF blocking.** The private-range checks used literal-prefix regexes that matched only the canonical address, leaving most of `fc00::/7` (unique-local) and `fe80::/10` (link-local) reachable — e.g. `https://[fc12:3456::1]`. Replaced with leading-hextet masks covering each block in full, plus deprecated site-local `fec0::/10`.
- **All GitHub Actions pinned to commit SHAs**, so a retagged or compromised third-party action can no longer run in the credential-bearing release jobs.

### Changed

- **Releases now publish automatically.** `release.yml` and `publish-mcp.yml` are reusable workflows that `auto-release` calls inline after tagging, removing the manual `workflow_dispatch` step the `GITHUB_TOKEN` anti-recursion rule previously required.

## [3.0.1] - 2026-06-02

### Security

- **Strip credentials on cross-origin redirects.** `Authorization`, `Cookie`, and the request body are dropped when an outbound fetch is redirected to a different origin, so credentials can never leak to an unexpected host.

### Added

- **Official MCP registry manifest.** A `server.json` and a `mcpName` marker in `package.json` let the server be published to the [MCP Registry](https://registry.modelcontextprotocol.io) — npm package, stdio transport, read-only by default. See `docs/distribution.md` for the publishing playbook.

### Fixed

- **Misskey `get-home-timeline` pagination.** `minId` is now mapped to the correct Misskey API parameter.
- **Resilient remote fetches.** Outbound requests honor `Retry-After`, retry transient (5xx / network) failures with backoff, and tolerate ActivityStreams `to`/`cc` delivered as a single string instead of an array.

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
