import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

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
    const bTestCalls = fetchSpy.mock.calls.filter((args) =>
      String(args[0]).startsWith("https://b.test"),
    );
    expect(bTestCalls).toHaveLength(0);

    const stub = thread.replies.find((r) => r.id === "https://b.test/post/9");
    expect(stub).toBeDefined();
    expect((stub as { fetched?: boolean }).fetched).toBe(false);
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
    expect(thread.replies.length).toBeLessThanOrEqual(3);
  });
});
