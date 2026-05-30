import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as hashtags from "../../src/auth/mastodon-features/hashtags.js";
import * as posts from "../../src/auth/mastodon-features/posts.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const account = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

const status = {
  id: "s1",
  uri: "https://m.test/s1",
  url: "https://m.test/s1",
  created_at: "2026-01-01T00:00:00Z",
  content: "<p>hi</p>",
  visibility: "public",
  sensitive: false,
  spoiler_text: "",
  reblogs_count: 0,
  favourites_count: 0,
  replies_count: 0,
  account: { id: "1", username: "u", acct: "u", url: "https://m.test/@u" },
};

describe("posts.editPost", () => {
  it("PUTs the new content and returns the Status", async () => {
    let method: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.put("https://m.test/api/v1/statuses/s1", async ({ request }) => {
        method = request.method;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...status, content: "<p>edited</p>" });
      }),
    );
    const result = await posts.editPost(account, "s1", { status: "edited" });
    expect(method).toBe("PUT");
    expect(body?.status).toBe("edited");
    expect(result.content).toBe("<p>edited</p>");
  });
});

describe("posts.pinPost / unpinPost", () => {
  it("pins via POST /pin", async () => {
    server.use(http.post("https://m.test/api/v1/statuses/s1/pin", () => HttpResponse.json(status)));
    expect((await posts.pinPost(account, "s1")).id).toBe("s1");
  });
  it("unpins via POST /unpin", async () => {
    server.use(
      http.post("https://m.test/api/v1/statuses/s1/unpin", () => HttpResponse.json(status)),
    );
    expect((await posts.unpinPost(account, "s1")).id).toBe("s1");
  });
});

describe("hashtags.followHashtag / unfollowHashtag", () => {
  it("follows, stripping a leading # and encoding the path", async () => {
    server.use(
      http.post("https://m.test/api/v1/tags/typescript/follow", () =>
        HttpResponse.json({
          name: "typescript",
          url: "https://m.test/tags/typescript",
          following: true,
        }),
      ),
    );
    const tag = await hashtags.followHashtag(account, "#typescript");
    expect(tag.name).toBe("typescript");
    expect(tag.following).toBe(true);
  });
  it("unfollows", async () => {
    server.use(
      http.post("https://m.test/api/v1/tags/ts/unfollow", () =>
        HttpResponse.json({ name: "ts", url: "https://m.test/tags/ts", following: false }),
      ),
    );
    expect((await hashtags.unfollowHashtag(account, "ts")).following).toBe(false);
  });
});
