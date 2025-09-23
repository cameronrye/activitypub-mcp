#!/usr/bin/env node

/**
 * Comprehensive test suite for ActivityPub MCP Server - Fediverse Client Mode
 *
 * Tests all MCP resources, tools, and prompts for the client-based architecture
 * with proper error handling and validation scenarios.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class FediverseClientTestSuite {
  private client: Client;
  private transport: StdioClientTransport;
  private results: TestResult[] = [];

  constructor() {
    this.transport = new StdioClientTransport({
      command: "tsx",
      args: ["./src/mcp-main.ts"],
    });

    this.client = new Client({
      name: "activitypub-mcp-client-test-suite",
      version: "1.0.0",
    });
  }

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`🧪 Running test: ${name}`);

    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, passed: true, duration });
      console.log(`✅ ${name} passed (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.results.push({ name, passed: false, error: errorMessage, duration });
      console.log(`❌ ${name} failed: ${errorMessage} (${duration}ms)`);
    }
    console.log();
  }

  async testListResources(): Promise<void> {
    const result = await this.client.listResources();

    if (!result.resources || result.resources.length === 0) {
      throw new Error("No resources returned");
    }

    const expectedResources = [
      "remote-actor",
      "remote-timeline",
      "instance-info",
    ];
    for (const expectedResource of expectedResources) {
      const found = result.resources.some((r) => r.name === expectedResource);
      if (!found) {
        throw new Error(`Expected resource '${expectedResource}' not found`);
      }
    }

    console.log(`   Found ${result.resources.length} resources`);
  }

  async testListTools(): Promise<void> {
    const result = await this.client.listTools();

    if (!result.tools || result.tools.length === 0) {
      throw new Error("No tools returned");
    }

    const expectedTools = [
      "discover-actor",
      "fetch-timeline",
      "search-instance",
      "get-instance-info",
      "discover-instances",
      "recommend-instances",
    ];

    for (const expectedTool of expectedTools) {
      const found = result.tools.some((t) => t.name === expectedTool);
      if (!found) {
        throw new Error(`Expected tool '${expectedTool}' not found`);
      }
    }

    console.log(`   Found ${result.tools.length} tools`);
  }

  async testListPrompts(): Promise<void> {
    const result = await this.client.listPrompts();

    if (!result.prompts || result.prompts.length === 0) {
      throw new Error("No prompts returned");
    }

    const expectedPrompts = [
      "explore-fediverse",
      "compare-instances",
      "discover-content",
    ];
    for (const expectedPrompt of expectedPrompts) {
      const found = result.prompts.some((p) => p.name === expectedPrompt);
      if (!found) {
        throw new Error(`Expected prompt '${expectedPrompt}' not found`);
      }
    }

    console.log(`   Found ${result.prompts.length} prompts`);
  }

  async testDiscoverActorTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "discover-actor",
      arguments: {
        identifier: "gargron@mastodon.social",
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from discover-actor tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    const responseText = result.content[0].text;

    // Check for expected content in the formatted response
    if (
      !responseText.includes("Successfully discovered actor") ||
      !responseText.includes("🆔 ID:") ||
      !responseText.includes("👤 Name:")
    ) {
      throw new Error("Invalid actor response format");
    }

    console.log("   Discovered actor successfully");
  }

  async testDiscoverActorToolInvalid(): Promise<void> {
    try {
      const result = await this.client.callTool({
        name: "discover-actor",
        arguments: {
          identifier: "invalid-identifier-format",
        },
      });

      if (!result.isError) {
        throw new Error("Expected error for invalid identifier");
      }

      console.log(`   Expected error: ${result.content[0].text}`);
    } catch (error) {
      // This is expected - the MCP server should reject invalid identifiers
      // Check if it's the expected validation error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("Invalid identifier format") ||
        errorMessage.includes("Invalid arguments for tool discover-actor")
      ) {
        console.log(
          `   Expected validation error caught: ${errorMessage.split("\n")[0]}`,
        );
        return; // Test passes
      }
      // If it's a different error, re-throw it
      throw error;
    }
  }

  async testFetchTimelineTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "fetch-timeline",
      arguments: {
        identifier: "gargron@mastodon.social",
        limit: 3,
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from fetch-timeline tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    const responseText = result.content[0].text;

    // Check for expected content in the formatted response
    if (
      !responseText.includes("Successfully fetched timeline") ||
      !responseText.includes("📝 Posts retrieved:")
    ) {
      throw new Error("Invalid timeline response format");
    }

    console.log("   Fetched timeline successfully");
  }

  async testGetInstanceInfoTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "get-instance-info",
      arguments: {
        domain: "mastodon.social",
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from get-instance-info tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    const responseText = result.content[0].text;

    // Check for expected content in the formatted response
    if (
      !responseText.includes("Instance Information for") ||
      !responseText.includes("🌐 Domain:")
    ) {
      throw new Error("Invalid instance response format");
    }

    console.log("   Instance info retrieved successfully");
  }

  async testRemoteActorResource(): Promise<void> {
    const result = await this.client.readResource({
      uri: "activitypub://remote-actor/gargron@mastodon.social",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No content from remote-actor resource");
    }

    const actorData = JSON.parse(result.contents[0].text || "{}");

    if (!actorData.id || !actorData.type) {
      throw new Error("Invalid actor resource data");
    }

    console.log(
      `   Actor resource: ${actorData.preferredUsername || actorData.name}`,
    );
  }

  async testRemoteTimelineResource(): Promise<void> {
    const result = await this.client.readResource({
      uri: "activitypub://remote-timeline/gargron@mastodon.social",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No content from remote-timeline resource");
    }

    const timelineData = JSON.parse(result.contents[0].text || "{}");

    if (!timelineData.type || !Array.isArray(timelineData.orderedItems)) {
      throw new Error("Invalid timeline resource data");
    }

    console.log(
      `   Timeline resource: ${timelineData.orderedItems.length} items`,
    );
  }

  async testInstanceInfoResource(): Promise<void> {
    const result = await this.client.readResource({
      uri: "activitypub://instance-info/mastodon.social",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No content from instance-info resource");
    }

    const instanceData = JSON.parse(result.contents[0].text || "{}");

    if (!instanceData.title || !instanceData.uri) {
      throw new Error("Invalid instance resource data");
    }

    console.log(`   Instance resource: ${instanceData.title}`);
  }

  async testFediverseExplorationPrompt(): Promise<void> {
    const result = await this.client.getPrompt({
      name: "explore-fediverse",
      arguments: {
        interests: "open source software",
        experience: "beginner",
      },
    });

    if (!result.messages || result.messages.length === 0) {
      throw new Error("No messages from explore-fediverse prompt");
    }

    const message = result.messages[0];
    if (!message.content || typeof message.content.text !== "string") {
      throw new Error("Invalid prompt message structure");
    }

    console.log(
      `   Prompt generated: ${message.content.text.length} characters`,
    );
  }

  async run(): Promise<void> {
    console.log(
      "🌐 Starting ActivityPub MCP Server - Fediverse Client Test Suite\n",
    );

    try {
      await this.client.connect(this.transport);
      console.log("✅ Connected to MCP server\n");

      // Test MCP protocol basics
      await this.runTest("List Resources", () => this.testListResources());
      await this.runTest("List Tools", () => this.testListTools());
      await this.runTest("List Prompts", () => this.testListPrompts());

      // Test fediverse client tools
      await this.runTest("Discover Actor Tool", () =>
        this.testDiscoverActorTool(),
      );
      await this.runTest("Discover Actor Tool (Invalid)", () =>
        this.testDiscoverActorToolInvalid(),
      );
      await this.runTest("Fetch Timeline Tool", () =>
        this.testFetchTimelineTool(),
      );
      await this.runTest("Get Instance Info Tool", () =>
        this.testGetInstanceInfoTool(),
      );

      // Test MCP resources
      await this.runTest("Remote Actor Resource", () =>
        this.testRemoteActorResource(),
      );
      await this.runTest("Remote Timeline Resource", () =>
        this.testRemoteTimelineResource(),
      );
      await this.runTest("Instance Info Resource", () =>
        this.testInstanceInfoResource(),
      );

      // Test prompts
      await this.runTest("Fediverse Exploration Prompt", () =>
        this.testFediverseExplorationPrompt(),
      );
    } catch (error) {
      console.error("❌ Failed to connect to MCP server:", error);
      process.exit(1);
    } finally {
      try {
        await this.client.close();
        console.log("🧹 Disconnected from MCP server\n");
      } catch (error) {
        console.error("Error disconnecting:", error);
      }
    }

    this.printSummary();
  }

  private printSummary(): void {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log("📊 Test Summary:");
    console.log(`   Total tests: ${this.results.length}`);
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log();

    if (failed > 0) {
      console.log("❌ Failed tests:");
      const failedTests = this.results.filter((r) => !r.passed);
      for (const r of failedTests) {
        console.log(`   - ${r.name}: ${r.error}`);
      }
      console.log();
      process.exit(1);
    } else {
      console.log("🎉 All tests passed!");
    }
  }
}

// Run the test suite
const testSuite = new FediverseClientTestSuite();
testSuite.run().catch((error) => {
  console.error("❌ Test suite failed:", error);
  process.exit(1);
});
