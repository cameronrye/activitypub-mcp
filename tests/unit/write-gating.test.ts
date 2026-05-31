import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/resilience/rate-limiter.js";

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

  it("includes mutation tools when writes are enabled", async () => {
    const names = await registeredToolNames(true);
    expect(names.has("post-status")).toBe(true);
    expect(names.has("delete-post")).toBe(true);
  });
});
