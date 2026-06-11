import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getLogger } from "@logtape/logtape";
import { afterEach, describe, expect, it, vi } from "vitest";
// Side-effect import: runs configure() so the "activitypub-mcp" root sink exists.
import "../../src/telemetry/logging.js";

/**
 * logtape's category hierarchy is ARRAY-based. getLogger("activitypub-mcp:http")
 * creates the single-segment ROOT category ["activitypub-mcp:http"], a SIBLING
 * of the configured ["activitypub-mcp"] logger — so it inherits no sink and every
 * record is silently dropped (this blinded ~13 subsystems, incl. security/audit
 * warnings). getLogger(["activitypub-mcp", "http"]) is the child that inherits.
 *
 * The configured sink routes everything to console.error (stderr), so a working
 * logger surfaces as a console.error call and a broken one does not.
 */
describe("logtape subsystem categories", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits records from array-child categories but drops colon-string siblings", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    getLogger(["activitypub-mcp", "http"]).error("child {m}", { m: "child-emitted" });
    getLogger("activitypub-mcp:http").error("sibling {m}", { m: "sibling-dropped" });

    const emitted = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(emitted).toContain("child-emitted");
    expect(emitted).not.toContain("sibling-dropped");
  });
});

/**
 * Static guard: no source file may reintroduce the colon-category form, which
 * compiles and runs but silently drops every record.
 */
describe("no source file uses the silently-dropped colon category", () => {
  const SRC = fileURLToPath(new URL("../../src", import.meta.url));

  function tsFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return tsFiles(full);
      return full.endsWith(".ts") ? [full] : [];
    });
  }

  it('never calls getLogger with an "activitypub-mcp:" colon string', () => {
    // Require a real scope letter after the colon so logging.ts's own
    // "activitypub-mcp:<scope>" anti-pattern doc example isn't a false positive.
    const offenders = tsFiles(SRC).filter((file) =>
      /getLogger\(\s*["'`]activitypub-mcp:[a-z]/.test(readFileSync(file, "utf8")),
    );
    expect(offenders, `colon-category getLogger calls in: ${offenders.join(", ")}`).toEqual([]);
  });
});
