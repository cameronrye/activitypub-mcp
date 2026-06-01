# ActivityPub MCP Website & Brand Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dated/AI-generated activitypub-mcp site with a warm, distinctive brand identity, migrate the docs to a typed MDX content collection, and make the site the source of truth for docs + brand.

**Architecture:** Astro 5.x static site (custom srcDir ./site, base /activitypub-mcp). New content collection + single dynamic route render MDX docs with a collection-driven sidebar; design-token CSS drives light/dark; a build-time manifest derives capability counts from source; brand assets regenerate from one locked identity.

**Tech Stack:** Astro 5.15.x, @astrojs/mdx, content collections (glob loader), Pagefind, @astrojs/sitemap, self-hosted @fontsource fonts, Shiki dual-theme, vitest.

---

## Verification tooling note (read first — applies to EVERY phase)

Two facts about this repo's tooling change how verification works, and the plan standardizes on them everywhere:

1. **`@astrojs/check` is NOT installed and `npx astro check` will hang a non-interactive agent on its install prompt.** Task 1 below installs `@astrojs/check` + `typescript` and adds a `check` script BEFORE any other task runs, so `npm run check` is safe to call. Every later "verify the Astro file" step uses `npm run check` (which runs `astro check`) or `npx astro build` / `npm run build:site` — never a bare `npx astro check` that could trigger an install prompt.
2. **`npm run typecheck` (`tsc --noEmit`) does NOT cover `site/`.** `tsconfig.json` has `include: ["src/**/*"]`, so `tsc` only checks the MCP runtime in `src/`, never the Astro site files, `content.config.ts`, the dynamic route, `DocsLayout`, the homepage, or its `package.json`/JSON imports. Treat `npm run typecheck` as an MCP-runtime check only. For ANY `site/` `.astro`/`.ts` file, validate with `npm run check` (astro check) or `npx astro build`.

---

## Phase 1 — Brand foundation (tokens, fonts, assets, manifest generator)

This phase implements spec §2 (brand tokens + self-hosted fonts), §5.1 + §7 (asset regeneration + build-derived counts), and the registry-manifest generator with a real vitest test. It is the prerequisite for every later phase: the manifest JSON must exist and be committed before Phase 5 reads it, and the tokens/fonts must land before Phase 2 reskins anything. Every code block below is complete and copy-pasteable; counts and hex values are normative per the spec.

Grounding facts verified against the live repo before writing this phase:
- `src/mcp/tools.ts` = 9, `src/mcp/tools-write.ts` = 28 (→ 37 tools), `src/mcp/resources.ts` = 10, `src/mcp/prompts.ts` = 5. `src/mcp/capabilities.ts` has 17 `registerX` *occurrences* but **zero** real `.registerX(` call-sites of its own that should count — it must be excluded.
- `package.json` is already `"version": "3.0.0"`; `build:site` is currently `astro build && npx pagefind --site dist-site && node scripts/generate-search-data.js`.
- `site/styles/main.css` (1562 lines) defines colors in `:root` and theme blocks and references `--color-primary`, `--color-secondary`, `--color-primary-gradient`, `--bg-primary`, `--text-primary`, etc. in 100+ downstream rules. Strategy: **repoint the existing variable names to brand tokens in-place** (so downstream rules need no edits) AND add the spec-mandated alias names (`--accent`, `--accent-2`, `--accent-3`, `--logo-dot-flip`, `--font-display`/`--font-body`/`--font-mono`).
- `BaseLayout.astro`: theme-color is at line 104 (`#6366f1`); the Google Fonts/Inter `<link>` is lines 145–148; `import "../styles/main.css";` is line 2.
- `scripts/generate-og-image.js` imports `sharp` (present in node_modules), hardcodes blue/purple, reads `public/logo.svg`.
- vitest: `globals: true`, node env, tests at `tests/**/*.test.ts`, setup file `./tests/setup.ts`.
- Built CSS lands in `dist-site/assets/` (astro.config `build.assets: "assets"`), NOT `dist-site/_astro/`.

---

### Task 1: Install `@astrojs/check` + add a `check` script (verification prerequisite for ALL phases)

This MUST be the first thing done so every later step can call `npm run check` safely (no interactive install prompt mid-run).

- [ ] **Step 1.1: Install the check toolchain as devDependencies.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm install --save-dev @astrojs/check typescript
  ```

- [ ] **Step 1.2: Add a `check` script to `package.json`.** Open `/Users/cameron/Developer/activitypub-mcp/package.json` and add a `"check": "astro check"` entry to the `scripts` object (place it adjacent to the existing `"typecheck"` entry). After the edit, confirm:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node -e "const s=require('./package.json').scripts; if(s.check!=='astro check'){console.error('check script missing or wrong:', s.check);process.exit(1)} console.log('check script OK')"
  ```

- [ ] **Step 1.3: Confirm `npm run check` runs without an install prompt and reports on `site/` files.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -20
  ```
  Confirm it completes (any pre-existing warnings/errors in other files are acceptable here; the point is it runs non-interactively). From now on, `npm run check` is the canonical Astro/TS verification for `site/` files.

- [ ] **Step 1.4: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add package.json package-lock.json && git commit -m "Add @astrojs/check toolchain and check script for site verification"
  ```

---

### Task 2: Install the three @fontsource packages

- [ ] **Step 2.1: Install the font packages as devDependencies.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm install --save-dev @fontsource/bricolage-grotesque @fontsource/hanken-grotesk @fontsource/jetbrains-mono
  ```

- [ ] **Step 2.2: Verify all three are present in `package.json` and on disk.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node -e "const p=require('./package.json').devDependencies; const need=['@fontsource/bricolage-grotesque','@fontsource/hanken-grotesk','@fontsource/jetbrains-mono']; const missing=need.filter(n=>!p[n]); if(missing.length){console.error('MISSING:',missing); process.exit(1)} console.log('OK', need.map(n=>n+'@'+p[n]).join(', '))" && ls node_modules/@fontsource/bricolage-grotesque/400.css node_modules/@fontsource/hanken-grotesk/400.css node_modules/@fontsource/jetbrains-mono/400.css
  ```
  Confirm the node prints `OK ...` and all three `400.css` files exist (these are the exact paths `fonts.css` will import in Task 3).

- [ ] **Step 2.3: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add package.json package-lock.json && git commit -m "Add self-hosted @fontsource packages for Bricolage Grotesque, Hanken Grotesk, JetBrains Mono"
  ```

---

### Task 3: Create `site/src/styles/fonts.css` (spec §2.2)

- [ ] **Step 3.1: Create the fonts stylesheet.** Write `/Users/cameron/Developer/activitypub-mcp/site/src/styles/fonts.css` with exactly these six weight imports (Display 400/700, Body 400/600, Mono 400/600 per §2.2):
  ```css
  /* Self-hosted brand fonts (spec §2.2). Imported by BaseLayout before the
     no-FOUC theme script so they are present at first paint — no Google Fonts,
     no external font origin contacted at runtime. */

  /* Display — Bricolage Grotesque (--font-display): h1–h6, hero, headings, wordmark */
  @import "@fontsource/bricolage-grotesque/400.css";
  @import "@fontsource/bricolage-grotesque/700.css";

  /* Body — Hanken Grotesk (--font-body): body, paragraphs, nav, UI */
  @import "@fontsource/hanken-grotesk/400.css";
  @import "@fontsource/hanken-grotesk/600.css";

  /* Code — JetBrains Mono (--font-mono): code, pre, install snippets, inline tokens */
  @import "@fontsource/jetbrains-mono/400.css";
  @import "@fontsource/jetbrains-mono/600.css";
  ```

- [ ] **Step 3.2: Verify the file exists and references resolvable packages.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && test -f site/src/styles/fonts.css && grep -c '@import' site/src/styles/fonts.css
  ```
  Expect output `6`. (Final build-time verification that fonts load happens after the BaseLayout import in Task 5.)

- [ ] **Step 3.3: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/src/styles/fonts.css && git commit -m "Add fonts.css importing self-hosted font weights"
  ```

---

### Task 4: Create `site/src/styles/tokens.css` (spec §2.4)

- [ ] **Step 4.1: Create the canonical brand token file.** Write `/Users/cameron/Developer/activitypub-mcp/site/src/styles/tokens.css` with the exact §2.4 token block, including the dark and `prefers-color-scheme` system fallback:
  ```css
  /* Brand design tokens (spec §2.4). Brand tokens are constant across themes;
     only the semantic aliases (--bg-*, --text-*, --border-color, --logo-dot-flip)
     flip between light and dark. This is the single mechanism driving both
     theming and the logo ink-dot flip. */

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

- [ ] **Step 4.2: Verify the six brand hexes are present.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -o -E '#FBF7F0|#E8552D|#2F7D6B|#F4B740|#1A1714|#C2643A' site/src/styles/tokens.css | sort -u | wc -l
  ```
  Expect `6` (all six brand colors present).

- [ ] **Step 4.3: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/src/styles/tokens.css && git commit -m "Add brand tokens.css with light/dark/system semantic aliases"
  ```

---

### Task 5: Wire fonts + tokens into BaseLayout and set theme-color (spec §2.4, §6, §7)

The existing `data-theme` values are `light`/`dark`/`system` (set by the no-FOUC script at lines 151–167), and `tokens.css` keys its dark aliases on `[data-theme='dark']` and `[data-theme='system']` + media query — so the existing script needs no change. We only add the two imports (before the no-FOUC script via frontmatter import order) and flip the theme-color. (Note: Phase 2 Task 13 also fixes the OG-image base path and the navbar/footer doc links in this same file — those are deferred to Phase 2 so they land alongside the rest of the layout reskin.)

- [ ] **Step 5.1: Add the `fonts.css` and `tokens.css` imports to the frontmatter.** In `/Users/cameron/Developer/activitypub-mcp/site/layouts/BaseLayout.astro`, the import block currently begins at line 2 with `import "../styles/main.css";`. Replace that single line:
  ```astro
  import "../styles/main.css";
  ```
  with (fonts first so faces are declared before any theme-dependent CSS, then tokens, then the existing main.css which will consume the tokens):
  ```astro
  import "../src/styles/fonts.css";
  import "../src/styles/tokens.css";
  import "../styles/main.css";
  ```
  Astro hoists frontmatter style imports into the `<head>` ahead of the inline no-FOUC script, satisfying the §2.2 "fonts present at first paint" requirement.

- [ ] **Step 5.2: Set the theme-color meta to vermilion (spec §7).** Replace line 104:
  ```astro
  <meta name="theme-color" content="#6366f1">
  ```
  with:
  ```astro
  <meta name="theme-color" content="#E8552D">
  ```

- [ ] **Step 5.3: Remove the Google Fonts / Inter `<link>` block (spec §2.2).** Delete these three lines (currently 146–148) and the `<!-- Fonts -->` comment immediately above them (line 145):
  ```astro
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  ```

- [ ] **Step 5.4: Verify the Astro project (using `npm run check`, never bare `npx astro check`).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -20
  ```
  Confirm no errors referencing `BaseLayout.astro` or the new imports. (Pre-existing unrelated warnings in other files are acceptable; there must be no new errors about missing `../src/styles/fonts.css` or `../src/styles/tokens.css`.)

- [ ] **Step 5.5: Confirm the Inter link and old theme-color are gone, vermilion present.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && ! grep -q 'fonts.googleapis.com' site/layouts/BaseLayout.astro && ! grep -q '#6366f1' site/layouts/BaseLayout.astro && grep -q 'content="#E8552D"' site/layouts/BaseLayout.astro && grep -q 'src/styles/fonts.css' site/layouts/BaseLayout.astro && echo "BASELAYOUT OK"
  ```
  Expect `BASELAYOUT OK`.

- [ ] **Step 5.6: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/layouts/BaseLayout.astro && git commit -m "Self-host fonts in BaseLayout, drop Google Fonts/Inter, set theme-color to vermilion"
  ```

---

### Task 6: Rewrite the color + font blocks of `main.css` to brand tokens (spec §2.4, §6)

`main.css` references `--color-primary`, `--color-secondary`, `--color-primary-gradient`, `--bg-primary`, `--text-primary`, etc. in 100+ downstream rules. Rather than rewrite every downstream rule, **repoint the existing variable names to brand tokens in-place** and consume the `tokens.css` aliases. This achieves the full brand swap in §6 ("update all downstream color references") with one localized edit. The structural variables (spacing, radius, transitions, z-index, font-sizes, line-heights, weights) are kept exactly per §2.4.

Below are the exact before→after edits. The advisory line numbers are approximate; rely on the quoted before-strings for the exact Edit match.

- [ ] **Step 6.1: Replace the primary/secondary/accent/neutral color block.**

  BEFORE (the `Primary colors` through `Semantic colors` groups):
  ```css
    /* Primary colors - Modern blue gradient */
    --color-primary: #2563eb;
    --color-primary-dark: #1d4ed8;
    --color-primary-light: #3b82f6;
    --color-primary-gradient: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);

    /* Secondary colors - Purple accent */
    --color-secondary: #7c3aed;
    --color-secondary-dark: #6d28d9;
    --color-secondary-light: #8b5cf6;
    --color-secondary-gradient: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);

    /* Accent colors */
    --color-accent: #06b6d4;
    --color-accent-dark: #0891b2;
    --color-accent-light: #22d3ee;

    /* Neutral colors */
    --color-white: #ffffff;
    --color-gray-50: #f9fafb;
    --color-gray-100: #f3f4f6;
    --color-gray-200: #e5e7eb;
    --color-gray-300: #d1d5db;
    --color-gray-400: #9ca3af;
    --color-gray-500: #6b7280;
    --color-gray-600: #4b5563;
    --color-gray-700: #374151;
    --color-gray-800: #1f2937;
    --color-gray-900: #111827;

    /* Semantic colors */
    --color-success: #10b981;
    --color-success-light: #34d399;
    --color-warning: #f59e0b;
    --color-warning-light: #fbbf24;
    --color-error: #ef4444;
    --color-error-light: #f87171;
    --color-info: #3b82f6;
    --color-info-light: #60a5fa;
  ```

  AFTER (brand tokens consumed from `tokens.css`; legacy names repointed so downstream rules need no edits — vermilion is the new primary, pine-teal the new secondary, gold the new accent; neutrals remapped to the warm paper/ink scale per §2.1):
  ```css
    /* Primary colors — vermilion brand (was blue). Legacy names repointed to brand tokens. */
    --color-primary: var(--color-vermilion);
    --color-primary-dark: var(--color-clay);
    --color-primary-light: #F0795A;
    --color-primary-gradient: linear-gradient(135deg, var(--color-vermilion) 0%, var(--color-clay) 100%);

    /* Secondary colors — pine-teal brand (was purple) */
    --color-secondary: var(--color-pine-teal);
    --color-secondary-dark: #25604F;
    --color-secondary-light: #4A9A86;
    --color-secondary-gradient: linear-gradient(135deg, var(--color-pine-teal) 0%, #25604F 100%);

    /* Accent colors — gold brand (was cyan) */
    --color-accent: var(--color-gold);
    --color-accent-dark: #D89E22;
    --color-accent-light: #F8CB6B;

    /* Neutral colors — warm paper→ink scale (was cool grays) */
    --color-white: var(--color-paper);
    --color-gray-50: #F6F1E8;
    --color-gray-100: #F3EDE3;
    --color-gray-200: #E0DDD8;
    --color-gray-300: #CFC9C0;
    --color-gray-400: #A8A097;
    --color-gray-500: #5A534C;
    --color-gray-600: #4A443E;
    --color-gray-700: #332E29;
    --color-gray-800: #231F1B;
    --color-gray-900: var(--color-ink);

    /* Semantic colors — re-toned to read on paper/ink (spec §2.1) */
    --color-success: #2F7D6B;
    --color-success-light: #4A9A86;
    --color-warning: #F4B740;
    --color-warning-light: #F8CB6B;
    --color-error: #C0392B;
    --color-error-light: #D85A4C;
    --color-info: #2F7D6B;
    --color-info-light: #4A9A86;
  ```

- [ ] **Step 6.2: Repoint the background/text/border/shadow group so dark surfaces use ink and add the spec alias names.**

  BEFORE:
  ```css
    /* Background colors */
    --bg-primary: var(--color-white);
    --bg-secondary: var(--color-gray-50);
    --bg-tertiary: var(--color-gray-100);
    --bg-gradient-primary: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    --bg-gradient-secondary: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);

    /* Text colors */
    --text-primary: var(--color-gray-900);
    --text-secondary: var(--color-gray-600);
    --text-tertiary: var(--color-gray-500);
    --text-inverse: var(--color-white);

    /* Border colors */
    --border-primary: var(--color-gray-200);
    --border-secondary: var(--color-gray-300);

    /* Shadow colors */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg:
      0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl:
      0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  ```

  AFTER (warm gradients; spec-mandated `--bg-raised`, `--text-muted`, `--border-color`, `--accent`/`--accent-2`/`--accent-3` aliases added so both schemes resolve; note `--bg-primary`/`--text-primary` are also defined in `tokens.css` — main.css loads after tokens.css so these win, and the `[data-theme]` blocks below keep them in sync):
  ```css
    /* Background colors */
    --bg-primary: var(--color-paper);
    --bg-secondary: var(--color-gray-50);
    --bg-tertiary: var(--color-gray-100);
    --bg-raised: #F3EDE3;
    --bg-gradient-primary: linear-gradient(135deg, #FBF7F0 0%, #F3EDE3 100%);
    --bg-gradient-secondary: linear-gradient(135deg, #F3EDE3 0%, #E0DDD8 100%);

    /* Text colors */
    --text-primary: var(--color-ink);
    --text-secondary: var(--color-gray-500);
    --text-tertiary: #6F675E;
    --text-muted: #5A534C;
    --text-inverse: var(--color-paper);

    /* Accent aliases (spec §2.4) */
    --accent: var(--color-vermilion);
    --accent-2: var(--color-pine-teal);
    --accent-3: var(--color-gold);

    /* Border colors */
    --border-primary: var(--color-gray-200);
    --border-secondary: var(--color-gray-300);
    --border-color: #E0DDD8;

    /* Logo flipping dot (spec §2.3/§2.4) */
    --logo-dot-flip: var(--color-ink);

    /* Shadow colors — warm ink-tinted shadows */
    --shadow-sm: 0 1px 2px 0 rgb(26 23 20 / 0.06);
    --shadow-md: 0 4px 6px -1px rgb(26 23 20 / 0.10), 0 2px 4px -2px rgb(26 23 20 / 0.10);
    --shadow-lg:
      0 10px 15px -3px rgb(26 23 20 / 0.10), 0 4px 6px -4px rgb(26 23 20 / 0.10);
    --shadow-xl:
      0 20px 25px -5px rgb(26 23 20 / 0.10), 0 8px 10px -6px rgb(26 23 20 / 0.10);
  ```

- [ ] **Step 6.3: Rewrite the typography font-family block.**

  BEFORE:
  ```css
    /* Typography */
    --font-family-sans:
      "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    --font-family-mono:
      "SF Mono", Monaco, Inconsolata, "Roboto Mono", Consolas, "Courier New",
      monospace;
  ```

  AFTER (legacy `--font-family-sans`/`--font-family-mono` names kept so downstream rules need no edits, repointed to the brand type roles from `tokens.css`):
  ```css
    /* Typography — brand type roles (spec §2.2). Legacy names repointed. */
    --font-family-sans: var(--font-body);
    --font-family-display: var(--font-display);
    --font-family-mono: var(--font-mono);
  ```

- [ ] **Step 6.4: Replace the three theme override blocks with the warm ink/paper system.**

  First, locate the exact current block to replace. Run this to print it verbatim so the Edit `old_string` matches the file byte-for-byte:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -n 'Theme system - Light theme (default)' site/styles/main.css
  ```
  The region runs from the `/* Theme system - Light theme (default) */` comment through the closing `}` of the `@media (prefers-color-scheme: dark)` block. Read that exact range with the Read tool, copy it verbatim as the Edit `old_string`, and replace it with:
  ```css
  /* Theme system — Light theme (default; mirrors :root) */
  :root,
  :root[data-theme="light"],
  :root.theme-light {
    --bg-primary: var(--color-paper);
    --bg-secondary: var(--color-gray-50);
    --bg-tertiary: var(--color-gray-100);
    --bg-raised: #F3EDE3;
    --bg-gradient-primary: linear-gradient(135deg, #FBF7F0 0%, #F3EDE3 100%);
    --bg-gradient-secondary: linear-gradient(135deg, #F3EDE3 0%, #E0DDD8 100%);

    --text-primary: var(--color-ink);
    --text-secondary: var(--color-gray-500);
    --text-tertiary: #6F675E;
    --text-muted: #5A534C;
    --text-inverse: var(--color-paper);

    --border-primary: var(--color-gray-200);
    --border-secondary: var(--color-gray-300);
    --border-color: #E0DDD8;

    --logo-dot-flip: var(--color-ink);
  }

  /* Dark theme — ink surfaces, paper text (spec §2.1/§2.4) */
  :root[data-theme="dark"],
  :root.theme-dark {
    --bg-primary: var(--color-ink);
    --bg-secondary: #231F1B;
    --bg-tertiary: #332E29;
    --bg-raised: #231F1B;
    --bg-gradient-primary: linear-gradient(135deg, #231F1B 0%, #1A1714 100%);
    --bg-gradient-secondary: linear-gradient(135deg, #332E29 0%, #231F1B 100%);

    --text-primary: var(--color-paper);
    --text-secondary: #C9C2B8;
    --text-tertiary: #A29A8F;
    --text-muted: #C9C2B8;
    --text-inverse: var(--color-ink);

    --border-primary: #332E29;
    --border-secondary: #4A443E;
    --border-color: #332E29;

    --logo-dot-flip: var(--color-paper);
  }

  /* System theme — light defaults; flips to ink under prefers-color-scheme: dark */
  :root[data-theme="system"],
  :root.theme-system {
    --bg-primary: var(--color-paper);
    --bg-secondary: var(--color-gray-50);
    --bg-tertiary: var(--color-gray-100);
    --bg-raised: #F3EDE3;
    --bg-gradient-primary: linear-gradient(135deg, #FBF7F0 0%, #F3EDE3 100%);
    --bg-gradient-secondary: linear-gradient(135deg, #F3EDE3 0%, #E0DDD8 100%);

    --text-primary: var(--color-ink);
    --text-secondary: var(--color-gray-500);
    --text-tertiary: #6F675E;
    --text-muted: #5A534C;
    --text-inverse: var(--color-paper);

    --border-primary: var(--color-gray-200);
    --border-secondary: var(--color-gray-300);
    --border-color: #E0DDD8;

    --logo-dot-flip: var(--color-ink);
  }

  @media (prefers-color-scheme: dark) {
    :root[data-theme="system"],
    :root.theme-system {
      --bg-primary: var(--color-ink);
      --bg-secondary: #231F1B;
      --bg-tertiary: #332E29;
      --bg-raised: #231F1B;
      --bg-gradient-primary: linear-gradient(135deg, #231F1B 0%, #1A1714 100%);
      --bg-gradient-secondary: linear-gradient(135deg, #332E29 0%, #231F1B 100%);

      --text-primary: var(--color-paper);
      --text-secondary: #C9C2B8;
      --text-tertiary: #A29A8F;
      --text-muted: #C9C2B8;
      --text-inverse: var(--color-ink);

      --border-primary: #332E29;
      --border-secondary: #4A443E;
      --border-color: #332E29;

      --logo-dot-flip: var(--color-paper);
    }
  }
  ```

- [ ] **Step 6.5: Verify no legacy cool-palette hexes survive in the rewritten regions and that brand colors are present.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && echo "Stale cool hexes remaining (expect 0):" && grep -c -E '#2563eb|#7c3aed|#06b6d4|#3b82f6|#8b5cf6|"Inter"' site/styles/main.css && echo "Brand tokens referenced (expect >0):" && grep -c -E 'var\(--color-vermilion\)|var\(--color-pine-teal\)|var\(--color-ink\)|var\(--font-body\)' site/styles/main.css
  ```
  Expect the first count to be `0` and the second to be greater than `0`.

- [ ] **Step 6.6: Run `npm run check` to confirm the CSS edits did not break the build graph.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10
  ```
  Confirm no new errors.

- [ ] **Step 6.7: Build the site and grep the built CSS (in `dist-site/assets/`) for the brand hexes to prove tokens reach the output.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npx astro build 2>&1 | tail -5 && grep -rEl '#FBF7F0|#E8552D|#1A1714' dist-site/assets/*.css | head -1 && echo "BRAND CSS IN BUILD OK"
  ```
  Confirm a built CSS file in `dist-site/assets/` contains the brand hexes and `BRAND CSS IN BUILD OK` prints. (Uses `astro build` directly here since `build:site` is not yet rewired — that happens in Task 10.)

- [ ] **Step 6.8: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/styles/main.css && git commit -m "Rewrite main.css color and font blocks to warm brand tokens"
  ```

---

### Task 7: Write a failing test for the registry-manifest generator, then implement it (spec §5.1, vitest TDD)

The count logic is genuine business logic with a known gotcha (capabilities.ts must be excluded). The test imports a pure `countRegistry(srcDir)` function from the generator module; the generator's CLI side-effects (writing JSON, logging) run only when invoked directly.

- [ ] **Step 7.1: Write the test first at `tests/unit/registry-manifest.test.ts`.** This asserts the verified 37/10/5 against the live `src/` tree, exercises the wrapper-exclusion with a real fixture, and confirms the name arrays:
  ```ts
  import { fileURLToPath } from "node:url";
  import { dirname, join } from "node:path";
  import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
  import { tmpdir } from "node:os";
  import { describe, expect, it } from "vitest";
  import { countRegistry } from "../../scripts/generate-registry-manifest.js";

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const srcDir = join(repoRoot, "src");

  describe("countRegistry", () => {
    it("counts true .registerX( call-sites as 37 tools / 10 resources / 5 prompts", () => {
      const result = countRegistry(srcDir);
      expect(result.tools).toBe(37);
      expect(result.resources).toBe(10);
      expect(result.prompts).toBe(5);
    });

    it("returns deduplicated, sorted name arrays matching the counts", () => {
      const result = countRegistry(srcDir);
      expect(result.toolNames).toHaveLength(result.tools);
      expect(result.resourceNames).toHaveLength(result.resources);
      expect(result.promptNames).toHaveLength(result.prompts);
      const sorted = [...result.toolNames].sort();
      expect(result.toolNames).toEqual(sorted);
    });

    it("excludes capabilities.ts even when it contains a registerX call-form", () => {
      // Build a tiny fixture src tree: one real registrar + a capabilities.ts
      // wrapper that DOES contain a .registerTool("x", ...) call-form. The
      // exclusion must drop the wrapper's match so only the real one counts.
      const dir = mkdtempSync(join(tmpdir(), "regtest-"));
      try {
        mkdirSync(join(dir, "mcp"), { recursive: true });
        writeFileSync(
          join(dir, "mcp", "real.ts"),
          `server.registerTool("ping", {}, async () => {});\n`
        );
        writeFileSync(
          join(dir, "mcp", "capabilities.ts"),
          `wrapped.registerTool("instrumented", {}, async () => {});\n`
        );
        const result = countRegistry(dir);
        expect(result.tools).toBe(1);
        expect(result.toolNames).toEqual(["ping"]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
  ```

- [ ] **Step 7.2: Confirm the test FAILS because the generator does not exist yet.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npx vitest run tests/unit/registry-manifest.test.ts 2>&1 | tail -15
  ```
  Expect a failure resolving `../../scripts/generate-registry-manifest.js` (module not found). This is the red state.

- [ ] **Step 7.3: Implement the generator at `scripts/generate-registry-manifest.js`.** It exports a pure `countRegistry(srcDir)` (used by the test) and runs CLI side-effects only when invoked directly. It recursively scans all `.ts` files under `src/`, counts only the `.registerTool(` / `.registerResource(` / `.registerPrompt(` call form, captures the first string-literal argument as the name, and **excludes `src/mcp/capabilities.ts`** (the instrumentation wrapper):
  ```javascript
  #!/usr/bin/env node

  /**
   * Build-time registry manifest generator (spec §5.1).
   *
   * Scans every .ts file under src/ for TRUE registration call-sites
   * (.registerTool(/.registerResource(/.registerPrompt() and writes
   * site/src/data/registry-manifest.json with { tools, resources, prompts,
   * toolNames, resourceNames, promptNames }.
   *
   * EXCLUDES src/mcp/capabilities.ts: it wraps/instruments registerTool etc.
   * Excluding it is a cheap safety belt so a future instrumented call-form in
   * that file can never inflate the counts. The verified counts are 37 / 10 / 5.
   */

  import fs from "node:fs";
  import path from "node:path";
  import { fileURLToPath } from "node:url";

  // Files excluded from counting (instrumentation wrappers, not registrars).
  const EXCLUDED_BASENAMES = new Set(["capabilities.ts"]);

  // Match the call form .registerTool("name", ... and capture the name.
  const PATTERNS = {
    tools: /\.registerTool\(\s*["'`]([^"'`]+)["'`]/g,
    resources: /\.registerResource\(\s*["'`]([^"'`]+)["'`]/g,
    prompts: /\.registerPrompt\(\s*["'`]([^"'`]+)["'`]/g,
  };

  /** Recursively collect all .ts files under dir, skipping .d.ts and excluded basenames. */
  function collectTsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        out.push(...collectTsFiles(full));
      } else if (
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".d.ts") &&
        !EXCLUDED_BASENAMES.has(entry.name)
      ) {
        out.push(full);
      }
    }
    return out;
  }

  function extractNames(content, regex) {
    const names = [];
    let m;
    regex.lastIndex = 0;
    while ((m = regex.exec(content)) !== null) names.push(m[1]);
    return names;
  }

  /**
   * Pure counter — no side effects. Returns counts and deduped, sorted name lists.
   * @param {string} srcDir absolute path to the src/ directory
   */
  export function countRegistry(srcDir) {
    const files = collectTsFiles(srcDir);
    const toolNames = [];
    const resourceNames = [];
    const promptNames = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      toolNames.push(...extractNames(content, PATTERNS.tools));
      resourceNames.push(...extractNames(content, PATTERNS.resources));
      promptNames.push(...extractNames(content, PATTERNS.prompts));
    }

    const uniqSorted = (a) => [...new Set(a)].sort();
    const tools = uniqSorted(toolNames);
    const resources = uniqSorted(resourceNames);
    const prompts = uniqSorted(promptNames);

    return {
      tools: tools.length,
      resources: resources.length,
      prompts: prompts.length,
      toolNames: tools,
      resourceNames: resources,
      promptNames: prompts,
    };
  }

  /** CLI: scan src/, write the manifest, verify the locked counts. */
  function main() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(__dirname, "..");
    const srcDir = path.join(repoRoot, "src");
    const outDir = path.join(repoRoot, "site", "src", "data");
    const outFile = path.join(outDir, "registry-manifest.json");

    const manifest = countRegistry(srcDir);

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);

    if (manifest.tools !== 37 || manifest.resources !== 10 || manifest.prompts !== 5) {
      console.error(
        `Count mismatch: expected 37/10/5, got ${manifest.tools}/${manifest.resources}/${manifest.prompts}. ` +
          "Check that capabilities.ts is excluded and all .registerX( call-sites are matched."
      );
      process.exit(1);
    }

    console.log(
      `Counts verified: ${manifest.tools} tools / ${manifest.resources} resources / ${manifest.prompts} prompts -> ${outFile}`
    );
  }

  // Run side effects only when invoked directly (not when imported by the test).
  if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();
  }
  ```
  Note: the success log line is `Counts verified: 37 tools / 10 resources / 5 prompts -> ...` — Phase 6 Task 2 greps for exactly `Counts verified: 37 tools / 10 resources / 5 prompts`.

- [ ] **Step 7.4: Confirm the test now PASSES (green).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npx vitest run tests/unit/registry-manifest.test.ts 2>&1 | tail -15
  ```
  Expect all three tests passing.

- [ ] **Step 7.5: Commit the test and generator together.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add scripts/generate-registry-manifest.js tests/unit/registry-manifest.test.ts && git commit -m "Add registry-manifest generator with vitest coverage of 37/10/5 count logic"
  ```

---

### Task 8: Generate and commit `site/src/data/registry-manifest.json` (spec §5.1)

- [ ] **Step 8.1: Run the generator standalone.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node scripts/generate-registry-manifest.js
  ```
  Expect: `Counts verified: 37 tools / 10 resources / 5 prompts -> .../site/src/data/registry-manifest.json` and exit code 0.

- [ ] **Step 8.2: Verify the committed JSON has the locked counts and well-formed name arrays.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node -e "const m=require('./site/src/data/registry-manifest.json'); const ok = m.tools===37 && m.resources===10 && m.prompts===5 && m.toolNames.length===37 && m.resourceNames.length===10 && m.promptNames.length===5; if(!ok){console.error('BAD MANIFEST', {tools:m.tools,resources:m.resources,prompts:m.prompts}); process.exit(1)} console.log('MANIFEST OK 37/10/5')"
  ```
  Expect `MANIFEST OK 37/10/5`.

- [ ] **Step 8.3: Commit the generated manifest (checked-in source of truth per §5.1).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/src/data/registry-manifest.json && git commit -m "Generate registry-manifest.json (37 tools / 10 resources / 5 prompts)"
  ```

---

### Task 9: Regenerate brand assets — logo, favicon, monochrome, inverse, OG image, README (spec §2.3, §7)

Logo geometry is locked: two crossing arcs (vermilion + pine-teal) over four corner dots — vermilion BL, pine-teal TR, ink TL, gold BR — **no center node**, rounded stroke caps. The ink TL dot's fill is bound to `--logo-dot-flip` so it flips to paper on dark. All four files share a `0 0 100 100` viewBox; the favicon thickens strokes and enlarges dots for ~20px legibility.

- [ ] **Step 9.1: Write the full-color logo `public/logo.svg`** (ink dot bound to `--logo-dot-flip`, default ink). Replace the entire file:
  ```xml
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <title>ActivityPub MCP Logo</title>
    <desc>Two crossing arcs over four corner dots — the ActivityPub MCP mark.</desc>
    <g fill="none" stroke-linecap="round" stroke-width="9">
      <!-- Vermilion arc: bottom-left to top-right, bowing up -->
      <path d="M22 78 Q50 30 78 22" stroke="#E8552D" />
      <!-- Pine-teal arc: top-left to bottom-right, bowing down -->
      <path d="M22 22 Q50 70 78 78" stroke="#2F7D6B" />
    </g>
    <!-- Four corner dots (no center node) -->
    <!-- Top-left: ink, flips to paper on dark via --logo-dot-flip -->
    <circle cx="18" cy="18" r="9" fill="var(--logo-dot-flip, #1A1714)" />
    <!-- Top-right: pine-teal -->
    <circle cx="82" cy="18" r="9" fill="#2F7D6B" />
    <!-- Bottom-left: vermilion -->
    <circle cx="18" cy="82" r="9" fill="#E8552D" />
    <!-- Bottom-right: gold -->
    <circle cx="82" cy="82" r="9" fill="#F4B740" />
  </svg>
  ```

- [ ] **Step 9.2: Write the favicon `public/favicon.svg`** (same geometry, thicker strokes, `r=11` dots for ~20px legibility per §2.3; ink dot bound to `--logo-dot-flip`). Replace the entire file:
  ```xml
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <title>ActivityPub MCP</title>
    <g fill="none" stroke-linecap="round" stroke-width="12">
      <path d="M24 76 Q50 32 76 24" stroke="#E8552D" />
      <path d="M24 24 Q50 68 76 76" stroke="#2F7D6B" />
    </g>
    <circle cx="20" cy="20" r="11" fill="var(--logo-dot-flip, #1A1714)" />
    <circle cx="80" cy="20" r="11" fill="#2F7D6B" />
    <circle cx="20" cy="80" r="11" fill="#E8552D" />
    <circle cx="80" cy="80" r="11" fill="#F4B740" />
  </svg>
  ```

- [ ] **Step 9.3: Write the monochrome `public/logo-monochrome.svg`** (single `currentColor` silhouette of arcs + dots, no center node). Replace the entire file:
  ```xml
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <title>ActivityPub MCP Logo (monochrome)</title>
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="9">
      <path d="M22 78 Q50 30 78 22" />
      <path d="M22 22 Q50 70 78 78" />
    </g>
    <g fill="currentColor">
      <circle cx="18" cy="18" r="9" />
      <circle cx="82" cy="18" r="9" />
      <circle cx="18" cy="82" r="9" />
      <circle cx="82" cy="82" r="9" />
    </g>
  </svg>
  ```

- [ ] **Step 9.4: Write the inverse `public/logo-inverse.svg`** (dark-background/raster/OG variant: ink TL dot pre-filled to paper `#FBF7F0`; all other colors unchanged; no CSS variable since raster contexts cannot resolve it — spec §2.3/§7). New file:
  ```xml
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <title>ActivityPub MCP Logo (inverse / dark)</title>
    <desc>Dark-surface variant: ink dot rendered as paper for raster/OG contexts.</desc>
    <g fill="none" stroke-linecap="round" stroke-width="9">
      <path d="M22 78 Q50 30 78 22" stroke="#E8552D" />
      <path d="M22 22 Q50 70 78 78" stroke="#2F7D6B" />
    </g>
    <!-- Top-left dot pre-flipped to paper for dark backgrounds -->
    <circle cx="18" cy="18" r="9" fill="#FBF7F0" />
    <circle cx="82" cy="18" r="9" fill="#2F7D6B" />
    <circle cx="18" cy="82" r="9" fill="#E8552D" />
    <circle cx="82" cy="82" r="9" fill="#F4B740" />
  </svg>
  ```

- [ ] **Step 9.5: Retune the OG image generator to the brand palette (spec §7).** In `/Users/cameron/Developer/activitypub-mcp/scripts/generate-og-image.js`, replace the brand-color constants:

  BEFORE:
  ```javascript
  // Brand colors
  const BLUE_DARK = "#2563eb";
  const BLUE_LIGHT = "#3b82f6";
  const PURPLE = "#7c3aed";
  const PURPLE_LIGHT = "#8b5cf6";
  ```
  AFTER:
  ```javascript
  // Brand colors (spec §2.1)
  const VERMILION = "#E8552D";
  const PINE_TEAL = "#2F7D6B";
  const GOLD = "#F4B740";
  const INK = "#1A1714";
  const PAPER = "#FBF7F0";
  ```

  Then replace the background gradient stops — BEFORE:
  ```javascript
          <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#0f172a;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#020617;stop-opacity:1" />
          </linearGradient>
  ```
  AFTER (vermilion→teal over ink per §7):
  ```javascript
          <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${VERMILION};stop-opacity:1" />
            <stop offset="55%" style="stop-color:${INK};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${PINE_TEAL};stop-opacity:1" />
          </linearGradient>
  ```

  Then update the decorative pattern/glow references — BEFORE:
  ```javascript
          <pattern id="network" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
            <circle cx="50" cy="50" r="1" fill="${BLUE_LIGHT}" opacity="0.3"/>
            <circle cx="0" cy="0" r="1" fill="${PURPLE_LIGHT}" opacity="0.2"/>
            <circle cx="100" cy="100" r="1" fill="${PURPLE_LIGHT}" opacity="0.2"/>
          </pattern>
        </defs>
        
        <!-- Background -->
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg-gradient)"/>
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#network)" opacity="0.4"/>
        
        <!-- Decorative glow circles -->
        <circle cx="200" cy="150" r="150" fill="${BLUE_DARK}" opacity="0.1"/>
        <circle cx="1000" cy="480" r="200" fill="${PURPLE}" opacity="0.1"/>
  ```
  AFTER:
  ```javascript
          <pattern id="network" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
            <circle cx="50" cy="50" r="1" fill="${GOLD}" opacity="0.25"/>
            <circle cx="0" cy="0" r="1" fill="${PAPER}" opacity="0.15"/>
            <circle cx="100" cy="100" r="1" fill="${PAPER}" opacity="0.15"/>
          </pattern>
        </defs>
        
        <!-- Background -->
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg-gradient)"/>
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#network)" opacity="0.4"/>
        
        <!-- Decorative glow circles -->
        <circle cx="200" cy="150" r="150" fill="${VERMILION}" opacity="0.12"/>
        <circle cx="1000" cy="480" r="200" fill="${PINE_TEAL}" opacity="0.12"/>
  ```

  Then update the text fills — title fill `fill="#ffffff"` → `fill="${PAPER}"`, and tagline fill `fill="${BLUE_LIGHT}"` → `fill="${GOLD}"`:
  ```javascript
              fill="#ffffff"
  ```
  →
  ```javascript
              fill="${PAPER}"
  ```
  and
  ```javascript
              fill="${BLUE_LIGHT}"
  ```
  →
  ```javascript
              fill="${GOLD}"
  ```

  Finally, point the OG logo at the inverse SVG so the TL dot reads paper on the dark OG background (raster context cannot resolve the CSS var). Replace:
  ```javascript
    const logoPath = join(projectRoot, "public", "logo.svg");
  ```
  with:
  ```javascript
    const logoPath = join(projectRoot, "public", "logo-inverse.svg");
  ```

- [ ] **Step 9.6: Regenerate the OG image.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run generate:og-image
  ```
  Expect the success log and `📐 Dimensions: 1200x630px`.

- [ ] **Step 9.7: Confirm the README header logo reference (spec §7).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -q 'src="public/logo.svg"' README.md && echo "README LOGO OK"
  ```
  Expect `README LOGO OK`. The README already renders the new `logo.svg` at width 200; the asset swap is satisfied by Step 9.1 replacing the file content, so no markup edit is required.

- [ ] **Step 9.8: Verify all four SVGs render the locked geometry (no center node, ink dot bound to flip var) and the OG PNG regenerated.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && echo "logo.svg flip-bound ink dot:" && grep -c 'var(--logo-dot-flip' public/logo.svg && echo "no center node in logo.svg (expect 0 cx=50 cy=50):" && grep -c 'cx="50" cy="50"' public/logo.svg && echo "inverse paper dot:" && grep -c '#FBF7F0' public/logo-inverse.svg && echo "monochrome currentColor:" && grep -c 'currentColor' public/logo-monochrome.svg && echo "favicon four dots:" && grep -c '<circle' public/favicon.svg && file public/og-image.png
  ```
  Expect: logo flip-bound dot `1`; center-node count `0`; inverse paper dot `1`; monochrome currentColor `>=1`; favicon circles `4`; and `og-image.png` reported as PNG image data, 1200 x 630.

- [ ] **Step 9.9: Commit the assets and OG generator.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add public/logo.svg public/favicon.svg public/logo-monochrome.svg public/logo-inverse.svg public/og-image.png scripts/generate-og-image.js && git commit -m "Regenerate brand assets: crossing-arcs logo, favicon, monochrome, inverse, and warm OG image"
  ```

---

### Task 10: Wire the manifest generator into `build:site` and verify the full pipeline (spec §3.6, §5.1)

- [ ] **Step 10.1: Update the `build:site` script.** In `/Users/cameron/Developer/activitypub-mcp/package.json`, replace the current value:
  ```json
      "build:site": "astro build && npx pagefind --site dist-site && node scripts/generate-search-data.js",
  ```
  with (manifest generator runs first per §5.1, the rest unchanged):
  ```json
      "build:site": "node scripts/generate-registry-manifest.js && astro build && npx pagefind --site dist-site && node scripts/generate-search-data.js",
  ```

- [ ] **Step 10.2: Run the full `build:site` end-to-end.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run build:site 2>&1 | tail -20
  ```
  Confirm the manifest line (`Counts verified: 37 tools / 10 resources / 5 prompts`) prints first, then Astro build, Pagefind, and search-data complete without error.

- [ ] **Step 10.3: Verify the manifest is regenerated and the locked counts hold.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node -e "const m=require('./site/src/data/registry-manifest.json'); if(m.tools!==37||m.resources!==10||m.prompts!==5){console.error('BAD',m);process.exit(1)} console.log('BUILD MANIFEST 37/10/5 OK')"
  ```
  Expect `BUILD MANIFEST 37/10/5 OK`.

- [ ] **Step 10.4: Run the registry-manifest test once more to confirm Phase 1 leaves it green.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npx vitest run tests/unit/registry-manifest.test.ts 2>&1 | tail -8
  ```
  Expect all tests passing.

- [ ] **Step 10.5: Commit and close Phase 1.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add package.json && git commit -m "Run registry-manifest generator first in build:site"
  ```

---

**Phase 1 exit criteria:** `@astrojs/check` installed + `check` script added; three `@fontsource` packages installed; `site/src/styles/fonts.css` and `tokens.css` created and imported into `BaseLayout` before the no-FOUC script; `main.css` color/font blocks rewritten to the warm brand tokens with no stale cool hexes; `theme-color` = `#E8552D`; Google Fonts/Inter link removed; `scripts/generate-registry-manifest.js` implemented with a passing vitest test asserting 37/10/5 and a fixture-based capabilities.ts exclusion; `site/src/data/registry-manifest.json` generated and committed; new `logo.svg`/`favicon.svg`/`logo-monochrome.svg`/`logo-inverse.svg` produced with the locked crossing-arcs geometry and flip-bound ink dot; `og-image.png` regenerated on the brand palette; `build:site` rewired to run the generator first; full `npm run build:site` passes end-to-end.

---

## Phase 2 — Layout & component reskin

> Implements spec §6 (Components to Build/Rebuild/Keep) and §9 Phase 2. Prerequisite: Phase 1 has rewritten `main.css` to the §2.4 tokens, created `site/src/styles/fonts.css`/`tokens.css`, and produced the new `public/*.svg` brand assets. This phase reskins the layout shell + the three keep-and-reskin components to those tokens, binds the inline header logo dot to `--logo-dot-flip`, builds the CopyButton/CodeBlock wrapper (the single canonical CopyButton — Phase 5 imports it, never recreates it), removes the dead `SimpleSearch.astro`, fixes the BaseLayout OG-image base path and navbar/footer doc links (so they survive the Phase 4 docs/index drop), and adds dual-theme Shiki CSS hooks.
>
> Token bridge note: `Search.astro`, `ThemeToggle.astro`, `SocialLinks.astro`, and many `main.css` rules reference legacy aliases (`--bg-secondary`, `--bg-tertiary`, `--border-primary`, `--text-secondary`, `--color-primary`, `--color-primary-gradient`, `--color-secondary`, `--color-white`) plus hardcoded blue `rgba(37,99,235,…)` / `rgba(59,130,246,…)` and platform colors `#333` / `#cb3837`. Task 11 adds a legacy-alias bridge to `main.css` so nothing renders unstyled mid-phase, and each component task replaces the literals with the §2.4 names directly. (Astro dev runs on port **4321** — every dev/curl check in this phase uses 4321.)

### Task 11: Add legacy-alias bridge + reskin BaseLayout header/footer styles in main.css

- [ ] **Step 11.1: Confirm Phase 1 landed.**
  - Run: `grep -n -- '--color-paper\|--bg-raised\|--accent\b\|--logo-dot-flip\|--font-body' /Users/cameron/Developer/activitypub-mcp/site/styles/main.css | head -20`
  - Confirm the §2.4 brand tokens exist in `:root`. If they do NOT appear, STOP — Phase 1 is incomplete.

- [ ] **Step 11.2: Add a legacy-alias bridge block to `main.css`.**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/styles/main.css`
  - Locate the closing `}` of the `:root { … }` brand-token block (the one Phase 1 wrote ending with `--color-error: #C0392B;`). Immediately AFTER that closing brace, insert:
  ```css
  /* Legacy semantic-alias bridge — maps pre-overhaul variable names onto the
     new brand tokens (§2.4) so any not-yet-migrated selectors still resolve.
     New code must use the §2.4 names directly; this block is removable once
     no legacy alias remains referenced. */
  :root {
    --bg-secondary:   var(--bg-raised);
    --bg-tertiary:    var(--bg-raised);
    --text-secondary: var(--text-muted);
    --text-inverse:   var(--color-paper);
    --border-primary: var(--border-color);
    --color-white:    var(--color-paper);

    --color-primary:          var(--accent);
    --color-primary-dark:     var(--color-clay);
    --color-primary-light:    var(--color-vermilion);
    --color-primary-gradient: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);

    --color-secondary:          var(--accent-2);
    --color-secondary-dark:     #25624F;
    --color-secondary-light:    var(--color-pine-teal);
    --color-secondary-gradient: linear-gradient(135deg, var(--accent-2) 0%, var(--accent) 100%);

    --color-accent:       var(--accent-3);
    --color-accent-dark:  var(--color-gold);
    --color-accent-light: var(--color-gold);
  }
  ```

- [ ] **Step 11.3: Reskin the `.navbar-brand .brand-text` gradient to brand accents.**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/styles/main.css`
  - In the `.navbar-brand .brand-text` rule, find the two gradient-stop lines:
  ```css
    var(--color-primary) 0%,
    var(--color-secondary) 100%
  ```
  - Replace with:
  ```css
    var(--accent) 0%,
    var(--accent-2) 100%
  ```

- [ ] **Step 11.4: Verify selectors compile.**
  - Run: `npm run check 2>&1 | tail -20`
  - Confirm no CSS/TS errors introduced by this task.

- [ ] **Step 11.5: Commit.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp add site/styles/main.css && git -C /Users/cameron/Developer/activitypub-mcp commit -m "Bridge legacy CSS aliases to brand tokens; retone brand wordmark gradient"`

### Task 12: Add dual-theme Shiki config + CSS hook (spec §3.6)

This lands the dual-theme Shiki config and its `data-theme` CSS hook now (Phase 3 then relies on it for MDX code blocks).

- [ ] **Step 12.1: Switch the single Shiki theme to dual themes in `astro.config.mjs`.**
  - File: `/Users/cameron/Developer/activitypub-mcp/astro.config.mjs`
  - Replace the existing `markdown` block:
  ```js
    markdown: {
      shikiConfig: {
        theme: "github-dark",
        wrap: true,
      },
    },
  ```
  with:
  ```js
    markdown: {
      shikiConfig: {
        themes: { light: "github-light", dark: "github-dark" },
        wrap: true,
      },
    },
  ```
  - Leave every other key (`site`, `base: "/activitypub-mcp"`, `srcDir: "./site"`, `integrations`, `outDir: "./dist-site"`, `build.assets`, the entire `vite` block) untouched.

- [ ] **Step 12.2: Append the dual-theme code-block CSS hook to the END of `main.css`.**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/styles/main.css`
  ```css
  /* Dual-theme Shiki code blocks (spec §3.6) */
  .astro-code,
  .astro-code span {
    color: var(--shiki-light);
    background-color: var(--shiki-light-bg);
  }

  [data-theme="dark"] .astro-code,
  [data-theme="dark"] .astro-code span {
    color: var(--shiki-dark);
    background-color: var(--shiki-dark-bg);
  }

  @media (prefers-color-scheme: dark) {
    [data-theme="system"] .astro-code,
    [data-theme="system"] .astro-code span {
      color: var(--shiki-dark);
      background-color: var(--shiki-dark-bg);
    }
  }
  ```

- [ ] **Step 12.3: Commit.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp add astro.config.mjs site/styles/main.css && git -C /Users/cameron/Developer/activitypub-mcp commit -m "Switch Shiki to dual light/dark themes with data-theme CSS hook"`

### Task 13: Reskin BaseLayout (logo dot-flip, footer year, OG-image base path, navbar/footer doc links)

Phase 1 already added the font imports, vermilion theme-color, and dropped the Inter link. This task does the remaining BaseLayout work: the inline dot-flip logo mark, the footer year, the OG-image base-path fix, and repointing the navbar/footer doc links away from the dropped `docs/` index.

- [ ] **Step 13.1: Confirm `fonts.css` import precedes the no-FOUC script (Phase 1 invariant).**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/layouts/BaseLayout.astro`
  - Confirm via `grep -n 'src/styles/fonts.css' /Users/cameron/Developer/activitypub-mcp/site/layouts/BaseLayout.astro` that the import exists in the frontmatter. Astro hoists frontmatter style imports into `<head>` before the inline `is:inline` theme script, satisfying the no-FOUC requirement. If missing, add `import "../src/styles/fonts.css";` and `import "../src/styles/tokens.css";` under the `main.css` import.

- [ ] **Step 13.2: Bind the inline header logo dot to `--logo-dot-flip` by inlining the mark.**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/layouts/BaseLayout.astro`
  - Replace the header brand `<img>` line:
  ```astro
              <img src={`${baseURL}logo.svg`} alt="ActivityPub MCP" class="brand-logo" width="32" height="32">
  ```
  with an inline SVG whose top-left ink dot uses `fill="var(--logo-dot-flip)"`:
  ```astro
              <svg class="brand-logo" width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="ActivityPub MCP" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 8 L24 24" stroke="var(--color-vermilion)" stroke-width="3" stroke-linecap="round" fill="none"/>
                <path d="M24 8 L8 24" stroke="var(--color-pine-teal)" stroke-width="3" stroke-linecap="round" fill="none"/>
                <circle cx="6" cy="26" r="3" fill="var(--color-vermilion)"/>
                <circle cx="26" cy="6" r="3" fill="var(--color-pine-teal)"/>
                <circle cx="6" cy="6" r="3" fill="var(--logo-dot-flip)"/>
                <circle cx="26" cy="26" r="3" fill="var(--color-gold)"/>
              </svg>
  ```
  - Geometry per §2.3: crossing vermilion/teal strokes, no center node, four corner dots — BL vermilion, TR pine-teal, TL ink (bound to `--logo-dot-flip`), BR gold.

- [ ] **Step 13.3: Fix the OG-image default so it includes the base path (spec §8).**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/layouts/BaseLayout.astro`
  - The layout computes `socialImage = new URL(image, Astro.site)` with default `image = "/og-image.png"`, which yields `https://cameronrye.github.io/og-image.png` (NO base path). Two edits:
    1. Change the `image` prop default in the frontmatter Props destructure from `/og-image.png` to a base-prefixed default. Find:
    ```astro
    image = "/og-image.png",
    ```
    and replace with:
    ```astro
    image = `${baseURL}og-image.png`,
    ```
    (If the default is written differently, e.g. inline in the destructure as `image = "/og-image.png"`, apply the equivalent change so the default resolves to `${baseURL}og-image.png`.)
    2. Confirm `baseURL` is defined in the frontmatter BEFORE the Props default uses it. If `baseURL` is derived after the destructure, move the `baseURL` derivation above the destructure, OR compute the social image as `new URL(image.startsWith("http") ? image : baseURL + "og-image.png", Astro.site)`. The end requirement: `og:image` and `twitter:image` must render `https://cameronrye.github.io/activitypub-mcp/og-image.png`.
  - After editing, verify the build emits the base-prefixed URL (done in Step 13.7).

- [ ] **Step 13.4: Repoint the navbar Documentation link and footer Getting Started link away from the dropped `docs/` index (spec §4.3).**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/layouts/BaseLayout.astro`
  - The navbar "Documentation" link and the footer "Getting Started" link both use `href={`${baseURL}docs/`}`, which points at the docs index that Phase 4 drops. Repoint BOTH to the new default docs entry. Replace each occurrence of:
  ```astro
  href={`${baseURL}docs/`}
  ```
  with:
  ```astro
  href={`${baseURL}docs/getting-started/installation/`}
  ```
  - Use `replace_all` if the exact same expression appears for both links; otherwise edit each. After the edit confirm no bare `${baseURL}docs/`-to-index link remains:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -nE 'baseURL.}docs/`' site/layouts/BaseLayout.astro && echo "BARE docs/ LINK REMAINS — FIX" || echo "no bare docs/ index links"
  ```
  Expect `no bare docs/ index links`.

- [ ] **Step 13.5: Update the footer copyright year to 2026.**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/layouts/BaseLayout.astro`
  - Replace:
  ```astro
          <p>&copy; 2025 ActivityPub MCP Server Contributors. Licensed under MIT.</p>
  ```
  with:
  ```astro
          <p>&copy; 2026 ActivityPub MCP Server Contributors. Licensed under MIT.</p>
  ```

- [ ] **Step 13.6: Verify the layout type-checks and the no-FOUC script is intact.**
  - Run: `cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -20`
  - Run: `grep -n "is:inline" /Users/cameron/Developer/activitypub-mcp/site/layouts/BaseLayout.astro`
  - Confirm zero new errors and the inline theme `<script is:inline>` block still exists.

- [ ] **Step 13.7: Build and confirm the OG-image URL is base-prefixed.**
  - Run: `cd /Users/cameron/Developer/activitypub-mcp && npx astro build 2>&1 | tail -5 && grep -oE 'property="og:image" content="https://cameronrye.github.io/activitypub-mcp/og-image.png"' dist-site/index.html && echo "OG IMAGE BASE OK"`
  - Expect `OG IMAGE BASE OK`. (The homepage exists in old form here; this only checks the meta URL shape. Final homepage verification is Phase 5/6.)

- [ ] **Step 13.8: Commit.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp add site/layouts/BaseLayout.astro && git -C /Users/cameron/Developer/activitypub-mcp commit -m "Reskin BaseLayout: inline dot-flip logo, 2026 footer, base-prefixed OG image, repoint docs links"`

### Task 14: Reskin Search.astro to brand tokens (preserve all Pagefind logic)

- [ ] **Step 14.1: Replace the hardcoded blue focus ring on the desktop search input.**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/components/Search.astro`
  - In `.search-input:focus`, replace:
  ```css
  .search-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow:
      0 0 0 3px rgba(37, 99, 235, 0.1),
      0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }
  ```
  with:
  ```css
  .search-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }
  ```

- [ ] **Step 14.2: Replace the blue hover/focus tints on the search button.**
  - Replace `.search-button:hover`:
  ```css
  .search-button:hover {
    color: var(--color-primary);
    background-color: rgba(37, 99, 235, 0.1);
  }
  ```
  with:
  ```css
  .search-button:hover {
    color: var(--accent);
    background-color: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  ```
  - Replace `.search-button:focus`:
  ```css
  .search-button:focus {
    outline: none;
    color: var(--color-primary);
    background-color: rgba(37, 99, 235, 0.1);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  }
  ```
  with:
  ```css
  .search-button:focus {
    outline: none;
    color: var(--accent);
    background-color: color-mix(in srgb, var(--accent) 12%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  ```

- [ ] **Step 14.3: Replace the loading-spinner accent and the blue result `mark` highlight.**
  - In `.loading-spinner`, replace `border-top: 2px solid var(--color-primary);` with `border-top: 2px solid var(--accent);`
  - Replace `.result-excerpt mark`:
  ```css
  .result-excerpt mark {
    background-color: rgba(59, 130, 246, 0.15);
    color: inherit;
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    font-weight: var(--font-medium);
  }
  ```
  with:
  ```css
  .result-excerpt mark {
    background-color: color-mix(in srgb, var(--accent-3) 35%, transparent);
    color: inherit;
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    font-weight: var(--font-medium);
  }
  ```
  - Replace the hover/active `mark` rule:
  ```css
  .search-result:hover .result-excerpt mark,
  .search-result.active .result-excerpt mark {
    background-color: rgba(59, 130, 246, 0.15);
    color: inherit;
  }
  ```
  with:
  ```css
  .search-result:hover .result-excerpt mark,
  .search-result.active .result-excerpt mark {
    background-color: color-mix(in srgb, var(--accent-3) 35%, transparent);
    color: inherit;
  }
  ```

- [ ] **Step 14.4: Retone the focus-visible outlines and mobile-search focus/hover blues.**
  - Use `replace_all` on the literal `var(--color-primary)` within `Search.astro` → `var(--accent)` (covers `.search-input:focus-visible`, `.search-button:focus-visible`, `.search-result:focus-visible`, and the high-contrast `.search-result` border).
  - Replace `.mobile-search-input:focus`:
  ```css
  .mobile-search-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  ```
  with:
  ```css
  .mobile-search-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  ```
  - In `.mobile-search-close:hover`, replace `border-color: var(--color-primary);` and `color: var(--color-primary);` with `var(--accent)` (the `replace_all` above already covers these).

- [ ] **Step 14.5: Confirm no Pagefind/keyboard logic changed and only CSS was touched.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp diff site/components/Search.astro | grep -E '^\+' | grep -iE 'pagefind|addEventListener|querySelector|debounce|window\.' && echo "LOGIC CHANGED — REVERT" || echo "CSS-only: OK"`
  - Must print `CSS-only: OK`.

- [ ] **Step 14.6: Verify and commit.**
  - Run: `grep -nE 'rgba\(37, 99, 235|rgba\(59, 130, 246|--color-primary' /Users/cameron/Developer/activitypub-mcp/site/components/Search.astro || echo "no legacy blue tokens remain"`
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp add site/components/Search.astro && git -C /Users/cameron/Developer/activitypub-mcp commit -m "Reskin Search component to brand tokens (preserve Pagefind logic)"`

### Task 15: Reskin ThemeToggle.astro to brand tokens (preserve light/dark/system logic)

- [ ] **Step 15.1: Retone the toggle button hover border.**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/components/ThemeToggle.astro`
  - In `.theme-toggle-btn:hover`, replace `border-color: var(--color-primary);` with `border-color: var(--accent);`

- [ ] **Step 15.2: Retone the dropdown option hover/active states.**
  - Replace `.theme-option:hover`:
  ```css
  .theme-option:hover {
    background-color: var(--bg-secondary);
    color: var(--color-primary);
  }
  ```
  with:
  ```css
  .theme-option:hover {
    background-color: var(--bg-raised);
    color: var(--accent);
  }
  ```
  - Replace `.theme-option.active`:
  ```css
  .theme-option.active {
    background-color: var(--color-primary);
    color: var(--color-white);
  }
  ```
  with:
  ```css
  .theme-option.active {
    background-color: var(--accent);
    color: var(--color-paper);
  }
  ```

- [ ] **Step 15.3: Confirm the toggle JS is untouched.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp diff site/components/ThemeToggle.astro | grep -E '^[-+]' | grep -iE 'localStorage|matchMedia|data-theme|applyTheme|addEventListener'`
  - Must print NOTHING.

- [ ] **Step 15.4: Verify and commit.**
  - Run: `grep -n -- '--color-primary\|--color-white' /Users/cameron/Developer/activitypub-mcp/site/components/ThemeToggle.astro || echo "no legacy color tokens remain"`
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp add site/components/ThemeToggle.astro && git -C /Users/cameron/Developer/activitypub-mcp commit -m "Reskin ThemeToggle to brand tokens (preserve light/dark/system logic)"`

### Task 16: Reskin SocialLinks.astro to brand tokens (preserve variants/structure)

- [ ] **Step 16.1: Retone the base hover color/background.**
  - File: `/Users/cameron/Developer/activitypub-mcp/site/components/SocialLinks.astro`
  - Replace `.social-link:hover`:
  ```css
  .social-link:hover {
    color: var(--color-primary);
    background-color: rgba(37, 99, 235, 0.05);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  ```
  with:
  ```css
  .social-link:hover {
    color: var(--accent);
    background-color: color-mix(in srgb, var(--accent) 8%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  ```

- [ ] **Step 16.2: Replace the hardcoded platform hover colors with brand tokens.**
  - Replace:
  ```css
  /* Specific social platform colors on hover */
  .social-link[href*="github"]:hover {
    color: #333;
  }

  .social-link[href*="npmjs"]:hover {
    color: #cb3837;
  }
  ```
  with:
  ```css
  /* Brand-token hover accents (replaces hardcoded #333 / #cb3837) */
  .social-link[href*="github"]:hover {
    color: var(--accent-2);
  }

  .social-link[href*="npmjs"]:hover {
    color: var(--accent);
  }
  ```

- [ ] **Step 16.3: Remove the now-redundant dark-mode `#f0f6fc` GitHub overrides.**
  - Delete:
  ```css
  /* Dark mode adjustments */
  @media (prefers-color-scheme: dark) {
    .social-link[href*="github"]:hover {
      color: #f0f6fc;
    }
  }

  /* Theme-specific overrides */
  :root[data-theme="dark"] .social-link[href*="github"]:hover {
    color: #f0f6fc;
  }
  ```

- [ ] **Step 16.4: Confirm props/variants/SVG markup unchanged.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp diff site/components/SocialLinks.astro | grep -E '^[-+]' | grep -iE 'variant|size|href=|<svg|<path|social-links--'`
  - Must print NOTHING.

- [ ] **Step 16.5: Verify and commit.**
  - Run: `grep -nE '#333|#cb3837|#f0f6fc|rgba\(37, 99, 235|--color-primary' /Users/cameron/Developer/activitypub-mcp/site/components/SocialLinks.astro || echo "no legacy colors remain"`
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp add site/components/SocialLinks.astro && git -C /Users/cameron/Developer/activitypub-mcp commit -m "Reskin SocialLinks hover states to brand tokens"`

### Task 17: Build the canonical CopyButton component (single source — Phase 5 imports this, never recreates it)

Spec §6 CopyButton is built ONCE here. It supports BOTH the CodeBlock usage (via the `class` prop, consumed as `code-block-copy`) AND the homepage install-snippet usage (no class). Phase 5 imports this exact component; it does not redefine it.

- [ ] **Step 17.1: Create `site/components/CopyButton.astro`.**
  - File (new): `/Users/cameron/Developer/activitypub-mcp/site/components/CopyButton.astro`
  ```astro
  ---
  interface Props {
    /** Exact text copied to the clipboard. */
    text: string;
    /** Accessible label / tooltip. */
    label?: string;
    /** Extra classes for positioning in the consuming layout. */
    class?: string;
  }
  const { text, label = "Copy", class: className = "" } = Astro.props;
  ---

  <button
    type="button"
    class={`copy-button ${className}`}
    data-copy={text}
    aria-label={label}
    title={label}
  >
    <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: none;">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span class="copy-text">{label}</span>
  </button>

  <style>
    .copy-button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background-color: var(--bg-raised);
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      line-height: 1;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .copy-button:hover {
      color: var(--accent);
      border-color: var(--accent);
      background-color: color-mix(in srgb, var(--accent) 8%, var(--bg-raised));
    }
    .copy-button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .copy-button.copied {
      color: var(--accent-2);
      border-color: var(--accent-2);
      background-color: color-mix(in srgb, var(--accent-2) 10%, var(--bg-raised));
    }
    .copy-button svg { flex-shrink: 0; }
    @media (prefers-reduced-motion: reduce) {
      .copy-button { transition: none; }
    }
  </style>

  <script>
    function initCopyButtons() {
      const buttons = document.querySelectorAll<HTMLButtonElement>(".copy-button[data-copy]");
      buttons.forEach((button) => {
        if (button.dataset.copyBound === "true") return;
        button.dataset.copyBound = "true";

        button.addEventListener("click", async () => {
          const text = button.dataset.copy ?? "";
          const copyIcon = button.querySelector<SVGElement>(".copy-icon");
          const checkIcon = button.querySelector<SVGElement>(".check-icon");
          const textEl = button.querySelector<HTMLElement>(".copy-text");
          const originalLabel = textEl?.textContent ?? "Copy";

          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(text);
            } else {
              const ta = document.createElement("textarea");
              ta.value = text;
              ta.style.position = "fixed";
              ta.style.left = "-9999px";
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              document.execCommand("copy");
              document.body.removeChild(ta);
            }

            button.classList.add("copied");
            if (copyIcon) copyIcon.style.display = "none";
            if (checkIcon) checkIcon.style.display = "inline";
            if (textEl) textEl.textContent = "Copied!";

            window.setTimeout(() => {
              button.classList.remove("copied");
              if (copyIcon) copyIcon.style.display = "inline";
              if (checkIcon) checkIcon.style.display = "none";
              if (textEl) textEl.textContent = originalLabel;
            }, 2000);
          } catch {
            if (textEl) textEl.textContent = "Press Ctrl+C";
            window.setTimeout(() => {
              if (textEl) textEl.textContent = originalLabel;
            }, 2000);
          }
        });
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initCopyButtons);
    } else {
      initCopyButtons();
    }
  </script>
  ```

- [ ] **Step 17.2: Create the CodeBlock wrapper that pairs a labelled snippet with a CopyButton.**
  - File (new): `/Users/cameron/Developer/activitypub-mcp/site/components/CodeBlock.astro`
  - This is consumed by the homepage Quick install section in Phase 5 (Task closes the "built-but-unused" gap), so it is not dead.
  ```astro
  ---
  import CopyButton from "./CopyButton.astro";
  interface Props {
    /** The exact code/command to display and copy. */
    code: string;
    /** Optional language label shown in the header chip. */
    lang?: string;
    /** Accessible label for the copy control. */
    label?: string;
  }
  const { code, lang, label = "Copy" } = Astro.props;
  ---

  <figure class="code-block">
    <div class="code-block-bar">
      {lang && <span class="code-block-lang">{lang}</span>}
      <CopyButton text={code} label={label} class="code-block-copy" />
    </div>
    <pre class="code-block-pre"><code>{code}</code></pre>
  </figure>

  <style>
    .code-block {
      position: relative;
      margin: 0;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      background-color: var(--bg-raised);
      overflow: hidden;
    }
    .code-block-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border-color);
      background-color: color-mix(in srgb, var(--text-primary) 4%, var(--bg-raised));
    }
    .code-block-lang {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .code-block-bar :global(.code-block-copy) { margin-left: auto; }
    .code-block-pre {
      margin: 0;
      padding: var(--space-4);
      overflow-x: auto;
    }
    .code-block-pre code {
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      line-height: var(--leading-relaxed);
      color: var(--text-primary);
      white-space: pre;
    }
  </style>
  ```

- [ ] **Step 17.3: Type-check both new components.**
  - Run: `npm run check 2>&1 | tail -20`
  - Confirm zero errors in `CopyButton.astro` / `CodeBlock.astro`.

- [ ] **Step 17.4: Commit.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp add site/components/CopyButton.astro site/components/CodeBlock.astro && git -C /Users/cameron/Developer/activitypub-mcp commit -m "Add canonical CopyButton and CodeBlock wrapper components"`

### Task 18: Remove the dead SimpleSearch.astro

- [ ] **Step 18.1: Re-confirm SimpleSearch is unused (only self-references).**
  - Run: `grep -rn 'SimpleSearch' /Users/cameron/Developer/activitypub-mcp/site/`
  - Expected output is ONLY the self-references inside the file itself — no `import … SimpleSearch` from any layout or page. If any OTHER file imports it, STOP.

- [ ] **Step 18.2: Delete the file.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp rm site/components/SimpleSearch.astro`

- [ ] **Step 18.3: Verify it is gone and nothing references it.**
  - Run: `test ! -f /Users/cameron/Developer/activitypub-mcp/site/components/SimpleSearch.astro && echo "deleted"; grep -rn 'SimpleSearch' /Users/cameron/Developer/activitypub-mcp/site/ || echo "no references remain"`
  - Both must succeed.

- [ ] **Step 18.4: Commit.**
  - Run: `git -C /Users/cameron/Developer/activitypub-mcp commit -m "Remove unused SimpleSearch component"`

### Task 19: Full check + light/dark/system visual verification (dev port 4321)

- [ ] **Step 19.1: Run a clean astro check across the project.**
  - Run: `cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -30`
  - Confirm zero errors.

- [ ] **Step 19.2: Start the dev server in the background and confirm it serves on 4321.**
  - Run `npm --prefix /Users/cameron/Developer/activitypub-mcp run dev:site` in the background (use `run_in_background`).
  - Poll until ready with a Monitor/until loop (NOT a foreground sleep): `until curl -fsS http://localhost:4321/activitypub-mcp/ -o /dev/null 2>/dev/null; do :; done; echo "dev up"`.

- [ ] **Step 19.3: Verify the inline header logo dot is wired to `--logo-dot-flip` in the served HTML.**
  - Run: `curl -fsS http://localhost:4321/activitypub-mcp/ | grep -o 'fill="var(--logo-dot-flip)"'`
  - Must print `fill="var(--logo-dot-flip)"`.

- [ ] **Step 19.4: Confirm no Google Fonts request and theme-color is vermilion.**
  - Run: `curl -fsS http://localhost:4321/activitypub-mcp/ | grep -E 'fonts.googleapis|fonts.gstatic' && echo "STILL REQUESTING GOOGLE FONTS — FIX" || echo "no google fonts: OK"`
  - Run: `curl -fsS http://localhost:4321/activitypub-mcp/ | grep -o 'name="theme-color" content="#E8552D"'`
  - First must print `no google fonts: OK`; second must print the vermilion theme-color meta.

- [ ] **Step 19.5: Visually verify all three theme states + the dot-flip.**
  - Open `http://localhost:4321/activitypub-mcp/`.
  - Light (default): background paper `#FBF7F0`, ink text, wordmark gradient vermilion→teal, inline logo top-left dot INK.
  - Dark: `<html data-theme="dark">`, ink background, paper text, the inline logo top-left dot FLIPS to paper. Vermilion CTA/links remain.
  - System: with OS dark, page renders dark via the `@media (prefers-color-scheme: dark) [data-theme='system']` block; with OS light, light. Use DevTools "Emulate CSS prefers-color-scheme".
  - Confirm focus rings (search input/button, theme-option hover) are vermilion, social hover is vermilion/teal, no FOUC on reload.

- [ ] **Step 19.6: Stop the dev server.**
  - Stop the background `dev:site` job (TaskStop).

- [ ] **Step 19.7: Final Phase 2 commit (only if verification surfaced tweaks).**
  - If a wrong color was found and edited, re-run `npm run check`, then: `git -C /Users/cameron/Developer/activitypub-mcp add -A && git -C /Users/cameron/Developer/activitypub-mcp commit -m "Phase 2: finalize layout/component reskin after light/dark/system verification"`
  - If no tweaks were needed, the phase is already fully committed.

**Phase 2 exit criteria:** legacy-alias bridge added; dual-theme Shiki config + CSS hook in place; BaseLayout reskinned (inline dot-flip logo, 2026 footer, base-prefixed OG image, navbar/footer doc links repointed to `getting-started/installation`); Search/ThemeToggle/SocialLinks retoned to brand tokens with all logic preserved; canonical CopyButton + CodeBlock built (CodeBlock consumed by Phase 5 install snippets); `SimpleSearch.astro` removed; light/dark/system parity and dot-flip verified on dev port 4321.

---

## Phase 3 — Astro content-collection scaffolding

This phase implements spec §3 (Tech & Architecture). Prerequisites: Phases 1–2 complete (fonts, tokens, manifest, BaseLayout reskin, dual-theme Shiki config already landed in Phase 2 Task 12). Confirmed against the live repo: `site/src/` does not yet exist except for `src/styles`, `src/data`; `astro.config.mjs` is at repo root with `srcDir: "./site"`, `base: "/activitypub-mcp"`, `outDir: "./dist-site"`; `DocsLayout.astro` lives at `site/layouts/DocsLayout.astro` and still contains the hand-maintained `_docsNav` array. All site verification uses `npm run check` (astro check) or `npm run build:site` — never bare `npx astro check`, and never `npm run typecheck` (which does not cover `site/`).

### Task 20: Apply latest Astro 5.x patch (stay within 5.x)

- [ ] **Step 20.1: Confirm current Astro version is on the 5.x line.**
  - Run: `npm ls astro`
  - Confirm the resolved version is `5.x.x` (manifest declares `^5.15.8`).

- [ ] **Step 20.2: Apply latest 5.x patch/minor only (never 6.x).**
  - Run: `npm install "astro@^5.15.8"` (caret keeps you inside 5.x). Do NOT run `astro@latest` — spec §3.1/§12 forbid 6.x.
  - Run: `npm ls astro` again and confirm the major is still `5`.

- [ ] **Step 20.3: Verify with astro check (NOT typecheck — typecheck does not cover site).**
  - Run: `npm run check 2>&1 | tail -10`
  - Confirm no new errors.
  - Commit: `git add package.json package-lock.json && git commit -m "chore: apply latest Astro 5.x patch"`

### Task 21: Add the content-collection config (glob loader + zod schema)

- [ ] **Step 21.1: Create the `site/src/` source tree directories.**
  - Run: `mkdir -p /Users/cameron/Developer/activitypub-mcp/site/src/content/docs /Users/cameron/Developer/activitypub-mcp/site/src/pages/docs`
  - Note: `glob`'s `base` resolves relative to `srcDir` (`./site`), so `./src/content/docs` resolves to `site/src/content/docs` (spec §3.2).

- [ ] **Step 21.2: Write `site/src/content.config.ts`** (file is `content.config.ts` at `site/src/`, NOT `content/config.ts`, NOT repo-root `src/`):
    ```ts
    import { defineCollection } from "astro:content";
    import { glob } from "astro/loaders";
    import { z } from "astro/zod";

    const docs = defineCollection({
      loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/docs" }),
      schema: z.object({
        title: z.string(),
        description: z.string(),
        group: z.enum([
          "Getting Started",
          "Guides",
          "API Reference",
          "Reference",
          "Development",
          "Specifications",
        ]),
        order: z.number().int(),
        section: z.string().optional(),
      }),
    });

    export const collections = { docs };
    ```

- [ ] **Step 21.3: Verify the config with astro check.**
  - Run: `cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10`
  - Confirm no errors. (`astro:content`, `astro/loaders`, `astro/zod` come from Astro 5.x — no extra dep.)
  - Commit: `git add site/src/content.config.ts && git commit -m "feat: add docs content collection config with glob loader and zod schema"`

### Task 22: Add the single dynamic docs route using `render(entry)`

- [ ] **Step 22.1: Write `site/src/pages/docs/[...slug].astro`** (spec §3.3 — uses standalone `render(entry)`):
    ```astro
    ---
    import { getCollection, render } from "astro:content";
    import DocsLayout from "../../../layouts/DocsLayout.astro";

    export async function getStaticPaths() {
      const docs = await getCollection("docs");
      return docs.map((entry) => ({
        params: { slug: entry.id },
        props: { entry },
      }));
    }

    const { entry } = Astro.props;
    const { Content, headings } = await render(entry);
    ---

    <DocsLayout entry={entry} headings={headings}>
      <Content />
    </DocsLayout>
    ```
  - Path-depth: `../../../layouts/DocsLayout.astro` climbs `docs/` → `pages/` → `src/` to reach `site/`, then into `layouts/` — three `../`, matching `site/layouts/DocsLayout.astro`.

- [ ] **Step 22.2: Check the route file with astro check.**
  - Run: `cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10`
  - Confirm no errors. (The route will not fully build until `DocsLayout` accepts the new props in Task 23 and an entry exists in Task 25.)
  - Commit: `git add "site/src/pages/docs/[...slug].astro" && git commit -m "feat: add dynamic docs route using render(entry)"`

### Task 23: Rebuild DocsLayout — delete `_docsNav`, collection-driven sidebar, in-page TOC with active-section highlighting

- [ ] **Step 23.1: Overwrite `/Users/cameron/Developer/activitypub-mcp/site/layouts/DocsLayout.astro`** with the collection-driven version below. It deletes the hand-maintained `_docsNav` array, drives the sidebar from `getCollection("docs")` grouped by `data.group` in the canonical §4 order sorted by `data.order`, computes active-link state from `Astro.url.pathname` (trailing-slash normalized), renders the in-page TOC from `headings` filtered to depth ≤ 3, adds an IntersectionObserver scroll-spy that toggles `.active` on `.toc-link` (spec §6 TableOfContents active-section highlighting), and preserves the `data-pagefind-body` marker and the two-column grid / sticky-sidebar / 1024px-reflow behavior:
    ```astro
    ---
    import { getCollection } from "astro:content";
    import BaseLayout from "./BaseLayout.astro";

    interface Heading {
      depth: number;
      slug: string;
      text: string;
    }

    const { entry, headings = [] } = Astro.props as {
      entry: { id: string; data: { title: string; description: string; group: string; order: number } };
      headings?: Heading[];
    };

    const _pageTitle = entry?.data?.title || "Documentation";
    const _pageDescription =
      entry?.data?.description || "ActivityPub MCP Server Documentation";

    const baseURL = import.meta.env.BASE_URL.endsWith("/")
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;

    const GROUP_ORDER = [
      "Getting Started",
      "Guides",
      "API Reference",
      "Reference",
      "Development",
      "Specifications",
    ];

    const allDocs = await getCollection("docs");
    const navSections = GROUP_ORDER.map((group) => ({
      title: group,
      items: allDocs
        .filter((doc) => doc.data.group === group)
        .sort((a, b) => a.data.order - b.data.order)
        .map((doc) => ({
          title: doc.data.title,
          href: `${baseURL}docs/${doc.id}/`,
        })),
    })).filter((section) => section.items.length > 0);

    // Trailing-slash-normalized active comparison (robust to trailingSlash config)
    const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);
    const _currentPath = stripSlash(Astro.url.pathname);

    const tocHeadings = headings.filter((h) => h.depth >= 2 && h.depth <= 3);
    ---

    <BaseLayout title={_pageTitle} description={_pageDescription}>
      <div class="docs-layout">
        <div class="container">
          <div class="docs-grid">
            <aside class="docs-sidebar">
              <div class="sidebar-content">
                <div class="sidebar-header">
                  <h2>Documentation</h2>
                </div>

                <nav class="docs-nav">
                  {navSections.map(section => (
                    <div class="nav-section">
                      <h3 class="nav-section-title">{section.title}</h3>
                      <ul class="nav-section-items">
                        {section.items.map(item => (
                          <li>
                            <a
                              href={item.href}
                              class={`nav-item ${stripSlash(item.href) === _currentPath ? 'active' : ''}`}
                              aria-current={stripSlash(item.href) === _currentPath ? 'page' : undefined}
                            >
                              {item.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
              </div>
            </aside>

            <main class="docs-main">
              {tocHeadings.length > 0 && (
                <nav class="docs-toc" aria-label="Table of contents">
                  <h2 class="toc-title">On this page</h2>
                  <ul class="toc-list">
                    {tocHeadings.map(heading => (
                      <li class={`toc-item toc-depth-${heading.depth}`}>
                        <a href={`#${heading.slug}`} class="toc-link" data-toc-slug={heading.slug}>{heading.text}</a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              <div class="docs-content" data-pagefind-body>
                <slot />
              </div>
            </main>
          </div>
        </div>
      </div>
    </BaseLayout>

    <script>
      // Scroll-spy: highlight the TOC link for the heading currently in view (spec §6).
      function initTocScrollSpy() {
        const tocLinks = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(".toc-link[data-toc-slug]")
        );
        if (tocLinks.length === 0) return;

        const linkBySlug = new Map(tocLinks.map((a) => [a.dataset.tocSlug!, a]));
        const headings = tocLinks
          .map((a) => document.getElementById(a.dataset.tocSlug!))
          .filter((el): el is HTMLElement => el !== null);
        if (headings.length === 0) return;

        const setActive = (slug: string) => {
          for (const a of tocLinks) a.classList.toggle("active", a.dataset.tocSlug === slug);
        };

        const observer = new IntersectionObserver(
          (entries) => {
            const visible = entries
              .filter((e) => e.isIntersecting)
              .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (visible.length > 0 && visible[0].target.id) {
              setActive(visible[0].target.id);
            }
          },
          { rootMargin: "0px 0px -70% 0px", threshold: 0 }
        );

        for (const h of headings) observer.observe(h);
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTocScrollSpy);
      } else {
        initTocScrollSpy();
      }
    </script>

    <style>
      .docs-layout { min-height: calc(100vh - 200px); }

      .docs-grid {
        display: grid;
        grid-template-columns: 280px 1fr;
        gap: var(--space-8);
        align-items: start;
      }

      @media (max-width: 1024px) {
        .docs-grid { grid-template-columns: 1fr; }
        .docs-sidebar { order: 2; }
        .docs-main { order: 1; }
      }

      .docs-sidebar {
        position: sticky;
        top: calc(var(--space-20) + var(--space-4));
        max-height: calc(100vh - var(--space-16));
        overflow-y: auto;
      }

      .sidebar-content {
        background-color: var(--bg-raised);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-6);
      }

      .sidebar-header h2 {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
        margin-bottom: var(--space-6);
        color: var(--text-primary);
      }

      .nav-section { margin-bottom: var(--space-6); }
      .nav-section:last-child { margin-bottom: 0; }

      .nav-section-title {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
        margin-bottom: var(--space-3);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .nav-section-items { list-style: none; }
      .nav-section-items li { margin-bottom: var(--space-1); }

      .nav-item {
        display: block;
        padding: var(--space-2) var(--space-3);
        color: var(--text-muted);
        text-decoration: none;
        border-radius: var(--radius-sm);
        font-size: var(--text-sm);
        transition: all var(--transition-fast);
      }

      .nav-item:hover {
        background-color: var(--bg-primary);
        color: var(--text-primary);
      }

      .nav-item.active {
        background-color: var(--accent);
        color: var(--color-paper);
      }

      .docs-main { display: block; }
      .docs-content { max-width: none; }

      .docs-toc {
        background-color: var(--bg-raised);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-4) var(--space-6);
        margin-bottom: var(--space-8);
      }

      .toc-title {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-primary);
        margin-bottom: var(--space-3);
      }

      .toc-list { list-style: none; }
      .toc-item { margin-bottom: var(--space-1); }
      .toc-depth-3 { padding-left: var(--space-4); }

      .toc-link {
        color: var(--text-muted);
        text-decoration: none;
        font-size: var(--text-sm);
        transition: color var(--transition-fast);
        border-left: 2px solid transparent;
        padding-left: var(--space-2);
        margin-left: calc(-1 * var(--space-2));
      }

      .toc-link:hover { color: var(--accent); }
      .toc-link.active {
        color: var(--accent);
        border-left-color: var(--accent);
        font-weight: var(--font-semibold);
      }

      @media (max-width: 1024px) {
        .docs-sidebar {
          position: relative;
          top: auto;
          max-height: none;
          margin-bottom: var(--space-8);
        }
      }
    </style>
    ```
  - Token note: the rewrite uses §2.4 aliases (`--bg-raised`, `--bg-primary`, `--border-color`, `--text-muted`, `--accent`, `--color-paper`) and `--font-display`, NOT the deleted `--bg-secondary`/`--border-primary`/`--color-white`. Sidebar links use class `nav-item` (Phase 4/6 greps expect `nav-item`, not `nav-link`).

- [ ] **Step 23.2: Check the rebuilt layout.**
  - Run: `cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10`
  - Confirm no errors. The `headings` prop shape (`{ depth, slug, text }`) matches `render(entry)`.
  - Commit: `git add site/layouts/DocsLayout.astro && git commit -m "refactor: rebuild DocsLayout with collection-driven sidebar, TOC, and scroll-spy"`

### Task 24: Confirm no stray `_docsNav` / dead-token references remain

- [ ] **Step 24.1: Verify the hand-maintained nav array is gone.**
  - Run: `grep -rn "_docsNav" /Users/cameron/Developer/activitypub-mcp/site/ || echo "OK: no _docsNav references remain"`
  - Confirm the only acceptable output is `OK: no _docsNav references remain`.

- [ ] **Step 24.2: Verify the rebuilt layout uses brand tokens, not the deleted ones.**
  - Run: `grep -nE "var\(--(bg-secondary|bg-tertiary|border-primary|text-secondary|color-primary|color-white)\)" /Users/cameron/Developer/activitypub-mcp/site/layouts/DocsLayout.astro || echo "OK: no dead tokens in DocsLayout"`
  - Confirm `OK: no dead tokens in DocsLayout`.

### Task 25: Add ONE placeholder MDX entry to prove the collection + route + base path

- [ ] **Step 25.1: Create a temporary placeholder MDX file** at `/Users/cameron/Developer/activitypub-mcp/site/src/content/docs/getting-started/_scaffold-check.mdx`:
    ````mdx
    ---
    title: "Scaffold Check"
    description: "Temporary placeholder verifying the content collection, dynamic route, sidebar, TOC, and base path before bulk migration."
    group: "Getting Started"
    order: 1
    ---

    ## Overview

    This is a temporary scaffold-verification page. It is deleted at the end of Phase 3.

    ### Code sample

    ```bash
    npx activitypub-mcp install
    ```

    ## Second Section

    Confirms the in-page TOC renders multiple h2/h3 entries.
    ````

- [ ] **Step 25.2: Build and confirm the placeholder route is generated under the base path.**
  - Run: `cd /Users/cameron/Developer/activitypub-mcp && npm run build:site 2>&1 | tail -20`
  - Confirm no "empty collection" warning or getStaticPaths error.
  - Run: `ls -la /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html`
  - Confirm the file exists (proves the glob `base` is correct — the §3.2 gotcha).

- [ ] **Step 25.3: Confirm the placeholder content rendered.**
  - Run: `grep -c "Scaffold Check" /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html`
  - Confirm `>= 1`.
  - Run: `grep -c "scaffold-verification" /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html`
  - Confirm `>= 1`.

### Task 26: Verify sidebar, active-link, TOC, base path, and dual-theme code blocks in the built HTML

- [ ] **Step 26.1: Verify the sidebar was generated from the collection.**
  - Run: `grep -o 'class="nav-section-title">[^<]*' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html`
  - Confirm output includes `Getting Started`; empty groups must NOT appear.

- [ ] **Step 26.2: Verify active-link state + base-path href (trailing-slash robust).**
  - Run: `grep -o '<a href="/activitypub-mcp/docs/getting-started/_scaffold-check/"[^>]*' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html`
  - Confirm the anchor exists, includes the `/activitypub-mcp/` base prefix, and carries `class="nav-item active"` and `aria-current="page"`. (The active comparison is trailing-slash normalized; this works regardless of trailingSlash config.)

- [ ] **Step 26.3: Verify the in-page TOC rendered h2/h3 headings.**
  - Run: `grep -o 'class="toc-link"[^>]*>[^<]*' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html`
  - Confirm `Overview`, `Code sample`, and `Second Section` appear.
  - Run: `grep -o 'href="#overview"' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html`
  - Confirm the anchor matches the auto-generated slug.

- [ ] **Step 26.4: Verify dual-theme Shiki emitted dark color variables + Pagefind marker.**
  - Run: `grep -o -- '--shiki-dark:' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html | head -1`
  - Confirm `--shiki-dark:` present (proves Phase 2 Task 12 dual-theme config took effect).
  - Run: `grep -c "data-pagefind-body" /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/_scaffold-check/index.html`
  - Confirm `>= 1`.

- [ ] **Step 26.5: Optional visual spot-check.**
  - Run `npm run preview:site` (background). Open `http://localhost:4321/activitypub-mcp/docs/getting-started/_scaffold-check/` and confirm: sidebar "Getting Started" group with the active link in vermilion, the "On this page" TOC lists three headings and the active one highlights as you scroll (scroll-spy), and theme toggle switches the code block between github-light/github-dark. Stop the preview.

- [ ] **Step 26.6: Remove the placeholder and rebuild clean.**
  - Run: `rm /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/getting-started/_scaffold-check.mdx`
  - Run: `cd /Users/cameron/Developer/activitypub-mcp && npm run build:site` and confirm the build still succeeds with zero MDX entries (must not error on an empty collection).
  - Commit: `git add -A && git commit -m "chore: verify content-collection scaffolding with placeholder MDX, then remove it"`

**Phase 3 exit criteria:** `site/src/content.config.ts` exists with glob loader + zod schema; `astro.config.mjs` uses dual-theme Shiki (landed Phase 2) with the matching CSS hook; `site/src/pages/docs/[...slug].astro` renders via `render(entry)`; `DocsLayout.astro` has no `_docsNav`, generates the grouped/ordered sidebar (class `nav-item`) + h2/h3 TOC with active-link state, scroll-spy active-section highlighting, and a preserved `data-pagefind-body`; a placeholder MDX entry built, routed under `/activitypub-mcp/...`, populated sidebar/TOC, and emitted dual-theme code-block vars before removal.

---

## Phase 4 — Docs migration (20 pages + 4 consolidations + 2 drops)

Prerequisite: Phase 3 scaffold complete. Per-page verification uses `npm run check` (astro check / zod schema typegen) — NOT `npm run typecheck` (which does not cover `site/`). Full build/link verification is Tasks 41–42.

### Task 27: Establish the per-page MDX migration procedure (read first, do not skip)

This defines the repeatable conversion procedure used by every page task below.

- [ ] **Step 27.1: Confirm the Phase 3 scaffold is in place.**
  ```bash
  ls /Users/cameron/Developer/activitypub-mcp/site/src/content.config.ts \
     /Users/cameron/Developer/activitypub-mcp/site/src/pages/docs/\[...slug\].astro \
     /Users/cameron/Developer/activitypub-mcp/site/layouts/DocsLayout.astro
  ```
  If any is missing, STOP — Phase 3 is incomplete.

- [ ] **Step 27.2: Create the six target group directories** (idempotent):
  ```bash
  mkdir -p /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/getting-started \
           /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/guides \
           /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/api \
           /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/reference \
           /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/development \
           /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/specifications
  ```

- [ ] **Step 27.3: Internalize the conversion rules (THE PROCEDURE).** For every `.astro` page, produce its `.mdx` target by applying:
  1. **Frontmatter.** Replace the Astro `---` script block with MDX YAML frontmatter carrying the five schema fields from §3.2/§4.4. Derive `title`/`description` from the page's own `<h1>`/lead paragraph (strip the `- ActivityPub MCP Server` suffix from the `const title`). `group`/`order`/slug come from the §4.1 table row.
  2. **Drop the layout wrapper and page header.** Delete `<DocsLayout ...>` tags AND the page's own header block (`<div class="...-header">` containing the `<h1>` and lead `<p>`). `DocsLayout` renders the `<h1>` from `entry.data.title` and the lead from `entry.data.description`; re-emitting duplicates them.
  3. **Unwrap purely structural wrappers** (`<div class="setup-page">`, inner `<div class="container">`/`<div class="...-content">`). Keep semantic content wrappers (e.g. `<div class="prompt-card">`) as raw HTML.
  4. **Convert headings** `<h2>`→`##`, `<h3>`→`###`, `<h4>`→`####`. Strip decorative leading emoji for clean TOC slugs. No `<h1>` in the body.
  5. **Convert prose/lists.** `<p>`→paragraph; `<ul><li>`→`- `; `<ol><li>`→`1.`; `<blockquote>`→`> `. Inline `<code>`→`` `x` ``, `<strong>`→`**`, `<em>`→`*`, `<a href>`→`[text](...)` (rule 8 link map).
  6. **Convert code blocks.** Plain `<pre><code>cmd</code></pre>`→fenced block with a language tag (` ```bash `, ` ```json `, ` ```ts `, ` ```js `). `set:html` template-literal blocks → un-escape `\`` → backtick, `\n` → newline, emit as a normal fenced block. Inline `<code>` one-liners stay inline. Do NOT add per-block copy buttons in docs MDX (Shiki dual-theme + `wrap:true` from Phase 2/3 handles highlighting).
  7. **Convert tables.** Prefer GFM pipe tables for simple cells; keep raw `<table>` HTML only for multi-line cells, nested blocks, or `colspan`.
  8. **Rewrite internal links to new slugs** as root-absolute base-prefixed paths, e.g. `[Configuration](/activitypub-mcp/docs/getting-started/configuration/)`, mapping OLD→NEW via the Task 36 link map. External links unchanged.
  9. **Escape MDX-hostile chars in prose.** Outside code, escape literal `{` as `\{` and literal `<` (not opening a tag) as `&lt;`. Content inside code fences/spans is safe.
  10. **Strip the `<style>` block.** All visual styling comes from `main.css` brand tokens.

- [ ] **Step 27.4: Internalize the per-page verification loop.** After writing each `.mdx`, run `npm run check 2>&1 | tail -20` and confirm no schema/type error for the new file. Commit after each page.

### Task 28: Migrate Getting Started — `getting-started/installation` (keep)

- [ ] **Step 28.1: Read** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/setup/index.astro` in full.
- [ ] **Step 28.2: Apply the Task 27 procedure** → `/Users/cameron/Developer/activitypub-mcp/site/src/content/docs/getting-started/installation.mdx`:
  ```yaml
  ---
  title: "Installation & Setup"
  description: "Get the ActivityPub MCP Server up and running in your environment. This guide covers installation, configuration, and initial setup."
  group: "Getting Started"
  order: 1
  ---
  ```
- [ ] **Step 28.3: Verify** `npm run check 2>&1 | tail -20` — no error for `installation.mdx`.
- [ ] **Step 28.4: Commit.** `git add site/src/content/docs/getting-started/installation.mdx && git commit -m "migrate installation guide to MDX content collection"`

### Task 29: Migrate Getting Started — `getting-started/cross-platform` (keep)

- [ ] **Step 29.1: Read** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/setup/cross-platform.astro`.
- [ ] **Step 29.2: Apply the Task 27 procedure** → `getting-started/cross-platform.mdx`:
  ```yaml
  ---
  title: "Cross-Platform Setup"
  description: "Platform-specific installation and setup instructions for Windows, macOS, and Linux."
  group: "Getting Started"
  order: 4
  ---
  ```
- [ ] **Step 29.3: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 29.4: Commit.** `git add site/src/content/docs/getting-started/cross-platform.mdx && git commit -m "migrate cross-platform setup guide to MDX"`

### Task 30: Migrate Guides — `guides/basic-usage` and `guides/fediverse-exploration` (keep ×2)

- [ ] **Step 30.1: Read both** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/guides/basic-usage.astro` and `.../guides/fediverse-exploration.astro`.
- [ ] **Step 30.2: Apply the Task 27 procedure** → `guides/basic-usage.mdx`:
  ```yaml
  ---
  title: "Basic Usage Guide"
  description: "Learn the essential commands and workflows for using the ActivityPub MCP Server to explore and interact with the fediverse through LLMs."
  group: "Guides"
  order: 1
  ---
  ```
- [ ] **Step 30.3: Apply the Task 27 procedure** → `guides/fediverse-exploration.mdx`:
  ```yaml
  ---
  title: "Fediverse Exploration"
  description: "Master exploring the fediverse with AI assistance. Discover actors, instances, content, and communities across the decentralized social web."
  group: "Guides"
  order: 3
  ---
  ```
- [ ] **Step 30.4: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 30.5: Commit.** `git add site/src/content/docs/guides/basic-usage.mdx site/src/content/docs/guides/fediverse-exploration.mdx && git commit -m "migrate basic-usage and fediverse-exploration guides to MDX"`

### Task 31: Migrate API Reference — `api/tools`, `api/resources`, `api/prompts` (keep ×3)

- [ ] **Step 31.1: Read all three** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/api/tools.astro`, `.../api/resources.astro`, `.../api/prompts.astro` (large, table-heavy; prefer GFM pipe tables for simple parameter tables per rule 7).
- [ ] **Step 31.2: Apply the Task 27 procedure** → `api/tools.mdx`:
  ```yaml
  ---
  title: "MCP Tools Reference"
  description: "Complete reference for all Model Context Protocol tools provided by the ActivityPub MCP Server."
  group: "API Reference"
  order: 1
  ---
  ```
- [ ] **Step 31.3: Apply the Task 27 procedure** → `api/resources.mdx`:
  ```yaml
  ---
  title: "MCP Resources Reference"
  description: "Complete reference for all Model Context Protocol resources provided by the ActivityPub MCP Server."
  group: "API Reference"
  order: 2
  ---
  ```
- [ ] **Step 31.4: Apply the Task 27 procedure** → `api/prompts.mdx`:
  ```yaml
  ---
  title: "MCP Prompts Reference"
  description: "Pre-built prompts and templates for common ActivityPub operations."
  group: "API Reference"
  order: 3
  ---
  ```
  Keep prose verbatim; if the source says "5 registered prompts" it already matches the verified count (these reference pages are not wired to the manifest in Phase 4).
- [ ] **Step 31.5: Verify** `npm run check 2>&1 | tail -20` — fix any unescaped `<`/`{` from JSON examples (fence per rule 6 / escape per rule 9).
- [ ] **Step 31.6: Commit.** `git add site/src/content/docs/api/ && git commit -m "migrate API tools, resources, and prompts references to MDX"`

### Task 32: Migrate Reference — `reference/troubleshooting` and `reference/changelog` (keep ×2)

- [ ] **Step 32.1: Read both** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/troubleshooting.astro` and `.../changelog.astro`.
- [ ] **Step 32.2: Apply the Task 27 procedure** → `reference/troubleshooting.mdx`:
  ```yaml
  ---
  title: "Troubleshooting Guide"
  description: "Common issues and their solutions when using the ActivityPub MCP Server."
  group: "Reference"
  order: 1
  ---
  ```
- [ ] **Step 32.3: Apply the Task 27 procedure** → `reference/changelog.mdx`:
  ```yaml
  ---
  title: "Changelog"
  description: "Track all releases, new features, improvements, bug fixes, and breaking changes for the ActivityPub MCP Server."
  group: "Reference"
  order: 2
  ---
  ```
  Keep changelog version/date content verbatim. Note: historical changelog entries that legitimately reference `2.0.0` as a past release are RETAINED (they are history, not the current-version badge). Phase 6 Task 33's stale-version grep documents this exception.
- [ ] **Step 32.4: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 32.5: Commit.** `git add site/src/content/docs/reference/ && git commit -m "migrate troubleshooting and changelog to MDX"`

### Task 33: Migrate Development — `architecture`, `dependencies`, `performance`, `security` (keep ×4)

- [ ] **Step 33.1: Read all four** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/development/architecture.astro`, `.../development/dependency-management.astro`, `.../development/performance-monitoring.astro`, `.../development/security-audit-checklist.astro`.
- [ ] **Step 33.2: Apply the Task 27 procedure** → `development/architecture.mdx`:
  ```yaml
  ---
  title: "Architecture Overview"
  description: "Technical architecture and design decisions of the ActivityPub MCP Server."
  group: "Development"
  order: 1
  ---
  ```
- [ ] **Step 33.3: Apply the Task 27 procedure** → `development/dependencies.mdx` (slug `dependencies`, source `dependency-management`):
  ```yaml
  ---
  title: "Dependency Management"
  description: "Comprehensive guide to managing dependencies for the ActivityPub MCP Server."
  group: "Development"
  order: 2
  ---
  ```
- [ ] **Step 33.4: Apply the Task 27 procedure** → `development/performance.mdx` (slug `performance`, source `performance-monitoring`):
  ```yaml
  ---
  title: "Performance Monitoring"
  description: "Comprehensive guide to monitoring and optimizing performance of the ActivityPub MCP Server."
  group: "Development"
  order: 3
  ---
  ```
- [ ] **Step 33.5: Apply the Task 27 procedure** → `development/security.mdx` (slug `security`, source `security-audit-checklist`):
  ```yaml
  ---
  title: "Security Audit Checklist"
  description: "Comprehensive security audit checklist for the ActivityPub MCP Server."
  group: "Development"
  order: 4
  ---
  ```
- [ ] **Step 33.6: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 33.7: Commit.** `git add site/src/content/docs/development/ && git commit -m "migrate development docs (architecture, dependencies, performance, security) to MDX"`

### Task 34: Migrate Specifications — `activitypub`, `webfinger`, `activitystreams` (keep ×3)

- [ ] **Step 34.1: Read all three** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/specifications/activitypub-llm-specification-guide.astro`, `.../webfinger-llm-specification-guide.astro`, `.../activitystreams-vocabulary-llm-specification-guide.astro`. Do NOT migrate `fedify-cli-llm-specification-guide.astro` (dropped, Task 35).
- [ ] **Step 34.2: Apply the Task 27 procedure** → `specifications/activitypub.mdx`:
  ```yaml
  ---
  title: "ActivityPub Protocol Guide"
  description: "Comprehensive guide to the ActivityPub specification as implemented by the ActivityPub MCP Server."
  group: "Specifications"
  order: 1
  ---
  ```
- [ ] **Step 34.3: Apply the Task 27 procedure** → `specifications/webfinger.mdx`:
  ```yaml
  ---
  title: "WebFinger Discovery Guide"
  description: "Complete guide to WebFinger protocol implementation in the ActivityPub MCP Server."
  group: "Specifications"
  order: 2
  ---
  ```
- [ ] **Step 34.4: Apply the Task 27 procedure** → `specifications/activitystreams.mdx`:
  ```yaml
  ---
  title: "ActivityStreams Vocabulary Guide"
  description: "Complete reference to the ActivityStreams Vocabulary W3C Recommendation as used by the ActivityPub MCP Server."
  group: "Specifications"
  order: 3
  ---
  ```
- [ ] **Step 34.5: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 34.6: Commit.** `git add site/src/content/docs/specifications/ && git commit -m "migrate specification guides (activitypub, webfinger, activitystreams) to MDX"`

### Task 35: Drop the two non-migrated pages (`docs/index`, `fedify-cli`)

Per §4.3 there are exactly two drops. The old `.astro` files are NOT deleted yet (the entire `site/pages/docs/` tree cleanup happens in Phase 6 after verification).

- [ ] **Step 35.1: Confirm no MDX was created for either drop.** Both must print nothing:
  ```bash
  ls /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/index.mdx 2>/dev/null
  ls /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/specifications/fedify-cli.mdx 2>/dev/null
  ```
- [ ] **Step 35.2: Confirm the two source files exist (so Phase 6 cleanup is intentional):**
  ```bash
  ls /Users/cameron/Developer/activitypub-mcp/site/pages/docs/index.astro \
     /Users/cameron/Developer/activitypub-mcp/site/pages/docs/specifications/fedify-cli-llm-specification-guide.astro
  ```
  Both must exist. No commit needed.

### Task 36: Build the OLD→NEW slug link map (used by all merges + cross-link rewrites)

- [ ] **Step 36.1: Adopt this canonical link map.** When rewriting any internal doc link, map OLD→NEW:

  | OLD path (in source) | NEW MDX link href |
  | --- | --- |
  | `docs/` or `docs/index` | `/activitypub-mcp/docs/getting-started/installation/` |
  | `docs/setup` or `docs/setup/index` | `/activitypub-mcp/docs/getting-started/installation/` |
  | `docs/setup/claude-desktop` | `/activitypub-mcp/docs/getting-started/claude-desktop/` |
  | `docs/setup/claude-desktop-integration` | `/activitypub-mcp/docs/getting-started/claude-desktop/` |
  | `docs/setup/config-guide` | `/activitypub-mcp/docs/getting-started/configuration/` |
  | `docs/setup/configuration-options` | `/activitypub-mcp/docs/getting-started/configuration/` |
  | `docs/setup/cross-platform` | `/activitypub-mcp/docs/getting-started/cross-platform/` |
  | `docs/guides/basic-usage` | `/activitypub-mcp/docs/guides/basic-usage/` |
  | `docs/guides/examples` | `/activitypub-mcp/docs/guides/examples/` |
  | `docs/guides/practical-examples` | `/activitypub-mcp/docs/guides/examples/` |
  | `docs/guides/fediverse-exploration` | `/activitypub-mcp/docs/guides/fediverse-exploration/` |
  | `docs/guides/usage-guide` | `/activitypub-mcp/docs/guides/advanced-workflows/` |
  | `docs/guides/real-world-test-scenario` | `/activitypub-mcp/docs/guides/advanced-workflows/` |
  | `docs/api/tools` | `/activitypub-mcp/docs/api/tools/` |
  | `docs/api/resources` | `/activitypub-mcp/docs/api/resources/` |
  | `docs/api/prompts` | `/activitypub-mcp/docs/api/prompts/` |
  | `docs/troubleshooting` | `/activitypub-mcp/docs/reference/troubleshooting/` |
  | `docs/changelog` | `/activitypub-mcp/docs/reference/changelog/` |
  | `docs/development/architecture` | `/activitypub-mcp/docs/development/architecture/` |
  | `docs/development/dependency-management` | `/activitypub-mcp/docs/development/dependencies/` |
  | `docs/development/performance-monitoring` | `/activitypub-mcp/docs/development/performance/` |
  | `docs/development/security-audit-checklist` | `/activitypub-mcp/docs/development/security/` |
  | `docs/specifications/activitypub-llm-specification-guide` | `/activitypub-mcp/docs/specifications/activitypub/` |
  | `docs/specifications/webfinger-llm-specification-guide` | `/activitypub-mcp/docs/specifications/webfinger/` |
  | `docs/specifications/activitystreams-vocabulary-llm-specification-guide` | `/activitypub-mcp/docs/specifications/activitystreams/` |
  | `docs/specifications/fedify-cli-llm-specification-guide` | *(dropped)* → relink to `/activitypub-mcp/docs/specifications/activitypub/` or remove the link |

- [ ] **Step 36.2: Find every remaining old-style link in the migrated MDX** (sweep that catches misses):
  ```bash
  grep -rnE 'docs/(setup|index|guides/(practical-examples|usage-guide|real-world-test-scenario)|specifications/(activitypub-llm|webfinger-llm|activitystreams-vocabulary|fedify-cli))' /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/
  ```
  Must print nothing.
- [ ] **Step 36.3: Find any hardcoded base-bypassing links or MDX-invalid expressions:**
  ```bash
  grep -rnE '\]\(/docs/|baseURL|import\.meta\.env' /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/
  ```
  Must print nothing. Fix: `](/docs/...)` → `](/activitypub-mcp/docs/...)`; remove any `baseURL`/`import.meta.env` template expressions.
- [ ] **Step 36.4: Commit any fixes.** `git add site/src/content/docs/ && git commit -m "normalize internal docs cross-links to new MDX slugs"` (skip if nothing changed).

### Task 37: Merge Claude Desktop (2→1) → `getting-started/claude-desktop`

Per §4.2.1: base = full page (`claude-desktop-integration.astro`); fold in unique config-location/troubleshooting/advanced-features detail from the simplified page (`claude-desktop.astro`).

- [ ] **Step 37.1: Read both** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/setup/claude-desktop-integration.astro` and `.../setup/claude-desktop.astro`.
- [ ] **Step 37.2: Convert the base** → `getting-started/claude-desktop.mdx`:
  ```yaml
  ---
  title: "Claude Desktop Integration"
  description: "Set up seamless integration between the ActivityPub MCP Server and Claude Desktop for AI-powered fediverse exploration."
  group: "Getting Started"
  order: 2
  ---
  ```
  Preserve, in order: Prerequisites → Configuration Setup → Verification & Testing → Example Usage.
- [ ] **Step 37.3: Fold in the richer troubleshooting** (Server Not Found / Connection Errors / Performance Issues, each with symptoms/solutions) from `claude-desktop.astro` as `## Troubleshooting`, REPLACING the base's thinner version.
- [ ] **Step 37.4: Fold in Advanced Features** (Custom Prompts / Automated Monitoring / Data Analysis) as `## Advanced Features` after Troubleshooting; keep the single most complete JSON config (` ```json `).
- [ ] **Step 37.5: Rewrite cross-links** using the Task 36 map.
- [ ] **Step 37.6: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 37.7: Commit.** `git add site/src/content/docs/getting-started/claude-desktop.mdx && git commit -m "consolidate Claude Desktop integration guides into a single page"`

### Task 38: Merge Configuration (2→1) → `getting-started/configuration`

Per §4.2.2: base = `configuration-options.astro`; prepend the layered overview and append Client Configuration, Advanced Configuration, Configuration Validation from `config-guide.astro`.

- [ ] **Step 38.1: Read both** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/setup/configuration-options.astro` and `.../setup/config-guide.astro`.
- [ ] **Step 38.2: Create the file** → `getting-started/configuration.mdx`:
  ```yaml
  ---
  title: "Configuration Guide"
  description: "Configure the ActivityPub MCP Server with environment variables, client configuration, logging settings, and performance tuning options."
  group: "Getting Started"
  order: 3
  ---
  ```
- [ ] **Step 38.3: Prepend** `config-guide.astro`'s "Configuration Overview" (Environment Variables / Client Configuration / Command Line Arguments) as `## Configuration Overview` (FIRST section).
- [ ] **Step 38.4: Add the env-var reference (base):** convert `configuration-options.astro`'s full env-var tables (core, cache, rate limiting, HTTP transport) + perf-tuning prose as `## Environment Variables`. Use GFM pipe tables.
- [ ] **Step 38.5: Append** `config-guide.astro`'s "Client Configuration" (platform paths, basic+advanced Claude Desktop JSON, Other MCP Clients) as `## Client Configuration` (fence JSON as ` ```json `).
- [ ] **Step 38.6: Append** "Advanced Configuration" (Development Mode, Production Optimization, Proxy) as `## Advanced Configuration` and "Configuration Validation" as `## Configuration Validation` (final two sections).
- [ ] **Step 38.7: De-duplicate** any env var or Claude Desktop JSON defined in both sources (keep the most complete).
- [ ] **Step 38.8: Rewrite cross-links** using the Task 36 map.
- [ ] **Step 38.9: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 38.10: Commit.** `git add site/src/content/docs/getting-started/configuration.mdx && git commit -m "consolidate configuration guide and options into a single page"`

### Task 39: Merge Practical Examples (2→1) → `guides/examples`

Per §4.2.3: target = `examples.astro`; merge in research-scenario categories from `practical-examples.astro`.

- [ ] **Step 39.1: Read both** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/guides/examples.astro` and `.../guides/practical-examples.astro`.
- [ ] **Step 39.2: Create the file** → `guides/examples.mdx`:
  ```yaml
  ---
  title: "Practical Examples"
  description: "Real-world scenarios and step-by-step tutorials demonstrating practical applications of the ActivityPub MCP Server, with expected outputs."
  group: "Guides"
  order: 2
  ---
  ```
- [ ] **Step 39.3: Lead with Quick Start** — convert `practical-examples.astro`'s "Quick Start Examples" (Discover a Popular Actor, Explore an Instance) as `## Quick Start Examples` (FIRST).
- [ ] **Step 39.4: Add the base deep-dive** — convert `examples.astro`'s step-by-step scenarios with expected JSON outputs as following `## ` sections (fence JSON).
- [ ] **Step 39.5: Fold in research scenarios** (climate-tech, technology, network/health analysis) as additional `## ` sections — migrate faithfully, do not invent steps.
- [ ] **Step 39.6: De-duplicate** scenarios in both (keep the more complete).
- [ ] **Step 39.7: Rewrite cross-links** using the Task 36 map (note both workflow pages map to `advanced-workflows`).
- [ ] **Step 39.8: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 39.9: Commit.** `git add site/src/content/docs/guides/examples.mdx && git commit -m "consolidate practical examples guides into a single page"`

### Task 40: Merge Advanced Workflows (2→1) → `guides/advanced-workflows`

Per §4.2.4: structural target = `real-world-test-scenario.astro`; integrate principles/techniques/pitfalls from `usage-guide.astro`.

- [ ] **Step 40.1: Read both** `/Users/cameron/Developer/activitypub-mcp/site/pages/docs/guides/real-world-test-scenario.astro` and `.../guides/usage-guide.astro`.
- [ ] **Step 40.2: Create the file** → `guides/advanced-workflows.mdx`:
  ```yaml
  ---
  title: "Advanced Workflows & Best Practices"
  description: "Advanced workflows, best practices, and concrete real-world test scenarios for power-user exploration of the fediverse with the ActivityPub MCP Server."
  group: "Guides"
  order: 4
  ---
  ```
- [ ] **Step 40.3: Prepend concepts and tool categories** — convert `usage-guide.astro`'s "Understanding the Fediverse" (Decentralized Network / Actors and Objects / Federation) and "Tool Categories" (Discovery / Information & Timeline / Write tools) as the FIRST two `## ` sections.
- [ ] **Step 40.4: Add the scenarios (structural base)** — convert `real-world-test-scenario.astro`'s "Scenario Categories" + detailed scenario cards as the main `## ` sections (preserve numbered steps, fence code).
- [ ] **Step 40.5: Integrate best practices and pitfalls** from `usage-guide.astro` as `## Best Practices` (and `## Common Pitfalls` if present) after the scenarios.
- [ ] **Step 40.6: De-duplicate** overlapping fediverse-concept prose.
- [ ] **Step 40.7: Rewrite cross-links** using the Task 36 map.
- [ ] **Step 40.8: Verify** `npm run check 2>&1 | tail -20`.
- [ ] **Step 40.9: Commit.** `git add site/src/content/docs/guides/advanced-workflows.mdx && git commit -m "consolidate usage guide and test scenarios into advanced workflows page"`

### Task 41: Verify all 20 pages exist with correct slugs and frontmatter

- [ ] **Step 41.1: Confirm exactly 20 MDX files.** Must print `20`:
  ```bash
  find /Users/cameron/Developer/activitypub-mcp/site/src/content/docs -name '*.mdx' | wc -l | tr -d ' '
  ```
- [ ] **Step 41.2: Confirm the exact slug set.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp/site/src/content/docs && find . -name '*.mdx' | sed 's|^\./||;s|\.mdx$||' | sort
  ```
  Expected (sorted):
  ```
  api/prompts
  api/resources
  api/tools
  development/architecture
  development/dependencies
  development/performance
  development/security
  getting-started/claude-desktop
  getting-started/configuration
  getting-started/cross-platform
  getting-started/installation
  guides/advanced-workflows
  guides/basic-usage
  guides/examples
  guides/fediverse-exploration
  reference/changelog
  reference/troubleshooting
  specifications/activitypub
  specifications/activitystreams
  specifications/webfinger
  ```
- [ ] **Step 41.3: Confirm no dropped slugs leaked in.** Both must print nothing:
  ```bash
  ls /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/index.mdx 2>/dev/null
  ls /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/specifications/fedify-cli*.mdx 2>/dev/null
  ```
- [ ] **Step 41.4: Confirm every file has all required frontmatter keys.** Output must be empty:
  ```bash
  for f in $(find /Users/cameron/Developer/activitypub-mcp/site/src/content/docs -name '*.mdx'); do
    for k in title: description: group: order:; do
      grep -q "^$k" "$f" || echo "MISSING $k in $f";
    done;
  done
  ```
- [ ] **Step 41.5: Confirm every `group` is one of the six canonical groups.** Output must be empty:
  ```bash
  grep -rh '^group:' /Users/cameron/Developer/activitypub-mcp/site/src/content/docs/ \
    | grep -vE '^group: "(Getting Started|Guides|API Reference|Reference|Development|Specifications)"$'
  ```
- [ ] **Step 41.6: Run schema check across the whole collection.** No content-collection errors:
  ```bash
  npm run check 2>&1 | tail -30
  ```
- [ ] **Step 41.7: Commit any fixes.** `git add site/src/content/docs/ && git commit -m "fix docs frontmatter/slug consistency"` (skip if clean).

### Task 42: Build the site and verify all 20 routes + sidebar + no broken links

- [ ] **Step 42.1: Full build.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run build:site 2>&1 | tail -40
  ```
  Confirm the build succeeds (manifest → astro build → pagefind → generate-search-data) with no errors.
- [ ] **Step 42.2: Confirm all 20 routes emitted under the base path.** Must print `20`:
  ```bash
  for s in api/prompts api/resources api/tools \
    development/architecture development/dependencies development/performance development/security \
    getting-started/claude-desktop getting-started/configuration getting-started/cross-platform getting-started/installation \
    guides/advanced-workflows guides/basic-usage guides/examples guides/fediverse-exploration \
    reference/changelog reference/troubleshooting \
    specifications/activitypub specifications/activitystreams specifications/webfinger; do
    test -f "/Users/cameron/Developer/activitypub-mcp/dist-site/docs/$s/index.html" && echo ok;
  done | grep -c ok | tr -d ' '
  ```
- [ ] **Step 42.3: Confirm the dropped routes are NOT emitted.** Both must print nothing:
  ```bash
  ls /Users/cameron/Developer/activitypub-mcp/dist-site/docs/index.html 2>/dev/null
  ls -d /Users/cameron/Developer/activitypub-mcp/dist-site/docs/specifications/fedify-cli* 2>/dev/null
  ```
- [ ] **Step 42.4: Verify the collection-driven sidebar renders all six groups + 20 links.** Sidebar links use class `nav-item` (Phase 3 DocsLayout). First command should print `20`; second should list all six group titles:
  ```bash
  grep -o 'class="nav-item[^"]*"' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/installation/index.html | wc -l | tr -d ' '
  grep -oE 'Getting Started|Guides|API Reference|Reference|Development|Specifications' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/getting-started/installation/index.html | sort -u
  ```
- [ ] **Step 42.5: Broken-link sweep over built HTML.** Output must be empty:
  ```bash
  grep -rhoE 'href="/activitypub-mcp/docs/[^"#]*"' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/ \
    | sed -E 's|href="/activitypub-mcp/docs/||;s|/?"$||' | sort -u \
    | while read -r slug; do
        [ -z "$slug" ] && continue
        f="/Users/cameron/Developer/activitypub-mcp/dist-site/docs/$slug/index.html"
        [ -f "$f" ] || echo "BROKEN: $slug";
      done
  ```
- [ ] **Step 42.6: Confirm no old-slug links survived into built HTML.** Must print nothing:
  ```bash
  grep -rnE 'docs/(setup/|guides/(practical-examples|usage-guide|real-world-test-scenario)|specifications/(activitypub-llm|webfinger-llm|activitystreams-vocabulary|fedify-cli)|index\.html|troubleshooting/|changelog/)' /Users/cameron/Developer/activitypub-mcp/dist-site/docs/ 2>/dev/null | grep -v 'pagefind'
  ```
  (`docs/troubleshooting/` and `docs/changelog/` are old top-level slugs; new ones live under `reference/`.)
- [ ] **Step 42.7: Spot-check render quality** on `npm run preview:site` (port 4321): `/activitypub-mcp/docs/api/tools/` (tables + dual-theme code), `/activitypub-mcp/docs/getting-started/configuration/` (merge order, no dup sections), `/activitypub-mcp/docs/guides/advanced-workflows/` (concepts before scenarios, Best Practices after). Confirm TOC lists h2/h3, active sidebar link highlighted, no raw `{...}`/`set:html`/`baseURL` artifacts. Stop the preview.
- [ ] **Step 42.8: Commit any fixes.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/src/content/docs/ && git commit -m "fix docs cross-links and rendering issues found in build verification"
  ```

**Phase 4 exit criteria:** Task 41 reports exactly 20 valid MDX pages; Task 42 Step 2 prints `20`; Steps 3/5/6 print nothing; Step 4 shows all six groups with 20 `nav-item` sidebar links — all 20 render via the single `[...slug].astro` route, the four consolidations carry folded-in content with no duplication, the two drops are absent, and there are no broken internal links.

---

## Phase 5 — Homepage rebuild

Prerequisite: Phase 1 manifest (`site/src/data/registry-manifest.json` = 37/10/5) and Phase 2 CopyButton/CodeBlock exist. This phase replaces the old `site/pages/index.astro` (Hero A, hardcoded `v2.0.0` and `53/10/11`) with a new `site/src/pages/index.astro` reading counts from the manifest and the version from `package.json`. It imports the canonical Phase 2 CopyButton (never recreates it). All dev/preview checks use port 4321; all site verification uses `npm run check`.

### Task 43: Read manifest + package.json in the homepage frontmatter and scaffold the new file

- [ ] **Step 43.1: Confirm the manifest exists and reads 37/10/5.**
  ```bash
  cat /Users/cameron/Developer/activitypub-mcp/site/src/data/registry-manifest.json
  ```
  Confirm `"tools": 37`, `"resources": 10`, `"prompts": 5`. If missing, STOP — Phase 1 must complete.

- [ ] **Step 43.2: Create `site/src/pages/index.astro` with frontmatter + CopyButton/CodeBlock imports + scaffold body.** Write `/Users/cameron/Developer/activitypub-mcp/site/src/pages/index.astro`:
  ```astro
  ---
  import BaseLayout from "../../layouts/BaseLayout.astro";
  import CopyButton from "../../components/CopyButton.astro";
  import CodeBlock from "../../components/CodeBlock.astro";
  import SocialLinks from "../../components/SocialLinks.astro";
  import registryManifest from "../data/registry-manifest.json";
  import pkg from "../../../package.json";

  const title = "ActivityPub MCP Server";
  const description =
    "An MCP server connecting LLMs like Claude and ChatGPT to the existing Fediverse through ActivityPub and WebFinger.";

  // Build-derived values — never hardcode (spec §5, §5.1)
  const version = pkg.version; // "3.0.0"
  const { tools, resources, prompts } = registryManifest;

  // Base URL for path resolution under /activitypub-mcp (spec §8)
  const baseURL = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  // Install snippets (one source of truth shared by CodeBlock/CopyButton)
  const npxCommand = "npx activitypub-mcp install";
  const claudeConfig = `{
  "mcpServers": {
    "activitypub": {
      "command": "npx",
      "args": ["-y", "activitypub-mcp"]
    }
  }
}`;
  const chatgptConfig = `{
  "mcpServers": {
    "activitypub": {
      "command": "npx",
      "args": ["-y", "activitypub-mcp"],
      "env": { "ACTIVITYPUB_BASE_URL": "https://mastodon.social" }
    }
  }
}`;
  ---

  <BaseLayout title={title} description={description}>
    <p style="display:none">scaffold tools={tools} resources={resources} prompts={prompts} version={version}</p>
  </BaseLayout>
  ```
  Note: `../../layouts/` climbs `pages/` → `src/` to reach `site/`. `import.meta.env.BASE_URL` already includes `base: "/activitypub-mcp"`, so `baseURL` = `/activitypub-mcp/`.

- [ ] **Step 43.3: Check the scaffold.**
  ```bash
  npm run check 2>&1 | tail -20
  ```
  Confirm no errors referencing the new file (the JSON + package.json imports must resolve). If `package.json` import errors with "resolveJsonModule", flag it as a pre-existing tsconfig issue — do not hardcode counts.

- [ ] **Step 43.4: Remove the obsolete old homepage so only one index route exists.**
  ```bash
  git rm /Users/cameron/Developer/activitypub-mcp/site/pages/index.astro
  ```
  (The docs pages under `site/pages/docs/` are removed in Phase 6 — leave them.)

- [ ] **Step 43.5: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/src/pages/index.astro && git commit -m "Scaffold rebuilt homepage reading version and registry counts from build sources"
  ```

### Task 44: Build Hero B (split: copy left, logo-as-diagram right)

Spec §5 item 1: version badge **v3.0.0** (derived), display-font headline, body subhead, primary CTA → `getting-started/installation`, secondary CTA → GitHub, large logo on the right.

- [ ] **Step 44.1: Replace the scaffold placeholder body with the Hero B section.** In `/Users/cameron/Developer/activitypub-mcp/site/src/pages/index.astro`, replace:
  ```astro
  <BaseLayout title={title} description={description}>
    <p style="display:none">scaffold tools={tools} resources={resources} prompts={prompts} version={version}</p>
  </BaseLayout>
  ```
  with:
  ```astro
  <BaseLayout title={title} description={description}>
    <section class="hero" aria-labelledby="hero-heading">
      <div class="container hero-grid">
        <div class="hero-copy">
          <span class="version-badge">v{version}</span>
          <h1 id="hero-heading" class="hero-heading">
            Connect LLMs to the <span class="hero-accent">Fediverse</span>
          </h1>
          <p class="hero-subhead">
            <strong>ActivityPub MCP</strong> is an MCP server connecting LLMs like Claude and
            ChatGPT to the Fediverse through <strong>ActivityPub</strong> and
            <strong>WebFinger</strong> &mdash; no instance of your own required.
          </p>
          <div class="hero-cta">
            <a class="btn btn-primary btn-lg" href={`${baseURL}docs/getting-started/installation/`}>Get Started</a>
            <a class="btn btn-outline btn-lg" href="https://github.com/cameronrye/activitypub-mcp" target="_blank" rel="noopener">View on GitHub</a>
          </div>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <img src={`${baseURL}logo.svg`} alt="" class="hero-logo" width="320" height="320" loading="eager" />
        </div>
      </div>
    </section>
  </BaseLayout>
  ```

- [ ] **Step 44.2: Add the Hero scoped styles.** At the END of the file (after `</BaseLayout>`), create a `<style>` block (later tasks append more rules inside it):
  ```astro
  <style>
    .hero {
      padding: clamp(3rem, 8vw, 6rem) 0;
      background: linear-gradient(180deg, var(--bg-raised) 0%, var(--bg-primary) 100%);
      border-bottom: 1px solid var(--border-color);
    }
    .hero-grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: clamp(2rem, 5vw, 4rem);
      align-items: center;
    }
    .version-badge {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
      padding: 0.3rem 0.7rem;
      border-radius: 2rem;
      margin-bottom: 1.25rem;
    }
    .hero-heading {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: clamp(2.25rem, 5vw, 3.5rem);
      line-height: 1.05;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin: 0 0 1.25rem;
    }
    .hero-accent { color: var(--accent); }
    .hero-subhead {
      font-family: var(--font-body);
      font-size: clamp(1.05rem, 2vw, 1.25rem);
      line-height: 1.6;
      color: var(--text-muted);
      max-width: 36ch;
      margin: 0 0 2rem;
    }
    .hero-cta { display: flex; flex-wrap: wrap; gap: 1rem; }
    .hero-visual { display: flex; justify-content: center; align-items: center; }
    .hero-logo {
      width: clamp(200px, 80%, 320px);
      height: auto;
      filter: drop-shadow(0 12px 32px color-mix(in srgb, var(--color-ink) 18%, transparent));
    }
    @media (max-width: 820px) {
      .hero-grid { grid-template-columns: 1fr; text-align: center; }
      .hero-subhead { margin-inline: auto; }
      .hero-cta { justify-content: center; }
      .hero-visual { order: -1; }
    }
  </style>
  ```

- [ ] **Step 44.3: Check and visually verify the hero (port 4321).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10
  ```
  Then run `npm run dev:site` (background), open `http://localhost:4321/activitypub-mcp/`, confirm badge **v3.0.0**, headline in Bricolage Grotesque, logo right (above copy on narrow), CTAs to `/activitypub-mcp/docs/getting-started/installation/` and GitHub, and the logo ink dot flips to paper in dark. Stop the dev server.

- [ ] **Step 44.4: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/src/pages/index.astro && git commit -m "Add Hero B split layout with derived version badge"
  ```

### Task 45: Build the "How it works" 3-node inline SVG diagram

Spec §5 item 2: `LLM --MCP--> activitypub-mcp server [logo] --ActivityPub/WebFinger--> Fediverse cluster`. Inline SVG with brand colors.

- [ ] **Step 45.1: Insert the section after the hero.** In the file, immediately AFTER `</section>` (closing `.hero`) and BEFORE `</BaseLayout>`, insert:
  ```astro
    <section class="how" aria-labelledby="how-heading">
      <div class="container">
        <h2 id="how-heading" class="section-heading">How it works</h2>
        <p class="section-lede">
          Your LLM talks to the ActivityPub MCP server over the Model Context Protocol; the server
          speaks ActivityPub and WebFinger to the wider Fediverse.
        </p>
        <div class="how-diagram">
          <svg viewBox="0 0 920 240" role="img" aria-labelledby="how-svg-title how-svg-desc" class="how-svg">
            <title id="how-svg-title">ActivityPub MCP data flow</title>
            <desc id="how-svg-desc">
              An LLM such as Claude or ChatGPT connects over the MCP protocol to the activitypub-mcp
              server, which connects over ActivityPub and WebFinger to Fediverse instances like
              Mastodon and Misskey.
            </desc>
            <line x1="230" y1="120" x2="370" y2="120" stroke="var(--accent)" stroke-width="3" marker-end="url(#arrow-vermilion)" />
            <text x="300" y="104" text-anchor="middle" class="how-edge-label">MCP protocol</text>
            <line x1="550" y1="120" x2="690" y2="120" stroke="var(--accent-2)" stroke-width="3" marker-end="url(#arrow-teal)" />
            <text x="620" y="104" text-anchor="middle" class="how-edge-label">ActivityPub / WebFinger</text>
            <g>
              <rect x="40" y="76" width="190" height="88" rx="14" class="how-node" />
              <text x="135" y="112" text-anchor="middle" class="how-node-title">LLM</text>
              <text x="135" y="138" text-anchor="middle" class="how-node-sub">Claude / ChatGPT</text>
            </g>
            <g>
              <rect x="370" y="60" width="180" height="120" rx="16" class="how-node how-node-center" />
              <image href={`${baseURL}logo.svg`} x="408" y="74" width="48" height="48" />
              <text x="460" y="138" text-anchor="middle" class="how-node-title">activitypub-mcp</text>
              <text x="460" y="160" text-anchor="middle" class="how-node-sub">MCP server</text>
            </g>
            <g>
              <rect x="690" y="76" width="190" height="88" rx="14" class="how-node" />
              <circle cx="745" cy="104" r="7" fill="var(--accent)" />
              <circle cx="785" cy="104" r="7" fill="var(--accent-2)" />
              <circle cx="825" cy="104" r="7" fill="var(--accent-3)" />
              <text x="785" y="138" text-anchor="middle" class="how-node-title">Fediverse</text>
              <text x="785" y="160" text-anchor="middle" class="how-node-sub">Mastodon / Misskey / …</text>
            </g>
            <defs>
              <marker id="arrow-vermilion" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
              </marker>
              <marker id="arrow-teal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent-2)" />
              </marker>
            </defs>
          </svg>
        </div>
      </div>
    </section>
  ```

- [ ] **Step 45.2: Append the How styles inside the existing `<style>` block** (before `</style>`):
  ```css
  .section-heading {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(1.75rem, 3.5vw, 2.5rem);
    letter-spacing: -0.01em;
    color: var(--text-primary);
    text-align: center;
    margin: 0 0 0.75rem;
  }
  .section-lede {
    font-family: var(--font-body);
    font-size: 1.05rem;
    line-height: 1.6;
    color: var(--text-muted);
    text-align: center;
    max-width: 56ch;
    margin: 0 auto 2.5rem;
  }
  .how { padding: clamp(3rem, 7vw, 5rem) 0; }
  .how-diagram { overflow-x: auto; }
  .how-svg { width: 100%; height: auto; min-width: 640px; display: block; margin: 0 auto; }
  .how-node { fill: var(--bg-raised); stroke: var(--border-color); stroke-width: 1.5; }
  .how-node-center { stroke: var(--accent); stroke-width: 2; }
  .how-node-title { font-family: var(--font-display); font-weight: 700; font-size: 18px; fill: var(--text-primary); }
  .how-node-sub { font-family: var(--font-body); font-size: 13px; fill: var(--text-muted); }
  .how-edge-label { font-family: var(--font-mono); font-size: 12px; font-weight: 600; fill: var(--text-muted); }
  ```

- [ ] **Step 45.3: Check and visually verify (port 4321).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10
  ```
  Run `npm run dev:site`, open the homepage, confirm three nodes (LLM → activitypub-mcp logo → Fediverse), vermilion "MCP protocol" arrow, teal "ActivityPub / WebFinger" arrow, dark-mode node fills/text readable, narrow viewport scrolls horizontally. Stop the dev server.

- [ ] **Step 45.4: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/src/pages/index.astro && git commit -m "Add How-it-works 3-node SVG flow diagram"
  ```

### Task 46: Build the Capabilities section (reads manifest 37/10/5 via `cap-number`, links to api/*)

Spec §5 item 3 + §5.1: three figures with build-derived counts, each linking to its API reference. Values come from the Task 43 destructure — NEVER hardcoded. The rendered count uses class `cap-number` (Phase 6 greps `cap-number`).

- [ ] **Step 46.1: Insert the Capabilities section after the How section** (after `</section>` closing `.how`, before `</BaseLayout>`):
  ```astro
    <section class="capabilities" aria-labelledby="cap-heading">
      <div class="container">
        <h2 id="cap-heading" class="section-heading">Capabilities</h2>
        <p class="section-lede">
          A complete MCP surface for reading and acting across the Fediverse, generated directly
          from the server&rsquo;s registry.
        </p>
        <div class="cap-grid">
          <a class="cap-card" href={`${baseURL}docs/api/tools/`}>
            <span class="cap-number">{tools}</span>
            <span class="cap-label">Tools</span>
            <span class="cap-desc">Discover actors, read timelines and threads, and write posts, boosts, follows, and more.</span>
            <span class="cap-link">Explore tools &rarr;</span>
          </a>
          <a class="cap-card" href={`${baseURL}docs/api/resources/`}>
            <span class="cap-number">{resources}</span>
            <span class="cap-label">Resources</span>
            <span class="cap-desc">Structured, LLM-readable views of actors, posts, instances, and server capabilities.</span>
            <span class="cap-link">Explore resources &rarr;</span>
          </a>
          <a class="cap-card" href={`${baseURL}docs/api/prompts/`}>
            <span class="cap-number">{prompts}</span>
            <span class="cap-label">Prompts</span>
            <span class="cap-desc">Ready-made prompt templates that guide LLMs through common Fediverse workflows.</span>
            <span class="cap-link">Explore prompts &rarr;</span>
          </a>
        </div>
      </div>
    </section>
  ```

- [ ] **Step 46.2: Append Capabilities styles inside the same `<style>` block:**
  ```css
  .capabilities { padding: clamp(3rem, 7vw, 5rem) 0; background: var(--bg-raised); }
  .cap-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
  .cap-card {
    display: flex; flex-direction: column; padding: 2rem;
    background: var(--bg-primary); border: 1px solid var(--border-color);
    border-radius: 1rem; text-decoration: none; color: var(--text-primary);
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .cap-card:hover {
    transform: translateY(-3px); border-color: var(--accent);
    box-shadow: 0 12px 28px color-mix(in srgb, var(--color-ink) 12%, transparent);
  }
  .cap-number { font-family: var(--font-display); font-weight: 700; font-size: clamp(2.75rem, 6vw, 3.75rem); line-height: 1; color: var(--accent); }
  .cap-label { font-family: var(--font-display); font-weight: 700; font-size: 1.25rem; margin: 0.4rem 0 0.75rem; color: var(--text-primary); }
  .cap-desc { font-family: var(--font-body); font-size: 0.95rem; line-height: 1.55; color: var(--text-muted); flex: 1; }
  .cap-link { font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600; color: var(--accent); margin-top: 1.25rem; }
  @media (max-width: 820px) { .cap-grid { grid-template-columns: 1fr; } }
  ```

- [ ] **Step 46.3: Check.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10
  ```

- [ ] **Step 46.4: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add site/src/pages/index.astro && git commit -m "Add Capabilities section sourced from registry manifest"
  ```

### Task 47: Build Key Features (typographic, no generic icon cards)

Spec §5 item 4: restyled, not generic icon cards. Numbered typographic list tied to real capabilities.

- [ ] **Step 47.1: Insert the Key Features section after Capabilities** (after `</section>` closing `.capabilities`, before `</BaseLayout>`):
  ```astro
    <section class="features" aria-labelledby="features-heading">
      <div class="container">
        <h2 id="features-heading" class="section-heading">What sets it apart</h2>
        <ol class="feature-list">
          <li class="feature-item">
            <h3 class="feature-title">Native ActivityPub &amp; WebFinger</h3>
            <p class="feature-body">Resolve any <code>@user@instance</code> handle and traverse real ActivityPub data &mdash; actors, outboxes, threads &mdash; without running a server of your own.</p>
          </li>
          <li class="feature-item">
            <h3 class="feature-title">Multi-account, timeline &amp; write tooling</h3>
            <p class="feature-body">Switch between configured accounts, read home and public timelines, and post, reply, boost, favourite, and follow &mdash; all as first-class MCP tools.</p>
          </li>
          <li class="feature-item">
            <h3 class="feature-title">LLM-optimized resources &amp; prompts</h3>
            <p class="feature-body">Capabilities are exposed as structured resources and guided prompt templates, so models reason over clean data instead of scraping HTML.</p>
          </li>
          <li class="feature-item">
            <h3 class="feature-title">Hardened by design</h3>
            <p class="feature-body">SSRF guards, response-size caps, thread-traversal limits, and full-surface audit logging keep exploration safe against hostile peers.</p>
          </li>
          <li class="feature-item">
            <h3 class="feature-title">Typed end to end</h3>
            <p class="feature-body">A fully typed TypeScript + ESM implementation with strict linting, so behavior stays predictable and contributions stay safe.</p>
          </li>
          <li class="feature-item">
            <h3 class="feature-title">Cross-platform install</h3>
            <p class="feature-body">One <code>npx</code> command wires the server into Claude Desktop, ChatGPT, and any MCP-compatible client on macOS, Linux, and Windows.</p>
          </li>
        </ol>
      </div>
    </section>
  ```

- [ ] **Step 47.2: Append Feature styles inside the same `<style>` block:**
  ```css
  .features { padding: clamp(3rem, 7vw, 5rem) 0; }
  .feature-list { list-style: none; counter-reset: feat; margin: 2.5rem 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem 3rem; }
  .feature-item { counter-increment: feat; position: relative; padding-left: 3rem; }
  .feature-item::before { content: counter(feat, decimal-leading-zero); position: absolute; left: 0; top: 0.1rem; font-family: var(--font-mono); font-weight: 600; font-size: 1rem; color: var(--accent); }
  .feature-item::after { content: ""; position: absolute; left: 0.55rem; top: 1.9rem; bottom: 0.2rem; width: 2px; background: var(--border-color); }
  .feature-title { font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; color: var(--text-primary); margin: 0 0 0.5rem; }
  .feature-body { font-family: var(--font-body); font-size: 0.98rem; line-height: 1.6; color: var(--text-muted); margin: 0; }
  .feature-body code { font-family: var(--font-mono); font-size: 0.85em; padding: 0.1em 0.35em; border-radius: 0.3rem; background: var(--bg-raised); color: var(--text-primary); }
  @media (max-width: 820px) { .feature-list { grid-template-columns: 1fr; } }
  ```

- [ ] **Step 47.3: Check.** `npm run check 2>&1 | tail -10`
- [ ] **Step 47.4: Commit.** `cd /Users/cameron/Developer/activitypub-mcp && git add site/src/pages/index.astro && git commit -m "Add typographic Key features section"`

### Task 48: Build Quick install (npx + Claude + ChatGPT snippets via CodeBlock + CopyButton)

Spec §5 item 5: `npx activitypub-mcp install` plus Claude Desktop and ChatGPT/MCP-client JSON config snippets, each with a copy button; snippets use `--font-mono`. This uses the Phase 2 `CodeBlock` component (so CodeBlock is consumed, not dead) — CodeBlock embeds a CopyButton.

- [ ] **Step 48.1: Insert the Quick install section after Features** (after `</section>` closing `.features`, before `</BaseLayout>`):
  ```astro
    <section class="install" id="quick-start" aria-labelledby="install-heading">
      <div class="container">
        <h2 id="install-heading" class="section-heading">Quick install</h2>
        <p class="section-lede">
          Install once, then point your MCP client at it. Copy the snippet for your client below.
        </p>

        <div class="install-block">
          <h3 class="install-step-title">1. Install</h3>
          <CodeBlock code={npxCommand} lang="bash" label="Copy install command" />
        </div>

        <div class="install-grid">
          <div class="install-block">
            <h3 class="install-step-title">Claude Desktop</h3>
            <CodeBlock code={claudeConfig} lang="json" label="Copy Claude Desktop config" />
          </div>
          <div class="install-block">
            <h3 class="install-step-title">ChatGPT / MCP client</h3>
            <CodeBlock code={chatgptConfig} lang="json" label="Copy ChatGPT config" />
          </div>
        </div>
      </div>
    </section>
  ```

- [ ] **Step 48.2: Append Install styles inside the same `<style>` block:**
  ```css
  .install { padding: clamp(3rem, 7vw, 5rem) 0; background: var(--bg-raised); }
  .install-block { margin-bottom: 1.5rem; }
  .install-step-title { font-family: var(--font-display); font-weight: 700; font-size: 0.95rem; color: var(--text-primary); margin: 0 0 0.6rem; }
  .install-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
  .install-grid .install-block { margin-bottom: 0; }
  @media (max-width: 820px) { .install-grid { grid-template-columns: 1fr; } }
  ```
  Note: the CodeBlock component (Phase 2) supplies the bordered surface, mono font, language chip, and CopyButton; these styles only handle section layout and step titles.

- [ ] **Step 48.3: Check and verify copy works (port 4321).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10
  ```
  Run `npm run dev:site`, open the homepage, confirm three snippets render in JetBrains Mono inside CodeBlock chrome. Click each Copy button: it should switch to a check icon + "Copied!" for ~2s; paste into a scratch buffer to confirm the Claude/ChatGPT JSON copied with newlines intact. Stop the dev server.

- [ ] **Step 48.4: Commit.** `cd /Users/cameron/Developer/activitypub-mcp && git add site/src/pages/index.astro && git commit -m "Add Quick install section with copyable client configs via CodeBlock"`

### Task 49: Build Docs entry cards (one per group → group's first page)

Spec §5 item 6. First pages per §4.1 (order 1 of each group): Getting Started → `getting-started/installation`; Guides → `guides/basic-usage`; API Reference → `api/tools`; Reference → `reference/troubleshooting`; Development → `development/architecture`; Specifications → `specifications/activitypub`.

- [ ] **Step 49.1: Insert the Docs cards section after Install** (after `</section>` closing `.install`, before `</BaseLayout>`):
  ```astro
    <section class="docs-cards" aria-labelledby="docs-heading">
      <div class="container">
        <h2 id="docs-heading" class="section-heading">Explore the docs</h2>
        <div class="docs-grid">
          <a class="docs-card" href={`${baseURL}docs/getting-started/installation/`}>
            <span class="docs-card-title">Getting Started</span>
            <span class="docs-card-desc">Install, configure, and connect your first client.</span>
          </a>
          <a class="docs-card" href={`${baseURL}docs/guides/basic-usage/`}>
            <span class="docs-card-title">Guides</span>
            <span class="docs-card-desc">Hands-on walkthroughs, examples, and advanced workflows.</span>
          </a>
          <a class="docs-card" href={`${baseURL}docs/api/tools/`}>
            <span class="docs-card-title">API Reference</span>
            <span class="docs-card-desc">Every tool, resource, and prompt the server exposes.</span>
          </a>
          <a class="docs-card" href={`${baseURL}docs/reference/troubleshooting/`}>
            <span class="docs-card-title">Reference</span>
            <span class="docs-card-desc">Troubleshooting and the full changelog.</span>
          </a>
          <a class="docs-card" href={`${baseURL}docs/development/architecture/`}>
            <span class="docs-card-title">Development</span>
            <span class="docs-card-desc">Architecture, dependencies, performance, and security.</span>
          </a>
          <a class="docs-card" href={`${baseURL}docs/specifications/activitypub/`}>
            <span class="docs-card-title">Specifications</span>
            <span class="docs-card-desc">ActivityPub, WebFinger, and ActivityStreams guides.</span>
          </a>
        </div>
      </div>
    </section>
  ```

- [ ] **Step 49.2: Append Docs-card styles inside the same `<style>` block:**
  ```css
  .docs-cards { padding: clamp(3rem, 7vw, 5rem) 0; }
  .docs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 2.5rem; }
  .docs-card {
    display: flex; flex-direction: column; gap: 0.5rem; padding: 1.75rem;
    border: 1px solid var(--border-color); border-left: 4px solid var(--accent-2);
    border-radius: 0.875rem; background: var(--bg-primary); text-decoration: none;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .docs-card:hover {
    transform: translateY(-3px); border-left-color: var(--accent);
    box-shadow: 0 12px 28px color-mix(in srgb, var(--color-ink) 12%, transparent);
  }
  .docs-card-title { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; color: var(--text-primary); }
  .docs-card-desc { font-family: var(--font-body); font-size: 0.92rem; line-height: 1.55; color: var(--text-muted); }
  @media (max-width: 820px) { .docs-grid { grid-template-columns: 1fr; } }
  ```

- [ ] **Step 49.3: Check.** `cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10`
- [ ] **Step 49.4: Commit.** `cd /Users/cameron/Developer/activitypub-mcp && git add site/src/pages/index.astro && git commit -m "Add docs entry cards linking to each group's first page"`

### Task 50: Build the reskinned three-column homepage footer

Spec §5 item 7: brand + social, docs links, community links. Uses `SocialLinks variant="footer"` so it renders the footer variant (not the default header variant).

- [ ] **Step 50.1: Insert the footer after the Docs cards section** (after `</section>` closing `.docs-cards`, before `</BaseLayout>`):
  ```astro
    <footer class="home-footer">
      <div class="container home-footer-grid">
        <div class="home-footer-brand">
          <img src={`${baseURL}logo.svg`} alt="" class="home-footer-logo" width="40" height="40" aria-hidden="true" />
          <p class="home-footer-tagline">Connect LLMs to the Fediverse over ActivityPub.</p>
          <SocialLinks variant="footer" size="md" />
        </div>
        <div class="home-footer-col">
          <h3 class="home-footer-heading">Docs</h3>
          <ul class="home-footer-list">
            <li><a href={`${baseURL}docs/getting-started/installation/`}>Getting Started</a></li>
            <li><a href={`${baseURL}docs/guides/basic-usage/`}>Guides</a></li>
            <li><a href={`${baseURL}docs/api/tools/`}>API Reference</a></li>
            <li><a href={`${baseURL}docs/specifications/activitypub/`}>Specifications</a></li>
          </ul>
        </div>
        <div class="home-footer-col">
          <h3 class="home-footer-heading">Community</h3>
          <ul class="home-footer-list">
            <li><a href="https://github.com/cameronrye/activitypub-mcp" target="_blank" rel="noopener">GitHub</a></li>
            <li><a href="https://www.npmjs.com/package/activitypub-mcp" target="_blank" rel="noopener">npm</a></li>
            <li><a href="https://github.com/cameronrye/activitypub-mcp/issues" target="_blank" rel="noopener">Issues</a></li>
            <li><a href={`${baseURL}docs/reference/changelog/`}>Changelog</a></li>
          </ul>
        </div>
      </div>
    </footer>
  ```

- [ ] **Step 50.2: Append footer styles inside the same `<style>` block:**
  ```css
  .home-footer { padding: clamp(3rem, 7vw, 4.5rem) 0 clamp(2rem, 5vw, 3rem); background: var(--bg-raised); border-top: 1px solid var(--border-color); }
  .home-footer-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 2.5rem; }
  .home-footer-logo { display: block; margin-bottom: 0.75rem; }
  .home-footer-tagline { font-family: var(--font-body); font-size: 0.95rem; line-height: 1.55; color: var(--text-muted); max-width: 32ch; margin: 0 0 1.25rem; }
  .home-footer-heading { font-family: var(--font-display); font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-primary); margin: 0 0 1rem; }
  .home-footer-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
  .home-footer-list a { font-family: var(--font-body); font-size: 0.95rem; color: var(--text-muted); text-decoration: none; transition: color 0.15s ease; }
  .home-footer-list a:hover { color: var(--accent); }
  @media (max-width: 820px) { .home-footer-grid { grid-template-columns: 1fr; gap: 2rem; } }
  ```

- [ ] **Step 50.3: Check.** `cd /Users/cameron/Developer/activitypub-mcp && npm run check 2>&1 | tail -10`
- [ ] **Step 50.4: Commit.** `cd /Users/cameron/Developer/activitypub-mcp && git add site/src/pages/index.astro && git commit -m "Add reskinned three-column homepage footer"`

### Task 51: Build and verify the homepage end-to-end (grep built HTML for 37/10/5 via `cap-number`)

- [ ] **Step 51.1: Run the site build.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run build:site 2>&1 | tail -25
  ```
  Confirm no errors and the homepage route generated.

- [ ] **Step 51.2: Confirm the homepage HTML exists.**
  ```bash
  ls -la /Users/cameron/Developer/activitypub-mcp/dist-site/index.html
  ```

- [ ] **Step 51.3: Grep the built HTML for the derived counts (via `cap-number`) and version.**
  ```bash
  grep -oE 'cap-number">(37|10|5)<' /Users/cameron/Developer/activitypub-mcp/dist-site/index.html
  grep -oE 'v3\.0\.0' /Users/cameron/Developer/activitypub-mcp/dist-site/index.html
  ```
  First MUST print three lines: `cap-number">37<`, `cap-number">10<`, `cap-number">5<`. Second MUST print `v3.0.0`. If 37/10/5 are absent, the manifest wiring is broken — STOP and fix the import/destructure in Task 43 rather than hardcoding.

- [ ] **Step 51.4: Confirm NO stale values leaked in.**
  ```bash
  grep -oE 'v2\.0\.0|>53<|>11<|stat-number' /Users/cameron/Developer/activitypub-mcp/dist-site/index.html && echo "STALE HOMEPAGE VALUES FOUND" || echo "CLEAN: no stale homepage values"
  ```
  Expect `CLEAN: no stale homepage values`.

- [ ] **Step 51.5: Confirm the API/docs links use the base path.**
  ```bash
  grep -oE 'href="/activitypub-mcp/docs/api/(tools|resources|prompts)/"' /Users/cameron/Developer/activitypub-mcp/dist-site/index.html
  ```
  MUST print all three `api/*` hrefs under `/activitypub-mcp/`.

- [ ] **Step 51.6: Visually verify the production preview in both themes (port 4321).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run preview:site
  ```
  Open `http://localhost:4321/activitypub-mcp/`. Confirm section order: Hero B → How it works → Capabilities (37/10/5) → Key features → Quick install → Docs cards → Footer. Toggle light/dark/system, confirm no FOUC, readable contrast, and the logo ink dot flips to paper on dark. Stop the preview.

- [ ] **Step 51.7: Final phase commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add -A && git commit -m "Verify rebuilt homepage renders derived counts and version in built HTML" --allow-empty
  ```

**Phase 5 exit criteria:** `site/src/pages/index.astro` rebuilt with Hero B, the 3-node SVG flow diagram, manifest-driven Capabilities (37/10/5 verified in `dist-site/index.html` via `cap-number`), typographic Key features, copyable Quick install (npx/Claude/ChatGPT via CodeBlock+CopyButton), six docs entry cards, and a three-column footer (`SocialLinks variant="footer"`); version badge derives from `package.json` (v3.0.0); the canonical Phase 2 CopyButton is imported, not recreated; old `site/pages/index.astro` removed.

---

## Phase 6 — Build, deploy & verification

Prerequisites: Phases 1–5 complete. Built CSS lands in `dist-site/assets/` (NOT `_astro`); dev/preview run on port 4321; all `.astro` checks use `npm run check`.

### Task 52: Fix the `search.json` output path (dist → dist-site) before any full build

`scripts/generate-search-data.js` currently writes to `dist/search.json` (the TS-package build dir), not the Astro `outDir` `dist-site/`. The fallback search in `Search.astro` fetches `${base}/search.json` (served from `dist-site/search.json`). Spec §8 mandates the generator produce `dist-site/search.json`.

- [ ] **Step 52.1: Confirm the bug.**
  ```bash
  grep -n 'dist' scripts/generate-search-data.js
  ```
  Confirm a line reads `const distDir = path.join(__dirname, "..", "dist");`.

- [ ] **Step 52.2: Repoint the generator at the Astro outDir.** In `/Users/cameron/Developer/activitypub-mcp/scripts/generate-search-data.js`, change:
  ```js
  const distDir = path.join(__dirname, "..", "dist");
  ```
  to:
  ```js
  const distDir = path.join(__dirname, "..", "dist-site");
  ```

- [ ] **Step 52.3: Make a missing index non-silent.** Read the actual trailing `else` block first (its current text is the message `Dist directory not found. Please run npm run build:site first.` — quote the exact lines from the file as the Edit `old_string`). Replace that `else` block so a missing build dir exits non-zero:
  ```js
  } else {
    console.error('dist-site directory not found. Run "astro build" before generate-search-data.js.');
    process.exit(1);
  }
  ```

- [ ] **Step 52.4: Verify in isolation against the existing build.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node scripts/generate-search-data.js && ls -la dist-site/search.json
  ```
  Confirm the console prints it wrote into `dist-site/search.json` and the file is more than 2 bytes.

- [ ] **Step 52.5: Confirm the fetched path matches.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -n "search.json" site/components/Search.astro && echo "---served-from---" && ls dist-site/search.json
  ```

- [ ] **Step 52.6: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add scripts/generate-search-data.js && git commit -m "fix: write fallback search.json into dist-site so it is actually deployed"
  ```

### Task 53: Run the full `build:site` pipeline end-to-end

- [ ] **Step 53.1: Clean the previous Astro output for a true cold build.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && rm -rf dist-site
  ```
- [ ] **Step 53.2: Astro check first.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run check
  ```
  Confirm `0 errors` (hint-level a11y warnings acceptable).
- [ ] **Step 53.3: Run the full build, capturing all four stages.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run build:site 2>&1 | tee /tmp/build-site.log
  ```
- [ ] **Step 53.4: Confirm each stage emitted its success line.**
  ```bash
  grep -E "Counts verified: 37 tools / 10 resources / 5 prompts|Complete!|Indexed .* pages|Generated search data with" /tmp/build-site.log
  ```
  Expect (in order): the manifest's `Counts verified: 37 tools / 10 resources / 5 prompts`, Astro's `Complete!`, Pagefind's `Indexed N pages`, and `Generated search data with N pages`.
- [ ] **Step 53.5: Confirm no error/exit between stages.**
  ```bash
  grep -iE "error|failed|cannot|not found" /tmp/build-site.log || echo "no errors in build log"
  ```

### Task 54: Verify the registry manifest count (37/10/5) survived into the build

- [ ] **Step 54.1: Verify the committed manifest JSON.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node -e "const m=require('./site/src/data/registry-manifest.json'); console.log(m.tools, m.resources, m.prompts); process.exit(m.tools===37 && m.resources===10 && m.prompts===5 ? 0 : 1)" && echo "MANIFEST OK"
  ```
  Expect `37 10 5` then `MANIFEST OK`.
- [ ] **Step 54.2: Grep the built homepage HTML for the rendered counts via `cap-number`.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -oE 'cap-number">(37|10|5)<' dist-site/index.html && echo "---" && grep -c 'cap-number' dist-site/index.html
  ```
  Expect three `cap-number">(37|10|5)<` lines and a `cap-number` count of at least 3.
- [ ] **Step 54.3: Assert no stale capability counts anywhere in the built site.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rnE "53 (MCP )?[Tt]ools|53/10/11|11 [Pp]rompts|21 read-only" dist-site/ && echo "STALE COUNTS FOUND" || echo "no stale capability counts in dist-site"
  ```
  Expect `no stale capability counts in dist-site`.

### Task 55: Verify v3.0.0 badge and purge stale v2.0.0 / 53 / 11 from llms.txt and llms-full.txt

Spec §5/§11: version badge is `v3.0.0`; no current-version `v2.0.0` anywhere in the built site, `llms.txt`, or `llms-full.txt`. Source files carry stale data that is copied verbatim into `dist-site`: `public/llms.txt` has `Key Features (v2.0.0)` (L9), `53 MCP Tools` (L13), and `11 MCP Prompts` (L14); `public/llms-full.txt` has `(v2.0.0)` (~L24), `53 MCP Tools` (~L28), `10 Resources` / `11 Prompts` (~L29), `Client/2.0.0` (~L165), and `Version 2.0.0 (Current)` (~L931).

- [ ] **Step 55.1: Confirm the homepage badge renders v3.0.0.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -oE "v3\.0\.0" dist-site/index.html && echo "BADGE OK"
  ```
- [ ] **Step 55.2: Fix `public/llms.txt`.** Open `/Users/cameron/Developer/activitypub-mcp/public/llms.txt` and apply:
  - L9: `### Key Features (v2.0.0)` → `### Key Features (v3.0.0)`
  - the `53 MCP Tools` line → `- **37 MCP Tools**: 9 read-only discovery/timeline + 28 authenticated (post, follow, boost, polls, media, schedule)`
  - the `11 MCP Prompts` line → `- **5 MCP Prompts**`
  - any `10 Resources` line stays `10` (correct); confirm it reads `- **10 MCP Resources**`.
- [ ] **Step 55.3: Fix `public/llms-full.txt`.** Open `/Users/cameron/Developer/activitypub-mcp/public/llms-full.txt` and apply (read the file to find the exact current lines, then Edit each):
  - `(v2.0.0)` heading → `(v3.0.0)`
  - `53 MCP Tools` → `37 MCP Tools` (with the same 9+28 breakdown as above)
  - `11 Prompts` → `5 Prompts`; confirm `10 Resources` stays `10`
  - the `Client/2.0.0` line → `Client/3.0.0`
  - `Version 2.0.0 (Current)` → `Version 3.0.0 (Current)`
- [ ] **Step 55.4: Re-grep the source files (current-version 2.0.0 must be gone).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rnE "v2\.0\.0|2\.0\.0 \(Current\)|Client/2\.0\.0|53 MCP|11 [Pp]rompts" public/llms.txt public/llms-full.txt && echo "STALE IN SOURCE" || echo "llms source clean"
  ```
  Expect `llms source clean`. (Historical changelog entries inside the migrated `reference/changelog.mdx` that legitimately list `2.0.0` as a PAST release are intentionally retained — they are history, not the current version, and live in the MDX collection, not these llms files.)
- [ ] **Step 55.5: Rebuild and confirm the copied-through public files are clean.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run build:site >/dev/null 2>&1 && grep -rnE "v2\.0\.0|2\.0\.0 \(Current\)|Client/2\.0\.0|53 MCP|11 [Pp]rompts" dist-site/llms.txt dist-site/llms-full.txt && echo "STALE IN DIST" || echo "dist llms clean"
  ```
  Expect `dist llms clean`.
- [ ] **Step 55.6: Assert no current-version `v2.0.0` anywhere in the built site.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rln "v2.0.0" dist-site/ | grep -v 'dist-site/docs/reference/changelog' && echo "STALE VERSION FOUND" || echo "no v2.0.0 outside changelog history"
  ```
  Expect `no v2.0.0 outside changelog history`. (Only the changelog history page may legitimately reference the past 2.0.0 release.)
- [ ] **Step 55.7: Commit.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add public/llms.txt public/llms-full.txt && git commit -m "docs: correct llms reference counts/version to 37/10/5 and v3.0.0"
  ```

### Task 56: Verify the Pagefind index exists and is correctly placed under the base

- [ ] **Step 56.1: Confirm the Pagefind runtime files exist.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && ls dist-site/pagefind/pagefind.js dist-site/pagefind/pagefind-entry.json && ls dist-site/pagefind/index >/dev/null && echo "PAGEFIND FILES OK"
  ```
- [ ] **Step 56.2: Confirm Pagefind indexed the docs + homepage (`data-pagefind-body`).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -l "data-pagefind-body" dist-site/index.html dist-site/docs/getting-started/installation/index.html && echo "PAGEFIND MARKERS PRESENT"
  ```
- [ ] **Step 56.3: Confirm a non-zero indexed page count.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node -e "const e=require('./dist-site/pagefind/pagefind-entry.json'); const en=e.languages.en||Object.values(e.languages)[0]; console.log('page_count:', en.page_count); process.exit(en.page_count>=21?0:1)" && echo "INDEX COUNT OK"
  ```
  Expect `page_count` >= 21 (20 docs + homepage).

### Task 57: Verify `search.json` fallback is generated in dist-site with real content

- [ ] **Step 57.1: Confirm the file exists in the deployed dir.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && ls -la dist-site/search.json
  ```
- [ ] **Step 57.2: Confirm entries with title/url/excerpt and base-prefixed URLs.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node -e "const d=require('./dist-site/search.json'); console.log('entries:', d.length); const sample=d.find(x=>x.url.includes('/docs/')); console.log(JSON.stringify({title:sample.title, url:sample.url, hasExcerpt: !!sample.excerpt}, null, 2)); const allBased=d.every(x=>x.url.startsWith('/activitypub-mcp/')); console.log('all URLs base-prefixed:', allBased); process.exit(d.length>=21 && allBased ?0:1)" && echo "SEARCH JSON OK"
  ```
  Expect >= 21 entries, every `url` starting with `/activitypub-mcp/`, and a docs sample with title + excerpt.

### Task 58: Verify the sitemap lists all 20 docs routes + homepage with base-path URLs

- [ ] **Step 58.1: Confirm both sitemap files exist.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && ls dist-site/sitemap-index.xml dist-site/sitemap-0.xml && echo "SITEMAP FILES OK"
  ```
- [ ] **Step 58.2: Count the homepage + docs URLs.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && echo "homepage:" && grep -c "<loc>https://cameronrye.github.io/activitypub-mcp/</loc>" dist-site/sitemap-0.xml && echo "docs routes:" && grep -oE "https://cameronrye.github.io/activitypub-mcp/docs/[^<]+" dist-site/sitemap-0.xml | sort -u | wc -l
  ```
  Expect homepage `1` and docs routes `20`.
- [ ] **Step 58.3: Confirm all 20 expected slugs are present.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && for slug in getting-started/installation getting-started/claude-desktop getting-started/configuration getting-started/cross-platform guides/basic-usage guides/examples guides/fediverse-exploration guides/advanced-workflows api/tools api/resources api/prompts reference/troubleshooting reference/changelog development/architecture development/dependencies development/performance development/security specifications/activitypub specifications/webfinger specifications/activitystreams; do grep -q "activitypub-mcp/docs/$slug/" dist-site/sitemap-0.xml && echo "OK  $slug" || echo "MISSING  $slug"; done | grep MISSING || echo "ALL 20 SLUGS PRESENT"
  ```
  Expect `ALL 20 SLUGS PRESENT`.
- [ ] **Step 58.4: Confirm the two dropped routes are absent.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -E "activitypub-mcp/docs/?</loc>|fedify-cli" dist-site/sitemap-0.xml && echo "DROPPED ROUTE LEAKED" || echo "dropped routes absent from sitemap"
  ```

### Task 59: Verify `.well-known/*` and robots.txt survive into dist-site

- [ ] **Step 59.1: Confirm both `.well-known` files exist.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && ls -la dist-site/.well-known/security.txt dist-site/.well-known/change-password && echo "WELL-KNOWN OK"
  ```
- [ ] **Step 59.2: Confirm `security.txt` content survived.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -E "Contact:|Expires:" dist-site/.well-known/security.txt && echo "SECURITY.TXT CONTENT OK"
  ```
- [ ] **Step 59.3: Confirm robots.txt references the sitemap and allows `.well-known`.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -E "Sitemap: https://cameronrye.github.io/activitypub-mcp/sitemap-index.xml|Allow: /.well-known/" dist-site/robots.txt && echo "ROBOTS OK"
  ```

### Task 60: Verify base-path correctness across all built HTML

- [ ] **Step 60.1: Confirm favicon, logo, OG image use the base prefix in the homepage `<head>`.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -oE '(href|content|src)="/activitypub-mcp/(favicon\.svg|logo\.svg|og-image\.png)"' dist-site/index.html | sort -u && echo "BASE ASSETS OK"
  ```
  Expect `/activitypub-mcp/favicon.svg`, `/activitypub-mcp/logo.svg`, and `/activitypub-mcp/og-image.png`.
- [ ] **Step 60.2: Scan a docs page for base-bypassing internal anchors.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -oE 'href="/[^"]*"' dist-site/docs/getting-started/installation/index.html | grep -vE 'href="/activitypub-mcp' | sort -u && echo "---(any lines above = base-bypassing links to fix)---" || echo "no base-bypassing hrefs on docs page"
  ```
  Expect no offending `href` lines.
- [ ] **Step 60.3: Confirm sidebar links resolve to base-prefixed docs slugs.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -oE 'href="/activitypub-mcp/docs/[^"]+"' dist-site/docs/getting-started/installation/index.html | sort -u | head && echo "SIDEBAR LINKS BASE-PREFIXED"
  ```
- [ ] **Step 60.4: Confirm the canonical URL derives from `site` + `base`.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -oE '<link rel="canonical" href="https://cameronrye.github.io/activitypub-mcp[^"]*"' dist-site/index.html && echo "CANONICAL OK"
  ```

### Task 61: Verify OG image (base-prefixed), Twitter cards, theme-color, and JSON-LD

- [ ] **Step 61.1: Confirm the regenerated OG image exists and is non-trivial.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && ls -la dist-site/og-image.png && node -e "const s=require('fs').statSync('dist-site/og-image.png').size; console.log('bytes:', s); process.exit(s>10000?0:1)" && echo "OG IMAGE OK"
  ```
- [ ] **Step 61.2: Confirm OG and Twitter image meta point at the BASE-PREFIXED OG image (fixed in Phase 2 Task 13).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -E 'property="og:image"|name="twitter:image"|name="twitter:card"' dist-site/index.html
  ```
  Expect `og:image` and `twitter:image` to be `https://cameronrye.github.io/activitypub-mcp/og-image.png` and `twitter:card` = `summary_large_image`. If the URL lacks the `/activitypub-mcp/` segment, Phase 2 Task 13 Step 13.3 did not land — fix the BaseLayout OG-image default.
- [ ] **Step 61.3: Confirm `theme-color` is vermilion (not `#6366f1`).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -E 'name="theme-color"' dist-site/index.html && grep -rn "#6366f1" dist-site/index.html && echo "OLD THEME-COLOR STILL PRESENT" || echo "theme-color migrated to vermilion"
  ```
  Expect `content="#E8552D"` and `theme-color migrated to vermilion`.
- [ ] **Step 61.4: Validate the JSON-LD parses.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && node -e "const fs=require('fs');const h=fs.readFileSync('dist-site/index.html','utf8');const m=[...h.matchAll(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/g)];if(!m.length){console.log('NO JSON-LD FOUND');process.exit(1)}m.forEach((b,i)=>{const o=JSON.parse(b[1]);console.log('block',i,'@type:',o['@type']||(o['@graph']&&'@graph')||'?')});console.log('JSON-LD valid')"
  ```
  Expect each block to parse and print `JSON-LD valid`.

### Task 62: Serve the production build and verify base-path routing live (port 4321)

- [ ] **Step 62.1: Start the preview server in the background.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npm run preview:site
  ```
  (run in background; Astro preview serves `http://localhost:4321/activitypub-mcp`).
- [ ] **Step 62.2: Confirm the homepage responds 200 under the base.**
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/activitypub-mcp/
  ```
  Expect `200`.
- [ ] **Step 62.3: Confirm key routes resolve over HTTP.**
  ```bash
  for u in docs/getting-started/installation/ docs/api/tools/ search.json pagefind/pagefind.js .well-known/security.txt; do code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:4321/activitypub-mcp/$u"); echo "$code  /activitypub-mcp/$u"; done
  ```
  Expect `200` for every line.
- [ ] **Step 62.4: Confirm an asset WITHOUT the base 404s (base isolation).**
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/search.json
  ```
  Expect `404`.
- [ ] **Step 62.5: Stop the preview server** (TaskStop, or `pkill -f "astro preview"`).

### Task 63: Verify light/dark/system theming and no-FOUC on the production preview

- [ ] **Step 63.1: Confirm the no-FOUC inline script ships before theme-dependent CSS.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -nE "localStorage|prefers-color-scheme|data-theme|documentElement" dist-site/index.html | head
  ```
  Confirm an inline script reads `localStorage`, falls back to `prefers-color-scheme`, and sets `data-theme` on `documentElement` before any stylesheet `<link>`.
- [ ] **Step 63.2: Confirm the dark token block + system media-query fallback exist in built CSS (in `dist-site/assets/`).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rhoE "\[data-theme=.dark.\]|prefers-color-scheme: dark|\[data-theme=.system.\]" dist-site/assets/*.css | sort -u
  ```
  Expect all three selectors.
- [ ] **Step 63.3: Confirm the logo dot-flip is driven by `--logo-dot-flip`.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rhoE "\-\-logo-dot-flip: *(var\(--color-ink\)|#1A1714|var\(--color-paper\)|#FBF7F0)" dist-site/assets/*.css | sort -u
  ```
  Expect the light default (ink) and the dark override (paper).
- [ ] **Step 63.4: Visually verify all three states on the running preview.** With `npm run preview:site` running, open `http://localhost:4321/activitypub-mcp/` and a docs page: Light (paper bg, ink dot), Dark (ink bg, dot flips to paper), System (follows OS). Hard-reload several times in each state — confirm NO flash before the dark theme paints.
- [ ] **Step 63.5: Confirm fonts are self-hosted (no Google Fonts).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rn "fonts.googleapis.com\|fonts.gstatic.com\|/Inter" dist-site/index.html dist-site/assets/*.css && echo "GOOGLE FONTS LEAK" || echo "no google fonts references"
  ```
  Expect `no google fonts references`. (Also confirm in DevTools Network that bundled fontsource files load and no `fonts.googleapis.com`/`fonts.gstatic.com` requests fire.)

### Task 64: Verify mobile nav and mobile search on the preview

- [ ] **Step 64.1: Confirm mobile-nav/search-overlay markup survived into built HTML.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -oE 'class="[^"]*(mobile-nav|nav-toggle|menu-toggle|search-overlay|search-trigger)[^"]*"' dist-site/index.html | sort -u
  ```
  Cross-check the selectors against the actual class names referenced in `public/scripts/main.js`.
- [ ] **Step 64.2: Confirm `main.js` is referenced and served under the base.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -oE 'src="/activitypub-mcp/scripts/main\.js"' dist-site/index.html && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/activitypub-mcp/scripts/main.js
  ```
  Expect a base-prefixed `src` and HTTP `200`.
- [ ] **Step 64.3: Visually verify at 375px (DevTools device mode).** Hamburger opens/closes the mobile nav; the mobile search trigger opens the overlay; typing `installation` returns Pagefind results linking to base-prefixed docs URLs; Tab/Escape close the overlay; sections reflow to one column with no horizontal overflow.

### Task 65: Verify no broken internal links across the built site

- [ ] **Step 65.1: Extract every internal `/activitypub-mcp/...` href.** With the preview running:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rhoE 'href="/activitypub-mcp/[^"#?]*"' dist-site --include='*.html' | sed -E 's/href="//; s/"$//' | sort -u > /tmp/links.txt && echo "unique internal links:" && wc -l < /tmp/links.txt
  ```
- [ ] **Step 65.2: HTTP-check each unique link returns 200.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && fail=0; while read -r p; do code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:4321$p"); if [ "$code" != "200" ]; then echo "$code  $p"; fail=1; fi; done < /tmp/links.txt; [ "$fail" = "0" ] && echo "ALL INTERNAL LINKS 200" || echo "BROKEN LINKS ABOVE"
  ```
  Expect `ALL INTERNAL LINKS 200`. (This also catches the BaseLayout navbar/footer doc links repointed in Phase 2 Task 13.)
- [ ] **Step 65.3: Confirm no link still uses an old `.astro`-era slug.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rnE "docs/setup/|docs/guides/practical-examples|docs/guides/usage-guide|docs/guides/real-world-test-scenario|claude-desktop-integration|configuration-options|config-guide|fedify-cli|/docs/?\"" dist-site --include='*.html' && echo "STALE SLUG LINKS FOUND" || echo "no stale slug links"
  ```
  Expect `no stale slug links`. (This includes the bare `/docs/`-index link that BaseLayout previously emitted — Phase 2 Task 13.4 repointed it.)
- [ ] **Step 65.4: Confirm the sidebar is collection-driven (no `_docsNav`).**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && grep -rn "_docsNav" site/ && echo "_docsNav STILL PRESENT" || echo "no _docsNav (collection-driven)"
  ```
  Expect `no _docsNav (collection-driven)`.

### Task 66: Verify WCAG AA contrast and accessibility (Lighthouse / axe)

- [ ] **Step 66.1: Lighthouse accessibility on the homepage (light).** With the preview running:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npx -y lighthouse http://localhost:4321/activitypub-mcp/ --only-categories=accessibility --quiet --chrome-flags="--headless" --output=json --output-path=/tmp/lh-home.json 2>/dev/null; node -e "const r=require('/tmp/lh-home.json'); console.log('a11y score:', r.categories.accessibility.score*100); const fails=Object.values(r.audits).filter(a=>a.score===0 && a.scoreDisplayMode==='binary').map(a=>a.id); console.log('failing audits:', fails.join(', ')||'none')"
  ```
  Expect a high score and NO `color-contrast` failure.
- [ ] **Step 66.2: Lighthouse on a docs page.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npx -y lighthouse http://localhost:4321/activitypub-mcp/docs/api/tools/ --only-categories=accessibility --quiet --chrome-flags="--headless" --output=json --output-path=/tmp/lh-docs.json 2>/dev/null; node -e "const r=require('/tmp/lh-docs.json'); console.log('a11y score:', r.categories.accessibility.score*100); const fails=Object.values(r.audits).filter(a=>a.score===0 && a.scoreDisplayMode==='binary').map(a=>a.id); console.log('failing audits:', fails.join(', ')||'none')"
  ```
  Expect no `color-contrast`, `image-alt`, or `heading-order` failures.
- [ ] **Step 66.3: axe-core against dark theme.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && npx -y @axe-core/cli http://localhost:4321/activitypub-mcp/ --tags wcag2aa --exit 2>&1 | tail -20
  ```
  If axe-cli cannot toggle the theme, set Dark mode manually in the browser and run an in-page axe scan via DevTools; confirm zero `color-contrast` violations in dark mode. Per §2.4: gold is reserved for large/non-text accents; body text is ink/paper; clay only for hover where it passes.
- [ ] **Step 66.4: Record results.** Both themes pass WCAG AA on body text and interactive elements; re-tone per §2.4 any failing element before proceeding.

### Task 67: Final consolidated acceptance sweep (spec §11)

- [ ] **Step 67.1: Build pipeline end-to-end** — confirmed green in Task 53 (`Counts verified` + `Complete!` + `Indexed` + `Generated search data`).
- [ ] **Step 67.2: Confirm `SimpleSearch.astro` removed and unreferenced.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && ls site/components/SimpleSearch.astro 2>/dev/null && echo "FILE STILL EXISTS" || echo "SimpleSearch.astro deleted"; grep -rn "SimpleSearch" site/ && echo "REFERENCES FOUND" || echo "no SimpleSearch references"
  ```
  Expect `SimpleSearch.astro deleted` and `no SimpleSearch references`.
- [ ] **Step 67.3: Confirm the four consolidations and two drops.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && for f in getting-started/claude-desktop getting-started/configuration guides/examples guides/advanced-workflows; do ls site/src/content/docs/$f.mdx >/dev/null 2>&1 && echo "OK  $f.mdx" || echo "MISSING  $f.mdx"; done; ls site/src/content/docs/specifications/fedify-cli.mdx 2>/dev/null && echo "DROP LEAKED (fedify-cli)" || echo "fedify-cli absent (correct)"; ls site/src/content/docs/index.mdx 2>/dev/null && echo "DROP LEAKED (docs index)" || echo "docs index absent (correct)"
  ```
- [ ] **Step 67.4: Confirm exactly 20 MDX content files.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && find site/src/content/docs -name '*.mdx' | wc -l
  ```
  Expect `20`.
- [ ] **Step 67.5: Confirm brand assets are in place.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && for a in favicon.svg logo.svg logo-monochrome.svg logo-inverse.svg og-image.png; do ls -la public/$a >/dev/null 2>&1 && echo "OK  public/$a" || echo "MISSING  public/$a"; done
  ```
  Expect all present.
- [ ] **Step 67.6: Run the full §11 checklist** with the evidence from Tasks 53–66:
  - [ ] `npm run build:site` completes end-to-end (Task 53).
  - [ ] Manifest = 37/10/5, rendered from JSON via `cap-number`, no hardcoded counts (Task 54).
  - [ ] Version badge = v3.0.0; no current `v2.0.0`/`53`/`11` in site, `llms.txt`, `llms-full.txt` (Task 55).
  - [ ] Pagefind index under `dist-site/pagefind/`; `search.json` fallback in `dist-site` (Tasks 56, 57).
  - [ ] Sitemap lists 20 docs + homepage with base-path URLs; drops absent (Task 58).
  - [ ] `.well-known/security.txt` + `change-password` present (Task 59).
  - [ ] All 20 docs reachable via `[...slug].astro`; sidebar collection-driven (no `_docsNav`); TOC from headings with scroll-spy (Tasks 58, 65).
  - [ ] Four consolidations complete, two drops absent (Steps 67.3–67.4).
  - [ ] No broken links; all cross-links use new slugs; BaseLayout nav/footer doc links repointed (Task 65).
  - [ ] Light/dark/system parity; logo dot-flip on dark; no-FOUC on production (Task 63).
  - [ ] No Google Fonts/Inter at runtime; three fontsource families serve in role (Task 63 Step 5).
  - [ ] WCAG AA contrast both themes (Task 66).
  - [ ] Brand assets in place; `theme-color` = `#E8552D` (Tasks 61, 67.5).
  - [ ] `SimpleSearch.astro` removed (Step 67.2).
  - [ ] OG/Twitter cards + JSON-LD validate; OG image base-prefixed (Task 61).
- [ ] **Step 67.7: Clean up the old `site/pages/docs/` tree (superseded by the MDX collection).** All 26 old docs `.astro` files are now replaced by the collection routes; remove the directory and confirm the build still passes with no missing routes:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git rm -r site/pages/docs && npm run build:site 2>&1 | tail -10
  ```
  Confirm the build succeeds and all 20 docs routes still emit (re-run Task 42 Step 2 to confirm `20`). If any route disappears, STOP — a page was not migrated.
- [ ] **Step 67.8: Commit the verified state.** Do NOT commit `dist-site/` (generated, gitignored); commit source fixes + the docs-tree cleanup:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git add -A && git status --short && git commit -m "chore: remove superseded docs .astro tree; finalize brand overhaul verification" || echo "nothing to commit"
  ```

### Task 68: Deploy to GitHub Pages

Static GitHub Pages deployment at `https://cameronrye.github.io/activitypub-mcp/`. Default branch is `main` (renamed from `master` 2026-05-30); a Pages workflow runs on push to `main`.

- [ ] **Step 68.1: Push the feature branch.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && git push -u origin feat/website-brand-overhaul
  ```
- [ ] **Step 68.2: Open the PR into `main`** (no AI/Claude attribution in title/body, per global commit rules):
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && gh pr create --base main --head feat/website-brand-overhaul --title "Website & brand overhaul: warm palette, MDX docs collection, build-derived capabilities" --body "Replaces the brand identity (paper/vermilion/teal/gold/ink/clay, self-hosted Bricolage Grotesque / Hanken Grotesk / JetBrains Mono, crossing-arcs logo), migrates the docs .astro pages to a typed MDX collection consolidated to 20 pages, rebuilds the homepage on the Hero B layout with build-derived 37/10/5 capabilities, and adds light/dark/system theming with no-FOUC. Preserves Pagefind, sitemap, .well-known handling, and the /activitypub-mcp base path."
  ```
- [ ] **Step 68.3: Watch CI to green.**
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && gh pr checks --watch
  ```
- [ ] **Step 68.4: Merge.** Per project memory, PRs show `BLOCKED`/`REVIEW_REQUIRED` from stale branch-protection contexts and need an admin squash-merge:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && gh pr merge feat/website-brand-overhaul --squash --admin
  ```
- [ ] **Step 68.5: Confirm the Pages deploy ran on `main` and was not rejected.** Per project memory, the `github-pages` environment's deployment-branch policy previously allowed only `master` after the rename; if the deploy job is rejected on `main`, add `main` to the allowed deployment branches (Settings → Environments → github-pages) and re-run:
  ```bash
  cd /Users/cameron/Developer/activitypub-mcp && gh run list --branch main --workflow "Deploy to GitHub Pages" --limit 3
  ```
  Confirm the latest run is `completed`/`success`.
- [ ] **Step 68.6: Verify the live site once Pages publishes (~1–2 min).**
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" https://cameronrye.github.io/activitypub-mcp/ && for u in docs/getting-started/installation/ docs/api/tools/ search.json pagefind/pagefind.js .well-known/security.txt sitemap-index.xml og-image.png; do code=$(curl -s -o /dev/null -w "%{http_code}" "https://cameronrye.github.io/activitypub-mcp/$u"); echo "$code  $u"; done
  ```
  Expect `200` for the homepage and every listed path.
- [ ] **Step 68.7: Spot-check the live homepage for corrected counts/version.**
  ```bash
  curl -s https://cameronrye.github.io/activitypub-mcp/ | grep -oE "v3\.0\.0|cap-number\">(37|10|5)<" | sort -u && curl -s https://cameronrye.github.io/activitypub-mcp/ | grep -E "53 MCP|v2.0.0" && echo "STALE ON LIVE SITE" || echo "live site shows corrected counts/version"
  ```
  Expect `v3.0.0` and the 37/10/5 figures present, and `live site shows corrected counts/version`.

**Deploy note (GitHub Pages):** Deploys via the repo's GitHub Actions Pages workflow on push to `main` (default branch, renamed from `master` 2026-05-30). Two known gotchas from project memory: (1) the `github-pages` environment's deployment-branch policy may still only allow `master` — if the deploy is rejected, add `main` and re-run. (2) Branch protection may surface stale required-status contexts (`BLOCKED`/`REVIEW_REQUIRED`), requiring an `--admin` squash-merge. No `gh-pages` branch or manual upload is needed; `base: "/activitypub-mcp"` + `outDir: "./dist-site"` (the workflow uploads `dist-site/` as the Pages artifact) produce the correct sub-path deployment. The `.well-known/*`, `search.json`, Pagefind index, and sitemap all ship inside `dist-site/` and serve under `/activitypub-mcp/`.

---

## Notes on execution order & dependencies

- **Task 1 (install `@astrojs/check` + `check` script) is the very first thing done** — every later "verify the Astro file" step depends on `npm run check` being available non-interactively. Do not skip it. `npm run typecheck` (tsc) only covers the MCP runtime in `src/`, NOT `site/`; never use it to validate site files.
- **Phase 1 must complete before all other phases.** Specifically, the design tokens (`tokens.css`/`fonts.css`/`main.css` rewrite) must land before Phase 2 reskins anything, and the registry manifest (`site/src/data/registry-manifest.json` = 37/10/5) must exist and be committed before Phase 5 reads it (Task 43 hard-stops if the manifest is missing) and before Phase 6 verifies it.
- **Phase 2 before Phase 3:** Phase 2 lands the dual-theme Shiki config + CSS hook (Task 12), the legacy-alias bridge, and the canonical CopyButton/CodeBlock; Phase 3's DocsLayout and Phase 5's homepage both depend on these. Phase 2 Task 13 also fixes the BaseLayout OG-image base path and repoints the navbar/footer doc links away from the dropped `docs/` index — Phase 6 Tasks 61 and 65 assume those fixes are in place.
- **Phase 3 before Phase 4:** the content-collection config, dynamic route, and rebuilt DocsLayout (collection-driven sidebar with class `nav-item`, TOC + scroll-spy) must exist before any MDX page is migrated; Phase 4 Task 27 hard-stops if the scaffold is absent.
- **Phase 4 before Phase 5/6 link verification:** the 20 MDX pages and their new slugs must exist before the homepage's docs/capability links and Phase 6's broken-link sweep can resolve.
- **Phase 5 after Phase 1 manifest exists** (counts) and **after Phase 2 CopyButton/CodeBlock exist** (imported, not recreated).
- **Phase 6 last:** it fixes the `search.json` output path first (Task 52, a prerequisite for a correct full build), then runs the cold build and the full §11 acceptance sweep, removes the superseded `site/pages/docs/` tree only after confirming all 20 routes still emit, and finally deploys. The old docs `.astro` tree is intentionally retained through Phases 4–5 and removed only in Task 67.7 after verification.
