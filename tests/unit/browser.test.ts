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

  it("uses cmd /c start on win32 with the URL as a discrete arg", async () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    const { openBrowser } = await import(
      /* @vite-ignore */ `../../src/auth/login/browser.js?ts=${Date.now()}`
    );
    await openBrowser("https://x.test/?a=1&b=2");
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe("cmd");
    expect(args).toEqual(["/c", "start", "", "https://x.test/?a=1&b=2"]);
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
