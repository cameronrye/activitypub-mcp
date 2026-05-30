/**
 * Tests for write-adapter resolution by detected instance software.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/discovery/nodeinfo.js", () => ({
  getInstanceSoftware: vi.fn(),
}));

import { mastodonWriteAdapter } from "../../src/auth/adapters/mastodon-adapter.js";
import { misskeyWriteAdapter } from "../../src/auth/adapters/misskey-adapter.js";
import { resolveSoftwareKind, resolveWriteAdapter } from "../../src/auth/adapters/resolve.js";
import { getInstanceSoftware } from "../../src/discovery/nodeinfo.js";

const account = {
  id: "a",
  instance: "example.test",
  accessToken: "t",
  tokenType: "Bearer",
  username: "u",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

function detected(name: string | null) {
  return {
    domain: "example.test",
    detection: name ? "success" : "unavailable",
    software: name ? { name, version: "1.0" } : null,
    protocols: name ? ["activitypub"] : null,
    openRegistrations: null,
  };
}

afterEach(() => vi.clearAllMocks());

describe("resolveSoftwareKind", () => {
  it.each([
    ["misskey", "misskey"],
    ["Misskey", "misskey"],
    ["foundkey", "misskey"],
    ["mastodon", "mastodon"],
    ["pleroma", "mastodon"],
    ["akkoma", "mastodon"],
    ["sharkey", "mastodon"],
    ["firefish", "mastodon"],
    ["iceshrimp", "mastodon"],
    ["gotosocial", "mastodon"],
    ["totally-unknown", "mastodon"],
  ])("maps software %s -> %s", async (name, kind) => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected(name) as never);
    expect(await resolveSoftwareKind(account)).toBe(kind);
  });

  it("defaults to mastodon when detection is unavailable", async () => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected(null) as never);
    expect(await resolveSoftwareKind(account)).toBe("mastodon");
  });
});

describe("resolveWriteAdapter", () => {
  it("returns the Misskey adapter for misskey", async () => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected("misskey") as never);
    expect(await resolveWriteAdapter(account)).toBe(misskeyWriteAdapter);
  });
  it("returns the Mastodon adapter otherwise", async () => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected("pleroma") as never);
    expect(await resolveWriteAdapter(account)).toBe(mastodonWriteAdapter);
  });
});
