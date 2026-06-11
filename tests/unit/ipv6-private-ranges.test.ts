import { describe, expect, it } from "vitest";
import { isPrivateIPv6, validateExternalUrlSync } from "../../src/validation/url.js";

/**
 * The previous prefix regexes (/^fc00:/i, /^fe80:/i) matched only the literal
 * canonical hextet, leaving most of each CIDR block reachable:
 *   - ULA fc00::/7  spans fc00:: .. fdff::  (fc01:: .. fcff:: were NOT blocked)
 *   - link-local fe80::/10 spans fe80:: .. febf::  (fe90::/fea0::/febf:: were NOT blocked)
 * That is a real SSRF deviation from the stated "no private IPs" guarantee.
 */
describe("isPrivateIPv6 — full CIDR coverage", () => {
  it("blocks the entire ULA fc00::/7 range, not just the canonical fc00::", () => {
    for (const ip of ["fc00::1", "fc01::1", "fc12:3456::1", "fcff::1", "fd00::1", "fdff::1"]) {
      expect(isPrivateIPv6(ip), ip).toBe(true);
    }
  });

  it("blocks the entire link-local fe80::/10 range, not just fe80::", () => {
    for (const ip of ["fe80::1", "fe90::1", "fea0::1", "febf::1"]) {
      expect(isPrivateIPv6(ip), ip).toBe(true);
    }
  });

  it("blocks deprecated site-local fec0::/10", () => {
    for (const ip of ["fec0::1", "fed0::1", "feff::1"]) {
      expect(isPrivateIPv6(ip), ip).toBe(true);
    }
  });

  it("still blocks loopback/unspecified and canonical reserved ranges", () => {
    for (const ip of ["::1", "::", "fd00::1", "ff02::1", "2001:db8::1", "64:ff9b::1"]) {
      expect(isPrivateIPv6(ip), ip).toBe(true);
    }
  });

  it("does not over-block genuinely public IPv6 addresses", () => {
    for (const ip of [
      "2001:4860:4860::8888", // Google public DNS
      "2606:4700:4700::1111", // Cloudflare public DNS
      "fb00::1", // just below ULA — must stay allowed
      "fe00::1", // below link-local — must stay allowed
    ]) {
      expect(isPrivateIPv6(ip), ip).toBe(false);
    }
  });

  it("rejects a URL whose host is in the previously-reachable ULA hole", () => {
    expect(() => validateExternalUrlSync("https://[fc12:3456::1]/internal")).toThrow();
  });

  it("blocks the entire multicast ff00::/8 range, not just ff00::/12", () => {
    for (const ip of ["ff02::1", "ff12::1", "ff15::101", "ff32::8000:1", "ffff::1"]) {
      expect(isPrivateIPv6(ip), ip).toBe(true);
    }
  });

  it("blocks Teredo 2001::/32 in both canonical text forms", () => {
    for (const ip of ["2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2"]) {
      expect(isPrivateIPv6(ip), ip).toBe(true);
    }
    // 2001:4860::/32 is Google — only the zero second hextet is Teredo.
    expect(isPrivateIPv6("2001:4860:4860::8888")).toBe(false);
  });
});
