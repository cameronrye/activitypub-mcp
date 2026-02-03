/**
 * HTTP Transport Server for MCP
 *
 * Provides HTTP/SSE transport for the MCP server, enabling remote
 * connections and production deployments.
 *
 * @module server/http-transport
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { getLogger } from "@logtape/logtape";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  HTTP_CORS_ENABLED,
  HTTP_CORS_ORIGINS,
  HTTP_HOST,
  HTTP_PORT,
  SERVER_NAME,
  SERVER_VERSION,
} from "../config.js";
import { healthChecker } from "../health-check.js";
import { performanceMonitor } from "../performance-monitor.js";

const logger = getLogger("activitypub-mcp:http");

/**
 * HTTP Transport configuration options
 */
export interface HttpTransportOptions {
  port?: number;
  host?: string;
  corsEnabled?: boolean;
  corsOrigins?: string;
}

/**
 * HTTP Transport Server for MCP
 *
 * Provides HTTP/SSE-based transport with health endpoints and CORS support.
 */
export class HttpTransportServer {
  private server: Server | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly corsEnabled: boolean;
  private readonly corsOrigins: string[];
  private readonly activeConnections = new Set<ServerResponse>();

  constructor(options: HttpTransportOptions = {}) {
    this.port = options.port ?? HTTP_PORT;
    this.host = options.host ?? HTTP_HOST;
    this.corsEnabled = options.corsEnabled ?? HTTP_CORS_ENABLED;
    this.corsOrigins = (options.corsOrigins ?? HTTP_CORS_ORIGINS).split(",").map((o) => o.trim());
  }

  /**
   * Set CORS headers on response if enabled
   */
  private setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
    if (!this.corsEnabled) return;

    const origin = req.headers.origin;
    if (origin && (this.corsOrigins.includes("*") || this.corsOrigins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
  }

  /**
   * Handle health check endpoint
   */
  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    try {
      const health = await healthChecker.performHealthCheck(true);
      let statusCode: number;
      if (health.status === "healthy" || health.status === "degraded") {
        statusCode = 200;
      } else {
        statusCode = 503;
      }

      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health, null, 2));
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", error: "Internal server error" }));
    }
  }

  /**
   * Handle metrics endpoint
   */
  private handleMetrics(res: ServerResponse): void {
    try {
      const metrics = performanceMonitor.getMetrics();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(metrics, null, 2));
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }

  /**
   * Handle server info endpoint
   */
  private handleServerInfo(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          name: SERVER_NAME,
          version: SERVER_VERSION,
          transport: "http",
          endpoints: {
            mcp: "/mcp",
            health: "/health",
            metrics: "/metrics",
            info: "/",
          },
        },
        null,
        2,
      ),
    );
  }

  /**
   * Create and start the HTTP server
   */
  async start(): Promise<Transport> {
    return new Promise((resolve, reject) => {
      // Create the streamable HTTP transport
      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });

      this.server = createServer(async (req, res) => {
        // Track active connections for graceful shutdown
        this.activeConnections.add(res);
        res.on("close", () => this.activeConnections.delete(res));

        // Set CORS headers
        this.setCorsHeaders(req, res);

        // Handle preflight requests
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url || "/", `http://${req.headers.host}`);
        const pathname = url.pathname;

        // Route requests
        if (pathname === "/health" || pathname === "/health/") {
          await this.handleHealthCheck(res);
          return;
        }

        if (pathname === "/metrics" || pathname === "/metrics/") {
          this.handleMetrics(res);
          return;
        }

        if (pathname === "/" && req.method === "GET") {
          this.handleServerInfo(res);
          return;
        }

        // MCP endpoint - delegate to transport
        if (pathname === "/mcp" || pathname === "/mcp/") {
          try {
            if (this.transport) {
              await this.transport.handleRequest(req, res);
            } else {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Transport not initialized" }));
            }
          } catch (error) {
            logger.error("Error handling MCP request", { error });
            if (!res.headersSent) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Internal server error" }));
            }
          }
          return;
        }

        // 404 for unknown routes
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      });

      this.server.on("error", (error) => {
        logger.error("HTTP server error", { error });
        reject(error);
      });

      this.server.listen(this.port, this.host, () => {
        logger.info("HTTP transport server started", {
          host: this.host,
          port: this.port,
          endpoints: {
            mcp: `http://${this.host}:${this.port}/mcp`,
            health: `http://${this.host}:${this.port}/health`,
            metrics: `http://${this.host}:${this.port}/metrics`,
          },
        });
        if (this.transport) {
          resolve(this.transport);
        } else {
          reject(new Error("Transport was not initialized"));
        }
      });
    });
  }

  /**
   * Stop the HTTP server gracefully
   */
  async stop(): Promise<void> {
    if (!this.server) return;

    logger.info("Stopping HTTP transport server...");

    // Close all active connections
    for (const connection of this.activeConnections) {
      connection.end();
    }
    this.activeConnections.clear();

    // Close the transport
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    // Close the server
    const serverToClose = this.server;
    return new Promise((resolve, reject) => {
      serverToClose.close((error) => {
        if (error) {
          logger.error("Error stopping HTTP server", { error });
          reject(error);
        } else {
          logger.info("HTTP transport server stopped");
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get the server address
   */
  getAddress(): { host: string; port: number } | null {
    if (!this.server) return null;
    const address = this.server.address();
    if (typeof address === "string" || !address) return null;
    return { host: address.address, port: address.port };
  }
}
