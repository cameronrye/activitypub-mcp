import { z } from "zod";

/**
 * Shared validation schemas for the ActivityPub MCP server
 */

/**
 * Domain validation schema
 * Validates DNS-compliant domain names with at least one dot (TLD required)
 * Rejects localhost and single-label domains
 */
export const DomainSchema = z
  .string()
  .min(1, "Domain cannot be empty")
  .max(253, "Domain too long")
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    "Invalid domain format",
  )
  .refine(
    (domain) =>
      !domain.includes("..") &&
      !domain.startsWith(".") &&
      !domain.endsWith(".") &&
      domain.includes("."), // Must contain at least one dot (no localhost/single-label domains)
    "Invalid domain format",
  );

/**
 * Actor identifier validation schema
 * Format: user@domain.com or @user@domain.com
 * Max length based on email spec (320 chars)
 */
export const ActorIdentifierSchema = z
  .string()
  .min(3, "Identifier too short")
  .max(320, "Identifier too long")
  .regex(
    /^@?[a-zA-Z0-9._-]+@[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
    "Invalid identifier format. Expected: user@domain.com or @user@domain.com",
  );

/**
 * Query string validation schema
 */
export const QuerySchema = z.string().min(1, "Query cannot be empty").max(500, "Query too long");
