/**
 * Single source of truth for the OAuth scopes / MiAuth permissions requested
 * during login. Referenced by both app registration and the authorize URL.
 */

/**
 * Mastodon-family top-level scopes covering the SP1 write surface. Broad but
 * maximally compatible; `follow` is deprecated since 3.5.0 (redundant with
 * `write`) but kept for compatibility and to match the legacy default.
 */
export const MASTODON_SCOPES = "read write follow";

/**
 * Misskey/Foundkey permissions, trimmed to least-privilege for the SP1 write
 * surface. `read:account` covers whoami + home timeline + relationship reads
 * (Misskey has no separate read-timeline scope). Poll-voting and notification
 * writes are intentionally omitted (SP1 makes those Mastodon-only / read-only).
 */
export const MISSKEY_PERMISSIONS = [
  "read:account",
  "read:following",
  "write:notes",
  "write:reactions",
  "write:following",
  "write:blocks",
  "write:mutes",
  "write:drive",
  "read:notifications",
] as const;
