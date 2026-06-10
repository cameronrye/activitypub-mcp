import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { auditLogger } from "../../src/audit/logger.js";
import { pinnedFetch } from "../../src/utils/fetch-helpers.js";
import { SsrfBlockedError } from "../../src/validation/url.js";
import { server } from "../mocks/server.js";

/**
 * The canonical SSRF bypass: a PUBLIC host that 302-redirects to a PRIVATE IP.
 * The pieces are unit-tested in isolation — resolveAndPin rejects private IPs
 * (url-pinning), fetchWithRedirectGuard calls its validator per hop with a mock
 * validator (fetch-helpers) — but nothing proved they COMPOSE inside pinnedFetch,
 * which wires resolveAndPin in as the real per-hop validator. A regression that
 * skipped re-validation on a redirect hop would pass every other test.
 *
 * This drives the REAL pinnedFetch with the REAL resolveAndPin, mocking only DNS
 * so the initial host resolves public and the redirect target resolves to a
 * private IP, and asserts the redirect is blocked + audited.
 */
vi.mock("node:dns/promises", () => ({
  lookup: async (hostname: string) => {
    if (hostname === "internal.test") return [{ address: "10.0.0.1", family: 4 }];
    // Everything else resolves to a public IP so the initial hop succeeds.
    return [{ address: "93.184.216.34", family: 4 }];
  },
}));

describe("pinnedFetch blocks a public→private-IP redirect (integrated)", () => {
  it("rejects with SsrfBlockedError and audits the block when a 302 points at a private IP", async () => {
    server.use(
      http.get(
        "https://public.test/start",
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: "https://internal.test/secret" },
          }),
      ),
      // If the guard were broken and the redirect were followed, this would be
      // hit — its presence lets us assert it is NEVER reached (private IP target).
      http.get("https://internal.test/secret", () => HttpResponse.json({ leaked: true })),
    );

    const spy = vi.spyOn(auditLogger, "logSsrfBlocked");
    try {
      await expect(pinnedFetch("https://public.test/start", {})).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
      expect(spy).toHaveBeenCalledWith(
        "https://public.test/start",
        expect.stringContaining("private IP"),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
