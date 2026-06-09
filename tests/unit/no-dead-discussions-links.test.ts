import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * GitHub Discussions is disabled on the repository, so any link to `/discussions`
 * in a shipped artifact 404s — including the site footer and the troubleshooting
 * page's "Community Support" link, exactly where a struggling user lands. Guard
 * the public-facing artifacts against re-introducing such a link. If Discussions
 * is ever enabled, update these links and remove this test together.
 */
const ARTIFACTS = [
  "../../public/llms.txt",
  "../../public/llms-full.txt",
  "../../site/src/content/docs/reference/troubleshooting.mdx",
  "../../site/layouts/BaseLayout.astro",
];

describe("public artifacts do not link to disabled GitHub Discussions", () => {
  for (const rel of ARTIFACTS) {
    it(`${rel} has no /discussions link`, () => {
      const content = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
      expect(content).not.toContain("/discussions");
    });
  }
});
