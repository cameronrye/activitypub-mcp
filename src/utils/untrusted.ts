/**
 * Untrusted-content envelope.
 *
 * Remote fediverse content (bios, posts, notifications, display names) is
 * attacker-controllable and is the primary prompt-injection vector for this
 * server. These helpers fence such content in an explicit, provenance-labeled
 * envelope so the model treats it as quoted DATA, not instructions, and defang
 * any attempt by the payload to forge the envelope delimiters.
 *
 * This is a mitigation, not a cure. See SECURITY.md.
 */

import { stripHtmlTags } from "./html.js";

const OPEN_PREFIX = "<untrusted-content";
const CLOSE_TAG = "</untrusted-content>";

// defang() replaces the delimiter tags with an &lt;-prefixed form BEFORE HTML
// stripping. A zero-width space after "<" is insufficient: the /<[^>]*>/g
// stripper still matches "<​untrusted-content>" and would erase a forged tag
// entirely, collapsing the payload to "(empty)".
//
// Matching is whitespace- and case-INSENSITIVE. wrapUntrustedBlock does not
// strip HTML, so a near-miss like "</untrusted-content >" or an upper-case
// "</UNTRUSTED-CONTENT>" would otherwise survive verbatim and read to a tolerant
// model as a real closing delimiter. We neutralize any such variant by escaping
// its leading "<".
const OPEN_DELIM_RE = /<(\s*untrusted-content)/gi;
// `\b[^>]*>` tolerates any trailing junk before '>' (e.g. </untrusted-content/>,
// </untrusted-content x>) which a lenient HTML/model parser still treats as a
// closing tag — while `\b` leaves a genuinely different tag (</untrusted-contentXYZ>)
// untouched.
const CLOSE_DELIM_RE = /<(\s*\/\s*untrusted-content\b[^>]*>)/gi;

/** Break any envelope-delimiter forgery inside attacker-supplied text. */
function defang(text: string): string {
  return text.replace(CLOSE_DELIM_RE, "&lt;$1").replace(OPEN_DELIM_RE, "&lt;$1");
}

/** Make a one-line, quote-free source label. */
function safeLabel(source: string): string {
  // The label is interpolated into `<untrusted-content source="...">`. Beyond
  // stripping HTML and quotes, escape any remaining angle brackets: a lone '>'
  // (or unpaired '<') from an unvalidated remote string would otherwise close
  // the opening delimiter early and let attacker text escape the envelope.
  return stripHtmlTags(source ?? "")
    .replaceAll('"', "'")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120); // keep the attribute value bounded
}

/**
 * Wrap free-text remote content. Strips HTML, then fences it. Returns the literal
 * string "(empty)" when there is nothing to show, so callers don't emit an empty
 * envelope.
 *
 * Defang runs before stripHtmlTags so that a payload whose entire content is a
 * forged delimiter tag (e.g. "<untrusted-content source='spoof'>") survives the
 * HTML strip as "&lt;untrusted-content …>" rather than being reduced to an empty
 * string that bypasses the envelope entirely.
 */
export function wrapUntrusted(text: string, source: string): string {
  const processed = stripHtmlTags(defang(text ?? "")).trim();
  if (!processed) return "(empty)";
  return `${OPEN_PREFIX} source="${safeLabel(source)}">\n${processed}\n${CLOSE_TAG}`;
}

/**
 * Wrap an already-serialized remote payload (e.g. JSON.stringify of a fetched
 * resource). Does NOT strip HTML — the body is structural — but still defangs
 * forged delimiters.
 */
export function wrapUntrustedBlock(body: string, source: string): string {
  return `${OPEN_PREFIX} source="${safeLabel(source)}">\n${defang(body ?? "")}\n${CLOSE_TAG}`;
}

/**
 * Neutralize a SHORT remote string used as an INLINE label — a display name,
 * handle/acct, hashtag, or software name — rather than block content. These are
 * interpolated mid-line (e.g. `**@bob** (Bob)`) where a full envelope would be
 * noise, so instead we: strip HTML, defang forged envelope delimiters, and
 * collapse ALL whitespace (including newlines) to single spaces. The whitespace
 * collapse is the key control: it stops the value from breaking out of its line
 * into a new markdown heading / instruction block. Returns "" for empty input —
 * callers supply their own fallback (e.g. the raw id).
 */
export function sanitizeInline(text: string): string {
  const cleaned = stripHtmlTags(defang(text ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  // Truncate by code point (not UTF-16 code unit) so the cap can't split a
  // surrogate pair into a lone surrogate that serializes to U+FFFD.
  return [...cleaned].slice(0, 200).join("");
}
