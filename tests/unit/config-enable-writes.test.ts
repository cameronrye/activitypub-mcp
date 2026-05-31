import { afterEach, describe, expect, it, vi } from "vitest";

describe("ENABLE_WRITES config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to false when the env var is unset", async () => {
    vi.stubEnv("ACTIVITYPUB_ENABLE_WRITES", "");
    const { ENABLE_WRITES } = await import("../../src/config.js");
    expect(ENABLE_WRITES).toBe(false);
  });

  it("is true only for the literal string 'true'", async () => {
    vi.stubEnv("ACTIVITYPUB_ENABLE_WRITES", "true");
    const { ENABLE_WRITES } = await import("../../src/config.js");
    expect(ENABLE_WRITES).toBe(true);
  });

  it("is false for any other value", async () => {
    vi.stubEnv("ACTIVITYPUB_ENABLE_WRITES", "1");
    const { ENABLE_WRITES } = await import("../../src/config.js");
    expect(ENABLE_WRITES).toBe(false);
  });
});
