import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/resilience/rate-limiter.js";

async function collectAnnotations(): Promise<Map<string, Record<string, boolean> | undefined>> {
  vi.resetModules();
  vi.stubEnv("ACTIVITYPUB_ENABLE_WRITES", "true");
  const { registerTools } = await import("../../src/mcp/tools.js");
  const server = new McpServer({ name: "t", version: "0" });
  const annotations = new Map<string, Record<string, boolean> | undefined>();
  const orig = server.registerTool.bind(server);
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  (server as any).registerTool = (name: string, def: any, handler: any) => {
    annotations.set(name, def?.annotations);
    return orig(name, def, handler);
  };
  registerTools(server, new RateLimiter({ enabled: false, maxRequests: 1, windowMs: 1 }));
  return annotations;
}

describe("tool annotations", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("marks reads readOnly", async () => {
    const ann = await collectAnnotations();
    expect(ann.get("discover-actor")?.readOnlyHint).toBe(true);
    expect(ann.get("fetch-timeline")?.readOnlyHint).toBe(true);
  });

  it("marks mutations destructive", async () => {
    const ann = await collectAnnotations();
    expect(ann.get("post-status")?.destructiveHint).toBe(true);
    expect(ann.get("delete-post")?.destructiveHint).toBe(true);
    expect(ann.get("post-status")?.readOnlyHint).toBe(false);
  });

  it("marks authenticated read tools readOnly, not destructive", async () => {
    const ann = await collectAnnotations();
    // get-scheduled-posts only fetches scheduled posts (a GET) — it must not be
    // annotated as a destructive mutation like delete-post.
    expect(ann.get("get-scheduled-posts")?.readOnlyHint).toBe(true);
    expect(ann.get("get-scheduled-posts")?.destructiveHint).not.toBe(true);
    // Siblings that are already correct, asserted to lock the convention.
    expect(ann.get("get-home-timeline")?.readOnlyHint).toBe(true);
    expect(ann.get("get-relationship")?.readOnlyHint).toBe(true);
  });
});
