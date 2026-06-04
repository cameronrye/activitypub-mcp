import { describe, expect, it } from "vitest";
import { classifySoftwareKind, MISSKEY_FAMILY } from "../../src/discovery/software-kind.js";

/**
 * Single source of truth for fediverse software routing, shared by the read
 * adapter, the write adapter resolver, and the login-strategy resolver. Only
 * Misskey-family software (no Mastodon-compatible API) routes to "misskey";
 * everything else — including Mastodon-API-compatible forks (Sharkey/Firefish/
 * Iceshrimp), Pleroma/Akkoma/GoToSocial, and undetected software — is "mastodon".
 */
describe("classifySoftwareKind", () => {
  it.each([
    ["misskey", "misskey"],
    ["Misskey", "misskey"],
    ["foundkey", "misskey"],
    ["mastodon", "mastodon"],
    ["pleroma", "mastodon"],
    ["akkoma", "mastodon"],
    ["sharkey", "mastodon"],
    ["firefish", "mastodon"],
    ["gotosocial", "mastodon"],
    ["totally-unknown", "mastodon"],
  ])("classifies %s as %s", (name, expected) => {
    expect(classifySoftwareKind(name)).toBe(expected);
  });

  it("defaults to mastodon for null/undefined (detection failure)", () => {
    expect(classifySoftwareKind(null)).toBe("mastodon");
    expect(classifySoftwareKind(undefined)).toBe("mastodon");
  });

  it("keeps the Misskey family limited to non-Mastodon-API software", () => {
    expect([...MISSKEY_FAMILY].sort()).toEqual(["foundkey", "misskey"]);
  });
});
