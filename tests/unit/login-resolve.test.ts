import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/discovery/nodeinfo.js", () => ({
  getInstanceSoftware: vi.fn(),
}));

import { mastodonOAuthStrategy } from "../../src/auth/login/mastodon-oauth.js";
import { misskeyMiAuthStrategy } from "../../src/auth/login/miauth.js";
import { resolveLoginStrategy } from "../../src/auth/login/resolve.js";
import { getInstanceSoftware } from "../../src/discovery/nodeinfo.js";

function detected(name: string | null) {
  return {
    domain: "x.test",
    detection: name ? "success" : "unavailable",
    software: name ? { name, version: "1" } : null,
    protocols: name ? ["activitypub"] : null,
    openRegistrations: null,
  };
}

afterEach(() => vi.clearAllMocks());

describe("resolveLoginStrategy", () => {
  it.each([
    ["misskey", misskeyMiAuthStrategy],
    ["Misskey", misskeyMiAuthStrategy],
    ["foundkey", misskeyMiAuthStrategy],
    ["mastodon", mastodonOAuthStrategy],
    ["pleroma", mastodonOAuthStrategy],
    ["sharkey", mastodonOAuthStrategy],
    ["firefish", mastodonOAuthStrategy],
    ["gotosocial", mastodonOAuthStrategy],
    ["totally-unknown", mastodonOAuthStrategy],
  ])("maps %s to the right strategy", async (name, expected) => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected(name) as never);
    expect(await resolveLoginStrategy("x.test")).toBe(expected);
  });

  it("defaults to Mastodon when detection is unavailable", async () => {
    vi.mocked(getInstanceSoftware).mockResolvedValue(detected(null) as never);
    expect(await resolveLoginStrategy("x.test")).toBe(mastodonOAuthStrategy);
  });
});
