/**
 * Tests for MisskeyWriteAdapter.
 */

import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MisskeyWriteAdapter } from "../../src/auth/adapters/misskey-adapter.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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

    const status = await adapter.createPost(account, {
      content: "hello mfm",
      visibility: "unlisted",
      spoilerText: "cw",
    });

    expect(received?.text).toBe("hello mfm");
    expect(received?.visibility).toBe("home"); // unlisted -> home
    expect(received?.cw).toBe("cw");
    expect(status.id).toBe("note1");
    expect(status.content).toBe("hello mfm");
    expect(status.visibility).toBe("unlisted"); // home -> unlisted
    expect(status.reblogs_count).toBe(2);
    expect(status.favourites_count).toBe(4); // 3 + 1 reactions
    expect(status.replies_count).toBe(1);
    expect(status.account.acct).toBe("alice");
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
