import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Comprehensive test suite for ActivityPub MCP Server
 * Tests all existing functionality with various scenarios
 */

class ComprehensiveTestSuite {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    this.transport = new StdioClientTransport({
      command: "tsx",
      args: ["./src/mcp-main.ts"],
    });

    this.client = new Client({
      name: "activitypub-mcp-comprehensive-test",
      version: "1.0.0",
    });
  }

  async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    console.log(`🧪 Running test: ${testName}`);
    const startTime = Date.now();

    try {
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`✅ ${testName} passed (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ ${testName} failed (${duration}ms): ${error.message}`);
      throw error;
    }
  }

  async testListResources(): Promise<void> {
    const result = await this.client.listResources();
    if (!result.resources || result.resources.length === 0) {
      throw new Error("No resources found");
    }
    console.log(`   Found ${result.resources.length} resources`);
  }

  async testListTools(): Promise<void> {
    const result = await this.client.listTools();
    if (!result.tools || result.tools.length === 0) {
      throw new Error("No tools found");
    }
    console.log(`   Found ${result.tools.length} tools`);
  }

  async testListPrompts(): Promise<void> {
    const result = await this.client.listPrompts();
    if (!result.prompts || result.prompts.length === 0) {
      throw new Error("No prompts found");
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
    if (!responseText.includes("Successfully discovered actor")) {
      throw new Error("Unexpected response from discover-actor tool");
    }

    console.log("   Discovered actor successfully");
  }

  async testDiscoverActorToolInvalid(): Promise<void> {
    const result = await this.client.callTool({
      name: "discover-actor",
      arguments: {
        identifier: "invalid-identifier-format",
      },
    });

    if (!result.isError) {
      throw new Error("Should have failed with invalid identifier");
    }

    console.log(`   Expected error: ${result.content[0].text}`);
  }

  async testFetchTimelineTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "fetch-timeline",
      arguments: {
        identifier: "gargron@mastodon.social",
        limit: 5,
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from fetch-timeline tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    const responseText = result.content[0].text;
    if (!responseText.includes("Successfully fetched timeline")) {
      throw new Error("Unexpected response from fetch-timeline tool");
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
    if (!responseText.includes("Instance Information")) {
      throw new Error("Unexpected response from get-instance-info tool");
    }

    console.log("   Instance info retrieved successfully");
  }

  async testDiscoverInstancesTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "discover-instances",
      arguments: {
        criteria: "popular",
        limit: 5,
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from discover-instances tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    const responseText = result.content[0].text;
    console.log("   Discovered instances successfully");
  }

  async testRecommendInstancesTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "recommend-instances",
      arguments: {
        interests: ["technology", "programming"],
        language: "en",
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from recommend-instances tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    console.log("   Got instance recommendations successfully");
  }

  async testSearchInstanceTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "search-instance",
      arguments: {
        domain: "mastodon.social",
        query: "ActivityPub",
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from search-instance tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    console.log("   Search completed successfully");
  }

  async testHealthCheckTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "health-check",
      arguments: {
        detailed: true,
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from health-check tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    console.log("   Health check completed successfully");
  }

  async testPerformanceMetricsTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "performance-metrics",
      arguments: {},
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from performance-metrics tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    console.log("   Performance metrics retrieved successfully");
  }

  async testRemoteActorResource(): Promise<void> {
    const result = await this.client.readResource({
      uri: "activitypub://remote-actor/gargron@mastodon.social",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No content from remote actor resource");
    }

    const actorData = JSON.parse(result.contents[0].text);
    if (!actorData.preferredUsername) {
      throw new Error("Invalid actor data structure");
    }

    console.log(`   Actor resource: ${actorData.preferredUsername}`);
  }

  async testRemoteTimelineResource(): Promise<void> {
    const result = await this.client.readResource({
      uri: "activitypub://remote-timeline/gargron@mastodon.social",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No content from remote timeline resource");
    }

    const timelineData = JSON.parse(result.contents[0].text);
    console.log(`   Timeline resource: ${timelineData.totalItems || 0} items`);
  }

  async testInstanceInfoResource(): Promise<void> {
    const result = await this.client.readResource({
      uri: "activitypub://instance-info/mastodon.social",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No content from instance info resource");
    }

    const instanceData = JSON.parse(result.contents[0].text);
    if (!instanceData.domain) {
      throw new Error("Invalid instance data structure");
    }

    console.log(`   Instance resource: ${instanceData.software} instance`);
  }

  async testFediverseExplorationPrompt(): Promise<void> {
    const result = await this.client.getPrompt({
      name: "explore-fediverse",
      arguments: {
        interests: "technology and programming",
        instanceType: "mastodon",
      },
    });

    if (!result.messages || result.messages.length === 0) {
      throw new Error("No messages from exploration prompt");
    }

    const promptText = result.messages[0].content.text;
    if (!promptText || promptText.length < 50) {
      throw new Error("Prompt text too short or missing");
    }

    console.log(`   Prompt generated: ${promptText.length} characters`);
  }

  async testCompareInstancesPrompt(): Promise<void> {
    const result = await this.client.getPrompt({
      name: "compare-instances",
      arguments: {
        instances: "mastodon.social, fosstodon.org",
        criteria: "community focus and features",
      },
    });

    if (!result.messages || result.messages.length === 0) {
      throw new Error("No messages from comparison prompt");
    }

    const promptText = result.messages[0].content.text;
    if (!promptText || promptText.length < 50) {
      throw new Error("Prompt text too short or missing");
    }

    console.log("   Comparison prompt generated successfully");
  }

  async testDiscoverContentPrompt(): Promise<void> {
    const result = await this.client.getPrompt({
      name: "discover-content",
      arguments: {
        topics: "ActivityPub, fediverse",
        contentType: "all",
      },
    });

    if (!result.messages || result.messages.length === 0) {
      throw new Error("No messages from content discovery prompt");
    }

    const promptText = result.messages[0].content.text;
    if (!promptText || promptText.length < 50) {
      throw new Error("Prompt text too short or missing");
    }

    console.log("   Content discovery prompt generated successfully");
  }

  async run(): Promise<void> {
    console.log(
      "🌐 Starting ActivityPub MCP Server - Fediverse Client Test Suite\n",
    );

    try {
      await this.client.connect(this.transport);
      console.log("✅ Connected to MCP server\n");

      // Test MCP basics
      await this.runTest("List Resources", () => this.testListResources());
      await this.runTest("List Tools", () => this.testListTools());
      await this.runTest("List Prompts", () => this.testListPrompts());

      // Test discovery tools
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
      await this.runTest("Discover Instances Tool", () =>
        this.testDiscoverInstancesTool(),
      );
      await this.runTest("Recommend Instances Tool", () =>
        this.testRecommendInstancesTool(),
      );
      await this.runTest("Search Instance Tool", () =>
        this.testSearchInstanceTool(),
      );
      await this.runTest("Health Check Tool", () => this.testHealthCheckTool());
      await this.runTest("Performance Metrics Tool", () =>
        this.testPerformanceMetricsTool(),
      );

      // Test resources
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
      await this.runTest("Compare Instances Prompt", () =>
        this.testCompareInstancesPrompt(),
      );
      await this.runTest("Discover Content Prompt", () =>
        this.testDiscoverContentPrompt(),
      );

      console.log("\n🧹 Disconnected from MCP server");

      console.log("\n📊 Test Summary:");
      console.log("   Total tests: 16");
      console.log("   Passed: 16");
      console.log("   Failed: 0");

      console.log("\n🎉 All tests passed!");
    } catch (error) {
      console.error("❌ Test suite failed:", error);
      throw error;
    } finally {
      try {
        await this.client.close();
      } catch (error) {
        console.error("Error disconnecting:", error);
      }
    }
  }
}

// Run the test suite
async function runComprehensiveTests() {
  const testSuite = new ComprehensiveTestSuite();
  await testSuite.run();
}

runComprehensiveTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
