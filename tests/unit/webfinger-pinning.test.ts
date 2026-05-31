/**
 * Tests that WebFinger discovery pins (and validates) the resolved IP, closing
 * the DNS-rebinding TOCTOU on the user-facing `discover-actor` path.
 *
 * DNS is mocked at the `node:dns/promises` boundary so the test never touches
 * the real resolver. A host that resolves only to a private IP must be rejected
 * before any outbound fetch happens. Mirrors the DNS-mocking convention used by
 * tests/unit/url-pinning.test.ts and tests/unit/validators.test.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the resolver. Each test sets the implementation it needs.
const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

// Import after the mock is registered so the module under test binds to it.
const { WebFingerClient } = await import("../../src/discovery/webfinger.js");

afterEach(() => {
  lookupMock.mockReset();
  vi.restoreAllMocks();
});

describe("WebFinger DNS pinning (SSRF / rebinding)", () => {
  it("rejects a lookup whose host resolves to a private IP", async () => {
    // The webfinger host resolves only to loopback — a classic rebinding target.
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    // Spy on global fetch to prove the block happens pre-fetch: a rejected
    // resolveAndPin must short-circuit before any outbound request is made.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const client = new WebFingerClient();

    await expect(client.discoverActor("user@rebind.example")).rejects.toThrow(
      /private|blocked|rebinding|not allowed/i,
    );
    // The resolver was consulted; the request was blocked before any fetch.
    expect(lookupMock).toHaveBeenCalled();
    // No outbound fetch occurred — the private IP was rejected at the pin stage.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects when the host resolves to a mixed public/private answer set", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    const client = new WebFingerClient();

    await expect(client.discoverActor("user@mixed.example")).rejects.toThrow(
      /private|blocked|rebinding|not allowed/i,
    );
  });
});
