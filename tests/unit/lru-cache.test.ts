/**
 * Unit tests for LRU Cache implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LRUCache } from "../../src/utils/lru-cache.js";

describe("LRUCache", () => {
  describe("basic operations", () => {
    it("should store and retrieve values", () => {
      const cache = new LRUCache<string, number>();

      cache.set("a", 1);
      cache.set("b", 2);

      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBe(2);
    });

    it("should return undefined for missing keys", () => {
      const cache = new LRUCache<string, number>();

      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("should update existing values", () => {
      const cache = new LRUCache<string, number>();

      cache.set("a", 1);
      cache.set("a", 2);

      expect(cache.get("a")).toBe(2);
      expect(cache.size).toBe(1);
    });

    it("should correctly report has()", () => {
      const cache = new LRUCache<string, number>();

      cache.set("a", 1);

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
    });

    it("should delete values", () => {
      const cache = new LRUCache<string, number>();

      cache.set("a", 1);
      expect(cache.delete("a")).toBe(true);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.delete("a")).toBe(false);
    });

    it("should clear all values", () => {
      const cache = new LRUCache<string, number>();

      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    it("should evict least recently used item when at capacity", () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      cache.set("d", 4); // This should evict "a"

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
      expect(cache.size).toBe(3);
    });

    it("should update LRU order on get()", () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      // Access "a" to make it recently used
      cache.get("a");

      // Add new item - should evict "b" (least recently used)
      cache.set("d", 4);

      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("should update LRU order on set() of existing key", () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      // Update "a" to make it recently used
      cache.set("a", 10);

      // Add new item - should evict "b" (least recently used)
      cache.set("d", 4);

      expect(cache.get("a")).toBe(10);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });
  });

  describe("TTL expiration", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return undefined for expired items on get()", () => {
      const cache = new LRUCache<string, number>({ ttl: 1000 }); // 1 second TTL

      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      expect(cache.get("a")).toBeUndefined();
    });

    it("should return false for expired items on has()", () => {
      const cache = new LRUCache<string, number>({ ttl: 1000 });

      cache.set("a", 1);
      expect(cache.has("a")).toBe(true);

      vi.advanceTimersByTime(1500);

      expect(cache.has("a")).toBe(false);
    });

    it("should prune expired entries", () => {
      const cache = new LRUCache<string, number>({ ttl: 1000 });

      cache.set("a", 1);
      cache.set("b", 2);

      vi.advanceTimersByTime(500);
      cache.set("c", 3); // Added later, not expired yet

      vi.advanceTimersByTime(600); // Total: 1100ms - a and b expired, c not

      const removed = cache.prune();

      expect(removed).toBe(2);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe(3);
    });

    it("should not expire items when TTL is 0", () => {
      const cache = new LRUCache<string, number>({ ttl: 0 });

      cache.set("a", 1);

      vi.advanceTimersByTime(1000000);

      expect(cache.get("a")).toBe(1);
    });
  });

  describe("stats()", () => {
    it("should return correct statistics", () => {
      const cache = new LRUCache<string, number>({ maxSize: 100, ttl: 5000 });

      cache.set("a", 1);
      cache.set("b", 2);

      const stats = cache.stats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
      expect(stats.ttl).toBe(5000);
    });
  });

  describe("keys()", () => {
    it("should return all keys", () => {
      const cache = new LRUCache<string, number>();

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      const keys = [...cache.keys()];

      expect(keys).toContain("a");
      expect(keys).toContain("b");
      expect(keys).toContain("c");
      expect(keys.length).toBe(3);
    });
  });

  describe("default options", () => {
    it("should use default maxSize of 1000", () => {
      const cache = new LRUCache<string, number>();
      expect(cache.stats().maxSize).toBe(1000);
    });

    it("should use default TTL of 0 (no expiration)", () => {
      const cache = new LRUCache<string, number>();
      expect(cache.stats().ttl).toBe(0);
    });
  });
});
