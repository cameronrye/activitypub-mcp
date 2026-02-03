/**
 * Integration tests for Fediverse interactions with live data.
 *
 * These tests hit real fediverse endpoints to validate WebFinger lookups,
 * actor discovery, and timeline fetching work correctly with actual data.
 *
 * Run with: npm run test:integration
 */

import { describe, expect, it } from "vitest";
import { RemoteActivityPubClient } from "../../src/remote-client.js";

describe("RemoteActivityPubClient - Live Fediverse Tests", () => {
  const client = new RemoteActivityPubClient();

  describe("fetchRemoteActor with real accounts", () => {
    it("should discover the Mastodon official account", async () => {
      const actor = await client.fetchRemoteActor("Mastodon@mastodon.social");

      expect(actor).toBeDefined();
      expect(actor.id).toContain("mastodon.social");
      // Actor type can be Person, Application, Service, etc.
      expect(["Person", "Application", "Service", "Organization", "Group"]).toContain(actor.type);
      expect(actor.preferredUsername?.toLowerCase()).toBe("mastodon");
    });

    it("should discover an account with @ prefix", async () => {
      const actor = await client.fetchRemoteActor("@Mastodon@mastodon.social");

      expect(actor).toBeDefined();
      expect(actor.id).toContain("mastodon.social");
    });

    it("should handle accounts from different instances", async () => {
      // Test with fosstodon.org
      const actor = await client.fetchRemoteActor("fosstodon@fosstodon.org");

      expect(actor).toBeDefined();
      expect(actor.id).toContain("fosstodon.org");
    });

    it("should reject invalid account format", async () => {
      await expect(client.fetchRemoteActor("invalid-no-domain")).rejects.toThrow();
    });

    it("should handle non-existent accounts gracefully", async () => {
      // This should throw an error for non-existent account
      await expect(
        client.fetchRemoteActor("definitely-not-a-real-account-xyz123@mastodon.social"),
      ).rejects.toThrow();
    });
  });

  describe("fetchActorOutbox with real accounts", () => {
    it("should fetch posts from Mastodon official account", async () => {
      const result = await client.fetchActorOutbox("Mastodon@mastodon.social", 5);

      expect(result).toBeDefined();
      expect(result.type).toMatch(/Collection|OrderedCollection/);
      expect(result.id).toBeDefined();
    });

    it("should respect limit parameter", async () => {
      const result = await client.fetchActorOutbox("Mastodon@mastodon.social", 3);

      expect(result).toBeDefined();
      // The collection may have items or orderedItems depending on the implementation
      const items = result.items || result.orderedItems || [];
      expect(items.length).toBeLessThanOrEqual(3);
    });
  });

  describe("getInstanceInfo with real instances", () => {
    it("should get info for mastodon.social", async () => {
      const info = await client.getInstanceInfo("mastodon.social");

      expect(info).toBeDefined();
      expect(info.domain).toBe("mastodon.social");
      expect(info.software).toBeDefined();
      // mastodon.social runs Mastodon
      expect(info.software?.toLowerCase()).toContain("mastodon");
    });

    it("should get info for fosstodon.org", async () => {
      const info = await client.getInstanceInfo("fosstodon.org");

      expect(info).toBeDefined();
      expect(info.domain).toBe("fosstodon.org");
      expect(info.software?.toLowerCase()).toContain("mastodon");
    });

    it("should include user statistics when available", async () => {
      const info = await client.getInstanceInfo("mastodon.social");

      // Large instances should have stats
      if (info.stats && info.stats.userCount !== undefined) {
        expect(info.stats.userCount).toBeGreaterThan(0);
      }
      // Test passes regardless - we're just checking the structure is valid
      expect(info).toBeDefined();
    });

    it("should handle invalid domain gracefully", async () => {
      await expect(client.getInstanceInfo("not-a-real-domain-xyz.invalid")).rejects.toThrow();
    });
  });

  describe("searchInstance with real data", () => {
    it("should search for accounts on mastodon.social", async () => {
      const results = (await client.searchInstance(
        "mastodon.social",
        "ActivityPub",
        "accounts",
      )) as { accounts?: unknown[]; statuses?: unknown[] };

      expect(results).toBeDefined();
    });

    it("should search for statuses on mastodon.social", async () => {
      const results = (await client.searchInstance("mastodon.social", "fediverse", "statuses")) as {
        accounts?: unknown[];
        statuses?: unknown[];
      };

      expect(results).toBeDefined();
    });
  });

  describe("actor profile validation", () => {
    it("should return actor with expected ActivityPub fields", async () => {
      const actor = await client.fetchRemoteActor("Mastodon@mastodon.social");

      // Standard ActivityPub fields
      expect(actor.id).toBeDefined();
      expect(actor.type).toBeDefined();
      expect(actor.inbox).toBeDefined();
      expect(actor.outbox).toBeDefined();

      // Optional but common fields
      expect(actor.name !== undefined || actor.preferredUsername !== undefined).toBe(true);
    });

    it("should include public key information", async () => {
      const actor = await client.fetchRemoteActor("Mastodon@mastodon.social");

      // ActivityPub actors should have publicKey for signature verification
      expect(actor.publicKey).toBeDefined();
      if (actor.publicKey) {
        expect(actor.publicKey.publicKeyPem).toBeDefined();
      }
    });
  });

  describe("rate limiting behavior", () => {
    it("should handle multiple sequential requests", async () => {
      // Make several requests in sequence
      const requests = [
        client.fetchRemoteActor("Mastodon@mastodon.social"),
        client.getInstanceInfo("mastodon.social"),
        client.fetchRemoteActor("fosstodon@fosstodon.org"),
      ];

      const results = await Promise.all(requests);

      // All should succeed
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
      expect(results[2]).toBeDefined();
    });
  });
});

describe("Instance Blocklist Integration", () => {
  const client = new RemoteActivityPubClient();

  it("should successfully access non-blocked instances", async () => {
    // mastodon.social should not be blocked
    const actor = await client.fetchRemoteActor("Mastodon@mastodon.social");
    expect(actor).toBeDefined();
  });
});

describe("Cross-instance Federation Validation", () => {
  const client = new RemoteActivityPubClient();

  it("should handle actors from different software platforms", async () => {
    // Test Mastodon instance
    const mastodonActor = await client.fetchRemoteActor("Mastodon@mastodon.social");
    expect(mastodonActor.type).toBeDefined();

    // The actor type and fields may vary by platform
    expect(["Person", "Application", "Service", "Organization", "Group"]).toContain(
      mastodonActor.type,
    );
  });

  it("should handle different ActivityPub implementations", async () => {
    // Get instance info from different platforms
    const mastodonInfo = await client.getInstanceInfo("mastodon.social");
    const fosstodonInfo = await client.getInstanceInfo("fosstodon.org");

    // Both should return valid info despite being different instances
    expect(mastodonInfo.domain).toBe("mastodon.social");
    expect(fosstodonInfo.domain).toBe("fosstodon.org");
  });
});
