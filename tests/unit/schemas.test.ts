import { describe, expect, it } from "vitest";
import { DomainSchema } from "../../src/validation/schemas.js";

describe("DomainSchema — IP literal rejection (L5)", () => {
  it("rejects IPv4 literal", () => {
    const result = DomainSchema.safeParse("192.168.1.1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/IP addresses are not allowed/i);
    }
  });

  it("rejects IPv4 literal (public range)", () => {
    expect(DomainSchema.safeParse("8.8.8.8").success).toBe(false);
  });

  it("rejects bracketed IPv6 literal", () => {
    expect(DomainSchema.safeParse("[::1]").success).toBe(false);
  });

  it("rejects unbracketed IPv6 literal", () => {
    expect(DomainSchema.safeParse("2001:db8::1").success).toBe(false);
  });

  it("accepts normal hostname", () => {
    expect(DomainSchema.safeParse("mastodon.social").success).toBe(true);
  });

  it("accepts hostname with numbers", () => {
    expect(DomainSchema.safeParse("9to5mac.com").success).toBe(true);
  });
});
