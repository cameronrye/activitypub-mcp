/**
 * Tests for ActivityPub MCP Server module
 * Tests the exported class structure and basic functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies before importing the module
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class MockMcpServer {
    connect = vi.fn().mockResolvedValue(undefined);
    registerTool = vi.fn();
    registerResource = vi.fn();
    registerPrompt = vi.fn();
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class MockStdioTransport {},
}));

vi.mock("../../src/mcp/index.js", () => ({
  registerTools: vi.fn(),
  registerResources: vi.fn(),
  registerPrompts: vi.fn(),
}));

vi.mock("../../src/server/index.js", () => ({
  RateLimiter: class MockRateLimiter {
    checkLimit = vi.fn().mockReturnValue(true);
    stop = vi.fn();
  },
  HttpTransportServer: class MockHttpServer {
    start = vi.fn().mockResolvedValue({});
    stop = vi.fn().mockResolvedValue(undefined);
    getAddress = vi.fn().mockReturnValue({ host: "localhost", port: 3000 });
  },
}));

vi.mock("@logtape/logtape", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../src/config.js", () => ({
  SERVER_NAME: "test-server",
  SERVER_VERSION: "1.0.0",
  LOG_LEVEL: "error",
  RATE_LIMIT_ENABLED: false,
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: 60000,
  TRANSPORT_MODE: "stdio",
  HTTP_PORT: 3000,
  HTTP_HOST: "localhost",
}));

describe("ActivityPubMCPServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should export default ActivityPubMCPServer class", async () => {
    const module = await import("../../src/mcp-server.js");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function"); // Class is a function
  });

  it("should create ActivityPubMCPServer instance", async () => {
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");
    const server = new ActivityPubMCPServer();
    expect(server).toBeDefined();
  });

  it("should have start method", async () => {
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");
    const server = new ActivityPubMCPServer();
    expect(typeof server.start).toBe("function");
  });

  it("should have stop method", async () => {
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");
    const server = new ActivityPubMCPServer();
    expect(typeof server.stop).toBe("function");
  });

  it("should call registerResources on construction", async () => {
    const { registerResources } = await import("../../src/mcp/index.js");
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");

    new ActivityPubMCPServer();

    expect(registerResources).toHaveBeenCalled();
  });

  it("should call registerTools on construction", async () => {
    const { registerTools } = await import("../../src/mcp/index.js");
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");

    new ActivityPubMCPServer();

    expect(registerTools).toHaveBeenCalled();
  });

  it("should call registerPrompts on construction", async () => {
    const { registerPrompts } = await import("../../src/mcp/index.js");
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");

    new ActivityPubMCPServer();

    expect(registerPrompts).toHaveBeenCalled();
  });

  it("should start without error", async () => {
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");
    const server = new ActivityPubMCPServer();

    await expect(server.start()).resolves.toBeUndefined();
  });

  it("should start with http transport", async () => {
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");
    const server = new ActivityPubMCPServer();

    await expect(server.start("http")).resolves.toBeUndefined();
  });

  it("should stop without error", async () => {
    const { default: ActivityPubMCPServer } = await import("../../src/mcp-server.js");
    const server = new ActivityPubMCPServer();

    await expect(server.stop()).resolves.toBeUndefined();
  });
});
