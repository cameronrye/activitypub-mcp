#!/usr/bin/env node

/**
 * Comprehensive test suite for ActivityPub MCP Server
 *
 * Tests all MCP resources, tools, and prompts with proper error handling
 * and validation scenarios.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class MCPTestSuite {
  private client: Client;
  private transport: StdioClientTransport;
  private results: TestResult[] = [];

  constructor() {
    this.transport = new StdioClientTransport({
      command: "tsx",
      args: ["./src/mcp-main.ts"],
    });

    this.client = new Client({
      name: "activitypub-mcp-test-client",
      version: "1.0.0",
    });
  }

  async setup(): Promise<void> {
    console.log("🔧 Setting up test environment...");
    await this.client.connect(this.transport);
    console.log("✅ Connected to MCP server");
  }

  async teardown(): Promise<void> {
    console.log("🧹 Cleaning up test environment...");
    await this.client.close();
    console.log("✅ Disconnected from MCP server");
  }

  private async runTest(
    name: string,
    testFn: () => Promise<void>,
  ): Promise<void> {
    const startTime = Date.now();
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, passed: true, duration });
      console.log(`✅ ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.results.push({ name, passed: false, error: errorMessage, duration });
      console.log(`❌ ${name} (${duration}ms): ${errorMessage}`);
    }
  }

  async testServerInfo(): Promise<void> {
    const result = await this.client.readResource({
      uri: "activitypub://server-info",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No server info returned");
    }

    const serverInfo = JSON.parse(result.contents[0].text);

    if (!serverInfo.name || !serverInfo.version || !serverInfo.baseUrl) {
      throw new Error("Invalid server info structure");
    }

    if (!Array.isArray(serverInfo.capabilities)) {
      throw new Error("Server capabilities should be an array");
    }

    console.log(`   Server: ${serverInfo.name} v${serverInfo.version}`);
    console.log(`   Base URL: ${serverInfo.baseUrl}`);
    console.log(`   Capabilities: ${serverInfo.capabilities.join(", ")}`);
  }

  async testActorResource(): Promise<void> {
    // Test valid actor
    const result = await this.client.readResource({
      uri: "activitypub://actor/testuser",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No actor data returned");
    }

    const actorData = JSON.parse(result.contents[0].text);

    if (!actorData.id || !actorData.type) {
      throw new Error("Invalid actor data structure");
    }

    console.log(`   Actor ID: ${actorData.id}`);
    console.log(`   Actor Type: ${actorData.type}`);
  }

  async testActorResourceInvalid(): Promise<void> {
    try {
      await this.client.readResource({
        uri: "activitypub://actor/invalid@user",
      });
      throw new Error("Should have failed with invalid actor identifier");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Invalid actor identifier")
      ) {
        // Expected error
        return;
      }
      throw error;
    }
  }

  async testTimelineResource(): Promise<void> {
    const result = await this.client.readResource({
      uri: "activitypub://timeline/testuser",
    });

    if (!result.contents || result.contents.length === 0) {
      throw new Error("No timeline data returned");
    }

    const timelineData = JSON.parse(result.contents[0].text);

    if (!timelineData.type || !timelineData.id) {
      throw new Error("Invalid timeline data structure");
    }

    if (timelineData.type !== "OrderedCollection") {
      throw new Error("Timeline should be an OrderedCollection");
    }

    console.log(`   Timeline ID: ${timelineData.id}`);
    console.log(`   Total Items: ${timelineData.totalItems}`);
  }

  async testCreateActorTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "create-actor",
      arguments: {
        identifier: "testactor",
        name: "Test Actor",
        summary: "A test actor for the test suite",
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from create-actor tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    const responseText = result.content[0].text;
    if (!responseText.includes("Successfully created actor")) {
      throw new Error("Unexpected response from create-actor tool");
    }

    console.log(`   Response: ${responseText.split("\n")[0]}`);
  }

  async testCreateActorToolInvalid(): Promise<void> {
    const result = await this.client.callTool({
      name: "create-actor",
      arguments: {
        identifier: "", // Invalid empty identifier
        name: "Test Actor",
      },
    });

    if (!result.isError) {
      throw new Error("Should have failed with empty identifier");
    }

    console.log(`   Expected error: ${result.content[0].text}`);
  }

  async testCreatePostTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "create-post",
      arguments: {
        actor: "testactor",
        content: "Hello, Fediverse! This is a test post.",
        to: ["https://www.w3.org/ns/activitystreams#Public"],
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from create-post tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    const responseText = result.content[0].text;
    if (!responseText.includes("Successfully created post")) {
      throw new Error("Unexpected response from create-post tool");
    }

    console.log(`   Response: ${responseText.split("\n")[0]}`);
  }

  async testFollowActorTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "follow-actor",
      arguments: {
        follower: "testactor",
        target: "https://mastodon.social/users/example",
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from follow-actor tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    console.log(`   Response: ${result.content[0].text}`);
  }

  async testLikePostTool(): Promise<void> {
    const result = await this.client.callTool({
      name: "like-post",
      arguments: {
        actor: "testactor",
        postUri: "https://example.com/posts/123",
      },
    });

    if (!result.content || result.content.length === 0) {
      throw new Error("No response from like-post tool");
    }

    if (result.isError) {
      throw new Error(`Tool returned error: ${result.content[0].text}`);
    }

    console.log(`   Response: ${result.content[0].text}`);
  }

  async testComposePostPrompt(): Promise<void> {
    const result = await this.client.getPrompt({
      name: "compose-post",
      arguments: {
        topic: "open source software",
        tone: "professional",
        maxLength: "280",
      },
    });

    if (!result.messages || result.messages.length === 0) {
      throw new Error("No prompt messages returned");
    }

    const message = result.messages[0];
    if (message.role !== "user" || !message.content) {
      throw new Error("Invalid prompt message structure");
    }

    console.log("   Prompt generated for topic: open source software");
  }

  async testActorIntroductionPrompt(): Promise<void> {
    const result = await this.client.getPrompt({
      name: "actor-introduction",
      arguments: {
        actorName: "Alice",
        interests: "programming, decentralization, privacy",
        background: "Full-stack developer with 5 years experience",
      },
    });

    if (!result.messages || result.messages.length === 0) {
      throw new Error("No prompt messages returned");
    }

    console.log("   Introduction prompt generated for Alice");
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Running comprehensive ActivityPub MCP Server tests...\n");

    await this.setup();

    // Resource tests
    console.log("📚 Testing Resources:");
    await this.runTest("Server Info Resource", () => this.testServerInfo());
    await this.runTest("Actor Resource (Valid)", () =>
      this.testActorResource(),
    );
    await this.runTest("Actor Resource (Invalid)", () =>
      this.testActorResourceInvalid(),
    );
    await this.runTest("Timeline Resource", () => this.testTimelineResource());

    // Tool tests
    console.log("\n🔧 Testing Tools:");
    await this.runTest("Create Actor Tool (Valid)", () =>
      this.testCreateActorTool(),
    );
    await this.runTest("Create Actor Tool (Invalid)", () =>
      this.testCreateActorToolInvalid(),
    );
    await this.runTest("Create Post Tool", () => this.testCreatePostTool());
    await this.runTest("Follow Actor Tool", () => this.testFollowActorTool());
    await this.runTest("Like Post Tool", () => this.testLikePostTool());

    // Prompt tests
    console.log("\n💬 Testing Prompts:");
    await this.runTest("Compose Post Prompt", () =>
      this.testComposePostPrompt(),
    );
    await this.runTest("Actor Introduction Prompt", () =>
      this.testActorIntroductionPrompt(),
    );

    await this.teardown();

    // Print summary
    this.printSummary();
  }

  private printSummary(): void {
    console.log("\n📊 Test Summary:");
    console.log("================");

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total tests: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total time: ${totalTime}ms`);
    console.log(
      `Success rate: ${((passed / this.results.length) * 100).toFixed(1)}%`,
    );

    if (failed > 0) {
      console.log("\n❌ Failed tests:");
      for (const result of this.results.filter((r) => !r.passed)) {
        console.log(`  - ${result.name}: ${result.error}`);
      }
    }

    console.log(
      failed === 0 ? "\n🎉 All tests passed!" : `\n⚠️  ${failed} test(s) failed`,
    );
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new MCPTestSuite();
  testSuite.runAllTests().catch((error) => {
    console.error("❌ Test suite failed:", error);
    process.exit(1);
  });
}

export default MCPTestSuite;
