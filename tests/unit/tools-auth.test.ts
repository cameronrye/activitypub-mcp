import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/login/login-manager.js", () => ({
  beginLogin: vi.fn(),
  completeLogin: vi.fn(),
}));

import { beginLogin, completeLogin } from "../../src/auth/login/login-manager.js";
import { __handleCompleteLogin, __handleStartLogin } from "../../src/mcp/tools-auth.js";

describe("start-login tool handler", () => {
  it("returns the authorize URL and loginId without errors", async () => {
    vi.mocked(beginLogin).mockResolvedValue({
      loginId: "lid",
      authorizeUrl: "https://m.test/oauth/authorize?x=1",
      kind: "mastodon",
    });
    const res = await __handleStartLogin({ instance: "m.test" });
    const text = res.content[0].text as string;
    expect(text).toContain("https://m.test/oauth/authorize");
    expect(text).toContain("lid");
    expect(res.isError).toBeFalsy();
  });
});

describe("complete-login tool handler", () => {
  it("reports success without echoing a token", async () => {
    vi.mocked(completeLogin).mockResolvedValue({
      accountId: "mastodon:m.test:alice",
      username: "alice",
      instance: "m.test",
      isActive: true,
    });
    const res = await __handleCompleteLogin({ loginId: "lid", code: "c" });
    const text = res.content[0].text as string;
    expect(text).toContain("alice");
    expect(text).toContain("mastodon:m.test:alice");
    expect(text).not.toMatch(/token/i);
  });

  it("surfaces errors as isError", async () => {
    vi.mocked(completeLogin).mockRejectedValue(new Error("Unknown or expired login session."));
    const res = await __handleCompleteLogin({ loginId: "bad" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text as string).toContain("expired");
  });
});
