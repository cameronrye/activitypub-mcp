/**
 * Single source of truth for the OAuth scopes / MiAuth permissions requested
 * during login. Referenced by both app registration and the authorize URL.
 *
 * Scopes are least-privilege by deployment intent: a read-only server (the
 * default, ACTIVITYPUB_ENABLE_WRITES unset) stores a read-only token, so a
 * leaked credential file cannot post/follow/block. Pass `writes=true` (login
 * `--write`, or ACTIVITYPUB_ENABLE_WRITES=true) to provision a write-capable
 * token; enabling writes later requires re-login.
 */

/** Mastodon-family read-only scope. */
export const MASTODON_READ_SCOPES = "read";

/**
 * Mastodon-family scopes covering the write surface. Broad but maximally
 * compatible; `follow` is deprecated since 3.5.0 (redundant with `write`) but
 * kept for compatibility and to match the legacy default.
 */
export const MASTODON_WRITE_SCOPES = "read write follow";

/** Misskey/Foundkey read-only permissions. */
export const MISSKEY_READ_PERMISSIONS = [
  "read:account",
  "read:following",
  "read:notifications",
] as const;

/**
 * Misskey/Foundkey permissions, trimmed to least-privilege for the write
 * surface. `read:account` covers whoami + home timeline + relationship reads
 * (Misskey has no separate read-timeline scope). Poll-voting and notification
 * writes are intentionally omitted (those are Mastodon-only / read-only).
 */
export const MISSKEY_WRITE_PERMISSIONS = [
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

/**
 * Select the scope/permission list for a login by platform and whether write
 * access is wanted. Read-only by default — see the module doc.
 */
export function scopesFor(kind: "mastodon" | "misskey", writes: boolean): string[] {
  if (kind === "misskey") {
    return [...(writes ? MISSKEY_WRITE_PERMISSIONS : MISSKEY_READ_PERMISSIONS)];
  }
  return (writes ? MASTODON_WRITE_SCOPES : MASTODON_READ_SCOPES).split(" ");
}
