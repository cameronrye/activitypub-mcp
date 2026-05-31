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

// defang() replaces the literal delimiter strings with an &lt;-prefixed form
// BEFORE HTML stripping. A zero-width space after "<" is insufficient: the
// /<[^>]*>/g stripper still matches "<​untrusted-content>" and would erase a
// forged tag entirely, collapsing the payload to "(empty)".
/** Break any literal envelope delimiters inside attacker-supplied text. */
function defang(text: string): string {
  // We only neutralize the canonical lowercase delimiters; a differently-cased
  // forgery like <UNTRUSTED-CONTENT> cannot close our lowercase </untrusted-content>.
  return text
    .replaceAll(OPEN_PREFIX, "&lt;untrusted-content")
    .replaceAll(CLOSE_TAG, "&lt;/untrusted-content>");
}

/** Make a one-line, quote-free source label. */
function safeLabel(source: string): string {
  return stripHtmlTags(source ?? "")
    .replaceAll('"', "'")
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
