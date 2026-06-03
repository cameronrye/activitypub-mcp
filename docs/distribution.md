# Distribution runbook

How to get `activitypub-mcp` discovered and installed. The project's
engineering is well ahead of its reach: the binding constraint is
**distribution, not code**. This is the maintainer playbook for fixing that.

**Strategy in one line:** publish to the **official MCP Registry** — it is the
upstream that the big aggregators ingest from — and lead every listing with the
**read-only-by-default, security-first** story.

**Lead copy (reuse verbatim in every listing):**

> A lightweight Model Context Protocol server that lets an LLM explore and
> interact with the existing Fediverse — Mastodon, Misskey, Foundkey, Pleroma,
> and compatible servers. **Read-only by default; write tools are opt-in**
> (gated behind `ACTIVITYPUB_ENABLE_WRITES`). Untrusted fediverse content is
> wrapped in an `<untrusted-content>` envelope. See [SECURITY.md](../SECURITY.md).

---

## 0. Prerequisites and ordering — read this first

The two in-repo artifacts already exist:

- [`server.json`](../server.json) — the registry manifest (npm package, stdio
  transport, the read-only env-var story). Validates against the pinned
  `2025-12-11` schema.
- `mcpName` in [`package.json`](../package.json) — the ownership marker the
  registry uses to confirm we own the npm package. Must equal `server.json`'s
  `name`; the `server.json registry manifest` test and `npm run validate:version`
  keep both (and the version) in lock-step.

**Hard ordering constraint — the registry validates the _live_ npm tarball.**
The registry checks that the published npm package's `package.json` contains a
matching `mcpName`. The currently-published `activitypub-mcp@3.0.0` predates
`mcpName`, so **registry publish will fail until a new npm version ships with
it**. You cannot register against `3.0.0`.

So the sequence is:

1. Bump the version (e.g. `3.0.1`) — update `package.json`, `package-lock.json`
   (`npm install --package-lock-only`), `src/config.ts`, **and** `server.json`
   (both `version` and `packages[0].version`). `npm run validate:version`
   enforces all five agree.
2. `npm publish` the new version (the existing
   [`release.yml`](../.github/workflows/release.yml) does this with
   `--provenance --access public`). Now the live tarball carries `mcpName`.
3. Publish to the registry (§1). Everything downstream (§2) flows from there.

---

## 1. Official MCP Registry — highest leverage, do this first

Manual flow (one-time, from a clone):

```bash
# Install the publisher CLI
brew install mcp-publisher
# or: curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher

mcp-publisher validate                 # checks server.json against the schema
mcp-publisher login github             # device-code browser OAuth as `cameronrye`;
                                       # grants the io.github.cameronrye/* namespace
mcp-publisher publish                  # defaults to ./server.json
mcp-publisher status
# Confirm:
curl "https://registry.modelcontextprotocol.io/v0/servers?search=activitypub-mcp"
```

### Automating it (recommended)

Fold the registry publish into the **existing** `release.yml` job rather than a
new tag-triggered workflow. `release.yml` already runs on `v*` tags **and** has
a `workflow_dispatch` fallback, and already sets `id-token: write` (for npm
provenance) — the same permission `mcp-publisher login github-oidc` needs, so
there are **no new secrets** to store. Add these steps after the npm publish
step:

```yaml
      # --- Publish to the official MCP Registry (after npm publish) ---
      - name: Sync server.json version to the tag
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          tmp=$(mktemp)
          jq --arg v "$VERSION" '.version=$v | .packages[0].version=$v' server.json > "$tmp" && mv "$tmp" server.json
      - name: Install mcp-publisher
        run: curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher
      - name: Publish to MCP Registry (OIDC, no stored secret)
        run: |
          ./mcp-publisher login github-oidc
          ./mcp-publisher publish
```

> **Gotcha (matches the release-tag `GITHUB_TOKEN` note in project memory):** a
> tag pushed by another workflow using `GITHUB_TOKEN` (e.g. `auto-release.yml`)
> will **not** trigger a separate `on: push: tags` workflow — GitHub's
> anti-recursion rule. Folding into `release.yml` (which is also manually
> re-runnable via `workflow_dispatch`) sidesteps this. Before relying on CI,
> confirm the GitHub Actions OIDC subject for `cameronrye/activitypub-mcp` is
> authorized for the `io.github.cameronrye/*` namespace.

---

## 2. Aggregators — mostly downstream of the registry

| Platform | How it ingests | Action | Effort |
| --- | --- | --- | --- |
| **PulseMCP** | Auto-ingests from the official registry (daily ingest, **weekly** processing → up to ~1 week latency) | Publish to the registry, wait. [pulsemcp.com/submit](https://www.pulsemcp.com/submit) to expedite/adjust | low |
| **mcp.so** | Aggregator directory; ecosystem pattern is to sync from the registry (its own sync policy is **unverified**) | After registry publish, check for the listing; use mcp.so's submit page if absent | low |
| **modelcontextprotocol/servers** | The README **no longer keeps a community list** — it now points readers to the MCP Registry | Nothing extra: the registry publish **is** this listing now. Do **not** open a community-list PR | none |
| **Glama** | Auto-indexes public GitHub MCP repos; likely already indexed | **Claim** it (below) + tighten tool descriptions | low |
| **Smithery** | No npm/registry import path for stdio servers | Lowest priority — see below | high |

### Glama — claim and optimize (best effort-to-reach ratio)

Glama scores listings **~70% on tool-definition quality**, 30% on coherence —
earned by the tool/parameter descriptions we already control, not by hosting.

1. Sign in to [glama.ai](https://glama.ai) with GitHub (`cameronrye`) and claim
   `https://glama.ai/mcp/servers/cameronrye/activitypub-mcp` via OAuth (a
   personal repo claims with OAuth alone).
2. Optionally commit a `glama.json` at repo root to lock metadata, then **re-run
   the claim flow** to trigger a re-sync (there is no automatic re-sync after
   edits):

   ```json
   { "$schema": "https://glama.ai/mcp/schemas/server.json", "maintainers": ["cameronrye"] }
   ```
3. Tighten every tool + parameter description: lead with read-only intent and
   explicitly flag the write tools as gated behind `ACTIVITYPUB_ENABLE_WRITES`.
   This both communicates the security posture and raises the score.

### Smithery — defer (highest effort, lowest marginal reach)

Raw stdio hosting was deprecated (Sep 2025) and Smithery does not import from the
official registry. The two viable routes are both heavy for this server:

- **MCPB bundle** — reuse the `.mcpb` from §3 and publish via `smithery.ai/new`.
  Lowest-friction Smithery path, but depends on the bundle existing first.
- **`runtime: typescript` + `target: local`** (Beta) — requires the entrypoint
  to **export a Smithery-SDK config schema**, which `dist/mcp-main.js` does not.
  Confirm `target: local` still exists before investing.

Do this last, if at all.

---

## 3. Claude Desktop Extension (`.mcpb`) — one-click local install

A `.mcpb` bundle (a zip of `manifest.json` + server code; the format formerly
called `.dxt`) installs into Claude for macOS/Windows with a double-click —
Claude ships its own Node runtime.

```bash
npm install -g @anthropic-ai/mcpb
mcpb init        # or hand-write manifest.json (below)
npm run build    # dist/ must exist; vendor node_modules for a self-contained bundle
mcpb validate
mcpb pack        # → activitypub-mcp.mcpb
```

Attach the `.mcpb` to GitHub Releases for one-click install. Model the
read-only default as a `user_config` boolean so the **install dialog makes
read-only the explicit default** and any write access an explicit opt-in:

```json
{
  "manifest_version": "0.3",
  "name": "activitypub-mcp",
  "version": "3.0.0",
  "description": "Security-first, read-only-by-default MCP server for ActivityPub and the Fediverse.",
  "author": { "name": "Cameron Rye" },
  "server": {
    "type": "node",
    "entry_point": "dist/mcp-main.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/dist/mcp-main.js"],
      "env": {
        "MCP_TRANSPORT_MODE": "stdio",
        "ACTIVITYPUB_ENABLE_WRITES": "${user_config.enable_writes}",
        "LOG_LEVEL": "${user_config.log_level}"
      }
    }
  },
  "user_config": {
    "enable_writes": {
      "type": "boolean",
      "title": "Enable write / mutation tools",
      "description": "Leave OFF for safe read-only use. Turning this on lets the LLM post, reply, follow, boost, and block. Read SECURITY.md first.",
      "default": false
    },
    "log_level": { "type": "string", "title": "Log level", "default": "info" }
  }
}
```

You can also list the bundle in the official registry by adding a second
`packages[]` entry to `server.json` with `"registryType": "mcpb"`.

---

## 4. Recommended sequence

1. ✅ `mcpName` + `server.json` + contract test + version guard (done, this branch).
2. Cut the next release (bump version → npm publish with `mcpName` → registry
   publish). This alone seeds PulseMCP, mcp.so, and the modelcontextprotocol
   redirect.
3. Claim Glama (~5 min) and tighten tool descriptions; optionally add `glama.json`.
4. Build the `.mcpb` and attach it to the release for one-click Desktop install.
5. Smithery last, only if there's demand.

---

## Open questions / risks (carried from research)

- **npm-republish-first:** registry publish fails until a version with `mcpName`
  is live on npm (current `3.0.0` lacks it).
- **Tag-trigger anti-recursion:** a `GITHUB_TOKEN`-pushed tag won't fire a
  separate `on: push: tags` workflow — fold publish into `release.yml`.
- **OIDC namespace:** verify the Actions OIDC subject maps to
  `io.github.cameronrye/*` before relying on `login github-oidc`.
- **Unverified sync:** mcp.so's auto-sync from the registry and whether Smithery
  imports from it are both unconfirmed — treat those as manual.
- **`$schema` pin:** `server.json` pins the dated `2025-12-11` schema URL;
  maintainers have discussed dropping dated URLs. Re-validate at publish time
  (`mcp-publisher validate`).
