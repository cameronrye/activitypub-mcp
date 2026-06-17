import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard against silently shipping a release without the Claude Desktop
 * Extension (`.mcpb`) bundle. The README's one-click install points users at
 * this asset on the *latest* release; v3.1.0 shipped without it because the
 * bundle was a one-off manual build that the release workflow never produced.
 * This test fails CI if the workflow stops building or attaching it.
 *
 * The bundle is now built with a plain `zip` (a .mcpb IS a zip with manifest.json
 * at root) after injecting the live tool schemas, deliberately NOT `mcpb pack` —
 * `mcpb validate`/`pack` strip the `inputSchema`/`outputSchema` keys Smithery
 * scores. These tests enforce that durable pipeline.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const releaseYml = readFileSync(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");

describe("release workflow ships the .mcpb bundle", () => {
  it("builds the .mcpb bundle as a plain zip with manifest.json at root", () => {
    // A .mcpb is a zip; plain zipping preserves the tool inputSchema/outputSchema
    // that `mcpb pack` would strip.
    expect(releaseYml).toMatch(/zip -r .*-X .*\.mcpb/);
    expect(releaseYml).toMatch(/manifest\.json/);
  });

  it("bundles node_modules so the ESM entrypoint runs standalone", () => {
    // The server's runtime deps must ship inside the .mcpb (Claude Desktop
    // one-click install + Smithery's local run) — zipping only dist would
    // produce a bundle that fails on missing dependencies.
    const zipLine = releaseYml.split("\n").find((l) => /zip -r .*\.mcpb/.test(l));
    expect(zipLine).toBeDefined();
    expect(zipLine).toMatch(/node_modules/);
  });

  it("injects the live tool manifest before packaging", () => {
    // The schemas Smithery scores are captured from the running server, not parsed
    // from source — see scripts/inject-tools-manifest.js.
    expect(releaseYml).toMatch(/inject-tools-manifest\.js/);
  });

  it("does NOT use mcpb pack/validate (which strips inputSchema/outputSchema)", () => {
    // Inspect only command lines (ignore explanatory `#` comments that may name
    // the removed tooling to explain why it's gone).
    const commandLines = releaseYml
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    for (const line of commandLines) {
      expect(line, "no mcpb pack command").not.toMatch(/mcpb pack/);
      expect(line, "no mcpb validate command").not.toMatch(/mcpb validate/);
      expect(line, "no mcpb global install").not.toMatch(/npm install -g @anthropic-ai\/mcpb/);
    }
  });

  it("gates the bundle on at least 18 tools being present in the manifest", () => {
    // A registration regression that drops a tool must break the release loudly.
    expect(releaseYml).toMatch(/m\.tools\.length\s*<\s*18/);
  });

  it("attaches a versioned .mcpb asset to the GitHub release", () => {
    expect(releaseYml).toMatch(
      /activitypub-mcp-\$\{\{\s*steps\.get_version\.outputs\.VERSION\s*\}\}\.mcpb/,
    );
  });

  it("still attaches the npm tarball too", () => {
    expect(releaseYml).toMatch(
      /activitypub-mcp-\$\{\{\s*steps\.get_version\.outputs\.VERSION\s*\}\}\.tgz/,
    );
  });

  it("does not grant the unused packages:write permission", () => {
    expect(releaseYml).not.toMatch(/packages:\s*write/);
  });
});
