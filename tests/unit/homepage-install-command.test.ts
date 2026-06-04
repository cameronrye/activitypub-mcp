import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../src/cli/index.js";

/**
 * Guards against the homepage shipping an install command the CLI cannot run.
 * The marketing site's "Quick install" step is the first thing a new user
 * copies; if it names a subcommand the bin does not dispatch, the process
 * silently starts a stdio server that hangs on stdin (see src/cli/index.ts +
 * src/mcp-main.ts). This test re-derives validity from the real COMMANDS set.
 */
const indexAstro = fileURLToPath(new URL("../../site/pages/index.astro", import.meta.url));

function extractNpxCommand(src: string): string {
  const match = src.match(/const npxCommand\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("npxCommand declaration not found in site/pages/index.astro");
  return match[1];
}

describe("homepage install command", () => {
  it("is a command the activitypub-mcp CLI actually accepts", () => {
    const src = readFileSync(indexAstro, "utf8");
    const command = extractNpxCommand(src);
    const tokens = command.trim().split(/\s+/);

    expect(tokens[0]).toBe("npx");

    const pkgIndex = tokens.indexOf("activitypub-mcp");
    expect(pkgIndex).toBeGreaterThan(0);

    // Everything after the package name is forwarded to the bin.
    const binArgs = tokens.slice(pkgIndex + 1);
    const firstArg = binArgs[0];

    // No bin args → bare server start (the README's `npx -y activitypub-mcp`). Valid.
    if (firstArg === undefined) return;

    // A flag (-h/--help/-v/--version) is handled by parseArgs(). Valid.
    if (firstArg.startsWith("-")) return;

    // Otherwise it's a subcommand and must be one the CLI dispatches.
    expect(COMMANDS.has(firstArg)).toBe(true);
  });
});
