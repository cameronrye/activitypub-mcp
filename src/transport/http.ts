/**
 * HTTP Transport Server for MCP
 *
 * Provides HTTP/SSE transport for the MCP server, enabling remote
 * connections and production deployments.
 *
 * @module transport/http
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { getLogger } from "@logtape/logtape";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  HTTP_ALLOWED_HOSTS,
  HTTP_ALLOWED_ORIGINS,
  HTTP_CORS_ENABLED,
  HTTP_CORS_ORIGINS,
  HTTP_HOST,
  HTTP_PORT,
  HTTP_SECRET,
  SERVER_NAME,
  SERVER_VERSION,
} from "../config.js";
import { checkBearerAuth } from "./auth-middleware.js";

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
  private handleHealthCheck(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
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
    // Read from env at runtime so tests can set the variable after module load.
    // Fall back to the module-level constant for production use.
    const secret = process.env.MCP_HTTP_SECRET || HTTP_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error(
        "MCP_HTTP_SECRET is required for HTTP transport. Set it to a random " +
          "string of at least 16 characters (32+ recommended).",
      );
    }

    if (this.corsEnabled && this.corsOrigins.includes("*")) {
      logger.warn(
        "CORS is enabled with wildcard origin '*'. Auth still protects /mcp, " +
          "but explicit origins are strongly recommended.",
      );
    }

    return new Promise((resolve, reject) => {
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
          this.handleHealthCheck(res);
          return;
        }

        if (pathname === "/" && req.method === "GET") {
          this.handleServerInfo(res);
          return;
        }

        // MCP endpoint - delegate to transport
        if (pathname === "/mcp" || pathname === "/mcp/") {
          if (!checkBearerAuth(req, res, secret)) return;
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
        // Resolve the actual bound address so we can populate allowedHosts with
        // the real port (this.port may be 0 when the OS picks an ephemeral port).
        const boundAddress = this.server?.address();
        const actualPort =
          typeof boundAddress === "object" && boundAddress !== null ? boundAddress.port : this.port;

        // Build the allowed-hosts list using the actual bound port.
        // Operators binding to a public interface (e.g. 0.0.0.0 or a hostname
        // other than 127.0.0.1) should set MCP_HTTP_ALLOWED_HOSTS to the
        // Host value(s) that clients will send (comma-separated).
        // Both "host" and "host:port" forms are included in the default so
        // HTTP clients that omit the default-scheme port are still accepted.
        const allowedHosts = HTTP_ALLOWED_HOSTS.length
          ? HTTP_ALLOWED_HOSTS
          : [this.host, `${this.host}:${actualPort}`];

        // Pass corsOrigins to the SDK's allowedOrigins only when they are
        // concrete origins. A wildcard ("*") is not a valid Origin value and
        // would cause the SDK to reject every cross-origin request, so we omit
        // it in that case and let bearer-auth remain the gate.
        // MCP_HTTP_ALLOWED_ORIGINS takes precedence when set.
        const hasWildcard = this.corsOrigins.includes("*");
        const allowedOrigins = HTTP_ALLOWED_ORIGINS.length
          ? HTTP_ALLOWED_ORIGINS
          : hasWildcard
            ? undefined
            : this.corsOrigins.filter(Boolean).length
              ? this.corsOrigins.filter(Boolean)
              : undefined;

        // Create the streamable HTTP transport with DNS-rebinding protection.
        // The SDK options are marked @deprecated in favour of external middleware,
        // but they are still fully functional and provide defence-in-depth against
        // DNS-rebinding attacks at the SDK layer.
        this.transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableDnsRebindingProtection: true,
          allowedHosts,
          allowedOrigins,
        });

        logger.info("HTTP transport server started", {
          host: this.host,
          port: actualPort,
          endpoints: {
            mcp: `http://${this.host}:${actualPort}/mcp`,
            health: `http://${this.host}:${actualPort}/health`,
          },
        });

        resolve(this.transport);
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
