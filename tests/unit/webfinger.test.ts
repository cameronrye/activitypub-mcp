/**
 * Unit tests for the WebFingerClient class.
 */

import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { WebFingerClient } from "../../src/webfinger.js";
import { server } from "../mocks/server.js";

describe("WebFingerClient", () => {
  let client: WebFingerClient;

  beforeEach(() => {
    client = new WebFingerClient();
  });

  describe("discoverActor", () => {
    it("should discover an actor by identifier", async () => {
      const actor = await client.discoverActor("testuser@example.social");

      expect(actor.id).toBe("https://example.social/users/testuser");
      expect(actor.type).toBe("Person");
      expect(actor.preferredUsername).toBe("testuser");
      expect(actor.name).toBe("Test User");
      expect(actor.inbox).toBe("https://example.social/users/testuser/inbox");
      expect(actor.outbox).toBe("https://example.social/users/testuser/outbox");
    });

    it("should handle identifier with leading @", async () => {
      const actor = await client.discoverActor("@testuser@example.social");

      expect(actor.id).toBe("https://example.social/users/testuser");
      expect(actor.preferredUsername).toBe("testuser");
    });

    it("should cache actor responses", async () => {
      // First request
      const actor1 = await client.discoverActor("testuser@example.social");

      // Second request should hit cache
      const actor2 = await client.discoverActor("testuser@example.social");

      expect(actor1).toEqual(actor2);

      const stats = client.getCacheStats();
      expect(stats.actorEntries).toBe(1);
    });

    it("should throw on invalid identifier format", async () => {
      await expect(client.discoverActor("invalid")).rejects.toThrow("Invalid identifier format");
    });

    it("should throw on identifier too short", async () => {
      await expect(client.discoverActor("a@")).rejects.toThrow();
    });

    it("should throw when WebFinger returns 404", async () => {
      server.use(
        http.get("https://notfound.social/.well-known/webfinger", () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      await expect(client.discoverActor("user@notfound.social")).rejects.toThrow(
        "WebFinger lookup failed: 404",
      );
    });

    it("should throw when no ActivityPub link found", async () => {
      server.use(
        http.get("https://nolink.social/.well-known/webfinger", () => {
          return HttpResponse.json({
            subject: "acct:user@nolink.social",
            links: [
              {
                rel: "http://webfinger.net/rel/profile-page",
                type: "text/html",
                href: "https://nolink.social/@user",
              },
            ],
          });
        }),
      );

      await expect(client.discoverActor("user@nolink.social")).rejects.toThrow(
        "No ActivityPub actor URL found",
      );
    });

    it("should throw when actor fetch fails", async () => {
      server.use(
        http.get("https://actorfail.social/.well-known/webfinger", () => {
          return HttpResponse.json({
            subject: "acct:user@actorfail.social",
            links: [
              {
                rel: "self",
                type: "application/activity+json",
                href: "https://actorfail.social/users/user",
              },
            ],
          });
        }),
        http.get("https://actorfail.social/users/user", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      await expect(client.discoverActor("user@actorfail.social")).rejects.toThrow(
        "Failed to fetch actor: 500",
      );
    });

    it("should block SSRF attempts to localhost", async () => {
      await expect(client.discoverActor("user@localhost")).rejects.toThrow(/not allowed|Invalid/);
    });

    it("should block SSRF attempts to private IPs", async () => {
      await expect(client.discoverActor("user@192.168.1.1")).rejects.toThrow(/not allowed|Invalid/);
    });
  });

  describe("clearCache", () => {
    it("should clear all cached data", async () => {
      // Populate cache
      await client.discoverActor("testuser@example.social");

      let stats = client.getCacheStats();
      expect(stats.webfingerEntries).toBeGreaterThan(0);
      expect(stats.actorEntries).toBeGreaterThan(0);

      // Clear cache
      client.clearCache();

      stats = client.getCacheStats();
      expect(stats.webfingerEntries).toBe(0);
      expect(stats.actorEntries).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return initial empty stats", () => {
      const stats = client.getCacheStats();
      expect(stats.webfingerEntries).toBe(0);
      expect(stats.actorEntries).toBe(0);
    });

    it("should track cached entries", async () => {
      await client.discoverActor("testuser@example.social");

      const stats = client.getCacheStats();
      expect(stats.webfingerEntries).toBe(1);
      expect(stats.actorEntries).toBe(1);
    });
  });

  describe("identifier normalization", () => {
    it("should normalize identifiers with leading @", async () => {
      // Both should result in the same cache entry
      await client.discoverActor("@testuser@example.social");
      await client.discoverActor("testuser@example.social");

      // Should only have one cache entry since they normalize to the same key
      const stats = client.getCacheStats();
      expect(stats.actorEntries).toBe(1);
    });
  });
});
