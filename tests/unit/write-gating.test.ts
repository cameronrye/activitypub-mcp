import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeBlockReason } from "../../src/mcp/tools-write.js";
import { RateLimiter } from "../../src/resilience/rate-limiter.js";

describe("writeBlockReason (runtime write guard, belt-and-suspenders)", () => {
  it("blocks with 'writes-disabled' when ENABLE_WRITES is off — even with accounts", () => {
    // Defense-in-depth: registration already hides mutation tools when writes
    // are off, but the runtime guard must independently refuse rather than rely
    // solely on a tool not being registered.
    expect(writeBlockReason(false, true)).toBe("writes-disabled");
  });

  it("prefers 'writes-disabled' over 'no-auth' when both apply", () => {
    expect(writeBlockReason(false, false)).toBe("writes-disabled");
  });

  it("blocks with 'no-auth' when writes are enabled but no account exists", () => {
    expect(writeBlockReason(true, false)).toBe("no-auth");
  });

  it("allows (null) when writes are enabled and an account exists", () => {
    expect(writeBlockReason(true, true)).toBeNull();
  });
});

async function registeredToolNames(enableWrites: boolean): Promise<Set<string>> {
  vi.resetModules();
  vi.stubEnv("ACTIVITYPUB_ENABLE_WRITES", enableWrites ? "true" : "false");
  const { registerTools } = await import("../../src/mcp/tools.js");
  const server = new McpServer({ name: "t", version: "0" });
  const names = new Set<string>();
  const orig = server.registerTool.bind(server);
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  (server as any).registerTool = (name: string, def: any, handler: any) => {
    names.add(name);
    return orig(name, def, handler);
  };
  registerTools(server, new RateLimiter({ enabled: false, maxRequests: 1, windowMs: 1 }));
  return names;
}

describe("write gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("omits mutation tools when writes are disabled", async () => {
    const names = await registeredToolNames(false);
    expect(names.has("post-status")).toBe(false);
    expect(names.has("delete-post")).toBe(false);
    expect(names.has("follow-account")).toBe(false);
    expect(names.has("get-home-timeline")).toBe(true);
    expect(names.has("list-accounts")).toBe(true);
    expect(names.has("discover-actor")).toBe(true);
  });

  it("registers get-scheduled-posts as an authenticated read, even with writes disabled", async () => {
    // It only GETs scheduled posts (readOnlyHint: true, gated by requireAuthEnabled,
    // not requireWriteEnabled), so it must be available without ENABLE_WRITES —
    // matching the docs and its own read-only posture.
    const names = await registeredToolNames(false);
    expect(names.has("get-scheduled-posts")).toBe(true);
    // The actual scheduled-post MUTATORS stay write-gated.
    expect(names.has("cancel-scheduled-post")).toBe(false);
    expect(names.has("update-scheduled-post")).toBe(false);
  });

  it("includes mutation tools when writes are enabled", async () => {
    const names = await registeredToolNames(true);
    expect(names.has("post-status")).toBe(true);
    expect(names.has("delete-post")).toBe(true);
  });
});
