import { describe, expect, it, vi } from "vitest";
import { auditLogger } from "../../src/audit/logger.js";
import { pinnedFetch } from "../../src/utils/fetch-helpers.js";
import { SsrfBlockedError } from "../../src/validation/url.js";

// Keep the real SsrfBlockedError (so pinnedFetch's instanceof catch works) but
// force resolveAndPin to reject as if the target resolved to a private IP.
vi.mock("../../src/validation/url.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/validation/url.js")>();
  return {
    ...actual,
    resolveAndPin: vi
      .fn()
      .mockRejectedValue(
        new actual.SsrfBlockedError('Access to private IP address "10.0.0.1" is not allowed'),
      ),
  };
});

describe("pinnedFetch SSRF audit", () => {
  it("records an SSRF-blocked audit event and re-throws when a target is rejected", async () => {
    const spy = vi.spyOn(auditLogger, "logSsrfBlocked");
    try {
      await expect(pinnedFetch("http://attacker.test/x", {})).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
      expect(spy).toHaveBeenCalledWith(
        "http://attacker.test/x",
        expect.stringContaining("private IP"),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
