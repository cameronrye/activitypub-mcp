import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { countRegistry } from "../../scripts/generate-registry-manifest.js";

// Drift guard: the LLM-facing reference files (public/llms.txt,
// public/llms-full.txt) and the committed registry manifest must stay in sync
// with the actual MCP registry. These files are hand-maintained prose, so they
// silently rot when tools/prompts/resources or the version change. This test
// re-derives the truth from source via countRegistry() and asserts the curated
// files still match — counts, names, and version.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const registry = countRegistry(join(repoRoot, "src"));
const manifest = JSON.parse(read("site/src/data/registry-manifest.json"));
const pkg = JSON.parse(read("package.json"));
const llms = read("public/llms.txt");
const llmsFull = read("public/llms-full.txt");

/** Slice a markdown section from its heading to the next heading / horizontal rule. */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const after = text.slice(start + heading.length);
  const end = after.search(/\n(?:#{2,3}\s|---\s*\n)/);
  return end >= 0 ? after.slice(0, end) : after;
}

/** All `backtick-quoted` lowercase-kebab tokens in a chunk of text. */
function tickNames(chunk: string): string[] {
  return [...chunk.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
}

describe("registry-manifest.json stays in sync with the live registry", () => {
  it("matches counts and names from countRegistry(src)", () => {
    expect(manifest.tools).toBe(registry.tools);
    expect(manifest.resources).toBe(registry.resources);
    expect(manifest.prompts).toBe(registry.prompts);
    expect(manifest.toolNames).toEqual(registry.toolNames);
    expect(manifest.resourceNames).toEqual(registry.resourceNames);
    expect(manifest.promptNames).toEqual(registry.promptNames);
  });
});

describe("llms.txt stays in sync with the registry", () => {
  it("states the real tool/resource/prompt counts", () => {
    expect(llms).toContain(`${registry.tools} MCP Tools`);
    expect(llms).toContain(`${registry.resources} MCP Resources, ${registry.prompts} MCP Prompts`);
  });

  it("version footer matches package.json", () => {
    expect(llms).toContain(`**Version:** ${pkg.version}`);
  });
});

describe("llms-full.txt capability sections stay in sync with the registry", () => {
  it("section headers report the real counts", () => {
    expect(llmsFull).toContain(`### MCP Tools (${registry.tools} total)`);
    expect(llmsFull).toContain(`### MCP Resources (${registry.resources} total)`);
    expect(llmsFull).toContain(`### MCP Prompts (${registry.prompts} total)`);
  });

  it("the Read-only + Authenticated write lists are exactly the registered tools (no phantoms, none missing)", () => {
    const tools = section(llmsFull, "### MCP Tools");
    const listed = tools
      .split("\n")
      .filter((line) => /^\*\*(Read-only|Authenticated write)/.test(line))
      .flatMap(tickNames);
    expect([...new Set(listed)].sort()).toEqual([...registry.toolNames].sort());
  });

  it("the prompts table lists exactly the registered prompts", () => {
    const prompts = section(llmsFull, "### MCP Prompts");
    const listed = prompts
      .split("\n")
      .filter((line) => line.trimStart().startsWith("| `"))
      .flatMap(tickNames);
    expect([...new Set(listed)].sort()).toEqual([...registry.promptNames].sort());
  });

  it("every registered resource appears in the resources table", () => {
    const resources = section(llmsFull, "### MCP Resources");
    for (const name of registry.resourceNames) {
      expect(resources).toContain(`activitypub://${name}`);
    }
  });
});
