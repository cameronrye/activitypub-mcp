/**
 * Unit tests for the HttpTransportServer class.
 */

import { afterEach, describe, expect, it } from "vitest";
import { HttpTransportServer } from "../../src/server/http-transport.js";

describe("HttpTransportServer", () => {
  let server: HttpTransportServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  describe("constructor", () => {
    it("should create server with default options", () => {
      server = new HttpTransportServer();
      expect(server).toBeDefined();
    });

    it("should create server with custom options", () => {
      server = new HttpTransportServer({
        port: 4000,
        host: "0.0.0.0",
        corsEnabled: true,
        corsOrigins: "http://localhost:3000",
      });
      expect(server).toBeDefined();
    });
  });

  describe("start and stop", () => {
    it("should start and stop the server", async () => {
      server = new HttpTransportServer({ port: 0 }); // Use random available port

      const transport = await server.start();
      expect(transport).toBeDefined();

      const address = server.getAddress();
      expect(address).not.toBeNull();
      expect(address?.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.getAddress()).toBeNull();
    });

    it("should handle stop when not started", async () => {
      server = new HttpTransportServer();
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  describe("getAddress", () => {
    it("should return null when server not started", () => {
      server = new HttpTransportServer();
      expect(server.getAddress()).toBeNull();
    });

    it("should return address when server is running", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      expect(address).not.toBeNull();
      expect(address?.host).toBeDefined();
      expect(address?.port).toBeGreaterThan(0);
    });
  });

  describe("HTTP endpoints", () => {
    it("should respond to health endpoint", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/health`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBeDefined();
    });

    it("should respond to metrics endpoint", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/metrics`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeDefined();
    });

    it("should respond to root endpoint with server info", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBeDefined();
      expect(data.version).toBeDefined();
      expect(data.transport).toBe("http");
    });

    it("should return 404 for unknown routes", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/unknown`);

      expect(response.status).toBe(404);
    });

    it("should handle CORS preflight when enabled", async () => {
      server = new HttpTransportServer({
        port: 0,
        corsEnabled: true,
        corsOrigins: "*",
      });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/health`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://example.com",
        },
      });

      expect(response.status).toBe(204);
    });

    it("should set CORS headers for allowed origins", async () => {
      server = new HttpTransportServer({
        port: 0,
        corsEnabled: true,
        corsOrigins: "http://allowed.com,http://also-allowed.com",
      });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/health`, {
        headers: {
          Origin: "http://allowed.com",
        },
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://allowed.com");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });

    it("should not set CORS headers for disallowed origins", async () => {
      server = new HttpTransportServer({
        port: 0,
        corsEnabled: true,
        corsOrigins: "http://allowed.com",
      });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/health`, {
        headers: {
          Origin: "http://not-allowed.com",
        },
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("should not set CORS headers when disabled", async () => {
      server = new HttpTransportServer({
        port: 0,
        corsEnabled: false,
      });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/health`, {
        headers: {
          Origin: "http://example.com",
        },
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("should handle trailing slashes in routes", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();

      // Health endpoint with trailing slash
      const healthResponse = await fetch(`http://${address?.host}:${address?.port}/health/`);
      expect(healthResponse.status).toBe(200);

      // Metrics endpoint with trailing slash
      const metricsResponse = await fetch(`http://${address?.host}:${address?.port}/metrics/`);
      expect(metricsResponse.status).toBe(200);
    });

    it("should include correct endpoints in server info", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/`);
      const data = await response.json();

      expect(data.endpoints).toBeDefined();
      expect(data.endpoints.mcp).toBe("/mcp");
      expect(data.endpoints.health).toBe("/health");
      expect(data.endpoints.metrics).toBe("/metrics");
      expect(data.endpoints.info).toBe("/");
    });

    it("should handle POST requests to unknown routes", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/unknown`, {
        method: "POST",
        body: JSON.stringify({ test: true }),
      });

      expect(response.status).toBe(404);
    });

    it("should handle DELETE requests to unknown routes", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      const response = await fetch(`http://${address?.host}:${address?.port}/unknown`, {
        method: "DELETE",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("MCP endpoint", () => {
    it("should respond to MCP endpoint with trailing slash", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      const address = server.getAddress();
      // MCP endpoint exists but expects proper MCP protocol messages
      const response = await fetch(`http://${address?.host}:${address?.port}/mcp/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      // Should not be 404 - it reaches the MCP handler
      expect(response.status).not.toBe(404);
    });
  });

  describe("graceful shutdown", () => {
    it("should handle multiple stop calls gracefully", async () => {
      server = new HttpTransportServer({ port: 0 });
      await server.start();

      await server.stop();
      await server.stop(); // Second stop should not throw

      expect(server.getAddress()).toBeNull();
    });
  });

  describe("server configuration", () => {
    it("should use provided port", async () => {
      // Use a specific port for this test
      server = new HttpTransportServer({ port: 0, host: "127.0.0.1" });
      await server.start();

      const address = server.getAddress();
      expect(address?.host).toBe("127.0.0.1");
      expect(address?.port).toBeGreaterThan(0);
    });

    it("should parse comma-separated CORS origins", async () => {
      server = new HttpTransportServer({
        port: 0,
        corsEnabled: true,
        corsOrigins: "http://a.com, http://b.com , http://c.com",
      });
      await server.start();

      const address = server.getAddress();

      // Test first origin
      const response1 = await fetch(`http://${address?.host}:${address?.port}/health`, {
        headers: { Origin: "http://a.com" },
      });
      expect(response1.headers.get("Access-Control-Allow-Origin")).toBe("http://a.com");

      // Test middle origin (with extra whitespace in config)
      const response2 = await fetch(`http://${address?.host}:${address?.port}/health`, {
        headers: { Origin: "http://b.com" },
      });
      expect(response2.headers.get("Access-Control-Allow-Origin")).toBe("http://b.com");

      // Test last origin
      const response3 = await fetch(`http://${address?.host}:${address?.port}/health`, {
        headers: { Origin: "http://c.com" },
      });
      expect(response3.headers.get("Access-Control-Allow-Origin")).toBe("http://c.com");
    });
  });
});
