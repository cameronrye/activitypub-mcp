/**
 * Tests for MCP resource handlers
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { type ResourceConfig, registerResources } from "../../src/mcp/resources.js";
import { RateLimiter } from "../../src/server/rate-limiter.js";

// Mock dependencies
vi.mock("../../src/remote-client.js", () => ({
  remoteClient: {
    fetchRemoteActor: vi.fn(),
    fetchActorOutbox: vi.fn(),
    fetchActorFollowers: vi.fn(),
    fetchActorFollowing: vi.fn(),
    getInstanceInfo: vi.fn(),
    fetchTrendingHashtags: vi.fn(),
    fetchTrendingPosts: vi.fn(),
    fetchLocalTimeline: vi.fn(),
    fetchFederatedTimeline: vi.fn(),
    fetchPostThread: vi.fn(),
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

describe("MCP Resources", () => {
  let mcpServer: McpServer;
  let rateLimiter: RateLimiter;
  let registeredResources: Map<
    string,
    {
      handler: (uri: URL, params: Record<string, string | string[]>) => Promise<unknown>;
      template: unknown;
      config: unknown;
    }
  >;

  const defaultConfig: ResourceConfig = {
    serverName: "test-server",
    serverVersion: "1.0.0",
    logLevel: "error",
    rateLimitEnabled: false,
    rateLimitMax: 100,
    rateLimitWindow: 60000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock MCP server that captures resource registrations
    registeredResources = new Map();
    mcpServer = {
      registerResource: vi.fn(
        (
          name: string,
          template: unknown,
          config: unknown,
          handler: (uri: URL, params: Record<string, string | string[]>) => Promise<unknown>,
        ) => {
          registeredResources.set(name, { handler, template, config });
        },
      ),
    } as unknown as McpServer;

    rateLimiter = new RateLimiter({ enabled: false, maxRequests: 100, windowMs: 60000 });

    // Register all resources
    registerResources(mcpServer, rateLimiter, defaultConfig);
  });

  afterEach(() => {
    rateLimiter.stop();
  });

  describe("registerResources", () => {
    it("should register all expected resources", () => {
      const expectedResources = [
        "server-info",
        "remote-actor",
        "remote-timeline",
        "remote-followers",
        "remote-following",
        "instance-info",
        "trending",
        "local-timeline",
        "federated-timeline",
        "post-thread",
      ];

      for (const resourceName of expectedResources) {
        expect(
          registeredResources.has(resourceName),
          `Resource ${resourceName} should be registered`,
        ).toBe(true);
      }
    });
  });

  describe("server-info resource", () => {
    it("should return server information", async () => {
      const resource = registeredResources.get("server-info");
      expect(resource).toBeDefined();

      const uri = new URL("activitypub://server-info");
      const result = await resource?.handler(uri, {});

      const contents = (result as { contents: { text: string }[] }).contents;
      expect(contents).toHaveLength(1);

      const serverInfo = JSON.parse(contents[0].text);
      expect(serverInfo.name).toBe("test-server");
      expect(serverInfo.version).toBe("1.0.0");
      expect(serverInfo.capabilities).toBeDefined();
      expect(serverInfo.features).toBeDefined();
    });
  });

  describe("remote-actor resource", () => {
    it("should fetch and return actor data", async () => {
      (remoteClient.fetchRemoteActor as Mock).mockResolvedValue({
        id: "https://example.social/users/testuser",
        preferredUsername: "testuser",
        name: "Test User",
        summary: "A test user",
      });

      const resource = registeredResources.get("remote-actor");
      const uri = new URL("activitypub://remote-actor/testuser@example.social");
      const result = await resource?.handler(uri, { identifier: "testuser@example.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      expect(contents).toHaveLength(1);

      const actor = JSON.parse(contents[0].text);
      expect(actor.preferredUsername).toBe("testuser");
      expect(remoteClient.fetchRemoteActor).toHaveBeenCalledWith("testuser@example.social");
    });

    it("should handle fetch errors", async () => {
      (remoteClient.fetchRemoteActor as Mock).mockRejectedValue(new Error("Network error"));

      const resource = registeredResources.get("remote-actor");
      const uri = new URL("activitypub://remote-actor/testuser@example.social");

      await expect(
        resource?.handler(uri, { identifier: "testuser@example.social" }),
      ).rejects.toThrow(McpError);
    });

    it("should handle array identifiers", async () => {
      (remoteClient.fetchRemoteActor as Mock).mockResolvedValue({
        preferredUsername: "testuser",
      });

      const resource = registeredResources.get("remote-actor");
      const uri = new URL("activitypub://remote-actor/testuser@example.social");
      await resource?.handler(uri, { identifier: ["testuser@example.social", "ignored"] });

      expect(remoteClient.fetchRemoteActor).toHaveBeenCalledWith("testuser@example.social");
    });
  });

  describe("remote-timeline resource", () => {
    it("should fetch and return timeline data", async () => {
      (remoteClient.fetchActorOutbox as Mock).mockResolvedValue({
        type: "OrderedCollection",
        totalItems: 42,
        orderedItems: [{ type: "Note", content: "Hello world" }],
      });

      const resource = registeredResources.get("remote-timeline");
      const uri = new URL("activitypub://remote-timeline/testuser@example.social");
      const result = await resource?.handler(uri, { identifier: "testuser@example.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const timeline = JSON.parse(contents[0].text);
      expect(timeline.type).toBe("OrderedCollection");
      expect(timeline.orderedItems).toHaveLength(1);
    });

    it("should throw error when timeline is null", async () => {
      (remoteClient.fetchActorOutbox as Mock).mockResolvedValue(null);

      const resource = registeredResources.get("remote-timeline");
      const uri = new URL("activitypub://remote-timeline/testuser@example.social");

      await expect(
        resource?.handler(uri, { identifier: "testuser@example.social" }),
      ).rejects.toThrow("Failed to fetch timeline data");
    });

    it("should normalize timeline data with items instead of orderedItems", async () => {
      (remoteClient.fetchActorOutbox as Mock).mockResolvedValue({
        items: [{ type: "Note", content: "Test" }],
      });

      const resource = registeredResources.get("remote-timeline");
      const uri = new URL("activitypub://remote-timeline/testuser@example.social");
      const result = await resource?.handler(uri, { identifier: "testuser@example.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const timeline = JSON.parse(contents[0].text);
      expect(timeline.orderedItems).toHaveLength(1);
    });
  });

  describe("remote-followers resource", () => {
    it("should fetch and return followers data", async () => {
      (remoteClient.fetchActorFollowers as Mock).mockResolvedValue({
        totalItems: 100,
        items: ["https://example.social/users/follower1"],
      });

      const resource = registeredResources.get("remote-followers");
      const uri = new URL("activitypub://remote-followers/testuser@example.social");
      const result = await resource?.handler(uri, { identifier: "testuser@example.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const followers = JSON.parse(contents[0].text);
      expect(followers.totalItems).toBe(100);
      expect(remoteClient.fetchActorFollowers).toHaveBeenCalledWith("testuser@example.social", 20);
    });
  });

  describe("remote-following resource", () => {
    it("should fetch and return following data", async () => {
      (remoteClient.fetchActorFollowing as Mock).mockResolvedValue({
        totalItems: 50,
        items: ["https://example.social/users/following1"],
      });

      const resource = registeredResources.get("remote-following");
      const uri = new URL("activitypub://remote-following/testuser@example.social");
      const result = await resource?.handler(uri, { identifier: "testuser@example.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const following = JSON.parse(contents[0].text);
      expect(following.totalItems).toBe(50);
      expect(remoteClient.fetchActorFollowing).toHaveBeenCalledWith("testuser@example.social", 20);
    });
  });

  describe("instance-info resource", () => {
    it("should fetch and return instance information", async () => {
      (remoteClient.getInstanceInfo as Mock).mockResolvedValue({
        domain: "mastodon.social",
        software: "mastodon",
        version: "4.2.0",
        description: "A social network",
      });

      const resource = registeredResources.get("instance-info");
      const uri = new URL("activitypub://instance-info/mastodon.social");
      const result = await resource?.handler(uri, { domain: "mastodon.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const instanceInfo = JSON.parse(contents[0].text);
      expect(instanceInfo.domain).toBe("mastodon.social");
      expect(instanceInfo.uri).toBe("https://mastodon.social");
    });

    it("should handle invalid domain", async () => {
      const resource = registeredResources.get("instance-info");
      const uri = new URL("activitypub://instance-info/invalid");

      await expect(resource?.handler(uri, { domain: "invalid" })).rejects.toThrow();
    });
  });

  describe("trending resource", () => {
    it("should fetch and return trending hashtags and posts", async () => {
      (remoteClient.fetchTrendingHashtags as Mock).mockResolvedValue({
        hashtags: [{ name: "test", history: [] }],
      });
      (remoteClient.fetchTrendingPosts as Mock).mockResolvedValue({
        posts: [{ content: "Trending post" }],
      });

      const resource = registeredResources.get("trending");
      const uri = new URL("activitypub://trending/mastodon.social");
      const result = await resource?.handler(uri, { domain: "mastodon.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const trending = JSON.parse(contents[0].text);
      expect(trending.hashtags).toHaveLength(1);
      expect(trending.posts).toHaveLength(1);
      expect(trending.domain).toBe("mastodon.social");
    });

    it("should handle partial failures gracefully", async () => {
      (remoteClient.fetchTrendingHashtags as Mock).mockRejectedValue(new Error("Hashtags failed"));
      (remoteClient.fetchTrendingPosts as Mock).mockResolvedValue({
        posts: [{ content: "Post" }],
      });

      const resource = registeredResources.get("trending");
      const uri = new URL("activitypub://trending/mastodon.social");
      const result = await resource?.handler(uri, { domain: "mastodon.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const trending = JSON.parse(contents[0].text);
      expect(trending.hashtags).toEqual([]);
      expect(trending.posts).toHaveLength(1);
      expect(trending.errors.hashtags).toContain("Hashtags failed");
    });
  });

  describe("local-timeline resource", () => {
    it("should fetch and return local timeline", async () => {
      (remoteClient.fetchLocalTimeline as Mock).mockResolvedValue({
        posts: [{ content: "Local post" }],
        hasMore: true,
        nextMaxId: "123",
      });

      const resource = registeredResources.get("local-timeline");
      const uri = new URL("activitypub://local-timeline/mastodon.social");
      const result = await resource?.handler(uri, { domain: "mastodon.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const timeline = JSON.parse(contents[0].text);
      expect(timeline.type).toBe("local");
      expect(timeline.posts).toHaveLength(1);
      expect(timeline.hasMore).toBe(true);
    });
  });

  describe("federated-timeline resource", () => {
    it("should fetch and return federated timeline", async () => {
      (remoteClient.fetchFederatedTimeline as Mock).mockResolvedValue({
        posts: [{ content: "Federated post" }],
        hasMore: false,
      });

      const resource = registeredResources.get("federated-timeline");
      const uri = new URL("activitypub://federated-timeline/mastodon.social");
      const result = await resource?.handler(uri, { domain: "mastodon.social" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const timeline = JSON.parse(contents[0].text);
      expect(timeline.type).toBe("federated");
      expect(timeline.posts).toHaveLength(1);
    });
  });

  describe("post-thread resource", () => {
    it("should fetch and return post thread", async () => {
      (remoteClient.fetchPostThread as Mock).mockResolvedValue({
        post: { content: "Original post", id: "1" },
        ancestors: [],
        replies: [{ content: "Reply", id: "2" }],
        totalReplies: 1,
      });

      const resource = registeredResources.get("post-thread");
      const encodedUrl = encodeURIComponent("https://mastodon.social/@user/123");
      const uri = new URL(`activitypub://post-thread/${encodedUrl}`);
      const result = await resource?.handler(uri, { postUrl: "https://mastodon.social/@user/123" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const thread = JSON.parse(contents[0].text);
      expect(thread.post.content).toBe("Original post");
      expect(thread.replies).toHaveLength(1);
    });

    it("should handle URL-encoded post URLs", async () => {
      (remoteClient.fetchPostThread as Mock).mockResolvedValue({
        post: { content: "Test" },
        ancestors: [],
        replies: [],
        totalReplies: 0,
      });

      const resource = registeredResources.get("post-thread");
      const encodedUrl = encodeURIComponent("https://mastodon.social/@user/123");
      const uri = new URL(`activitypub://post-thread/${encodedUrl}`);
      await resource?.handler(uri, { postUrl: encodedUrl });

      expect(remoteClient.fetchPostThread).toHaveBeenCalledWith(
        "https://mastodon.social/@user/123",
        { depth: 2, maxReplies: 50 },
      );
    });

    it("should reject invalid post URLs", async () => {
      const resource = registeredResources.get("post-thread");
      const uri = new URL("activitypub://post-thread/invalid");

      await expect(resource?.handler(uri, { postUrl: "not-a-valid-url" })).rejects.toThrow(
        "Invalid post URL",
      );
    });
  });

  describe("rate limiting", () => {
    it("should throw error when rate limit exceeded", async () => {
      const strictRateLimiter = new RateLimiter({ enabled: true, maxRequests: 1, windowMs: 60000 });
      const strictResources = new Map<
        string,
        { handler: (uri: URL, params: Record<string, string | string[]>) => Promise<unknown> }
      >();

      const strictServer = {
        registerResource: vi.fn(
          (
            name: string,
            _template: unknown,
            _config: unknown,
            handler: (uri: URL, params: Record<string, string | string[]>) => Promise<unknown>,
          ) => {
            strictResources.set(name, { handler });
          },
        ),
      } as unknown as McpServer;

      registerResources(strictServer, strictRateLimiter, defaultConfig);

      (remoteClient.fetchRemoteActor as Mock).mockResolvedValue({ preferredUsername: "test" });

      const resource = strictResources.get("remote-actor");
      const uri = new URL("activitypub://remote-actor/testuser@example.social");

      // First call should succeed
      await resource?.handler(uri, { identifier: "testuser@example.social" });

      // Second call should fail due to rate limit
      await expect(
        resource?.handler(uri, { identifier: "testuser@example.social" }),
      ).rejects.toThrow("Rate limit exceeded");

      strictRateLimiter.stop();
    });
  });
});
