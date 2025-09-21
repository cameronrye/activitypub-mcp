import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test script for the ActivityPub MCP Server
 */
async function testMCPServer() {
  console.log("🧪 Testing ActivityPub MCP Server...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-test-client",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // Test 1: List available resources
    console.log("📋 Testing resources...");
    const resources = await client.listResources();
    console.log(
      "Available resources:",
      resources.resources.map((r) => r.name),
    );
    console.log();

    // Test 2: List available tools
    console.log("🔧 Testing tools...");
    const tools = await client.listTools();
    console.log(
      "Available tools:",
      tools.tools.map((t) => t.name),
    );
    console.log();

    // Test 3: List available prompts
    console.log("💬 Testing prompts...");
    const prompts = await client.listPrompts();
    console.log(
      "Available prompts:",
      prompts.prompts.map((p) => p.name),
    );
    console.log();

    // Test 4: Read server info resource
    console.log("ℹ️  Testing server info resource...");
    const serverInfo = await client.readResource({
      uri: "activitypub://server-info",
    });
    console.log(
      "Server info:",
      JSON.parse(serverInfo.contents[0].text || "{}"),
    );
    console.log();

    // Test 5: Test create-actor tool
    console.log("👤 Testing create-actor tool...");
    const createActorResult = await client.callTool({
      name: "create-actor",
      arguments: {
        identifier: "test-user",
        name: "Test User",
        summary: "A test user for MCP testing",
      },
    });
    console.log("Create actor result:", createActorResult.content[0]);
    console.log();

    // Test 6: Test actor resource
    console.log("🔍 Testing actor resource...");
    try {
      const actorResource = await client.readResource({
        uri: "activitypub://actor/test-user",
      });
      console.log(
        "Actor resource:",
        JSON.parse(actorResource.contents[0].text || "{}"),
      );
    } catch (error) {
      console.log(
        "Actor resource error (expected):",
        error instanceof Error ? error.message : error,
      );
    }
    console.log();

    // Test 7: Test compose-post prompt
    console.log("✍️  Testing compose-post prompt...");
    const composePrompt = await client.getPrompt({
      name: "compose-post",
      arguments: {
        topic: "ActivityPub MCP integration",
        tone: "professional",
      },
    });
    console.log("Compose prompt:", composePrompt.messages[0].content);
    console.log();

    console.log("🎉 All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await client.close();
  }
}

// Run the test
testMCPServer().catch(console.error);
