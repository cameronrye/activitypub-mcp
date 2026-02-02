/**
 * ActivityPub MCP Server
 *
 * A comprehensive Model Context Protocol server that enables LLMs to interact
 * with the ActivityPub/Fediverse ecosystem through standardized MCP tools,
 * resources, and prompts.
 *
 * @module mcp-server
 */

import { getLogger } from "@logtape/logtape";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  LOG_LEVEL,
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW,
  SERVER_NAME,
  SERVER_VERSION,
} from "./config.js";
import { registerPrompts, registerResources, registerTools } from "./mcp/index.js";
import { RateLimiter } from "./server/index.js";

const logger = getLogger("activitypub-mcp");

/**
 * Configuration for the MCP server, loaded from environment variables.
 */
const CONFIG = {
  serverName: SERVER_NAME,
  serverVersion: SERVER_VERSION,
  logLevel: LOG_LEVEL,
  rateLimitEnabled: RATE_LIMIT_ENABLED,
  rateLimitMax: RATE_LIMIT_MAX,
  rateLimitWindow: RATE_LIMIT_WINDOW,
};

/**
 * Sets up global error handlers for uncaught exceptions and unhandled rejections.
 * These handlers log the errors and exit the process for uncaught exceptions.
 */
function setupGlobalErrorHandlers(): void {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled promise rejection", { reason, promise });
  });
}

/**
 * ActivityPub MCP Server class.
 *
 * This class manages the MCP server lifecycle, including initialization,
 * registration of resources/tools/prompts, and graceful shutdown.
 */
class ActivityPubMCPServer {
  private readonly mcpServer: McpServer;
  private readonly rateLimiter: RateLimiter;
  private isShuttingDown = false;

  /**
   * Creates a new ActivityPubMCPServer instance.
   */
  constructor() {
    this.mcpServer = new McpServer({
      name: CONFIG.serverName,
      version: CONFIG.serverVersion,
    });

    this.rateLimiter = new RateLimiter({
      enabled: CONFIG.rateLimitEnabled,
      maxRequests: CONFIG.rateLimitMax,
      windowMs: CONFIG.rateLimitWindow,
    });

    this.setupResources();
    this.setupTools();
    this.setupPrompts();
    this.setupShutdownHandlers();
  }

  /**
   * Sets up MCP resources for ActivityPub data access.
   */
  private setupResources(): void {
    registerResources(this.mcpServer, this.rateLimiter, CONFIG);
  }

  /**
   * Sets up MCP tools for fediverse interactions.
   */
  private setupTools(): void {
    registerTools(this.mcpServer, this.rateLimiter);
  }

  /**
   * Sets up MCP prompts for guided fediverse exploration.
   */
  private setupPrompts(): void {
    registerPrompts(this.mcpServer);
  }

  /**
   * Sets up graceful shutdown handlers for SIGTERM and SIGINT signals.
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn("Shutdown already in progress, ignoring signal", { signal });
        return;
      }

      this.isShuttingDown = true;
      logger.info("Received shutdown signal, cleaning up...", { signal });

      try {
        await this.stop();
        logger.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown", {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  /**
   * Stops the server and cleans up resources.
   */
  async stop(): Promise<void> {
    logger.info("Stopping ActivityPub MCP Server...");
    this.rateLimiter.stop();
    logger.info("ActivityPub MCP Server stopped");
  }

  /**
   * Starts the MCP server using stdio transport.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
    logger.info("ActivityPub MCP Server started", {
      name: CONFIG.serverName,
      version: CONFIG.serverVersion,
    });
  }
}

// Set up global error handlers at module level
setupGlobalErrorHandlers();

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ActivityPubMCPServer();
  try {
    await server.start();
  } catch (error) {
    logger.error("Failed to start MCP server", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

export default ActivityPubMCPServer;
