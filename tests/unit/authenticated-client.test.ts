/**
 * Tests for AuthenticatedClient
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { AuthenticatedClient } from "../../src/auth/authenticated-client.js";
import { accountManager } from "../../src/auth/account-manager.js";

// Mock logtape
vi.mock("@logtape/logtape", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock account manager
vi.mock("../../src/auth/account-manager.js", () => ({
  accountManager: {
    getActiveAccount: vi.fn(),
    getAccount: vi.fn(),
    hasAccounts: vi.fn().mockReturnValue(true),
    accountCount: 1,
  },
}));

// Mock utils
vi.mock("../../src/utils.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

// Create MSW server
const server = setupServer();

// Mock account credentials
const mockAccount = {
  id: "test-account",
  instance: "example.social",
  accessToken: "test-token",
  tokenType: "Bearer",
  username: "testuser",
  scopes: ["read", "write"],
  isActive: true,
};

describe("AuthenticatedClient", () => {
  let client: AuthenticatedClient;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "bypass" });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AuthenticatedClient();
    // Setup default account mock
    vi.mocked(accountManager.getActiveAccount).mockReturnValue(mockAccount);
    vi.mocked(accountManager.getAccount).mockReturnValue(mockAccount);
    server.resetHandlers();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("isWriteEnabled", () => {
    it("should return true when active account exists", () => {
      expect(client.isWriteEnabled()).toBe(true);
    });

    it("should return false when no accounts", () => {
      vi.mocked(accountManager.hasAccounts).mockReturnValue(false);
      expect(client.isWriteEnabled()).toBe(false);
    });
  });

  describe("getWriteStatus", () => {
    it("should return enabled status with active account", () => {
      vi.mocked(accountManager.hasAccounts).mockReturnValue(true);
      const status = client.getWriteStatus();
      expect(status.enabled).toBe(true);
      expect(status.activeAccount).not.toBeNull();
    });

    it("should return disabled status when no accounts", () => {
      vi.mocked(accountManager.getActiveAccount).mockReturnValue(undefined);
      vi.mocked(accountManager.hasAccounts).mockReturnValue(false);
      const status = client.getWriteStatus();
      expect(status.enabled).toBe(false);
      // activeAccount can be null or undefined when disabled
      expect(status.activeAccount).toBeFalsy();
    });
  });

  describe("createPost", () => {
    it("should create a post successfully", async () => {
      const mockStatus = {
        id: "post-123",
        uri: "https://example.social/statuses/post-123",
        url: "https://example.social/@testuser/post-123",
        created_at: "2024-01-01T00:00:00Z",
        content: "<p>Hello world</p>",
        visibility: "public",
        sensitive: false,
        spoiler_text: "",
        reblogs_count: 0,
        favourites_count: 0,
        replies_count: 0,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          display_name: "Test User",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses", () => {
          return HttpResponse.json(mockStatus);
        }),
      );

      const result = await client.createPost({ content: "Hello world" });
      expect(result.id).toBe("post-123");
      expect(result.content).toContain("Hello world");
    });

    it("should throw when no active account", async () => {
      vi.mocked(accountManager.getActiveAccount).mockReturnValue(undefined);
      vi.mocked(accountManager.getAccount).mockReturnValue(undefined);

      await expect(client.createPost({ content: "Test" })).rejects.toThrow(
        "No authenticated account configured",
      );
    });

    it("should handle API errors", async () => {
      server.use(
        http.post("https://example.social/api/v1/statuses", () => {
          return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }),
      );

      await expect(client.createPost({ content: "Test" })).rejects.toThrow();
    });

    it("should create a post with all options", async () => {
      const mockStatus = {
        id: "post-456",
        uri: "https://example.social/statuses/post-456",
        url: "https://example.social/@testuser/post-456",
        created_at: "2024-01-01T00:00:00Z",
        content: "<p>Test with options</p>",
        visibility: "unlisted",
        sensitive: true,
        spoiler_text: "CW: test",
        reblogs_count: 0,
        favourites_count: 0,
        replies_count: 0,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          display_name: "Test User",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses", () => {
          return HttpResponse.json(mockStatus);
        }),
      );

      const result = await client.createPost({
        content: "Test with options",
        visibility: "unlisted",
        spoilerText: "CW: test",
        sensitive: true,
        language: "en",
      });
      expect(result.id).toBe("post-456");
      expect(result.visibility).toBe("unlisted");
    });

    it("should use specific account when accountId provided", async () => {
      const mockStatus = {
        id: "post-789",
        uri: "https://example.social/statuses/post-789",
        created_at: "2024-01-01T00:00:00Z",
        content: "<p>Test</p>",
        visibility: "public",
        sensitive: false,
        spoiler_text: "",
        reblogs_count: 0,
        favourites_count: 0,
        replies_count: 0,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses", () => {
          return HttpResponse.json(mockStatus);
        }),
      );

      const result = await client.createPost({ content: "Test" }, "test-account");
      expect(result.id).toBe("post-789");
      expect(accountManager.getAccount).toHaveBeenCalledWith("test-account");
    });
  });

  describe("deletePost", () => {
    it("should delete a post successfully", async () => {
      server.use(
        http.delete("https://example.social/api/v1/statuses/post-123", () => {
          return HttpResponse.json({});
        }),
      );

      await expect(client.deletePost("post-123")).resolves.not.toThrow();
    });
  });

  describe("boostPost", () => {
    it("should boost a post successfully", async () => {
      const mockReblog = {
        id: "reblog-123",
        uri: "https://example.social/statuses/reblog-123",
        url: "https://example.social/@testuser/reblog-123",
        created_at: "2024-01-01T00:00:00Z",
        content: "",
        visibility: "public",
        sensitive: false,
        spoiler_text: "",
        reblogs_count: 1,
        favourites_count: 0,
        replies_count: 0,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses/post-123/reblog", () => {
          return HttpResponse.json(mockReblog);
        }),
      );

      const result = await client.boostPost("post-123");
      expect(result.id).toBe("reblog-123");
    });
  });

  describe("unboostPost", () => {
    it("should unboost a post successfully", async () => {
      const mockStatus = {
        id: "post-123",
        uri: "https://example.social/statuses/post-123",
        url: "https://example.social/@testuser/post-123",
        created_at: "2024-01-01T00:00:00Z",
        content: "<p>Test</p>",
        visibility: "public",
        sensitive: false,
        spoiler_text: "",
        reblogs_count: 0,
        favourites_count: 0,
        replies_count: 0,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses/post-123/unreblog", () => {
          return HttpResponse.json(mockStatus);
        }),
      );

      const result = await client.unboostPost("post-123");
      expect(result.id).toBe("post-123");
    });
  });

  describe("favouritePost", () => {
    it("should favourite a post successfully", async () => {
      const mockStatus = {
        id: "post-123",
        uri: "https://example.social/statuses/post-123",
        url: "https://example.social/@testuser/post-123",
        created_at: "2024-01-01T00:00:00Z",
        content: "<p>Test</p>",
        visibility: "public",
        sensitive: false,
        spoiler_text: "",
        reblogs_count: 0,
        favourites_count: 1,
        replies_count: 0,
        favourited: true,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses/post-123/favourite", () => {
          return HttpResponse.json(mockStatus);
        }),
      );

      const result = await client.favouritePost("post-123");
      expect(result.id).toBe("post-123");
    });
  });

  describe("unfavouritePost", () => {
    it("should unfavourite a post successfully", async () => {
      const mockStatus = {
        id: "post-123",
        uri: "https://example.social/statuses/post-123",
        url: "https://example.social/@testuser/post-123",
        created_at: "2024-01-01T00:00:00Z",
        content: "<p>Test</p>",
        visibility: "public",
        sensitive: false,
        spoiler_text: "",
        reblogs_count: 0,
        favourites_count: 0,
        replies_count: 0,
        favourited: false,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses/post-123/unfavourite", () => {
          return HttpResponse.json(mockStatus);
        }),
      );

      const result = await client.unfavouritePost("post-123");
      expect(result.id).toBe("post-123");
    });
  });

  describe("bookmarkPost", () => {
    it("should bookmark a post successfully", async () => {
      const mockStatus = {
        id: "post-123",
        uri: "https://example.social/statuses/post-123",
        url: "https://example.social/@testuser/post-123",
        created_at: "2024-01-01T00:00:00Z",
        content: "<p>Test</p>",
        visibility: "public",
        sensitive: false,
        spoiler_text: "",
        reblogs_count: 0,
        favourites_count: 0,
        replies_count: 0,
        bookmarked: true,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses/post-123/bookmark", () => {
          return HttpResponse.json(mockStatus);
        }),
      );

      const result = await client.bookmarkPost("post-123");
      expect(result.id).toBe("post-123");
    });
  });

  describe("unbookmarkPost", () => {
    it("should unbookmark a post successfully", async () => {
      const mockStatus = {
        id: "post-123",
        uri: "https://example.social/statuses/post-123",
        url: "https://example.social/@testuser/post-123",
        created_at: "2024-01-01T00:00:00Z",
        content: "<p>Test</p>",
        visibility: "public",
        sensitive: false,
        spoiler_text: "",
        reblogs_count: 0,
        favourites_count: 0,
        replies_count: 0,
        bookmarked: false,
        account: {
          id: "1",
          username: "testuser",
          acct: "testuser",
          url: "https://example.social/@testuser",
        },
      };

      server.use(
        http.post("https://example.social/api/v1/statuses/post-123/unbookmark", () => {
          return HttpResponse.json(mockStatus);
        }),
      );

      const result = await client.unbookmarkPost("post-123");
      expect(result.id).toBe("post-123");
    });
  });

  describe("lookupAccount", () => {
    it("should lookup an account by acct", async () => {
      const mockAccount = {
        id: "123",
        username: "otheruser",
        acct: "otheruser@other.social",
        display_name: "Other User",
        url: "https://other.social/@otheruser",
      };

      server.use(
        http.get("https://example.social/api/v1/accounts/lookup", () => {
          return HttpResponse.json(mockAccount);
        }),
      );

      const result = await client.lookupAccount("otheruser@other.social");
      expect(result.id).toBe("123");
      expect(result.acct).toBe("otheruser@other.social");
    });
  });

  describe("followAccount", () => {
    it("should follow an account successfully", async () => {
      const mockRelationship = {
        id: "123",
        following: true,
        followed_by: false,
        blocking: false,
        blocked_by: false,
        muting: false,
        muting_notifications: false,
        requested: false,
        domain_blocking: false,
        endorsed: false,
      };

      server.use(
        http.post("https://example.social/api/v1/accounts/123/follow", () => {
          return HttpResponse.json(mockRelationship);
        }),
      );

      const result = await client.followAccount("123");
      expect(result.following).toBe(true);
    });

    it("should follow with options", async () => {
      const mockRelationship = {
        id: "123",
        following: true,
        followed_by: false,
        blocking: false,
        blocked_by: false,
        muting: false,
        muting_notifications: false,
        requested: false,
        domain_blocking: false,
        endorsed: false,
      };

      server.use(
        http.post("https://example.social/api/v1/accounts/123/follow", () => {
          return HttpResponse.json(mockRelationship);
        }),
      );

      const result = await client.followAccount("123", { reblogs: false, notify: true });
      expect(result.following).toBe(true);
    });
  });

  describe("unfollowAccount", () => {
    it("should unfollow an account successfully", async () => {
      const mockRelationship = {
        id: "123",
        following: false,
        followed_by: false,
        blocking: false,
        blocked_by: false,
        muting: false,
        muting_notifications: false,
        requested: false,
        domain_blocking: false,
        endorsed: false,
      };

      server.use(
        http.post("https://example.social/api/v1/accounts/123/unfollow", () => {
          return HttpResponse.json(mockRelationship);
        }),
      );

      const result = await client.unfollowAccount("123");
      expect(result.following).toBe(false);
    });
  });

  describe("muteAccount", () => {
    it("should mute an account successfully", async () => {
      const mockRelationship = {
        id: "123",
        following: false,
        followed_by: false,
        blocking: false,
        blocked_by: false,
        muting: true,
        muting_notifications: true,
        requested: false,
        domain_blocking: false,
        endorsed: false,
      };

      server.use(
        http.post("https://example.social/api/v1/accounts/123/mute", () => {
          return HttpResponse.json(mockRelationship);
        }),
      );

      const result = await client.muteAccount("123");
      expect(result.muting).toBe(true);
    });

    it("should mute with options", async () => {
      const mockRelationship = {
        id: "123",
        following: false,
        followed_by: false,
        blocking: false,
        blocked_by: false,
        muting: true,
        muting_notifications: false,
        requested: false,
        domain_blocking: false,
        endorsed: false,
      };

      server.use(
        http.post("https://example.social/api/v1/accounts/123/mute", () => {
          return HttpResponse.json(mockRelationship);
        }),
      );

      const result = await client.muteAccount("123", { notifications: false, duration: 3600 });
      expect(result.muting).toBe(true);
    });
  });

  describe("unmuteAccount", () => {
    it("should unmute an account successfully", async () => {
      const mockRelationship = {
        id: "123",
        following: false,
        followed_by: false,
        blocking: false,
        blocked_by: false,
        muting: false,
        muting_notifications: false,
        requested: false,
        domain_blocking: false,
        endorsed: false,
      };

      server.use(
        http.post("https://example.social/api/v1/accounts/123/unmute", () => {
          return HttpResponse.json(mockRelationship);
        }),
      );

      const result = await client.unmuteAccount("123");
      expect(result.muting).toBe(false);
    });
  });

  describe("blockAccount", () => {
    it("should block an account successfully", async () => {
      const mockRelationship = {
        id: "123",
        following: false,
        followed_by: false,
        blocking: true,
        blocked_by: false,
        muting: false,
        muting_notifications: false,
        requested: false,
        domain_blocking: false,
        endorsed: false,
      };

      server.use(
        http.post("https://example.social/api/v1/accounts/123/block", () => {
          return HttpResponse.json(mockRelationship);
        }),
      );

      const result = await client.blockAccount("123");
      expect(result.blocking).toBe(true);
    });
  });

  describe("unblockAccount", () => {
    it("should unblock an account successfully", async () => {
      const mockRelationship = {
        id: "123",
        following: false,
        followed_by: false,
        blocking: false,
        blocked_by: false,
        muting: false,
        muting_notifications: false,
        requested: false,
        domain_blocking: false,
        endorsed: false,
      };

      server.use(
        http.post("https://example.social/api/v1/accounts/123/unblock", () => {
          return HttpResponse.json(mockRelationship);
        }),
      );

      const result = await client.unblockAccount("123");
      expect(result.blocking).toBe(false);
    });
  });

  describe("getRelationship", () => {
    it("should get relationship successfully", async () => {
      const mockRelationships = [
        {
          id: "123",
          following: true,
          followed_by: false,
          blocking: false,
          blocked_by: false,
          muting: false,
          muting_notifications: false,
          requested: false,
          domain_blocking: false,
          endorsed: false,
        },
      ];

      server.use(
        http.get("https://example.social/api/v1/accounts/relationships", () => {
          return HttpResponse.json(mockRelationships);
        }),
      );

      const result = await client.getRelationship("123");
      expect(result.following).toBe(true);
    });
  });

  describe("getHomeTimeline", () => {
    it("should get home timeline successfully", async () => {
      const mockStatuses = [
        {
          id: "post-1",
          uri: "https://example.social/statuses/post-1",
          created_at: "2024-01-01T00:00:00Z",
          content: "<p>Post 1</p>",
          visibility: "public",
          sensitive: false,
          spoiler_text: "",
          reblogs_count: 0,
          favourites_count: 0,
          replies_count: 0,
          account: {
            id: "1",
            username: "user1",
            acct: "user1",
            url: "https://example.social/@user1",
          },
        },
      ];

      server.use(
        http.get("https://example.social/api/v1/timelines/home", () => {
          return HttpResponse.json(mockStatuses);
        }),
      );

      const result = await client.getHomeTimeline();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("post-1");
    });

    it("should get home timeline with pagination options", async () => {
      const mockStatuses = [
        {
          id: "post-2",
          uri: "https://example.social/statuses/post-2",
          created_at: "2024-01-02T00:00:00Z",
          content: "<p>Post 2</p>",
          visibility: "public",
          sensitive: false,
          spoiler_text: "",
          reblogs_count: 0,
          favourites_count: 0,
          replies_count: 0,
          account: {
            id: "1",
            username: "user1",
            acct: "user1",
            url: "https://example.social/@user1",
          },
        },
      ];

      server.use(
        http.get("https://example.social/api/v1/timelines/home", () => {
          return HttpResponse.json(mockStatuses);
        }),
      );

      const result = await client.getHomeTimeline({ limit: 10, maxId: "post-1", sinceId: "post-0" });
      expect(result).toHaveLength(1);
    });
  });

  describe("getNotifications", () => {
    it("should get notifications successfully", async () => {
      const mockNotifications = [
        {
          id: "notif-1",
          type: "mention",
          created_at: "2024-01-01T00:00:00Z",
          account: {
            id: "2",
            username: "mentioner",
            acct: "mentioner",
            url: "https://example.social/@mentioner",
          },
          status: {
            id: "post-1",
            uri: "https://example.social/statuses/post-1",
            created_at: "2024-01-01T00:00:00Z",
            content: "<p>Hey @testuser</p>",
            visibility: "public",
            sensitive: false,
            spoiler_text: "",
            reblogs_count: 0,
            favourites_count: 0,
            replies_count: 0,
            account: {
              id: "2",
              username: "mentioner",
              acct: "mentioner",
              url: "https://example.social/@mentioner",
            },
          },
        },
      ];

      server.use(
        http.get("https://example.social/api/v1/notifications", () => {
          return HttpResponse.json(mockNotifications);
        }),
      );

      const result = await client.getNotifications();
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("mention");
    });

    it("should filter notifications by types", async () => {
      const mockNotifications = [
        {
          id: "notif-2",
          type: "follow",
          created_at: "2024-01-01T00:00:00Z",
          account: {
            id: "3",
            username: "follower",
            acct: "follower",
            url: "https://example.social/@follower",
          },
        },
      ];

      server.use(
        http.get("https://example.social/api/v1/notifications", () => {
          return HttpResponse.json(mockNotifications);
        }),
      );

      const result = await client.getNotifications({ types: ["follow", "favourite"] });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("follow");
    });
  });

  describe("getBookmarks", () => {
    it("should get bookmarks successfully", async () => {
      const mockStatuses = [
        {
          id: "post-1",
          uri: "https://example.social/statuses/post-1",
          created_at: "2024-01-01T00:00:00Z",
          content: "<p>Bookmarked post</p>",
          visibility: "public",
          sensitive: false,
          spoiler_text: "",
          reblogs_count: 0,
          favourites_count: 0,
          replies_count: 0,
          account: {
            id: "1",
            username: "user1",
            acct: "user1",
            url: "https://example.social/@user1",
          },
        },
      ];

      server.use(
        http.get("https://example.social/api/v1/bookmarks", () => {
          return HttpResponse.json(mockStatuses);
        }),
      );

      const result = await client.getBookmarks();
      expect(result).toHaveLength(1);
    });

    it("should get bookmarks with limit", async () => {
      const mockStatuses: unknown[] = [];

      server.use(
        http.get("https://example.social/api/v1/bookmarks", () => {
          return HttpResponse.json(mockStatuses);
        }),
      );

      const result = await client.getBookmarks({ limit: 5 });
      expect(result).toHaveLength(0);
    });
  });

  describe("getFavourites", () => {
    it("should get favourites successfully", async () => {
      const mockStatuses = [
        {
          id: "post-1",
          uri: "https://example.social/statuses/post-1",
          created_at: "2024-01-01T00:00:00Z",
          content: "<p>Favourited post</p>",
          visibility: "public",
          sensitive: false,
          spoiler_text: "",
          reblogs_count: 0,
          favourites_count: 0,
          replies_count: 0,
          account: {
            id: "1",
            username: "user1",
            acct: "user1",
            url: "https://example.social/@user1",
          },
        },
      ];

      server.use(
        http.get("https://example.social/api/v1/favourites", () => {
          return HttpResponse.json(mockStatuses);
        }),
      );

      const result = await client.getFavourites();
      expect(result).toHaveLength(1);
    });
  });

  describe("voteOnPoll", () => {
    it("should vote on a poll successfully", async () => {
      const mockPoll = {
        id: "poll-1",
        expires_at: "2024-12-31T23:59:59Z",
        expired: false,
        multiple: false,
        votes_count: 11,
        voters_count: 11,
        voted: true,
        own_votes: [0],
        options: [
          { title: "Option A", votes_count: 6 },
          { title: "Option B", votes_count: 5 },
        ],
      };

      server.use(
        http.post("https://example.social/api/v1/polls/poll-1/votes", () => {
          return HttpResponse.json(mockPoll);
        }),
      );

      const result = await client.voteOnPoll("poll-1", [0]);
      expect(result.voted).toBe(true);
      expect(result.own_votes).toContain(0);
    });
  });

  describe("getScheduledPosts", () => {
    it("should get scheduled posts successfully", async () => {
      const mockScheduled = [
        {
          id: "scheduled-1",
          scheduled_at: "2024-12-25T10:00:00Z",
          params: {
            text: "Scheduled post",
            visibility: "public",
          },
          media_attachments: [],
        },
      ];

      server.use(
        http.get("https://example.social/api/v1/scheduled_statuses", () => {
          return HttpResponse.json(mockScheduled);
        }),
      );

      const result = await client.getScheduledPosts();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("scheduled-1");
    });
  });

  describe("cancelScheduledPost", () => {
    it("should cancel a scheduled post successfully", async () => {
      server.use(
        http.delete("https://example.social/api/v1/scheduled_statuses/scheduled-1", () => {
          return HttpResponse.json({});
        }),
      );

      await expect(client.cancelScheduledPost("scheduled-1")).resolves.not.toThrow();
    });
  });

  describe("updateScheduledPost", () => {
    it("should update a scheduled post successfully", async () => {
      const mockScheduled = {
        id: "scheduled-1",
        scheduled_at: "2024-12-26T10:00:00Z",
        params: {
          text: "Scheduled post",
          visibility: "public",
        },
        media_attachments: [],
      };

      server.use(
        http.put("https://example.social/api/v1/scheduled_statuses/scheduled-1", () => {
          return HttpResponse.json(mockScheduled);
        }),
      );

      const result = await client.updateScheduledPost("scheduled-1", "2024-12-26T10:00:00Z");
      expect(result.scheduled_at).toBe("2024-12-26T10:00:00Z");
    });
  });
});
