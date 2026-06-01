# ActivityPub MCP — Website & Brand Overhaul Design Spec

This document specifies a complete website and brand overhaul for `activitypub-mcp` (v3.0.0), an MCP (Model Context Protocol) server that connects LLMs (Claude, ChatGPT, and other MCP clients) to the Fediverse via ActivityPub and WebFinger. The current Astro site under `./site` — deployed to GitHub Pages at base `/activitypub-mcp` on origin `https://cameronrye.github.io` — reads as dated and AI-generated (indigo→purple gradient, Inter, a glowing center-node logo) and carries stale capability counts and version numbers. This overhaul replaces the brand identity (warm paper/vermilion/teal palette, self-hosted Bricolage Grotesque / Hanken Grotesk / JetBrains Mono, a new crossing-arcs logo), migrates the 26 hand-authored `.astro` docs pages into a typed MDX content collection consolidated to 20 definitive pages, rebuilds the homepage around an approved Hero B layout with a build-derived capabilities section, and makes the site the single source of truth for both documentation and brand. All existing build/deploy infrastructure (Pagefind search, `@astrojs/sitemap`, `generate-search-data.js`, `.well-known` preservation, the `/activitypub-mcp` base path, and the no-FOUC theme script) must continue to work unchanged in behavior.

This spec describes a prospective design: several artifacts it depends on (the `site/src/` source tree, `site/src/content.config.ts`, the dual-theme Shiki config, the three `@fontsource` packages, and `scripts/generate-registry-manifest.js`) do not yet exist in the repository and are created by the phases in §9. The current layouts and components live under `site/layouts/` and `site/components/` (not `site/src/...`), per the surface audit; the migration introduces `site/src/content/` for collections and `site/src/pages/` for new routes while preserving the existing pipeline. The `public/` asset directory is at the **repository root** (`/Users/cameron/Developer/activitypub-mcp/public/`), not `site/public/`; all asset targets in this spec refer to that repo-root `public/`.

---

## 1. Goals & Non-Goals

### Goals

- **Escape the dated/AI-generated look.** Replace the indigo→purple gradient, Inter typography, and glowing network-node logo with the locked warm brand system (paper/vermilion/teal/gold/ink/clay; Bricolage Grotesque + Hanken Grotesk + JetBrains Mono; crossing-arcs logo with four corner dots).
- **Make the site the source of truth for documentation and brand.** All docs live as typed MDX in a content collection; all brand assets (favicon, logo SVGs, OG image, README header, `theme-color`) derive from one locked token system.
- **Eliminate drift.** Capability counts (tools/resources/prompts) and the version badge are derived at build time from the actual source registry, never hardcoded. No stale `53/10/11` or `v2.0.0` may survive.
- **Tidy information architecture.** Consolidate redundant and orphaned docs pages from 26 on-disk pages down to 20 definitive pages, organized into six groups with a sidebar generated from the collection rather than a hand-maintained array.
- **Ship light + dark theming** with an ink dark variant, a logo dot-flip on dark, a theme toggle (light/dark/system), and a no-FOUC inline script.
- **Preserve the build/deploy pipeline** (Astro 5.x, Pagefind, sitemap, fallback search JSON, `.well-known` handling, GitHub Pages base path).

### Non-Goals

- No change to the MCP server runtime, its tools/resources/prompts, or its TypeScript source — except adding a build-time, read-only manifest generator script (`scripts/generate-registry-manifest.js`) that reads the existing registry.
- No migration to Astro 6 (which would force the `render(entry)`-only content API). We stay within the 5.x major and apply at most a patch/minor update.
- No adoption of a third-party docs theme (e.g., Starlight); we reskin and rebuild the existing custom layouts.
- No new docs content authored from scratch beyond the merges/consolidations described here; this is a migration and reskin, not a rewrite of subject matter.
- No backend, CMS, or dynamic server — the site remains a static GitHub Pages deployment.
- No redirect infrastructure for old docs URLs is in scope beyond what is explicitly listed in §4 (the dropped pages and consolidations).

---

## 2. Brand System

### 2.1 Color palette (exact hex)

| Token | Hex | Role |
|---|---|---|
| Paper | `#FBF7F0` | Primary light background, dark-mode text |
| Vermilion | `#E8552D` | Primary brand / CTA / links / `theme-color` |
| Pine-teal | `#2F7D6B` | Secondary brand / accents / secondary CTAs |
| Gold | `#F4B740` | Accent / highlights / one logo dot |
| Ink | `#1A1714` | Primary text, dark-mode surfaces, one logo dot |
| Warm clay | `#C2643A` | Tertiary / hover/muted brand tone |

Derived neutrals and states (computed from the palette, fixed here so there are no TBDs):

- Light border: `#E0DDD8`. Dark border: `#332E29`.
- Muted light text: `#5A534C`. Muted dark text: `#C9C2B8`.
- Subtle light surface (cards/code): `#F3EDE3`. Subtle dark surface: `#231F1B`.
- Semantic colors are retained from the current site and re-toned to read on paper/ink: success `#2F7D6B` (reuse pine-teal), warning `#F4B740` (reuse gold), error `#C0392B`, info `#2F7D6B`. Keep these as their own variables so semantic meaning is decoupled from brand.

**Dark mode rule:** the current site's dark mode uses gray-family tokens (`--color-gray-800`/`--color-gray-900`); this overhaul replaces that with the ink/paper system. In dark mode, surfaces become ink-family (`--bg-primary: #1A1714` background, `--bg-raised: #231F1B` raised), text becomes paper (`--text-primary: #FBF7F0`), muted text becomes `#C9C2B8`, borders become `#332E29`, and vermilion stays the primary accent (it has sufficient contrast on ink). The logo's ink dot flips to paper (see §2.3). This is a complete theme rewrite, executed in Phase 2; the exact dark hex values above are normative.

### 2.2 Type roles & self-hosted font packages

The current `BaseLayout` loads Inter via a Google Fonts `<link>` tag (around lines 146–148). Drop that `<link>` entirely. Self-host via `@fontsource`. These three packages are **not currently in `package.json`**; installing them is a prerequisite change (Phase 1, deliverable #1), not an optional upgrade:

- **Display** (`--font-display`): `@fontsource/bricolage-grotesque` — used for `h1`–`h6`, hero headline, section headings, logo wordmark. Import weights `400` and `700`.
- **Body** (`--font-body`): `@fontsource/hanken-grotesk` — used for `body`, paragraphs, nav, UI. Import weights `400` and `600`.
- **Code** (`--font-mono`): `@fontsource/jetbrains-mono` — used for `code`, `pre`, install snippets, inline tokens. Import weights `400` and `600`.

Install:

```
npm install @fontsource/bricolage-grotesque @fontsource/hanken-grotesk @fontsource/jetbrains-mono
```

Create `site/src/styles/fonts.css` importing the six weight stylesheets above and import it from `BaseLayout` **before the no-FOUC theme script and any theme-dependent CSS** so fonts are present at first paint and no flash of unstyled text occurs. Fallbacks: `--font-display` and `--font-body` fall back to `system-ui, sans-serif`; `--font-mono` falls back to `ui-monospace, monospace`. Because fonts are bundled, no external font origin is contacted at runtime (improves privacy, removes the render-blocking Google Fonts request, and is the reason for dropping Inter).

### 2.3 Logo geometry & variants

The mark is **two crossing arcs over four corner dots, with no center node** (the center node is the dated element being removed):

- **Arcs:** two arcs cross near the geometric center. One arc is vermilion (`#E8552D`), one is pine-teal (`#2F7D6B`). They form an "X"-like cross of curved strokes; stroke caps rounded.
- **Four corner dots** (fixed assignment):
  - Bottom-left dot: **vermilion** `#E8552D`
  - Top-right dot: **pine-teal** `#2F7D6B`
  - Top-left dot: **ink** `#1A1714`
  - Bottom-right dot: **gold** `#F4B740`
- **No center node.**
- **Inverse / dark variant:** the **ink top-left dot flips to paper** `#FBF7F0` so it reads on dark/ink backgrounds; all other colors stay. This is the dot-flip referenced throughout.
- **Favicon legibility:** all four dots and both arcs must remain distinguishable down to ~20px. At favicon sizes, thicken arc strokes proportionally and keep dot radii ≥ ~2px in the 32px artboard so they do not vanish.

Variants to produce (see §7 for file targets):
- `logo.svg` — full-color mark on transparent background (light-surface default).
- Dark-variant rendering — achieved either by an inverse SVG or by CSS that swaps the ink dot fill to paper under `[data-theme='dark']`; the spec mandates the **CSS dot-flip approach for the inline header mark** (one SVG, fill of the flipping dot driven by the `--logo-dot-flip` CSS variable) and a **dedicated inverse SVG for any raster/OG contexts** where CSS cannot apply.
- `logo-monochrome.svg` — single-color (`currentColor`) silhouette of arcs + dots for contexts needing one ink color (e.g., print, low-color favicons, README on arbitrary backgrounds).
- `favicon.svg` — four-dot + arcs design tuned for small sizes. The current `public/` contains only `favicon.svg` (there is no `favicon.png` today); a rasterized PNG fallback is **optional** and only produced if a PNG is later required for a specific platform target — it is not assumed to exist.

### 2.4 Design-token CSS variable plan

Define all brand tokens once at `:root` and remap a small set of semantic aliases under `[data-theme='dark']`. Brand tokens never change between themes; only the semantic aliases (`--bg-*`, `--text-*`, `--border-*`, `--surface-*`) flip. This is the single mechanism that drives both theme and the logo dot-flip.

The current `main.css` uses a different token scheme (`--color-primary`, `--color-secondary`, blue/purple/cyan values, `--text-primary` as a gray, etc.). This overhaul **renames and remaps the entire color block** to the tokens below, and every downstream literal color reference is rewritten to use them (see §6). The `data-theme` attribute supports three user states from the existing `ThemeToggle` — `light`, `dark`, and `system` — persisted in `localStorage`. To make `system` resolve correctly without JS, the dark aliases are applied both for the explicit `[data-theme='dark']` selector **and** for the system selector under a `prefers-color-scheme: dark` media query, as shown below.

```css
:root {
  /* Brand tokens — constant across themes */
  --color-paper:      #FBF7F0;
  --color-vermilion:  #E8552D;
  --color-pine-teal:  #2F7D6B;
  --color-gold:       #F4B740;
  --color-ink:        #1A1714;
  --color-clay:       #C2643A;

  /* Type roles */
  --font-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --font-body:    'Hanken Grotesk', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  /* Semantic aliases — light defaults */
  --bg-primary:    var(--color-paper);
  --bg-raised:     #F3EDE3;
  --text-primary:  var(--color-ink);
  --text-muted:    #5A534C;
  --border-color:  #E0DDD8;
  --accent:        var(--color-vermilion);
  --accent-2:      var(--color-pine-teal);
  --accent-3:      var(--color-gold);

  /* Logo flipping dot */
  --logo-dot-flip: var(--color-ink);

  /* Semantic state colors */
  --color-success: #2F7D6B;
  --color-warning: #F4B740;
  --color-error:   #C0392B;
}

/* Dark aliases — applied for explicit dark, and for system via the media query below */
[data-theme='dark'] {
  --bg-primary:    var(--color-ink);
  --bg-raised:     #231F1B;
  --text-primary:  var(--color-paper);
  --text-muted:    #C9C2B8;
  --border-color:  #332E29;
  --logo-dot-flip: var(--color-paper);
}

@media (prefers-color-scheme: dark) {
  [data-theme='system'] {
    --bg-primary:    var(--color-ink);
    --bg-raised:     #231F1B;
    --text-primary:  var(--color-paper);
    --text-muted:    #C9C2B8;
    --border-color:  #332E29;
    --logo-dot-flip: var(--color-paper);
  }
}
```

(The no-FOUC inline script in §3.5 may alternatively resolve `system` to a concrete `light`/`dark` value before first paint and set `data-theme` accordingly, in which case only the `[data-theme='dark']` block is needed at runtime. Either approach is acceptable as long as all three states render correctly and without flash; the media-query fallback above guarantees correct system rendering even if the script is bypassed.)

Existing structural variables in `main.css` (spacing scale, z-index layers, transition durations, max-width/container, breakpoints) are **kept as-is**; only the color and font-family blocks (current `main.css` color block, approximately lines ~1–216) and every literal color reference downstream are rewritten to use these tokens. The logo's flipping dot fill is bound to `--logo-dot-flip` so the dark dot-flip happens automatically with no JS.

---

## 3. Tech & Architecture

### 3.1 Astro version

- The repository is already on Astro `^5.15.8` (the latest 5.x line). **Keep Astro within the 5.x major.** Apply at most the latest 5.x patch/minor update if one is available for bug/security fixes; do **not** introduce a `^6` change. There is no functional "bump" required to reach the needed feature set — the `render(entry)` standalone function is already available in `5.15.8`.
- Adopt the **v6-forward content pattern now** — `import { render } from 'astro:content'` and call `render(entry)` rather than the deprecated `entry.render()` — so the codebase is ready for an eventual Astro 6 upgrade without taking that upgrade in this overhaul. Keep `@astrojs/mdx`, `@astrojs/sitemap`, and `pagefind` at their compatible 5.x-era versions.

### 3.2 Content-collection paths (resolved gotcha)

`astro.config.mjs` lives at the **repository root** and sets `srcDir: "./site"`. Because of this, the `site/` directory becomes the Astro source root; Astro resolves the reserved content directory as `{srcDir}/src/content/`, i.e. `site/src/content/` relative to the repo. Note that `site/src/` does **not** exist today — it is created by this migration. **Resolved decision** (this is the gotcha the research flagged):

- Collection config: `site/src/content.config.ts` (NOT `site/content.config.ts`, NOT repo-root `src/...`). This file is **new**, created in Phase 3; the schema below is correct per Astro 5.x conventions but is not yet committed.
- Content files: `site/src/content/docs/**/*.mdx`.
- Dynamic route: `site/src/pages/docs/[...slug].astro` (new).
- Existing layouts/components currently live at `site/layouts/*` and `site/components/*`. New collection-driven files are introduced under `site/src/...`. The two locations coexist (Astro resolves layouts by import path); we do **not** need to relocate the existing `site/layouts` and `site/components` directories, but new route/collection files must live under `site/src/`. Imports from `site/src/pages/...` into `site/layouts/...` use relative paths (see the exact depth in §3.3).
- Verify the resolved layout with a single placeholder MDX entry before bulk migration (see Phase 3), since a misplaced config/content path silently yields an empty collection.

`site/src/content.config.ts` (new file):

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    group: z.enum([
      'Getting Started', 'Guides', 'API Reference',
      'Reference', 'Development', 'Specifications',
    ]),
    order: z.number().int(),
    section: z.string().optional(),
  }),
});

export const collections = { docs };
```

The `group` and `order` fields drive sidebar grouping and ordering; `glob`'s `base` is relative to `srcDir` (`./site`), resolving to `site/src/content/docs`.

### 3.3 One dynamic route

A single `site/src/pages/docs/[...slug].astro` (new) renders every doc entry. It uses `getStaticPaths()` to map collection entries to slugs and the standalone `render(entry)` function to get `Content` and `headings`:

```astro
---
import { getCollection, render } from 'astro:content';
import DocsLayout from '../../../layouts/DocsLayout.astro';

export async function getStaticPaths() {
  const docs = await getCollection('docs');
  return docs.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { Content, headings } = await render(entry);
---
<DocsLayout {entry} {headings}>
  <Content />
</DocsLayout>
```

Slug derivation uses the collection entry `id`, which the glob loader sets from the file path relative to `base`, e.g. `getting-started/installation`. The relative import path `../../../layouts/DocsLayout.astro` resolves from `site/src/pages/docs/` up to `site/layouts/` — confirm this depth against the actual on-disk location during implementation (three `../` segments climb `docs/` → `pages/` → `src/` to reach `site/`, then descend into `layouts/`).

### 3.4 Collection-driven sidebar/TOC

The hand-maintained `_docsNav` array in `DocsLayout.astro` is **deleted**. `DocsLayout` (or a `Sidebar` component it renders) calls `getCollection('docs')`, groups entries by `data.group` (ordered per the canonical group list in §4), sorts within each group by `data.order`, and renders the navigation. Active-link state is computed from the current `Astro.url.pathname`. The in-page TOC renders from the `headings` prop produced by `render(entry)`, filtered to `depth <= 3` (h2/h3). No navigation data is hand-maintained anywhere after migration.

### 3.5 Light/dark

Theme is controlled by `html[data-theme]` with values `light`/`dark`/`system` driven by the existing `ThemeToggle` and persisted in `localStorage`. A no-FOUC inline `<script is:inline>` in the `BaseLayout` `<head>` reads `localStorage.theme` (falling back to `prefers-color-scheme`) and sets `data-theme` before first paint. The token plan in §2.4 makes all theming a CSS-variable swap — including the logo dot-flip — and covers all three states (with the `prefers-color-scheme` media-query fallback for `system`).

### 3.6 Build pipeline preserved

All of `astro.config.mjs` is kept, including: `site`, `base: "/activitypub-mcp"`, `srcDir: "./site"`, `outDir: "./dist-site"`, `build.assets: "assets"`, the `vite.build.rollupOptions.output.assetFileNames` `.well-known` preservation rule, and the existing `vite.server.headers` block that sets the `Content-Type: text/plain; charset=utf-8` MIME header for `/.well-known/security.txt` in dev (this block exists in the current config and is retained). **One config change** is required: upgrade `markdown.shikiConfig` from the current single `theme: "github-dark"` to dual themes so code blocks track light/dark. This is a **new change** (Phase 3), not a current config state. Exact replacement:

```js
markdown: {
  shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, wrap: true },
}
```

The `build:site` script is updated (see §5.1) to run the new manifest generator first; `dev:site` / `preview:site` / `generate:og-image` scripts are unchanged in command, only validated to keep working.

---

## 4. Information Architecture & Docs Migration

The migration converts the **26 on-disk `.astro` docs pages** into **20 definitive MDX pages** (a 23% reduction) across six groups. Canonical group order: **Getting Started → Guides → API Reference → Reference → Development → Specifications**. Every current page is accounted for with an action of keep, merge-target, merge-into, or drop.

### 4.1 Migration table

| Current path | Title | Action | Target slug | Group | Order |
|---|---|---|---|---|---|
| `/site/pages/docs/index.astro` | Documentation Home | **drop** | — | (Navigation) | — |
| `/site/pages/docs/setup/index.astro` | Installation & Setup | **keep** | `getting-started/installation` | Getting Started | 1 |
| `/site/pages/docs/setup/claude-desktop.astro` | Claude Desktop (Simplified) | **merge-into** | `getting-started/claude-desktop` | Getting Started | 2 |
| `/site/pages/docs/setup/claude-desktop-integration.astro` | Claude Desktop (Full) | **merge-target** | `getting-started/claude-desktop` | Getting Started | 2 |
| `/site/pages/docs/setup/config-guide.astro` | Configuration Guide | **merge-into** | `getting-started/configuration` | Getting Started | 3 |
| `/site/pages/docs/setup/configuration-options.astro` | Configuration Options (Detailed) | **merge-target** | `getting-started/configuration` | Getting Started | 3 |
| `/site/pages/docs/setup/cross-platform.astro` | Cross-Platform Setup | **keep** | `getting-started/cross-platform` | Getting Started | 4 |
| `/site/pages/docs/guides/basic-usage.astro` | Basic Usage Guide | **keep** | `guides/basic-usage` | Guides | 1 |
| `/site/pages/docs/guides/examples.astro` | Practical Examples | **merge-target** | `guides/examples` | Guides | 2 |
| `/site/pages/docs/guides/practical-examples.astro` | Practical Examples (Research-Focused) | **merge-into** | `guides/examples` | Guides | 2 |
| `/site/pages/docs/guides/fediverse-exploration.astro` | Fediverse Exploration | **keep** | `guides/fediverse-exploration` | Guides | 3 |
| `/site/pages/docs/guides/usage-guide.astro` | Advanced Workflows & Best Practices | **merge-into** | `guides/advanced-workflows` | Guides | 4 |
| `/site/pages/docs/guides/real-world-test-scenario.astro` | Real-World Test Scenarios | **merge-target** | `guides/advanced-workflows` | Guides | 4 |
| `/site/pages/docs/api/tools.astro` | MCP Tools Reference | **keep** | `api/tools` | API Reference | 1 |
| `/site/pages/docs/api/resources.astro` | MCP Resources Reference | **keep** | `api/resources` | API Reference | 2 |
| `/site/pages/docs/api/prompts.astro` | MCP Prompts Reference | **keep** | `api/prompts` | API Reference | 3 |
| `/site/pages/docs/troubleshooting.astro` | Troubleshooting Guide | **keep** | `reference/troubleshooting` | Reference | 1 |
| `/site/pages/docs/changelog.astro` | Changelog | **keep** | `reference/changelog` | Reference | 2 |
| `/site/pages/docs/development/architecture.astro` | Architecture Overview | **keep** | `development/architecture` | Development | 1 |
| `/site/pages/docs/development/dependency-management.astro` | Dependency Management | **keep** | `development/dependencies` | Development | 2 |
| `/site/pages/docs/development/performance-monitoring.astro` | Performance Monitoring | **keep** | `development/performance` | Development | 3 |
| `/site/pages/docs/development/security-audit-checklist.astro` | Security Audit Checklist | **keep** | `development/security` | Development | 4 |
| `/site/pages/docs/specifications/activitypub-llm-specification-guide.astro` | ActivityPub Protocol Guide | **keep** | `specifications/activitypub` | Specifications | 1 |
| `/site/pages/docs/specifications/webfinger-llm-specification-guide.astro` | WebFinger Discovery Guide | **keep** | `specifications/webfinger` | Specifications | 2 |
| `/site/pages/docs/specifications/activitystreams-vocabulary-llm-specification-guide.astro` | ActivityStreams Vocabulary Guide | **keep** | `specifications/activitystreams` | Specifications | 3 |
| `/site/pages/docs/specifications/fedify-cli-llm-specification-guide.astro` | Fedify CLI Guide | **drop** | — | (Specifications) | — |

**Final tallies (must sum to the 26 on-disk pages):** keep = 16, merge-target = 4, merge-into = 4 (absorbed into the merge-targets), drop = 2 (`docs/index.astro` and `specifications/fedify-cli-llm-specification-guide.astro`). `16 + 4 + 4 + 2 = 26`. Resulting distinct MDX pages = keep (16) + merge-targets (4) = **20**. Note: `setup/index.astro` is **kept** (it carries the actual install guide, remapped to `getting-started/installation`), not dropped; there is **no** `guides/index.astro` or other pure listing stub in the repository, so no such stub is dropped.

### 4.2 Consolidations (explicit)

1. **Claude Desktop (2→1):** `setup/claude-desktop.astro` (simplified) + `setup/claude-desktop-integration.astro` (full) → `getting-started/claude-desktop`. Use the full page as the base; fold in any unique config-location or troubleshooting detail from the simplified page. Single authoritative integration guide.
2. **Configuration (2→1):** `setup/config-guide.astro` (layered overview) + `setup/configuration-options.astro` (exhaustive env-var reference) → `getting-started/configuration`. Use configuration-options as the target (it has the detailed env tables and perf tuning); prepend the layered overview (env vars / client config / CLI args) from config-guide.
3. **Practical Examples (2→1):** `guides/examples.astro` + `guides/practical-examples.astro` → `guides/examples`. Use examples as target; merge the research-scenario categories (climate/tech research, network/health analysis) from practical-examples so no scenario is lost.
4. **Advanced Workflows (2→1):** `guides/usage-guide.astro` (principles/best practices) + `guides/real-world-test-scenario.astro` (concrete scenarios/benchmarks/QA protocols) → `guides/advanced-workflows`. Use real-world-test-scenario as the structural target; integrate the principles, query techniques, and pitfalls from usage-guide.

### 4.3 Drops

There are exactly **two** drops:

- `docs/index.astro` — replaced by the collection-generated sidebar; the docs index becomes the rendered sidebar landing (the first Getting Started page, `getting-started/installation`, is the default docs entry). No hand-maintained hub page.
- `specifications/fedify-cli-llm-specification-guide.astro` — documentation for a related/loosely-coupled tool; dropped to reduce scope. Its content is not migrated.

`setup/index.astro` is **not** dropped — it is the install guide and is kept as `getting-started/installation`. No `guides/index.astro` or other pure listing-stub page exists in the repository, so there are no additional stub drops.

### 4.4 Frontmatter contract

Every MDX file carries `title`, `description`, `group`, `order`, and optional `section`, matching the Zod schema. The `group` value must be one of the six canonical groups exactly. Slugs are file paths relative to `site/src/content/docs` (e.g. `getting-started/installation.mdx` → `/activitypub-mcp/docs/getting-started/installation`).

---

## 5. Homepage Structure

The homepage (`site/src/pages/index.astro`, rebuilt) uses the approved **Hero B** layout and the following section order. All colors/typography use the §2 tokens; no generic icon-card aesthetic. The current homepage (`site/pages/index.astro`) shows a stale `v2.0.0` badge (around line 17) and stale `53/10/11` counts (around lines 26–28) while `package.json` is `3.0.0`; the rebuild eliminates these.

1. **Hero B (split):** copy left, logo-as-diagram right.
   - Left: version badge reading **v3.0.0** (derived from `package.json` at build time, see below), display-font headline, body subhead describing "an MCP server connecting LLMs to the Fediverse," and primary/secondary CTAs (Get Started → docs install page; View on GitHub).
   - Right: the new logo mark rendered large and used as the visual anchor that transitions into the "How it works" diagram.
2. **How it works** — a 3-node pipeline diagram:
   `LLM [Claude / ChatGPT] --MCP protocol--> activitypub-mcp server [logo mark] --ActivityPub / WebFinger--> Fediverse instance cluster [Mastodon / Misskey / …]`.
   Rendered as an inline SVG/CSS diagram using brand colors (vermilion/teal arcs echo the logo); the center node is the logo mark.
3. **Capabilities** — three figures with the **real build-derived counts**: **37 tools**, **10 resources**, **5 prompts** (see derivation below). Each figure links to its API reference page (`api/tools`, `api/resources`, `api/prompts`). No hardcoded numbers; the stale `53/10/11` must not appear anywhere.
4. **Key features** — restyled feature presentation (typographic/structured, **not** generic icon cards). Highlight the genuine differentiators: native ActivityPub + WebFinger discovery, multi-account/timeline/write tooling, LLM-optimized resources and prompts, TypeScript implementation, cross-platform install. Each feature is concrete (ties to real capabilities), not boilerplate.
5. **Quick install** — `npx activitypub-mcp install` with a copy button, plus Claude Desktop and ChatGPT/MCP client JSON config snippets, each with copy buttons. Snippets use the `--font-mono` token and dual-theme Shiki styling.
6. **Docs entry cards** — cards linking into the six docs groups (Getting Started, Guides, API Reference, Reference, Development, Specifications), each pointing at the group's first page.
7. **Footer** — reskinned three-column footer (brand + social, docs links, community links).

### 5.1 Build-derived counts (required)

Add a **new** build-time script **`scripts/generate-registry-manifest.js`** (it does not exist today) that:

- Reads the MCP registry source files. Based on the verified current source, **actual** registrations live in four files: `src/mcp/tools.ts` (9 tools) + `src/mcp/tools-write.ts` (28 tools) = **37 tools**; `src/mcp/resources.ts` = **10 resources**; `src/mcp/prompts.ts` = **5 prompts**. A fifth file, `src/mcp/capabilities.ts`, **registers nothing** — it *wraps* `registerTool`/`registerResource`/`registerPrompt` to instrument them (`.bind`, reassignment, type params), so its references to those method names are NOT registrations and must be **excluded**. The generator scans **all** files under `src/` (do not hardcode the file list, so future registrar files are picked up) but counts only true call-sites — lines containing `.registerTool(`, `.registerResource(`, or `.registerPrompt(` — and **excludes `src/mcp/capabilities.ts`** (or, equivalently, any wrapper-assignment line that is not an actual call).
- Extracts the counts and names from those `.registerTool(` / `.registerResource(` / `.registerPrompt(` call-sites (regex on the call form, or AST).
- Creates the `site/src/data/` directory if absent and writes `site/src/data/registry-manifest.json` with `{ tools, resources, prompts, toolNames, resourceNames, promptNames }`.
- Is committed to git as the checked-in source of truth and runs as the first step of `build:site` (and is runnable standalone).

The `package.json` `build:site` script is updated from its current value (`astro build && npx pagefind --site dist-site && node scripts/generate-search-data.js`) to:

```
node scripts/generate-registry-manifest.js && astro build && npx pagefind --site dist-site && node scripts/generate-search-data.js
```

The homepage Capabilities section and the API reference pages **read from this JSON** rather than hardcoding numbers. Phase 5 depends on the manifest generator existing and the `site/src/data/registry-manifest.json` file being committed before the homepage is wired to read it, so the build never references a missing file.

**Resolved count discrepancy (surfaced explicitly):** a naive occurrence-grep for `.registerTool` / `.registerResource` / `.registerPrompt` yields 42 / 15 / 10, but that **overcounts**: it matches the `src/mcp/capabilities.ts` instrumentation wrapper, which references each method name five times (`.bind`, reassignment, type params) while registering nothing. Counting only true call-sites (the `.registerX(` call form, excluding `capabilities.ts`) yields the correct **37 tools / 10 resources / 5 prompts** — tools = 9 (`tools.ts`) + 28 (`tools-write.ts`); 10 resources (`resources.ts`); 5 prompts (`prompts.ts`). This matches the AST-based count, which was correct. **Decision:** the build manifest generator is the single source of truth and must reproduce **37 / 10 / 5** against the current source; if it emits 42 / 15 / 10 it is wrongly counting the capabilities.ts wrapper and must be fixed. No count is ever hand-entered into a page. The version badge (`v3.0.0`) is likewise derived from `package.json` at build time, never hardcoded.

---

## 6. Components to Build / Rebuild / Keep

From the surface audit (current files are under `site/layouts/` and `site/components/`):

- **BaseLayout.astro** — *rebuild/reskin*: remove the Google Fonts/Inter `<link>` (around lines 146–148), import `fonts.css` + token CSS (fonts imported before the no-FOUC script), set `theme-color` meta to vermilion `#E8552D`, reskin header/footer to the brand, keep structure, no-FOUC script, structured data, and favicon links. Rewrite the entire color block of `main.css` from the current blue/purple/cyan scheme to the new paper/vermilion/teal/gold/ink/clay scheme, updating all downstream color references (e.g., `--color-primary` `#2563eb`/`#6366f1` → vermilion `#E8552D`, dark-mode grays → ink/paper per §2.1/§2.4). Swap logo asset references to the new SVGs.
- **DocsLayout.astro** — *rebuild*: delete the hand-maintained `_docsNav` array; render the sidebar from `getCollection('docs')` grouped/ordered per §4; accept `entry` + `headings` props; keep the two-column grid and active-link logic; reskin to brand tokens; render the TOC from `headings`.
- **Sidebar component (new)** — *build*: encapsulate collection-driven grouped navigation with active state (may be inlined in DocsLayout or extracted).
- **TableOfContents component (new)** — *build*: render in-page TOC from `headings` (h2/h3) with active-section highlighting.
- **CopyButton / CodeBlock wrapper (new)** — *build*: copy-to-clipboard control for the homepage install snippets and config blocks; works with dual-theme Shiki output.
- **Search.astro** — *keep + reskin*: preserve Pagefind integration, toggle/overlay UX, and keyboard handling; reskin input, dropdown, loading spinner, and results to brand tokens/focus states.
- **ThemeToggle.astro** — *keep + reskin*: preserve light/dark/system logic, `localStorage`, and system-preference listener; retone icons/button/dropdown from the current `--color-primary` to brand tokens.
- **SocialLinks.astro** — *keep + reskin*: preserve structure/variants/responsive logic; update hover colors from hardcoded `#333`/`#cb3837` to brand tokens.
- **SimpleSearch.astro** — *remove*: verified during this audit — the only references to `SimpleSearch` are its own internal class definition/instantiation inside `site/components/SimpleSearch.astro` (no layout or page imports it). It is confirmed unused. Re-run `grep -rn 'SimpleSearch' site/` at implementation time to re-confirm no import was added, then delete the file.
- **`[...slug].astro` route (new)** — *build*: the single dynamic docs route in §3.3.
- **Homepage `index.astro`** — *rebuild*: per §5 (becomes `site/src/pages/index.astro`).
- **`public/scripts/main.js`** — *keep*: mobile nav toggle, mobile search overlay, Pagefind binding, a11y keyboard handling — no logic changes; only CSS classes/selectors must stay stable.

---

## 7. Shared Brand Assets to Regenerate

All targets are in the **repository-root** `public/` directory (verified: `/Users/cameron/Developer/activitypub-mcp/public/`), not `site/public/`.

- **`public/favicon.svg`** — replace with the four-dot + crossing-arcs design tuned to remain legible to ~20px. (Only `favicon.svg` exists today; no PNG fallback is present. Generate a PNG fallback only if a specific platform target requires it — it is not assumed.)
- **`public/logo.svg`** — replace with the new full-color crossing-arcs mark (vermilion + teal arcs, four corner dots per §2.3, no center node). The flipping ink dot's fill is bound to `--logo-dot-flip` for the inline header mark.
- **`public/logo-monochrome.svg`** — recreate from the new design as a single-`currentColor` silhouette of arcs + dots.
- **Inverse logo SVG** — produce an explicit dark-background variant (ink dot → paper) for raster/OG contexts where CSS variables cannot apply.
- **`public/og-image.png`** — regenerate via `scripts/generate-og-image.js`: swap the blue/purple gradient for a vermilion→teal (and/or paper/ink) brand treatment, place the new logo, set text colors for contrast, and re-run `npm run generate:og-image`. The script depends on `public/logo.svg`, so regenerate the logo first.
- **README header** — replace the README hero/header image and any badge styling to match the new brand (new logo, palette, tagline). Per the global commit rules, no AI attribution anywhere.
- **`theme-color` meta** — change from `#6366f1` (indigo) to vermilion `#E8552D` in `BaseLayout`.

---

## 8. Build/Deploy & SEO — What Must Keep Working

- **Pagefind:** `npx pagefind --site dist-site` runs after `astro build` and indexes the HTML in `./dist-site`. The `/activitypub-mcp` base path is applied by Astro at build, so the index lands at `/activitypub-mcp/pagefind/` with no extra Pagefind config. `data-pagefind-body` markers on `main` (BaseLayout) and the docs content container (DocsLayout) must be preserved so docs and homepage are indexed.
- **Sitemap:** `@astrojs/sitemap` continues to emit `sitemap-index.xml`/`sitemap-0.xml` for `https://cameronrye.github.io/activitypub-mcp`. New MDX routes must appear in the sitemap (they will, since they are statically generated).
- **Fallback search:** `node scripts/generate-search-data.js` continues to produce `dist-site/search.json` by scanning built HTML and `[data-pagefind-body]`; its base-path handling is kept. Verify it still extracts titles/excerpts from MDX-rendered pages.
- **`.well-known` handling:** the Vite `assetFileNames` rule preserving `.well-known/*` paths must remain, and the existing `vite.server.headers` MIME rule for `/.well-known/security.txt` stays; `security.txt` and `change-password` must survive into `dist-site`. The robots.txt `Allow: /.well-known/` and sitemap reference stay valid.
- **Base path:** all internal links, asset references, logo/favicon paths, and the Pagefind/search URLs must respect `base: "/activitypub-mcp"` (use `import.meta.env.BASE_URL` / Astro path helpers, never hardcoded leading-slash absolute paths that bypass the base).
- **Structured data & meta:** the Schema.org JSON-LD, Open Graph, and Twitter card tags in BaseLayout are kept and updated (OG image points at the new `og-image.png`; description/title reflect v3.0.0 and the corrected positioning). Canonical URLs derive from `site` + `base`.
- **`llms.txt` / `llms-full.txt`:** keep these LLM-reference assets (both present in repo-root `public/`); update any embedded counts/version so they do not reintroduce drift (ideally regenerate from the registry manifest where they enumerate capabilities).
- **No-FOUC:** the inline theme script must run before theme-dependent CSS and continue to prevent flash in all three theme states on the production build.

---

## 9. Implementation Phases

**Phase 1 — Brand foundation (tokens, fonts, assets, manifest script).**
Deliverables: install the three `@fontsource` packages; create `site/src/styles/fonts.css` (imported in `BaseLayout` before the no-FOUC script) and the token block (§2.4); rewrite the color/font sections of `main.css` to tokens; update dark-mode overrides to ink/paper (and add the `prefers-color-scheme` system fallback per §2.4); produce new `favicon.svg`, `logo.svg`, `logo-monochrome.svg`, and the inverse variant; regenerate `og-image.png` via the updated `generate-og-image.js`; set `theme-color` to vermilion; update README header; drop the Inter/Google Fonts link. Also create `scripts/generate-registry-manifest.js`, run it to produce and commit `site/src/data/registry-manifest.json` (must read 37/10/5), and update the `build:site` script to invoke it first — so the manifest exists before any phase that consumes it.

**Phase 2 — Layout & component reskin.**
Deliverables: reskin `BaseLayout`, `Search`, `ThemeToggle`, `SocialLinks` to brand tokens; verify the no-FOUC script and (after Phase 3) the dual-theme Shiki config; bind the logo dot-flip to `--logo-dot-flip`; verify the `grep -rn 'SimpleSearch' site/` result and remove `SimpleSearch.astro` (confirmed unused); build `CopyButton`/code-block wrapper. Light/dark/system parity verified visually on layouts.

**Phase 3 — Astro content-collection scaffolding.**
Deliverables: apply any latest-5.x patch update (no 6.x); add `site/src/content.config.ts` with the typed schema; add the `markdown.shikiConfig.themes` dual-theme config; create the `site/src/pages/docs/[...slug].astro` route using `render(entry)`; rebuild `DocsLayout` to render the collection-driven sidebar and TOC (delete `_docsNav`). Verify a single placeholder MDX entry builds and routes correctly under the base path before bulk migration.

**Phase 4 — Docs migration (the 20 pages + consolidations).**
Deliverables: convert the 16 kept pages to MDX with frontmatter; perform the 4 merges per §4.2 into their merge-targets; drop `docs/index` and `fedify-cli` (the only two drops); assign every page its `group`/`order`/slug per the §4.1 table. Sidebar auto-generates; all 20 pages render and are reachable; internal cross-links updated to new slugs.

**Phase 5 — Homepage rebuild.**
Deliverables: rebuild `index.astro` (at `site/src/pages/index.astro`) with Hero B, the 3-node How-it-works diagram, build-derived Capabilities (reading `site/src/data/registry-manifest.json` created in Phase 1), restyled Key features, Quick install with copy buttons, Docs entry cards, and footer; derive the version badge from `package.json`. The manifest already exists from Phase 1, so the build never references a missing file.

**Phase 6 — Build, deploy & verification.**
Deliverables: run `npm run build:site` end-to-end (manifest → astro → pagefind → search.json); confirm sitemap, `.well-known`, OG image, structured data, and base-path correctness; verify Pagefind index and `search.json`; check light/dark/system + no-FOUC on the production build; verify mobile nav/search; run the acceptance checklist (§11); deploy to GitHub Pages.

---

## 10. Risks & Mitigations

- **Content-collection path under custom `srcDir`.** *Risk:* placing config/content at the wrong path silently yields an empty collection. *Mitigation:* config at `site/src/content.config.ts`, content at `site/src/content/docs/`, glob `base: './src/content/docs'` (resolved in §3.2); verify with a placeholder before bulk migration.
- **Count drift / wrong numbers on homepage.** *Risk:* re-hardcoding stale `53/10/11`. *Mitigation:* build-time manifest is the only source; the verified truth is **37/10/5**. No page hardcodes counts or version.
- **Manifest generator miscounts.** *Risk:* a naive scan **overcounts** by matching the `capabilities.ts` instrumentation wrapper (giving 42/15/10 instead of the true 37/10/5), or undercounts by missing a registrar file. *Mitigation:* count true `.registerX(` call-sites across all of `src/` while excluding `capabilities.ts`; the generator must reproduce the verified **37 / 10 / 5**; treat any divergence as a generator bug to fix before ship.
- **Missing manifest at build time.** *Risk:* the homepage references `registry-manifest.json` before the generator script/file exist, breaking the build. *Mitigation:* create the generator and commit the JSON in Phase 1; update `build:site` to run it first; the homepage rebuild (Phase 5) only happens after the file exists.
- **Base-path breakage.** *Risk:* hardcoded `/`-prefixed links break under `/activitypub-mcp`. *Mitigation:* use `BASE_URL`/Astro path helpers everywhere; verify with the production preview, not just `dev`.
- **Pagefind/`.well-known` regression after restructure.** *Risk:* moving to `site/src/...` and MDX changes indexing or asset preservation. *Mitigation:* keep `data-pagefind-body` markers; keep the Vite `assetFileNames` rule and the `vite.server.headers` MIME rule; validate `dist-site/pagefind/`, `search.json`, and `.well-known/*` post-build.
- **Contrast on the warm palette.** *Risk:* vermilion/gold on paper or ink failing WCAG AA. *Mitigation:* run contrast checks; reserve gold for large/non-text accents; use ink/paper for body text; warm clay for hover states only where it passes.
- **FOUC / theme flash.** *Risk:* dual-theme Shiki + token swap reintroducing flash, or the `system` state mis-resolving. *Mitigation:* keep the inline pre-paint script; cover all three states via the §2.4 token plan plus the `prefers-color-scheme` media-query fallback; import `fonts.css` before the script; bind code-block theming to `data-theme` via CSS only.
- **Logo legibility at favicon size.** *Risk:* four dots + arcs muddy at ~20px. *Mitigation:* dedicated favicon artboard with thickened strokes/min dot radii per §2.3.
- **Astro 5.x patch regressions.** *Risk:* a 5.x patch changes content/MDX behavior. *Mitigation:* stay within 5.x (not 6.x), adopt the v6-forward `render(entry)` function, run the full build before merge.

---

## 11. Success Criteria / Acceptance Checklist

- [ ] `npm run build:site` completes successfully end-to-end (manifest → `astro build` → Pagefind → `generate-search-data.js`).
- [ ] `scripts/generate-registry-manifest.js` exists, scans all of `src/` for `.registerX(` call-sites while excluding the `capabilities.ts` wrapper, and produces `site/src/data/registry-manifest.json` with **tools: 37, resources: 10, prompts: 5**; the homepage and API pages render these numbers from the JSON (no hardcoded counts anywhere).
- [ ] The version badge reads **v3.0.0**, derived from `package.json`; no `v2.0.0` or `53/10/11` appears anywhere in the built site, `llms.txt`, or `llms-full.txt`.
- [ ] Pagefind index builds under `dist-site/pagefind/` and search works under the `/activitypub-mcp` base; `dist-site/search.json` fallback is generated.
- [ ] `sitemap-index.xml` is generated and lists all 20 docs routes plus the homepage with correct base-path URLs.
- [ ] `.well-known/security.txt` and `.well-known/change-password` are present in `dist-site` at their literal paths.
- [ ] All 20 migrated docs pages are reachable via the single `[...slug].astro` route; the sidebar is generated from the collection (no `_docsNav`), correctly grouped/ordered per §4; the in-page TOC renders from headings.
- [ ] The four consolidations (Claude Desktop, Configuration, Examples, Advanced Workflows) are complete with no unique content lost; the two dropped pages (`docs/index`, `fedify-cli`) are absent.
- [ ] No broken links: all internal cross-links use new slugs and resolve; external links (GitHub, NPM) resolve.
- [ ] Light/dark/system parity: every page renders correctly in all three theme states; the logo's ink dot flips to paper on dark; no-FOUC verified on the production build (no flash in any state).
- [ ] No Google Fonts / Inter request at runtime; Bricolage Grotesque, Hanken Grotesk, and JetBrains Mono are served from the bundle in the correct roles.
- [ ] WCAG AA contrast holds on the warm palette for all body text and interactive elements in both light and dark themes (Lighthouse/axe accessibility pass).
- [ ] New brand assets are in place in repo-root `public/`: `favicon.svg` (legible to ~20px), `logo.svg`, `logo-monochrome.svg`, inverse variant, regenerated `og-image.png`, updated README header, and `theme-color` = `#E8552D`.
- [ ] `SimpleSearch.astro` is removed after a final `grep -rn 'SimpleSearch' site/` confirms no import references it.
- [ ] OG/Twitter cards and Schema.org JSON-LD validate and reference the new OG image and corrected metadata.

---

## 12. Out of Scope

- Any modification to the MCP server runtime or its tool/resource/prompt behavior (only the read-only manifest generator script is added).
- Upgrading to Astro 6 or adopting a third-party docs theme (e.g., Starlight).
- Authoring net-new documentation subject matter beyond the specified merges/consolidations; migrating the dropped `fedify-cli` guide.
- Redirect infrastructure for legacy docs URLs beyond the two drops and four consolidations listed in §4.
- Any backend, CMS, analytics platform change, or non-GitHub-Pages hosting.
- Adding new social destinations (Mastodon/Bluesky/LinkedIn) to `SocialLinks` — noted as a future consideration, not delivered here.
