import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MastodonOAuthStrategy } from "../../src/auth/login/mastodon-oauth.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
  resolveAndPin: vi.fn().mockResolvedValue({}),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const strategy = new MastodonOAuthStrategy();

function ctx(overrides: Partial<Parameters<typeof strategy.authorize>[0]> = {}) {
  return {
    instance: "mastodon.test",
    redirectUri: "http://127.0.0.1:7777/callback",
    scopes: ["read", "write", "follow"],
    openBrowser: vi.fn().mockResolvedValue(undefined),
    // Default: hand back a code + the state the strategy generated.
    waitForCallback: vi.fn(async (exp: { state?: string }) => {
      const p = new URLSearchParams();
      p.set("code", "auth-code");
      if (exp.state) p.set("state", exp.state);
      return p;
    }),
    ...overrides,
  };
}

describe("MastodonOAuthStrategy.authorize", () => {
  it("registers an app, opens authorize with PKCE, exchanges the code, and returns a LoginResult", async () => {
    let appBody = "";
    let tokenBody = "";
    server.use(
      http.post("https://mastodon.test/api/v1/apps", async ({ request }) => {
        appBody = await request.text();
        return HttpResponse.json({ client_id: "cid", client_secret: "csecret" });
      }),
      http.post("https://mastodon.test/oauth/token", async ({ request }) => {
        tokenBody = await request.text();
        return HttpResponse.json({
          access_token: "tok",
          token_type: "Bearer",
          scope: "read write follow",
        });
      }),
      http.get("https://mastodon.test/api/v1/accounts/verify_credentials", () =>
        HttpResponse.json({
          id: "1",
          username: "alice",
          acct: "alice",
          url: "https://mastodon.test/@alice",
        }),
      ),
    );

    const c = ctx();
    const result = await strategy.authorize(c);

    expect(appBody).toContain("client_name=activitypub-mcp");
    expect(appBody).toContain(encodeURIComponent("http://127.0.0.1:7777/callback"));
    // Authorize URL carries PKCE + state.
    const openedUrl = (c.openBrowser as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(openedUrl).toContain("code_challenge=");
    expect(openedUrl).toContain("code_challenge_method=S256");
    expect(openedUrl).toContain("state=");
    // Token exchange includes the verifier + the code.
    expect(tokenBody).toContain("grant_type=authorization_code");
    expect(tokenBody).toContain("code=auth-code");
    expect(tokenBody).toContain("code_verifier=");
    expect(result).toMatchObject({
      instance: "mastodon.test",
      username: "alice",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: ["read", "write", "follow"],
      clientId: "cid",
      clientSecret: "csecret",
    });
  });

  it("rejects when the app registration fails with the platform error", async () => {
    server.use(
      http.post("https://mastodon.test/api/v1/apps", () =>
        HttpResponse.json({ error: "bad client" }, { status: 422 }),
      ),
    );
    await expect(strategy.authorize(ctx())).rejects.toThrow(/bad client|422/);
  });

  it("rejects on an issuer (iss) mismatch (mix-up defense)", async () => {
    server.use(
      http.post("https://mastodon.test/api/v1/apps", () =>
        HttpResponse.json({ client_id: "cid", client_secret: "csecret" }),
      ),
    );
    await expect(
      strategy.authorize(
        ctx({
          waitForCallback: vi.fn(async (exp: { state?: string }) => {
            const p = new URLSearchParams();
            p.set("code", "auth-code");
            if (exp.state) p.set("state", exp.state);
            p.set("iss", "https://evil.test"); // wrong issuer host
            return p;
          }),
        }),
      ),
    ).rejects.toThrow(/issuer mismatch|mix-up/i);
  });
});

describe("MastodonOAuthStrategy.revoke", () => {
  it("posts client creds + token to /oauth/revoke", async () => {
    let body = "";
    server.use(
      http.post("https://mastodon.test/oauth/revoke", async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({});
      }),
    );
    await strategy.revoke({
      id: "alice@mastodon.test",
      instance: "mastodon.test",
      username: "alice",
      accessToken: "tok",
      tokenType: "Bearer",
      scopes: [],
      clientId: "cid",
      clientSecret: "csecret",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(body).toContain("token=tok");
    expect(body).toContain("client_id=cid");
    expect(body).toContain("client_secret=csecret");
  });
});
