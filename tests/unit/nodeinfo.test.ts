/**
 * Unit tests for the NodeInfo discovery module.
 */

import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

// getInstanceSoftware fetches through guardedFetch → pinnedFetch → resolveAndPin,
// which performs a real DNS lookup before the (MSW-mocked) fetch. The fake test
// domains below do not resolve consistently across platforms — on CI Linux/Windows
// they resolve to something that makes resolveAndPin throw before MSW can intercept,
// while on macOS they fall through benignly. Mock the resolver so every test domain
// pins a fixed public IP: resolveAndPin succeeds, MSW intercepts the fetch, and the
// result is deterministic everywhere. IP-literal and same-host SSRF guards are
// unaffected (127.0.0.1 is caught as a literal, never reaching this lookup).
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import {
  clearNodeInfoCache,
  getInstanceSoftware,
  NodeInfoDiscoverySchema,
  NodeInfoSchema,
} from "../../src/discovery/nodeinfo.js";
import { instanceBlocklist } from "../../src/policy/instance-blocklist.js";
import { server } from "../mocks/server.js";

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

describe("getInstanceSoftware — happy path + cache", () => {
  beforeEach(() => {
    clearNodeInfoCache();
  });

  it("returns success with software + version + protocols for a valid instance", async () => {
    server.use(
      http.get("https://happy.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://happy.social/nodeinfo/2.0",
            },
          ],
        }),
      ),
      http.get("https://happy.social/nodeinfo/2.0", () =>
        HttpResponse.json({
          version: "2.0",
          software: { name: "mastodon", version: "4.3.2" },
          protocols: ["activitypub"],
          openRegistrations: false,
        }),
      ),
    );

    const info = await getInstanceSoftware("happy.social");
    expect(info).toEqual({
      domain: "happy.social",
      detection: "success",
      software: { name: "mastodon", version: "4.3.2" },
      protocols: ["activitypub"],
      openRegistrations: false,
    });
  });

  it("prefers 2.1 over 2.0 when both are advertised", async () => {
    server.use(
      http.get("https://dual.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://dual.social/nodeinfo/2.0",
            },
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
              href: "https://dual.social/nodeinfo/2.1",
            },
          ],
        }),
      ),
      http.get("https://dual.social/nodeinfo/2.1", () =>
        HttpResponse.json({
          version: "2.1",
          software: { name: "pleroma", version: "2.7.0" },
          protocols: ["activitypub"],
        }),
      ),
    );

    const info = await getInstanceSoftware("dual.social");
    expect(info.detection).toBe("success");
    expect(info.software).toEqual({ name: "pleroma", version: "2.7.0" });
  });

  it("ignores a bogus rel that sorts above the genuine 2.1 link", async () => {
    // A misbehaving instance advertises a real 2.1 link plus a same-host rel
    // ("2.1-evil") that lexically sorts higher. Only the exact 2.0/2.1 schema
    // rels are valid, so the genuine link must win regardless of sort order.
    server.use(
      http.get("https://relbug.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
              href: "https://relbug.social/nodeinfo/2.1",
            },
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.1-evil",
              href: "https://relbug.social/nodeinfo/evil",
            },
          ],
        }),
      ),
      http.get("https://relbug.social/nodeinfo/2.1", () =>
        HttpResponse.json({
          version: "2.1",
          software: { name: "mastodon", version: "4.3.2" },
          protocols: ["activitypub"],
        }),
      ),
      http.get("https://relbug.social/nodeinfo/evil", () =>
        HttpResponse.json({
          version: "2.1",
          software: { name: "pleroma", version: "9.9.9" },
          protocols: ["activitypub"],
        }),
      ),
    );

    const info = await getInstanceSoftware("relbug.social");
    expect(info.detection).toBe("success");
    expect(info.software).toEqual({ name: "mastodon", version: "4.3.2" });
  });

  it("caches positive results — second call does not hit the network", async () => {
    let fetchCount = 0;
    server.use(
      http.get("https://cached.social/.well-known/nodeinfo", () => {
        fetchCount++;
        return HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://cached.social/nodeinfo/2.0",
            },
          ],
        });
      }),
      http.get("https://cached.social/nodeinfo/2.0", () => {
        fetchCount++;
        return HttpResponse.json({
          version: "2.0",
          software: { name: "mastodon", version: "4.3.2" },
          protocols: ["activitypub"],
        });
      }),
    );

    await getInstanceSoftware("cached.social");
    await getInstanceSoftware("cached.social");
    expect(fetchCount).toBe(2); // discovery + nodeinfo fetched ONCE
  });
});

describe("getInstanceSoftware — failure modes (never throws)", () => {
  beforeEach(() => {
    clearNodeInfoCache();
  });

  it("returns unavailable when discovery returns 404", async () => {
    server.use(
      http.get(
        "https://missing.social/.well-known/nodeinfo",
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    const info = await getInstanceSoftware("missing.social");
    expect(info.detection).toBe("unavailable");
    expect(info.software).toBeNull();
    expect(info.reason).toMatch(/404/);
  });

  it("returns unavailable when discovery returns malformed JSON", async () => {
    server.use(
      http.get(
        "https://malformed.social/.well-known/nodeinfo",
        () =>
          new HttpResponse("not json", { status: 200, headers: { "content-type": "text/plain" } }),
      ),
    );

    const info = await getInstanceSoftware("malformed.social");
    expect(info.detection).toBe("unavailable");
    expect(info.reason).toBeDefined();
  });

  it("returns unavailable when NodeInfo body fails schema", async () => {
    server.use(
      http.get("https://badschema.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://badschema.social/nodeinfo/2.0",
            },
          ],
        }),
      ),
      http.get(
        "https://badschema.social/nodeinfo/2.0",
        () => HttpResponse.json({ software: { name: "mastodon" } }), // missing version, protocols
      ),
    );

    const info = await getInstanceSoftware("badschema.social");
    expect(info.detection).toBe("unavailable");
  });

  it("returns unavailable when discovery has no 2.0/2.1 link", async () => {
    server.use(
      http.get("https://onlyv1.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/1.0",
              href: "https://onlyv1.social/nodeinfo/1.0",
            },
          ],
        }),
      ),
    );

    const info = await getInstanceSoftware("onlyv1.social");
    expect(info.detection).toBe("unavailable");
    expect(info.reason).toMatch(/no NodeInfo 2/i);
  });

  it("caches unavailable results — repeated failures do not refetch", async () => {
    let fetchCount = 0;
    server.use(
      http.get("https://flaky.social/.well-known/nodeinfo", () => {
        fetchCount++;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const first = await getInstanceSoftware("flaky.social");
    const second = await getInstanceSoftware("flaky.social");
    expect(fetchCount).toBe(1);
    expect(second.detection).toBe("unavailable");
    expect(second.reason).toBe(first.reason);
  });
});

describe("getInstanceSoftware — SSRF + blocklist", () => {
  beforeEach(() => {
    clearNodeInfoCache();
    instanceBlocklist.clear();
  });

  it("returns unavailable when NodeInfo link points to a private IP", async () => {
    server.use(
      http.get("https://ssrf.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://127.0.0.1/nodeinfo/2.0",
            },
          ],
        }),
      ),
    );

    const info = await getInstanceSoftware("ssrf.social");
    expect(info.detection).toBe("unavailable");
    // A public host pointing its NodeInfo link at a private IP is blocked: the
    // same-host guard rejects it (127.0.0.1 is not ssrf.social or a subdomain)
    // before any fetch, which is the SSRF defense for this cross-host case.
    expect(info.reason).toMatch(/not allowed|private|different host/i);
  });

  it("returns unavailable when input domain is blocklisted", async () => {
    instanceBlocklist.addBlock({
      domain: "blocked.social",
      reason: "policy",
      description: "test block",
      addedAt: new Date().toISOString(),
    });

    const info = await getInstanceSoftware("blocked.social");
    expect(info.detection).toBe("unavailable");
    expect(info.reason).toMatch(/block/i);
  });

  it("re-checks the blocklist on a cached positive hit and goes unavailable once blocked", async () => {
    server.use(
      http.get("https://laterblocked.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://laterblocked.social/nodeinfo/2.0",
            },
          ],
        }),
      ),
      http.get("https://laterblocked.social/nodeinfo/2.0", () =>
        HttpResponse.json({
          version: "2.0",
          software: { name: "mastodon", version: "1.0.0" },
          protocols: ["activitypub"],
        }),
      ),
    );

    // Populate the positive cache.
    const first = await getInstanceSoftware("laterblocked.social");
    expect(first.detection).toBe("success");
    expect(first.software).toEqual({ name: "mastodon", version: "1.0.0" });

    // Operator blocks the instance AFTER it was cached. A positive cache hit
    // must not keep serving pre-block metadata until the 24h TTL expires.
    instanceBlocklist.addBlock({
      domain: "laterblocked.social",
      reason: "policy",
      description: "blocked after cache populate",
      addedAt: new Date().toISOString(),
    });

    const second = await getInstanceSoftware("laterblocked.social");
    expect(second.detection).toBe("unavailable");
    expect(second.reason).toMatch(/block/i);
  });

  it("returns unavailable when the NodeInfo link uses a non-https scheme", async () => {
    // Same-host link (passes the subdomain guard) but on a forbidden scheme, so
    // the https-only SSRF guard inside guardedFetch is the thing that rejects.
    server.use(
      http.get("https://localhost.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "http://localhost.social/nodeinfo/2.0",
            },
          ],
        }),
      ),
    );

    const info = await getInstanceSoftware("localhost.social");
    expect(info.detection).toBe("unavailable");
    expect(info.reason).toMatch(/not allowed|scheme/i);
  });
});

describe("getInstanceSoftware — single-flight", () => {
  beforeEach(() => {
    clearNodeInfoCache();
  });

  it("two concurrent calls for the same domain trigger a single discovery fetch", async () => {
    let discoveryHits = 0;
    server.use(
      http.get("https://race.social/.well-known/nodeinfo", async () => {
        discoveryHits++;
        // Yield to let any second caller arrive before responding.
        await new Promise((r) => setTimeout(r, 25));
        return HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://race.social/nodeinfo/2.0",
            },
          ],
        });
      }),
      http.get("https://race.social/nodeinfo/2.0", () =>
        HttpResponse.json({
          software: { name: "mastodon", version: "4.3.2" },
          protocols: ["activitypub"],
        }),
      ),
    );

    const [a, b] = await Promise.all([
      getInstanceSoftware("race.social"),
      getInstanceSoftware("race.social"),
    ]);
    expect(a).toEqual(b);
    expect(discoveryHits).toBe(1);
  });
});

describe("getInstanceSoftware — same-host check on linked URL", () => {
  beforeEach(() => {
    clearNodeInfoCache();
    instanceBlocklist.clear();
  });

  it("accepts a linked NodeInfo URL on the exact same host", async () => {
    server.use(
      http.get("https://exact.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://exact.social/nodeinfo/2.0",
            },
          ],
        }),
      ),
      http.get("https://exact.social/nodeinfo/2.0", () =>
        HttpResponse.json({
          software: { name: "mastodon", version: "4.3.2" },
          protocols: ["activitypub"],
        }),
      ),
    );

    const info = await getInstanceSoftware("exact.social");
    expect(info.detection).toBe("success");
  });

  it("accepts a linked NodeInfo URL on a subdomain of the input", async () => {
    server.use(
      http.get("https://parent.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://nodeinfo.parent.social/2.0",
            },
          ],
        }),
      ),
      http.get("https://nodeinfo.parent.social/2.0", () =>
        HttpResponse.json({
          software: { name: "akkoma", version: "3.13.0" },
          protocols: ["activitypub"],
        }),
      ),
    );

    const info = await getInstanceSoftware("parent.social");
    expect(info.detection).toBe("success");
    expect(info.software?.name).toBe("akkoma");
  });

  it("accepts a linked NodeInfo URL on the same host in trailing-dot FQDN form", async () => {
    server.use(
      http.get("https://fqdn.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://fqdn.social./nodeinfo/2.0",
            },
          ],
        }),
      ),
      http.get("https://fqdn.social./nodeinfo/2.0", () =>
        HttpResponse.json({
          software: { name: "mastodon", version: "4.3.2" },
          protocols: ["activitypub"],
        }),
      ),
    );

    const info = await getInstanceSoftware("fqdn.social");
    expect(info.detection).toBe("success");
    expect(info.software?.name).toBe("mastodon");
  });

  it("rejects a linked NodeInfo URL on an unrelated host", async () => {
    server.use(
      http.get("https://victim.social/.well-known/nodeinfo", () =>
        HttpResponse.json({
          links: [
            {
              rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
              href: "https://attacker.test/nodeinfo/2.0",
            },
          ],
        }),
      ),
    );

    const info = await getInstanceSoftware("victim.social");
    expect(info.detection).toBe("unavailable");
    expect(info.reason).toMatch(/different host|cross-host/i);
  });
});
