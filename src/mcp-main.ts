#!/usr/bin/env node

import ActivityPubMCPServer from "./mcp-server.js";
import "./logging.js";

/**
 * Entry point for the ActivityPub MCP Server
 *
 * This starts the MCP server that enables LLMs to interact with ActivityPub
 * through the Model Context Protocol.
 */
async function main() {
  try {
    const server = new ActivityPubMCPServer();
    await server.start();
  } catch (error) {
    console.error("Failed to start ActivityPub MCP Server:", error);
    process.exit(1);
  }
}

main();
