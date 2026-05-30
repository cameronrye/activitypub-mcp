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
    lb.waitForCallback({ state: "abc" }).then(() => {
      resolved = true;
    });
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

  it("rejects after the timeout", async () => {
    const lb = await createLoopbackServer();
    await expect(lb.waitForCallback({ state: "abc", timeoutMs: 30 })).rejects.toThrow(/timed out/i);
    lb.close();
  });
});
