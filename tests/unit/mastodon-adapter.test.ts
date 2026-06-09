/**
 * Tests for MastodonWriteAdapter — focused on the createPost result contract,
 * including scheduled posts. A scheduled post comes back as a ScheduledStatus
 * (no uri/content/visibility), so createPost must return a discriminated result
 * rather than forcing the response through StatusSchema (which would reject a
 * successfully-scheduled post and report a false failure).
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { MastodonWriteAdapter } from "../../src/auth/adapters/mastodon-adapter.js";
import { server } from "../mocks/server.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
  resolveAndPin: vi.fn().mockResolvedValue({}),
}));

const account = {
  id: "md",
  instance: "mastodon.test",
  accessToken: "tok",
  tokenType: "Bearer",
  username: "alice",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

const adapter = new MastodonWriteAdapter();

const sampleStatus = {
  id: "status1",
  uri: "https://mastodon.test/statuses/status1",
  url: "https://mastodon.test/@alice/status1",
  created_at: "2026-01-01T00:00:00Z",
  content: "<p>hello</p>",
  visibility: "public",
  sensitive: false,
  spoiler_text: "",
  reblogs_count: 0,
  favourites_count: 0,
  replies_count: 0,
  account: { id: "u1", username: "alice", acct: "alice", url: "https://mastodon.test/@alice" },
};

describe("MastodonWriteAdapter.createPost", () => {
  it("returns a published result for an immediate post", async () => {
    server.use(
      http.post("https://mastodon.test/api/v1/statuses", () => HttpResponse.json(sampleStatus)),
    );

    const result = await adapter.createPost(account, { content: "hello" });

    expect(result.kind).toBe("published");
    if (result.kind !== "published") throw new Error("expected published");
    expect(result.status.id).toBe("status1");
    expect(result.status.content).toBe("<p>hello</p>");
  });

  it("returns a scheduled result (not a thrown error) when scheduledAt is set", async () => {
    let received: Record<string, unknown> | undefined;
    server.use(
      http.post("https://mastodon.test/api/v1/statuses", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        // Mastodon returns a ScheduledStatus (no uri/content/visibility/account)
        // when scheduled_at is set to a future time.
        return HttpResponse.json({
          id: "sched1",
          scheduled_at: "2099-01-01T15:00:00.000Z",
          params: { text: "later", visibility: "public" },
          media_attachments: [],
        });
      }),
    );

    const result = await adapter.createPost(account, {
      content: "later",
      scheduledAt: "2099-01-01T15:00:00.000Z",
    });

    expect(received?.scheduled_at).toBe("2099-01-01T15:00:00.000Z");
    expect(result.kind).toBe("scheduled");
    if (result.kind !== "scheduled") throw new Error("expected scheduled");
    expect(result.scheduled.id).toBe("sched1");
    expect(result.scheduled.scheduled_at).toBe("2099-01-01T15:00:00.000Z");
  });
});

describe("MastodonWriteAdapter.createPost idempotency", () => {
  function captureKeys(keys: (string | null)[]) {
    server.use(
      http.post("https://mastodon.test/api/v1/statuses", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key"));
        return HttpResponse.json(sampleStatus);
      }),
    );
  }

  it("sends a content-derived Idempotency-Key so a retried identical post can't duplicate", async () => {
    const keys: (string | null)[] = [];
    captureKeys(keys);

    await adapter.createPost(account, { content: "hello world" });
    await adapter.createPost(account, { content: "hello world" }); // a retry of the same post

    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]); // identical content => same key => Mastodon dedupes
  });

  it("derives a different key for different post content", async () => {
    const keys: (string | null)[] = [];
    captureKeys(keys);

    await adapter.createPost(account, { content: "first" });
    await adapter.createPost(account, { content: "second" });

    expect(keys[0]).not.toBe(keys[1]);
  });

  it("uses an explicit idempotencyKey when the caller supplies one", async () => {
    const keys: (string | null)[] = [];
    captureKeys(keys);

    await adapter.createPost(account, { content: "x", idempotencyKey: "explicit-key" });

    expect(keys[0]).toBe("explicit-key");
  });
});
