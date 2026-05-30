import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as followReqs from "../../src/auth/mastodon-features/follow-requests.js";
import * as profile from "../../src/auth/mastodon-features/profile.js";

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

const accountInfo = {
  id: "1",
  username: "u",
  acct: "u",
  url: "https://m.test/@u",
  followers_count: 1,
  following_count: 2,
  statuses_count: 3,
};

const relationship = {
  id: "42",
  following: false,
  followed_by: true,
  blocking: false,
  blocked_by: false,
  muting: false,
  muting_notifications: false,
  requested: false,
  domain_blocking: false,
  endorsed: false,
};

describe("profile.updateProfile", () => {
  it("PATCHes update_credentials with fields_attributes", async () => {
    let method: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch("https://m.test/api/v1/accounts/update_credentials", async ({ request }) => {
        method = request.method;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(accountInfo);
      }),
    );
    const info = await profile.updateProfile(account, {
      displayName: "New Name",
      note: "bio",
      fields: [{ name: "Web", value: "https://x.test" }],
    });
    expect(method).toBe("PATCH");
    expect(body?.display_name).toBe("New Name");
    expect((body?.fields_attributes as unknown[]).length).toBe(1);
    expect(info.id).toBe("1");
  });
});

describe("follow-requests", () => {
  it("lists follow requests", async () => {
    server.use(
      http.get("https://m.test/api/v1/follow_requests", () =>
        HttpResponse.json([{ id: "42", username: "bob", acct: "bob", url: "https://m.test/@bob" }]),
      ),
    );
    expect((await followReqs.getFollowRequests(account))[0].username).toBe("bob");
  });

  it("accepts a follow request", async () => {
    server.use(
      http.post("https://m.test/api/v1/follow_requests/42/authorize", () =>
        HttpResponse.json({ ...relationship, followed_by: true }),
      ),
    );
    expect((await followReqs.acceptFollowRequest(account, "42")).followed_by).toBe(true);
  });

  it("rejects a follow request", async () => {
    server.use(
      http.post("https://m.test/api/v1/follow_requests/42/reject", () =>
        HttpResponse.json(relationship),
      ),
    );
    expect((await followReqs.rejectFollowRequest(account, "42")).id).toBe("42");
  });
});
