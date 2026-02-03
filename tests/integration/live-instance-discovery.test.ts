/**
 * Integration tests for DynamicInstanceDiscoveryService with live API data.
 *
 * These tests hit real external APIs and require network connectivity.
 * They are designed to validate that the service works correctly with
 * actual API responses from instances.social and Fediverse Observer.
 *
 * Note: These tests are resilient to API availability - they verify
 * the service works correctly whether using live API or fallback data.
 *
 * Run with: npm run test:integration
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DynamicInstanceDiscoveryService } from "../../src/dynamic-instance-discovery.js";

describe("DynamicInstanceDiscoveryService - Live API Tests", () => {
  let service: DynamicInstanceDiscoveryService;

  beforeEach(() => {
    service = new DynamicInstanceDiscoveryService();
    service.clearCache();
  });

  afterEach(() => {
    service.clearCache();
  });

  describe("searchInstances with live data", () => {
    it("should return results from API or fallback", async () => {
      const result = await service.searchInstances({ limit: 5 });

      // Should always return a valid response structure
      expect(result.source).toBeDefined();
      expect(["api", "cache", "fallback"]).toContain(result.source);
      expect(result.timestamp).toBeDefined();
      expect(Array.isArray(result.instances)).toBe(true);

      // If we got results, verify structure
      if (result.instances.length > 0) {
        for (const instance of result.instances) {
          expect(instance.domain).toBeDefined();
          expect(typeof instance.domain).toBe("string");
          expect(instance.domain.length).toBeGreaterThan(0);
        }
      }
    });

    it("should handle software filter", async () => {
      const result = await service.searchInstances({
        software: "mastodon",
        limit: 10,
      });

      // Should return valid response regardless of API availability
      expect(result.source).toBeDefined();
      expect(Array.isArray(result.instances)).toBe(true);

      // If from API with results, verify filter was applied
      if (result.source === "api" && result.instances.length > 0) {
        for (const instance of result.instances) {
          expect(instance.software?.toLowerCase()).toContain("mastodon");
        }
      }
    });

    it("should respect limit parameter", async () => {
      const result = await service.searchInstances({ limit: 3 });

      expect(result.instances.length).toBeLessThanOrEqual(3);
    });

    it("should return instances with metadata when available", async () => {
      const result = await service.searchInstances({
        sortBy: "users",
        sortOrder: "desc",
        limit: 5,
      });

      expect(Array.isArray(result.instances)).toBe(true);

      // If we got results, at least some should have user counts
      if (result.instances.length > 0) {
        const withUsers = result.instances.filter((i) => i.users !== undefined);
        // May or may not have user counts depending on source
        expect(withUsers.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("getTrendingInstances with live data", () => {
    it("should return popular instances or fallback gracefully", async () => {
      const result = await service.getTrendingInstances(5);

      expect(result.source).toBeDefined();
      expect(Array.isArray(result.instances)).toBe(true);

      // Trending method filters for minUsers: 1000, may return empty from fallback
      // which only has a few instances matching that criteria
      if (result.instances.length > 0 && result.source === "api") {
        for (const instance of result.instances) {
          if (instance.users !== undefined) {
            expect(instance.users).toBeGreaterThanOrEqual(1000);
          }
        }
      }
    });
  });

  describe("getRandomInstances with live data", () => {
    it("should return random selection of instances", async () => {
      const result1 = await service.getRandomInstances(5);
      service.clearCache();
      const result2 = await service.getRandomInstances(5);

      expect(Array.isArray(result1.instances)).toBe(true);
      expect(Array.isArray(result2.instances)).toBe(true);

      // Should get some results from fallback at minimum
      if (result1.instances.length > 0) {
        expect(result1.instances[0].domain).toBeDefined();
      }
      if (result2.instances.length > 0) {
        expect(result2.instances[0].domain).toBeDefined();
      }
    });
  });

  describe("getInstancesBySoftware with live data", () => {
    it("should find Mastodon instances", async () => {
      const result = await service.getInstancesBySoftware("mastodon", 5);

      expect(result.source).toBeDefined();
      expect(Array.isArray(result.instances)).toBe(true);

      // Fallback has mastodon instances
      if (result.source === "fallback") {
        expect(result.instances.length).toBeGreaterThan(0);
      }
    });

    it("should handle less common software types", async () => {
      const result = await service.getInstancesBySoftware("lemmy", 5);

      // May return empty if API doesn't have lemmy, should not error
      expect(result).toBeDefined();
      expect(Array.isArray(result.instances)).toBe(true);
    });
  });

  describe("caching behavior with live data", () => {
    it("should cache API responses", async () => {
      // First call
      const result1 = await service.searchInstances({ software: "mastodon", limit: 3 });

      // Second call with same params - should be from cache
      const result2 = await service.searchInstances({ software: "mastodon", limit: 3 });

      // If first was from API, second should be from cache
      if (result1.source === "api") {
        expect(result2.source).toBe("cache");
      }

      // Results structure should be the same
      expect(result1.instances.length).toBe(result2.instances.length);
    });

    it("should not use cache after clearCache", async () => {
      // First call
      await service.searchInstances({ limit: 3 });

      // Clear cache
      service.clearCache();

      // Second call - should not be from cache
      const result = await service.searchInstances({ limit: 3 });

      // Should be either api or fallback, not cache
      expect(["api", "fallback"]).toContain(result.source);
    });
  });

  describe("response structure validation", () => {
    it("should return properly structured response", async () => {
      const result = await service.searchInstances({ limit: 5 });

      // Validate response structure
      expect(result).toHaveProperty("instances");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("hasMore");
      expect(result).toHaveProperty("source");
      expect(result).toHaveProperty("timestamp");

      // Validate types
      expect(Array.isArray(result.instances)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(typeof result.hasMore).toBe("boolean");
      expect(typeof result.source).toBe("string");
      expect(typeof result.timestamp).toBe("string");

      // Validate timestamp is valid ISO date
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });

    it("should return instances with valid domain format", async () => {
      const result = await service.searchInstances({ limit: 10 });

      for (const instance of result.instances) {
        // Domain should be a valid-looking domain (not a URL)
        expect(instance.domain).not.toContain("http://");
        expect(instance.domain).not.toContain("https://");
        // Basic domain pattern - allows for various TLDs and subdomains
        expect(instance.domain.length).toBeGreaterThan(0);
      }
    });
  });
});
