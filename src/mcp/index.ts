/**
 * MCP module exports.
 *
 * This module re-exports all MCP handlers for resources, tools, and prompts.
 */

export { registerPrompts } from "./prompts.js";
export { type ResourceConfig, registerResources } from "./resources.js";
export { registerTools } from "./tools.js";
