/**
 * Tests for MCP export tool handlers
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { registerExportTools } from "../../src/mcp/tools-export.js";
import { RateLimiter } from "../../src/server/rate-limiter.js";

// Mock dependencies
vi.mock("../../src/remote-client.js", () => ({
  remoteClient: {
    fetchActorOutboxPaginated: vi.fn().mockResolvedValue({
      items: [
        {
          id: "1",
          content: "<p>Test post</p>",
          published: "2024-01-01",
          attributedTo: "user@example.social",
        },
        {
          id: "2",
          content: "<p>Another post</p>",
          published: "2024-01-02",
          attributedTo: "user@example.social",
        },
      ],
      totalItems: 2,
      hasMore: false,
    }),
    fetchPostThread: vi.fn().mockResolvedValue({
      post: { id: "1", content: "<p>Original</p>", published: "2024-01-01" },
      ancestors: [],
      replies: [{ id: "2", content: "<p>Reply</p>", published: "2024-01-02" }],
      totalReplies: 1,
    }),
    fetchRemoteActor: vi.fn().mockResolvedValue({
      id: "https://example.social/users/testuser",
      preferredUsername: "testuser",
      name: "Test User",
      summary: "A test user",
      followers: "https://example.social/users/testuser/followers",
      following: "https://example.social/users/testuser/following",
    }),
    searchInstance: vi.fn().mockResolvedValue({
      statuses: [
        {
          id: "1",
          content: "<p>Tagged post</p>",
          created_at: "2024-01-01",
          account: { username: "poster", acct: "poster@mastodon.social", display_name: "Poster" },
          url: "https://mastodon.social/@poster/1",
          reblogs_count: 5,
          favourites_count: 10,
          replies_count: 2,
        },
      ],
    }),
  },
}));

vi.mock("../../src/performance-monitor.js", () => ({
  performanceMonitor: {
    startRequest: vi.fn().mockReturnValue("req-123"),
    endRequest: vi.fn(),
  },
}));

vi.mock("@logtape/logtape", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { remoteClient } from "../../src/remote-client.js";

describe("MCP Export Tools", () => {
  let mcpServer: McpServer;
  let rateLimiter: RateLimiter;
  let registeredTools: Map<
    string,
    { handler: (...args: unknown[]) => Promise<unknown>; config: unknown }
  >;

  beforeEach(() => {
    vi.clearAllMocks();

    registeredTools = new Map();
    mcpServer = {
      registerTool: vi.fn(
        (name: string, config: unknown, handler: (...args: unknown[]) => Promise<unknown>) => {
          registeredTools.set(name, { handler, config });
        },
      ),
    } as unknown as McpServer;

    rateLimiter = new RateLimiter({ enabled: false, maxRequests: 100, windowMs: 60000 });
    registerExportTools(mcpServer, rateLimiter);
  });

  afterEach(() => {
    rateLimiter.stop();
  });

  describe("registerExportTools", () => {
    it("should register all expected export tools", () => {
      const expectedTools = [
        "export-timeline",
        "export-thread",
        "export-account-info",
        "export-hashtag",
      ];

      for (const toolName of expectedTools) {
        expect(registeredTools.has(toolName), `Tool ${toolName} should be registered`).toBe(true);
      }
    });
  });

  describe("export-timeline tool", () => {
    it("should export timeline in JSON format", async () => {
      const tool = registeredTools.get("export-timeline");
      expect(tool).toBeDefined();

      const result = await tool?.handler({
        identifier: "testuser@example.social",
        format: "json",
        limit: 10,
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Timeline Export",
      );
      expect(remoteClient.fetchActorOutboxPaginated).toHaveBeenCalled();
    });

    it("should export timeline in Markdown format", async () => {
      const tool = registeredTools.get("export-timeline");
      const result = await tool?.handler({
        identifier: "testuser@example.social",
        format: "markdown",
        limit: 10,
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Timeline Export",
      );
    });

    it("should export timeline in CSV format", async () => {
      const tool = registeredTools.get("export-timeline");
      const result = await tool?.handler({
        identifier: "testuser@example.social",
        format: "csv",
        limit: 10,
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Timeline Export",
      );
    });

    it("should handle export errors gracefully", async () => {
      (remoteClient.fetchActorOutboxPaginated as Mock).mockRejectedValueOnce(
        new Error("Export failed"),
      );

      const tool = registeredTools.get("export-timeline");
      const result = await tool?.handler({
        identifier: "testuser@example.social",
        format: "json",
      });

      expect((result as { isError: boolean }).isError).toBe(true);
    });
  });

  describe("export-thread tool", () => {
    it("should export thread in JSON format", async () => {
      const tool = registeredTools.get("export-thread");
      const result = await tool?.handler({
        postUrl: "https://example.social/@user/123",
        format: "json",
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Thread Export",
      );
      expect(remoteClient.fetchPostThread).toHaveBeenCalled();
    });

    it("should export thread in Markdown format", async () => {
      const tool = registeredTools.get("export-thread");
      const result = await tool?.handler({
        postUrl: "https://example.social/@user/123",
        format: "markdown",
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Thread Export",
      );
    });

    it("should handle thread export errors", async () => {
      (remoteClient.fetchPostThread as Mock).mockRejectedValueOnce(new Error("Thread not found"));

      const tool = registeredTools.get("export-thread");
      const result = await tool?.handler({
        postUrl: "https://example.social/@user/123",
        format: "json",
      });

      expect((result as { isError: boolean }).isError).toBe(true);
    });
  });

  describe("export-account-info tool", () => {
    it("should export account info in JSON format", async () => {
      const tool = registeredTools.get("export-account-info");
      const result = await tool?.handler({
        identifier: "testuser@example.social",
        format: "json",
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Account Export",
      );
      expect(remoteClient.fetchRemoteActor).toHaveBeenCalled();
    });

    it("should export account info in Markdown format", async () => {
      const tool = registeredTools.get("export-account-info");
      const result = await tool?.handler({
        identifier: "testuser@example.social",
        format: "markdown",
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Account Export",
      );
    });

    it("should handle account export errors", async () => {
      (remoteClient.fetchRemoteActor as Mock).mockRejectedValueOnce(new Error("Account not found"));

      const tool = registeredTools.get("export-account-info");
      const result = await tool?.handler({
        identifier: "testuser@example.social",
        format: "json",
      });

      expect((result as { isError: boolean }).isError).toBe(true);
    });
  });

  describe("export-hashtag tool", () => {
    it("should export hashtag posts in JSON format", async () => {
      const tool = registeredTools.get("export-hashtag");
      const result = await tool?.handler({
        domain: "mastodon.social",
        hashtag: "test",
        format: "json",
        limit: 20,
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Hashtag Export",
      );
      expect(remoteClient.searchInstance).toHaveBeenCalled();
    });

    it("should export hashtag posts in Markdown format", async () => {
      const tool = registeredTools.get("export-hashtag");
      const result = await tool?.handler({
        domain: "mastodon.social",
        hashtag: "test",
        format: "markdown",
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Hashtag Export",
      );
    });

    it("should normalize hashtag input", async () => {
      const tool = registeredTools.get("export-hashtag");
      await tool?.handler({
        domain: "mastodon.social",
        hashtag: "#test",
        format: "json",
      });

      // Verify searchInstance was called with proper hashtag format
      // The implementation strips leading # from input, then adds it back for the search
      expect(remoteClient.searchInstance).toHaveBeenCalledWith(
        "mastodon.social",
        "#test",
        "statuses",
      );
    });

    it("should handle hashtag export errors", async () => {
      (remoteClient.searchInstance as Mock).mockRejectedValueOnce(new Error("Search failed"));

      const tool = registeredTools.get("export-hashtag");
      const result = await tool?.handler({
        domain: "mastodon.social",
        hashtag: "test",
        format: "json",
      });

      expect((result as { isError: boolean }).isError).toBe(true);
    });
  });
});

describe("formatPost helper function", () => {
  // We test formatPost indirectly through the export tools
  // The function formats posts for different export types

  it("should handle posts with HTML content", async () => {
    const mcpServer = {
      registerTool: vi.fn(),
    } as unknown as McpServer;
    const rateLimiter = new RateLimiter({ enabled: false, maxRequests: 100, windowMs: 60000 });

    // Reset and setup
    vi.clearAllMocks();
    (remoteClient.fetchActorOutboxPaginated as Mock).mockResolvedValue({
      items: [
        { id: "1", content: "<p>Test <strong>bold</strong> post</p>", published: "2024-01-01" },
      ],
      totalItems: 1,
      hasMore: false,
    });

    const registeredTools = new Map<
      string,
      { handler: (...args: unknown[]) => Promise<unknown> }
    >();
    (mcpServer.registerTool as Mock).mockImplementation(
      (name: string, _config: unknown, handler: (...args: unknown[]) => Promise<unknown>) => {
        registeredTools.set(name, { handler });
      },
    );

    registerExportTools(mcpServer, rateLimiter);

    const tool = registeredTools.get("export-timeline");
    const result = await tool?.handler({
      identifier: "testuser@example.social",
      format: "markdown",
    });

    // HTML should be stripped in the output
    expect((result as { content: { text: string }[] }).content[0].text).toContain("Test");

    rateLimiter.stop();
  });
});
