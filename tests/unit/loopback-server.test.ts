import { describe, expect, it } from "vitest";
import { createLoopbackServer } from "../../src/auth/login/loopback-server.js";

describe("createLoopbackServer", () => {
  it("binds 127.0.0.1 with an ephemeral port and a /callback redirect URI", async () => {
    const lb = await createLoopbackServer();
    try {
      expect(lb.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    } finally {
      lb.close();
    }
  });

  it("resolves with the query when state matches", async () => {
    const lb = await createLoopbackServer();
    const pending = lb.waitForCallback({ state: "abc" });
    await fetch(`${lb.redirectUri}?code=xyz&state=abc`);
    const params = await pending;
    expect(params.get("code")).toBe("xyz");
    lb.close();
  });

  it("does NOT resolve on a mismatched state (responds 404)", async () => {
    const lb = await createLoopbackServer();
    let resolved = false;
    lb.waitForCallback({ state: "abc" })
      .then(() => {
        resolved = true;
      })
      .catch(() => {}); // close() doesn't reject today; stay unhandled-rejection-safe
    const res = await fetch(`${lb.redirectUri}?code=xyz&state=WRONG`);
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    lb.close();
  });

  it("matches on session for the MiAuth flow", async () => {
    const lb = await createLoopbackServer();
    const pending = lb.waitForCallback({ session: "sess-1" });
    await fetch(`${lb.redirectUri}?session=sess-1`);
    const params = await pending;
    expect(params.get("session")).toBe("sess-1");
    lb.close();
  });

  it("does not respond 200 'Authorized' when the provider returns an error", async () => {
    // The user clicked Deny: the provider redirects with ?error=... and no code.
    // The state still matches, but the loopback must NOT serve the success page —
    // otherwise the browser says "Authorized" while the login actually failed.
    const lb = await createLoopbackServer();
    const pending = lb.waitForCallback({ state: "abc" });
    const res = await fetch(`${lb.redirectUri}?error=access_denied&state=abc`);
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("Authorized");
    // Still resolves so the strategy can surface the precise error to the user.
    const params = await pending;
    expect(params.get("error")).toBe("access_denied");
    lb.close();
  });

  it("does not respond 200 when a Mastodon callback carries neither code nor error", async () => {
    const lb = await createLoopbackServer();
    const pending = lb.waitForCallback({ state: "abc" });
    const res = await fetch(`${lb.redirectUri}?state=abc`);
    expect(res.status).toBe(400);
    const params = await pending;
    expect(params.has("code")).toBe(false);
    lb.close();
  });

  it("rejects after the timeout", async () => {
    const lb = await createLoopbackServer();
    await expect(lb.waitForCallback({ state: "abc", timeoutMs: 30 })).rejects.toThrow(/timed out/i);
    lb.close();
  });
});
