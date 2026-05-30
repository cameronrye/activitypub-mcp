import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/mastodon-features/guard.js", () => ({
  requireMastodonAccount: vi.fn(),
}));
vi.mock("../../src/auth/mastodon-features/posts.js", () => ({
  editPost: vi.fn(),
  pinPost: vi.fn(),
  unpinPost: vi.fn(),
}));

import { requireMastodonAccount } from "../../src/auth/mastodon-features/guard.js";
import * as posts from "../../src/auth/mastodon-features/posts.js";
import { __handleEditPost } from "../../src/mcp/tools-content.js";

const account = {
  id: "a",
  instance: "m.test",
  username: "u",
  accessToken: "t",
  tokenType: "Bearer",
  scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00Z",
};

describe("edit-post tool handler", () => {
  it("edits and reports success", async () => {
    vi.mocked(requireMastodonAccount).mockResolvedValue(account);
    vi.mocked(posts.editPost).mockResolvedValue({ id: "s1", content: "<p>new</p>" } as never);
    const res = await __handleEditPost({ statusId: "s1", status: "new" });
    expect(posts.editPost).toHaveBeenCalledWith(
      account,
      "s1",
      expect.objectContaining({ status: "new" }),
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text as string).toContain("s1");
  });

  it("returns isError when the guard rejects (Misskey)", async () => {
    const { UnsupportedOnPlatformError } = await import("../../src/utils/errors.js");
    vi.mocked(requireMastodonAccount).mockRejectedValue(
      new UnsupportedOnPlatformError("edit-post", "Misskey"),
    );
    const res = await __handleEditPost({ statusId: "s1", status: "new" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text as string).toContain("not supported on Misskey");
  });
});
