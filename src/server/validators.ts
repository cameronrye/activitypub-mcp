/**
 * Validation utilities for the ActivityPub MCP Server.
 * Wraps Zod schemas with MCP-friendly error handling.
 */

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ActorIdentifierSchema, DomainSchema, QuerySchema } from "../validation/schemas.js";

/**
 * Gets the first error message from a ZodError.
 */
function getZodErrorMessage(error: z.ZodError): string {
  const firstError = error.issues[0];
  return firstError?.message ?? "Unknown validation error";
}

/**
 * Validate and sanitize an actor identifier.
 * Throws McpError on validation failure.
 *
 * @param identifier - The actor identifier to validate (e.g., user@domain.social)
 * @returns The validated identifier
 * @throws McpError if validation fails
 */
export function validateActorIdentifier(identifier: string): string {
  try {
    return ActorIdentifierSchema.parse(identifier);
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid actor identifier: ${error instanceof z.ZodError ? getZodErrorMessage(error) : "Unknown validation error"}`,
    );
  }
}

/**
 * Validate a domain format.
 * Throws McpError on validation failure.
 *
 * @param domain - The domain to validate (e.g., mastodon.social)
 * @returns The validated domain
 * @throws McpError if validation fails
 */
export function validateDomain(domain: string): string {
  try {
    return DomainSchema.parse(domain);
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid domain: ${error instanceof z.ZodError ? getZodErrorMessage(error) : "Unknown validation error"}`,
    );
  }
}

/**
 * Validate a query string.
 * Throws McpError on validation failure.
 *
 * @param query - The search query to validate
 * @returns The validated query
 * @throws McpError if validation fails
 */
export function validateQuery(query: string): string {
  try {
    return QuerySchema.parse(query);
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid query: ${error instanceof z.ZodError ? getZodErrorMessage(error) : "Unknown validation error"}`,
    );
  }
}

/**
 * Extract a single value from a potentially array or undefined parameter.
 *
 * @param value - The value which may be a string, array of strings, or undefined
 * @returns The first string value, or empty string if undefined
 */
export function extractSingleValue(value: string | string[] | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}
