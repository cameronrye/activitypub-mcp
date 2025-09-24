import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test script specifically designed to trigger error paths in the code
 * This test file aims to hit the uncovered error handling lines
 */
async function testErrorPaths() {
  console.log("🚨 Testing ActivityPub MCP Server Error Paths...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-error-path-test-client",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // Test 1: Try to trigger McpError in discover-actor
    console.log("Test 1: Triggering McpError in discover-actor");
    try {
      // Try with extremely long identifier to trigger validation error
      const veryLongId = `${"a".repeat(1000)}@example.social`;
      await client.callTool({
        name: "discover-actor",
        arguments: {
          identifier: veryLongId,
        },
      });
      console.log("❌ Expected McpError for very long identifier");
    } catch (error) {
      console.log("✅ Caught expected error:", error.message);
    }

    // Test 2: Try to trigger different error types
    console.log("\nTest 2: Testing various error scenarios");

    // Test with invalid characters that might cause different error types
    const invalidIdentifiers = [
      "test#hashtag",
      "test$money",
      "test%percent",
      "test&ampersand",
      "test*asterisk",
      "test(parenthesis)",
      "test[bracket]",
      "test{brace}",
      "test|pipe",
      "test\\backslash",
      "test/slash",
      "test:colon",
      "test;semicolon",
      'test"quote',
      "test'apostrophe",
      "test<less>",
      "test>greater",
      "test?question",
      "test=equals",
      "test+plus",
    ];

    for (const identifier of invalidIdentifiers) {
      try {
        await client.callTool({
          name: "discover-actor",
          arguments: {
            identifier: identifier,
          },
        });
        console.log(`❌ Expected error for identifier: ${identifier}`);
      } catch (error) {
        console.log(`✅ Caught error for ${identifier}: ${error.message.substring(0, 50)}...`);
      }
    }

    // Test 3: Try to trigger errors in fetch-timeline
    console.log("\nTest 3: Testing fetch-timeline error scenarios");

    // Test with extremely large limit
    try {
      await client.callTool({
        name: "fetch-timeline",
        arguments: {
          identifier: "gargron@mastodon.social",
          limit: 10000,
        },
      });
      console.log("✅ Large limit handled successfully");
    } catch (error) {
      console.log("✅ Caught error for large limit:", error.message);
    }

    // Test 4: Try to trigger errors in search-instance
    console.log("\nTest 4: Testing search-instance error scenarios");

    const invalidDomains = [
      "not-a-domain",
      "ftp://invalid-protocol.com",
      "javascript:alert('xss')",
      "data:text/html,<script>alert('xss')</script>",
      "file:///etc/passwd",
      "http://",
      "https://",
      "localhost:99999",
      "[invalid-ipv6]",
      `${"a".repeat(1000)}.com`,
    ];

    for (const domain of invalidDomains) {
      try {
        await client.callTool({
          name: "search-instance",
          arguments: {
            domain: domain,
            query: "test",
          },
        });
        console.log(`❌ Expected error for domain: ${domain.substring(0, 30)}...`);
      } catch (error) {
        console.log(`✅ Caught error for invalid domain: ${error.message.substring(0, 50)}...`);
      }
    }

    // Test 5: Try to trigger errors in get-instance-info
    console.log("\nTest 5: Testing get-instance-info error scenarios");

    for (const domain of invalidDomains) {
      try {
        await client.callTool({
          name: "get-instance-info",
          arguments: {
            domain: domain,
          },
        });
        console.log(`❌ Expected error for domain: ${domain.substring(0, 30)}...`);
      } catch (error) {
        console.log(`✅ Caught error for invalid domain: ${error.message.substring(0, 50)}...`);
      }
    }

    // Test 6: Test resource errors with malformed URIs
    console.log("\nTest 6: Testing resource error scenarios");

    const malformedUris = [
      "activitypub://",
      "activitypub://remote-actor",
      "activitypub://remote-timeline",
      "activitypub://remote-actor/",
      "activitypub://remote-timeline/",
      "activitypub://invalid",
      `activitypub://remote-actor/${"a".repeat(1000)}`,
      `activitypub://remote-timeline/${"a".repeat(1000)}`,
      "not-activitypub://remote-actor/test",
      "activitypub://remote-actor/test@invalid.com",
      "activitypub://remote-actor/test#fragment",
      "activitypub://remote-actor/test?query=value",
      "activitypub://remote-actor/test with spaces",
      "activitypub://remote-actor/test\nwith\nnewlines",
      "activitypub://remote-actor/test\twith\ttabs",
    ];

    for (const uri of malformedUris) {
      try {
        await client.readResource({ uri });
        console.log(`❌ Expected error for URI: ${uri.substring(0, 40)}...`);
      } catch (error) {
        console.log(`✅ Caught error for malformed URI: ${error.message.substring(0, 50)}...`);
      }
    }

    // Test 7: Test prompt errors with invalid arguments
    console.log("\nTest 7: Testing prompt error scenarios");

    const invalidPromptArgs = [
      {
        name: "explore-fediverse",
        arguments: { interests: "", instanceType: "mastodon" },
      },
      {
        name: "explore-fediverse",
        arguments: { interests: "test", instanceType: "invalid-type" },
      },
      {
        name: "explore-fediverse",
        arguments: { interests: "a".repeat(10000), instanceType: "mastodon" },
      },
      {
        name: "compare-instances",
        arguments: { instances: "", criteria: "community size" },
      },
      {
        name: "compare-instances",
        arguments: { instances: "mastodon.social", criteria: "" },
      },
      {
        name: "discover-content",
        arguments: { topics: "", contentType: "all" },
      },
      {
        name: "discover-content",
        arguments: {
          topics: "a".repeat(1000),
          contentType: "all",
        },
      },
      { name: "invalid-prompt", arguments: { test: "value" } },
    ];

    for (const promptArg of invalidPromptArgs) {
      try {
        await client.getPrompt(promptArg);
        console.log(`❌ Expected error for prompt: ${promptArg.name}`);
      } catch (error) {
        console.log(
          `✅ Caught error for prompt ${promptArg.name}: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 8: Test concurrent operations that might cause race conditions
    console.log("\nTest 8: Testing concurrent operations");

    const concurrentPromises = [];

    // Discover multiple actors concurrently
    for (let i = 0; i < 10; i++) {
      concurrentPromises.push(
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

    // Fetch multiple timelines concurrently
    for (let i = 0; i < 10; i++) {
      concurrentPromises.push(
        client
          .callTool({
            name: "fetch-timeline",
            arguments: {
              identifier: "gargron@mastodon.social",
              limit: 5,
            },
          })
          .catch((error) => ({ error: error.message })),
      );
    }

    // Read multiple resources concurrently
    for (let i = 0; i < 10; i++) {
      concurrentPromises.push(
        client
          .readResource({
            uri: "activitypub://server-info",
          })
          .catch((error) => ({ error: error.message })),
      );
    }

    const results = await Promise.all(concurrentPromises);
    const errors = results.filter((r) => r?.error);
    const successes = results.filter((r) => !r || !r.error);

    console.log(
      `✅ Concurrent operations completed: ${successes.length} successes, ${errors.length} errors`,
    );

    console.log("\n🎉 Error path tests completed!");
  } catch (error) {
    console.error("❌ Error path test failed:", error);
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
testErrorPaths().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
