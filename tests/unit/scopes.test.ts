import { describe, expect, it } from "vitest";
import { scopesFor } from "../../src/auth/login/scopes.js";

describe("scopesFor (least-privilege login scopes)", () => {
  it("requests only read for a read-only Mastodon login", () => {
    expect(scopesFor("mastodon", false)).toEqual(["read"]);
  });

  it("includes write for a write-enabled Mastodon login", () => {
    const s = scopesFor("mastodon", true);
    expect(s).toContain("read");
    expect(s).toContain("write");
  });

  it("omits every write:* permission for a read-only Misskey login", () => {
    const s = scopesFor("misskey", false);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((p) => !p.startsWith("write:"))).toBe(true);
  });

  it("includes write:notes for a write-enabled Misskey login", () => {
    expect(scopesFor("misskey", true)).toContain("write:notes");
  });
});
