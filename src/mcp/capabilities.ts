/**
 * Lightweight registry that records the names of MCP tools, resources,
 * and prompts as they are registered. Consumed by the `server-info`
 * resource to advertise capabilities without drift.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

class CapabilitiesRegistry {
  private readonly tools = new Set<string>();
  private readonly resources = new Set<string>();
  private readonly prompts = new Set<string>();

  addTool(name: string): void {
    this.tools.add(name);
  }

  addResource(name: string): void {
    this.resources.add(name);
  }

  addPrompt(name: string): void {
    this.prompts.add(name);
  }

  list(): { tools: string[]; resources: string[]; prompts: string[] } {
    return {
      tools: [...this.tools].sort(),
      resources: [...this.resources].sort(),
      prompts: [...this.prompts].sort(),
    };
  }

  /** For testing: clear the registry between test cases. */
  reset(): void {
    this.tools.clear();
    this.resources.clear();
    this.prompts.clear();
  }
}

export const capabilitiesRegistry = new CapabilitiesRegistry();

/**
 * Wrap an McpServer so that every registerTool / registerResource /
 * registerPrompt call also records the name into the capabilities registry.
 * Used by the orchestrators in tools.ts, tools-write.ts,
 * resources.ts, prompts.ts to keep the server-info advertised capabilities honest.
 *
 * The wrapper mutates the methods in-place so callers don't need to switch to
 * the returned instance. Calling this function more than once on the same server
 * is safe: the second call rebinds to an already-wrapped method, and the Set
 * deduplicates any repeated names.
 */
export function trackedMcpServer(mcpServer: McpServer): McpServer {
  if (mcpServer.registerTool) {
    // biome-ignore lint/suspicious/noExplicitAny: needed to wrap an overloaded SDK method
    const original = mcpServer.registerTool.bind(mcpServer) as (...args: any[]) => any;
    mcpServer.registerTool = ((
      name: string,
      ...rest: Parameters<typeof mcpServer.registerTool> extends [string, ...infer R] ? R : never
    ) => {
      capabilitiesRegistry.addTool(name);
      // biome-ignore lint/suspicious/noExplicitAny: forwarding to the original overloaded method
      return original(name, ...(rest as any[]));
    }) as typeof mcpServer.registerTool;
  }

  if (mcpServer.registerResource) {
    // biome-ignore lint/suspicious/noExplicitAny: needed to wrap an overloaded SDK method
    const original = mcpServer.registerResource.bind(mcpServer) as (...args: any[]) => any;
    mcpServer.registerResource = ((
      name: string,
      ...rest: Parameters<typeof mcpServer.registerResource> extends [string, ...infer R]
        ? R
        : never
    ) => {
      capabilitiesRegistry.addResource(name);
      // biome-ignore lint/suspicious/noExplicitAny: forwarding to the original overloaded method
      return original(name, ...(rest as any[]));
    }) as typeof mcpServer.registerResource;
  }

  if (mcpServer.registerPrompt) {
    // biome-ignore lint/suspicious/noExplicitAny: needed to wrap an overloaded SDK method
    const original = mcpServer.registerPrompt.bind(mcpServer) as (...args: any[]) => any;
    mcpServer.registerPrompt = ((
      name: string,
      ...rest: Parameters<typeof mcpServer.registerPrompt> extends [string, ...infer R] ? R : never
    ) => {
      capabilitiesRegistry.addPrompt(name);
      // biome-ignore lint/suspicious/noExplicitAny: forwarding to the original overloaded method
      return original(name, ...(rest as any[]));
    }) as typeof mcpServer.registerPrompt;
  }

  return mcpServer;
}
