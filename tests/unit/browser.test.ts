import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    return { on: vi.fn(), unref: vi.fn() };
  },
}));

describe("openBrowser", () => {
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
});
