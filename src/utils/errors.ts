/**
 * Error handling utilities for the ActivityPub MCP Server.
 */

import { wrapUntrusted } from "./untrusted.js";

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
    // More specific than the generic 403 below — must come first. Fires on a
    // token that lacks the required scope (e.g. a read-only login token used
    // after enabling writes); the now-included response body carries this text.
    pattern: /outside the authorized scopes|insufficient[_ ]?scope/i,
    suggestion:
      "Your token lacks the required scope. If you logged in read-only, re-authenticate with write access: `activitypub-mcp login <instance> --write`.",
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
 * Format an error for model-facing tool output when the message may embed
 * attacker-influenceable remote text.
 *
 * Remote HTTP error bodies (a hostile or compromised instance controls them)
 * flow into the thrown Error message — e.g. `Failed to X: HTTP 403 - <body>` —
 * and every tool catch block renders that straight into the model's context.
 * The success paths fence remote content in the untrusted-content envelope, but
 * the error paths did not, leaving a prompt-injection bypass: an injected
 * instruction in the body reached the model un-fenced. This closes that gap by
 * fencing the whole message as quoted DATA (defanging any forged delimiters)
 * while still computing the actionable suggestion from the raw text.
 */
export function formatRemoteError(error: unknown, source = "remote instance error"): string {
  const message = getErrorMessage(error);
  const suggestion = getErrorSuggestion(message);
  const fenced = wrapUntrusted(message, source);
  return suggestion ? `${fenced}\n\n💡 Suggestion: ${suggestion}` : fenced;
}

/**
 * Thrown when an operation has no equivalent on the target fediverse software
 * (e.g. poll voting or scheduled posts on Misskey). Surfaced to the LLM as a
 * clear, actionable error instead of an opaque HTTP failure.
 */
export class UnsupportedOnPlatformError extends Error {
  constructor(
    public readonly op: string,
    public readonly platform: string,
  ) {
    super(`${op} is not supported on ${platform}`);
    this.name = "UnsupportedOnPlatformError";
  }
}

/**
 * Thrown when an authenticated request is rejected with HTTP 401 — the token was
 * revoked or expired. (403 is NOT treated as token rejection: it is also used for
 * per-operation permission/scope errors that adapters must surface verbatim, e.g.
 * Misskey's `{error:{message}}` body.) Carries the account identity so the message
 * can point the user at the exact re-login command.
 */
export class TokenRejectedError extends Error {
  constructor(
    public readonly instance: string,
    public readonly username: string,
  ) {
    super(
      `The token for @${username}@${instance} was rejected (revoked or expired). ` +
        `Run \`activitypub-mcp login ${instance}\` to re-authorize.`,
    );
    this.name = "TokenRejectedError";
  }
}
