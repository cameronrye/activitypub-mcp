import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
        `server.registerTool("ping", {}, async () => {});\n`,
      );
      writeFileSync(
        join(dir, "mcp", "capabilities.ts"),
        `wrapped.registerTool("instrumented", {}, async () => {});\n`,
      );
      const result = countRegistry(dir);
      expect(result.tools).toBe(1);
      expect(result.toolNames).toEqual(["ping"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
