/**
 * Unit tests for the NodeInfo discovery module.
 */

// biome-ignore lint/correctness/noUnusedImports: used by later tasks
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { NodeInfoDiscoverySchema, NodeInfoSchema } from "../../src/discovery/nodeinfo.js";

describe("NodeInfo schemas", () => {
  describe("NodeInfoDiscoverySchema", () => {
    it("accepts a minimal valid discovery document", () => {
      const doc = {
        links: [
          {
            rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
            href: "https://example.social/nodeinfo/2.0",
          },
        ],
      };
      expect(() => NodeInfoDiscoverySchema.parse(doc)).not.toThrow();
    });

    it("accepts multiple link versions (2.0 + 2.1)", () => {
      const doc = {
        links: [
          { rel: "http://nodeinfo.diaspora.software/ns/schema/2.0", href: "https://x/2.0" },
          { rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: "https://x/2.1" },
        ],
      };
      expect(() => NodeInfoDiscoverySchema.parse(doc)).not.toThrow();
    });

    it("rejects when links is missing", () => {
      expect(() => NodeInfoDiscoverySchema.parse({})).toThrow();
    });

    it("rejects when a link entry is missing href", () => {
      expect(() =>
        NodeInfoDiscoverySchema.parse({
          links: [{ rel: "http://nodeinfo.diaspora.software/ns/schema/2.0" }],
        }),
      ).toThrow();
    });
  });

  describe("NodeInfoSchema", () => {
    it("accepts a NodeInfo 2.0 body", () => {
      const body = {
        version: "2.0",
        software: { name: "mastodon", version: "4.3.2" },
        protocols: ["activitypub"],
        openRegistrations: false,
        usage: { users: { total: 10000 } },
        services: { inbound: [], outbound: [] },
      };
      expect(() => NodeInfoSchema.parse(body)).not.toThrow();
    });

    it("accepts a NodeInfo 2.1 body", () => {
      const body = {
        version: "2.1",
        software: { name: "pleroma", version: "2.7.0", repository: "https://example/repo" },
        protocols: ["activitypub"],
        openRegistrations: true,
      };
      expect(() => NodeInfoSchema.parse(body)).not.toThrow();
    });

    it("rejects when software.name is missing", () => {
      expect(() =>
        NodeInfoSchema.parse({
          version: "2.0",
          software: { version: "4.3.2" },
          protocols: ["activitypub"],
        }),
      ).toThrow();
    });

    it("rejects when software.version is missing", () => {
      expect(() =>
        NodeInfoSchema.parse({
          version: "2.0",
          software: { name: "mastodon" },
          protocols: ["activitypub"],
        }),
      ).toThrow();
    });

    it("rejects when protocols is missing", () => {
      expect(() =>
        NodeInfoSchema.parse({
          version: "2.0",
          software: { name: "mastodon", version: "4.3.2" },
        }),
      ).toThrow();
    });
  });
});
