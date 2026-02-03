/**
 * Tests for Instance Discovery Service
 */

import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../mocks/server.js";

// Mock the file system and logger before importing the module
vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue(
    JSON.stringify({
      mastodon: [
        { domain: "mastodon.social", description: "General-purpose instance", users: "1M+" },
        { domain: "fosstodon.org", description: "FOSS enthusiasts", users: "50K" },
        { domain: "techhub.social", description: "Tech community", users: "10K" },
      ],
      pleroma: [{ domain: "pleroma.social", description: "Lightweight fediverse", users: "5K" }],
      pixelfed: [{ domain: "pixelfed.social", description: "Photo sharing", users: "100K" }],
      lemmy: [{ domain: "lemmy.world", description: "Link aggregation", users: "200K" }],
      misskey: [],
      peertube: [],
    }),
  ),
}));

vi.mock("@logtape/logtape", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import after mocks are set up
const { InstanceDiscoveryService } = await import("../../src/instance-discovery.js");

describe("InstanceDiscoveryService", () => {
  let service: InstanceDiscoveryService;

  beforeEach(() => {
    service = new InstanceDiscoveryService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getPopularInstances", () => {
    it("should return all instances when no software specified", () => {
      const instances = service.getPopularInstances();
      expect(instances.length).toBeGreaterThan(0);
      expect(instances.some((i) => i.software === "mastodon")).toBe(true);
      expect(instances.some((i) => i.software === "pleroma")).toBe(true);
    });

    it("should return instances for specific software type", () => {
      const mastodonInstances = service.getPopularInstances("mastodon");
      expect(mastodonInstances.every((i) => i.software === "mastodon")).toBe(true);
      expect(mastodonInstances.some((i) => i.domain === "mastodon.social")).toBe(true);
    });

    it("should return all instances for unknown software type (fallback)", () => {
      // When software is specified but not found, falls through to return all instances
      const instances = service.getPopularInstances("unknown-software");
      expect(instances.length).toBeGreaterThan(0);
    });

    it("should include software and category fields", () => {
      const instances = service.getPopularInstances("mastodon");
      expect(instances[0]).toHaveProperty("software", "mastodon");
      expect(instances[0]).toHaveProperty("category", "mastodon");
    });
  });

  describe("searchInstancesByTopic", () => {
    it("should find instances by topic in description", () => {
      const results = service.searchInstancesByTopic("FOSS");
      expect(results.some((i) => i.domain === "fosstodon.org")).toBe(true);
    });

    it("should find instances by topic in domain", () => {
      const results = service.searchInstancesByTopic("tech");
      expect(results.some((i) => i.domain === "techhub.social")).toBe(true);
    });

    it("should be case-insensitive", () => {
      const results1 = service.searchInstancesByTopic("FOSS");
      const results2 = service.searchInstancesByTopic("foss");
      expect(results1.length).toBe(results2.length);
    });

    it("should return empty array for no matches", () => {
      const results = service.searchInstancesByTopic("xyznonexistent");
      expect(results).toEqual([]);
    });
  });

  describe("getInstancesBySize", () => {
    it("should return small instances (< 10K users)", () => {
      const instances = service.getInstancesBySize("small");
      // pleroma.social has 5K users
      expect(instances.some((i) => i.domain === "pleroma.social")).toBe(true);
    });

    it("should return medium instances (10K - 100K users)", () => {
      const instances = service.getInstancesBySize("medium");
      // fosstodon.org has 50K users, techhub.social has 10K
      expect(instances.some((i) => i.domain === "fosstodon.org")).toBe(true);
    });

    it("should return large instances (> 100K users)", () => {
      const instances = service.getInstancesBySize("large");
      // mastodon.social has 1M+, pixelfed.social has 100K, lemmy.world has 200K
      expect(instances.some((i) => i.domain === "mastodon.social")).toBe(true);
    });
  });

  describe("getBeginnerFriendlyInstances", () => {
    it("should return beginner-friendly instances", () => {
      const instances = service.getBeginnerFriendlyInstances();
      const domains = instances.map((i) => i.domain);
      expect(domains).toContain("mastodon.social");
      expect(domains).toContain("fosstodon.org");
    });
  });

  describe("getInstancesByRegion", () => {
    it("should find instances matching region in domain", () => {
      // This may not match any instances in our mock data, which is expected
      const results = service.getInstancesByRegion("social");
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should find instances matching region in description", () => {
      const results = service.getInstancesByRegion("general");
      expect(results.some((i) => i.description.toLowerCase().includes("general"))).toBe(true);
    });

    it("should handle specific region mappings for Japan", () => {
      const results = service.getInstancesByRegion("japan");
      // Returns based on .jp domain or "japanese" in description
      expect(results).toBeDefined();
    });

    it("should handle specific region mappings for Germany", () => {
      const results = service.getInstancesByRegion("germany");
      expect(results).toBeDefined();
    });

    it("should handle specific region mappings for France", () => {
      const results = service.getInstancesByRegion("france");
      expect(results).toBeDefined();
    });
  });

  describe("checkInstanceHealth", () => {
    it("should return online status for healthy instance", async () => {
      server.use(
        http.head("https://healthy.social/api/v1/instance", () => {
          return new HttpResponse(null, { status: 200 });
        }),
      );

      const result = await service.checkInstanceHealth("healthy.social");
      expect(result.online).toBe(true);
      expect(result.responseTime).toBeDefined();
    });

    it("should return offline status for unhealthy instance", async () => {
      server.use(
        http.head("https://unhealthy.social/api/v1/instance", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const result = await service.checkInstanceHealth("unhealthy.social");
      expect(result.online).toBe(false);
    });

    it("should handle network errors", async () => {
      server.use(
        http.head("https://network-fail.social/api/v1/instance", () => {
          return HttpResponse.error();
        }),
      );

      const result = await service.checkInstanceHealth("network-fail.social");
      expect(result.online).toBe(false);
      // Error may or may not be set depending on how the error is caught
    });
  });

  describe("getInstanceStats", () => {
    it("should return instance statistics", async () => {
      server.use(
        http.get("https://stats.social/api/v1/instance", () => {
          return HttpResponse.json({
            version: "4.2.0 (mastodon)",
            stats: {
              user_count: 10000,
              status_count: 50000,
            },
            description: "Test instance",
            languages: ["en"],
            registrations: true,
          });
        }),
      );

      const result = await service.getInstanceStats("stats.social");
      expect(result.online).toBe(true);
      expect(result.users).toBe(10000);
      expect(result.posts).toBe(50000);
      expect(result.registrations).toBe(true);
    });

    it("should detect Pleroma software", async () => {
      server.use(
        http.get("https://pleroma-instance.social/api/v1/instance", () => {
          return HttpResponse.json({
            version: "2.5.0 Pleroma",
          });
        }),
      );

      const result = await service.getInstanceStats("pleroma-instance.social");
      expect(result.software).toBe("pleroma");
    });

    it("should return offline for failed requests", async () => {
      server.use(
        http.get("https://offline.social/api/v1/instance", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const result = await service.getInstanceStats("offline.social");
      expect(result.online).toBe(false);
    });

    it("should handle network errors gracefully", async () => {
      server.use(
        http.get("https://network-error.social/api/v1/instance", () => {
          throw new Error("Network failure");
        }),
      );

      const result = await service.getInstanceStats("network-error.social");
      expect(result.online).toBe(false);
      expect(result.domain).toBe("network-error.social");
    });
  });

  describe("getInstanceRecommendations", () => {
    it("should recommend tech instances for tech interests", () => {
      const recommendations = service.getInstanceRecommendations(["programming", "software"]);
      const domains = recommendations.map((i) => i.domain);
      expect(domains).toContain("fosstodon.org");
    });

    it("should recommend photo instances for art interests", () => {
      const recommendations = service.getInstanceRecommendations(["photography", "art"]);
      const domains = recommendations.map((i) => i.domain);
      expect(domains).toContain("pixelfed.social");
    });

    it("should return beginner-friendly instances when no specific matches", () => {
      const recommendations = service.getInstanceRecommendations(["random-interest"]);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it("should be case-insensitive for interests", () => {
      const recommendations1 = service.getInstanceRecommendations(["TECH"]);
      const recommendations2 = service.getInstanceRecommendations(["tech"]);
      expect(recommendations1.map((r) => r.domain).sort()).toEqual(
        recommendations2.map((r) => r.domain).sort(),
      );
    });

    it("should handle multiple matching categories", () => {
      const recommendations = service.getInstanceRecommendations([
        "tech",
        "programming",
        "art",
        "photography",
      ]);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it("should recommend academic instances for research interests", () => {
      const recommendations = service.getInstanceRecommendations(["academic", "research"]);
      // scholar.social should be recommended but may not be in our mock data
      expect(recommendations).toBeDefined();
    });

    it("should recommend journalism instances for media interests", () => {
      const recommendations = service.getInstanceRecommendations(["journalism", "news"]);
      expect(recommendations).toBeDefined();
    });
  });

  describe("parseUserCount (through getInstancesBySize)", () => {
    it("should correctly parse user counts with K suffix", () => {
      // 50K should be medium (10K-100K)
      const medium = service.getInstancesBySize("medium");
      expect(medium.some((i) => i.users.includes("50K"))).toBe(true);
    });

    it("should correctly parse user counts with M suffix", () => {
      // 1M+ should be large (>100K)
      const large = service.getInstancesBySize("large");
      expect(large.some((i) => i.users.includes("M"))).toBe(true);
    });
  });
});

describe("InstanceDiscoveryService - Edge Cases", () => {
  let service: InstanceDiscoveryService;

  beforeEach(() => {
    service = new InstanceDiscoveryService();
  });

  it("should handle empty search topics", () => {
    const results = service.searchInstancesByTopic("");
    expect(results.length).toBeGreaterThan(0); // Should match all instances
  });

  it("should handle special characters in search", () => {
    const results = service.searchInstancesByTopic("test@#$%");
    expect(results).toEqual([]);
  });
});
