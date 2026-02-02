/**
 * Unit tests for utility functions.
 */

import { describe, expect, it } from "vitest";
import {
  getErrorMessage,
  isBlockedHostname,
  isPrivateIP,
  isPrivateIPv4,
  isPrivateIPv6,
  validateExternalUrlSync,
} from "../../src/utils.js";

describe("getErrorMessage", () => {
  it("should extract message from Error objects", () => {
    const error = new Error("Test error message");
    expect(getErrorMessage(error)).toBe("Test error message");
  });

  it("should convert non-Error values to strings", () => {
    expect(getErrorMessage("string error")).toBe("string error");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
    expect(getErrorMessage({ message: "object" })).toBe("[object Object]");
  });
});

describe("isPrivateIPv4", () => {
  it("should detect loopback addresses", () => {
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("127.255.255.255")).toBe(true);
  });

  it("should detect private Class A addresses (10.x.x.x)", () => {
    expect(isPrivateIPv4("10.0.0.1")).toBe(true);
    expect(isPrivateIPv4("10.255.255.255")).toBe(true);
  });

  it("should detect private Class B addresses (172.16-31.x.x)", () => {
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("172.15.0.1")).toBe(false);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
  });

  it("should detect private Class C addresses (192.168.x.x)", () => {
    expect(isPrivateIPv4("192.168.0.1")).toBe(true);
    expect(isPrivateIPv4("192.168.255.255")).toBe(true);
  });

  it("should detect link-local addresses (169.254.x.x)", () => {
    expect(isPrivateIPv4("169.254.0.1")).toBe(true);
    expect(isPrivateIPv4("169.254.255.255")).toBe(true);
  });

  it("should allow public IP addresses", () => {
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
    expect(isPrivateIPv4("142.250.185.78")).toBe(false);
  });

  it("should detect broadcast address", () => {
    expect(isPrivateIPv4("255.255.255.255")).toBe(true);
  });
});

describe("isPrivateIPv6", () => {
  it("should detect loopback address", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
  });

  it("should detect unspecified address", () => {
    expect(isPrivateIPv6("::")).toBe(true);
  });

  it("should detect link-local addresses", () => {
    expect(isPrivateIPv6("fe80::1")).toBe(true);
    expect(isPrivateIPv6("fe80:0:0:0:0:0:0:1")).toBe(true);
  });

  it("should detect unique local addresses", () => {
    expect(isPrivateIPv6("fc00::1")).toBe(true);
    expect(isPrivateIPv6("fd00::1")).toBe(true);
  });

  it("should detect IPv4-mapped IPv6 addresses with private IPv4", () => {
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:10.0.0.1")).toBe(true);
  });

  it("should allow IPv4-mapped IPv6 addresses with public IPv4", () => {
    expect(isPrivateIPv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("should allow public IPv6 addresses", () => {
    expect(isPrivateIPv6("2607:f8b0:4004:800::200e")).toBe(false);
  });

  it("should handle bracketed addresses", () => {
    expect(isPrivateIPv6("[::1]")).toBe(true);
    expect(isPrivateIPv6("[fe80::1]")).toBe(true);
  });
});

describe("isPrivateIP", () => {
  it("should detect private IPv4 addresses", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("192.168.1.1")).toBe(true);
  });

  it("should detect private IPv6 addresses", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
  });

  it("should allow public addresses", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("2607:f8b0:4004:800::200e")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("should block localhost variants", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("LOCALHOST")).toBe(true);
    expect(isBlockedHostname("localhost.localdomain")).toBe(true);
  });

  it("should block internal hostnames", () => {
    expect(isBlockedHostname("local")).toBe(true);
    expect(isBlockedHostname("broadcasthost")).toBe(true);
    expect(isBlockedHostname("kubernetes")).toBe(true);
    expect(isBlockedHostname("kubernetes.default.svc.cluster.local")).toBe(true);
  });

  it("should block hostnames with internal suffixes", () => {
    expect(isBlockedHostname("server.local")).toBe(true);
    expect(isBlockedHostname("db.internal")).toBe(true);
    expect(isBlockedHostname("app.corp")).toBe(true);
    expect(isBlockedHostname("printer.lan")).toBe(true);
  });

  it("should allow public hostnames", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
    expect(isBlockedHostname("mastodon.social")).toBe(false);
    expect(isBlockedHostname("api.github.com")).toBe(false);
  });
});

describe("validateExternalUrlSync", () => {
  it("should allow valid public URLs", () => {
    expect(() => validateExternalUrlSync("https://example.com")).not.toThrow();
    expect(() => validateExternalUrlSync("https://mastodon.social/api/v1")).not.toThrow();
    expect(() => validateExternalUrlSync("http://8.8.8.8")).not.toThrow();
  });

  it("should block localhost URLs", () => {
    expect(() => validateExternalUrlSync("http://localhost")).toThrow(
      /internal hostname.*not allowed/i,
    );
    expect(() => validateExternalUrlSync("http://localhost:8080")).toThrow(
      /internal hostname.*not allowed/i,
    );
  });

  it("should block private IP URLs", () => {
    expect(() => validateExternalUrlSync("http://127.0.0.1")).toThrow(
      /private IP address.*not allowed/i,
    );
    expect(() => validateExternalUrlSync("http://192.168.1.1")).toThrow(
      /private IP address.*not allowed/i,
    );
    expect(() => validateExternalUrlSync("http://10.0.0.1:3000")).toThrow(
      /private IP address.*not allowed/i,
    );
  });

  it("should block internal domain URLs", () => {
    expect(() => validateExternalUrlSync("http://server.local")).toThrow(
      /internal hostname.*not allowed/i,
    );
    expect(() => validateExternalUrlSync("http://db.internal")).toThrow(
      /internal hostname.*not allowed/i,
    );
  });

  it("should throw on invalid URLs", () => {
    expect(() => validateExternalUrlSync("not-a-url")).toThrow();
    expect(() => validateExternalUrlSync("")).toThrow();
  });
});
