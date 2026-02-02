/**
 * Unit tests for the RemoteActivityPubClient class.
 */

import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { RemoteActivityPubClient } from "../../src/remote-client.js";
import { server } from "../mocks/server.js";

describe("RemoteActivityPubClient", () => {
  let client: RemoteActivityPubClient;

  beforeEach(() => {
    client = new RemoteActivityPubClient();
  });

  describe("fetchRemoteActor", () => {
    it("should fetch an actor by identifier", async () => {
      const actor = await client.fetchRemoteActor("testuser@example.social");

      expect(actor.id).toBe("https://example.social/users/testuser");
      expect(actor.preferredUsername).toBe("testuser");
      expect(actor.name).toBe("Test User");
    });

    it("should throw on invalid identifier", async () => {
      await expect(client.fetchRemoteActor("invalid")).rejects.toThrow();
    });

    it("should throw when actor not found", async () => {
      server.use(
        http.get("https://notfound.social/.well-known/webfinger", () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      await expect(client.fetchRemoteActor("user@notfound.social")).rejects.toThrow();
    });
  });

  describe("fetchActorOutbox", () => {
    it("should fetch actor outbox/timeline", async () => {
      const outbox = await client.fetchActorOutbox("testuser@example.social");

      expect(outbox.type).toBe("OrderedCollection");
      expect(outbox.totalItems).toBe(42);
      expect(outbox.orderedItems).toHaveLength(2);
    });

    it("should respect limit parameter", async () => {
      const outbox = await client.fetchActorOutbox("testuser@example.social", 10);

      expect(outbox.type).toBe("OrderedCollection");
    });

    it("should throw on invalid limit (too low)", async () => {
      await expect(client.fetchActorOutbox("testuser@example.social", 0)).rejects.toThrow(
        "Limit must be between 1 and 100",
      );
    });

    it("should throw on invalid limit (too high)", async () => {
      await expect(client.fetchActorOutbox("testuser@example.social", 101)).rejects.toThrow(
        "Limit must be between 1 and 100",
      );
    });

    it("should throw when actor has no outbox", async () => {
      server.use(
        http.get("https://nooutbox.social/.well-known/webfinger", () => {
          return HttpResponse.json({
            subject: "acct:user@nooutbox.social",
            links: [
              {
                rel: "self",
                type: "application/activity+json",
                href: "https://nooutbox.social/users/user",
              },
            ],
          });
        }),
        http.get("https://nooutbox.social/users/user", () => {
          // Actor schema requires outbox, so missing outbox fails schema validation
          return HttpResponse.json({
            id: "https://nooutbox.social/users/user",
            type: "Person",
            inbox: "https://nooutbox.social/users/user/inbox",
            // No outbox - will fail schema validation
          });
        }),
      );

      // Should throw due to schema validation failure (outbox is required)
      await expect(client.fetchActorOutbox("user@nooutbox.social")).rejects.toThrow();
    });
  });

  describe("fetchActorFollowers", () => {
    it("should throw when actor has no followers collection", async () => {
      server.use(
        http.get("https://nofollowers.social/.well-known/webfinger", () => {
          return HttpResponse.json({
            subject: "acct:user@nofollowers.social",
            links: [
              {
                rel: "self",
                type: "application/activity+json",
                href: "https://nofollowers.social/users/user",
              },
            ],
          });
        }),
        http.get("https://nofollowers.social/users/user", () => {
          return HttpResponse.json({
            id: "https://nofollowers.social/users/user",
            type: "Person",
            inbox: "https://nofollowers.social/users/user/inbox",
            outbox: "https://nofollowers.social/users/user/outbox",
            // No followers!
          });
        }),
      );

      await expect(client.fetchActorFollowers("user@nofollowers.social")).rejects.toThrow(
        "has no followers collection",
      );
    });
  });

  describe("fetchActorFollowing", () => {
    it("should throw when actor has no following collection", async () => {
      server.use(
        http.get("https://nofollowing.social/.well-known/webfinger", () => {
          return HttpResponse.json({
            subject: "acct:user@nofollowing.social",
            links: [
              {
                rel: "self",
                type: "application/activity+json",
                href: "https://nofollowing.social/users/user",
              },
            ],
          });
        }),
        http.get("https://nofollowing.social/users/user", () => {
          return HttpResponse.json({
            id: "https://nofollowing.social/users/user",
            type: "Person",
            inbox: "https://nofollowing.social/users/user/inbox",
            outbox: "https://nofollowing.social/users/user/outbox",
            // No following!
          });
        }),
      );

      await expect(client.fetchActorFollowing("user@nofollowing.social")).rejects.toThrow(
        "has no following collection",
      );
    });
  });

  describe("getInstanceInfo", () => {
    it("should fetch instance information", async () => {
      const info = await client.getInstanceInfo("example.social");

      expect(info.domain).toBe("example.social");
      expect(info.software).toBeDefined();
    });

    it("should cache instance information", async () => {
      const info1 = await client.getInstanceInfo("example.social");
      const info2 = await client.getInstanceInfo("example.social");

      expect(info1).toEqual(info2);
    });

    it("should throw on invalid domain", async () => {
      await expect(client.getInstanceInfo("invalid")).rejects.toThrow();
    });

    it("should throw on localhost", async () => {
      await expect(client.getInstanceInfo("localhost")).rejects.toThrow(/Invalid domain format/);
    });

    it("should throw when all endpoints fail", async () => {
      server.use(
        http.get("https://failing.social/api/v1/instance", () => {
          return new HttpResponse(null, { status: 500 });
        }),
        http.get("https://failing.social/api/meta", () => {
          return new HttpResponse(null, { status: 500 });
        }),
        http.get("https://failing.social/nodeinfo/2.0", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      await expect(client.getInstanceInfo("failing.social")).rejects.toThrow(
        "Failed to fetch instance information",
      );
    });

    it("should handle Misskey instances", async () => {
      server.use(
        http.get("https://misskey.social/api/v1/instance", () => {
          return new HttpResponse(null, { status: 404 });
        }),
        http.get("https://misskey.social/api/meta", () => {
          return HttpResponse.json({
            version: "13.0.0",
            description: "A Misskey instance",
          });
        }),
        http.get("https://misskey.social/nodeinfo/2.0", () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const info = await client.getInstanceInfo("misskey.social");
      expect(info.software).toBe("misskey");
    });

    it("should handle NodeInfo response", async () => {
      server.use(
        http.get("https://nodeinfo.social/api/v1/instance", () => {
          return new HttpResponse(null, { status: 404 });
        }),
        http.get("https://nodeinfo.social/api/meta", () => {
          return new HttpResponse(null, { status: 404 });
        }),
        http.get("https://nodeinfo.social/nodeinfo/2.0", () => {
          return HttpResponse.json({
            software: {
              name: "pleroma",
              version: "2.5.0",
            },
            metadata: {
              nodeDescription: "A Pleroma instance",
            },
          });
        }),
      );

      const info = await client.getInstanceInfo("nodeinfo.social");
      expect(info.software).toBe("pleroma");
    });
  });

  describe("searchInstance", () => {
    it("should search instance for accounts", async () => {
      const results = await client.searchInstance("example.social", "test", "accounts");

      expect(results).toBeDefined();
    });

    it("should search instance for statuses", async () => {
      const results = await client.searchInstance("example.social", "hello", "statuses");

      expect(results).toBeDefined();
    });

    it("should search instance for hashtags", async () => {
      const results = await client.searchInstance("example.social", "fediverse", "hashtags");

      expect(results).toBeDefined();
    });

    it("should throw on invalid domain", async () => {
      await expect(client.searchInstance("invalid", "test", "accounts")).rejects.toThrow();
    });

    it("should throw on search error", async () => {
      server.use(
        http.get("https://searchfail.social/api/v2/search", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      await expect(
        client.searchInstance("searchfail.social", "test", "accounts"),
      ).rejects.toThrow();
    });
  });

  describe("fetchObject", () => {
    it("should fetch an ActivityPub object by URL", async () => {
      server.use(
        http.get("https://example.social/users/testuser/statuses/1", () => {
          return HttpResponse.json({
            id: "https://example.social/users/testuser/statuses/1",
            type: "Note",
            content: "<p>Test post</p>",
            attributedTo: "https://example.social/users/testuser",
          });
        }),
      );

      const object = await client.fetchObject("https://example.social/users/testuser/statuses/1");

      expect(object.id).toBe("https://example.social/users/testuser/statuses/1");
      expect(object.type).toBe("Note");
    });

    it("should throw on fetch error", async () => {
      server.use(
        http.get("https://example.social/notfound", () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      await expect(client.fetchObject("https://example.social/notfound")).rejects.toThrow();
    });
  });

  describe("SSRF protection", () => {
    it("should block requests to private IPs via domain validation", async () => {
      // Private IP addresses fail because all fetch attempts are blocked
      // The error message will be about failing to fetch instance information
      // because the SSRF protection blocks the requests
      await expect(client.getInstanceInfo("10.0.0.1")).rejects.toThrow();
    });

    it("should block requests to localhost", async () => {
      // localhost fails domain validation (no TLD)
      await expect(client.getInstanceInfo("localhost")).rejects.toThrow(/Invalid domain format/);
    });

    it("should block requests to internal hostnames", async () => {
      // Internal hostnames like .local pass domain schema validation
      // but are blocked by SSRF protection during fetch
      await expect(client.getInstanceInfo("myserver.local")).rejects.toThrow();
    });
  });

  describe("retry logic", () => {
    it("should retry outbox fetch on transient failures", async () => {
      let outboxAttempts = 0;

      server.use(
        // WebFinger succeeds immediately
        http.get("https://retry.social/.well-known/webfinger", () => {
          return HttpResponse.json({
            subject: "acct:user@retry.social",
            links: [
              {
                rel: "self",
                type: "application/activity+json",
                href: "https://retry.social/users/user",
              },
            ],
          });
        }),
        // Actor fetch succeeds
        http.get("https://retry.social/users/user", () => {
          return HttpResponse.json({
            id: "https://retry.social/users/user",
            type: "Person",
            preferredUsername: "user",
            inbox: "https://retry.social/users/user/inbox",
            outbox: "https://retry.social/users/user/outbox",
          });
        }),
        // Outbox fetch fails twice, succeeds on third attempt
        http.get("https://retry.social/users/user/outbox", () => {
          outboxAttempts++;
          if (outboxAttempts < 3) {
            return new HttpResponse(null, { status: 503 });
          }
          return HttpResponse.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            id: "https://retry.social/users/user/outbox",
            type: "OrderedCollection",
            totalItems: 10,
            orderedItems: [],
          });
        }),
      );

      const outbox = await client.fetchActorOutbox("user@retry.social");
      expect(outbox.id).toBe("https://retry.social/users/user/outbox");
      expect(outboxAttempts).toBe(3);
    });
  });
});
