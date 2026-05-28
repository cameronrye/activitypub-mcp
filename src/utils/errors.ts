/**
 * Error handling utilities for the ActivityPub MCP Server.
 */

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
