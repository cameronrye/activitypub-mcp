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
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const releaseYml = readFileSync(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");

describe("release workflow ships the .mcpb bundle", () => {
  it("builds the .mcpb bundle", () => {
    expect(releaseYml).toMatch(/mcpb pack/);
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
});
