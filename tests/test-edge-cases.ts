import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test script for edge cases and boundary conditions in ActivityPub MCP Server
 * This test file focuses on testing edge cases to increase code coverage
 */
async function testEdgeCases() {
  console.log("🔍 Testing ActivityPub MCP Server Edge Cases...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-edge-test-client",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // Test edge cases for actor identifiers
    console.log("👤 Testing actor identifier edge cases...");

    // Test 1: Single character identifier
    console.log("Test 1: Single character identifier");
    try {
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "a",
          name: "Single Char User",
          summary: "A user with single character identifier",
        },
      });
      console.log("✅ Created actor with single character identifier");
    } catch (error) {
      console.log("❌ Failed with single character identifier:", error);
    }

    // Test 2: Very long identifier (boundary testing)
    console.log("Test 2: Very long identifier");
    try {
      const longIdentifier = "a".repeat(100);
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: longIdentifier,
          name: "Long Identifier User",
          summary: "A user with very long identifier",
        },
      });
      console.log("✅ Created actor with very long identifier");
    } catch (error) {
      console.log("❌ Failed with very long identifier:", error);
    }

    // Test 3: Identifier with numbers only
    console.log("Test 3: Numeric-only identifier");
    try {
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "123456789",
          name: "Numeric User",
          summary: "A user with numeric-only identifier",
        },
      });
      console.log("✅ Created actor with numeric-only identifier");
    } catch (error) {
      console.log("❌ Failed with numeric-only identifier:", error);
    }

    // Test edge cases for content
    console.log("\n📝 Testing content edge cases...");

    // Test 4: Very long content
    console.log("Test 4: Very long content");
    try {
      const longContent =
        "This is a very long post content that tests the system's ability to handle extended text. ".repeat(
          50,
        );
      const result = await client.callTool({
        name: "create-post",
        arguments: {
          actor: "a",
          content: longContent,
        },
      });
      console.log("✅ Created post with very long content");
    } catch (error) {
      console.log("❌ Failed with very long content:", error);
    }

    // Test 5: Content with only whitespace
    console.log("Test 5: Whitespace-only content");
    try {
      const result = await client.callTool({
        name: "create-post",
        arguments: {
          actor: "a",
          content: "   \n\t   \n   ",
        },
      });
      console.log("✅ Created post with whitespace-only content");
    } catch (error) {
      console.log("❌ Failed with whitespace-only content:", error);
    }

    // Test 6: Content with special characters and unicode
    console.log("Test 6: Unicode and special characters content");
    try {
      const unicodeContent =
        "Testing unicode: 🌍🚀💻 Chinese: 你好世界 Arabic: مرحبا بالعالم Russian: Привет мир Japanese: こんにちは世界";
      const result = await client.callTool({
        name: "create-post",
        arguments: {
          actor: "123456789",
          content: unicodeContent,
        },
      });
      console.log("✅ Created post with unicode content");
    } catch (error) {
      console.log("❌ Failed with unicode content:", error);
    }

    // Test edge cases for URLs
    console.log("\n🔗 Testing URL edge cases...");

    // Test 7: Very long URL
    console.log("Test 7: Very long URL");
    try {
      const longUrl = `https://example.com/${"a".repeat(500)}`;
      const result = await client.callTool({
        name: "follow-actor",
        arguments: {
          follower: "a",
          target: longUrl,
        },
      });
      console.log("✅ Followed actor with very long URL");
    } catch (error) {
      console.log("❌ Failed with very long URL:", error);
    }

    // Test 8: URL with special characters
    console.log("Test 8: URL with special characters");
    try {
      const specialUrl =
        "https://example.com/users/test-user_123.json?param=value&other=test";
      const result = await client.callTool({
        name: "follow-actor",
        arguments: {
          follower: "123456789",
          target: specialUrl,
        },
      });
      console.log("✅ Followed actor with special character URL");
    } catch (error) {
      console.log("❌ Failed with special character URL:", error);
    }

    // Test 9: URL with unicode characters
    console.log("Test 9: URL with unicode characters");
    try {
      const unicodeUrl = "https://example.com/users/José-María";
      const result = await client.callTool({
        name: "like-post",
        arguments: {
          actor: "a",
          postUri: unicodeUrl,
        },
      });
      console.log("✅ Liked post with unicode URL");
    } catch (error) {
      console.log("❌ Failed with unicode URL:", error);
    }

    // Test edge cases for resources
    console.log("\n📚 Testing resource edge cases...");

    // Test 10: Resource with very long actor identifier
    console.log("Test 10: Resource with very long actor identifier");
    try {
      const longIdentifier = "a".repeat(100);
      const result = await client.readResource({
        uri: `activitypub://actor/${longIdentifier}`,
      });
      console.log("✅ Read resource with very long actor identifier");
    } catch (error) {
      console.log(
        "❌ Failed to read resource with very long identifier:",
        error,
      );
    }

    // Test 11: Timeline resource with special characters
    console.log("Test 11: Timeline resource with special characters");
    try {
      const result = await client.readResource({
        uri: "activitypub://timeline/test-user_123",
      });
      console.log("✅ Read timeline resource with special characters");
    } catch (error) {
      console.log("❌ Failed to read timeline with special characters:", error);
    }

    // Test edge cases for prompts
    console.log("\n💭 Testing prompt edge cases...");

    // Test 12: Prompt with very long topic
    console.log("Test 12: Prompt with very long topic");
    try {
      const longTopic =
        "This is a very long topic that tests how the prompt system handles extended input text. ".repeat(
          20,
        );
      const result = await client.getPrompt({
        name: "compose-post",
        arguments: {
          topic: longTopic,
          tone: "professional",
        },
      });
      console.log("✅ Generated prompt with very long topic");
    } catch (error) {
      console.log("❌ Failed with very long topic:", error);
    }

    // Test 13: Actor introduction with minimal data
    console.log("Test 13: Actor introduction with minimal data");
    try {
      const result = await client.getPrompt({
        name: "actor-introduction",
        arguments: {
          actorName: "A",
          interests: "B",
          background: "C",
        },
      });
      console.log("✅ Generated introduction with minimal data");
    } catch (error) {
      console.log("❌ Failed with minimal data:", error);
    }

    // Test 14: Actor introduction with very long data
    console.log("Test 14: Actor introduction with very long data");
    try {
      const longInterests = "Interest ".repeat(100);
      const longBackground = "Background information ".repeat(50);
      const result = await client.getPrompt({
        name: "actor-introduction",
        arguments: {
          actorName: "Very Long Name User With Extended Information",
          interests: longInterests,
          background: longBackground,
        },
      });
      console.log("✅ Generated introduction with very long data");
    } catch (error) {
      console.log("❌ Failed with very long data:", error);
    }

    // Test boundary conditions
    console.log("\n🎯 Testing boundary conditions...");

    // Test 15: Multiple rapid requests
    console.log("Test 15: Multiple rapid requests");
    try {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          client.callTool({
            name: "create-actor",
            arguments: {
              identifier: `rapid-${i}`,
              name: `Rapid User ${i}`,
              summary: `Rapid test user ${i}`,
            },
          }),
        );
      }
      await Promise.all(promises);
      console.log("✅ Handled multiple rapid requests");
    } catch (error) {
      console.log("❌ Failed with multiple rapid requests:", error);
    }

    console.log("\n🎉 Edge case tests completed!");
  } catch (error) {
    console.error("❌ Edge case test failed:", error);
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
testEdgeCases().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
