# v2 Plan D — Build, Test & CI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 4 build/test/CI findings from spec section 5 (M9 lint:fix in CI, M10 test:all broken alias, M11 source maps shipped, L9 dead code accumulation) and add the new infrastructure the spec calls for (typecheck script + CI step, Node 20+ matrix, npm pack guard, bin smoke test, daily integration workflow).

**Architecture:** No application code changes. All changes are to `package.json`, `tsconfig.json`, `biome.json`, `.npmignore`, `vitest.config*.ts`, the test guards in `tests/integration/`, and `.github/workflows/*.yml`. The plan also fixes any TypeScript errors that surface when stricter compiler flags are enabled (L9) — those are real code changes but should be small and surgical.

**Tech Stack:** TypeScript (tsc), Vitest, Biome, GitHub Actions, npm.

**Spec reference:** [docs/superpowers/specs/2026-05-27-v2-release-design.md §5](../specs/2026-05-27-v2-release-design.md)

**Plan A/B/C context:**
- v2 branch baseline at this plan's start: 628 tests passing.
- All code-level findings from §2/§3/§4 are resolved.
- `npx tsc --noEmit` is clean. This plan adds it to CI so it stays that way.
- File paths are pre-refactor; Plan E moves them.

---

## Pre-flight

- Confirm branch: `git branch --show-current` → `v2`.
- Baseline: `npm test` → 628 passing.
- `npx tsc --noEmit` → zero errors.

---

## Task 1: Add `typecheck` npm script

**Files:**
- Modify: `package.json` (scripts block)

The simplest of the bunch — add a named script so CI can call it without duplicating the command.

- [ ] **Step 1: Add the script**

In `package.json`, in the `"scripts"` block, add:

```json
"typecheck": "tsc --noEmit",
```

Order it adjacent to `"build"` since both invoke `tsc`. Don't change any existing scripts.

- [ ] **Step 2: Verify it works**

Run: `npm run typecheck`
Expected: zero output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build(scripts): add npm run typecheck (tsc --noEmit)"
```

---

## Task 2: Drop Node 18, set minimum to Node 20

**Files:**
- Modify: `package.json` (`engines.node`)
- Modify: `.github/workflows/ci.yml` (matrix)
- Modify: `.github/workflows/release.yml` (any Node version pins)
- Modify: `.github/workflows/auto-release.yml` (any Node version pins)
- Modify: `.github/workflows/security.yml` (any Node version pins)
- Modify: `README.md` (installation prerequisites section if present)
- Update: `MIGRATION-v2.md`

Node 18 reached EOL on April 30, 2025. v2 requires Node 20+. This is a documented breaking change.

- [ ] **Step 1: Update `package.json` engines**

In `package.json`:

```json
"engines": {
  "node": ">=20.0.0"
}
```

- [ ] **Step 2: Update CI workflow matrix**

In `.github/workflows/ci.yml`, change:

```yaml
node-version: [18.x, 20.x, 22.x]
```

to:

```yaml
node-version: [20.x, 22.x]
```

Leave the rest of the matrix (os list, fail-fast, etc.) unchanged.

- [ ] **Step 3: Audit other workflows for hard-coded Node 18**

```bash
grep -rn "node-version\|18.x\|18.0" .github/workflows/
```

For each hit referencing Node 18 (likely `release.yml`, `auto-release.yml`, `security.yml`, `deploy-pages.yml`):
- If the file pins a specific Node version like `'20.x'`, leave it.
- If it tests against `18.x` in a matrix, remove that entry.

- [ ] **Step 4: Update README installation prerequisites**

```bash
grep -n "Node.js\|node 18\|>= 18" README.md
```

Find any prerequisite line that says "Node.js 18+" or similar and change to "Node.js 20+".

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Update `MIGRATION-v2.md`**

Under "Required actions to run v2.0.0" (section 1 in Plan A's doc), confirm the "Upgrade Node to 20+" section is present and accurate. If it's already there from Plan A, no change needed. Verify by reading.

- [ ] **Step 7: Commit**

```bash
git add package.json .github/workflows/ README.md
# Add MIGRATION-v2.md only if Step 6 required changes
git commit -m "feat!(build): drop Node 18, require Node 20+ engines

BREAKING CHANGE: Node 18 reached EOL April 30, 2025. v2 requires Node 20
LTS or later. CI matrix updated to [20.x, 22.x]."
```

---

## Task 3: Remove `lint:fix` from CI (M9)

**Files:**
- Modify: `.github/workflows/ci.yml`

CI currently runs `npm run lint:fix` (mutating) BEFORE `npm run lint` (checking). The fix step silently mutates the workspace, so code that wasn't lint-clean at commit time still passes CI. CI must be read-only.

- [ ] **Step 1: Locate the lint:fix steps**

```bash
grep -n "lint:fix\|Auto-fix" .github/workflows/ci.yml
```

There are typically two `Auto-fix linting issues` steps (one in the `test` job around line 43, one in the `lint` job around line 94 per the snapshot read earlier).

- [ ] **Step 2: Remove both `lint:fix` steps**

For each occurrence, delete the entire step block:

```yaml
    - name: Auto-fix linting issues
      run: npm run lint:fix
      env:
        NODE_OPTIONS: --max-old-space-size=4096
```

The `Run linting` step (`npm run lint`) immediately following it stays.

- [ ] **Step 3: Verify CI workflow YAML is still valid**

```bash
# Quick syntax check — install a YAML validator if not present, or eyeball.
# Most CIs validate on push, but local sanity check:
node -e "const yaml = require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/ci.yml', 'utf8')); console.log('valid');"
```

If `js-yaml` is not installed, skip this step — the YAML structure is preserved by removing the block entirely.

- [ ] **Step 4: Confirm `npm run lint` still passes locally**

Run: `npm run lint`
Expected: clean (`Checked X files. No fixes applied.`).

If lint fails, that's a real issue this plan needs to surface before merging — the previous CI was silently fixing things. Look at the failures and either fix them in-place or surface as a separate cleanup commit. Most likely: clean (since the plan's prior work has been lint-clean).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: remove mutating lint:fix steps (M9)

CI should be read-only. The lint:fix steps silently rewrote the workspace
before validation, so code that wasn't lint-clean at commit time could
still pass. Now lint is a hard gate."
```

---

## Task 4: Add typecheck step to CI

**Files:**
- Modify: `.github/workflows/ci.yml`

Add `npm run typecheck` as a separate CI step on every PR, on both Node versions in the matrix.

- [ ] **Step 1: Add a typecheck step**

In `.github/workflows/ci.yml`, in the `test` job, after the `Install dependencies` step and before `Run linting`, insert:

```yaml
    - name: Typecheck
      run: npm run typecheck
      env:
        NODE_OPTIONS: --max-old-space-size=4096
```

Position matters: typecheck before lint and build, so a type error fails fast (typecheck is faster than a full build).

- [ ] **Step 2: Verify the workflow YAML is well-formed**

Eyeball the indentation. GitHub Actions is strict about YAML indentation — two spaces per level inside the steps list.

- [ ] **Step 3: Run typecheck locally as a sanity check**

Run: `npm run typecheck`
Expected: zero output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck step (npm run typecheck)"
```

---

## Task 5: Fix `test:all` to actually run integration tests (M10 part 1)

**Files:**
- Modify: `package.json` (`scripts.test:all`)

`"test:all": "vitest run"` is identical to `"test": "vitest run"` — it doesn't run integration tests because `vitest.config.ts` excludes them. Fix the alias so it actually runs both.

- [ ] **Step 1: Update the script**

In `package.json`:

```json
"test:all": "vitest run && vitest run --config vitest.config.integration.ts",
```

Note: this WILL hit live network endpoints if `tests/integration/**` is not guarded. Task 6 addresses that — Task 6 should land BEFORE pushing to a CI environment that calls `test:all` unguarded. The two tasks together close the loop.

- [ ] **Step 2: Verify the new alias runs both suites locally**

Run: `RUN_INTEGRATION_TESTS=1 npm run test:all`
Expected: both suites run; both pass (or integration may fail/skip if there are network issues — that's tolerable for now since Task 6 guards them).

If you don't want to hit live network locally, leave `RUN_INTEGRATION_TESTS` unset and confirm the unit suite still runs first — then Task 6 will skip integration when the env var is missing.

- [ ] **Step 3: Run the full unit suite to ensure no regressions**

Run: `npm test`
Expected: 628 passing.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build(scripts): test:all now runs unit + integration suites (M10 part 1)

Previously identical to 'test', which only ran the default Vitest config
(unit tests). Now actually runs both vitest.config.ts and
vitest.config.integration.ts in sequence."
```

---

## Task 6: Guard live-network integration tests with `RUN_INTEGRATION_TESTS` (M10 part 2)

**Files:**
- Modify: `tests/integration/live-fediverse.test.ts`
- Modify: any other `tests/integration/*.test.ts` that hits the live network

Task 5 unblocked `test:all` running both suites; this task makes the integration suite a no-op unless `RUN_INTEGRATION_TESTS=1` is set. Without the guard, every CI run that includes integration would hammer mastodon.social and fail unpredictably.

- [ ] **Step 1: List integration test files**

```bash
ls tests/integration/*.test.ts tests/integration/*.spec.ts 2>/dev/null
```

The current files are `tests/integration/live-fediverse.test.ts` (and possibly more — check the directory).

- [ ] **Step 2: Add a `describe.skipIf(...)` wrapper to each live-network test file**

For each file in Step 1, find every top-level `describe(...)` and change to `describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(...)`. Example:

Before:
```typescript
describe("Live Fediverse integration", () => {
  it("fetches a real mastodon.social actor", async () => { ... });
});
```

After:
```typescript
describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)("Live Fediverse integration", () => {
  it("fetches a real mastodon.social actor", async () => { ... });
});
```

Apply to every `describe` block at the top of each file. (Nested `describe`s inside an outer guarded one inherit the skip — don't need to repeat.)

- [ ] **Step 3: Run integration tests WITHOUT the env var — all should skip**

Run: `npx vitest run --config vitest.config.integration.ts`
Expected: tests reported as skipped, exit code 0.

- [ ] **Step 4: Run integration tests WITH the env var — they should run (and likely make network calls)**

Run: `RUN_INTEGRATION_TESTS=1 npx vitest run --config vitest.config.integration.ts`
Expected: tests run; pass or fail based on network state. We don't gate on result here — just confirm they're invoked.

- [ ] **Step 5: Confirm `npm run test:all` still passes WITHOUT the env var**

Run: `npm run test:all`
Expected: unit suite passes (628), integration suite reports all skipped, overall exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/
git commit -m "test: guard integration tests behind RUN_INTEGRATION_TESTS env (M10 part 2)

Live-network integration tests now skip by default. Set
RUN_INTEGRATION_TESTS=1 to opt in. Prevents test:all from hammering
mastodon.social on every CI run."
```

---

## Task 7: Update CI to use `test:all`

**Files:**
- Modify: `.github/workflows/ci.yml`

`ci.yml` currently runs `npm run test:all`. With the Task 5/6 changes, that command now runs both unit and (guarded) integration suites. Integration will skip in CI (no env var set), but the script returns success. Confirm CI's existing call to `test:all` is still appropriate.

- [ ] **Step 1: Confirm `ci.yml` calls `test:all`**

```bash
grep -n "test:all\|npm.*test" .github/workflows/ci.yml
```

If the test step is `npm run test:all`, no change needed. If it's `npm test`, leave it as `npm test` (we want CI to run unit only by default — integration runs in the dedicated workflow added in Task 8).

The plan's recommendation: keep CI on `npm test` (unit only). Integration runs on the daily schedule in `integration.yml`. If `ci.yml` currently says `test:all`, change to `test`. Done.

- [ ] **Step 2: If a change was made, commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run unit tests via 'npm test', integration runs on daily schedule"
```

If `ci.yml` already says `npm test` (unit only), skip the commit.

---

## Task 8: Add daily integration test workflow

**Files:**
- Create: `.github/workflows/integration.yml`

Runs the integration suite against the live Fediverse on a daily schedule. Catches upstream regressions (Mastodon API changes, instance outages) without blocking PR merges.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/integration.yml`:

```yaml
name: Integration Tests (live network)

on:
  schedule:
    # Daily at 06:00 UTC
    - cron: '0 6 * * *'
  workflow_dispatch:
    # Allow manual trigger

jobs:
  integration:
    name: Integration tests on Node ${{ matrix.node-version }}
    runs-on: ubuntu-latest
    timeout-minutes: 15

    strategy:
      fail-fast: false
      matrix:
        node-version: [20.x, 22.x]

    steps:
      - name: Checkout code
        uses: actions/checkout@v6

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm run test:integration
        env:
          RUN_INTEGRATION_TESTS: '1'
          NODE_OPTIONS: --max-old-space-size=4096

      - name: Notify on failure
        if: failure()
        run: |
          echo "::error::Integration tests failed. Likely cause: upstream Fediverse API change or instance outage."
```

- [ ] **Step 2: Verify the workflow YAML is well-formed**

Quick eyeball — indentation, no missing colons.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/integration.yml
git commit -m "ci: add daily integration test workflow (M10 part 3)

Runs tests/integration/* against the live Fediverse on a daily schedule
and on workflow_dispatch. Non-blocking — failures surface as workflow
notifications rather than gating PRs."
```

---

## Task 9: `files` whitelist + drop source maps (M11)

**Files:**
- Modify: `package.json` (add `"files"` field)
- Modify: `tsconfig.json` (`declarationMap: false`)

Currently the npm publish includes everything not blacklisted by `.npmignore`. Source maps and declaration maps are not blacklisted. Switch to a whitelist (`"files"` in package.json) so we publish exactly what we want.

- [ ] **Step 1: Decide what ships**

The intended npm tarball contents:
- `dist/**/*.js` — compiled output
- `dist/**/*.d.ts` — type definitions (consumers need these)
- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `MIGRATION-v2.md`

Explicitly excluded by the whitelist (automatically):
- `*.map` files (source maps, declaration maps)
- `src/`, `tests/`, `scripts/`, `docs/`, `.github/`, `.astro/`, `.vscode/`
- `node_modules/`
- Everything else

- [ ] **Step 2: Add the `"files"` whitelist to `package.json`**

In `package.json`, add (in top-level, alphabetically between `engines` and `keywords` is a sensible spot):

```json
"files": [
  "dist/**/*.js",
  "dist/**/*.d.ts",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "MIGRATION-v2.md"
],
```

`package.json` itself, `README.md`, `LICENSE`, `CHANGELOG.md` are included by npm by default — but listing them explicitly makes the intent clear and survives any default-list changes.

- [ ] **Step 3: Disable declaration maps in tsconfig**

In `tsconfig.json`, change:

```json
"declarationMap": true,
```

to:

```json
"declarationMap": false,
```

Leave `"sourceMap": true` for local debugging — `.map` files just won't ship because the whitelist excludes them.

- [ ] **Step 4: Verify the tarball contents**

Run: `npm run build && npm pack --dry-run 2>&1 | grep -E "Tarball Contents:" -A 200 | head -60`

Expected output: a list of files that includes:
- `dist/**/*.js` entries
- `dist/**/*.d.ts` entries
- `README.md`, `LICENSE`, `CHANGELOG.md`, `MIGRATION-v2.md`, `package.json`

Expected output should NOT include:
- Any `*.js.map` or `*.d.ts.map` files
- Anything under `src/`, `tests/`, `scripts/`, `docs/`, `.github/`, `coverage/`

- [ ] **Step 5: Run full test suite to confirm no regression**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json
git commit -m "build(pack): whitelist publish contents; stop shipping source/declaration maps (M11)

- Add 'files' whitelist to package.json so npm publish ships exactly
  the intended artifacts (dist .js + .d.ts, README, LICENSE, CHANGELOG,
  MIGRATION-v2).
- Disable declarationMap in tsconfig — no consumer benefit and they
  leak source structure.
- sourceMap stays enabled for local debugging; the whitelist excludes
  .map files from the tarball regardless."
```

---

## Task 10: Add npm pack contents check + bin smoke test in CI

**Files:**
- Create: `scripts/check-tarball-contents.js`
- Create: `scripts/smoke-test-bin.js`
- Modify: `.github/workflows/ci.yml`

Two related CI guards: assert the publish tarball contents match the expected whitelist, and confirm the installed bin actually runs.

- [ ] **Step 1: Write the tarball-contents check script**

Create `scripts/check-tarball-contents.js`:

```javascript
#!/usr/bin/env node
/**
 * Verify `npm pack --dry-run` output matches the expected publish
 * whitelist. Fails CI if anything unexpected (src/, tests/, coverage/,
 * *.map, etc.) is about to be published.
 */

import { execSync } from "node:child_process";

const FORBIDDEN_PATTERNS = [
  /\.map$/,           // source maps and declaration maps
  /^src\//,           // source dirs should not ship
  /^tests\//,
  /^scripts\//,
  /^docs\//,
  /^coverage\//,
  /^\.github\//,
  /^\.astro\//,
  /^\.vscode\//,
  /^node_modules\//,
];

const REQUIRED_FILES = [
  /^dist\/.*\.js$/,
  /^dist\/.*\.d\.ts$/,
  /^README\.md$/,
  /^LICENSE$/,
];

function main() {
  const output = execSync("npm pack --dry-run --json", { encoding: "utf8" });
  const packed = JSON.parse(output);
  const entries = packed[0]?.files ?? [];
  const paths = entries.map((e) => e.path);

  let failed = false;

  for (const path of paths) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(path)) {
        console.error(`FORBIDDEN: ${path} matches ${pattern}`);
        failed = true;
      }
    }
  }

  for (const required of REQUIRED_FILES) {
    if (!paths.some((p) => required.test(p))) {
      console.error(`MISSING: no file matches ${required}`);
      failed = true;
    }
  }

  if (failed) {
    console.error("\nTarball contents check FAILED.");
    process.exit(1);
  }

  console.log(`Tarball contents OK (${paths.length} files).`);
}

main();
```

- [ ] **Step 2: Verify the script works locally**

Run: `npm run build && node scripts/check-tarball-contents.js`
Expected: `Tarball contents OK (N files).` and exit 0.

If it reports FORBIDDEN entries, that's a real Task 9 gap — investigate. Fix the whitelist or the script before continuing.

- [ ] **Step 3: Write the bin smoke test script**

Create `scripts/smoke-test-bin.js`:

```javascript
#!/usr/bin/env node
/**
 * Smoke-test the published bin entry by packing the package, installing
 * it into a temp dir, and invoking the bin once. Verifies that the bin
 * path in package.json is correct, the shebang is present, and the
 * module loads cleanly.
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TIMEOUT_MS = 10000;

function main() {
  console.log("Building package...");
  execSync("npm run build", { stdio: "inherit" });

  console.log("Packing tarball...");
  const packOutput = execSync("npm pack --silent", { encoding: "utf8" }).trim();
  const tarballName = packOutput.split("\n").pop();
  console.log(`Tarball: ${tarballName}`);

  const tempDir = mkdtempSync(join(tmpdir(), "activitypub-mcp-smoke-"));
  console.log(`Temp dir: ${tempDir}`);

  console.log("Installing tarball in clean dir...");
  execSync(`npm init -y && npm install --omit=dev ../${tarballName}`, {
    cwd: tempDir,
    stdio: "inherit",
  });

  console.log("Invoking the bin to verify it loads...");
  const binPath = join(tempDir, "node_modules", ".bin", "activitypub-mcp");
  // Send empty stdin and use a short timeout — the bin is a long-running
  // MCP server, so we just need to confirm it starts without throwing.
  const result = spawnSync(binPath, [], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
    input: "",
  });

  // The bin starts an MCP server on stdio, then blocks waiting for input.
  // Our timeout kills it; spawnSync reports timeout as signal SIGTERM and
  // status null. If the bin failed to load (missing shebang, broken
  // import, etc.), we'd see a non-null status with stderr complaints.
  if (result.error && result.error.code !== "ETIMEDOUT") {
    console.error("Bin failed to start:", result.error);
    process.exit(1);
  }

  if (result.status !== null && result.status !== 0) {
    console.error("Bin exited with status:", result.status);
    console.error("stderr:", result.stderr);
    process.exit(1);
  }

  console.log("Bin smoke test passed.");
  // Cleanup tarball file in the project dir
  execSync(`rm -f ${tarballName}`);
}

main();
```

- [ ] **Step 4: Verify the bin smoke test runs locally**

Run: `node scripts/smoke-test-bin.js`
Expected: "Bin smoke test passed." after a few seconds.

If it fails, investigate. Common causes:
- Missing shebang `#!/usr/bin/env node` in the compiled `dist/mcp-main.js`.
- The bin import paths are broken in the published context (e.g., relative imports outside `./dist`).
- `package.json` `bin` field points at a file that doesn't exist post-build.

- [ ] **Step 5: Add both checks to CI**

In `.github/workflows/ci.yml`, in the `test` job, AFTER the existing `Build project` step (which runs `npm run build`) and BEFORE the `Upload build artifacts` step, add two new steps. Only run on ubuntu-latest + node 20 (no need to repeat across the matrix; the artifacts are platform-independent):

```yaml
    - name: Check tarball contents
      if: matrix.node-version == '20.x' && matrix.os == 'ubuntu-latest'
      run: node scripts/check-tarball-contents.js

    - name: Smoke test published bin
      if: matrix.node-version == '20.x' && matrix.os == 'ubuntu-latest'
      run: node scripts/smoke-test-bin.js
```

- [ ] **Step 6: Verify the workflow YAML is well-formed**

Eyeball indentation.

- [ ] **Step 7: Run the full test suite + the new scripts locally**

Run: `npm test && node scripts/check-tarball-contents.js && node scripts/smoke-test-bin.js`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/check-tarball-contents.js scripts/smoke-test-bin.js .github/workflows/ci.yml
git commit -m "ci: add tarball contents check + bin smoke test

- check-tarball-contents: asserts npm pack --dry-run output matches the
  whitelist (no .map, no src/, etc.)
- smoke-test-bin: pack + install in a clean dir + invoke the bin to
  catch missing shebangs, broken imports, wrong bin paths"
```

---

## Task 11: Enable `noUnusedLocals` / `noUnusedParameters` (L9, part 1)

**Files:**
- Modify: `tsconfig.json`
- Modify: any source files surfacing new errors

Enable stricter tsc flags to catch dead code as it's introduced. Fix any resulting errors in-place.

- [ ] **Step 1: Add the flags to tsconfig**

In `tsconfig.json`, in the `compilerOptions` block, add:

```json
"noUnusedLocals": true,
"noUnusedParameters": true,
```

Place them adjacent to the other `strict` flags (`noImplicitOverride`, `noFallthroughCasesInSwitch`).

- [ ] **Step 2: Run typecheck to see what surfaces**

Run: `npx tsc --noEmit 2>&1 | head -80`
Expected: zero or a small list of errors. If errors appear, they look like:
- `error TS6133: 'foo' is declared but its value is never read.` (unused local)
- `error TS6196: 'Foo' is declared but never used.` (unused parameter)

- [ ] **Step 3: Fix each error**

For each error reported:
- **Unused parameter:** prefix the parameter name with `_` (e.g. `_unused`) — TypeScript honors this convention and stops complaining. Don't delete the parameter if it's part of a public/imposed interface (e.g., a callback signature).
- **Unused local:** delete the variable. If the local was a result of a real call with side effects, change to `void someCall()`. If unsure, ask.
- **Unused import:** delete the import.

Do NOT use `// @ts-expect-error` or `// eslint-disable` shortcuts. Each error indicates real dead code or a real intent that needs the underscore prefix.

- [ ] **Step 4: Re-run typecheck — should be clean**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 5: Run full test suite + lint**

Run: `npm test && npm run lint`
Expected: PASS (628 tests still passing; any code removed shouldn't have affected tests).

- [ ] **Step 6: Commit (single commit covering all the L9 fixes)**

```bash
git add tsconfig.json src/
git commit -m "build(types): enable noUnusedLocals + noUnusedParameters (L9 part 1)

Surfaces dead-code accumulation. Any unused parameters are prefixed
with _ where required by an external interface; truly dead locals
and imports are deleted."
```

---

## Task 12: Re-enable Biome `noUnusedVariables` (L9, part 2)

**Files:**
- Modify: `biome.json`
- Modify: any source files surfacing new errors

Biome currently has `"noUnusedVariables": "off"`. Re-enable it for redundant coverage with tsc and to catch patterns tsc doesn't (e.g., unused function args without underscore prefix in non-typed positions).

- [ ] **Step 1: Re-enable the rule**

In `biome.json`, remove the override that disables `noUnusedVariables`. The current rules block:

```json
"linter": {
  "enabled": true,
  "rules": {
    "recommended": true,
    "correctness": {
      "noUnusedVariables": "off"
    }
  }
}
```

Becomes:

```json
"linter": {
  "enabled": true,
  "rules": {
    "recommended": true
  }
}
```

(The `correctness` override is now empty, so the whole `correctness` block can go.)

- [ ] **Step 2: Run lint to see what surfaces**

Run: `npm run lint 2>&1 | head -80`
Expected: a small list of warnings/errors for unused variables Biome catches but tsc didn't. Most should have been caught by Task 11; remaining hits are usually:
- Function args in `.astro` files or other contexts Biome inspects but tsc doesn't.
- Imports brought in only for side effects.

- [ ] **Step 3: Fix each error**

Same approach as Task 11. Prefix args with `_` if they're required by an interface; delete genuinely unused vars/imports.

- [ ] **Step 4: Re-run lint — should be clean**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add biome.json src/
git commit -m "build(lint): re-enable Biome noUnusedVariables (L9 part 2)

Removes the override that hid unused-var warnings. tsc covers most of
this via Task 11; Biome adds redundant coverage and catches patterns
in non-typed contexts."
```

---

## Task 13: Final verification

**Files:** none modified — verification step.

- [ ] **Step 1: Run every check the new CI now performs, locally**

```bash
npm run typecheck && \
npm run lint && \
npm test && \
npm run build && \
node scripts/check-tarball-contents.js && \
node scripts/smoke-test-bin.js
```

Expected: all six pass cleanly.

- [ ] **Step 2: Verify Node 20+ engine constraint is in effect**

```bash
node -e "console.log(process.version, process.versions)" && cat package.json | grep -A 2 '"engines"'
```

Expected: `engines.node` is `">=20.0.0"`. Your local node should also be 20+.

- [ ] **Step 3: Verify `test:all` actually runs integration tests when the env var is set**

```bash
RUN_INTEGRATION_TESTS=1 npm run test:all 2>&1 | tail -20
```

Expected: both unit and integration test summaries reported. Integration tests may fail due to network — that's tolerable as long as they're invoked.

- [ ] **Step 4: Verify the publish tarball matches the whitelist**

```bash
npm pack --dry-run | tail -20
```

Expected: ~60-80 files, all under `dist/`, plus README/LICENSE/CHANGELOG/MIGRATION-v2.md. No `.map`, no `src/`, no `tests/`.

- [ ] **Step 5: Verify CI workflow YAML is valid**

If you have a YAML validator, run it against `.github/workflows/*.yml`. Otherwise, eyeball:

```bash
ls .github/workflows/
cat .github/workflows/ci.yml | head -80
cat .github/workflows/integration.yml | head -40
```

Confirm no obvious indentation issues. GitHub will validate on push.

- [ ] **Step 6: Confirm `MIGRATION-v2.md` is consistent**

Read the doc end-to-end. Plan A through D have appended sections. Confirm section ordering, no duplicate or contradictory entries, and that the Node 20+ requirement is documented.

- [ ] **Step 7: Do NOT push the branch.** Report ready for Plan E and stop.

## Report Format

- Status (DONE / DONE_WITH_CONCERNS / BLOCKED)
- Each step's result
- Total test count (should be unchanged from 628; this plan adds no tests, just infrastructure)
- Tarball file count
- Any concerns

---

## Done

When all 13 tasks check off, Plan D is complete. The next plan in the v2 series is **Plan E — Topic-dir refactor + repo hygiene** (spec section 6). Plan E should run last — it moves files, which would generate massive merge conflicts with any of the earlier plans.
