import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Final coverage test for ActivityPub MCP Server
 * This test aims to achieve maximum code coverage by testing all existing functionality
 * with various scenarios and edge cases
 */
async function testFinalCoverage() {
  console.log("🎯 Final Coverage Test for ActivityPub MCP Server...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "activitypub-mcp-final-coverage-test",
    version: "1.0.0",
  });

  try {
    // Connect to the MCP server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected successfully!\n");

    // Test 1: Comprehensive actor discovery scenarios
    console.log("👤 Testing comprehensive actor discovery scenarios...");

    const actorScenarios = [
      {
        id: "gargron@mastodon.social",
        name: "Eugen Rochko",
        description: "Mastodon founder",
      },
      {
        id: "Mastodon@mastodon.social",
        name: "Mastodon Official",
        description: "Official account",
      },
      {
        id: "nonexistent@example.com",
        name: "Non-existent Actor",
        description: "Should fail gracefully",
      },
    ];

    for (const scenario of actorScenarios) {
      try {
        const _result = await client.callTool({
          name: "discover-actor",
          arguments: {
            identifier: scenario.id,
          },
        });
        console.log(`✅ Discovered actor: ${scenario.name}`);
      } catch (error) {
        console.log(`❌ Failed to discover ${scenario.name}: ${error.message}`);
      }
    }

    // Test 2: Comprehensive timeline fetching scenarios
    console.log("\n📰 Testing comprehensive timeline fetching scenarios...");

    const timelineScenarios = [
      {
        actor: "gargron@mastodon.social",
        limit: 5,
        description: "Small timeline fetch",
      },
      {
        actor: "gargron@mastodon.social",
        limit: 20,
        description: "Medium timeline fetch",
      },
      {
        actor: "nonexistent@example.com",
        limit: 10,
        description: "Non-existent actor timeline",
      },
    ];

    for (const scenario of timelineScenarios) {
      try {
        const _result = await client.callTool({
          name: "fetch-timeline",
          arguments: {
            identifier: scenario.actor,
            limit: scenario.limit,
          },
        });
        console.log(`✅ Fetched timeline: ${scenario.description}`);
      } catch (error) {
        console.log(
          `❌ Failed timeline fetch ${scenario.description}: ${error.message}`,
        );
      }
    }

    // Test 3: Comprehensive instance discovery scenarios
    console.log("\n🏢 Testing comprehensive instance discovery scenarios...");

    const instanceScenarios = [
      {
        criteria: "popular",
        limit: 5,
        description: "Popular instances",
      },
      {
        criteria: "academic",
        limit: 3,
        description: "Academic instances",
      },
      {
        criteria: "invalid-criteria",
        limit: 5,
        description: "Invalid criteria (should handle gracefully)",
      },
    ];

    for (const scenario of instanceScenarios) {
      try {
        const _result = await client.callTool({
          name: "discover-instances",
          arguments: {
            criteria: scenario.criteria,
            limit: scenario.limit,
          },
        });
        console.log(`✅ Discovered instances: ${scenario.description}`);
      } catch (error) {
        console.log(
          `❌ Failed instance discovery ${scenario.description}: ${error.message}`,
        );
      }
    }

    // Test 4: Comprehensive instance recommendations
    console.log("\n🎯 Testing comprehensive instance recommendations...");

    const recommendationScenarios = [
      {
        interests: ["technology", "programming"],
        language: "en",
        description: "Tech interests",
      },
      {
        interests: ["art", "photography"],
        language: "en",
        description: "Creative interests",
      },
      {
        interests: [],
        language: "en",
        description: "Empty interests (should handle gracefully)",
      },
    ];

    for (const scenario of recommendationScenarios) {
      try {
        const _result = await client.callTool({
          name: "recommend-instances",
          arguments: {
            interests: scenario.interests,
            language: scenario.language,
          },
        });
        console.log(`✅ Got recommendations: ${scenario.description}`);
      } catch (error) {
        console.log(
          `❌ Failed recommendations ${scenario.description}: ${error.message}`,
        );
      }
    }

    // Test 5: Comprehensive search scenarios
    console.log("\n🔍 Testing comprehensive search scenarios...");

    const searchScenarios = [
      {
        domain: "mastodon.social",
        query: "ActivityPub",
        description: "ActivityPub search",
      },
      {
        domain: "mastodon.social",
        query: "fediverse",
        description: "Fediverse search",
      },
      {
        domain: "invalid-domain.example",
        query: "test",
        description: "Invalid domain search",
      },
    ];

    for (const scenario of searchScenarios) {
      try {
        const _result = await client.callTool({
          name: "search-instance",
          arguments: {
            domain: scenario.domain,
            query: scenario.query,
          },
        });
        console.log(`✅ Search completed: ${scenario.description}`);
      } catch (error) {
        console.log(
          `❌ Search failed ${scenario.description}: ${error.message}`,
        );
      }
    }

    // Test 6: Comprehensive instance info scenarios
    console.log("\n📊 Testing comprehensive instance info scenarios...");

    const infoScenarios = [
      { domain: "mastodon.social", description: "Mastodon flagship" },
      { domain: "fosstodon.org", description: "FOSS community" },
      { domain: "invalid-domain.example", description: "Invalid domain" },
    ];

    for (const scenario of infoScenarios) {
      try {
        const _result = await client.callTool({
          name: "get-instance-info",
          arguments: {
            domain: scenario.domain,
          },
        });
        console.log(`✅ Got instance info: ${scenario.description}`);
      } catch (error) {
        console.log(
          `❌ Failed instance info ${scenario.description}: ${error.message}`,
        );
      }
    }

    // Test 7: Comprehensive health check scenarios
    console.log("\n🏥 Testing comprehensive health check scenarios...");

    const healthScenarios = [
      { detailed: true, description: "Detailed health check" },
      { detailed: false, description: "Basic health check" },
      { description: "Default health check" },
    ];

    for (const scenario of healthScenarios) {
      try {
        const args =
          scenario.detailed !== undefined
            ? { detailed: scenario.detailed }
            : {};
        const _result = await client.callTool({
          name: "health-check",
          arguments: args,
        });
        console.log(`✅ Health check completed: ${scenario.description}`);
      } catch (error) {
        console.log(
          `❌ Health check failed ${scenario.description}: ${error.message}`,
        );
      }
    }

    // Test 8: Comprehensive performance metrics scenarios
    console.log("\n📈 Testing comprehensive performance metrics scenarios...");

    const metricsScenarios = [
      { operation: "discover-actor", description: "Actor discovery metrics" },
      { operation: "fetch-timeline", description: "Timeline fetch metrics" },
      { description: "Overall metrics" },
    ];

    for (const scenario of metricsScenarios) {
      try {
        const args = scenario.operation
          ? { operation: scenario.operation }
          : {};
        const _result = await client.callTool({
          name: "performance-metrics",
          arguments: args,
        });
        console.log(`✅ Performance metrics: ${scenario.description}`);
      } catch (error) {
        console.log(
          `❌ Performance metrics failed ${scenario.description}: ${error.message}`,
        );
      }
    }

    // Test 9: Comprehensive resource testing
    console.log("\n📚 Testing comprehensive resource scenarios...");

    const resourceScenarios = [
      { uri: "activitypub://server-info", description: "Server info" },
      {
        uri: "activitypub://remote-actor/gargron@mastodon.social",
        description: "Remote actor",
      },
      {
        uri: "activitypub://remote-timeline/gargron@mastodon.social",
        description: "Remote timeline",
      },
      {
        uri: "activitypub://instance-info/mastodon.social",
        description: "Instance info",
      },
      {
        uri: "activitypub://remote-followers/gargron@mastodon.social",
        description: "Remote followers",
      },
      {
        uri: "activitypub://remote-following/gargron@mastodon.social",
        description: "Remote following",
      },
      {
        uri: "activitypub://invalid-resource/test",
        description: "Invalid resource",
      },
    ];

    for (const scenario of resourceScenarios) {
      try {
        const _result = await client.readResource({
          uri: scenario.uri,
        });
        // For invalid resources, we expect an error, so success here is unexpected
        if (scenario.description === "Invalid resource") {
          console.log(
            `❌ Resource read unexpectedly succeeded: ${scenario.description}`,
          );
        } else {
          console.log(`✅ Resource read: ${scenario.description}`);
        }
      } catch (error) {
        // For invalid resources, errors are expected
        if (scenario.description === "Invalid resource") {
          console.log(
            `✅ Resource correctly rejected: ${scenario.description}`,
          );
        } else {
          console.log(
            `❌ Resource read failed ${scenario.description}: ${error.message}`,
          );
        }
      }
    }

    // Test 10: Comprehensive prompt testing
    console.log("\n💭 Testing comprehensive prompt scenarios...");

    const promptScenarios = [
      {
        name: "explore-fediverse",
        arguments: { interests: "technology", instanceType: "mastodon" },
        description: "Fediverse exploration",
      },
      {
        name: "compare-instances",
        arguments: {
          instances: "mastodon.social, fosstodon.org",
          criteria: "community",
        },
        description: "Instance comparison",
      },
      {
        name: "discover-content",
        arguments: {
          topics: "ActivityPub, fediverse",
          contentType: "all",
        },
        description: "Content discovery",
      },
      {
        name: "invalid-prompt",
        arguments: { test: "value" },
        description: "Invalid prompt",
      },
    ];

    for (const scenario of promptScenarios) {
      try {
        const _result = await client.getPrompt({
          name: scenario.name,
          arguments: scenario.arguments,
        });
        // For invalid prompts, we expect an error, so success here is unexpected
        if (scenario.description === "Invalid prompt") {
          console.log(
            `❌ Prompt unexpectedly succeeded: ${scenario.description}`,
          );
        } else {
          console.log(`✅ Prompt generated: ${scenario.description}`);
        }
      } catch (error) {
        // For invalid prompts, errors are expected
        if (scenario.description === "Invalid prompt") {
          console.log(`✅ Prompt correctly rejected: ${scenario.description}`);
        } else {
          console.log(
            `❌ Prompt failed ${scenario.description}: ${error.message}`,
          );
        }
      }
    }

    // Test 11: Concurrent operations stress test
    console.log("\n⚡ Testing concurrent operations...");

    const concurrentPromises = [];

    // Concurrent actor discoveries
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

    // Concurrent resource reads
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
    const successes = results.filter((r) => !r.error);
    const errors = results.filter((r) => r.error);

    console.log(
      `✅ Concurrent operations completed: ${successes.length} successes, ${errors.length} errors`,
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
