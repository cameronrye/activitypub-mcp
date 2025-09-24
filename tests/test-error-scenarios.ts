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

    // Test error scenarios for discover-actor tool
    console.log("🔧 Testing discover-actor error scenarios...");

    // Test 1: Empty identifier
    try {
      const result = await client.callTool({
        name: "discover-actor",
        arguments: {
          identifier: "",
        },
      });
      if (result.isError || result.content[0].text?.includes("MCP error")) {
        console.log("✅ Correctly caught empty identifier error");
      } else {
        console.log("❌ Expected error for empty identifier");
      }
    } catch (_error) {
      console.log("✅ Correctly caught empty identifier error");
    }

    // Test 2: Missing required fields
    try {
      await client.callTool({
        name: "discover-actor",
        arguments: {
          // Missing identifier
        },
      });
      console.log("❌ Expected error for missing fields");
    } catch (_error) {
      console.log("✅ Correctly caught missing fields error");
    }

    // Test 3: Invalid identifier format
    try {
      const result = await client.callTool({
        name: "discover-actor",
        arguments: {
          identifier: "invalid-format",
        },
      });
      if (result.isError || result.content[0].text?.includes("MCP error")) {
        console.log("✅ Correctly caught invalid identifier error");
      } else {
        console.log("❌ Expected error for invalid identifier");
      }
    } catch (_error) {
      console.log("✅ Correctly caught invalid identifier error");
    }

    // Test error scenarios for fetch-timeline tool
    console.log("\n📝 Testing fetch-timeline error scenarios...");

    // Test 4: Empty identifier
    try {
      const result = await client.callTool({
        name: "fetch-timeline",
        arguments: {
          identifier: "",
          limit: 10,
        },
      });
      if (result.isError || result.content[0].text?.includes("MCP error")) {
        console.log("✅ Correctly caught empty identifier error");
      } else {
        console.log("❌ Expected error for empty identifier");
      }
    } catch (_error) {
      console.log("✅ Correctly caught empty identifier error");
    }

    // Test 5: Invalid limit
    try {
      await client.callTool({
        name: "fetch-timeline",
        arguments: {
          identifier: "gargron@mastodon.social",
          limit: -1,
        },
      });
      console.log("❌ Expected error for invalid limit");
    } catch (_error) {
      console.log("✅ Correctly caught invalid limit error");
    }

    // Test error scenarios for search-instance tool
    console.log("\n🔍 Testing search-instance error scenarios...");

    // Test 6: Invalid domain
    try {
      const result = await client.callTool({
        name: "search-instance",
        arguments: {
          domain: "invalid-domain",
          query: "test",
        },
      });
      if (result.isError || result.content[0].text?.includes("MCP error")) {
        console.log("✅ Correctly caught invalid domain error");
      } else {
        console.log("❌ Expected error for invalid domain");
      }
    } catch (_error) {
      console.log("✅ Correctly caught invalid domain error");
    }

    // Test 7: Empty query
    try {
      const result = await client.callTool({
        name: "search-instance",
        arguments: {
          domain: "mastodon.social",
          query: "",
        },
      });
      if (result.isError || result.content[0].text?.includes("MCP error")) {
        console.log("✅ Correctly caught empty query error");
      } else {
        console.log("❌ Expected error for empty query");
      }
    } catch (_error) {
      console.log("✅ Correctly caught empty query error");
    }

    // Test error scenarios for get-instance-info tool
    console.log("\n🏢 Testing get-instance-info error scenarios...");

    // Test 8: Invalid domain format
    try {
      const result = await client.callTool({
        name: "get-instance-info",
        arguments: {
          domain: "invalid-domain-format",
        },
      });
      if (result.isError || result.content[0].text?.includes("MCP error")) {
        console.log("✅ Correctly caught invalid domain format error");
      } else {
        console.log("❌ Expected error for invalid domain format");
      }
    } catch (_error) {
      console.log("✅ Correctly caught invalid domain format error");
    }

    // Test 9: Empty domain
    try {
      const result = await client.callTool({
        name: "get-instance-info",
        arguments: {
          domain: "",
        },
      });
      if (result.isError || result.content[0].text?.includes("MCP error")) {
        console.log("✅ Correctly caught empty domain error");
      } else {
        console.log("❌ Expected error for empty domain");
      }
    } catch (_error) {
      console.log("✅ Correctly caught empty domain error");
    }

    // Test resource error scenarios
    console.log("\n📚 Testing resource error scenarios...");

    // Test 10: Invalid remote actor resource
    try {
      await client.readResource({
        uri: "activitypub://remote-actor/invalid-format",
      });
      console.log("❌ Expected error for invalid remote actor resource");
    } catch (_error) {
      console.log("✅ Correctly caught invalid remote actor resource error");
    }

    // Test 11: Malformed timeline resource
    try {
      await client.readResource({
        uri: "activitypub://remote-timeline/",
      });
      console.log("❌ Expected error for malformed timeline resource");
    } catch (_error) {
      console.log("✅ Correctly caught malformed timeline resource error");
    }

    // Test prompt error scenarios
    console.log("\n💭 Testing prompt error scenarios...");

    // Test 12: Empty interests for explore-fediverse prompt
    try {
      await client.getPrompt({
        name: "explore-fediverse",
        arguments: {
          interests: "",
          instanceType: "mastodon",
        },
      });
      console.log("❌ Expected error for empty interests");
    } catch (_error) {
      console.log("✅ Correctly caught empty interests error");
    }

    // Test 13: Missing arguments for compare-instances prompt
    try {
      await client.getPrompt({
        name: "compare-instances",
        arguments: {},
      });
      console.log("❌ Expected error for missing arguments");
    } catch (_error) {
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
