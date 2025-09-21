import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test script for federation functionality in ActivityPub MCP Server
 * This test file focuses on testing the federation.ts module and actor dispatcher
 */
async function testFederation() {
  console.log("🌐 Testing ActivityPub MCP Server Federation...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-federation-test-client",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // Test federation actor creation with various identifiers
    console.log("👤 Testing federation actor creation...");

    // Test 1: Create actor with simple identifier
    console.log("Test 1: Simple identifier");
    try {
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "federation-test-1",
          name: "Federation Test User 1",
          summary: "A test user for federation testing",
        },
      });
      console.log("✅ Created actor with simple identifier");
    } catch (error) {
      console.log("❌ Failed to create actor with simple identifier:", error);
    }

    // Test 2: Create actor with hyphenated identifier
    console.log("Test 2: Hyphenated identifier");
    try {
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "federation-test-user-2",
          name: "Federation Test User 2",
          summary: "A test user with hyphenated identifier",
        },
      });
      console.log("✅ Created actor with hyphenated identifier");
    } catch (error) {
      console.log(
        "❌ Failed to create actor with hyphenated identifier:",
        error,
      );
    }

    // Test 3: Create actor with numeric identifier
    console.log("Test 3: Numeric identifier");
    try {
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "user123",
          name: "User 123",
          summary: "A test user with numeric identifier",
        },
      });
      console.log("✅ Created actor with numeric identifier");
    } catch (error) {
      console.log("❌ Failed to create actor with numeric identifier:", error);
    }

    // Test 4: Create actor with underscore identifier
    console.log("Test 4: Underscore identifier");
    try {
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "test_user_4",
          name: "Test User 4",
          summary: "A test user with underscore identifier",
        },
      });
      console.log("✅ Created actor with underscore identifier");
    } catch (error) {
      console.log(
        "❌ Failed to create actor with underscore identifier:",
        error,
      );
    }

    // Test federation actor resources
    console.log("\n📚 Testing federation actor resources...");

    // Test 5: Read actor resource for created actors
    const actorIdentifiers = [
      "federation-test-1",
      "federation-test-user-2",
      "user123",
      "test_user_4",
    ];

    for (const identifier of actorIdentifiers) {
      console.log(
        `Test 5.${actorIdentifiers.indexOf(identifier) + 1}: Reading actor resource for ${identifier}`,
      );
      try {
        const result = await client.readResource({
          uri: `activitypub://actor/${identifier}`,
        });
        console.log(`✅ Successfully read actor resource for ${identifier}`);
      } catch (error) {
        console.log(
          `❌ Failed to read actor resource for ${identifier}:`,
          error,
        );
      }
    }

    // Test federation with different actor names and summaries
    console.log("\n🎭 Testing federation with various actor profiles...");

    // Test 6: Actor with special characters in name
    console.log("Test 6: Actor with special characters in name");
    try {
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "special-char-user",
          name: "José María García-López",
          summary: "A user with special characters in name: áéíóú ñ",
        },
      });
      console.log("✅ Created actor with special characters in name");
    } catch (error) {
      console.log("❌ Failed to create actor with special characters:", error);
    }

    // Test 7: Actor with emoji in name and summary
    console.log("Test 7: Actor with emoji");
    try {
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "emoji-user",
          name: "🚀 Rocket User 🌟",
          summary: "A user who loves emojis! 😄🎉🔥",
        },
      });
      console.log("✅ Created actor with emoji");
    } catch (error) {
      console.log("❌ Failed to create actor with emoji:", error);
    }

    // Test 8: Actor with long summary
    console.log("Test 8: Actor with long summary");
    try {
      const longSummary =
        "This is a very long summary that tests how the federation system handles extended text content. ".repeat(
          5,
        );
      const result = await client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "long-summary-user",
          name: "Long Summary User",
          summary: longSummary,
        },
      });
      console.log("✅ Created actor with long summary");
    } catch (error) {
      console.log("❌ Failed to create actor with long summary:", error);
    }

    // Test federation timeline functionality
    console.log("\n📰 Testing federation timeline functionality...");

    // Test 9: Read timeline for created actors
    for (const identifier of [
      "federation-test-1",
      "special-char-user",
      "emoji-user",
    ]) {
      console.log(
        `Test 9.${["federation-test-1", "special-char-user", "emoji-user"].indexOf(identifier) + 1}: Reading timeline for ${identifier}`,
      );
      try {
        const result = await client.readResource({
          uri: `activitypub://timeline/${identifier}`,
        });
        console.log(`✅ Successfully read timeline for ${identifier}`);
      } catch (error) {
        console.log(`❌ Failed to read timeline for ${identifier}:`, error);
      }
    }

    // Test federation post creation
    console.log("\n📝 Testing federation post creation...");

    // Test 10: Create posts for federation actors
    const testPosts = [
      {
        actor: "federation-test-1",
        content: "Hello from federation test 1! 🌐",
      },
      {
        actor: "special-char-user",
        content: "¡Hola mundo! Testing special characters: áéíóú ñ",
      },
      { actor: "emoji-user", content: "Testing emoji posts! 🚀🌟😄🎉🔥" },
      {
        actor: "long-summary-user",
        content: "Testing post creation for user with long summary",
      },
    ];

    for (const post of testPosts) {
      console.log(
        `Test 10.${testPosts.indexOf(post) + 1}: Creating post for ${post.actor}`,
      );
      try {
        const result = await client.callTool({
          name: "create-post",
          arguments: {
            actor: post.actor,
            content: post.content,
          },
        });
        console.log(`✅ Successfully created post for ${post.actor}`);
      } catch (error) {
        console.log(`❌ Failed to create post for ${post.actor}:`, error);
      }
    }

    console.log("\n🎉 Federation tests completed!");
  } catch (error) {
    console.error("❌ Federation test failed:", error);
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
testFederation().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
