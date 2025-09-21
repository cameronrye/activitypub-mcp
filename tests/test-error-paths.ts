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

    // Test 1: Try to trigger McpError in create-actor
    console.log("Test 1: Triggering McpError in create-actor");
    try {
      // Try with extremely long identifier to trigger validation error
      const veryLongId = "a".repeat(1000);
      await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: veryLongId,
          name: "Test User",
          summary: "Test summary",
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
      "test@domain.com",
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
          name: "create-actor",
          arguments: {
            identifier: identifier,
            name: "Test User",
            summary: "Test summary",
          },
        });
        console.log(`❌ Expected error for identifier: ${identifier}`);
      } catch (error) {
        console.log(
          `✅ Caught error for ${identifier}: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 3: Try to trigger errors in create-post
    console.log("\nTest 3: Testing create-post error scenarios");

    // Test with extremely long content
    const veryLongContent = "This is a very long post content. ".repeat(1000);
    try {
      await client.callTool({
        name: "create-post",
        arguments: {
          actor: "test-actor",
          content: veryLongContent,
        },
      });
      console.log("✅ Long content handled successfully");
    } catch (error) {
      console.log("✅ Caught error for long content:", error.message);
    }

    // Test 4: Try to trigger errors in follow-actor
    console.log("\nTest 4: Testing follow-actor error scenarios");

    const invalidUrls = [
      "not-a-url",
      "ftp://invalid-protocol.com",
      "javascript:alert('xss')",
      "data:text/html,<script>alert('xss')</script>",
      "file:///etc/passwd",
      "http://",
      "https://",
      "http://localhost:99999",
      "https://[invalid-ipv6]",
      "http://user:pass@example.com:80/path?query=value#fragment".repeat(100),
    ];

    for (const url of invalidUrls) {
      try {
        await client.callTool({
          name: "follow-actor",
          arguments: {
            follower: "test-actor",
            target: url,
          },
        });
        console.log(`❌ Expected error for URL: ${url.substring(0, 30)}...`);
      } catch (error) {
        console.log(
          `✅ Caught error for invalid URL: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 5: Try to trigger errors in like-post
    console.log("\nTest 5: Testing like-post error scenarios");

    for (const url of invalidUrls) {
      try {
        await client.callTool({
          name: "like-post",
          arguments: {
            actor: "test-actor",
            postUri: url,
          },
        });
        console.log(
          `❌ Expected error for post URI: ${url.substring(0, 30)}...`,
        );
      } catch (error) {
        console.log(
          `✅ Caught error for invalid post URI: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 6: Test resource errors with malformed URIs
    console.log("\nTest 6: Testing resource error scenarios");

    const malformedUris = [
      "activitypub://",
      "activitypub://actor",
      "activitypub://timeline",
      "activitypub://actor/",
      "activitypub://timeline/",
      "activitypub://invalid",
      `activitypub://actor/${"a".repeat(1000)}`,
      `activitypub://timeline/${"a".repeat(1000)}`,
      "not-activitypub://actor/test",
      "activitypub://actor/test@invalid.com",
      "activitypub://actor/test#fragment",
      "activitypub://actor/test?query=value",
      "activitypub://actor/test with spaces",
      "activitypub://actor/test\nwith\nnewlines",
      "activitypub://actor/test\twith\ttabs",
    ];

    for (const uri of malformedUris) {
      try {
        await client.readResource({ uri });
        console.log(`❌ Expected error for URI: ${uri.substring(0, 40)}...`);
      } catch (error) {
        console.log(
          `✅ Caught error for malformed URI: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 7: Test prompt errors with invalid arguments
    console.log("\nTest 7: Testing prompt error scenarios");

    const invalidPromptArgs = [
      { name: "compose-post", arguments: { topic: "", tone: "professional" } },
      {
        name: "compose-post",
        arguments: { topic: "test", tone: "invalid-tone" },
      },
      {
        name: "compose-post",
        arguments: { topic: "a".repeat(10000), tone: "professional" },
      },
      {
        name: "actor-introduction",
        arguments: { actorName: "", interests: "test", background: "test" },
      },
      {
        name: "actor-introduction",
        arguments: { actorName: "test", interests: "", background: "test" },
      },
      {
        name: "actor-introduction",
        arguments: { actorName: "test", interests: "test", background: "" },
      },
      {
        name: "actor-introduction",
        arguments: {
          actorName: "a".repeat(1000),
          interests: "test",
          background: "test",
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

    // Create multiple actors concurrently
    for (let i = 0; i < 20; i++) {
      concurrentPromises.push(
        client
          .callTool({
            name: "create-actor",
            arguments: {
              identifier: `concurrent-${i}`,
              name: `Concurrent User ${i}`,
              summary: `Concurrent test user ${i}`,
            },
          })
          .catch((error) => ({ error: error.message })),
      );
    }

    // Create multiple posts concurrently
    for (let i = 0; i < 20; i++) {
      concurrentPromises.push(
        client
          .callTool({
            name: "create-post",
            arguments: {
              actor: `concurrent-${i % 5}`,
              content: `Concurrent post ${i}`,
            },
          })
          .catch((error) => ({ error: error.message })),
      );
    }

    // Read multiple resources concurrently
    for (let i = 0; i < 20; i++) {
      concurrentPromises.push(
        client
          .readResource({
            uri: `activitypub://actor/concurrent-${i}`,
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
