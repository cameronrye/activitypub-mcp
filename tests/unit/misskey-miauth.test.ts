import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MisskeyMiAuthProvider } from "../../src/auth/login/misskey-miauth.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const provider = new MisskeyMiAuthProvider();

describe("MisskeyMiAuthProvider.begin", () => {
  it("builds a /miauth/<uuid> URL with permissions", async () => {
    const { authorizeUrl, pending } = await provider.begin("misskey.io");
    expect(pending.kind).toBe("misskey");
    const u = new URL(authorizeUrl);
    expect(u.origin).toBe("https://misskey.io");
    expect(u.pathname).toBe(`/miauth/${(pending as { uuid: string }).uuid}`);
    expect(u.searchParams.get("permission")).toContain("write:notes");
  });
});

describe("MisskeyMiAuthProvider.complete", () => {
  const pending = { kind: "misskey" as const, instance: "misskey.io", uuid: "abc-uuid" };

  it("checks the session and returns the token", async () => {
    server.use(
      http.post("https://misskey.io/api/miauth/abc-uuid/check", () =>
        HttpResponse.json({ ok: true, token: "mk-token" }),
      ),
    );
    const result = await provider.complete(pending);
    expect(result).toEqual({ accessToken: "mk-token", tokenType: "Bearer" });
  });

  it("throws when the session is not approved", async () => {
    server.use(
      http.post("https://misskey.io/api/miauth/abc-uuid/check", () =>
        HttpResponse.json({ ok: false }),
      ),
    );
    await expect(provider.complete(pending)).rejects.toThrow(/not approved|ok/i);
  });
});
