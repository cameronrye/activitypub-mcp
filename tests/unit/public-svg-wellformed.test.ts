import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Public SVGs are served as standalone files (via <img>/<link rel=icon>) and are
// parsed as STRICT XML by browsers — unlike inline SVG in .astro (lenient HTML).
// A malformed standalone SVG renders as a broken image. The most common defect is
// a literal "--" (double hyphen) inside an XML comment, which is illegal in XML
// (e.g. a comment mentioning the CSS var "--logo-dot-flip"). Guard against it.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = join(repoRoot, "public");
const svgFiles = readdirSync(publicDir).filter((f) => f.endsWith(".svg"));

describe("public SVG assets are well-formed XML", () => {
  it("finds SVG files to check", () => {
    expect(svgFiles.length).toBeGreaterThan(0);
  });

  for (const name of svgFiles) {
    it(`${name}: no '--' inside any XML comment`, () => {
      const src = readFileSync(join(publicDir, name), "utf-8");
      const comments = src.match(/<!--[\s\S]*?-->/g) ?? [];
      for (const comment of comments) {
        const inner = comment.slice(4, -3); // strip "<!--" and "-->"
        expect(inner.includes("--"), `${name}: illegal '--' inside XML comment -> ${comment}`).toBe(
          false,
        );
      }
    });

    it(`${name}: starts with an <svg> root`, () => {
      const src = readFileSync(join(publicDir, name), "utf-8").trimStart();
      expect(src.startsWith("<svg") || src.startsWith("<?xml")).toBe(true);
    });
  }
});
