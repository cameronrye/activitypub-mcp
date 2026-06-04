/**
 * URL validation utilities for SSRF protection.
 * Validates that URLs don't point to private/internal addresses.
 */

import { lookup } from "node:dns/promises";
import { Agent } from "undici";

/**
 * Thrown when a URL is rejected for SSRF reasons (disallowed scheme, blocked
 * hostname, private/internal IP, DNS-rebinding, or no resolvable address).
 *
 * Carrying a distinct TYPE — rather than relying on message text — lets the DNS
 * error handler re-throw security rejections by `instanceof`, so a reworded
 * message can never silently downgrade a fail-closed path to fail-open.
 */
export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Canonicalize a parsed hostname for validation: lowercase and strip any
 * trailing FQDN dots ("127.0.0.1." / "evil.com..") that the WHATWG URL parser
 * preserves. Sharing this across every validator ensures the IP-literal and
 * blocklist checks see the same canonical form and can't be bypassed by
 * appending one or more trailing dots.
 */
function canonicalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

/**
 * Private IPv4 address ranges that should be blocked for SSRF protection.
 * Includes private ranges, localhost, link-local, and reserved addresses.
 */
const PRIVATE_IPV4_RANGES = [
  /^127\./, // Loopback (127.0.0.0/8)
  /^10\./, // Private Class A (10.0.0.0/8)
  /^172\.(1[6-9]|2\d|3[0-1])\./, // Private Class B (172.16.0.0/12)
  /^192\.168\./, // Private Class C (192.168.0.0/16)
  /^169\.254\./, // Link-local (169.254.0.0/16)
  /^0\./, // Current network (0.0.0.0/8)
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // Carrier-grade NAT (100.64.0.0/10)
  /^192\.0\.0\./, // IETF Protocol Assignments (192.0.0.0/24)
  /^192\.0\.2\./, // Documentation (TEST-NET-1)
  /^192\.88\.99\./, // 6to4 relay anycast (192.88.99.0/24, deprecated)
  /^198\.1[89]\./, // Benchmarking (198.18.0.0/15, RFC 2544)
  /^198\.51\.100\./, // Documentation (TEST-NET-2)
  /^203\.0\.113\./, // Documentation (TEST-NET-3)
  /^224\./, // Multicast (224.0.0.0/4)
  /^240\./, // Reserved for future use (240.0.0.0/4)
  /^255\.255\.255\.255$/, // Broadcast
];

/**
 * Private IPv6 address ranges that should be blocked for SSRF protection.
 * Includes loopback, link-local, unique local, and other reserved addresses.
 */
// NOTE: link-local (fe80::/10) and unique-local (fc00::/7) are NOT listed here
// as prefix regexes — a literal /^fe80:/ or /^fc00:/ matches only the canonical
// hextet and leaves most of each block reachable (e.g. fe90::, fc12::). They are
// blocked by leadingHextetMaskIsPrivate() below, which masks the first hextet.
const PRIVATE_IPV6_RANGES = [
  /^::1$/i, // Loopback
  /^::$/i, // Unspecified address
  /^::ffff:/i, // IPv4-mapped IPv6 addresses (check the mapped IPv4)
  /^ff0[\da-f]:/i, // Multicast (ff00::/8)
  /^2001:db8:/i, // Documentation (2001:db8::/32)
  /^2001::/i, // Teredo tunneling (2001::/32) - could be abused
  /^64:ff9b:/i, // NAT64 (64:ff9b::/96)
  /^100::/i, // Discard prefix (100::/64)
  /^2002:/i, // 6to4 (2002::/16) - deprecated, could be abused
];

/**
 * True if an IPv6 address's leading hextet falls inside one of the CIDR blocks
 * that a literal-prefix regex can't express. Masking the first hextet covers the
 * WHOLE block instead of only its canonical address:
 *   - fc00::/7  unique-local       — (h & 0xfe00) === 0xfc00 → fc00..fdff
 *   - fe80::/10 link-local         — (h & 0xffc0) === 0xfe80 → fe80..febf
 *   - fec0::/10 site-local (dep.)  — (h & 0xffc0) === 0xfec0 → fec0..feff
 * Returns false for `::`-prefixed (compressed leading-zero) addresses, which are
 * handled by the explicit ranges / embedded-IPv4 checks instead.
 */
function leadingHextetMaskIsPrivate(normalizedIp: string): boolean {
  if (normalizedIp.startsWith("::")) return false;
  const firstGroup = normalizedIp.split(":", 1)[0];
  if (!/^[\da-f]{1,4}$/i.test(firstGroup)) return false;
  const h = Number.parseInt(firstGroup, 16);
  if ((h & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((h & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h & 0xffc0) === 0xfec0) return true; // deprecated site-local fec0::/10
  return false;
}

/**
 * Private/reserved hostnames that should be blocked for SSRF protection.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "local",
  "broadcasthost",
  "ip6-localhost",
  "ip6-loopback",
  "ip6-localnet",
  "ip6-mcastprefix",
  "ip6-allnodes",
  "ip6-allrouters",
  "wpad", // Web Proxy Auto-Discovery
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
  "kubernetes.default.svc.cluster.local",
]);

/**
 * Hostname suffixes that should be blocked (internal/infrastructure domains).
 */
const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".intranet",
  ".corp",
  ".lan",
  ".home",
  ".localdomain",
];

/**
 * URL schemes permitted for outbound fetches.
 * Everything else (file:, data:, http:, ftp:, gopher:, javascript:, etc.)
 * is rejected as a defence-in-depth SSRF/exfil guard.
 */
const ALLOWED_URL_SCHEMES = new Set(["https:"]);

/** Regex to match IPv4 addresses */
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Regex to match IPv6 addresses (with or without brackets) */
const IPV6_REGEX = /^(?:\[?[\da-fA-F:]+\]?)$/;

/**
 * Checks if an IPv4 address is a private/internal IP that should be blocked.
 *
 * @param ip - The IPv4 address to check
 * @returns True if the IP is private/internal
 */
export function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some((range) => range.test(ip));
}

/**
 * True for an IPv4 loopback literal (127.0.0.0/8) — e.g. `127.0.0.1` or the
 * short `127.1` form Node binds as 127.0.0.1. Single source of the loopback
 * definition so callers (e.g. the HTTP transport bind-warning) don't diverge.
 */
export function isLoopbackIPv4(ip: string): boolean {
  return /^127\./.test(ip);
}

/**
 * Checks if an IPv6 address is a private/internal IP that should be blocked.
 *
 * @param ip - The IPv6 address to check
 * @returns True if the IP is private/internal
 */
export function isPrivateIPv6(ip: string): boolean {
  // Normalize the IPv6 address (remove brackets if present)
  const normalizedIp = ip.replaceAll(/(?:^\[)|(?:\]$)/g, "");

  // Check for IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  const ipv4MappedRegex = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
  const ipv4MappedMatch = ipv4MappedRegex.exec(normalizedIp);
  if (ipv4MappedMatch) {
    return isPrivateIPv4(ipv4MappedMatch[1]);
  }

  // Check for IPv4-COMPATIBLE IPv6 addresses (::x.x.x.x, deprecated per RFC 4291).
  // These embed an IPv4 in the low 32 bits with the ::ffff: marker absent, so the
  // mapped guard above misses them. The WHATWG URL parser emits the hex-compressed
  // form (e.g. ::127.0.0.1 → ::7f00:1), so handle both the dotted and two-hex-group
  // forms and validate the embedded IPv4. (::, ::1 are caught by the ranges below.)
  const ipv4CompatDotted = /^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(normalizedIp);
  if (ipv4CompatDotted) {
    return isPrivateIPv4(ipv4CompatDotted[1]);
  }
  // The high group is optional: when the embedded IPv4's top 16 bits are zero
  // (e.g. ::0.0.127.1) the parser compresses it to a single group like ::7f01.
  const ipv4CompatHex = /^::(?:([\da-f]{1,4}):)?([\da-f]{1,4})$/i.exec(normalizedIp);
  if (ipv4CompatHex) {
    const hi = ipv4CompatHex[1] ? Number.parseInt(ipv4CompatHex[1], 16) : 0;
    const lo = Number.parseInt(ipv4CompatHex[2], 16);
    const embedded = `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
    return isPrivateIPv4(embedded);
  }

  if (leadingHextetMaskIsPrivate(normalizedIp)) {
    return true;
  }

  return PRIVATE_IPV6_RANGES.some((range) => range.test(normalizedIp));
}

/**
 * Checks if an IP address (IPv4 or IPv6) is private/internal.
 *
 * @param ip - The IP address to check
 * @returns True if the IP is private/internal
 */
export function isPrivateIP(ip: string): boolean {
  // Check if it looks like IPv6 (contains colons)
  if (ip.includes(":")) {
    return isPrivateIPv6(ip);
  }
  return isPrivateIPv4(ip);
}

/**
 * Checks if a hostname is a blocked internal hostname.
 *
 * @param hostname - The hostname to check
 * @returns True if the hostname is blocked
 */
export function isBlockedHostname(hostname: string): boolean {
  // Strip ALL trailing FQDN dots ("localhost." / "foo.internal." / "localhost..")
  // that the WHATWG URL parser preserves, so the exact-name Set and suffix checks
  // below can't be bypassed by appending one or more dots.
  const lowerHostname = hostname.toLowerCase().replace(/\.+$/, "");

  // Check exact matches
  if (BLOCKED_HOSTNAMES.has(lowerHostname)) {
    return true;
  }

  // Check suffix matches
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => lowerHostname.endsWith(suffix));
}

/**
 * Validates a hostname that appears to be an IP address.
 * @throws Error if the IP is private/internal
 */
function validateIpHostname(hostname: string): void {
  if (IPV4_REGEX.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new SsrfBlockedError(`Access to private IP address "${hostname}" is not allowed`);
    }
    return;
  }

  if (IPV6_REGEX.test(hostname) && hostname.includes(":")) {
    if (isPrivateIPv6(hostname)) {
      throw new SsrfBlockedError(`Access to private IP address "${hostname}" is not allowed`);
    }
  }
}

/**
 * Checks if a hostname looks like an IP address.
 */
function isIpAddress(hostname: string): boolean {
  return IPV4_REGEX.test(hostname) || (IPV6_REGEX.test(hostname) && hostname.includes(":"));
}

/**
 * Handles DNS lookup errors and determines if they should be re-thrown.
 *
 * Fails CLOSED: an unexpected resolver error (anything other than the host
 * genuinely not existing) must reject so an attacker cannot turn a flaky/forced
 * resolver error into an SSRF bypass. Only ENOTFOUND (the host simply does not
 * exist — nothing to fetch) is treated as benign and allowed through.
 */
function handleDnsLookupError(error: unknown): void {
  if (!(error instanceof Error)) {
    throw new Error("DNS validation failed (non-Error thrown)");
  }

  // Re-throw our own security rejections — identified by TYPE, not message text,
  // so a reworded message can never silently downgrade fail-closed to fail-open.
  if (error instanceof SsrfBlockedError) {
    throw error;
  }

  // If DNS lookup fails with ENOTFOUND, that's benign (domain doesn't exist).
  if ("code" in error && (error as NodeJS.ErrnoException).code === "ENOTFOUND") {
    return;
  }

  // Any other resolver error → fail closed.
  throw new Error(`DNS validation failed: ${error.message}`);
}

/**
 * Validates that a URL doesn't point to a private/internal address.
 * Performs async DNS resolution to catch DNS rebinding attacks.
 *
 * @param url - The URL to validate
 * @throws Error if the URL points to a private/internal address
 */
export async function validateExternalUrl(url: string): Promise<void> {
  const parsedUrl = new URL(url);
  const hostname = canonicalizeHost(parsedUrl.hostname);

  if (!ALLOWED_URL_SCHEMES.has(parsedUrl.protocol)) {
    throw new SsrfBlockedError(
      `URL scheme "${parsedUrl.protocol}" is not allowed (only https: is permitted)`,
    );
  }

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError(`Access to internal hostname "${hostname}" is not allowed`);
  }

  // If it's an IP address, validate directly
  if (isIpAddress(hostname)) {
    validateIpHostname(hostname);
    return;
  }

  // Resolve the hostname to IP addresses to prevent DNS rebinding
  try {
    const addresses = await lookup(hostname, { all: true });

    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        throw new SsrfBlockedError(
          `DNS resolution for "${hostname}" returned private IP "${addr.address}" - possible DNS rebinding attack`,
        );
      }
    }
  } catch (error) {
    handleDnsLookupError(error);
  }
}

/**
 * A target whose IP has been validated and pinned for the actual connection.
 */
export interface PinnedTarget {
  /**
   * undici dispatcher pinned to {@link address}, to pass as the fetch
   * `dispatcher`. Always set on a successful return — `resolveAndPin` rejects
   * (rather than handing back an unpinned target) whenever there is no validated
   * IP to pin, so the caller never fetches a host whose connection isn't pinned.
   */
  dispatcher: Agent;
  /** The validated IP pinned for the connection. */
  address: string;
}

/**
 * Strip surrounding brackets from an IPv6 literal (e.g. "[::1]" → "::1").
 */
function stripBrackets(host: string): string {
  return host.replaceAll(/(?:^\[)|(?:\]$)/g, "");
}

/**
 * Build an undici dispatcher whose connection lookup is pinned to a single,
 * already-validated IP. This closes the DNS-rebinding TOCTOU: the IP we
 * validated is the exact IP the socket connects to, with no re-resolution.
 */
function pinDispatcher(ip: string): Agent {
  const family = ip.includes(":") ? 6 : 4;
  return new Agent({
    connect: {
      // undici calls this with Node's dns.lookup signature:
      //   (hostname, options, callback)
      // and passes `options.all === true`, expecting an array of
      // { address, family }. We ignore the requested hostname entirely and
      // always return the pinned IP. The single-result `else` branch is a guard
      // in case Node ever calls `lookup` without `{ all: true }` — Node >=20
      // always passes all:true, so it isn't hit today, but we keep it correct.
      lookup: (
        _hostname: string,
        options: { all?: boolean } | undefined,
        callback: (
          err: NodeJS.ErrnoException | null,
          address: string | { address: string; family: number }[],
          family?: number,
        ) => void,
      ) => {
        if (options?.all) {
          callback(null, [{ address: ip, family }]);
        } else {
          callback(null, ip, family);
        }
      },
    },
  });
}

/**
 * Resolve `url`'s hostname once, validate EVERY returned address, then return an
 * undici dispatcher pinned to one validated address. Closes the TOCTOU gap where
 * `fetch` would otherwise re-resolve to a different (possibly private) IP after
 * validation succeeded.
 *
 * Fails CLOSED on unexpected resolver errors (see {@link handleDnsLookupError}).
 * For an IP literal, validates and pins directly with no DNS. For a host that
 * genuinely does not exist (ENOTFOUND), throws rather than returning an unpinned
 * target — there is no validated IP to pin, and fetching unpinned would let
 * undici independently re-resolve the hostname, reopening the DNS-rebinding
 * TOCTOU this function closes.
 *
 * @param url - The URL whose host to resolve and pin.
 * @throws Error if the URL scheme is disallowed, the host is blocked, the host
 *   does not resolve (ENOTFOUND), or any resolved address is private/internal.
 */
export async function resolveAndPin(url: string): Promise<PinnedTarget> {
  const parsed = new URL(url);
  const hostname = canonicalizeHost(parsed.hostname);

  if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
    throw new SsrfBlockedError(
      `URL scheme "${parsed.protocol}" is not allowed (only https: is permitted)`,
    );
  }

  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError(`Access to internal hostname "${hostname}" is not allowed`);
  }

  // IP literal: validate (throws on private) and pin directly — no DNS needed.
  if (isIpAddress(hostname)) {
    validateIpHostname(hostname);
    const ip = stripBrackets(hostname);
    return { dispatcher: pinDispatcher(ip), address: ip };
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) {
      throw new SsrfBlockedError(`DNS resolution for "${hostname}" returned no addresses`);
    }
    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        throw new SsrfBlockedError(
          `DNS resolution for "${hostname}" returned private IP "${addr.address}" - blocked (possible DNS rebinding)`,
        );
      }
    }
    const pinned = addresses[0].address;
    return { dispatcher: pinDispatcher(pinned), address: pinned };
  } catch (error) {
    // Fail closed. handleDnsLookupError re-throws unexpected resolver errors and
    // our own security errors. For ENOTFOUND it returns (host genuinely doesn't
    // exist), but we must NOT then hand back an unpinned target: the caller would
    // fetch with no pinned dispatcher and undici would re-resolve the hostname
    // independently, reopening the exact DNS-rebinding TOCTOU this function
    // closes (attacker answers NXDOMAIN here, then a private IP to undici).
    // There is no validated IP to pin, so reject.
    handleDnsLookupError(error);
    throw new Error(
      `DNS resolution for "${hostname}" found no address to pin (host does not exist)`,
    );
  }
}

/**
 * Synchronous validation for URLs (checks hostname patterns only).
 * Use this when async DNS resolution isn't needed or possible.
 * Note: This is less secure than validateExternalUrl as it can't detect DNS rebinding.
 *
 * @param url - The URL to validate
 * @throws Error if the URL points to a known private/internal address
 */
export function validateExternalUrlSync(url: string): void {
  const parsedUrl = new URL(url);
  const hostname = canonicalizeHost(parsedUrl.hostname);

  if (!ALLOWED_URL_SCHEMES.has(parsedUrl.protocol)) {
    throw new SsrfBlockedError(
      `URL scheme "${parsedUrl.protocol}" is not allowed (only https: is permitted)`,
    );
  }

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError(`Access to internal hostname "${hostname}" is not allowed`);
  }

  // Validate IP addresses
  validateIpHostname(hostname);
}
