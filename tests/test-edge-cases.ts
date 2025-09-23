import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test script for edge cases and boundary conditions in ActivityPub MCP Server
 * This test file focuses on testing edge cases for existing functionality
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

    // Test edge cases for discover-actor tool
    console.log("👤 Testing discover-actor edge cases...");

    // Test 1: Invalid actor identifier format
    console.log("Test 1: Invalid actor identifier format");
    try {
      const result = await client.callTool({
        name: "discover-actor",
        arguments: {
          identifier: "invalid-format",
        },
      });
      console.log("❌ Expected error for invalid identifier format");
    } catch (error) {
      console.log(
        "✅ Correctly caught invalid identifier error:",
        error.message,
      );
    }

    // Test 2: Very long actor identifier
    console.log("Test 2: Very long actor identifier");
    try {
      const longIdentifier = `${"a".repeat(100)}@example.social`;
      const result = await client.callTool({
        name: "discover-actor",
        arguments: {
          identifier: longIdentifier,
        },
      });
      console.log("❌ Expected error for very long identifier");
    } catch (error) {
      console.log("✅ Correctly caught long identifier error:", error.message);
    }

    // Test 3: Empty actor identifier
    console.log("Test 3: Empty actor identifier");
    try {
      const result = await client.callTool({
        name: "discover-actor",
        arguments: {
          identifier: "",
        },
      });
      console.log("❌ Expected error for empty identifier");
    } catch (error) {
      console.log("✅ Correctly caught empty identifier error:", error.message);
    }

    // Test edge cases for fetch-timeline tool
    console.log("\n📝 Testing fetch-timeline edge cases...");

    // Test 4: Invalid timeline limit
    console.log("Test 4: Invalid timeline limit");
    try {
      const result = await client.callTool({
        name: "fetch-timeline",
        arguments: {
          identifier: "gargron@mastodon.social",
          limit: -1,
        },
      });
      console.log("❌ Expected error for negative limit");
    } catch (error) {
      console.log("✅ Correctly caught negative limit error:", error.message);
    }

    // Test 5: Very large timeline limit
    console.log("Test 5: Very large timeline limit");
    try {
      const result = await client.callTool({
        name: "fetch-timeline",
        arguments: {
          identifier: "gargron@mastodon.social",
          limit: 1000,
        },
      });
      console.log("❌ Expected error for very large limit");
    } catch (error) {
      console.log("✅ Correctly caught large limit error:", error.message);
    }

    // Test 6: Non-existent actor timeline
    console.log("Test 6: Non-existent actor timeline");
    try {
      const result = await client.callTool({
        name: "fetch-timeline",
        arguments: {
          identifier: "nonexistent@example.social",
          limit: 10,
        },
      });
      console.log("✅ Handled non-existent actor gracefully");
    } catch (error) {
      console.log(
        "✅ Correctly caught non-existent actor error:",
        error.message,
      );
    }

    // Test edge cases for search-instance tool
    console.log("\n🔗 Testing search-instance edge cases...");

    // Test 7: Invalid domain format
    console.log("Test 7: Invalid domain format");
    try {
      const result = await client.callTool({
        name: "search-instance",
        arguments: {
          domain: "invalid-domain",
          query: "test",
        },
      });
      console.log("❌ Expected error for invalid domain");
    } catch (error) {
      console.log("✅ Correctly caught invalid domain error:", error.message);
    }

    // Test 8: Empty search query
    console.log("Test 8: Empty search query");
    try {
      const result = await client.callTool({
        name: "search-instance",
        arguments: {
          domain: "mastodon.social",
          query: "",
        },
      });
      console.log("❌ Expected error for empty query");
    } catch (error) {
      console.log("✅ Correctly caught empty query error:", error.message);
    }

    // Test 9: Very long search query
    console.log("Test 9: Very long search query");
    try {
      const longQuery = "test ".repeat(1000);
      const result = await client.callTool({
        name: "search-instance",
        arguments: {
          domain: "mastodon.social",
          query: longQuery,
        },
      });
      console.log("✅ Handled long query gracefully");
    } catch (error) {
      console.log("✅ Correctly caught long query error:", error.message);
    }

    // Test edge cases for resources
    console.log("\n📚 Testing resource edge cases...");

    // Test 10: Resource with invalid URI format
    console.log("Test 10: Resource with invalid URI format");
    try {
      const result = await client.readResource({
        uri: "invalid://protocol/test",
      });
      console.log("❌ Expected error for invalid URI protocol");
    } catch (error) {
      console.log("✅ Correctly caught invalid URI error:", error.message);
    }

    // Test 11: Remote actor resource with invalid identifier
    console.log("Test 11: Remote actor resource with invalid identifier");
    try {
      const result = await client.readResource({
        uri: "activitypub://remote-actor/invalid-format",
      });
      console.log("❌ Expected error for invalid actor identifier");
    } catch (error) {
      console.log(
        "✅ Correctly caught invalid actor identifier error:",
        error.message,
      );
    }

    // Test edge cases for prompts
    console.log("\n💭 Testing prompt edge cases...");

    // Test 12: Prompt with empty interests
    console.log("Test 12: Prompt with empty interests");
    try {
      const result = await client.getPrompt({
        name: "explore-fediverse",
        arguments: {
          interests: "",
          instanceType: "mastodon",
        },
      });
      console.log("❌ Expected error for empty interests");
    } catch (error) {
      console.log("✅ Correctly caught empty interests error:", error.message);
    }

    // Test 13: Prompt with invalid instance type
    console.log("Test 13: Prompt with invalid instance type");
    try {
      const result = await client.getPrompt({
        name: "explore-fediverse",
        arguments: {
          interests: "technology",
          instanceType: "invalid-type",
        },
      });
      console.log("✅ Handled invalid instance type gracefully");
    } catch (error) {
      console.log(
        "✅ Correctly caught invalid instance type error:",
        error.message,
      );
    }

    // Test 14: Compare instances prompt with invalid instances
    console.log("Test 14: Compare instances prompt with invalid instances");
    try {
      const result = await client.getPrompt({
        name: "compare-instances",
        arguments: {
          instances: "",
          criteria: "community size",
        },
      });
      console.log("❌ Expected error for empty instances");
    } catch (error) {
      console.log("✅ Correctly caught empty instances error:", error.message);
    }

    // Test boundary conditions
    console.log("\n🎯 Testing boundary conditions...");

    // Test 15: Multiple rapid discover-actor requests
    console.log("Test 15: Multiple rapid discover-actor requests");
    try {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          client
            .callTool({
              name: "discover-actor",
              arguments: {
                identifier: "gargron@mastodon.social",
              },
            })
            .catch((error) => ({ error: error.message })),
        );
      }
      const results = await Promise.all(promises);
      const successes = results.filter((r) => !r.error);
      const errors = results.filter((r) => r.error);
      console.log(
        `✅ Handled multiple rapid requests: ${successes.length} successes, ${errors.length} errors`,
      );
    } catch (error) {
      console.log(
        "✅ Handled multiple rapid requests with errors:",
        error.message,
      );
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
