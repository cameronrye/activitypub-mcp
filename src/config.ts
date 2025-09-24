/**
 * Configuration constants for the ActivityPub MCP Server
 */

// User-Agent string for HTTP requests
export const USER_AGENT = process.env.USER_AGENT || "ActivityPub-MCP-Client/1.0.0";

// Request timeout in milliseconds
export const REQUEST_TIMEOUT = Number.parseInt(process.env.REQUEST_TIMEOUT || "10000", 10);

// Default instance for hardcoded references (should be made configurable)
export const DEFAULT_INSTANCE = process.env.DEFAULT_INSTANCE || "mastodon.social";
