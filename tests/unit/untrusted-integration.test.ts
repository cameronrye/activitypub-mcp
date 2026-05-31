/**
 * Integration tests verifying that remote fediverse content reaches the LLM
 * inside the untrusted-content envelope.
 *
 * These tests use the real MSW mock server (started globally in tests/setup.ts)
 * and a real McpServer instance so that the full handler stack is exercised.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { registerTools } from "../../src/mcp/tools.js";
import { RateLimiter } from "../../src/resilience/rate-limiter.js";

// MSW server is started globally in tests/setup.ts — no import needed here.

type ToolHandler = (args: unknown) => Promise<{ content: { text: string }[] }>;

function captureTools(server: McpServer): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  const orig = server.registerTool.bind(server);
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  (server as any).registerTool = (name: string, def: any, handler: any) => {
    tools.set(name, handler);
    return orig(name, def, handler);
  };
  return tools;
}

describe("remote content is delivered inside the untrusted envelope", () => {
  it("discover-actor wraps the actor bio in an untrusted-content envelope", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    const tools = captureTools(server);
    const rateLimiter = new RateLimiter({ enabled: false, maxRequests: 1, windowMs: 1 });

    registerTools(server, rateLimiter);

    const handler = tools.get("discover-actor");
    expect(handler).toBeDefined();

    // testuser@example.social has summary "<p>This is a test user for unit testing.</p>"
    const res = await handler?.({ identifier: "testuser@example.social" });
    const text = res?.content[0].text ?? "";

    expect(text).toContain("<untrusted-content");
    expect(text).toContain("This is a test user for unit testing");
    expect(text).toContain("</untrusted-content>");
    // The source label must reference the actor's identifier
    expect(text).toContain("testuser@example.social");
  });
});
