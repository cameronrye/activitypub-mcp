import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MisskeyMiAuthStrategy } from "../../src/auth/login/miauth.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
  resolveAndPin: vi.fn().mockResolvedValue({}),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const strategy = new MisskeyMiAuthStrategy();

describe("MisskeyMiAuthStrategy.authorize", () => {
  it("opens the miauth consent URL and exchanges the session for a token", async () => {
    server.use(
      http.post("https://misskey.test/api/miauth/:uuid/check", () =>
        HttpResponse.json({ ok: true, token: "mk-token", user: { username: "bob" } }),
      ),
    );

    const openBrowser = vi.fn().mockResolvedValue(undefined);
    const result = await strategy.authorize({
      instance: "misskey.test",
      redirectUri: "http://127.0.0.1:7777/callback",
      scopes: ["write:notes", "read:account"],
      openBrowser,
      // Echo back the session the strategy generated.
      waitForCallback: vi.fn(async (exp: { session?: string }) => {
        const p = new URLSearchParams();
        if (exp.session) p.set("session", exp.session);
        return p;
      }),
    });

    const openedUrl = openBrowser.mock.calls[0][0] as string;
    expect(openedUrl).toMatch(/^https:\/\/misskey\.test\/miauth\/[0-9a-f-]+\?/);
    expect(openedUrl).toContain("name=activitypub-mcp");
    expect(openedUrl).toContain(encodeURIComponent("write:notes,read:account"));
    expect(result).toMatchObject({
      instance: "misskey.test",
      username: "bob",
      accessToken: "mk-token",
      tokenType: "Bearer",
      scopes: ["write:notes", "read:account"],
    });
    expect(result.clientId).toBeUndefined();
  });

  it("rejects when check returns ok:false", async () => {
    server.use(
      http.post("https://misskey.test/api/miauth/:uuid/check", () =>
        HttpResponse.json({ ok: false }),
      ),
    );
    await expect(
      strategy.authorize({
        instance: "misskey.test",
        redirectUri: "http://127.0.0.1:7777/callback",
        scopes: ["write:notes"],
        openBrowser: vi.fn().mockResolvedValue(undefined),
        waitForCallback: vi.fn(async (exp: { session?: string }) => {
          const p = new URLSearchParams();
          if (exp.session) p.set("session", exp.session);
          return p;
        }),
      }),
    ).rejects.toThrow(/authorization (was )?(not approved|failed|denied)|ok:false|not approved/i);
  });

  it("rejects when the check response carries no user identity", async () => {
    server.use(
      http.post("https://misskey.test/api/miauth/:uuid/check", () =>
        HttpResponse.json({ ok: true, token: "mk-token", user: {} }),
      ),
    );
    await expect(
      strategy.authorize({
        instance: "misskey.test",
        redirectUri: "http://127.0.0.1:7777/callback",
        scopes: ["write:notes"],
        openBrowser: vi.fn().mockResolvedValue(undefined),
        waitForCallback: vi.fn(async (exp: { session?: string }) => {
          const p = new URLSearchParams();
          if (exp.session) p.set("session", exp.session);
          return p;
        }),
      }),
    ).rejects.toThrow(/no user identity/i);
  });
});
