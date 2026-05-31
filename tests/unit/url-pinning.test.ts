/**
 * Tests for resolveAndPin (DNS-rebinding TOCTOU fix) and fail-closed DNS validation.
 *
 * DNS is mocked at the `node:dns/promises` boundary so these tests never touch
 * the real network/resolver.
 */

import { Agent } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the resolver. Each test sets the implementation it needs.
const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

// Import after the mock is registered so the module under test binds to it.
const { resolveAndPin, validateExternalUrl } = await import("../../src/validation/url.js");

afterEach(() => {
  lookupMock.mockReset();
});

describe("resolveAndPin", () => {
  it("rejects a hostname that resolves only to a private IP", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    await expect(resolveAndPin("https://evil.example/")).rejects.toThrow(
      /private|blocked|not allowed/i,
    );
  });

  it("rejects when any resolved address is private (mixed public/private)", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    await expect(resolveAndPin("https://mixed.example/")).rejects.toThrow(
      /private|blocked|not allowed/i,
    );
  });

  it("returns a dispatcher pinned to the validated public IP", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    const pinned = await resolveAndPin("https://good.example/path");

    expect(pinned.address).toBe("93.184.216.34");
    expect(pinned.dispatcher).toBeInstanceOf(Agent);
  });

  it("rejects an IP-literal private host without performing DNS resolution", async () => {
    await expect(resolveAndPin("https://127.0.0.1/")).rejects.toThrow(
      /private|blocked|not allowed/i,
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("pins a public IP-literal host directly without DNS resolution", async () => {
    const pinned = await resolveAndPin("https://93.184.216.34/");
    expect(pinned.address).toBe("93.184.216.34");
    expect(pinned.dispatcher).toBeInstanceOf(Agent);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects non-https schemes", async () => {
    await expect(resolveAndPin("http://good.example/")).rejects.toThrow(/scheme/i);
  });

  it("rejects blocked internal hostnames before DNS", async () => {
    await expect(resolveAndPin("https://localhost/")).rejects.toThrow(/internal|not allowed/i);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects when DNS returns no addresses", async () => {
    lookupMock.mockResolvedValue([]);
    await expect(resolveAndPin("https://empty.example/")).rejects.toThrow(/no addresses/i);
  });
});

describe("validateExternalUrl fails closed on unexpected resolver errors", () => {
  it("throws when the resolver rejects with a non-ENOTFOUND error", async () => {
    const err = Object.assign(new Error("resolver exploded"), { code: "ESERVFAIL" });
    lookupMock.mockRejectedValue(err);

    await expect(validateExternalUrl("https://flaky.example/")).rejects.toThrow(
      /DNS validation failed/i,
    );
  });

  it("allows ENOTFOUND (host genuinely does not exist) through validation", async () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND nope.example"), {
      code: "ENOTFOUND",
    });
    lookupMock.mockRejectedValue(err);

    // ENOTFOUND is benign: nothing to fetch, so validation must not reject.
    await expect(validateExternalUrl("https://nope.example/")).resolves.toBeUndefined();
  });

  it("still rejects a private IP surfaced by the resolver", async () => {
    lookupMock.mockResolvedValue([{ address: "192.168.1.1", family: 4 }]);
    await expect(validateExternalUrl("https://rebind.example/")).rejects.toThrow(
      /private|rebinding|blocked/i,
    );
  });
});
