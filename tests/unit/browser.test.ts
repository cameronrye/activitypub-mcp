import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
// Controls which lifecycle event the fake child emits (set per test).
let childEvent: { type: "spawn" } | { type: "error"; error: Error } = { type: "spawn" };

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    const handlers: Record<string, (a?: unknown) => void> = {};
    // Fire the configured event asynchronously, like a real child process.
    queueMicrotask(() => {
      if (childEvent.type === "error") handlers.error?.(childEvent.error);
      else handlers.spawn?.();
    });
    return {
      once: (event: string, cb: (a?: unknown) => void) => {
        handlers[event] = cb;
      },
      unref: vi.fn(),
    };
  },
}));

describe("openBrowser", () => {
  beforeEach(() => {
    childEvent = { type: "spawn" };
  });
  afterEach(() => {
    spawnMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("passes the URL as a discrete argv item (no shell string)", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const { openBrowser } = await import(
      /* @vite-ignore */ `../../src/auth/login/browser.js?ts=${Date.now()}`
    );
    const url = "https://x.test/oauth/authorize?state=a&scope=read%20write&x=^%";
    await openBrowser(url);
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe("open");
    expect(args).toContain(url); // exact URL, never interpolated into a shell string
  });

  it("uses xdg-open on linux", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const { openBrowser } = await import(
      /* @vite-ignore */ `../../src/auth/login/browser.js?ts=${Date.now()}`
    );
    await openBrowser("https://x.test/");
    expect(spawnMock.mock.calls[0][0]).toBe("xdg-open");
  });

  it("opens on win32 without routing the URL through cmd's parser", async () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    const { openBrowser } = await import(
      /* @vite-ignore */ `../../src/auth/login/browser.js?ts=${Date.now()}`
    );
    // An OAuth authorize URL always contains '&' separators. `cmd /c start`
    // treats every unquoted '&' as a command separator, truncating the URL at
    // the first one and breaking login on every Windows machine.
    const url = "https://x.test/oauth/authorize?response_type=code&client_id=abc&state=xyz";
    await openBrowser(url);
    const [cmd, args] = spawnMock.mock.calls[0];
    // Must NOT shell out to cmd, where '&' is a metacharacter.
    expect(cmd).not.toBe("cmd");
    expect(cmd).toBe("rundll32");
    // The full URL (every '&' intact) must reach the opener as one discrete arg.
    expect(args).toContain(url);
    expect(args).toEqual(["url.dll,FileProtocolHandler", url]);
  });

  it("rejects when the opener cannot be spawned (so the caller can fall back)", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    childEvent = { type: "error", error: new Error("ENOENT xdg-open") };
    const { openBrowser } = await import(
      /* @vite-ignore */ `../../src/auth/login/browser.js?ts=${Date.now()}`
    );
    await expect(openBrowser("https://x.test/")).rejects.toThrow(/ENOENT/);
  });
});
