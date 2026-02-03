#!/usr/bin/env node

import { getLogger } from "@logtape/logtape";
import { SERVER_NAME, SERVER_VERSION, validateConfiguration } from "./config.js";
import ActivityPubMCPServer from "./mcp-server.js";
import "./logging.js";

const logger = getLogger("activitypub-mcp");

/**
 * Print version information and exit
 */
function printVersion(): void {
  console.log(`${SERVER_NAME} v${SERVER_VERSION}`);
  process.exit(0);
}

/**
 * Print help information and exit
 */
function printHelp(): void {
  console.log(`
${SERVER_NAME} v${SERVER_VERSION}
A Model Context Protocol server for exploring the Fediverse

USAGE:
  activitypub-mcp [OPTIONS]

OPTIONS:
  -h, --help      Show this help message
  -v, --version   Show version information

ENVIRONMENT VARIABLES:
  MCP_TRANSPORT_MODE     Transport mode: 'stdio' (default) or 'http'
  MCP_HTTP_PORT          HTTP server port (default: 3000)
  MCP_HTTP_HOST          HTTP server host (default: 127.0.0.1)
  LOG_LEVEL              Log level: debug, info, warn, error (default: info)
  REQUEST_TIMEOUT        Request timeout in ms (default: 10000)
  CACHE_TTL              Cache TTL in ms (default: 300000)
  RATE_LIMIT_ENABLED     Enable rate limiting (default: true)
  RATE_LIMIT_MAX         Max requests per window (default: 100)

EXAMPLES:
  # Start with stdio transport (default, for Claude Desktop)
  activitypub-mcp

  # Start with HTTP transport
  MCP_TRANSPORT_MODE=http MCP_HTTP_PORT=8080 activitypub-mcp

  # Enable debug logging
  LOG_LEVEL=debug activitypub-mcp

DOCUMENTATION:
  https://github.com/cameronrye/activitypub-mcp
`);
  process.exit(0);
}

/**
 * Parse command line arguments
 */
function parseArgs(): void {
  const args = process.argv.slice(2);

  for (const arg of args) {
    switch (arg) {
      case "-v":
      case "--version":
        printVersion();
        break;
      case "-h":
      case "--help":
        printHelp();
        break;
      default:
        // Unknown argument - show help
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}\n`);
          console.error("Use --help for usage information.");
          process.exit(1);
        }
    }
  }
}

/**
 * Entry point for the ActivityPub MCP Server
 *
 * This starts the MCP server that enables LLMs to interact with ActivityPub
 * through the Model Context Protocol.
 */
async function main() {
  // Parse CLI arguments first
  parseArgs();

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
