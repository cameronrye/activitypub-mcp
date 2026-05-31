/**
 * Tests for MCP tool handlers
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { registerTools } from "../../src/mcp/tools.js";
import { RateLimiter } from "../../src/resilience/rate-limiter.js";

// Mock dependencies
vi.mock("../../src/activitypub/remote-client.js", () => ({
  remoteClient: {
    fetchRemoteActor: vi.fn(),
    fetchActorOutboxPaginated: vi.fn(),
    searchInstance: vi.fn(),
    getInstanceInfo: vi.fn(),
    fetchTrendingHashtags: vi.fn(),
    fetchTrendingPosts: vi.fn(),
    fetchLocalTimeline: vi.fn(),
    fetchFederatedTimeline: vi.fn(),
    fetchPostThread: vi.fn(),
    convertWebUrlToActivityPub: vi.fn(),
    convertActivityPubToWebUrl: vi.fn(),
    batchFetchActors: vi.fn(),
    batchFetchPosts: vi.fn(),
  },
}));

vi.mock("../../src/discovery/instance-discovery.js", () => ({
  instanceDiscovery: {
    getPopularInstances: vi.fn().mockReturnValue([
      {
        domain: "mastodon.social",
        description: "General instance",
        users: "1M+",
        software: "mastodon",
      },
    ]),
    searchInstancesByTopic: vi.fn().mockReturnValue([]),
    getInstancesBySize: vi.fn().mockReturnValue([]),
    getInstancesByRegion: vi.fn().mockReturnValue([]),
    getBeginnerFriendlyInstances: vi.fn().mockReturnValue([]),
    getInstanceRecommendations: vi.fn().mockReturnValue([]),
  },
}));

vi.mock("../../src/discovery/dynamic-instance-discovery.js", () => ({
  dynamicInstanceDiscovery: {
    searchInstances: vi.fn().mockResolvedValue({
      instances: [{ domain: "test.social", users: 1000, software: "mastodon" }],
      total: 1,
      source: "api",
      hasMore: false,
    }),
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
  formatInstanceSoftware: vi.fn((info) =>
    info.detection === "success"
      ? `\`${info.domain}\` runs ${info.software.name} ${info.software.version}.`
      : `Could not detect software for \`${info.domain}\`: ${info.reason}.`,
  ),
}));

// Import mocked modules
import { remoteClient } from "../../src/activitypub/remote-client.js";
import { auditLogger } from "../../src/audit/logger.js";
import { dynamicInstanceDiscovery } from "../../src/discovery/dynamic-instance-discovery.js";
import { instanceDiscovery } from "../../src/discovery/instance-discovery.js";
import { getInstanceSoftware } from "../../src/discovery/nodeinfo.js";

describe("MCP Tools", () => {
  let mcpServer: McpServer;
  let rateLimiter: RateLimiter;
  let registeredTools: Map<
    string,
    { handler: (...args: unknown[]) => Promise<unknown>; config: unknown }
  >;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a real MCP server and capture tool registrations
    registeredTools = new Map();
    mcpServer = {
      registerTool: vi.fn(
        (name: string, config: unknown, handler: (...args: unknown[]) => Promise<unknown>) => {
          registeredTools.set(name, { handler, config });
        },
      ),
    } as unknown as McpServer;

    rateLimiter = new RateLimiter({ enabled: false, maxRequests: 100, windowMs: 60000 });

    // Register all tools
    registerTools(mcpServer, rateLimiter);
  });

  afterEach(() => {
    rateLimiter.stop();
  });

  describe("registerTools", () => {
    it("should register all expected tools", () => {
      const expectedTools = [
        "discover-actor",
        "discover-instances",
        "discover-instances-live",
        "recommend-instances",
        "fetch-timeline",
        "get-post-thread",
        "search",
        "get-trending-hashtags",
        "get-trending-posts",
        "get-local-timeline",
        "get-federated-timeline",
        "get-instance-info",
        "get-instance-software",
        "convert-url",
        "batch-fetch-actors",
        "batch-fetch-posts",
      ];

      for (const toolName of expectedTools) {
        expect(registeredTools.has(toolName), `Tool ${toolName} should be registered`).toBe(true);
      }
    });
  });

  describe("discover-actor tool", () => {
    it("should successfully discover an actor", async () => {
      (remoteClient.fetchRemoteActor as Mock).mockResolvedValue({
        id: "https://example.social/users/testuser",
        preferredUsername: "testuser",
        name: "Test User",
        summary: "A test user",
        url: "https://example.social/@testuser",
        inbox: "https://example.social/users/testuser/inbox",
        outbox: "https://example.social/users/testuser/outbox",
        followers: "https://example.social/users/testuser/followers",
        following: "https://example.social/users/testuser/following",
      });

      const tool = registeredTools.get("discover-actor");
      expect(tool).toBeDefined();

      const result = await tool?.handler({ identifier: "testuser@example.social" });

      expect(result).toHaveProperty("content");
      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Successfully discovered actor",
      );
      expect(remoteClient.fetchRemoteActor).toHaveBeenCalledWith("testuser@example.social");
    });

    it("should handle errors gracefully", async () => {
      (remoteClient.fetchRemoteActor as Mock).mockRejectedValue(new Error("Network error"));

      const tool = registeredTools.get("discover-actor");
      const result = await tool?.handler({ identifier: "testuser@example.social" });

      expect((result as { isError: boolean }).isError).toBe(true);
      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Failed to discover actor",
      );
    });
  });

  describe("fetch-timeline tool", () => {
    it("should fetch actor timeline with pagination", async () => {
      (remoteClient.fetchActorOutboxPaginated as Mock).mockResolvedValue({
        items: [
          { type: "Note", content: "Hello world", id: "1" },
          { type: "Note", content: "Another post", id: "2" },
        ],
        totalItems: 100,
        collectionId: "https://example.social/users/testuser/outbox",
        hasMore: true,
        nextCursor: "cursor-123",
      });

      const tool = registeredTools.get("fetch-timeline");
      const result = await tool?.handler({
        identifier: "testuser@example.social",
        limit: 20,
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Successfully fetched timeline",
      );
      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Next page cursor",
      );
    });

    it("should handle empty timeline", async () => {
      (remoteClient.fetchActorOutboxPaginated as Mock).mockResolvedValue({
        items: [],
        totalItems: 0,
        collectionId: "https://example.social/users/testuser/outbox",
        hasMore: false,
      });

      const tool = registeredTools.get("fetch-timeline");
      const result = await tool?.handler({ identifier: "testuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Posts retrieved: 0",
      );
    });
  });

  describe("get-instance-info tool", () => {
    it("should get instance information", async () => {
      (remoteClient.getInstanceInfo as Mock).mockResolvedValue({
        domain: "mastodon.social",
        software: "mastodon",
        version: "4.2.0",
        description: "A social network",
        languages: ["en"],
        registrations: true,
        approval_required: false,
        stats: {
          user_count: 1000000,
          status_count: 50000000,
          domain_count: 30000,
        },
        contact_account: {
          username: "admin",
          display_name: "Admin",
        },
      });

      const tool = registeredTools.get("get-instance-info");
      const result = await tool?.handler({ domain: "mastodon.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Instance Information",
      );
      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "mastodon.social",
      );
    });
  });

  describe("discover-instances tool", () => {
    it("should return popular instances", async () => {
      const tool = registeredTools.get("discover-instances");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "fediverse instances",
      );
      expect(instanceDiscovery.getPopularInstances).toHaveBeenCalled();
    });

    it("should filter by topic", async () => {
      (instanceDiscovery.searchInstancesByTopic as Mock).mockReturnValue([
        { domain: "tech.social", description: "Tech focused", users: "10K", software: "mastodon" },
      ]);

      const tool = registeredTools.get("discover-instances");
      await tool?.handler({ topic: "technology" });

      expect(instanceDiscovery.searchInstancesByTopic).toHaveBeenCalledWith("technology");
    });

    it("should filter by size", async () => {
      const tool = registeredTools.get("discover-instances");
      await tool?.handler({ size: "large" });

      expect(instanceDiscovery.getInstancesBySize).toHaveBeenCalledWith("large");
    });
  });

  describe("discover-instances-live tool", () => {
    it("should fetch live instance data", async () => {
      const tool = registeredTools.get("discover-instances-live");
      const result = await tool?.handler({ limit: 10 });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Live Instance Discovery",
      );
      expect(dynamicInstanceDiscovery.searchInstances).toHaveBeenCalled();
    });
  });

  describe("recommend-instances tool", () => {
    it("should return instance recommendations based on interests", async () => {
      (instanceDiscovery.getInstanceRecommendations as Mock).mockReturnValue([
        {
          domain: "fosstodon.org",
          description: "FOSS enthusiasts",
          users: "50K",
          software: "mastodon",
        },
      ]);

      const tool = registeredTools.get("recommend-instances");
      const result = await tool?.handler({ interests: ["opensource", "linux"] });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "recommended fediverse instances",
      );
      expect(instanceDiscovery.getInstanceRecommendations).toHaveBeenCalledWith([
        "opensource",
        "linux",
      ]);
    });
  });

  describe("get-post-thread tool", () => {
    it("should fetch post thread", async () => {
      (remoteClient.fetchPostThread as Mock).mockResolvedValue({
        post: {
          content: "Original post",
          id: "1",
          url: "https://example.social/1",
          published: "2024-01-01",
        },
        ancestors: [],
        replies: [{ content: "A reply", id: "2" }],
        totalReplies: 1,
      });

      const tool = registeredTools.get("get-post-thread");
      const result = await tool?.handler({ postUrl: "https://example.social/@user/123" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Post Thread");
      expect(remoteClient.fetchPostThread).toHaveBeenCalled();
    });
  });

  describe("get-trending-hashtags tool", () => {
    it("should fetch trending hashtags", async () => {
      (remoteClient.fetchTrendingHashtags as Mock).mockResolvedValue({
        hashtags: [
          { name: "test", history: [{ uses: "100", accounts: "50" }] },
          { name: "fediverse", history: [{ uses: "200", accounts: "100" }] },
        ],
      });

      const tool = registeredTools.get("get-trending-hashtags");
      const result = await tool?.handler({ domain: "mastodon.social", limit: 10 });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Trending Hashtags",
      );
      expect((result as { content: { text: string }[] }).content[0].text).toContain("#test");
    });
  });

  describe("get-trending-posts tool", () => {
    it("should fetch trending posts", async () => {
      (remoteClient.fetchTrendingPosts as Mock).mockResolvedValue({
        posts: [
          {
            content: "<p>Trending post</p>",
            account: { username: "user", display_name: "User" },
            favourites_count: 100,
            reblogs_count: 50,
            replies_count: 20,
          },
        ],
      });

      const tool = registeredTools.get("get-trending-posts");
      const result = await tool?.handler({ domain: "mastodon.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Trending Posts",
      );
    });
  });

  describe("get-local-timeline tool", () => {
    it("should fetch local timeline", async () => {
      (remoteClient.fetchLocalTimeline as Mock).mockResolvedValue({
        posts: [
          {
            content: "<p>Local post</p>",
            account: { username: "localuser" },
            favourites_count: 10,
            reblogs_count: 5,
            replies_count: 2,
          },
        ],
        hasMore: true,
        nextMaxId: "123",
      });

      const tool = registeredTools.get("get-local-timeline");
      const result = await tool?.handler({ domain: "mastodon.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Local Timeline",
      );
    });
  });

  describe("get-federated-timeline tool", () => {
    it("should fetch federated timeline", async () => {
      (remoteClient.fetchFederatedTimeline as Mock).mockResolvedValue({
        posts: [
          {
            content: "<p>Federated post</p>",
            account: { username: "remoteuser" },
            favourites_count: 20,
            reblogs_count: 10,
            replies_count: 5,
          },
        ],
        hasMore: false,
      });

      const tool = registeredTools.get("get-federated-timeline");
      const result = await tool?.handler({ domain: "mastodon.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Federated Timeline",
      );
    });
  });

  describe("unified search tool", () => {
    it("should search all types by default", async () => {
      (remoteClient.searchInstance as Mock).mockResolvedValue({
        accounts: [{ acct: "user", display_name: "User", followers_count: 10 }],
        statuses: [],
        hashtags: [],
      });

      const tool = registeredTools.get("search");
      const result = await tool?.handler({ query: "test" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Search Results",
      );
    });
  });

  describe("convert-url tool", () => {
    it("should convert web URL to ActivityPub URI", async () => {
      (remoteClient.convertWebUrlToActivityPub as Mock).mockResolvedValue({
        activityPubUri: "https://example.social/users/testuser",
        type: "actor",
        domain: "example.social",
      });

      const tool = registeredTools.get("convert-url");
      const result = await tool?.handler({ url: "https://example.social/@testuser" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "URL Conversion",
      );
    });

    it("should convert ActivityPub URI to web URL", async () => {
      (remoteClient.convertActivityPubToWebUrl as Mock).mockReturnValue({
        webUrl: "https://example.social/@testuser",
        type: "actor",
        domain: "example.social",
      });

      const tool = registeredTools.get("convert-url");
      const result = await tool?.handler({
        url: "https://example.social/users/testuser",
        direction: "to-web",
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "URL Conversion",
      );
    });
  });

  describe("batch-fetch-actors tool", () => {
    it("should batch fetch multiple actors", async () => {
      (remoteClient.batchFetchActors as Mock).mockResolvedValue({
        results: [
          {
            identifier: "user1@example.social",
            actor: { preferredUsername: "user1", name: "User 1" },
          },
          {
            identifier: "user2@example.social",
            actor: { preferredUsername: "user2", name: "User 2" },
          },
        ],
        successful: 2,
        failed: 0,
      });

      const tool = registeredTools.get("batch-fetch-actors");
      const result = await tool?.handler({
        identifiers: ["user1@example.social", "user2@example.social"],
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Batch Actor Fetch Results",
      );
      expect((result as { content: { text: string }[] }).content[0].text).toContain("2 successful");
    });
  });

  describe("batch-fetch-posts tool", () => {
    it("should batch fetch multiple posts", async () => {
      (remoteClient.batchFetchPosts as Mock).mockResolvedValue({
        results: [
          { url: "https://example.social/1", post: { content: "Post 1" } },
          { url: "https://example.social/2", post: { content: "Post 2" } },
        ],
        successful: 2,
        failed: 0,
      });

      const tool = registeredTools.get("batch-fetch-posts");
      const result = await tool?.handler({
        postUrls: ["https://example.social/1", "https://example.social/2"],
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Batch Post Fetch Results",
      );
      expect((result as { content: { text: string }[] }).content[0].text).toContain("2 successful");
    });
  });

  describe("rate limiting", () => {
    it("should throw McpError when rate limit exceeded on same identifier", async () => {
      const strictRateLimiter = new RateLimiter({ enabled: true, maxRequests: 1, windowMs: 60000 });
      const strictServer = {
        registerTool: vi.fn(
          (name: string, config: unknown, handler: (...args: unknown[]) => Promise<unknown>) => {
            registeredTools.set(`strict-${name}`, { handler, config });
          },
        ),
      } as unknown as McpServer;

      registerTools(strictServer, strictRateLimiter);

      // First call should succeed
      (remoteClient.fetchRemoteActor as Mock).mockResolvedValue({ preferredUsername: "test" });
      const tool = registeredTools.get("strict-discover-actor");
      const result1 = await tool?.handler({ identifier: "user@example.social" });

      // Verify first call worked
      expect((result1 as { content: { text: string }[] }).content[0].text).toContain(
        "Successfully discovered actor",
      );

      // Second call with SAME identifier should throw McpError
      await expect(tool?.handler({ identifier: "user@example.social" })).rejects.toThrow(
        "Rate limit exceeded",
      );

      strictRateLimiter.stop();
    });
  });

  describe("discover-instances filter composition (H7)", () => {
    it("applies multiple filters cumulatively", async () => {
      const tool = registeredTools.get("discover-instances");
      expect(tool).toBeDefined();

      // Set up mocks so topic and size filters overlap partially:
      // topic "tech" => [fosstodon.org, techhub.social]
      // size "large" => [mastodon.social, techhub.social]
      // combined => [techhub.social] only
      const techInstances = [
        {
          domain: "fosstodon.org",
          description: "FOSS and tech community",
          users: "50K",
          software: "mastodon",
        },
        {
          domain: "techhub.social",
          description: "Tech hub for developers",
          users: "200K",
          software: "mastodon",
        },
      ];
      const largeInstances = [
        {
          domain: "mastodon.social",
          description: "General instance",
          users: "1M+",
          software: "mastodon",
        },
        {
          domain: "techhub.social",
          description: "Tech hub for developers",
          users: "200K",
          software: "mastodon",
        },
      ];

      (instanceDiscovery.getPopularInstances as Mock).mockReturnValue([
        ...techInstances,
        {
          domain: "mastodon.social",
          description: "General instance",
          users: "1M+",
          software: "mastodon",
        },
      ]);
      (instanceDiscovery.searchInstancesByTopic as Mock).mockReturnValue(techInstances);
      (instanceDiscovery.getInstancesBySize as Mock).mockReturnValue(largeInstances);

      const both = await tool?.handler({ topic: "tech", size: "large" });
      const topicOnly = await tool?.handler({ topic: "tech" });
      const sizeOnly = await tool?.handler({ size: "large" });

      const parseIds = (r: unknown): string[] => {
        const text = ((r as { content: { text: string }[] })?.content?.[0]?.text ?? "") as string;
        return text.match(/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
      };

      const bothIds = new Set(parseIds(both));
      const topicIds = new Set(parseIds(topicOnly));
      const sizeIds = new Set(parseIds(sizeOnly));

      // Combined result must be a subset of each individual result
      for (const id of bothIds) {
        expect(topicIds.has(id)).toBe(true);
        expect(sizeIds.has(id)).toBe(true);
      }

      // Sanity: combined ≤ each individual
      expect(bothIds.size).toBeLessThanOrEqual(topicIds.size);
      expect(bothIds.size).toBeLessThanOrEqual(sizeIds.size);

      // techhub.social must appear in combined (it satisfies both filters)
      expect(bothIds.has("techhub.social")).toBe(true);
      // fosstodon.org must NOT appear in combined (large filter excludes it)
      expect(bothIds.has("fosstodon.org")).toBe(false);
    });
  });

  describe("search prose render (M4)", () => {
    it("renders results as prose, not raw JSON", async () => {
      (remoteClient.searchInstance as Mock).mockResolvedValue({
        accounts: [
          {
            id: "1",
            username: "alice",
            acct: "alice@example.social",
            display_name: "Alice",
            note: "<p>Hello world</p>",
            followers_count: 42,
            statuses_count: 100,
          },
        ],
        statuses: [],
        hashtags: [],
      });

      const tool = registeredTools.get("search");
      expect(tool).toBeDefined();

      const result = await tool?.handler({
        domain: "example.social",
        query: "test",
        type: "accounts",
      });

      const text = ((result as { content: { text: string }[] }).content[0].text ?? "") as string;

      // The bad behavior renders `{` `"id":` etc. — assert that's gone.
      expect(text).not.toMatch(/^\{\s*"/m); // no leading JSON object
      expect(text).not.toMatch(/^\s*\{\s*"accounts":/);
      // The good behavior renders something human-readable.
      expect(text).toContain("test");
      expect(text).toContain("example.social");
    });
  });

  describe("fetch-timeline renders all posts (M5)", () => {
    it("renders more than 10 posts when fetched", async () => {
      // Mock to return 25 posts
      const posts = Array.from({ length: 25 }, (_, i) => ({
        type: "Note",
        content: `Post ${i + 1}`,
        id: `post-${i + 1}`,
      }));

      (remoteClient.fetchActorOutboxPaginated as Mock).mockResolvedValue({
        items: posts,
        totalItems: 25,
        collectionId: "https://example.social/users/testuser/outbox",
        hasMore: false,
      });

      const tool = registeredTools.get("fetch-timeline");
      expect(tool).toBeDefined();

      const result = await tool?.handler({
        identifier: "user@example.social",
        limit: 25,
      });

      const text = ((result as { content: { text: string }[] }).content[0].text ?? "") as string;

      // The bad behavior renders only 10 lines. Assert at least 15 numbered posts.
      const numberedLines = text.match(/^\d+\. /gm) || [];
      expect(numberedLines.length).toBeGreaterThanOrEqual(15);

      // No "and N more posts" footer because we rendered everything.
      expect(text).not.toMatch(/\d+ more posts in this page/);
    });

    it("delivers post content inside the untrusted-content envelope", async () => {
      // Create a post with a 1000-char body — content should arrive intact inside the envelope
      const longContent = "x".repeat(1000);
      const posts = [
        {
          type: "Note",
          content: longContent,
          id: "post-1",
        },
      ];

      (remoteClient.fetchActorOutboxPaginated as Mock).mockResolvedValue({
        items: posts,
        totalItems: 1,
        collectionId: "https://example.social/users/testuser/outbox",
        hasMore: false,
      });

      const tool = registeredTools.get("fetch-timeline");
      expect(tool).toBeDefined();

      const result = await tool?.handler({
        identifier: "user@example.social",
        limit: 1,
      });

      const text = ((result as { content: { text: string }[] }).content[0].text ?? "") as string;

      // Content must be wrapped in the untrusted envelope
      expect(text).toContain("<untrusted-content");
      expect(text).toContain("</untrusted-content>");
      // All 1000 x's must be present inside the envelope
      expect(text).toMatch(/x{900,}/);
    });
  });

  describe("get-instance-software tool", () => {
    it("returns a prose success message for a valid instance", async () => {
      (getInstanceSoftware as Mock).mockResolvedValue({
        domain: "tools-success.social",
        detection: "success",
        software: { name: "mastodon", version: "4.3.2" },
        protocols: ["activitypub"],
        openRegistrations: false,
      });

      const tool = registeredTools.get("get-instance-software");
      expect(tool).toBeDefined();
      const result = await tool?.handler({ domain: "tools-success.social" });
      const text = (result as { content: { text: string }[] }).content[0].text;
      expect(text).toContain("mastodon");
      expect(text).toContain("4.3.2");
    });

    it("returns an unavailable prose message when detection fails", async () => {
      (getInstanceSoftware as Mock).mockResolvedValue({
        domain: "tools-fail.social",
        detection: "unavailable",
        software: null,
        protocols: null,
        openRegistrations: null,
        reason: "HTTP 404 Not Found",
      });

      const tool = registeredTools.get("get-instance-software");
      const result = await tool?.handler({ domain: "tools-fail.social" });
      const text = (result as { content: { text: string }[] }).content[0].text;
      expect(text).toMatch(/could not detect/i);
      expect((result as { isError?: boolean }).isError).toBeUndefined();
    });

    it("throws InvalidParams for an invalid domain", async () => {
      const tool = registeredTools.get("get-instance-software");
      await expect(tool?.handler({ domain: "not a domain" })).rejects.toThrow();
      expect(getInstanceSoftware).not.toHaveBeenCalled();
    });

    it("audit-logs success=true on a successful detection", async () => {
      (getInstanceSoftware as Mock).mockResolvedValue({
        domain: "audit-ok.social",
        detection: "success",
        software: { name: "mastodon", version: "4.3.2" },
        protocols: ["activitypub"],
        openRegistrations: false,
      });
      const auditSpy = vi.spyOn(auditLogger, "logToolInvocation").mockImplementation(() => {});

      const tool = registeredTools.get("get-instance-software");
      await tool?.handler({ domain: "audit-ok.social" });

      expect(auditSpy).toHaveBeenCalledWith(
        "get-instance-software",
        { domain: "audit-ok.social" },
        expect.objectContaining({ success: true }),
      );
      auditSpy.mockRestore();
    });

    it("audit-logs success=false when detection is unavailable", async () => {
      (getInstanceSoftware as Mock).mockResolvedValue({
        domain: "audit-bad.social",
        detection: "unavailable",
        software: null,
        protocols: null,
        openRegistrations: null,
        reason: "HTTP 404 Not Found",
      });
      const auditSpy = vi.spyOn(auditLogger, "logToolInvocation").mockImplementation(() => {});

      const tool = registeredTools.get("get-instance-software");
      await tool?.handler({ domain: "audit-bad.social" });

      expect(auditSpy).toHaveBeenCalledWith(
        "get-instance-software",
        { domain: "audit-bad.social" },
        expect.objectContaining({ success: false }),
      );
      auditSpy.mockRestore();
    });
  });
});
