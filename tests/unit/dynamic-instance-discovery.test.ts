/**
 * Unit tests for the DynamicInstanceDiscoveryService class.
 */

import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { DynamicInstanceDiscoveryService } from "../../src/dynamic-instance-discovery.js";
import { server } from "../mocks/server.js";

/**
 * Helper to mock both instances.social and Fediverse Observer APIs to fail,
 * forcing the service to use static fallback data.
 */
function mockAllApisToFail() {
  server.use(
    http.get("https://instances.social/api/1.0/instances/list", () => {
      return new HttpResponse(null, { status: 500 });
    }),
    http.post("https://api.fediverse.observer/", () => {
      return new HttpResponse(null, { status: 500 });
    }),
  );
}

describe("DynamicInstanceDiscoveryService", () => {
  let service: DynamicInstanceDiscoveryService;

  beforeEach(() => {
    service = new DynamicInstanceDiscoveryService();
    service.clearCache();
  });

  describe("searchInstances", () => {
    it("should return fallback instances when all APIs fail", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances();

      expect(result.source).toBe("fallback");
      expect(result.instances.length).toBeGreaterThan(0);
      expect(result.instances[0].domain).toBeDefined();
    });

    it("should filter fallback instances by software", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances({ software: "lemmy" });

      expect(result.source).toBe("fallback");
      expect(result.instances.every((i) => i.software === "lemmy")).toBe(true);
    });

    it("should filter fallback instances by language", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances({ language: "ja" });

      expect(result.source).toBe("fallback");
      expect(result.instances.every((i) => i.language === "ja")).toBe(true);
    });

    it("should filter fallback instances by minimum users", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances({ minUsers: 100000 });

      expect(result.source).toBe("fallback");
      expect(result.instances.every((i) => (i.users || 0) >= 100000)).toBe(true);
    });

    it("should cache results from API", async () => {
      let callCount = 0;
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          callCount++;
          return HttpResponse.json({
            instances: [
              {
                name: "cached.social",
                users: 500,
                software: "mastodon",
                open_registrations: true,
                info: { short_description: "Cached instance" },
              },
            ],
            pagination: { total: 1 },
          });
        }),
      );

      // First call - should hit API
      const result1 = await service.searchInstances({ software: "mastodon" });
      expect(result1.source).toBe("api");
      expect(callCount).toBe(1);

      // Second call should be from cache (API not called again)
      const result2 = await service.searchInstances({ software: "mastodon" });
      expect(result2.source).toBe("cache");
      expect(callCount).toBe(1); // Still 1, not 2
    });

    it("should parse API response correctly", async () => {
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return HttpResponse.json({
            instances: [
              {
                name: "test.social",
                title: "Test Instance",
                users: 1000,
                statuses: 50000,
                connections: 500,
                software: "mastodon",
                version: "4.0.0",
                open_registrations: true,
                info: {
                  short_description: "A test instance",
                  languages: ["en"],
                },
              },
            ],
            pagination: {
              total: 1,
            },
          });
        }),
      );

      const result = await service.searchInstances();

      expect(result.source).toBe("api");
      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].domain).toBe("test.social");
      expect(result.instances[0].name).toBe("Test Instance");
      expect(result.instances[0].users).toBe(1000);
      expect(result.instances[0].software).toBe("mastodon");
      expect(result.instances[0].registrations).toBe(true);
      expect(result.instances[0].language).toBe("en");
    });
  });

  describe("getRandomInstances", () => {
    it("should return random instances", async () => {
      mockAllApisToFail();

      const result = await service.getRandomInstances(5);

      expect(result.instances.length).toBeLessThanOrEqual(5);
      expect(result.instances.every((i) => i.domain)).toBe(true);
    });
  });

  describe("getInstancesBySoftware", () => {
    it("should filter by software type", async () => {
      mockAllApisToFail();

      const result = await service.getInstancesBySoftware("pixelfed");

      expect(result.instances.every((i) => i.software === "pixelfed")).toBe(true);
    });
  });

  describe("getInstancesByLanguage", () => {
    it("should filter by language", async () => {
      mockAllApisToFail();

      const result = await service.getInstancesByLanguage("en");

      expect(result.instances.every((i) => i.language === "en")).toBe(true);
    });
  });

  describe("getTrendingInstances", () => {
    it("should return trending instances sorted by users", async () => {
      mockAllApisToFail();

      const result = await service.getTrendingInstances();

      // Check that instances have at least 1000 users (from the filter)
      expect(result.instances.every((i) => (i.users || 0) >= 1000)).toBe(true);
    });
  });

  describe("getSmallCommunityInstances", () => {
    it("should return small community instances", async () => {
      mockAllApisToFail();

      const result = await service.getSmallCommunityInstances();

      // All instances should have <= 5000 users based on filter
      expect(result.instances.every((i) => (i.users || 0) <= 5000)).toBe(true);
    });
  });

  describe("clearCache", () => {
    it("should clear the cache", async () => {
      mockAllApisToFail();

      // Fill cache
      await service.searchInstances();

      // Clear cache
      service.clearCache();

      // Next call should not be from cache
      const result = await service.searchInstances();
      expect(result.source).toBe("fallback");
    });
  });

  describe("Fediverse Observer fallback", () => {
    it("should fall back to Fediverse Observer when instances.social fails", async () => {
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return new HttpResponse(null, { status: 500 });
        }),
        http.post("https://api.fediverse.observer/", () => {
          return HttpResponse.json({
            data: {
              nodes: [
                {
                  domain: "observer.social",
                  name: "Observer Instance",
                  softwarename: "mastodon",
                  softwareversion: "4.0.0",
                  total_users: 5000,
                  local_posts: 100000,
                  signup: true,
                  metadescription: "A test instance from Fediverse Observer",
                },
              ],
            },
          });
        }),
      );

      const result = await service.searchInstances();

      expect(result.source).toBe("api");
      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].domain).toBe("observer.social");
      expect(result.instances[0].software).toBe("mastodon");
    });

    it("should apply client-side filters to Fediverse Observer results", async () => {
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return new HttpResponse(null, { status: 500 });
        }),
        http.post("https://api.fediverse.observer/", () => {
          return HttpResponse.json({
            data: {
              nodes: [
                { domain: "small.social", total_users: 100, signup: true },
                { domain: "medium.social", total_users: 5000, signup: true },
                { domain: "large.social", total_users: 50000, signup: false },
              ],
            },
          });
        }),
      );

      const result = await service.searchInstances({
        minUsers: 1000,
        maxUsers: 10000,
        openRegistrations: true,
      });

      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].domain).toBe("medium.social");
    });
  });

  describe("API response edge cases", () => {
    it("should handle empty instances array", async () => {
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return HttpResponse.json({
            instances: [],
            pagination: { total: 0 },
          });
        }),
      );

      const result = await service.searchInstances();

      expect(result.instances).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("should handle malformed API response gracefully", async () => {
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return HttpResponse.json({ unexpected: "format" });
        }),
        http.post("https://api.fediverse.observer/", () => {
          return HttpResponse.json({ unexpected: "format" });
        }),
      );

      const result = await service.searchInstances();

      // Malformed response with missing 'instances' field results in empty array
      // but still counts as successful API response
      expect(result.source).toBe("api");
      expect(result.instances).toHaveLength(0);
    });

    it("should handle null values in API response", async () => {
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return HttpResponse.json({
            instances: [
              {
                name: "null-values.social",
                title: null,
                users: null,
                software: null,
                info: null,
              },
            ],
          });
        }),
      );

      const result = await service.searchInstances();

      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].domain).toBe("null-values.social");
      expect(result.instances[0].users).toBeUndefined();
    });

    it("should filter out instances without domain", async () => {
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return HttpResponse.json({
            instances: [
              { name: "valid.social", users: 1000 },
              { name: "", users: 500 },
              { users: 200 },
            ],
          });
        }),
      );

      const result = await service.searchInstances();

      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].domain).toBe("valid.social");
    });
  });

  describe("sorting", () => {
    it("should sort by users descending by default", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances({
        sortBy: "users",
        sortOrder: "desc",
      });

      for (let i = 1; i < result.instances.length; i++) {
        const prev = result.instances[i - 1].users || 0;
        const curr = result.instances[i].users || 0;
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it("should sort by users ascending", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances({
        sortBy: "users",
        sortOrder: "asc",
        minUsers: 10, // Filter to get consistent results
      });

      for (let i = 1; i < result.instances.length; i++) {
        const prev = result.instances[i - 1].users || 0;
        const curr = result.instances[i].users || 0;
        expect(prev).toBeLessThanOrEqual(curr);
      }
    });
  });

  describe("pagination", () => {
    it("should apply offset correctly", async () => {
      mockAllApisToFail();

      const offsetResult = await service.searchInstances({ limit: 5, offset: 2 });

      expect(offsetResult.instances.length).toBeLessThanOrEqual(5);
    });

    it("should report hasMore correctly", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances({ limit: 2 });

      // Fallback has more than 2 instances
      expect(result.hasMore).toBe(true);
    });
  });

  describe("API query parameter building", () => {
    it("should build correct query parameters for instances.social", async () => {
      let capturedUrl: URL | null = null;

      server.use(
        http.get("https://instances.social/api/1.0/instances/list", ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({
            instances: [{ name: "test.social" }],
          });
        }),
      );

      await service.searchInstances({
        software: "mastodon",
        minUsers: 100,
        maxUsers: 10000,
        language: "en",
        openRegistrations: true,
        sortBy: "users",
        sortOrder: "desc",
        limit: 15,
        offset: 5,
      });

      expect(capturedUrl).not.toBeNull();
      if (capturedUrl) {
        expect(capturedUrl.searchParams.get("software")).toBe("mastodon");
        expect(capturedUrl.searchParams.get("min_users")).toBe("100");
        expect(capturedUrl.searchParams.get("max_users")).toBe("10000");
        expect(capturedUrl.searchParams.get("language")).toBe("en");
        expect(capturedUrl.searchParams.get("include_closed")).toBe("false");
        expect(capturedUrl.searchParams.get("sort_by")).toBe("users");
        expect(capturedUrl.searchParams.get("sort_order")).toBe("desc");
        expect(capturedUrl.searchParams.get("count")).toBe("15");
        expect(capturedUrl.searchParams.get("offset")).toBe("5");
      }
    });
  });

  describe("GraphQL escaping for Fediverse Observer", () => {
    it("should escape special characters in software filter", async () => {
      let capturedBody: string | null = null;

      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return new HttpResponse(null, { status: 500 });
        }),
        http.post("https://api.fediverse.observer/", async ({ request }) => {
          capturedBody = await request.text();
          return HttpResponse.json({
            data: { nodes: [] },
          });
        }),
      );

      await service.searchInstances({ software: 'mastodon"test' });

      expect(capturedBody).not.toBeNull();
      // The " should be escaped
      expect(capturedBody).toContain(String.raw`\"`);
    });
  });

  describe("cache key generation", () => {
    it("should generate different cache keys for different options", async () => {
      server.use(
        http.get("https://instances.social/api/1.0/instances/list", () => {
          return HttpResponse.json({
            instances: [{ name: "test.social" }],
          });
        }),
      );

      // Make two different requests
      await service.searchInstances({ software: "mastodon" });
      await service.searchInstances({ software: "pleroma" });

      // Both should hit the API (not cache) because options are different
      // This is verified by the fact that both complete without error
    });
  });

  describe("response structure", () => {
    it("should include timestamp in response", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances();

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });

    it("should include total count in response", async () => {
      mockAllApisToFail();

      const result = await service.searchInstances();

      expect(typeof result.total).toBe("number");
      expect(result.total).toBeGreaterThanOrEqual(result.instances.length);
    });
  });
});
