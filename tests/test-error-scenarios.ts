import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test script for error scenarios and edge cases in ActivityPub MCP Server
 * This test file focuses on increasing code coverage by testing error paths
 */
async function testErrorScenarios() {
  console.log("🧪 Testing ActivityPub MCP Server Error Scenarios...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-error-test-client",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // Test error scenarios for create-actor tool
    console.log("🔧 Testing create-actor error scenarios...");

    // Test 1: Empty identifier
    try {
      await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "",
          name: "Test User",
          summary: "A test user",
        },
      });
      console.log("❌ Expected error for empty identifier");
    } catch (error) {
      console.log("✅ Correctly caught empty identifier error");
    }

    // Test 2: Missing required fields
    try {
      await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "test-user",
          // Missing name and summary
        },
      });
      console.log("❌ Expected error for missing fields");
    } catch (error) {
      console.log("✅ Correctly caught missing fields error");
    }

    // Test 3: Invalid identifier format
    try {
      await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "invalid@identifier!",
          name: "Test User",
          summary: "A test user",
        },
      });
      console.log("❌ Expected error for invalid identifier");
    } catch (error) {
      console.log("✅ Correctly caught invalid identifier error");
    }

    // Test error scenarios for create-post tool
    console.log("\n📝 Testing create-post error scenarios...");

    // Test 4: Empty actor
    try {
      await client.callTool({
        name: "create-post",
        arguments: {
          actor: "",
          content: "Test content",
        },
      });
      console.log("❌ Expected error for empty actor");
    } catch (error) {
      console.log("✅ Correctly caught empty actor error");
    }

    // Test 5: Empty content
    try {
      await client.callTool({
        name: "create-post",
        arguments: {
          actor: "test-actor",
          content: "",
        },
      });
      console.log("❌ Expected error for empty content");
    } catch (error) {
      console.log("✅ Correctly caught empty content error");
    }

    // Test error scenarios for follow-actor tool
    console.log("\n🤝 Testing follow-actor error scenarios...");

    // Test 6: Invalid target URL
    try {
      await client.callTool({
        name: "follow-actor",
        arguments: {
          actor: "test-actor",
          target: "not-a-valid-url",
        },
      });
      console.log("❌ Expected error for invalid URL");
    } catch (error) {
      console.log("✅ Correctly caught invalid URL error");
    }

    // Test 7: Empty actor for follow
    try {
      await client.callTool({
        name: "follow-actor",
        arguments: {
          actor: "",
          target: "https://mastodon.social/users/example",
        },
      });
      console.log("❌ Expected error for empty actor");
    } catch (error) {
      console.log("✅ Correctly caught empty actor error");
    }

    // Test error scenarios for like-post tool
    console.log("\n❤️ Testing like-post error scenarios...");

    // Test 8: Invalid post URL
    try {
      await client.callTool({
        name: "like-post",
        arguments: {
          actor: "test-actor",
          postUrl: "invalid-url",
        },
      });
      console.log("❌ Expected error for invalid post URL");
    } catch (error) {
      console.log("✅ Correctly caught invalid post URL error");
    }

    // Test 9: Empty actor for like
    try {
      await client.callTool({
        name: "like-post",
        arguments: {
          actor: "",
          postUrl: "https://example.com/posts/123",
        },
      });
      console.log("❌ Expected error for empty actor");
    } catch (error) {
      console.log("✅ Correctly caught empty actor error");
    }

    // Test resource error scenarios
    console.log("\n📚 Testing resource error scenarios...");

    // Test 10: Invalid actor resource
    try {
      await client.readResource({
        uri: "activitypub://actor/invalid-actor-with-special-chars@#$",
      });
      console.log("❌ Expected error for invalid actor resource");
    } catch (error) {
      console.log("✅ Correctly caught invalid actor resource error");
    }

    // Test 11: Malformed timeline resource
    try {
      await client.readResource({
        uri: "activitypub://timeline/",
      });
      console.log("❌ Expected error for malformed timeline resource");
    } catch (error) {
      console.log("✅ Correctly caught malformed timeline resource error");
    }

    // Test prompt error scenarios
    console.log("\n💭 Testing prompt error scenarios...");

    // Test 12: Empty topic for compose-post prompt
    try {
      await client.getPrompt({
        name: "compose-post",
        arguments: {
          topic: "",
        },
      });
      console.log("❌ Expected error for empty topic");
    } catch (error) {
      console.log("✅ Correctly caught empty topic error");
    }

    // Test 13: Missing arguments for actor-introduction prompt
    try {
      await client.getPrompt({
        name: "actor-introduction",
        arguments: {},
      });
      console.log("❌ Expected error for missing arguments");
    } catch (error) {
      console.log("✅ Correctly caught missing arguments error");
    }

    console.log("\n🎉 Error scenario tests completed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    try {
      await client.close();
      console.log("🧹 Disconnected from MCP server");
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
  }
}

// Run the tests
testErrorScenarios().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
