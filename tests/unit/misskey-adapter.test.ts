/**
 * Tests for MisskeyWriteAdapter.
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { MisskeyWriteAdapter } from "../../src/auth/adapters/misskey-adapter.js";
import { server } from "../mocks/server.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
  resolveAndPin: vi.fn().mockResolvedValue({}),
}));

const account = {
  id: "mk",
  instance: "misskey.test",
  accessToken: "tok",
  tokenType: "Bearer",
  username: "alice",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

const adapter = new MisskeyWriteAdapter();

const sampleNote = {
  id: "note1",
  createdAt: "2026-01-01T00:00:00Z",
  text: "hello mfm",
  cw: null,
  visibility: "home",
  renoteCount: 2,
  repliesCount: 1,
  reactions: { "👍": 3, "🎉": 1 },
  user: { id: "u1", username: "alice", host: null, name: "Alice" },
};

describe("MisskeyWriteAdapter.createPost", () => {
  it("maps visibility and normalizes the created note to a Status", async () => {
    let received: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/notes/create", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ createdNote: sampleNote });
      }),
    );

    const result = await adapter.createPost(account, {
      content: "hello mfm",
      visibility: "unlisted",
      spoilerText: "cw",
    });

    expect(received?.text).toBe("hello mfm");
    expect(received?.visibility).toBe("home"); // unlisted -> home
    expect(received?.cw).toBe("cw");
    expect(result.kind).toBe("published");
    if (result.kind !== "published") throw new Error("expected published");
    const status = result.status;
    expect(status.id).toBe("note1");
    expect(status.content).toBe("hello mfm");
    expect(status.visibility).toBe("unlisted"); // home -> unlisted
    expect(status.reblogs_count).toBe(2);
    expect(status.favourites_count).toBe(4); // 3 + 1 reactions
    expect(status.replies_count).toBe(1);
    expect(status.account.acct).toBe("alice");
  });

  it("rejects scheduledAt without publishing — Misskey core has no schedule API", async () => {
    let createCalled = false;
    server.use(
      http.post("https://misskey.test/api/notes/create", () => {
        createCalled = true;
        return HttpResponse.json({ createdNote: sampleNote });
      }),
    );

    await expect(
      adapter.createPost(account, {
        content: "later",
        scheduledAt: "2099-01-01T15:00:00.000Z",
      }),
    ).rejects.toThrow(/not supported on Misskey/i);

    // The silent-publish bug: a scheduled request must NOT hit notes/create.
    expect(createCalled).toBe(false);
  });

  it("extracts Misskey error messages", async () => {
    server.use(
      http.post("https://misskey.test/api/notes/create", () =>
        HttpResponse.json(
          { error: { message: "Permission denied", code: "PERMISSION" } },
          { status: 403 },
        ),
      ),
    );
    await expect(adapter.createPost(account, { content: "x" })).rejects.toThrow(
      /Permission denied/,
    );
  });
});

describe("MisskeyWriteAdapter.boostPost", () => {
  it("renotes via notes/create with renoteId", async () => {
    let received: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/notes/create", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ createdNote: { ...sampleNote, id: "renote1" } });
      }),
    );
    const status = await adapter.boostPost(account, "note1");
    expect(received?.renoteId).toBe("note1");
    expect(status.id).toBe("renote1");
  });
});

describe("MisskeyWriteAdapter.favouritePost", () => {
  it("creates a default reaction and returns the target note as Status", async () => {
    let reactBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/notes/reactions/create", async ({ request }) => {
        reactBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("https://misskey.test/api/notes/show", () => HttpResponse.json(sampleNote)),
    );
    const status = await adapter.favouritePost(account, "note1");
    expect(reactBody?.noteId).toBe("note1");
    expect(reactBody?.reaction).toBe("👍");
    expect(status.id).toBe("note1");
  });
});

describe("MisskeyWriteAdapter social ops", () => {
  it("follows then normalizes users/relation to a Relationship", async () => {
    let relBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/following/create", () => HttpResponse.json({ id: "u2" })),
      http.post("https://misskey.test/api/users/relation", async ({ request }) => {
        relBody = (await request.json()) as Record<string, unknown>;
        // Misskey returns the relation wrapped in an array for a single userId
        // string (res schema is `oneOf: [object, array]`; the string branch is
        // `getRelation(...).then(it => [it])`).
        return HttpResponse.json([
          {
            isFollowing: true,
            isFollowed: false,
            isBlocking: false,
            isMuted: false,
            hasPendingFollowRequestFromYou: false,
          },
        ]);
      }),
    );
    const rel = await adapter.followAccount(account, "u2");
    expect(relBody?.userId).toBe("u2");
    expect(rel.following).toBe(true);
    expect(rel.muting).toBe(false);
    expect(rel.id).toBe("u2");
  });

  it("mutes an account", async () => {
    server.use(
      http.post(
        "https://misskey.test/api/mute/create",
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.post("https://misskey.test/api/users/relation", () =>
        HttpResponse.json([{ isMuted: true }]),
      ),
    );
    const rel = await adapter.muteAccount(account, "u2");
    expect(rel.muting).toBe(true);
  });
});

describe("MisskeyWriteAdapter account ops", () => {
  it("verifyCredentials maps /api/i to AccountInfo", async () => {
    server.use(
      http.post("https://misskey.test/api/i", () =>
        HttpResponse.json({
          id: "u1",
          username: "alice",
          host: null,
          name: "Alice",
          followersCount: 10,
          followingCount: 5,
          notesCount: 42,
          url: "https://misskey.test/@alice",
        }),
      ),
    );
    const info = await adapter.verifyCredentials(account);
    expect(info.id).toBe("u1");
    expect(info.acct).toBe("alice");
    expect(info.followers_count).toBe(10);
    expect(info.statuses_count).toBe(42);
  });

  it("lookupAccount splits acct into username/host", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/users/show", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "u3",
          username: "bob",
          host: "remote.example",
          url: "https://remote.example/@bob",
        });
      }),
    );
    const r = await adapter.lookupAccount(account, "bob@remote.example");
    expect(body?.username).toBe("bob");
    expect(body?.host).toBe("remote.example");
    expect(r.acct).toBe("bob@remote.example");
  });
});

describe("MisskeyWriteAdapter timeline", () => {
  it("getHomeTimeline normalizes notes", async () => {
    server.use(
      http.post("https://misskey.test/api/notes/timeline", () => HttpResponse.json([sampleNote])),
    );
    const tl = await adapter.getHomeTimeline(account, { limit: 5 });
    expect(tl).toHaveLength(1);
    expect(tl[0].id).toBe("note1");
  });

  it("getHomeTimeline maps maxId/minId to Misskey untilId/sinceId", async () => {
    let received: Record<string, unknown> | undefined;
    server.use(
      http.post("https://misskey.test/api/notes/timeline", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([sampleNote]);
      }),
    );
    // Misskey has no min_id; both Mastodon min_id and since_id mean "newer than",
    // so minId must map to Misskey's sinceId — matching getNotifications.
    await adapter.getHomeTimeline(account, { maxId: "older", minId: "newer" });
    expect(received?.untilId).toBe("older");
    expect(received?.sinceId).toBe("newer");
  });
});
