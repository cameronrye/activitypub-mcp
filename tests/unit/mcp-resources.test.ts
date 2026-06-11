/**
 * Tests for MCP resource handlers
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { capabilitiesRegistry } from "../../src/mcp/capabilities.js";
import { type ResourceConfig, registerResources } from "../../src/mcp/resources.js";
import { RateLimiter } from "../../src/resilience/rate-limiter.js";

// Mock dependencies
vi.mock("../../src/activitypub/remote-client.js", () => ({
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
    resolveStatusUri: vi.fn(),
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

vi.mock("../../src/discovery/nodeinfo.js", () => ({
  getInstanceSoftware: vi.fn(),
}));

import { remoteClient } from "../../src/activitypub/remote-client.js";
import { getInstanceSoftware } from "../../src/discovery/nodeinfo.js";

/**
 * Strip the <untrusted-content> envelope and parse the inner JSON.
 * Remote resource bodies are now wrapped; server-info is not.
 */
function parseWrapped(text: string): unknown {
  const match = text.match(/^<untrusted-content[^>]*>\n([\s\S]*)\n<\/untrusted-content>$/);
  if (match) {
    return JSON.parse(match[1]);
  }
  return JSON.parse(text);
}

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
    capabilitiesRegistry.reset();

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
      expect(contents[0].text).toContain("<untrusted-content");

      const actor = parseWrapped(contents[0].text) as Record<string, unknown>;
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
      const timeline = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect(timeline.type).toBe("OrderedCollection");
      expect((timeline.orderedItems as unknown[]).length).toBe(1);
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
      const timeline = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect((timeline.orderedItems as unknown[]).length).toBe(1);
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
      const followers = parseWrapped(contents[0].text) as Record<string, unknown>;
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
      const following = parseWrapped(contents[0].text) as Record<string, unknown>;
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
      const instanceInfo = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect(instanceInfo.domain).toBe("mastodon.social");
      expect(instanceInfo.uri).toBe("https://mastodon.social");
    });

    it("should handle invalid domain", async () => {
      const resource = registeredResources.get("instance-info");
      const uri = new URL("activitypub://instance-info/invalid");

      await expect(resource?.handler(uri, { domain: "invalid" })).rejects.toThrow();
    });

    it("includes software detection in the response on success", async () => {
      (remoteClient.getInstanceInfo as Mock).mockResolvedValue({
        domain: "enriched.social",
        software: "mastodon",
        version: "4.2.0",
        description: "A social network",
      });
      (getInstanceSoftware as Mock).mockResolvedValue({
        domain: "enriched.social",
        detection: "success",
        software: { name: "mastodon", version: "4.3.2" },
        protocols: ["activitypub"],
        openRegistrations: false,
      });

      const resource = registeredResources.get("instance-info");
      const uri = new URL("activitypub://instance-info/enriched.social");
      const result = await resource?.handler(uri, { domain: "enriched.social" });

      const body = parseWrapped(
        (result as { contents: { text: string }[] }).contents[0].text,
      ) as Record<string, unknown>;
      expect(body.software).toBeDefined();
      const sw = body.software as Record<string, unknown>;
      expect(sw.detection).toBe("success");
      expect((sw.software as Record<string, unknown>).name).toBe("mastodon");
      expect((sw.software as Record<string, unknown>).version).toBe("4.3.2");
    });

    it("returns successfully with software=unavailable when detection fails", async () => {
      (remoteClient.getInstanceInfo as Mock).mockResolvedValue({
        domain: "noinfo.social",
        description: "A social network",
      });
      (getInstanceSoftware as Mock).mockResolvedValue({
        domain: "noinfo.social",
        detection: "unavailable",
        software: null,
        protocols: null,
        openRegistrations: null,
        reason: "HTTP 404 Not Found",
      });

      const resource = registeredResources.get("instance-info");
      const uri = new URL("activitypub://instance-info/noinfo.social");
      const result = await resource?.handler(uri, { domain: "noinfo.social" });

      const body = parseWrapped(
        (result as { contents: { text: string }[] }).contents[0].text,
      ) as Record<string, unknown>;
      expect(body.software).toBeDefined();
      const sw = body.software as Record<string, unknown>;
      expect(sw.detection).toBe("unavailable");
      expect(sw.reason as string).toMatch(/404/);
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
      const trending = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect((trending.hashtags as unknown[]).length).toBe(1);
      expect((trending.posts as unknown[]).length).toBe(1);
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
      const trending = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect(trending.hashtags).toEqual([]);
      expect((trending.posts as unknown[]).length).toBe(1);
      expect((trending.errors as Record<string, string>).hashtags).toContain("Hashtags failed");
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
      const timeline = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect(timeline.type).toBe("local");
      expect((timeline.posts as unknown[]).length).toBe(1);
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
      const timeline = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect(timeline.type).toBe("federated");
      expect((timeline.posts as unknown[]).length).toBe(1);
    });
  });

  describe("post-thread resource", () => {
    it("should fetch and return post thread", async () => {
      (remoteClient.resolveStatusUri as Mock).mockResolvedValue(
        "https://mastodon.social/users/alice/statuses/123",
      );
      (remoteClient.fetchPostThread as Mock).mockResolvedValue({
        post: { content: "Original post", id: "1" },
        ancestors: [],
        replies: [{ content: "Reply", id: "2" }],
        totalReplies: 1,
      });

      const resource = registeredResources.get("post-thread");
      const uri = new URL("activitypub://post-thread/mastodon.social/123");
      const result = await resource?.handler(uri, { domain: "mastodon.social", statusId: "123" });

      const contents = (result as { contents: { text: string }[] }).contents;
      const thread = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect((thread.post as Record<string, unknown>).content).toBe("Original post");
      expect((thread.replies as unknown[]).length).toBe(1);
    });

    it("resolves the canonical AP uri via the REST API instead of the dead /web/ route", async () => {
      (remoteClient.resolveStatusUri as Mock).mockResolvedValue(
        "https://mastodon.social/users/alice/statuses/123",
      );
      (remoteClient.fetchPostThread as Mock).mockResolvedValue({
        post: { content: "Test" },
        ancestors: [],
        replies: [],
        totalReplies: 0,
      });

      const resource = registeredResources.get("post-thread");
      const uri = new URL("activitypub://post-thread/mastodon.social/123");
      await resource?.handler(uri, { domain: "mastodon.social", statusId: "123" });

      expect(remoteClient.resolveStatusUri).toHaveBeenCalledWith("mastodon.social", "123");
      // The thread is fetched with the resolved canonical URI, never the old
      // /web/statuses/ SPA route.
      expect(remoteClient.fetchPostThread).toHaveBeenCalledWith(
        "https://mastodon.social/users/alice/statuses/123",
        { depth: 2, maxReplies: 50 },
      );
    });

    it("should reject missing domain or statusId", async () => {
      const resource = registeredResources.get("post-thread");
      const uri = new URL("activitypub://post-thread/mastodon.social/123");

      await expect(resource?.handler(uri, { domain: "", statusId: "" })).rejects.toThrow(
        "post-thread requires {domain} and {statusId}",
      );
    });

    it("rejects a statusId that could inject extra path segments", async () => {
      const resource = registeredResources.get("post-thread");
      const uri = new URL("activitypub://post-thread/mastodon.social/x");

      await expect(
        resource?.handler(uri, { domain: "mastodon.social", statusId: "123/../../admin" }),
      ).rejects.toThrow(/alphanumeric id/);
      expect(remoteClient.resolveStatusUri).not.toHaveBeenCalled();
    });
  });

  describe("post-thread URI template (L10)", () => {
    it("accepts the new {domain}/{statusId} form", async () => {
      (remoteClient.resolveStatusUri as Mock).mockResolvedValue(
        "https://mastodon.social/users/alice/statuses/123456",
      );
      (remoteClient.fetchPostThread as Mock).mockResolvedValue({
        post: { content: "Hello from mastodon" },
        ancestors: [],
        replies: [],
        totalReplies: 0,
      });

      const resource = registeredResources.get("post-thread");
      const uri = new URL("activitypub://post-thread/mastodon.social/123456");
      const result = await resource?.handler(uri, {
        domain: "mastodon.social",
        statusId: "123456",
      });

      expect(result).toBeDefined();
      const contents = (result as { contents: { text: string }[] }).contents;
      const thread = parseWrapped(contents[0].text) as Record<string, unknown>;
      expect(thread.postUrl).toBe("https://mastodon.social/users/alice/statuses/123456");
    });

    it("rejects the legacy encoded-URL form with an InvalidParams error", async () => {
      const resource = registeredResources.get("post-thread");
      const encodedPostUrl = encodeURIComponent("https://mastodon.social/@user/123456");
      const uri = new URL(`activitypub://post-thread/${encodedPostUrl}`);

      await expect(
        resource?.handler(uri, { domain: encodedPostUrl, statusId: "" }),
      ).rejects.toThrow(/removed in 2\.1\.0/);
    });
  });

  describe("server-info dynamic capabilities (M6)", () => {
    it("lists every prompt the server actually registered", async () => {
      // The registry is reset in beforeEach and registerResources populates resources.
      // Populate the prompts that the real server registers via registerPrompts().
      // These match the names in src/mcp/prompts.ts exactly.
      const actualPrompts = [
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
      for (const name of actualPrompts) {
        capabilitiesRegistry.addPrompt(name);
      }

      const resource = registeredResources.get("server-info");
      expect(resource).toBeDefined();

      const uri = new URL("activitypub://server-info");
      const result = await resource?.handler(uri, {});
      const contents = (result as { contents: { text: string }[] }).contents;
      const data = JSON.parse(contents[0].text);

      const advertisedPrompts: string[] = data.capabilities.prompts;

      // Every registered prompt must appear in the server-info response.
      for (const name of actualPrompts) {
        expect(advertisedPrompts).toContain(name);
      }

      // No phantom prompts should appear that weren't registered.
      for (const name of advertisedPrompts) {
        expect(actualPrompts).toContain(name);
      }
    });

    it("lists resources dynamically from the registry", async () => {
      // registerResources is called in beforeEach and populates the registry.
      const resource = registeredResources.get("server-info");
      expect(resource).toBeDefined();

      const uri = new URL("activitypub://server-info");
      const result = await resource?.handler(uri, {});
      const contents = (result as { contents: { text: string }[] }).contents;
      const data = JSON.parse(contents[0].text);

      const advertisedResources: string[] = data.capabilities.resources;
      expect(advertisedResources).toContain("server-info");
      expect(advertisedResources).toContain("remote-actor");
      expect(advertisedResources).toContain("post-thread");
      // Should be a flat array, not an object with categories.
      expect(Array.isArray(advertisedResources)).toBe(true);
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
