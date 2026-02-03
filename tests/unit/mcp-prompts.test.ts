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
    it("should register all expected prompts", () => {
      const expectedPrompts = [
        "explore-fediverse",
        "discover-content",
        "compare-instances",
        "compare-accounts",
        "analyze-user-activity",
        "find-experts",
        "summarize-trending",
        "content-strategy",
        "community-health",
        "migration-helper",
        "thread-composer",
      ];

      for (const promptName of expectedPrompts) {
        expect(registeredPrompts.has(promptName), `Prompt ${promptName} should be registered`).toBe(
          true,
        );
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

  describe("compare-instances prompt", () => {
    it("should generate comparison message with instances", () => {
      const prompt = registeredPrompts.get("compare-instances");
      const result = prompt?.handler({ instances: "mastodon.social, fosstodon.org" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "mastodon.social, fosstodon.org",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "compare",
      );
    });

    it("should include criteria when specified", () => {
      const prompt = registeredPrompts.get("compare-instances");
      const result = prompt?.handler({
        instances: "mastodon.social",
        criteria: "moderation, privacy",
      });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "moderation, privacy",
      );
    });
  });

  describe("discover-content prompt", () => {
    it("should generate content discovery message", () => {
      const prompt = registeredPrompts.get("discover-content");
      const result = prompt?.handler({ topics: "rust, webdev" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "rust, webdev",
      );
    });

    it("should customize message for people content type", () => {
      const prompt = registeredPrompts.get("discover-content");
      const result = prompt?.handler({ topics: "science", contentType: "people" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "people",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "accounts to follow",
      );
    });

    it("should customize message for hashtags content type", () => {
      const prompt = registeredPrompts.get("discover-content");
      const result = prompt?.handler({ topics: "art", contentType: "hashtags" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "hashtags",
      );
    });

    it("should customize message for instances content type", () => {
      const prompt = registeredPrompts.get("discover-content");
      const result = prompt?.handler({ topics: "gaming", contentType: "instances" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "instances to explore",
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
  });

  describe("content-strategy prompt", () => {
    it("should generate content strategy message", () => {
      const prompt = registeredPrompts.get("content-strategy");
      const result = prompt?.handler({ topics: "javascript, webdev" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "javascript, webdev",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "content strategy",
      );
    });

    it("should include target audience", () => {
      const prompt = registeredPrompts.get("content-strategy");
      const result = prompt?.handler({ topics: "coding", targetAudience: "beginners" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "beginners",
      );
    });

    it("should include posting frequency", () => {
      const prompt = registeredPrompts.get("content-strategy");
      const result = prompt?.handler({ topics: "design", postingFrequency: "daily" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain("daily");
    });
  });

  describe("community-health prompt", () => {
    it("should generate community health analysis message", () => {
      const prompt = registeredPrompts.get("community-health");
      const result = prompt?.handler({ instance: "mastodon.social" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "mastodon.social",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "community health",
      );
    });

    it("should include specific concerns", () => {
      const prompt = registeredPrompts.get("community-health");
      const result = prompt?.handler({ instance: "example.social", concerns: "spam, moderation" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "spam, moderation",
      );
    });
  });

  describe("migration-helper prompt", () => {
    it("should generate migration helper message", () => {
      const prompt = registeredPrompts.get("migration-helper");
      const result = prompt?.handler({ priorities: "privacy, moderation" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "migration",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "privacy, moderation",
      );
    });

    it("should include current and target instances", () => {
      const prompt = registeredPrompts.get("migration-helper");
      const result = prompt?.handler({
        currentInstance: "mastodon.social",
        targetInstance: "fosstodon.org",
        priorities: "community",
      });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "mastodon.social",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "fosstodon.org",
      );
    });

    it("should handle new user without current instance", () => {
      const prompt = registeredPrompts.get("migration-helper");
      const result = prompt?.handler({ priorities: "topic focus" });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "New to Fediverse",
      );
    });
  });

  describe("thread-composer prompt", () => {
    it("should generate thread composer message", () => {
      const prompt = registeredPrompts.get("thread-composer");
      const result = prompt?.handler({
        topic: "Introduction to TypeScript",
        keyPoints: "type safety, interfaces, generics",
      });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "Introduction to TypeScript",
      );
      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "type safety, interfaces, generics",
      );
    });

    it("should customize for different tones", () => {
      const prompt = registeredPrompts.get("thread-composer");
      const result = prompt?.handler({
        topic: "Funny story",
        keyPoints: "beginning, middle, end",
        tone: "storytelling",
      });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "storytelling",
      );
    });

    it("should handle content warning", () => {
      const prompt = registeredPrompts.get("thread-composer");
      const result = prompt?.handler({
        topic: "Sensitive topic",
        keyPoints: "point 1, point 2",
        contentWarning: "contains discussion of difficult topics",
      });

      expect((result.messages[0] as { content: { text: string } }).content.text).toContain(
        "contains discussion of difficult topics",
      );
    });

    it("should respect includeHashtags flag", () => {
      const prompt = registeredPrompts.get("thread-composer");

      const withHashtags = prompt?.handler({
        topic: "Tech news",
        keyPoints: "point 1",
        includeHashtags: true,
      });
      expect((withHashtags.messages[0] as { content: { text: string } }).content.text).toContain(
        "Hashtag Research",
      );

      const withoutHashtags = prompt?.handler({
        topic: "Tech news",
        keyPoints: "point 1",
        includeHashtags: false,
      });
      expect(
        (withoutHashtags.messages[0] as { content: { text: string } }).content.text,
      ).not.toContain("Hashtag Research");
    });

    it("should handle different target lengths", () => {
      const prompt = registeredPrompts.get("thread-composer");

      const short = prompt?.handler({
        topic: "Quick tip",
        keyPoints: "tip",
        targetLength: "short",
      });
      expect((short.messages[0] as { content: { text: string } }).content.text).toContain("3-5");

      const medium = prompt?.handler({
        topic: "Tutorial",
        keyPoints: "steps",
        targetLength: "medium",
      });
      expect((medium.messages[0] as { content: { text: string } }).content.text).toContain("6-10");

      const long = prompt?.handler({
        topic: "Deep dive",
        keyPoints: "many points",
        targetLength: "long",
      });
      expect((long.messages[0] as { content: { text: string } }).content.text).toContain("11+");
    });
  });
});
