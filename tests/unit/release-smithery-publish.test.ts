import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the automated Smithery publish wiring. Smithery is the one
 * distribution channel whose CLI has NO OIDC / trusted-publishing path (npm and
 * the MCP registry both publish via OIDC) — auth is a bearer token read from
 * $SMITHERY_API_KEY. These tests lock in that the release pipeline publishes the
 * .mcpb to Smithery automatically, holds ONLY the Smithery token (least
 * privilege), pins the third-party CLI it executes, and degrades to a no-op when
 * the secret is absent so forks/secret-less runs stay green.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const smitheryYmlPath = path.join(ROOT, ".github/workflows/publish-smithery.yml");
const autoReleaseYml = readFileSync(path.join(ROOT, ".github/workflows/auto-release.yml"), "utf-8");

describe("publish-smithery.yml reusable workflow", () => {
  it("exists", () => {
    expect(existsSync(smitheryYmlPath)).toBe(true);
  });

  const smitheryYml = existsSync(smitheryYmlPath) ? readFileSync(smitheryYmlPath, "utf-8") : "";

  it("is a reusable workflow (workflow_call) and manually runnable (workflow_dispatch)", () => {
    expect(smitheryYml).toMatch(/workflow_call:/);
    expect(smitheryYml).toMatch(/workflow_dispatch:/);
  });

  it("publishes via the Smithery CLI to the rye/activitypub-mcp namespace", () => {
    expect(smitheryYml).toMatch(/@smithery\/cli@/);
    expect(smitheryYml).toMatch(/mcp publish/);
    expect(smitheryYml).toMatch(/-n rye\/activitypub-mcp/);
  });

  it("publishes the versioned .mcpb bundle (the same asset the release attaches)", () => {
    expect(smitheryYml).toMatch(
      /activitypub-mcp-\$\{\{\s*steps\.ver\.outputs\.VERSION\s*\}\}\.mcpb/,
    );
    expect(smitheryYml).toMatch(/\.mcpb/);
  });

  it("pins the Smithery CLI to an exact version (no moving @latest while holding the token)", () => {
    // A floating @latest would run unreviewed third-party code in a job that
    // holds the publish token. Require a pinned semver.
    expect(smitheryYml).toMatch(/@smithery\/cli@\d+\.\d+\.\d+/);
    expect(smitheryYml).not.toMatch(/@smithery\/cli@latest/);
  });

  it("authenticates only via the SMITHERY_API_KEY secret (no --key flag, no OIDC)", () => {
    expect(smitheryYml).toMatch(/SMITHERY_API_KEY/);
    expect(smitheryYml).toMatch(/secrets:\s*[\s\S]*SMITHERY_API_KEY/);
    // Smithery has no OIDC publish path — id-token must NOT be granted here.
    expect(smitheryYml).not.toMatch(/id-token:\s*write/);
  });

  it("gracefully skips when the secret is absent instead of hanging/failing", () => {
    // Without the key the CLI would prompt on stdin and hang in CI. A guard must
    // short-circuit so secret-less runs (forks, contributors) stay green.
    expect(smitheryYml).toMatch(/configured/);
    expect(smitheryYml).toMatch(/if:\s*steps\.guard\.outputs\.configured == 'true'/);
  });

  it("holds least privilege: read-only contents, no npm token, no write", () => {
    expect(smitheryYml).toMatch(/permissions:\s*[\s\S]*contents:\s*read/);
    // Inspect only non-comment lines — the explanatory comments deliberately
    // NAME the credentials this job must NOT hold (NPM_TOKEN, write) to document
    // why they're absent, the same convention as release-mcpb-asset.test.ts.
    const commandLines = smitheryYml
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(commandLines).not.toMatch(/contents:\s*write/);
    expect(commandLines).not.toMatch(/packages:\s*write/);
    expect(commandLines).not.toMatch(/NPM_TOKEN/);
  });
});

describe("auto-release.yml wires the Smithery publish", () => {
  it("calls publish-smithery.yml as a reusable workflow", () => {
    expect(autoReleaseYml).toMatch(/uses:\s*\.\/\.github\/workflows\/publish-smithery\.yml/);
  });

  it("runs it only on an actual release and after the npm/release job", () => {
    const job = autoReleaseYml.slice(autoReleaseYml.indexOf("publish-smithery:"));
    expect(job).toMatch(/needs:\s*\[?\s*check-version\s*,\s*release/);
    expect(job).toMatch(/if:\s*needs\.check-version\.outputs\.should_release == 'true'/);
  });

  it("passes the SMITHERY_API_KEY secret explicitly (not blanket inherit)", () => {
    const job = autoReleaseYml.slice(autoReleaseYml.indexOf("publish-smithery:"));
    expect(job).toMatch(
      /secrets:\s*[\s\S]*SMITHERY_API_KEY:\s*\$\{\{\s*secrets\.SMITHERY_API_KEY\s*\}\}/,
    );
  });
});
