import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * GitHub's README HTML sanitizer strips anchors whose href uses a non-standard
 * scheme like `cursor://`, leaving the "Add to Cursor" badge linking to nothing
 * (it renders pointing at the badge image itself). The one-click button must use
 * Cursor's https wrapper instead so it actually works on the rendered README.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readme = readFileSync(path.join(ROOT, "README.md"), "utf-8");

describe("README one-click install buttons", () => {
  const cursorLine = readme.split("\n").find((l) => l.includes("Add to Cursor"));

  it("has an Add to Cursor button", () => {
    expect(cursorLine).toBeDefined();
  });

  it("does not use a cursor:// href (GitHub strips it)", () => {
    expect(cursorLine).not.toContain("](cursor://");
  });

  it("uses the https cursor.com/install-mcp wrapper with the npx config", () => {
    expect(cursorLine).toContain("](https://cursor.com/install-mcp?name=activitypub-mcp&config=");
  });
});
