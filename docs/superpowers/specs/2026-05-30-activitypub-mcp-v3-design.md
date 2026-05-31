# ActivityPub MCP v3.0.0 — Design Spec

**Date:** 2026-05-30
**Status:** Approved (design), pending implementation plan
**Theme:** A lightweight, security-honest fediverse client for LLMs. Close the
prompt-injection hole, shed weight, consolidate docs.

---

## 1. Problem & Goals

This server's purpose is to feed **attacker-authored, world-writable** fediverse
content into an LLM that, in the same session, may also hold **write credentials
to the user's real social account**. That is the defining threat, and today the
application layer does essentially nothing about it: the only transform on remote
content is `stripHtmlTags` (which removes markup, not the injection payload it
carries), content is interpolated raw into tool results with no provenance
framing, read and write tools share one always-on server, and no tool carries MCP
risk annotations.

Secondary problems: the codebase is over-built for a stdio subprocess (perf
histograms, health probes, 53 tools, redundant search/timeline/export tools,
batch helpers), the "ActivityPub" framing oversells a write path that is really
the Mastodon REST API, docs are split across a README, an in-repo Astro site, and
a GitHub wiki, and stale Fedify references remain though it is not a dependency.

**Goals**

1. Make prompt-injection the named, designed-for threat — not an unacknowledged gap.
2. Make the tool a tight, high-signal set that is safe by default.
3. One canonical documentation home (the site), with a short README overview.
4. Keep what is genuinely good; remove or fix the rest.

**Non-goals**

- Implementing real ActivityPub *federation* (HTTP Signatures, inbox delivery).
- Solving prompt injection in general (an industry-open problem) — we ship the
  cheap, meaningful mitigations and document residual risk honestly.

---

## 2. Keep / Fix / Remove summary

**Keep (genuinely good):** credential store (`O_NOFOLLOW`, 0600, atomic writes,
foreign-uid refusal), audit logging with secret/content redaction, SSRF allow-list
(https-only, per-redirect re-validation, streaming size caps), rate limiter,
instance blocklist, LRU cache, stdio + HTTP `/mcp` transports, multi-account +
Misskey/Foundkey support, OAuth/MiAuth login flows, the existing test discipline.

**Fix:** read-only-by-default tiering, untrusted-content envelope, tool
annotations, DNS-rebinding (pin validated IP + fail-closed), HTTP transport
rebinding protection, honest README/SECURITY docs, stale Fedify references.

**Remove:** perf-monitor + health-check subsystems and their tools, `/metrics`
endpoint, redundant/low-value tools (batch, convert-url, recommend-instances,
static discover-instances, the 4 separate search tools, the 2 separate public
timeline tools, get-instance-software, export tools), marketing-flavored prompts.

---

## 3. Security core

### 3.1 Three-tier tool gating (the write opt-in)

Tools split into three tiers, each gated independently. This requires splitting
the 2,692-line `src/mcp/tools-write.ts` into `tools-auth-read.ts` (authenticated
reads + account management) and `tools-mutate.ts` (mutations).

| Tier | Gate | Tools |
|---|---|---|
| **Public reads** | always registered | discover-actor, fetch-timeline, get-post-thread, get-instance-info, get-public-timeline, get-trending-hashtags, get-trending-posts, search, discover-instances |
| **Authenticated reads** | account configured | list-accounts, switch-account, verify-account, get-home-timeline, get-notifications, get-bookmarks, get-favourites, get-relationship |
| **Mutations** | `ACTIVITYPUB_ENABLE_WRITES=true` **and** account configured | post-status, reply-to-post, delete-post, boost/unboost-post, favourite/unfavourite-post, bookmark/unbookmark-post, follow/unfollow-account, mute/unmute-account, block/unblock-account, vote-on-poll, upload-media, get/cancel/update-scheduled-post |

Behavior:

- **No flag → mutation tools are not registered at all.** They are absent from the
  tool list, so injected content cannot name a tool that does not exist. This is
  the primary defense, stronger than a runtime refusal.
- Authenticated reads remain available without the write flag. Notifications are
  themselves an injection channel, but with no mutation tools present the model
  cannot act on injected instructions; the envelope (3.2) + annotations (3.3)
  cover the residual "model is misled in its summary" risk.
- The flag is read in `config.ts` as `ENABLE_WRITES` and consumed in
  `registerTools` to decide whether `tools-mutate.ts` is wired in. Startup logs
  the active posture (`read-only` vs `writes-enabled`).

### 3.2 Untrusted-content envelope

A single helper replaces every ad-hoc `stripHtmlTags(...)` interpolation:

```ts
// src/utils/untrusted.ts
export function wrapUntrusted(text: string, source: string): string;
```

- Strips HTML (retain the existing iterative `stripHtmlTags`), then wraps the
  result in explicit, hard-to-spoof delimiters with a provenance note, e.g.:

  ```
  <untrusted-content source="bio of alice@mastodon.social">
  …stripped text…
  </untrusted-content>
  ```

- Applied to **all** remote-sourced strings: actor display name, summary/bio, post
  content, spoiler/CW text, notification bodies, search-result text — in
  `tools.ts`, `tools-auth-read.ts`, and `resources.ts`.
- Neutralizes the delimiter sequence if it appears inside the content (prevent the
  payload from closing the envelope early).
- This is a mitigation, not a cure — documented as such in SECURITY.md.

### 3.3 MCP tool annotations

Every tool gains `annotations`:

- Reads (public + authenticated): `{ readOnlyHint: true }`.
- Mutations: `{ readOnlyHint: false, destructiveHint: true, openWorldHint: true }`
  (delete/block/post are irreversible/outward-facing).

This lets MCP clients gate destructive verbs and never silently auto-approve them.

### 3.4 DNS-rebinding: make the claim true

`validateExternalUrl` currently resolves, checks, then hands the **hostname** to
`fetch`, which re-resolves independently — a TOCTOU window the code comments
wrongly describe as rebinding prevention.

- Resolve once, validate every returned address, then **pin** a validated address
  onto the actual connection via an undici `Agent` with a custom `lookup` (Host
  header and TLS servername preserved). All guarded fetches route through this.
- Make DNS validation **fail-closed**: an unexpected resolver error rejects the
  fetch rather than the current fail-open ("might be transient") path. `ENOTFOUND`
  remains a benign "host does not exist".
- Reword comments to match actual guarantees.

### 3.5 Honest docs

- New `SECURITY.md` (or expanded existing one) with the prompt-injection threat
  model, the three-tier model, the residual-risk statement, and guidance
  (keep writes off unless needed; review before enabling; client-side approval is
  the outer control).
- README security section rewritten to describe what *is* and *is not* defended;
  remove "Secure ✓ / input validation" overclaims and the implication that content
  warnings are a security control.

---

## 4. Scope trim — final surfaces

### 4.1 Tools removed entirely

`batch-fetch-actors`, `batch-fetch-posts`, `convert-url`, `recommend-instances`,
static `discover-instances`, `get-instance-software`, `health-check`,
`performance-metrics`, `export-timeline`, `export-thread`, `export-account-info`,
`export-hashtag`. Delete `src/mcp/tools-export.ts`.

Rationale: batch/convert/recommend are low-value or static; export is redundant
(the model renders fetched data to any format itself); get-instance-software folds
into get-instance-info; health/metrics are removed with the telemetry subsystems.

### 4.2 Tools consolidated

- **Search:** `search-instance`, `search-accounts`, `search-hashtags`,
  `search-posts` → fold into the unified `search` (`type: all|accounts|posts|hashtags`,
  optional `resolve`, optional `domain`). Remove the four standalone tools.
- **Public timelines:** `get-local-timeline` + `get-federated-timeline` →
  `get-public-timeline` with `scope: local|federated` (default `federated`).
- **Instance discovery:** `discover-instances-live` renamed to `discover-instances`
  (now the only one); keeps the instances.social live API.

### 4.3 Prompts

Keep a high-value core: `explore-fediverse`, `summarize-trending`,
`analyze-user-activity`, `compare-accounts`, `find-experts`. Drop
`community-health`, `compare-instances`, `content-strategy`, `discover-content`,
`migration-helper`, `thread-composer`.

### 4.4 Resources

Keep the 10 resources (idiomatic, URI-addressable, read-only), but route all
remote content through `wrapUntrusted`. No functional change beyond the envelope.

---

## 5. Transport & ops

- **Keep** stdio and HTTP `/mcp` (bearer auth, constant-time compare, ≥16-char
  secret requirement).
- **Harden HTTP**: enable the MCP SDK `StreamableHTTPServerTransport` options
  `enableDnsRebindingProtection: true` with `allowedHosts`/`allowedOrigins` derived
  from config.
- **Remove** the `/metrics` endpoint; **reduce** `/health` to a trivial
  `200 {"status":"ok"}` liveness check (no external probe subsystem).
- **Delete** `src/telemetry/performance-monitor.ts` and
  `src/telemetry/health-check.ts`; remove all `performanceMonitor.*` call sites and
  the perf/health env vars.
- **Keep** `audit/logger.ts`, rate limiter, instance blocklist, LRU cache,
  structured logging.

---

## 6. Documentation consolidation

- Move the Astro site under an isolated `site/` directory (astro config,
  `src/pages/docs`, `dist-site`, pagefind, `scripts/generate-og-image.js`,
  `scripts/generate-search-data.js`). The npm `files` allow-list already excludes
  the site (verified) — confirm after the move.
- **README → concise overview**: what it is, install (npx + Claude/Cursor config),
  the read-only-default / write-opt-in model with the `ACTIVITYPUB_ENABLE_WRITES`
  flag, one end-to-end example, a link to the docs site, and a short security note.
  All reference material (full tool list, env vars, guides) lives on the site.
- **Phase out the GitHub wiki**: replace wiki landing with a pointer to the site;
  disable wiki in repo settings (manual step, noted in plan).
- **Purge Fedify**: remove from `package.json` keywords, README stack &
  acknowledgments, and any architecture copy. It is not a dependency.
- Keep `docs/specifications/` LLM-readable spec mirrors as-is (they are reference
  data, not human guides).

---

## 7. Release

- **v3.0.0**, breaking.
- `MIGRATION-v3.md` (added to `package.json` `files`) documenting: the
  `ACTIVITYPUB_ENABLE_WRITES` opt-in; every removed/renamed/consolidated tool with
  its replacement; removed env vars (perf/health); the docs move; the new envelope
  and annotations (informational).
- Update `CHANGELOG.md`. Bump version in `package.json` and any embedded
  `SERVER_VERSION` defaults.

---

## 8. Testing

Test-first per change; remove tests for deleted features.

- **Tiering:** no flag → mutation tools absent from the registered list; flag +
  account → present; flag without account → present but error clearly.
- **Envelope:** `wrapUntrusted` output shape; delimiter-injection neutralization;
  remote content in tool/resource output is always wrapped.
- **Annotations:** every read has `readOnlyHint`; every mutation has
  `destructiveHint`.
- **DNS pinning:** validated IP is the one connected to; fail-closed on unexpected
  resolver error; `ENOTFOUND` still benign.
- **HTTP transport:** rebinding protection rejects disallowed Host/Origin; `/metrics`
  gone (404); `/health` returns liveness; `/mcp` still bearer-gated.
- **Consolidation parity:** unified `search` covers the four old paths;
  `get-public-timeline` covers local + federated.
- Update README/example assertions and the server-info capabilities snapshot.

---

## 9. Build order (for the implementation plan)

1. Security core (3.1–3.4) — tiering, envelope, annotations, DNS pinning. *Highest value, do first.*
2. Scope trim (§4) + telemetry removal (§5) — delete dead code, consolidate tools.
3. Transport hardening (§5).
4. Docs consolidation (§6) + honest security docs (3.5).
5. Release scaffolding (§7) — migration guide, changelog, version bump.

Each step lands with its tests and a green `npm run test` + `typecheck` + `lint`.
