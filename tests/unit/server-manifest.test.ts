import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Contract for the official MCP registry manifest (server.json) and its
// package.json ownership marker (mcpName). These two artifacts are how the
// registry verifies we own the npm package, so they must stay in lock-step
// with package.json. Full schema validation happens via `mcp-publisher
// validate` at publish time; this suite locks the project-specific invariants
// (cross-references, field casing, and the read-only-by-default story) that a
// version bump or a hand-edit could silently break.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const readJson = (rel: string) => JSON.parse(readFileSync(join(repoRoot, rel), "utf-8"));

// The reverse-DNS name pattern enforced by the registry schema (2025-12-11).
const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

const pkg = readJson("package.json");
const server = readJson("server.json");

describe("server.json registry manifest", () => {
  it("declares the pinned $schema and a reverse-DNS name", () => {
    expect(server.$schema).toBe(SCHEMA_URL);
    expect(server.name).toMatch(NAME_PATTERN);
  });

  it("matches the package.json mcpName ownership marker", () => {
    expect(pkg.mcpName).toBe("io.github.cameronrye/activitypub-mcp");
    expect(server.name).toBe(pkg.mcpName);
  });

  it("keeps version in sync with package.json (top-level and package entry)", () => {
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toHaveLength(1);
    expect(server.packages[0].version).toBe(pkg.version);
  });

  it("has a registry-valid description (1-100 chars)", () => {
    expect(server.description.length).toBeGreaterThanOrEqual(1);
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it("describes the published npm package over stdio", () => {
    const [p] = server.packages;
    expect(p.registryType).toBe("npm");
    expect(p.identifier).toBe(pkg.name);
    expect(p.transport).toEqual({ type: "stdio" });
  });

  it("uses camelCase fields (guards against the pre-2025-09-16 snake_case rename)", () => {
    const [p] = server.packages;
    for (const stale of [
      "registry_type",
      "environment_variables",
      "runtime_hint",
      "package_arguments",
    ]) {
      expect(p).not.toHaveProperty(stale);
    }
  });

  it("advertises read-only-by-default: writes are an opt-in, non-required env var", () => {
    const [p] = server.packages;
    const writes = p.environmentVariables.find(
      (e: { name: string }) => e.name === "ACTIVITYPUB_ENABLE_WRITES",
    );
    expect(writes).toBeDefined();
    expect(writes.isRequired).toBe(false);
    expect(writes.default).toBe("false");
  });
});
