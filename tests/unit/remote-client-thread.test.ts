import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../mocks/server.js";

// Pin DNS to a public IP so resolveAndPin succeeds for fixture hosts (which
// don't resolve on the real resolver) and MSW intercepts the pinned fetch.
// resolveAndPin now fails closed on an unresolved host, so without this the
// thread fetches would reject before reaching MSW.
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

// The production fetch helper catches and silently skips unmatched requests,
// so unhandled requests only add console noise; the strict `.toBe(3)`
// assertion below is the real guard against the cap regressing.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchPostThread cross-origin guard (M3)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns reply from same origin as a full object", async () => {
    process.env.MCP_THREAD_CROSS_ORIGIN_FETCH = "false";
    server.use(
      http.get("https://a.test/post/1", () =>
        HttpResponse.json({
          id: "https://a.test/post/1",
          type: "Note",
          replies: "https://a.test/post/1/replies",
        }),
      ),
      http.get("https://a.test/post/1/replies", () =>
        HttpResponse.json({
          id: "https://a.test/post/1/replies",
          type: "OrderedCollection",
          orderedItems: ["https://a.test/post/2"],
        }),
      ),
      http.get("https://a.test/post/2", () =>
        HttpResponse.json({ id: "https://a.test/post/2", type: "Note", content: "hi" }),
      ),
    );
    const { RemoteActivityPubClient } = await import("../../src/activitypub/remote-client.js");
    const client = new RemoteActivityPubClient();
    const thread = await client.fetchPostThread("https://a.test/post/1", {
      depth: 2,
      maxReplies: 10,
    });
    expect(thread.replies.some((r) => r.id === "https://a.test/post/2")).toBe(true);
  });

  it("returns cross-origin reply as a stub (not fetched) when gate is off", async () => {
    process.env.MCP_THREAD_CROSS_ORIGIN_FETCH = "false";
    server.use(
      http.get("https://a.test/post/1", () =>
        HttpResponse.json({
          id: "https://a.test/post/1",
          type: "Note",
          replies: "https://a.test/post/1/replies",
        }),
      ),
      http.get("https://a.test/post/1/replies", () =>
        HttpResponse.json({
          id: "https://a.test/post/1/replies",
          type: "OrderedCollection",
          orderedItems: ["https://b.test/post/9"],
        }),
      ),
    );
    // Spy on fetch to assert b.test is never contacted
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { RemoteActivityPubClient } = await import("../../src/activitypub/remote-client.js");
    const client = new RemoteActivityPubClient();
    const thread = await client.fetchPostThread("https://a.test/post/1", {
      depth: 2,
      maxReplies: 10,
    });

    // Verify b.test was never fetched
    const bTestCalls = fetchSpy.mock.calls.filter((args) => {
      try {
        return new URL(String(args[0])).hostname === "b.test";
      } catch {
        return false;
      }
    });
    expect(bTestCalls).toHaveLength(0);

    const stub = thread.replies.find((r) => r.id === "https://b.test/post/9");
    expect(stub).toBeDefined();
    expect((stub as { fetched?: boolean }).fetched).toBe(false);
  });

  it("does not fetch a cross-origin ancestor (inReplyTo) when the gate is off", async () => {
    process.env.MCP_THREAD_CROSS_ORIGIN_FETCH = "false";
    server.use(
      // Root post on a.test replies to a post on b.test — an attacker-controlled
      // root can point its inReplyTo chain at any host.
      http.get("https://a.test/post/1", () =>
        HttpResponse.json({
          id: "https://a.test/post/1",
          type: "Note",
          inReplyTo: "https://b.test/post/parent",
        }),
      ),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { RemoteActivityPubClient } = await import("../../src/activitypub/remote-client.js");
    const client = new RemoteActivityPubClient();
    const thread = await client.fetchPostThread("https://a.test/post/1", {
      depth: 1,
      maxReplies: 10,
    });

    // b.test must never be contacted, and the off-origin ancestor must not appear.
    const bTestCalls = fetchSpy.mock.calls.filter((args) => {
      try {
        return new URL(String(args[0])).hostname === "b.test";
      } catch {
        return false;
      }
    });
    expect(bTestCalls).toHaveLength(0);
    expect(thread.ancestors.some((a) => a.id === "https://b.test/post/parent")).toBe(false);
  });

  it("does not fetch a cross-origin replies-collection URL when the gate is off", async () => {
    process.env.MCP_THREAD_CROSS_ORIGIN_FETCH = "false";
    server.use(
      // The root post's `replies` is attacker-controlled and can point at any
      // host. With the gate off, the replies-collection itself must not be
      // fetched cross-origin — otherwise reading any thread leaks a beacon to an
      // attacker-chosen host and yields a fetch-amplification primitive.
      http.get("https://a.test/post/1", () =>
        HttpResponse.json({
          id: "https://a.test/post/1",
          type: "Note",
          replies: "https://evil.test/collection",
        }),
      ),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { RemoteActivityPubClient } = await import("../../src/activitypub/remote-client.js");
    const client = new RemoteActivityPubClient();
    const thread = await client.fetchPostThread("https://a.test/post/1", {
      depth: 2,
      maxReplies: 10,
    });

    const evilCalls = fetchSpy.mock.calls.filter((args) => {
      try {
        return new URL(String(args[0])).hostname === "evil.test";
      } catch {
        return false;
      }
    });
    expect(evilCalls).toHaveLength(0);
    expect(thread.replies).toHaveLength(0);
  });

  it("caps total replies to THREAD_MAX_REPLIES", async () => {
    process.env.MCP_THREAD_MAX_REPLIES = "3";
    const ids = Array.from({ length: 10 }, (_, i) => `https://a.test/post/r${i}`);
    server.use(
      http.get("https://a.test/post/1", () =>
        HttpResponse.json({
          id: "https://a.test/post/1",
          type: "Note",
          replies: "https://a.test/post/1/replies",
        }),
      ),
      http.get("https://a.test/post/1/replies", () =>
        HttpResponse.json({
          id: "https://a.test/post/1/replies",
          type: "OrderedCollection",
          orderedItems: ids,
        }),
      ),
      ...ids.map((id) => http.get(id, () => HttpResponse.json({ id, type: "Note", content: "x" }))),
    );
    const { RemoteActivityPubClient } = await import("../../src/activitypub/remote-client.js");
    const client = new RemoteActivityPubClient();
    const thread = await client.fetchPostThread("https://a.test/post/1", {
      depth: 1,
      maxReplies: 100,
    });
    expect(thread.replies.length).toBe(3);
  });
});
