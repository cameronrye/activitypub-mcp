import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/adapters/resolve.js", () => ({
  resolveSoftwareKind: vi.fn(),
  resolveWriteAdapter: vi.fn(),
}));
vi.mock("../../src/auth/login/mastodon-oauth.js", () => ({
  mastodonOAuthProvider: { begin: vi.fn(), complete: vi.fn() },
}));
vi.mock("../../src/auth/login/misskey-miauth.js", () => ({
  misskeyMiAuthProvider: { begin: vi.fn(), complete: vi.fn() },
}));
vi.mock("../../src/auth/account-manager.js", () => ({
  accountManager: { addAndPersistAccount: vi.fn(), hasAccounts: vi.fn().mockReturnValue(false) },
}));

import { accountManager } from "../../src/auth/account-manager.js";
import { resolveSoftwareKind, resolveWriteAdapter } from "../../src/auth/adapters/resolve.js";
import { __clearPending, beginLogin, completeLogin } from "../../src/auth/login/login-manager.js";
import { mastodonOAuthProvider } from "../../src/auth/login/mastodon-oauth.js";

beforeEach(() => {
  __clearPending();
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("beginLogin", () => {
  it("selects the Mastodon provider and returns a loginId + URL", async () => {
    vi.mocked(resolveSoftwareKind).mockResolvedValue("mastodon");
    vi.mocked(mastodonOAuthProvider.begin).mockResolvedValue({
      authorizeUrl: "https://m.test/oauth/authorize?x=1",
      pending: { kind: "mastodon", instance: "m.test", clientId: "c", clientSecret: "s" },
    });
    const res = await beginLogin("m.test");
    expect(res.kind).toBe("mastodon");
    expect(res.authorizeUrl).toContain("/oauth/authorize");
    expect(typeof res.loginId).toBe("string");
  });
});

describe("completeLogin", () => {
  it("completes, verifies, and persists the account", async () => {
    vi.mocked(resolveSoftwareKind).mockResolvedValue("mastodon");
    vi.mocked(mastodonOAuthProvider.begin).mockResolvedValue({
      authorizeUrl: "https://m.test/oauth/authorize",
      pending: { kind: "mastodon", instance: "m.test", clientId: "c", clientSecret: "s" },
    });
    vi.mocked(mastodonOAuthProvider.complete).mockResolvedValue({
      accessToken: "at",
      tokenType: "Bearer",
    });
    vi.mocked(resolveWriteAdapter).mockResolvedValue({
      verifyCredentials: vi.fn().mockResolvedValue({ id: "1", username: "alice", acct: "alice" }),
    } as never);
    vi.mocked(accountManager.addAndPersistAccount).mockResolvedValue({} as never);

    const { loginId } = await beginLogin("m.test");
    const res = await completeLogin(loginId, "code123");
    expect(mastodonOAuthProvider.complete).toHaveBeenCalled();
    expect(accountManager.addAndPersistAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mastodon:m.test:alice",
        instance: "m.test",
        username: "alice",
        accessToken: "at",
      }),
    );
    expect(res.username).toBe("alice");
    expect((res as Record<string, unknown>).accessToken).toBeUndefined();
  });

  it("throws for an unknown loginId", async () => {
    await expect(completeLogin("nope")).rejects.toThrow(/login session/i);
  });
});
