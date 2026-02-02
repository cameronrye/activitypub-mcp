#!/usr/bin/env node

import { getLogger } from "@logtape/logtape";
import { validateConfiguration } from "./config.js";
import ActivityPubMCPServer from "./mcp-server.js";
import "./logging.js";

const logger = getLogger("activitypub-mcp");

/**
 * Entry point for the ActivityPub MCP Server
 *
 * This starts the MCP server that enables LLMs to interact with ActivityPub
 * through the Model Context Protocol.
 */
async function main() {
  try {
    // Validate configuration and log warnings for missing recommended settings
    validateConfiguration();

    const server = new ActivityPubMCPServer();
    await server.start();
  } catch (error) {
    logger.error("Failed to start ActivityPub MCP Server", { error });
    process.exit(1);
  }
}

main();
