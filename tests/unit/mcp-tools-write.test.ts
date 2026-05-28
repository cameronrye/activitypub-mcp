/**
 * Tests for MCP write tool handlers
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { z } from "zod";
import { registerWriteTools } from "../../src/mcp/tools-write.js";
import { RateLimiter } from "../../src/server/rate-limiter.js";

// Mock dependencies
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
    isWriteEnabled: vi.fn().mockReturnValue(true),
    getWriteStatus: vi.fn().mockReturnValue({
      enabled: true,
      activeAccount: {
        id: "1",
        username: "testuser",
        instance: "example.social",
        isActive: true,
        label: "Test User",
        scopes: ["read", "write"],
      },
    }),
    createPost: vi.fn().mockResolvedValue({
      id: "status-1",
      content: "<p>Test post</p>",
      url: "https://example.social/@testuser/status-1",
      uri: "https://example.social/statuses/status-1",
      visibility: "public",
      spoiler_text: "",
      account: { username: "testuser" },
    }),
    deletePost: vi.fn().mockResolvedValue({}),
    boostPost: vi.fn().mockResolvedValue({
      id: "boost-1",
      url: "https://example.social/@testuser/boost-1",
      uri: "https://example.social/statuses/boost-1",
      account: { username: "testuser" },
    }),
    unboostPost: vi.fn().mockResolvedValue({}),
    favouritePost: vi.fn().mockResolvedValue({
      id: "status-1",
      url: "https://example.social/@testuser/status-1",
      uri: "https://example.social/statuses/status-1",
      account: { username: "poster" },
    }),
    unfavouritePost: vi.fn().mockResolvedValue({}),
    bookmarkPost: vi.fn().mockResolvedValue({
      id: "status-1",
      url: "https://example.social/@poster/status-1",
      uri: "https://example.social/statuses/status-1",
      account: { username: "poster" },
    }),
    unbookmarkPost: vi.fn().mockResolvedValue({}),
    lookupAccount: vi
      .fn()
      .mockResolvedValue({ id: "target-123", acct: "targetuser@example.social" }),
    followAccount: vi.fn().mockResolvedValue({ following: true, requested: false }),
    unfollowAccount: vi.fn().mockResolvedValue({ following: false }),
    muteAccount: vi.fn().mockResolvedValue({ muting: true }),
    unmuteAccount: vi.fn().mockResolvedValue({ muting: false }),
    blockAccount: vi.fn().mockResolvedValue({ blocking: true }),
    unblockAccount: vi.fn().mockResolvedValue({ blocking: false }),
    // Return arrays for these methods, not objects
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
    voteOnPoll: vi.fn().mockResolvedValue({
      id: "poll-1",
      options: [
        { title: "Option A", votes_count: 10 },
        { title: "Option B", votes_count: 5 },
      ],
      votes_count: 15,
      voters_count: 15,
      own_votes: [0],
      expired: false,
      expires_at: "2024-12-31T23:59:59Z",
    }),
    uploadMedia: vi.fn().mockResolvedValue({
      id: "media-1",
      type: "image",
      url: "https://example.social/media/image.jpg",
      description: "Test image",
    }),
    getScheduledPosts: vi.fn().mockResolvedValue([]),
    cancelScheduledPost: vi.fn().mockResolvedValue({}),
    updateScheduledPost: vi.fn().mockResolvedValue({
      id: "scheduled-1",
      scheduled_at: "2024-12-25T10:00:00Z",
    }),
  },
}));

vi.mock("../../src/performance-monitor.js", () => ({
  performanceMonitor: {
    startRequest: vi.fn().mockReturnValue("req-123"),
    endRequest: vi.fn(),
  },
}));

const auditLoggerMock = vi.hoisted(() => ({
  logToolInvocation: vi.fn(),
}));
vi.mock("../../src/audit/logger.js", () => ({
  auditLogger: auditLoggerMock,
}));

vi.mock("@logtape/logtape", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { accountManager, authenticatedClient } from "../../src/auth/index.js";

describe("MCP Write Tools", () => {
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
    registerWriteTools(mcpServer, rateLimiter);
  });

  afterEach(() => {
    rateLimiter.stop();
  });

  describe("registerWriteTools", () => {
    it("should register all expected write tools", () => {
      const expectedTools = [
        "list-accounts",
        "switch-account",
        "verify-account",
        "post-status",
        "reply-to-post",
        "delete-post",
        "boost-post",
        "unboost-post",
        "favourite-post",
        "unfavourite-post",
        "bookmark-post",
        "unbookmark-post",
        "follow-account",
        "unfollow-account",
        "mute-account",
        "unmute-account",
        "block-account",
        "unblock-account",
        "get-home-timeline",
        "get-notifications",
        "get-bookmarks",
        "get-favourites",
        "get-relationship",
        "vote-on-poll",
        "upload-media",
        "get-scheduled-posts",
        "cancel-scheduled-post",
        "update-scheduled-post",
      ];

      for (const toolName of expectedTools) {
        expect(registeredTools.has(toolName), `Tool ${toolName} should be registered`).toBe(true);
      }
    });
  });

  describe("list-accounts tool", () => {
    it("should list configured accounts", async () => {
      const tool = registeredTools.get("list-accounts");
      expect(tool).toBeDefined();

      const result = await tool?.handler({});
      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Configured Accounts",
      );
      expect(accountManager.listAccounts).toHaveBeenCalled();
    });

    it("should show no accounts message when empty", async () => {
      (accountManager.listAccounts as Mock).mockReturnValueOnce([]);

      const tool = registeredTools.get("list-accounts");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "No Accounts Configured",
      );
    });
  });

  describe("switch-account tool", () => {
    it("should switch active account", async () => {
      const tool = registeredTools.get("switch-account");
      const result = await tool?.handler({ accountId: "1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Account Switched",
      );
      expect(accountManager.setActiveAccount).toHaveBeenCalledWith("1");
    });

    it("should handle account not found", async () => {
      (accountManager.setActiveAccount as Mock).mockReturnValueOnce(false);

      const tool = registeredTools.get("switch-account");
      const result = await tool?.handler({ accountId: "nonexistent" });

      expect((result as { isError: boolean }).isError).toBe(true);
      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Account Not Found",
      );
    });
  });

  describe("verify-account tool", () => {
    it("should verify credentials", async () => {
      const tool = registeredTools.get("verify-account");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Account Verified",
      );
      expect(accountManager.verifyAccount).toHaveBeenCalled();
    });

    it("should handle write not enabled", async () => {
      (authenticatedClient.isWriteEnabled as Mock).mockReturnValueOnce(false);

      const tool = registeredTools.get("verify-account");
      await expect(tool?.handler({})).rejects.toThrow("Write operations require authentication");
    });

    it("should handle verification failure", async () => {
      (accountManager.verifyAccount as Mock).mockResolvedValueOnce(null);

      const tool = registeredTools.get("verify-account");
      const result = await tool?.handler({});

      expect((result as { isError: boolean }).isError).toBe(true);
      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Verification Failed",
      );
    });
  });

  describe("post-status tool", () => {
    it("should post a status", async () => {
      const tool = registeredTools.get("post-status");
      const result = await tool?.handler({ content: "Hello world!" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Post Created");
      expect(authenticatedClient.createPost).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      (authenticatedClient.createPost as Mock).mockRejectedValueOnce(new Error("Post failed"));

      const tool = registeredTools.get("post-status");
      const result = await tool?.handler({ content: "Test" });

      expect((result as { isError: boolean }).isError).toBe(true);
    });
  });

  describe("reply-to-post tool", () => {
    it("should reply to a post", async () => {
      const tool = registeredTools.get("reply-to-post");
      const result = await tool?.handler({ statusId: "status-1", content: "Great post!" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Reply Posted");
      expect(authenticatedClient.createPost).toHaveBeenCalled();
    });
  });

  describe("delete-post tool", () => {
    it("should delete a post", async () => {
      const tool = registeredTools.get("delete-post");
      const result = await tool?.handler({ statusId: "status-1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Post Deleted");
      expect(authenticatedClient.deletePost).toHaveBeenCalled();
    });
  });

  describe("boost-post tool", () => {
    it("should boost a post", async () => {
      const tool = registeredTools.get("boost-post");
      const result = await tool?.handler({ statusId: "status-1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Post Boosted");
      expect(authenticatedClient.boostPost).toHaveBeenCalled();
    });
  });

  describe("unboost-post tool", () => {
    it("should unboost a post", async () => {
      const tool = registeredTools.get("unboost-post");
      const result = await tool?.handler({ statusId: "status-1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Boost Removed",
      );
      expect(authenticatedClient.unboostPost).toHaveBeenCalled();
    });
  });

  describe("favourite-post tool", () => {
    it("should favourite a post", async () => {
      const tool = registeredTools.get("favourite-post");
      const result = await tool?.handler({ statusId: "status-1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Post Favourited",
      );
      expect(authenticatedClient.favouritePost).toHaveBeenCalled();
    });
  });

  describe("unfavourite-post tool", () => {
    it("should unfavourite a post", async () => {
      const tool = registeredTools.get("unfavourite-post");
      const result = await tool?.handler({ statusId: "status-1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Favourite Removed",
      );
      expect(authenticatedClient.unfavouritePost).toHaveBeenCalled();
    });
  });

  describe("bookmark-post tool", () => {
    it("should bookmark a post", async () => {
      const tool = registeredTools.get("bookmark-post");
      const result = await tool?.handler({ statusId: "status-1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Post Bookmarked",
      );
      expect(authenticatedClient.bookmarkPost).toHaveBeenCalled();
    });
  });

  describe("unbookmark-post tool", () => {
    it("should unbookmark a post", async () => {
      const tool = registeredTools.get("unbookmark-post");
      const result = await tool?.handler({ statusId: "status-1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Bookmark Removed",
      );
      expect(authenticatedClient.unbookmarkPost).toHaveBeenCalled();
    });
  });

  describe("follow-account tool", () => {
    it("should follow an account", async () => {
      const tool = registeredTools.get("follow-account");
      const result = await tool?.handler({ acct: "targetuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Now following",
      );
      expect(authenticatedClient.lookupAccount).toHaveBeenCalled();
      expect(authenticatedClient.followAccount).toHaveBeenCalled();
    });

    it("should handle follow request pending", async () => {
      (authenticatedClient.followAccount as Mock).mockResolvedValueOnce({
        following: false,
        requested: true,
      });

      const tool = registeredTools.get("follow-account");
      const result = await tool?.handler({ acct: "targetuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Follow request sent",
      );
    });
  });

  describe("unfollow-account tool", () => {
    it("should unfollow an account", async () => {
      const tool = registeredTools.get("unfollow-account");
      const result = await tool?.handler({ acct: "targetuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Unfollowed");
      expect(authenticatedClient.lookupAccount).toHaveBeenCalled();
      expect(authenticatedClient.unfollowAccount).toHaveBeenCalled();
    });
  });

  describe("mute-account tool", () => {
    it("should mute an account", async () => {
      const tool = registeredTools.get("mute-account");
      const result = await tool?.handler({ acct: "targetuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Muted");
      expect(authenticatedClient.lookupAccount).toHaveBeenCalled();
      expect(authenticatedClient.muteAccount).toHaveBeenCalled();
    });
  });

  describe("unmute-account tool", () => {
    it("should unmute an account", async () => {
      const tool = registeredTools.get("unmute-account");
      const result = await tool?.handler({ acct: "targetuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Unmuted");
      expect(authenticatedClient.lookupAccount).toHaveBeenCalled();
      expect(authenticatedClient.unmuteAccount).toHaveBeenCalled();
    });
  });

  describe("block-account tool", () => {
    it("should block an account", async () => {
      const tool = registeredTools.get("block-account");
      const result = await tool?.handler({ acct: "targetuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Blocked");
      expect(authenticatedClient.lookupAccount).toHaveBeenCalled();
      expect(authenticatedClient.blockAccount).toHaveBeenCalled();
    });
  });

  describe("unblock-account tool", () => {
    it("should unblock an account", async () => {
      const tool = registeredTools.get("unblock-account");
      const result = await tool?.handler({ acct: "targetuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Unblocked");
      expect(authenticatedClient.lookupAccount).toHaveBeenCalled();
      expect(authenticatedClient.unblockAccount).toHaveBeenCalled();
    });
  });

  describe("get-home-timeline tool", () => {
    it("should get home timeline", async () => {
      const tool = registeredTools.get("get-home-timeline");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Home Timeline",
      );
      expect(authenticatedClient.getHomeTimeline).toHaveBeenCalled();
    });
  });

  describe("get-notifications tool", () => {
    it("should get notifications", async () => {
      const tool = registeredTools.get("get-notifications");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Notifications",
      );
      expect(authenticatedClient.getNotifications).toHaveBeenCalled();
    });
  });

  describe("get-bookmarks tool", () => {
    it("should get bookmarks", async () => {
      const tool = registeredTools.get("get-bookmarks");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Bookmarks");
      expect(authenticatedClient.getBookmarks).toHaveBeenCalled();
    });
  });

  describe("get-favourites tool", () => {
    it("should get favourites", async () => {
      const tool = registeredTools.get("get-favourites");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Favourites");
      expect(authenticatedClient.getFavourites).toHaveBeenCalled();
    });
  });

  describe("get-relationship tool", () => {
    it("should get relationship", async () => {
      const tool = registeredTools.get("get-relationship");
      const result = await tool?.handler({ acct: "targetuser@example.social" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain("Relationship");
      expect(authenticatedClient.lookupAccount).toHaveBeenCalled();
      expect(authenticatedClient.getRelationship).toHaveBeenCalled();
    });
  });

  describe("vote-on-poll tool", () => {
    it("should vote on a poll", async () => {
      const tool = registeredTools.get("vote-on-poll");
      const result = await tool?.handler({ pollId: "poll-1", choices: [0] });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Vote Recorded",
      );
      expect(authenticatedClient.voteOnPoll).toHaveBeenCalled();
    });
  });

  describe("upload-media tool", () => {
    it("should handle file not found gracefully", async () => {
      const tool = registeredTools.get("upload-media");
      const result = await tool?.handler({ filePath: "/nonexistent/file.jpg" });

      // Should return error result, not throw
      expect((result as { isError: boolean }).isError).toBe(true);
      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Failed to upload media",
      );
    });
  });

  describe("get-scheduled-posts tool", () => {
    it("should get scheduled posts (empty)", async () => {
      const tool = registeredTools.get("get-scheduled-posts");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Scheduled Posts",
      );
      expect(authenticatedClient.getScheduledPosts).toHaveBeenCalled();
    });

    it("should list scheduled posts when present", async () => {
      (authenticatedClient.getScheduledPosts as Mock).mockResolvedValueOnce([
        {
          id: "scheduled-1",
          scheduled_at: "2024-12-25T10:00:00Z",
          params: { text: "Scheduled post content", visibility: "public" },
          media_attachments: [],
        },
      ]);

      const tool = registeredTools.get("get-scheduled-posts");
      const result = await tool?.handler({});

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Scheduled Posts",
      );
      expect((result as { content: { text: string }[] }).content[0].text).toContain("scheduled-1");
    });
  });

  describe("cancel-scheduled-post tool", () => {
    it("should cancel a scheduled post", async () => {
      const tool = registeredTools.get("cancel-scheduled-post");
      const result = await tool?.handler({ scheduledPostId: "scheduled-1" });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Scheduled Post Canceled",
      );
      expect(authenticatedClient.cancelScheduledPost).toHaveBeenCalled();
    });
  });

  describe("update-scheduled-post tool", () => {
    it("should update a scheduled post", async () => {
      const tool = registeredTools.get("update-scheduled-post");
      const result = await tool?.handler({
        scheduledPostId: "scheduled-1",
        scheduledAt: "2024-12-26T10:00:00Z",
      });

      expect((result as { content: { text: string }[] }).content[0].text).toContain(
        "Scheduled Post Updated",
      );
      expect(authenticatedClient.updateScheduledPost).toHaveBeenCalled();
    });
  });

  describe("post manipulation tool audit logging (L2)", () => {
    it("reply-to-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("reply-to-post");
      expect(tool).toBeDefined();
      await tool?.handler({ statusId: "status-1", content: "ok" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "reply-to-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("delete-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("delete-post");
      expect(tool).toBeDefined();
      await tool?.handler({ statusId: "status-1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "delete-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("boost-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("boost-post");
      expect(tool).toBeDefined();
      await tool?.handler({ statusId: "status-1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "boost-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("unboost-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("unboost-post");
      expect(tool).toBeDefined();
      await tool?.handler({ statusId: "status-1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "unboost-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("favourite-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("favourite-post");
      expect(tool).toBeDefined();
      await tool?.handler({ statusId: "status-1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "favourite-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("unfavourite-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("unfavourite-post");
      expect(tool).toBeDefined();
      await tool?.handler({ statusId: "status-1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "unfavourite-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("bookmark-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("bookmark-post");
      expect(tool).toBeDefined();
      await tool?.handler({ statusId: "status-1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "bookmark-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("unbookmark-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("unbookmark-post");
      expect(tool).toBeDefined();
      await tool?.handler({ statusId: "status-1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "unbookmark-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });
  });

  describe("account relationship tool audit logging (L2)", () => {
    it("switch-account: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("switch-account");
      expect(tool).toBeDefined();
      await tool?.handler({ accountId: "1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "switch-account",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("verify-account: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("verify-account");
      expect(tool).toBeDefined();
      await tool?.handler({});
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "verify-account",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("follow-account: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("follow-account");
      expect(tool).toBeDefined();
      await tool?.handler({ acct: "u@example.social" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "follow-account",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("unfollow-account: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("unfollow-account");
      expect(tool).toBeDefined();
      await tool?.handler({ acct: "u@example.social" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "unfollow-account",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("mute-account: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("mute-account");
      expect(tool).toBeDefined();
      await tool?.handler({ acct: "u@example.social" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "mute-account",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("unmute-account: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("unmute-account");
      expect(tool).toBeDefined();
      await tool?.handler({ acct: "u@example.social" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "unmute-account",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("block-account: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("block-account");
      expect(tool).toBeDefined();
      await tool?.handler({ acct: "u@example.social" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "block-account",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("unblock-account: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("unblock-account");
      expect(tool).toBeDefined();
      await tool?.handler({ acct: "u@example.social" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "unblock-account",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("get-relationship: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("get-relationship");
      expect(tool).toBeDefined();
      await tool?.handler({ acct: "u@example.social" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "get-relationship",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });
  });

  describe("media/poll/timeline tool audit logging (L2)", () => {
    it("upload-media: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("upload-media");
      expect(tool).toBeDefined();
      await tool?.handler({ filePath: "/Users/cameron/Developer/activitypub-mcp/package.json" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "upload-media",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("vote-on-poll: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("vote-on-poll");
      expect(tool).toBeDefined();
      await tool?.handler({ pollId: "poll-1", choices: [0] });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "vote-on-poll",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("get-home-timeline: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("get-home-timeline");
      expect(tool).toBeDefined();
      await tool?.handler({});
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "get-home-timeline",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("get-notifications: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("get-notifications");
      expect(tool).toBeDefined();
      await tool?.handler({});
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "get-notifications",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("get-bookmarks: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("get-bookmarks");
      expect(tool).toBeDefined();
      await tool?.handler({});
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "get-bookmarks",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("get-favourites: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("get-favourites");
      expect(tool).toBeDefined();
      await tool?.handler({});
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "get-favourites",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("get-scheduled-posts: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("get-scheduled-posts");
      expect(tool).toBeDefined();
      await tool?.handler({});
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "get-scheduled-posts",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("cancel-scheduled-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("cancel-scheduled-post");
      expect(tool).toBeDefined();
      await tool?.handler({ scheduledPostId: "scheduled-1" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "cancel-scheduled-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });

    it("update-scheduled-post: calls auditLogger.logToolInvocation on success", async () => {
      auditLoggerMock.logToolInvocation.mockClear();
      const tool = registeredTools.get("update-scheduled-post");
      expect(tool).toBeDefined();
      await tool?.handler({ scheduledPostId: "scheduled-1", scheduledAt: "2099-01-01T00:00:00Z" });
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "update-scheduled-post",
        expect.anything(),
        expect.objectContaining({ success: true }),
      );
    });
  });

  describe("post-status audit logging (L2)", () => {
    beforeEach(() => {
      auditLoggerMock.logToolInvocation.mockClear();
    });

    it("calls auditLogger.logToolInvocation on success", async () => {
      const tool = registeredTools.get("post-status");
      expect(tool).toBeDefined();
      const result = await tool?.handler({ content: "hi" });
      expect((result as { isError?: boolean }).isError).toBeFalsy();
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "post-status",
        expect.objectContaining({ content: "hi" }),
        expect.objectContaining({ success: true }),
      );
    });

    it("calls auditLogger.logToolInvocation on failure (no account)", async () => {
      // Force the "no account configured" branch
      const { accountManager } = await import("../../src/auth/index.js");
      (accountManager.getActiveAccount as Mock).mockReturnValueOnce(undefined);
      (accountManager.getAccount as Mock).mockReturnValueOnce(undefined);

      const tool = registeredTools.get("post-status");
      const result = await tool?.handler({ content: "hi" });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(auditLoggerMock.logToolInvocation).toHaveBeenCalledWith(
        "post-status",
        expect.objectContaining({ content: "hi" }),
        expect.objectContaining({ success: false }),
      );
    });
  });

  describe("post-status mediaIds and scheduledAt (H2)", () => {
    beforeEach(() => {
      auditLoggerMock.logToolInvocation.mockClear();
      (authenticatedClient.createPost as Mock).mockClear();
    });

    it("passes mediaIds through to authenticatedClient.createPost", async () => {
      const tool = registeredTools.get("post-status");
      expect(tool).toBeDefined();
      await tool?.handler({ content: "look at this", mediaIds: ["m1", "m2"] });
      expect(authenticatedClient.createPost).toHaveBeenCalledWith(
        expect.objectContaining({ content: "look at this", mediaIds: ["m1", "m2"] }),
        undefined,
      );
    });

    it("passes scheduledAt through to authenticatedClient.createPost", async () => {
      const tool = registeredTools.get("post-status");
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await tool?.handler({ content: "later", scheduledAt: future });
      expect(authenticatedClient.createPost).toHaveBeenCalledWith(
        expect.objectContaining({ content: "later", scheduledAt: future }),
        undefined,
      );
    });

    it("rejects scheduledAt in the past via Zod refinement", () => {
      // The handler is invoked directly, bypassing the SDK's Zod wrapper.
      // We exercise the schema explicitly to prove bad input is rejected.
      const tool = registeredTools.get("post-status");
      const inputSchemaShape = (
        tool?.config as { inputSchema: Record<string, import("zod").ZodTypeAny> }
      ).inputSchema;
      const schema = z.object(inputSchemaShape);
      const past = "2020-01-01T00:00:00Z";
      expect(() => schema.parse({ content: "no time machine", scheduledAt: past })).toThrow(
        /scheduledAt|future|past/i,
      );
    });

    it("rejects more than 4 mediaIds via Zod max(4)", () => {
      // Same approach: validate directly against the schema shape.
      const tool = registeredTools.get("post-status");
      const inputSchemaShape = (
        tool?.config as { inputSchema: Record<string, import("zod").ZodTypeAny> }
      ).inputSchema;
      const schema = z.object(inputSchemaShape);
      expect(() =>
        schema.parse({ content: "too much", mediaIds: ["a", "b", "c", "d", "e"] }),
      ).toThrow(/4|max/i);
    });
  });

  describe("get-relationship strict schema (H3a)", () => {
    it("rejects accountIds with a helpful error even when acct is supplied", () => {
      const tool = registeredTools.get("get-relationship");
      expect(tool).toBeDefined();
      const inputSchemaShape = (
        tool?.config as { inputSchema: Record<string, import("zod").ZodTypeAny> }
      ).inputSchema;
      const schema = z.object(inputSchemaShape);
      // accountIds is the wrong field name — schema should reject it even when acct is present
      expect(() => schema.parse({ acct: "alice@example.social", accountIds: ["1", "2"] })).toThrow(
        /acct|never|expected|invalid/i,
      );
    });

    it("accepts the documented acct field", async () => {
      const tool = registeredTools.get("get-relationship");
      const result = await tool?.handler({ acct: "user@example.social" });
      expect(result).toBeDefined();
    });
  });

  describe("scheduled-post rename to scheduledPostId (H3b)", () => {
    beforeEach(() => {
      auditLoggerMock.logToolInvocation.mockClear();
      (authenticatedClient.cancelScheduledPost as Mock).mockClear();
      (authenticatedClient.updateScheduledPost as Mock).mockClear();
    });

    it("cancel-scheduled-post accepts scheduledPostId (new name)", async () => {
      const tool = registeredTools.get("cancel-scheduled-post");
      expect(tool).toBeDefined();
      await tool?.handler({ scheduledPostId: "sched-1" });
      expect(authenticatedClient.cancelScheduledPost).toHaveBeenCalledWith("sched-1", undefined);
    });

    it("update-scheduled-post accepts scheduledPostId (new name)", async () => {
      const tool = registeredTools.get("update-scheduled-post");
      await tool?.handler({
        scheduledPostId: "sched-1",
        scheduledAt: "2099-01-01T00:00:00Z",
      });
      expect(authenticatedClient.updateScheduledPost).toHaveBeenCalledWith(
        "sched-1",
        "2099-01-01T00:00:00Z",
        undefined,
      );
    });

    it("rejects legacy scheduledId with a helpful error", async () => {
      const tool = registeredTools.get("cancel-scheduled-post");
      const schema = z.object(tool?.config.inputSchema as Record<string, z.ZodTypeAny>);
      expect(() =>
        schema.parse({ scheduledId: "sched-1" } as unknown as { scheduledPostId: string }),
      ).toThrow(/scheduledPostId|scheduledId|renamed|unrecognized/i);
    });

    it("update-scheduled-post: rejects past scheduledAt", () => {
      const tool = registeredTools.get("update-scheduled-post");
      const schema = z.object((tool?.config?.inputSchema ?? {}) as Record<string, z.ZodTypeAny>);
      expect(() =>
        schema.parse({ scheduledPostId: "x", scheduledAt: "2020-01-01T00:00:00Z" }),
      ).toThrow(/future|past/i);
    });
  });
});
