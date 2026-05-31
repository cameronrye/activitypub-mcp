/**
 * Unit tests for utility functions.
 */

import { describe, expect, it } from "vitest";
import {
  getErrorMessage,
  TokenRejectedError,
  UnsupportedOnPlatformError,
} from "../../src/utils/errors.js";
import { stripHtmlTags } from "../../src/utils/html.js";
import {
  isBlockedHostname,
  isPrivateIP,
  isPrivateIPv4,
  isPrivateIPv6,
  validateExternalUrlSync,
} from "../../src/validation/url.js";

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

  it("should detect the 198.18.0.0/15 benchmarking range", () => {
    expect(isPrivateIPv4("198.18.0.5")).toBe(true);
    expect(isPrivateIPv4("198.19.200.1")).toBe(true);
    expect(isPrivateIPv4("198.17.0.1")).toBe(false);
    expect(isPrivateIPv4("198.20.0.1")).toBe(false);
  });

  it("should detect the 192.88.99.0/24 6to4-relay anycast range", () => {
    expect(isPrivateIPv4("192.88.99.1")).toBe(true);
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

  it("should detect IPv4-compatible IPv6 embedding a private IPv4", () => {
    // ::127.0.0.1 — the deprecated IPv4-compatible form the URL parser emits as
    // ::7f00:1. The ::ffff: (mapped) guard does not cover this sibling form.
    expect(isPrivateIPv6("::7f00:1")).toBe(true);
    expect(isPrivateIPv6("::127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("[::7f00:1]")).toBe(true);
    // ::169.254.169.254 (cloud metadata) → ::a9fe:a9fe
    expect(isPrivateIPv6("::a9fe:a9fe")).toBe(true);
    // Single-hex-group compat form (embedded IPv4 high-16-bits zero): ::0.0.127.1 → ::7f01
    expect(isPrivateIPv6("::7f01")).toBe(true);
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

  it("should not be bypassed by a trailing FQDN dot", () => {
    // The WHATWG URL parser keeps a trailing dot ("localhost." / "foo.internal.")
    // — the blocklist must normalize it away so the exact/suffix checks still fire.
    expect(isBlockedHostname("localhost.")).toBe(true);
    expect(isBlockedHostname("db.internal.")).toBe(true);
    expect(isBlockedHostname("kubernetes.default.svc.cluster.local.")).toBe(true);
    // Multiple trailing dots must not bypass the normalization either.
    expect(isBlockedHostname("localhost..")).toBe(true);
    expect(isBlockedHostname("db.internal..")).toBe(true);
  });
});

describe("validateExternalUrlSync", () => {
  it("should allow valid public URLs", () => {
    expect(() => validateExternalUrlSync("https://example.com")).not.toThrow();
    expect(() => validateExternalUrlSync("https://mastodon.social/api/v1")).not.toThrow();
    expect(() => validateExternalUrlSync("https://8.8.8.8")).not.toThrow();
  });

  it("should reject non-https schemes", () => {
    expect(() => validateExternalUrlSync("http://example.com")).toThrow(/not allowed/i);
    expect(() => validateExternalUrlSync("file:///etc/passwd")).toThrow(/not allowed/i);
    expect(() => validateExternalUrlSync("data:text/plain,hi")).toThrow(/not allowed/i);
    expect(() => validateExternalUrlSync("ftp://example.com")).toThrow(/not allowed/i);
  });

  it("should block localhost URLs", () => {
    expect(() => validateExternalUrlSync("https://localhost")).toThrow(
      /internal hostname.*not allowed/i,
    );
    expect(() => validateExternalUrlSync("https://localhost:8080")).toThrow(
      /internal hostname.*not allowed/i,
    );
  });

  it("should block private IP URLs", () => {
    expect(() => validateExternalUrlSync("https://127.0.0.1")).toThrow(
      /private IP address.*not allowed/i,
    );
    expect(() => validateExternalUrlSync("https://192.168.1.1")).toThrow(
      /private IP address.*not allowed/i,
    );
    expect(() => validateExternalUrlSync("https://10.0.0.1:3000")).toThrow(
      /private IP address.*not allowed/i,
    );
  });

  it("should block internal domain URLs", () => {
    expect(() => validateExternalUrlSync("https://server.local")).toThrow(
      /internal hostname.*not allowed/i,
    );
    expect(() => validateExternalUrlSync("https://db.internal")).toThrow(
      /internal hostname.*not allowed/i,
    );
  });

  it("should throw on invalid URLs", () => {
    expect(() => validateExternalUrlSync("not-a-url")).toThrow();
    expect(() => validateExternalUrlSync("")).toThrow();
  });
});

describe("stripHtmlTags", () => {
  it("should remove simple HTML tags", () => {
    expect(stripHtmlTags("<p>Hello</p>")).toBe("Hello");
    expect(stripHtmlTags("<div>Test</div>")).toBe("Test");
    expect(stripHtmlTags("<span class='test'>Content</span>")).toBe("Content");
  });

  it("should remove multiple tags", () => {
    expect(stripHtmlTags("<p>Hello</p><p>World</p>")).toBe("HelloWorld");
    expect(stripHtmlTags("<div><span>Nested</span></div>")).toBe("Nested");
  });

  it("should handle self-closing tags", () => {
    expect(stripHtmlTags("Hello<br/>World")).toBe("HelloWorld");
    expect(stripHtmlTags("Text<img src='test.jpg'/>More")).toBe("TextMore");
  });

  it("should handle nested/malformed tags that could bypass single-pass sanitization", () => {
    // The iterative approach ensures all tag-like patterns are removed
    // <scr<script>ipt> is treated as a tag, leaving ipt>alert('xss')</script>
    // Then </script> is removed, leaving ipt>alert('xss')
    expect(stripHtmlTags("<scr<script>ipt>alert('xss')</script>")).toBe("ipt>alert('xss')");
    // Similar logic for other malformed constructs
    expect(stripHtmlTags("<div<div>>content</div></div>")).toBe(">content");
    expect(stripHtmlTags("<<script>script>alert()</script>")).toBe("script>alert()");
  });

  it("should return empty string for empty input", () => {
    expect(stripHtmlTags("")).toBe("");
  });

  it("should return text without tags unchanged", () => {
    expect(stripHtmlTags("Plain text")).toBe("Plain text");
    expect(stripHtmlTags("Hello, world!")).toBe("Hello, world!");
    // In real HTML, < and > would be encoded as &lt; and &gt;
    expect(stripHtmlTags("5 &lt; 10")).toBe("5 &lt; 10");
  });

  it("should handle tags with attributes", () => {
    expect(stripHtmlTags('<a href="https://example.com">Link</a>')).toBe("Link");
    expect(stripHtmlTags('<div class="container" id="main">Content</div>')).toBe("Content");
  });
});

describe("UnsupportedOnPlatformError", () => {
  it("formats a clear message with op and platform", () => {
    const err = new UnsupportedOnPlatformError("vote-on-poll", "Misskey");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnsupportedOnPlatformError");
    expect(err.op).toBe("vote-on-poll");
    expect(err.platform).toBe("Misskey");
    expect(err.message).toBe("vote-on-poll is not supported on Misskey");
  });
});

describe("TokenRejectedError", () => {
  it("formats a re-auth message with instance + username", () => {
    const err = new TokenRejectedError("mastodon.social", "alice");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TokenRejectedError");
    expect(err.instance).toBe("mastodon.social");
    expect(err.message).toContain("@alice@mastodon.social");
    expect(err.message).toContain("activitypub-mcp login mastodon.social");
  });
});
