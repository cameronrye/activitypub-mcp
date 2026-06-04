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
matching `mcpName`. No 3.x has ever shipped to npm (`latest` is `2.2.0`; the
`v3.0.0` tag was created but never published), so `3.0.1` is the first tarball
to carry `mcpName`. **It must be live on npm before you register** — the
registry has nothing to validate against otherwise.

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

### Automating it (the CI path)

[`publish-mcp.yml`](../.github/workflows/publish-mcp.yml) does this in CI with
**no stored secret** — it authenticates with GitHub Actions OIDC
(`mcp-publisher login github-oidc`), which the registry maps to the repo owner's
identity to authorize the `io.github.cameronrye/*` namespace. It is
`workflow_dispatch`-only and kept **separate** from `release.yml` on purpose:

```bash
# After the npm release for this version is live:
gh workflow run publish-mcp.yml
```

> **Why separate, not folded into `release.yml`:** a tag pushed by another
> workflow using `GITHUB_TOKEN` (e.g. `auto-release.yml`) will **not** trigger a
> separate `on: push: tags` workflow — GitHub's anti-recursion rule. The npm
> release is therefore dispatched by hand (`gh workflow run release.yml --ref
> vX.Y.Z`), and the registry publish is its own dispatchable job so a registry
> hiccup can never break the proven npm-release path, and so it can be re-run on
> its own. Before relying on the OIDC path, confirm the Actions OIDC subject for
> `cameronrye/activitypub-mcp` is authorized for the `io.github.cameronrye/*`
> namespace (it is owner-scoped, so it should be).

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

1. ✅ Claimed at [glama.ai](https://glama.ai) via GitHub OAuth (`cameronrye`).
   Glama indexes the listing as `hn4391ubvo` (`glama.ai/mcp/servers/cameronrye/activitypub-mcp`).
2. ✅ [`glama.json`](../glama.json) committed at repo root (`maintainers: ["cameronrye"]`).
   Re-run the claim flow to re-sync after edits (there is no automatic re-sync).
3. ✅ Set the Glama **build spec** to run the published npm package. Glama does
   **not** use the repo's `Dockerfile` — its managed builder uses its own base
   image (`debian:trixie-slim` + Node 26 + `mcp-proxy` + pnpm/uv), `git clone`s
   the repo, runs `mcp-proxy -- <cmdArguments>`, and does **not** run
   `npm install` / `npm run build` — so there is no `dist/` in the container to
   point at. Run the prebuilt npm package instead, from a neutral directory
   (plain `npx` inside the cloned repo resolves the same-named local
   `package.json` and fails with `activitypub-mcp: command not found`):

   ```json
   "cmdArguments": ["mcp-proxy", "--", "sh", "-c", "cd /tmp && exec npx -y activitypub-mcp"]
   ```

   Sturdier alternative — bake the package into the image so there is no download
   on each cold start, and run the global bin (on `PATH`, so no repo collision):

   ```json
   "buildSteps":   ["npm install -g activitypub-mcp"],
   "cmdArguments": ["mcp-proxy", "--", "activitypub-mcp"]
   ```

   Gotchas: a `debian:trixie-slim ... context deadline exceeded` build error is a
   transient Docker Hub timeout on Glama's builder — just retry. The public Glama
   API/listing lags a successful deploy by a while before it shows the hosted
   state and enumerates tools. **Final step: once the deploy's checks pass,
   "Make Release" to turn on the install button + hosted SSE/Streamable-HTTP URL.**
4. Tighten every tool + parameter description: lead with read-only intent and
   explicitly flag the write tools as gated behind `ACTIVITYPUB_ENABLE_WRITES`.
   This both communicates the security posture and raises the ~70% score — and it
   is the **single biggest Glama lever still in our control** (70% of the score).

> The repo's [`Dockerfile`](../Dockerfile) is **not** used by Glama (it builds its
> own image). It remains as a generic self-host image — `docker build -t
> activitypub-mcp . && docker run --rm -i activitypub-mcp` runs the stdio server
> for anyone wiring it into their own container stack.

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

The manifest is committed at [`manifest.json`](../manifest.json) (manifest
version `0.2`, validated by `mcpb`). It models the read-only default as a
`user_config` boolean so the **install dialog makes read-only the explicit
default** and any write access an explicit opt-in (`ACTIVITYPUB_ENABLE_WRITES`
maps to the `enable_writes` toggle, default `false`).

Reproducible build of a **self-contained** bundle (the entrypoint is ESM, so the
bundle must carry a `package.json` with `"type":"module"` plus production
`node_modules`, or Node loads `dist/*.js` as CommonJS and the imports fail):

```bash
npm install -g @anthropic-ai/mcpb
npm run clean && npm run build               # produce dist/
stage=$(mktemp -d)
cp manifest.json package.json package-lock.json "$stage"/
cp -R dist "$stage"/dist
( cd "$stage" && npm ci --omit=dev --ignore-scripts )   # prod deps only
mcpb validate manifest.json
mcpb pack "$stage" activitypub-mcp-$(node -p 'require("./package.json").version').mcpb
```

The built bundle is attached to each GitHub Release (e.g. the
[v3.0.1 release](https://github.com/cameronrye/activitypub-mcp/releases/tag/v3.0.1))
for one-click install. You can also list the bundle in the official registry by
adding a second `packages[]` entry to `server.json` with `"registryType": "mcpb"`.

---

## 4. Recommended sequence

1. ✅ `mcpName` + `server.json` + contract test + version guard.
2. ✅ Released 3.0.1 (npm publish with `mcpName` → registry publish). The server
   is live in the registry, which seeds PulseMCP, mcp.so, and the
   modelcontextprotocol redirect downstream.
3. ✅ Built the `.mcpb` and attached it to the v3.0.1 release; committed
   `glama.json`; claimed the Glama listing and deployed its hosted container
   (npx build spec, §2). **Make Release in Glama's UI turns on the install button.**
4. ⏳ Tighten tool/parameter descriptions — the biggest remaining Glama-score
   lever and a win for every client.
5. ⏳ Confirm PulseMCP / mcp.so picked up the registry entry (≤ ~1 week).
6. Smithery last, only if there's demand (the `.mcpb` makes it lower-effort now).

---

## Open questions / risks (carried from research)

- **npm-first:** registry publish fails until a version with `mcpName` is live on
  npm; `3.0.1` is the first (no 3.x is on npm yet — `latest` is `2.2.0`).
- **Tag-trigger anti-recursion:** a `GITHUB_TOKEN`-pushed tag won't fire a
  separate `on: push: tags` workflow, so the npm release is dispatched manually
  and the registry publish lives in its own `workflow_dispatch` job
  ([`publish-mcp.yml`](../.github/workflows/publish-mcp.yml)).
- **OIDC namespace:** verify the Actions OIDC subject maps to
  `io.github.cameronrye/*` before relying on `login github-oidc`.
- **Unverified sync:** mcp.so's auto-sync from the registry and whether Smithery
  imports from it are both unconfirmed — treat those as manual.
- **`$schema` pin:** `server.json` pins the dated `2025-12-11` schema URL;
  maintainers have discussed dropping dated URLs. Re-validate at publish time
  (`mcp-publisher validate`).
