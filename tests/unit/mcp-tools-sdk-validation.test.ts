/**
 * Real-SDK output-validation smoke test (the safety net the Map-stub unit tests
 * cannot provide).
 *
 * The other tool tests stub `registerTool` into a Map and call handlers directly,
 * which bypasses the SDK's `validateToolOutput`. This test instantiates a REAL
 * `McpServer`, registers the tools, and invokes each of the 18 default tools
 * through the SDK request path via a `Client` over an in-memory transport. The
 * SDK validates every success return's `structuredContent` against the tool's
 * `outputSchema` — if a handler emits structuredContent that doesn't match its
 * schema, the SDK turns the result into an "Output validation error" tool error,
 * which this test asserts never happens.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/resilience/rate-limiter.js";

// --- Data-layer mocks (same shapes the Map-stub unit tests use) ------------

vi.mock("../../src/activitypub/remote-client.js", () => ({
  remoteClient: {
    fetchRemoteActor: vi.fn().mockResolvedValue({
      id: "https://example.social/users/testuser",
      preferredUsername: "testuser",
      name: "Test User",
      summary: "A test user",
      url: "https://example.social/@testuser",
      inbox: "https://example.social/users/testuser/inbox",
      outbox: "https://example.social/users/testuser/outbox",
      followers: "https://example.social/users/testuser/followers",
      following: "https://example.social/users/testuser/following",
    }),
    fetchActorOutboxPaginated: vi.fn().mockResolvedValue({
      items: [{ type: "Note", content: "Hello world", id: "1" }],
      totalItems: 1,
      collectionId: "https://example.social/users/testuser/outbox",
      hasMore: true,
      nextCursor: "cursor-123",
    }),
    searchInstance: vi.fn().mockResolvedValue({
      accounts: [{ acct: "user", username: "user", display_name: "User", followers_count: 10 }],
      statuses: [],
      hashtags: [],
    }),
    getInstanceInfo: vi.fn().mockResolvedValue({
      domain: "mastodon.social",
      software: "mastodon",
      version: "4.2.0",
      description: "A social network",
      languages: ["en"],
      registrations: true,
      approval_required: false,
      stats: { user_count: 1000000, status_count: 50000000, domain_count: 30000 },
    }),
    fetchTrendingHashtags: vi.fn().mockResolvedValue({
      hashtags: [{ name: "test", history: [{ uses: "100", accounts: "50" }] }],
    }),
    fetchTrendingPosts: vi.fn().mockResolvedValue({
      posts: [
        {
          id: "tp-1",
          content: "<p>Trending post</p>",
          account: { username: "user", acct: "user", display_name: "User" },
          favourites_count: 100,
          reblogs_count: 50,
          replies_count: 20,
        },
      ],
    }),
    fetchLocalTimeline: vi.fn().mockResolvedValue({ posts: [], hasMore: false }),
    fetchFederatedTimeline: vi.fn().mockResolvedValue({
      posts: [
        {
          id: "pt-1",
          content: "<p>Federated post</p>",
          spoiler_text: "",
          account: { username: "remoteuser", acct: "remoteuser" },
          favourites_count: 20,
          reblogs_count: 10,
          replies_count: 5,
        },
      ],
      hasMore: true,
      nextMaxId: "123",
    }),
    fetchPostThread: vi.fn().mockResolvedValue({
      post: {
        content: "Original post",
        id: "1",
        url: "https://example.social/1",
        published: "2024-01-01",
      },
      ancestors: [],
      replies: [{ content: "A reply", id: "2" }],
      totalReplies: 1,
    }),
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

vi.mock("../../src/auth/index.js", () => ({
  accountManager: {
    listAccounts: vi.fn().mockReturnValue([
      {
        id: "1",
        username: "testuser",
        instance: "example.social",
        isActive: true,
        label: "Test",
        scopes: ["read", "write"],
      },
    ]),
    getActiveAccount: vi
      .fn()
      .mockReturnValue({ id: "1", username: "testuser", instance: "example.social" }),
    getAccount: vi
      .fn()
      .mockReturnValue({ id: "1", username: "testuser", instance: "example.social" }),
    setActiveAccount: vi.fn().mockReturnValue(true),
    verifyAccount: vi.fn().mockResolvedValue({
      id: "1",
      username: "testuser",
      acct: "testuser@example.social",
      display_name: "Test User",
      url: "https://example.social/@testuser",
      followers_count: 100,
      following_count: 50,
      statuses_count: 200,
    }),
  },
  authenticatedClient: {
    hasAuthenticatedAccount: vi.fn().mockReturnValue(true),
    getWriteStatus: vi.fn().mockReturnValue({
      enabled: true,
      activeAccount: { id: "1", username: "testuser", instance: "example.social" },
    }),
    getHomeTimeline: vi.fn().mockResolvedValue([
      {
        id: "post-1",
        content: "<p>Hello world</p>",
        spoiler_text: "",
        favourites_count: 5,
        reblogs_count: 2,
        replies_count: 1,
        account: { acct: "user@example.social" },
      },
    ]),
    getNotifications: vi.fn().mockResolvedValue([
      {
        type: "mention",
        account: { acct: "mentioner@example.social" },
        status: { content: "<p>Hey @testuser</p>" },
      },
    ]),
    getBookmarks: vi.fn().mockResolvedValue([
      {
        id: "bookmark-1",
        content: "<p>Bookmarked post</p>",
        account: { acct: "poster@example.social" },
      },
    ]),
    getFavourites: vi.fn().mockResolvedValue([
      {
        id: "fav-1",
        content: "<p>Favourited post</p>",
        account: { acct: "poster@example.social" },
      },
    ]),
    lookupAccount: vi
      .fn()
      .mockResolvedValue({ id: "target-123", acct: "targetuser@example.social" }),
    getRelationship: vi.fn().mockResolvedValue({
      following: true,
      followed_by: false,
      requested: false,
      blocking: false,
      blocked_by: false,
      muting: false,
      muting_notifications: false,
      domain_blocking: false,
      endorsed: false,
      note: "",
    }),
    getScheduledPosts: vi.fn().mockResolvedValue([
      {
        id: "scheduled-1",
        scheduled_at: "2099-12-25T10:00:00Z",
        params: { text: "Scheduled post content", visibility: "public" },
        media_attachments: [],
      },
    ]),
  },
}));

vi.mock("../../src/audit/logger.js", () => ({
  auditLogger: { logToolInvocation: vi.fn() },
}));

vi.mock("@logtape/logtape", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { registerTools } from "../../src/mcp/tools.js";

// The 18 default tools and an argument set that reaches each success path.
const DEFAULT_TOOL_CALLS: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: "discover-actor", args: { identifier: "testuser@example.social" } },
  { name: "fetch-timeline", args: { identifier: "testuser@example.social", limit: 20 } },
  { name: "get-post-thread", args: { postUrl: "https://example.social/@user/123" } },
  { name: "search", args: { query: "test" } },
  { name: "get-trending-hashtags", args: { domain: "mastodon.social", limit: 10 } },
  { name: "get-trending-posts", args: { domain: "mastodon.social" } },
  { name: "get-public-timeline", args: { domain: "mastodon.social", scope: "federated" } },
  { name: "get-instance-info", args: { domain: "mastodon.social" } },
  { name: "discover-instances", args: { limit: 10 } },
  { name: "list-accounts", args: {} },
  { name: "switch-account", args: { accountId: "1" } },
  { name: "verify-account", args: {} },
  { name: "get-home-timeline", args: {} },
  { name: "get-notifications", args: {} },
  { name: "get-bookmarks", args: {} },
  { name: "get-favourites", args: {} },
  { name: "get-relationship", args: { acct: "targetuser@example.social" } },
  { name: "get-scheduled-posts", args: {} },
];

describe("real SDK output validation (default tools)", () => {
  let server: McpServer;
  let client: Client;
  let rateLimiter: RateLimiter;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new McpServer({ name: "activitypub-mcp-test", version: "0.0.0" });
    rateLimiter = new RateLimiter({ enabled: false, maxRequests: 1000, windowMs: 60000 });
    // Writes are OFF (default) → only the 18 default tools register.
    registerTools(server, rateLimiter);

    client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    rateLimiter.stop();
    await client.close();
    await server.close();
  });

  it("registers exactly the 18 default tools when writes are off", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(tools.length).toBe(18);
    expect(names).toEqual(DEFAULT_TOOL_CALLS.map((c) => c.name).sort());
  });

  it("every default tool returns SDK-valid structuredContent (no output-validation error)", async () => {
    for (const { name, args } of DEFAULT_TOOL_CALLS) {
      const result = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        structuredContent?: unknown;
        content?: Array<{ type: string; text?: string }>;
      };

      const firstText = result.content?.[0]?.text ?? "";
      // The SDK converts an outputSchema mismatch into a tool error whose text
      // begins with "Output validation error". That must never happen.
      expect(firstText, `tool ${name} must not fail SDK output validation`).not.toContain(
        "Output validation error",
      );
      expect(result.isError, `tool ${name} must succeed`).toBeFalsy();
      // A declared outputSchema means the SDK also requires structuredContent.
      expect(result.structuredContent, `tool ${name} must emit structuredContent`).toBeDefined();
    }
  });
});
