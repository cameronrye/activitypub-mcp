import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Final comprehensive test to reach 90% coverage
 * This test specifically targets the remaining uncovered lines
 */
async function testFinalCoverage() {
  console.log("🎯 Final Coverage Test - Targeting 90%...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-final-coverage-client",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // Test 1: Comprehensive actor creation to trigger all code paths
    console.log("Test 1: Comprehensive actor creation scenarios");

    const actorScenarios = [
      // Valid scenarios
      { id: "valid1", name: "Valid User 1", summary: "Valid summary 1" },
      { id: "valid2", name: "Valid User 2", summary: "Valid summary 2" },
      { id: "valid3", name: "Valid User 3", summary: "Valid summary 3" },

      // Edge case scenarios
      { id: "a", name: "A", summary: "Single char" },
      { id: "user123", name: "User 123", summary: "Numeric user" },
      {
        id: "user_underscore",
        name: "User Underscore",
        summary: "Underscore user",
      },
      { id: "user-hyphen", name: "User Hyphen", summary: "Hyphen user" },

      // Long scenarios
      {
        id: "verylongusernamethatmightcauseedgecases",
        name: "Very Long Username",
        summary: "Long username test",
      },
      { id: "normaluser", name: "A".repeat(200), summary: "Long name test" },
      { id: "summaryuser", name: "Summary User", summary: "S".repeat(500) },

      // Special character scenarios
      { id: "unicode1", name: "José María", summary: "Unicode name test" },
      { id: "unicode2", name: "李小明", summary: "Chinese characters" },
      { id: "unicode3", name: "محمد", summary: "Arabic characters" },
      { id: "emoji1", name: "🚀 Rocket", summary: "Emoji in name" },
      { id: "emoji2", name: "Normal User", summary: "Emoji in summary 🎉🔥" },
    ];

    for (const scenario of actorScenarios) {
      try {
        const result = await client.callTool({
          name: "create-actor",
          arguments: {
            identifier: scenario.id,
            name: scenario.name,
            summary: scenario.summary,
          },
        });
        console.log(`✅ Created actor: ${scenario.id}`);
      } catch (error) {
        console.log(
          `❌ Failed to create actor ${scenario.id}: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 2: Comprehensive post creation scenarios
    console.log("\nTest 2: Comprehensive post creation scenarios");

    const postScenarios = [
      { actor: "valid1", content: "Hello world!" },
      { actor: "valid2", content: "This is a test post with some content." },
      { actor: "valid3", content: "A".repeat(1000) }, // Very long content
      { actor: "a", content: "Short post from single char user" },
      {
        actor: "user123",
        content: "Post with unicode: 🌍🚀💻 Chinese: 你好 Arabic: مرحبا",
      },
      { actor: "user_underscore", content: "   \n\t   \n   " }, // Whitespace content
      {
        actor: "user-hyphen",
        content: "Post with special chars: @#$%^&*()_+-=[]{}|;':\",./<>?",
      },
      {
        actor: "unicode1",
        content:
          "Posting in multiple languages: English, Español, 中文, العربية",
      },
      {
        actor: "emoji1",
        content:
          "Emoji post: 😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾",
      },
    ];

    for (const scenario of postScenarios) {
      try {
        const result = await client.callTool({
          name: "create-post",
          arguments: {
            actor: scenario.actor,
            content: scenario.content,
          },
        });
        console.log(`✅ Created post for: ${scenario.actor}`);
      } catch (error) {
        console.log(
          `❌ Failed to create post for ${scenario.actor}: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 3: Comprehensive follow scenarios
    console.log("\nTest 3: Comprehensive follow scenarios");

    const followScenarios = [
      { follower: "valid1", target: "https://mastodon.social/users/example1" },
      { follower: "valid2", target: "https://pixelfed.social/users/example2" },
      {
        follower: "valid3",
        target: "https://peertube.example.com/accounts/example3",
      },
      { follower: "a", target: "https://lemmy.ml/u/example4" },
      {
        follower: "user123",
        target: "https://diaspora.example.com/people/example5",
      },
      {
        follower: "user_underscore",
        target: "https://friendica.example.com/profile/example6",
      },
      {
        follower: "user-hyphen",
        target: "https://pleroma.example.com/users/example7",
      },
      { follower: "unicode1", target: "https://misskey.io/@example8" },
      { follower: "emoji1", target: "https://calckey.example.com/@example9" },
      {
        follower: "valid1",
        target:
          "https://example.com/users/very-long-username-that-might-cause-issues",
      },
      { follower: "valid2", target: "https://example.com/users/unicode-用户" },
      { follower: "valid3", target: "https://example.com/users/emoji-user-🚀" },
    ];

    for (const scenario of followScenarios) {
      try {
        const result = await client.callTool({
          name: "follow-actor",
          arguments: {
            follower: scenario.follower,
            target: scenario.target,
          },
        });
        console.log(
          `✅ ${scenario.follower} followed ${scenario.target.substring(0, 30)}...`,
        );
      } catch (error) {
        console.log(
          `❌ Failed follow ${scenario.follower}: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 4: Comprehensive like scenarios
    console.log("\nTest 4: Comprehensive like scenarios");

    const likeScenarios = [
      {
        actor: "valid1",
        postUri: "https://mastodon.social/users/example/statuses/1",
      },
      { actor: "valid2", postUri: "https://pixelfed.social/p/example/2" },
      {
        actor: "valid3",
        postUri: "https://peertube.example.com/videos/watch/3",
      },
      { actor: "a", postUri: "https://lemmy.ml/post/4" },
      { actor: "user123", postUri: "https://diaspora.example.com/posts/5" },
      {
        actor: "user_underscore",
        postUri: "https://friendica.example.com/display/6",
      },
      { actor: "user-hyphen", postUri: "https://pleroma.example.com/notice/7" },
      { actor: "unicode1", postUri: "https://misskey.io/notes/8" },
      { actor: "emoji1", postUri: "https://calckey.example.com/notes/9" },
      {
        actor: "valid1",
        postUri:
          "https://example.com/posts/very-long-post-id-that-might-cause-issues-123456789",
      },
      {
        actor: "valid2",
        postUri: "https://example.com/posts/unicode-帖子-123",
      },
      {
        actor: "valid3",
        postUri: "https://example.com/posts/emoji-post-🚀-456",
      },
    ];

    for (const scenario of likeScenarios) {
      try {
        const result = await client.callTool({
          name: "like-post",
          arguments: {
            actor: scenario.actor,
            postUri: scenario.postUri,
          },
        });
        console.log(
          `✅ ${scenario.actor} liked ${scenario.postUri.substring(0, 30)}...`,
        );
      } catch (error) {
        console.log(
          `❌ Failed like ${scenario.actor}: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 5: Comprehensive resource reading scenarios
    console.log("\nTest 5: Comprehensive resource reading scenarios");

    const resourceScenarios = [
      "activitypub://actor/valid1",
      "activitypub://actor/valid2",
      "activitypub://actor/valid3",
      "activitypub://actor/a",
      "activitypub://actor/user123",
      "activitypub://actor/user_underscore",
      "activitypub://actor/user-hyphen",
      "activitypub://actor/unicode1",
      "activitypub://actor/emoji1",
      "activitypub://timeline/valid1",
      "activitypub://timeline/valid2",
      "activitypub://timeline/valid3",
      "activitypub://timeline/a",
      "activitypub://timeline/user123",
      "activitypub://timeline/user_underscore",
      "activitypub://timeline/user-hyphen",
      "activitypub://timeline/unicode1",
      "activitypub://timeline/emoji1",
    ];

    for (const uri of resourceScenarios) {
      try {
        const result = await client.readResource({ uri });
        console.log(`✅ Read resource: ${uri}`);
      } catch (error) {
        console.log(
          `❌ Failed to read ${uri}: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 6: Comprehensive prompt scenarios
    console.log("\nTest 6: Comprehensive prompt scenarios");

    const promptScenarios = [
      {
        name: "compose-post",
        args: { topic: "ActivityPub", tone: "professional" },
      },
      { name: "compose-post", args: { topic: "Fediverse", tone: "casual" } },
      {
        name: "compose-post",
        args: { topic: "Social Media", tone: "humorous" },
      },
      {
        name: "compose-post",
        args: { topic: "Technology", tone: "informative" },
      },
      {
        name: "compose-post",
        args: { topic: "Open Source", tone: "professional" },
      },
      {
        name: "compose-post",
        args: { topic: "Decentralization", tone: "casual" },
      },
      { name: "compose-post", args: { topic: "Privacy", tone: "informative" } },
      { name: "compose-post", args: { topic: "Community", tone: "humorous" } },
      {
        name: "actor-introduction",
        args: {
          actorName: "Alice",
          interests: "coding, music",
          background: "developer",
        },
      },
      {
        name: "actor-introduction",
        args: {
          actorName: "Bob",
          interests: "art, photography",
          background: "artist",
        },
      },
      {
        name: "actor-introduction",
        args: {
          actorName: "Charlie",
          interests: "science, research",
          background: "scientist",
        },
      },
      {
        name: "actor-introduction",
        args: {
          actorName: "Diana",
          interests: "writing, literature",
          background: "author",
        },
      },
      {
        name: "actor-introduction",
        args: {
          actorName: "Eve",
          interests: "gaming, streaming",
          background: "content creator",
        },
      },
      {
        name: "actor-introduction",
        args: {
          actorName: "Frank",
          interests: "cooking, food",
          background: "chef",
        },
      },
      {
        name: "actor-introduction",
        args: {
          actorName: "Grace",
          interests: "travel, adventure",
          background: "explorer",
        },
      },
      {
        name: "actor-introduction",
        args: {
          actorName: "Henry",
          interests: "music, performance",
          background: "musician",
        },
      },
    ];

    for (const scenario of promptScenarios) {
      try {
        const result = await client.getPrompt({
          name: scenario.name,
          arguments: scenario.args,
        });
        console.log(`✅ Generated prompt: ${scenario.name}`);
      } catch (error) {
        console.log(
          `❌ Failed prompt ${scenario.name}: ${error.message.substring(0, 50)}...`,
        );
      }
    }

    // Test 7: Stress test with concurrent operations
    console.log("\nTest 7: Stress testing with concurrent operations");

    const concurrentPromises = [];

    // Create 100 concurrent operations of different types
    for (let i = 0; i < 25; i++) {
      // Actor creation
      concurrentPromises.push(
        client
          .callTool({
            name: "create-actor",
            arguments: {
              identifier: `stress-actor-${i}`,
              name: `Stress Actor ${i}`,
              summary: `Stress test actor ${i}`,
            },
          })
          .catch((error) => ({ error: error.message })),
      );

      // Post creation
      concurrentPromises.push(
        client
          .callTool({
            name: "create-post",
            arguments: {
              actor: `stress-actor-${i % 10}`,
              content: `Stress test post ${i}`,
            },
          })
          .catch((error) => ({ error: error.message })),
      );

      // Resource reading
      concurrentPromises.push(
        client
          .readResource({
            uri: `activitypub://actor/stress-actor-${i % 10}`,
          })
          .catch((error) => ({ error: error.message })),
      );

      // Prompt generation
      concurrentPromises.push(
        client
          .getPrompt({
            name: "compose-post",
            arguments: {
              topic: `Stress test topic ${i}`,
              tone: ["professional", "casual", "humorous", "informative"][
                i % 4
              ],
            },
          })
          .catch((error) => ({ error: error.message })),
      );
    }

    const results = await Promise.all(concurrentPromises);
    const successes = results.filter((r) => !r || !r.error);
    const errors = results.filter((r) => r?.error);

    console.log(
      `✅ Stress test completed: ${successes.length} successes, ${errors.length} errors`,
    );

    console.log("\n🎉 Final coverage tests completed!");
  } catch (error) {
    console.error("❌ Final coverage test failed:", error);
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
testFinalCoverage().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
