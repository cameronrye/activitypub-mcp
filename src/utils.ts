/**
 * Utility functions for the ActivityPub MCP Server
 */

import { lookup } from "node:dns/promises";

/**
 * Error patterns and their corresponding suggestions
 */
interface ErrorSuggestion {
  pattern: RegExp;
  suggestion: string;
}

const ERROR_SUGGESTIONS: ErrorSuggestion[] = [
  {
    pattern: /ENOTFOUND|getaddrinfo|DNS/i,
    suggestion: "Check that the domain exists and is spelled correctly.",
  },
  {
    pattern: /ECONNREFUSED/i,
    suggestion: "The server refused the connection. It may be down or blocking requests.",
  },
  {
    pattern: /ETIMEDOUT|timed?\s*out/i,
    suggestion: "The request timed out. The server may be slow or unreachable.",
  },
  {
    pattern: /ECONNRESET|connection reset/i,
    suggestion: "The connection was reset. Try again or check if the server is stable.",
  },
  {
    pattern: /404|not found/i,
    suggestion: "The resource was not found. Verify the username or domain is correct.",
  },
  {
    pattern: /401|unauthorized/i,
    suggestion: "Authentication required. This content may be private or require login.",
  },
  {
    pattern: /403|forbidden/i,
    suggestion: "Access denied. The server may be blocking automated requests.",
  },
  {
    pattern: /410|gone/i,
    suggestion: "This resource has been deleted or is no longer available.",
  },
  {
    pattern: /429|rate.?limit|too many requests/i,
    suggestion: "Rate limited. Wait a few minutes before trying again.",
  },
  {
    pattern: /5\d{2}|internal server error|server error/i,
    suggestion: "The remote server encountered an error. Try again later.",
  },
  {
    pattern: /no outbox/i,
    suggestion: "This actor doesn't have a public outbox. Their posts may be private.",
  },
  {
    pattern: /no followers/i,
    suggestion: "This actor's followers list is not publicly available.",
  },
  {
    pattern: /no following/i,
    suggestion: "This actor's following list is not publicly available.",
  },
  {
    pattern: /invalid.*identifier|invalid.*format/i,
    suggestion: "Use format 'username@domain.social' (e.g., 'mastodon@mastodon.social').",
  },
  {
    pattern: /invalid.*domain/i,
    suggestion: "Enter a valid domain (e.g., 'mastodon.social', 'fosstodon.org').",
  },
  {
    pattern: /private.*ip|internal.*host|ssrf/i,
    suggestion: "Cannot access internal or private network addresses.",
  },
  {
    pattern: /certificate|ssl|tls/i,
    suggestion: "SSL certificate error. The server may have an invalid certificate.",
  },
  {
    pattern: /parse|json|syntax/i,
    suggestion:
      "Received invalid data from server. The instance may not be ActivityPub compatible.",
  },
  {
    pattern: /webfinger/i,
    suggestion: "WebFinger lookup failed. Verify the username exists on this instance.",
  },
];

/**
 * Get a suggestion for an error message.
 * @param errorMessage - The error message to analyze
 * @returns A helpful suggestion or undefined if no match
 */
export function getErrorSuggestion(errorMessage: string): string | undefined {
  for (const { pattern, suggestion } of ERROR_SUGGESTIONS) {
    if (pattern.test(errorMessage)) {
      return suggestion;
    }
  }
  return undefined;
}

/**
 * Format an error message with an optional suggestion.
 * @param errorMessage - The original error message
 * @returns Formatted error with suggestion if available
 */
export function formatErrorWithSuggestion(errorMessage: string): string {
  const suggestion = getErrorSuggestion(errorMessage);
  if (suggestion) {
    return `${errorMessage}\n\n💡 Suggestion: ${suggestion}`;
  }
  return errorMessage;
}

/**
 * Extracts a string message from an unknown error type.
 * Used consistently throughout the codebase for error handling.
 *
 * @param error - The error to extract a message from
 * @returns A string representation of the error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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
const PRIVATE_IPV6_RANGES = [
  /^::1$/i, // Loopback
  /^::$/i, // Unspecified address
  /^::ffff:/i, // IPv4-mapped IPv6 addresses (check the mapped IPv4)
  /^fe80:/i, // Link-local (fe80::/10)
  /^fc00:/i, // Unique local address (fc00::/7)
  /^fd/i, // Unique local address (fd00::/8)
  /^ff0[\da-f]:/i, // Multicast (ff00::/8)
  /^2001:db8:/i, // Documentation (2001:db8::/32)
  /^2001::/i, // Teredo tunneling (2001::/32) - could be abused
  /^64:ff9b:/i, // NAT64 (64:ff9b::/96)
  /^100::/i, // Discard prefix (100::/64)
  /^2002:/i, // 6to4 (2002::/16) - deprecated, could be abused
];

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
 * Checks if an IPv4 address is a private/internal IP that should be blocked.
 *
 * @param ip - The IPv4 address to check
 * @returns True if the IP is private/internal
 */
export function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some((range) => range.test(ip));
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
  const lowerHostname = hostname.toLowerCase();

  // Check exact matches
  if (BLOCKED_HOSTNAMES.has(lowerHostname)) {
    return true;
  }

  // Check suffix matches
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => lowerHostname.endsWith(suffix));
}

/** Regex to match IPv4 addresses */
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Regex to match IPv6 addresses (with or without brackets) */
const IPV6_REGEX = /^(?:\[?[\da-fA-F:]+\]?)$/;

/**
 * Validates a hostname that appears to be an IP address.
 * @throws Error if the IP is private/internal
 */
function validateIpHostname(hostname: string): void {
  if (IPV4_REGEX.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new Error(`Access to private IP address "${hostname}" is not allowed`);
    }
    return;
  }

  if (IPV6_REGEX.test(hostname) && hostname.includes(":")) {
    if (isPrivateIPv6(hostname)) {
      throw new Error(`Access to private IP address "${hostname}" is not allowed`);
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
 */
function handleDnsLookupError(error: unknown): void {
  if (!(error instanceof Error)) {
    return;
  }

  // Re-throw our security-related errors
  if (error.message.includes("not allowed") || error.message.includes("DNS rebinding")) {
    throw error;
  }

  // If DNS lookup fails with ENOTFOUND, that's fine (domain doesn't exist)
  if ("code" in error && (error as NodeJS.ErrnoException).code === "ENOTFOUND") {
    return;
  }

  // Other DNS errors - allow (might be transient)
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
  const hostname = parsedUrl.hostname.toLowerCase();

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    throw new Error(`Access to internal hostname "${hostname}" is not allowed`);
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
        throw new Error(
          `DNS resolution for "${hostname}" returned private IP "${addr.address}" - possible DNS rebinding attack`,
        );
      }
    }
  } catch (error) {
    handleDnsLookupError(error);
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
  const hostname = parsedUrl.hostname.toLowerCase();

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    throw new Error(`Access to internal hostname "${hostname}" is not allowed`);
  }

  // Validate IP addresses
  validateIpHostname(hostname);
}
