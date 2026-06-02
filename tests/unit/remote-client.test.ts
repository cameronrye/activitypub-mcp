/**
 * Unit tests for the RemoteActivityPubClient class.
 */

import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteActivityPubClient } from "../../src/activitypub/remote-client.js";
import { server } from "../mocks/server.js";

// resolveAndPin (the SSRF pin) resolves fixture hosts via node:dns before
// fetching, and now fails closed when a host doesn't resolve. The fixture
// domains (example.social etc.) don't exist on the real resolver, so pin DNS to
// a public IP: the pinned fetch is then intercepted by MSW, which patches global
// fetch above undici's dispatcher. IP-literal/no-TLD SSRF tests (10.0.0.1,
// localhost) skip DNS, so they are unaffected by this mock.
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

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

  describe("fetchActorOutboxPaginated", () => {
    it("should fetch paginated outbox with default options", async () => {
      const result = await client.fetchActorOutboxPaginated("testuser@example.social");

      expect(result.items).toBeDefined();
      expect(result.collectionId).toBeDefined();
      expect(typeof result.hasMore).toBe("boolean");
    });

    it("should fetch paginated outbox with limit", async () => {
      const result = await client.fetchActorOutboxPaginated("testuser@example.social", {
        limit: 10,
      });

      expect(result.items).toBeDefined();
    });

    it("should handle cursor-based pagination", async () => {
      server.use(
        http.get("https://paginated.social/.well-known/webfinger", () => {
          return HttpResponse.json({
            subject: "acct:user@paginated.social",
            links: [
              {
                rel: "self",
                type: "application/activity+json",
                href: "https://paginated.social/users/user",
              },
            ],
          });
        }),
        http.get("https://paginated.social/users/user", () => {
          return HttpResponse.json({
            id: "https://paginated.social/users/user",
            type: "Person",
            preferredUsername: "user",
            inbox: "https://paginated.social/users/user/inbox",
            outbox: "https://paginated.social/users/user/outbox",
          });
        }),
        http.get("https://paginated.social/users/user/outbox", ({ request }) => {
          const url = new URL(request.url);
          const page = url.searchParams.get("page");

          if (page === "2") {
            return HttpResponse.json({
              id: "https://paginated.social/users/user/outbox?page=2",
              type: "OrderedCollectionPage",
              totalItems: 100,
              orderedItems: [{ type: "Note", content: "Page 2 post" }],
              prev: "https://paginated.social/users/user/outbox?page=1",
            });
          }

          return HttpResponse.json({
            id: "https://paginated.social/users/user/outbox",
            type: "OrderedCollection",
            totalItems: 100,
            first: "https://paginated.social/users/user/outbox?page=1",
            orderedItems: [{ type: "Note", content: "First post" }],
            next: "https://paginated.social/users/user/outbox?page=2",
          });
        }),
      );

      const result = await client.fetchActorOutboxPaginated("user@paginated.social");

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });

    it("should support minId parameter", async () => {
      const result = await client.fetchActorOutboxPaginated("testuser@example.social", {
        minId: "12345",
      });

      expect(result.items).toBeDefined();
    });

    it("should support maxId parameter", async () => {
      const result = await client.fetchActorOutboxPaginated("testuser@example.social", {
        maxId: "67890",
      });

      expect(result.items).toBeDefined();
    });

    it("should throw on invalid limit", async () => {
      await expect(
        client.fetchActorOutboxPaginated("testuser@example.social", { limit: 0 }),
      ).rejects.toThrow("Limit must be between 1 and 100");

      await expect(
        client.fetchActorOutboxPaginated("testuser@example.social", { limit: 101 }),
      ).rejects.toThrow("Limit must be between 1 and 100");
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

    it("accepts a single-string to/cc (AS2 allows a scalar IRI, not just an array)", async () => {
      server.use(
        http.get("https://as2.test/note", () => {
          return HttpResponse.json({
            id: "https://as2.test/note",
            type: "Note",
            content: "hello",
            // AS2 permits to/cc to be a single string, e.g. the public collection.
            to: "https://www.w3.org/ns/activitystreams#Public",
            cc: "https://as2.test/users/alice/followers",
          });
        }),
      );

      const object = await client.fetchObject("https://as2.test/note");
      expect(object.id).toBe("https://as2.test/note");
      expect(object.to).toBe("https://www.w3.org/ns/activitystreams#Public");
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

    it("does not retry a non-retryable status (404) — fails after a single attempt", async () => {
      let attempts = 0;
      server.use(
        http.get("https://noretry.test/object", () => {
          attempts++;
          return new HttpResponse(null, { status: 404 });
        }),
      );
      await expect(client.fetchObject("https://noretry.test/object")).rejects.toThrow();
      expect(attempts).toBe(1);
    });

    it("retries a 429 (honoring Retry-After) and then succeeds", async () => {
      let attempts = 0;
      server.use(
        http.get("https://ratelimited.test/object", () => {
          attempts++;
          if (attempts === 1) {
            return new HttpResponse(null, { status: 429, headers: { "Retry-After": "0" } });
          }
          return HttpResponse.json({ id: "https://ratelimited.test/object", type: "Note" });
        }),
      );
      const obj = await client.fetchObject("https://ratelimited.test/object");
      expect(obj.id).toBe("https://ratelimited.test/object");
      expect(attempts).toBe(2);
    });
  });
});

describe("extractNextCursor semantics (M12)", () => {
  let client: RemoteActivityPubClient;

  beforeEach(() => {
    client = new RemoteActivityPubClient();
  });

  it("returns hasMore=false when collection has neither items nor a next link", async () => {
    server.use(
      http.get("https://m12.test/.well-known/webfinger", () =>
        HttpResponse.json({
          subject: "acct:user@m12.test",
          links: [
            {
              rel: "self",
              type: "application/activity+json",
              href: "https://m12.test/users/user",
            },
          ],
        }),
      ),
      http.get("https://m12.test/users/user", () =>
        HttpResponse.json({
          id: "https://m12.test/users/user",
          type: "Person",
          preferredUsername: "user",
          inbox: "https://m12.test/users/user/inbox",
          outbox: "https://m12.test/users/user/outbox",
        }),
      ),
      http.get("https://m12.test/users/user/outbox", () =>
        HttpResponse.json({
          id: "https://m12.test/users/user/outbox",
          type: "OrderedCollection",
          totalItems: 0,
          // No orderedItems, no next, no first
        }),
      ),
    );

    const result = await client.fetchActorOutboxPaginated("user@m12.test");
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  it("follows `first` to data page when root has no items and no cursor was supplied", async () => {
    server.use(
      http.get("https://m12first.test/.well-known/webfinger", () =>
        HttpResponse.json({
          subject: "acct:user@m12first.test",
          links: [
            {
              rel: "self",
              type: "application/activity+json",
              href: "https://m12first.test/users/user",
            },
          ],
        }),
      ),
      http.get("https://m12first.test/users/user", () =>
        HttpResponse.json({
          id: "https://m12first.test/users/user",
          type: "Person",
          preferredUsername: "user",
          inbox: "https://m12first.test/users/user/inbox",
          outbox: "https://m12first.test/users/user/outbox",
        }),
      ),
      http.get("https://m12first.test/users/user/outbox", ({ request }) => {
        const url = new URL(request.url);
        // Only serve the root collection at the bare outbox URL (no page param)
        if (!url.searchParams.has("page")) {
          return HttpResponse.json({
            id: "https://m12first.test/users/user/outbox",
            type: "OrderedCollection",
            totalItems: 5,
            first: "https://m12first.test/users/user/outbox/page-1",
            // No orderedItems inline
          });
        }
        // Should not be called with page param in this test
        return new HttpResponse(null, { status: 404 });
      }),
    );

    const result = await client.fetchActorOutboxPaginated("user@m12first.test");
    // The root collection has no inline items but has `first`.
    // With the fix, nextCursor should be the first-page URL so the caller can descend.
    expect(result.nextCursor).toBe("https://m12first.test/users/user/outbox/page-1");
    expect(result.hasMore).toBe(true);
  });

  it("does NOT loop back to `first` once on a CollectionPage with no `next`", async () => {
    server.use(
      http.get("https://m12loop.test/.well-known/webfinger", () =>
        HttpResponse.json({
          subject: "acct:user@m12loop.test",
          links: [
            {
              rel: "self",
              type: "application/activity+json",
              href: "https://m12loop.test/users/user",
            },
          ],
        }),
      ),
      http.get("https://m12loop.test/users/user", () =>
        HttpResponse.json({
          id: "https://m12loop.test/users/user",
          type: "Person",
          preferredUsername: "user",
          inbox: "https://m12loop.test/users/user/inbox",
          outbox: "https://m12loop.test/users/user/outbox",
        }),
      ),
      http.get("https://m12loop.test/users/user/outbox/page-1", () =>
        HttpResponse.json({
          id: "https://m12loop.test/users/user/outbox/page-1",
          type: "OrderedCollectionPage",
          orderedItems: [{ type: "Note", content: "a post" }],
          // Has `first` pointing back to itself — no `next`
          first: "https://m12loop.test/users/user/outbox/page-1",
        }),
      ),
    );

    // Provide page-1 as the cursor (simulating "already on a data page")
    const result = await client.fetchActorOutboxPaginated("user@m12loop.test", {
      cursor: "https://m12loop.test/users/user/outbox/page-1",
    });
    // Should NOT return first as nextCursor — we're already on a page, no `next` means done
    expect(result.nextCursor).toBeUndefined();
    expect(result.hasMore).toBe(false);
  });
});

describe("RemoteActivityPubClient response size cap (M2)", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("aborts fetch when streamed body exceeds MAX_RESPONSE_SIZE without Content-Length", async () => {
    vi.resetModules();
    process.env = { ...originalEnv, MAX_RESPONSE_SIZE: "100" };
    const { RemoteActivityPubClient: Client } = await import(
      "../../src/activitypub/remote-client.js"
    );
    const { ResponseTooLargeError } = await import("../../src/utils/fetch-helpers.js");
    const huge = "x".repeat(500);
    server.use(
      http.get(
        "https://example.test/actor",
        () =>
          new HttpResponse(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode(JSON.stringify({ name: huge })));
                c.close();
              },
            }),
            { headers: { "Content-Type": "application/activity+json" } },
          ),
      ),
    );
    const client = new Client();
    await expect(client.fetchObject("https://example.test/actor")).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });
});

describe("fetchActorOutboxPaginated cursor vs id-filter (M1)", () => {
  let client: RemoteActivityPubClient;

  beforeEach(() => {
    client = new RemoteActivityPubClient();
  });

  it("preserves cursor query params and ignores caller-supplied maxId", async () => {
    let requestedUrl: string | null = null;
    server.use(
      http.get("https://a.test/.well-known/webfinger", () =>
        HttpResponse.json({
          subject: "acct:u@a.test",
          links: [
            {
              rel: "self",
              type: "application/activity+json",
              href: "https://a.test/users/u",
            },
          ],
        }),
      ),
      http.get("https://a.test/users/u", () =>
        HttpResponse.json({
          id: "https://a.test/users/u",
          type: "Person",
          preferredUsername: "u",
          inbox: "https://a.test/users/u/inbox",
          outbox: "https://a.test/users/u/outbox",
        }),
      ),
      http.get("https://a.test/users/u/outbox/page", ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
          id: "https://a.test/users/u/outbox/page",
          type: "OrderedCollectionPage",
          orderedItems: [],
        });
      }),
    );

    await client.fetchActorOutboxPaginated("u@a.test", {
      cursor: "https://a.test/users/u/outbox/page?max_id=X",
      maxId: "Y", // should be ignored
    });

    expect(requestedUrl).toContain("max_id=X");
    expect(requestedUrl).not.toContain("max_id=Y");
  });

  it("applies caller's maxId when no cursor is provided", async () => {
    let requestedUrl: string | null = null;
    server.use(
      http.get("https://a.test/.well-known/webfinger", () =>
        HttpResponse.json({
          subject: "acct:u@a.test",
          links: [
            {
              rel: "self",
              type: "application/activity+json",
              href: "https://a.test/users/u",
            },
          ],
        }),
      ),
      http.get("https://a.test/users/u", () =>
        HttpResponse.json({
          id: "https://a.test/users/u",
          type: "Person",
          preferredUsername: "u",
          inbox: "https://a.test/users/u/inbox",
          outbox: "https://a.test/users/u/outbox",
        }),
      ),
      http.get("https://a.test/users/u/outbox", ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
          id: "https://a.test/users/u/outbox",
          type: "OrderedCollection",
          orderedItems: [],
        });
      }),
    );

    await client.fetchActorOutboxPaginated("u@a.test", { maxId: "Y" });

    expect(requestedUrl).toContain("max_id=Y");
  });
});

describe("ETag 304 without cache (H4)", () => {
  it("re-fetches without If-None-Match when 304 comes back with no cache entry", async () => {
    let callCount = 0;
    server.use(
      http.get("https://a.test/object", ({ request }) => {
        callCount++;
        // First call: client sends some ETag (or none) — return 304 to simulate
        // the server insisting it's unchanged even though our cache is empty.
        if (callCount === 1) {
          return new HttpResponse(null, { status: 304 });
        }
        // Second call: client should retry without If-None-Match — return fresh data.
        if (request.headers.get("if-none-match") !== null) {
          // The retry should have stripped the If-None-Match header. If it's
          // still present, this test will fail (a real regression — we want
          // a clean retry).
          return new HttpResponse(null, { status: 304 });
        }
        return HttpResponse.json({ id: "https://a.test/object", type: "Note", content: "hi" });
      }),
    );
    const client = new RemoteActivityPubClient();
    const obj = await client.fetchObject("https://a.test/object");
    expect(obj.id).toBe("https://a.test/object");
    expect(callCount).toBe(2); // proves we did the retry
  });

  it("throws a clear error when 304 persists on unconditional re-fetch", async () => {
    let callCount = 0;
    server.use(
      http.get("https://stuck.test/object", () => {
        callCount++;
        // Always return 304 — even on the unconditional re-fetch
        return new HttpResponse(null, { status: 304 });
      }),
    );
    const client = new RemoteActivityPubClient();
    await expect(client.fetchObject("https://stuck.test/object")).rejects.toThrow(
      /misconfigured|304/i,
    );
    // The outer retry loop will still attempt; we just want to confirm the error message is informative.
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
