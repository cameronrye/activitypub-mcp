import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The getting-started config pages rotted (phantom cache vars, a removed
 * HEALTH_CHECK_* probe, etc.) precisely because nothing checked them against the
 * code — the API reference stayed pristine only because llms-registry-sync guards
 * it. This guard derives the real env-var surface by scanning src for every
 * `process.env.X` read (that IS the source of truth, so it can't drift) and fails
 * if a config page documents a variable the code never reads.
 *
 * Scope note: this catches phantom/removed *variables*. It does not validate
 * documented default *values* (that would require parsing each table + unit
 * conversions); those are reconciled by hand.
 */
const SRC = fileURLToPath(new URL("../../src", import.meta.url));
const DOCS = fileURLToPath(new URL("../../site/src/content/docs/getting-started", import.meta.url));
const DOC_FILES = ["configuration.mdx", "installation.mdx"];

// Read by the code but not activitypub-mcp configuration knobs we document.
const NON_CONFIG_VARS = new Set(["NODE_ENV", "XDG_CONFIG_HOME"]);

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function realEnvVars(): Set<string> {
  const vars = new Set<string>();
  for (const file of walkTs(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) vars.add(m[1]);
    for (const m of src.matchAll(/process\.env\[["']([A-Z0-9_]+)["']\]/g)) vars.add(m[1]);
  }
  return vars;
}

// A documented env var: a backtick-wrapped ALL-CAPS token with ≥1 underscore.
// Every real config var matches this; values like `info`, `stdio`, `OK`, `Bearer`
// and inline assignments like `MCP_HTTP_SECRET=...` do not.
function documentedEnvVars(file: string): string[] {
  const md = readFileSync(join(DOCS, file), "utf8");
  const found = new Set<string>();
  for (const m of md.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)) found.add(m[1]);
  return [...found];
}

describe("getting-started docs env-var drift guard", () => {
  const real = realEnvVars();

  for (const file of DOC_FILES) {
    it(`${file} documents only env vars the code actually reads`, () => {
      const documented = documentedEnvVars(file);
      const phantom = documented.filter((v) => !real.has(v) && !NON_CONFIG_VARS.has(v));
      expect(phantom, `phantom/removed env vars documented in ${file}`).toEqual([]);
    });
  }

  // Reverse direction (security subset): an operator can't harden what they don't
  // know is configurable, so the security/forensics knobs must stay documented.
  it("documents the security-relevant env vars in configuration.mdx", () => {
    const SECURITY_VARS = [
      "INSTANCE_BLOCKING_ENABLED",
      "BLOCKED_INSTANCES",
      "MAX_RESPONSE_SIZE",
      "MAX_UPLOAD_SIZE",
      "AUDIT_LOG_ENABLED",
      "AUDIT_LOG_MAX_ENTRIES",
      "ACTIVITYPUB_ENABLE_WRITES",
      "MCP_THREAD_CROSS_ORIGIN_FETCH",
    ];
    // Sanity: each is actually read by the code (catches a rename in src).
    const notRead = SECURITY_VARS.filter((v) => !real.has(v));
    expect(notRead, "security vars listed here but not read by src").toEqual([]);

    const documented = new Set(documentedEnvVars("configuration.mdx"));
    const undocumented = SECURITY_VARS.filter((v) => !documented.has(v));
    expect(undocumented, "security-relevant env vars missing from configuration.mdx").toEqual([]);
  });
});
