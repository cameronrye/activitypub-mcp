import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as lists from "../../src/auth/mastodon-features/lists.js";

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

describe("lists", () => {
  it("creates a list", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("https://m.test/api/v1/lists", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "l1", title: "News" });
      }),
    );
    const list = await lists.createList(account, { title: "News" });
    expect(body?.title).toBe("News");
    expect(list.id).toBe("l1");
  });

  it("gets all lists", async () => {
    server.use(
      http.get("https://m.test/api/v1/lists", () =>
        HttpResponse.json([{ id: "l1", title: "News" }]),
      ),
    );
    expect(await lists.getLists(account)).toHaveLength(1);
  });

  it("updates a list", async () => {
    server.use(
      http.put("https://m.test/api/v1/lists/l1", () =>
        HttpResponse.json({ id: "l1", title: "Tech" }),
      ),
    );
    expect((await lists.updateList(account, "l1", { title: "Tech" })).title).toBe("Tech");
  });

  it("deletes a list", async () => {
    server.use(http.delete("https://m.test/api/v1/lists/l1", () => HttpResponse.json({})));
    await expect(lists.deleteList(account, "l1")).resolves.toBeUndefined();
  });

  it("fetches the list timeline", async () => {
    server.use(
      http.get("https://m.test/api/v1/timelines/list/l1", () =>
        HttpResponse.json([
          {
            id: "s1",
            uri: "https://m.test/s1",
            created_at: "2026-01-01T00:00:00Z",
            content: "<p>x</p>",
            visibility: "public",
            sensitive: false,
            spoiler_text: "",
            reblogs_count: 0,
            favourites_count: 0,
            replies_count: 0,
            account: { id: "1", username: "u", acct: "u", url: "https://m.test/@u" },
          },
        ]),
      ),
    );
    expect(await lists.getListTimeline(account, "l1", { limit: 5 })).toHaveLength(1);
  });

  it("adds and removes list accounts", async () => {
    let addBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://m.test/api/v1/lists/l1/accounts", async ({ request }) => {
        addBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
      http.delete("https://m.test/api/v1/lists/l1/accounts", () => HttpResponse.json({})),
    );
    await lists.addListAccounts(account, "l1", ["42"]);
    expect(addBody?.account_ids).toEqual(["42"]);
    await expect(lists.removeListAccounts(account, "l1", ["42"])).resolves.toBeUndefined();
  });

  it("gets list members", async () => {
    server.use(
      http.get("https://m.test/api/v1/lists/l1/accounts", () =>
        HttpResponse.json([{ id: "42", username: "bob", acct: "bob", url: "https://m.test/@bob" }]),
      ),
    );
    expect((await lists.getListAccounts(account, "l1"))[0].username).toBe("bob");
  });
});
