import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MastodonOAuthProvider } from "../../src/auth/login/mastodon-oauth.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const provider = new MastodonOAuthProvider();

describe("MastodonOAuthProvider.begin", () => {
  it("registers an app and returns an OOB authorize URL", async () => {
    let appBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://mastodon.social/api/v1/apps", async ({ request }) => {
        appBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ client_id: "cid", client_secret: "csecret" });
      }),
    );
    const { authorizeUrl, pending } = await provider.begin("mastodon.social");
    expect(appBody?.redirect_uris).toBe("urn:ietf:wg:oauth:2.0:oob");
    expect(pending).toMatchObject({ kind: "mastodon", clientId: "cid", clientSecret: "csecret" });
    const u = new URL(authorizeUrl);
    expect(u.origin).toBe("https://mastodon.social");
    expect(u.pathname).toBe("/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe("urn:ietf:wg:oauth:2.0:oob");
  });
});

describe("MastodonOAuthProvider.complete", () => {
  const pending = {
    kind: "mastodon" as const,
    instance: "mastodon.social",
    clientId: "cid",
    clientSecret: "csecret",
  };

  it("exchanges the code for a token", async () => {
    let tokenBody: Record<string, unknown> | undefined;
    server.use(
      http.post("https://mastodon.social/oauth/token", async ({ request }) => {
        tokenBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ access_token: "at", token_type: "Bearer" });
      }),
    );
    const result = await provider.complete(pending, "the-code");
    expect(tokenBody?.grant_type).toBe("authorization_code");
    expect(tokenBody?.code).toBe("the-code");
    expect(result).toEqual({ accessToken: "at", tokenType: "Bearer" });
  });

  it("throws when code is missing", async () => {
    await expect(provider.complete(pending)).rejects.toThrow(/code/i);
  });
});
