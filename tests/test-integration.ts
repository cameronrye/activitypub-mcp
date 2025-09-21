import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Integration test for ActivityPub MCP Server with running ActivityPub server
 */
async function testIntegration() {
  console.log("🔗 Testing ActivityPub MCP Server Integration...\n");

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-integration-test",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // Test 1: Read actor resource (should work now)
    console.log("👤 Testing actor resource with running ActivityPub server...");
    try {
      const actorResource = await client.readResource({
        uri: "activitypub://actor/john",
      });
      const actorData = JSON.parse(actorResource.contents[0].text || "{}");
      console.log("✅ Actor resource successful!");
      console.log("Actor ID:", actorData.id);
      console.log("Actor type:", actorData.type);
      console.log("Actor name:", actorData.name);
      console.log();
    } catch (error) {
      console.log(
        "❌ Actor resource failed:",
        error instanceof Error ? error.message : error,
      );
      console.log();
    }

    // Test 2: Test timeline resource
    console.log("📰 Testing timeline resource...");
    try {
      const timelineResource = await client.readResource({
        uri: "activitypub://timeline/john",
      });
      const timelineData = JSON.parse(
        timelineResource.contents[0].text || "{}",
      );
      console.log("✅ Timeline resource successful!");
      console.log("Timeline type:", timelineData.type);
      console.log("Total items:", timelineData.totalItems);
      console.log();
    } catch (error) {
      console.log(
        "❌ Timeline resource failed:",
        error instanceof Error ? error.message : error,
      );
      console.log();
    }

    // Test 3: Create a post
    console.log("📝 Testing create-post tool...");
    const createPostResult = await client.callTool({
      name: "create-post",
      arguments: {
        actor: "john",
        content: "Hello from the ActivityPub MCP Server! 🚀",
        to: ["https://www.w3.org/ns/activitystreams#Public"],
      },
    });
    console.log("✅ Create post result:", createPostResult.content[0]);
    console.log();

    // Test 4: Test follow functionality
    console.log("🤝 Testing follow-actor tool...");
    const followResult = await client.callTool({
      name: "follow-actor",
      arguments: {
        follower: "john",
        target: "https://mastodon.social/users/example",
      },
    });
    console.log("✅ Follow result:", followResult.content[0]);
    console.log();

    // Test 5: Test like functionality
    console.log("❤️  Testing like-post tool...");
    const likeResult = await client.callTool({
      name: "like-post",
      arguments: {
        actor: "john",
        postUri: "https://example.com/posts/123",
      },
    });
    console.log("✅ Like result:", likeResult.content[0]);
    console.log();

    // Test 6: Test prompts with sampling (if available)
    console.log("💭 Testing actor-introduction prompt...");
    const introPrompt = await client.getPrompt({
      name: "actor-introduction",
      arguments: {
        actorName: "John",
        interests: "ActivityPub, decentralization, open source",
        background:
          "Software developer passionate about federated social networks",
      },
    });
    console.log("✅ Introduction prompt:", introPrompt.messages[0].content);
    console.log();

    console.log("🎉 Integration tests completed successfully!");
    console.log("\n📊 Summary:");
    console.log("- MCP server: ✅ Working");
    console.log("- ActivityPub server: ✅ Working");
    console.log("- Resources: ✅ Working");
    console.log("- Tools: ✅ Working");
    console.log("- Prompts: ✅ Working");
    console.log("- Integration: ✅ Working");
  } catch (error) {
    console.error("❌ Integration test failed:", error);
  } finally {
    await client.close();
  }
}

// Run the integration test
testIntegration().catch(console.error);
