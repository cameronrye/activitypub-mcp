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
// Zero-width space (U+200B) — kept as a named constant for documentation
// purposes; the defang function uses &lt; to break forged delimiters so the
// result is not parsed as an HTML tag by the HTML stripper downstream.
const ZWSP = "​";

/** Break any literal envelope delimiters inside attacker-supplied text. */
function defang(text: string): string {
  // Replace < with &lt; so the tag pattern is broken and survives stripHtmlTags.
  // The ZWSP is preserved in the constant for reference but &lt; is used here
  // because <ZWSP...> is still matched by the /<[^>]*>/g stripper.
  void ZWSP;
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
    .slice(0, 120);
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
