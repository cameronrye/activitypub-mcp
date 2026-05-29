import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/account-manager.js", () => ({
  accountManager: { getActiveAccount: vi.fn(), getAccount: vi.fn() },
}));
vi.mock("../../src/auth/adapters/resolve.js", () => ({ resolveSoftwareKind: vi.fn() }));

import { accountManager } from "../../src/auth/account-manager.js";
import { resolveSoftwareKind } from "../../src/auth/adapters/resolve.js";
import { requireMastodonAccount } from "../../src/auth/mastodon-features/guard.js";
import { UnsupportedOnPlatformError } from "../../src/utils/errors.js";

const acct = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

afterEach(() => vi.clearAllMocks());

describe("requireMastodonAccount", () => {
  it("returns the active account when it is a Mastodon-API instance", async () => {
    vi.mocked(accountManager.getActiveAccount).mockReturnValue(acct);
    vi.mocked(resolveSoftwareKind).mockResolvedValue("mastodon");
    expect(await requireMastodonAccount("edit-post")).toBe(acct);
  });

  it("resolves a specific account by id", async () => {
    vi.mocked(accountManager.getAccount).mockReturnValue(acct);
    vi.mocked(resolveSoftwareKind).mockResolvedValue("mastodon");
    expect(await requireMastodonAccount("edit-post", "a")).toBe(acct);
    expect(accountManager.getAccount).toHaveBeenCalledWith("a");
  });

  it("throws UnsupportedOnPlatformError for a Misskey account", async () => {
    vi.mocked(accountManager.getActiveAccount).mockReturnValue(acct);
    vi.mocked(resolveSoftwareKind).mockResolvedValue("misskey");
    await expect(requireMastodonAccount("edit-post")).rejects.toBeInstanceOf(
      UnsupportedOnPlatformError,
    );
  });

  it("throws when no account is configured", async () => {
    vi.mocked(accountManager.getActiveAccount).mockReturnValue(undefined);
    await expect(requireMastodonAccount("edit-post")).rejects.toThrow(/No authenticated account/);
  });
});
