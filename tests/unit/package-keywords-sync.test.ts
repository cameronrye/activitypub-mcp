import { describe, expect, it } from "vitest";
import manifest from "../../manifest.json" with { type: "json" };
import pkg from "../../package.json" with { type: "json" };

/**
 * npm keyword search is a free top-of-funnel discovery channel, and "mastodon"
 * / "misskey" are the concrete product names people actually search for. The
 * .mcpb manifest already lists them; package.json had drifted and omitted them,
 * leaving that search traffic on the table. Keep package.json a superset of the
 * manifest keywords so the two can't silently diverge again.
 */
describe("package.json keywords", () => {
  it("includes every keyword declared in the .mcpb manifest", () => {
    const pkgKeywords = new Set(pkg.keywords);
    for (const keyword of manifest.keywords) {
      expect(pkgKeywords.has(keyword), `package.json keywords missing "${keyword}"`).toBe(true);
    }
  });
});
