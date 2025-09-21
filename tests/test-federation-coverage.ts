import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test script specifically designed to cover federation.ts lines 15-20
 * This test focuses on triggering the actor dispatcher through the MCP server
 */
async function testFederationCoverage() {
  console.log("🌐 Testing Federation Coverage (lines 15-20)...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-federation-coverage-client",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // The federation.ts lines 15-20 contain the actor dispatcher:
    // return new Person({
    //   id: ctx.getActorUri(identifier),
    //   preferredUsername: identifier,
    //   name: identifier,
    // });

    // To trigger this code, we need to create actors and then try to access them
    // through the ActivityPub federation system (not just the MCP interface)

    console.log("👤 Creating actors to trigger federation dispatcher...");

    // Test 1: Create multiple actors with different identifiers
    const testActors = [
      "federation-user-1",
      "federation-user-2",
      "federation-user-3",
      "test123",
      "user_with_underscores",
      "user-with-hyphens",
      "a",
      "verylongusername",
      "user1",
      "user2",
      "user3",
      "user4",
      "user5",
    ];

    for (const identifier of testActors) {
      console.log(`Creating actor: ${identifier}`);
      try {
        const result = await client.callTool({
          name: "create-actor",
          arguments: {
            identifier: identifier,
            name: `Federation User ${identifier}`,
            summary: `A federation test user with identifier ${identifier}`,
          },
        });
        console.log(`✅ Created actor: ${identifier}`);
      } catch (error) {
        console.log(`❌ Failed to create actor ${identifier}:`, error.message);
      }
    }

    // Test 2: Try to read actor resources (this might trigger federation code)
    console.log("\n📚 Reading actor resources to trigger federation...");

    for (const identifier of testActors) {
      console.log(`Reading actor resource: ${identifier}`);
      try {
        const result = await client.readResource({
          uri: `activitypub://actor/${identifier}`,
        });
        console.log(`✅ Read actor resource: ${identifier}`);
      } catch (error) {
        console.log(
          `❌ Failed to read actor resource ${identifier}:`,
          error.message,
        );
      }
    }

    // Test 3: Create posts for these actors (might trigger federation)
    console.log("\n📝 Creating posts to trigger federation...");

    for (const identifier of testActors.slice(0, 5)) {
      // Just first 5 to avoid too much output
      console.log(`Creating post for actor: ${identifier}`);
      try {
        const result = await client.callTool({
          name: "create-post",
          arguments: {
            actor: identifier,
            content: `Hello from ${identifier}! This is a federation test post.`,
          },
        });
        console.log(`✅ Created post for actor: ${identifier}`);
      } catch (error) {
        console.log(
          `❌ Failed to create post for ${identifier}:`,
          error.message,
        );
      }
    }

    // Test 4: Read timelines (might trigger federation)
    console.log("\n📰 Reading timelines to trigger federation...");

    for (const identifier of testActors.slice(0, 5)) {
      console.log(`Reading timeline for actor: ${identifier}`);
      try {
        const result = await client.readResource({
          uri: `activitypub://timeline/${identifier}`,
        });
        console.log(`✅ Read timeline for actor: ${identifier}`);
      } catch (error) {
        console.log(
          `❌ Failed to read timeline for ${identifier}:`,
          error.message,
        );
      }
    }

    // Test 5: Test follow relationships (might trigger federation)
    console.log("\n🤝 Testing follow relationships to trigger federation...");

    const followPairs = [
      ["federation-user-1", "federation-user-2"],
      ["federation-user-2", "federation-user-3"],
      ["test123", "user_with_underscores"],
      ["user-with-hyphens", "a"],
      ["verylongusername", "user1"],
    ];

    for (const [follower, target] of followPairs) {
      console.log(`${follower} following ${target}`);
      try {
        const result = await client.callTool({
          name: "follow-actor",
          arguments: {
            follower: follower,
            target: `http://localhost:8000/users/${target}`,
          },
        });
        console.log(`✅ ${follower} followed ${target}`);
      } catch (error) {
        console.log(
          `❌ Failed follow ${follower} -> ${target}:`,
          error.message,
        );
      }
    }

    // Test 6: Test likes (might trigger federation)
    console.log("\n❤️ Testing likes to trigger federation...");

    for (const identifier of testActors.slice(0, 3)) {
      console.log(`${identifier} liking a post`);
      try {
        const result = await client.callTool({
          name: "like-post",
          arguments: {
            actor: identifier,
            postUri: `http://localhost:8000/users/${identifier}/posts/1`,
          },
        });
        console.log(`✅ ${identifier} liked a post`);
      } catch (error) {
        console.log(`❌ Failed like for ${identifier}:`, error.message);
      }
    }

    // Test 7: Stress test with rapid actor creation
    console.log("\n⚡ Stress testing actor creation...");

    const stressPromises = [];
    for (let i = 0; i < 50; i++) {
      stressPromises.push(
        client
          .callTool({
            name: "create-actor",
            arguments: {
              identifier: `stress-${i}`,
              name: `Stress User ${i}`,
              summary: `Stress test user ${i}`,
            },
          })
          .catch((error) => ({ error: error.message })),
      );
    }

    const stressResults = await Promise.all(stressPromises);
    const stressSuccesses = stressResults.filter((r) => !r.error);
    const stressErrors = stressResults.filter((r) => r.error);

    console.log(
      `✅ Stress test completed: ${stressSuccesses.length} successes, ${stressErrors.length} errors`,
    );

    // Test 8: Test with various character sets to trigger different code paths
    console.log("\n🌍 Testing international characters...");

    const internationalActors = [
      "josé",
      "müller",
      "李小明",
      "محمد",
      "владимир",
      "ñoño",
      "café",
      "naïve",
      "résumé",
      "piñata",
    ];

    for (const identifier of internationalActors) {
      console.log(`Creating international actor: ${identifier}`);
      try {
        const result = await client.callTool({
          name: "create-actor",
          arguments: {
            identifier: identifier,
            name: `International User ${identifier}`,
            summary: `An international test user: ${identifier}`,
          },
        });
        console.log(`✅ Created international actor: ${identifier}`);
      } catch (error) {
        console.log(
          `❌ Failed to create international actor ${identifier}:`,
          error.message,
        );
      }
    }

    console.log("\n🎉 Federation coverage tests completed!");
  } catch (error) {
    console.error("❌ Federation coverage test failed:", error);
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
testFederationCoverage().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
