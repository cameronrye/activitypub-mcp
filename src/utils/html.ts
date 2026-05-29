/**
 * HTML utilities for the ActivityPub MCP Server.
 */

/**
 * Strips HTML tags from a string safely, handling nested tags.
 * Uses an iterative approach to prevent incomplete sanitization
 * where nested constructs like `<div<script>>` could leave residual tags.
 *
 * @param html - The HTML string to strip tags from
 * @returns The plain text content with all HTML tags removed
 */
export function stripHtmlTags(html: string): string {
  let result = html;
  let previous = "";
  // Iterate until no more changes occur (handles nested tags)
  while (result !== previous) {
    previous = result;
    result = result.replace(/<[^>]*>/g, "");
  }
  return result;
}
