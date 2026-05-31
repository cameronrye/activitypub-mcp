/**
 * Tests for MCP prompt handlers
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPrompts } from "../../src/mcp/prompts.js";

describe("MCP Prompts", () => {
  let mcpServer: McpServer;
  let registeredPrompts: Map<
    string,
    { handler: (args: Record<string, unknown>) => { messages: unknown[] }; config: unknown }
  >;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock MCP server that captures prompt registrations
    registeredPrompts = new Map();
    mcpServer = {
      registerPrompt: vi.fn(
        (
          name: string,
          config: unknown,
          handler: (args: Record<string, unknown>) => { messages: unknown[] },
        ) => {
          registeredPrompts.set(name, { handler, config });
        },
      ),
    } as unknown as McpServer;

    // Register all prompts
    registerPrompts(mcpServer);
  });

  describe("registerPrompts", () => {
    it("should register exactly the five kept prompts", () => {
      const expectedPrompts = [
        "explore-fediverse",
        "compare-accounts",
        "analyze-user-activity",
        "find-experts",
        "summarize-trending",
      ];

      expect(registeredPrompts.size).toBe(expectedPrompts.length);

      for (const promptName of expectedPrompts) {
        expect(registeredPrompts.has(promptName), `Prompt ${promptName} should be registered`).toBe(
          true,
        );
      }
    });

    it("should not register the removed prompts", () => {
      const removedPrompts = [
        "community-health",
        "compare-instances",
        "content-strategy",
        "discover-content",
        "migration-helper",
        "thread-composer",
      ];

      for (const promptName of removedPrompts) {
        expect(
          registeredPrompts.has(promptName),
          `Prompt ${promptName} should NOT be registered`,
        ).toBe(false);
      }
    });
  });

  describe("explore-fediverse prompt", () => {
    it("should generate exploration message with interests", () => {
      const prompt = registeredPrompts.get("explore-fediverse");
      expect(prompt).toBeDefined();

      const result = prompt?.handler({ interests: "technology, programming" });

      expect(result.messages).toHaveLength(1);
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "technology, programming",
      );
      expect((result.messages[0] as { role: string }).role).toBe("user");
    });

    it("should include instance type preference when specified", () => {
      const prompt = registeredPrompts.get("explore-fediverse");
      const result = prompt?.handler({ interests: "art", instanceType: "pixelfed" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "pixelfed",
      );
    });

    it("should work without instance type", () => {
      const prompt = registeredPrompts.get("explore-fediverse");
      const result = prompt?.handler({ interests: "music" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain("music");
      expect((result.messages[0] as { content: { text: string } }).content.text).not.toContain(
        "I prefer",
      );
    });
  });

  describe("compare-accounts prompt", () => {
    it("should generate account comparison message", () => {
      const prompt = registeredPrompts.get("compare-accounts");
      const result = prompt?.handler({ accounts: "user1@mastodon.social, user2@fosstodon.org" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "user1@mastodon.social, user2@fosstodon.org",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "posting frequency",
      );
    });

    it("should include aspects when specified", () => {
      const prompt = registeredPrompts.get("compare-accounts");
      const result = prompt?.handler({
        accounts: "user@example.social",
        aspects: "engagement, topics",
      });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "engagement, topics",
      );
    });
  });

  describe("analyze-user-activity prompt", () => {
    it("should generate analysis message with default depth", () => {
      const prompt = registeredPrompts.get("analyze-user-activity");
      const result = prompt?.handler({ identifier: "testuser@mastodon.social" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "testuser@mastodon.social",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "Analyze their recent 20 posts",
      );
    });

    it("should customize for quick analysis", () => {
      const prompt = registeredPrompts.get("analyze-user-activity");
      const result = prompt?.handler({ identifier: "user@example.social", depth: "quick" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "10 most recent posts",
      );
    });

    it("should customize for comprehensive analysis", () => {
      const prompt = registeredPrompts.get("analyze-user-activity");
      const result = prompt?.handler({ identifier: "user@example.social", depth: "comprehensive" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "up to 50 posts",
      );
    });
  });

  describe("find-experts prompt", () => {
    it("should generate expert finding message", () => {
      const prompt = registeredPrompts.get("find-experts");
      const result = prompt?.handler({ topic: "machine learning" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "machine learning",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "experts",
      );
    });

    it("should include specific instances when provided", () => {
      const prompt = registeredPrompts.get("find-experts");
      const result = prompt?.handler({
        topic: "climate science",
        instances: "mastodon.social, scholar.social",
      });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "mastodon.social, scholar.social",
      );
    });

    it("should reference the search tool, not the removed search-accounts tool", () => {
      const prompt = registeredPrompts.get("find-experts");
      const result = prompt?.handler({ topic: "rust programming" });
      const text = (result.messages[0] as { content: { text: string } }).content.text;

      expect(text).toContain("search tool");
      expect(text).not.toContain("search-accounts");
    });
  });

  describe("summarize-trending prompt", () => {
    it("should generate trending summary message", () => {
      const prompt = registeredPrompts.get("summarize-trending");
      const result = prompt?.handler({});

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "trending",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "mastodon.social",
      );
    });

    it("should use specified instances", () => {
      const prompt = registeredPrompts.get("summarize-trending");
      const result = prompt?.handler({ instances: "fosstodon.org, techhub.social" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "fosstodon.org, techhub.social",
      );
    });

    it("should apply focus area", () => {
      const prompt = registeredPrompts.get("summarize-trending");
      const result = prompt?.handler({ focus: "tech" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain("tech");
    });

    it("should reference get-public-timeline, not removed timeline tools", () => {
      const prompt = registeredPrompts.get("summarize-trending");
      const result = prompt?.handler({});
      const text = (result.messages[0] as { content: { text: string } }).content.text;

      expect(text).toContain("get-public-timeline");
      expect(text).not.toContain("get-local-timeline");
      expect(text).not.toContain("get-federated-timeline");
    });
  });
});
