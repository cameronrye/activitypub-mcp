import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as filters from "../../src/auth/mastodon-features/filters.js";

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

const filter = {
  id: "f1",
  title: "Spoilers",
  context: ["home"],
  filter_action: "warn",
  keywords: [{ id: "k1", keyword: "spoiler", whole_word: true }],
};

describe("filters", () => {
  it("lists filters", async () => {
    server.use(http.get("https://m.test/api/v2/filters", () => HttpResponse.json([filter])));
    expect(await filters.getFilters(account)).toHaveLength(1);
  });

  it("creates a filter with keywords_attributes", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("https://m.test/api/v2/filters", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(filter);
      }),
    );
    const created = await filters.createFilter(account, {
      title: "Spoilers",
      context: ["home"],
      keywords: ["spoiler"],
    });
    expect(body?.context).toEqual(["home"]);
    expect(body?.filter_action).toBe("warn");
    expect((body?.keywords_attributes as unknown[]).length).toBe(1);
    expect(created.id).toBe("f1");
  });

  it("deletes a filter", async () => {
    server.use(http.delete("https://m.test/api/v2/filters/f1", () => HttpResponse.json({})));
    await expect(filters.deleteFilter(account, "f1")).resolves.toBeUndefined();
  });
});
