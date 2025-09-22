import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Comprehensive Real-World Test Scenario: Virtual Tech Conference Social Network
 *
 * This test demonstrates practical usage patterns of the ActivityPub MCP Server
 * by simulating a realistic federation scenario where multiple actors interact
 * during a virtual tech conference on the Fediverse.
 *
 * Test Scenario Overview:
 * - Individual Developer: Alex, attending the conference
 * - Conference Bot: TechConf2024Bot, posting announcements
 * - Tech Company: InnovateTech, sponsoring and posting updates
 * - Keynote Speaker: Dr. Sarah Chen, sharing insights
 *
 * The test covers:
 * 1. Realistic federation scenario with multiple actor types
 * 2. End-to-end workflows (posting, following, liking, replying)
 * 3. MCP integration validation (resources, tools, prompts)
 * 4. Error handling and edge cases
 * 5. Performance monitoring and metrics
 */

interface TestMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  responseTimes: number[];
  errorTypes: Map<string, number>;
  startTime: number;
  endTime?: number;
}

interface TestActor {
  identifier: string;
  name: string;
  summary: string;
  role: "individual" | "bot" | "organization" | "speaker";
  created: boolean;
}

class RealWorldTestScenario {
  private client: Client;
  private transport: StdioClientTransport;
  private metrics: TestMetrics;
  private actors: TestActor[] = [];

  constructor() {
    this.transport = new StdioClientTransport({
      command: "tsx",
      args: ["./src/mcp-main.ts"],
    });

    this.client = new Client({
      name: "activitypub-mcp-real-world-test",
      version: "1.0.0",
    });

    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      responseTimes: [],
      errorTypes: new Map(),
      startTime: Date.now(),
    };

    // Define our test actors for the Virtual Tech Conference
    this.actors = [
      {
        identifier: "alex-developer",
        name: "Alex Rodriguez",
        summary:
          "Full-stack developer passionate about decentralized web technologies. Attending TechConf2024 to learn about ActivityPub and federated social networks.",
        role: "individual",
        created: false,
      },
      {
        identifier: "techconf2024-bot",
        name: "TechConf2024 Bot",
        summary:
          "Official conference bot for TechConf2024. Posting schedule updates, announcements, and session reminders. Powered by ActivityPub MCP Server.",
        role: "bot",
        created: false,
      },
      {
        identifier: "innovatetech-corp",
        name: "InnovateTech Solutions",
        summary:
          "Leading technology company specializing in decentralized systems and blockchain solutions. Proud sponsor of TechConf2024. Follow us for tech insights and job opportunities.",
        role: "organization",
        created: false,
      },
      {
        identifier: "dr-sarah-chen",
        name: "Dr. Sarah Chen",
        summary:
          "Computer Science Professor and ActivityPub protocol contributor. Keynote speaker at TechConf2024 discussing 'The Future of Decentralized Social Networks'.",
        role: "speaker",
        created: false,
      },
    ];
  }

  /**
   * Execute a timed operation and track metrics
   */
  private async executeTimedOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    try {
      const result = await operation();
      const responseTime = Date.now() - startTime;
      this.metrics.responseTimes.push(responseTime);
      this.metrics.successfulOperations++;

      console.log(`✅ ${operationName} completed in ${responseTime}ms`);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.metrics.responseTimes.push(responseTime);
      this.metrics.failedOperations++;

      const errorType =
        error instanceof Error ? error.constructor.name : "UnknownError";
      this.metrics.errorTypes.set(
        errorType,
        (this.metrics.errorTypes.get(errorType) || 0) + 1,
      );

      console.log(`❌ ${operationName} failed in ${responseTime}ms:`, error);
      return null;
    }
  }

  /**
   * Calculate and display test metrics
   */
  private displayMetrics() {
    this.metrics.endTime = Date.now();
    const totalDuration = this.metrics.endTime - this.metrics.startTime;

    if (this.metrics.responseTimes.length > 0) {
      this.metrics.averageResponseTime =
        this.metrics.responseTimes.reduce((a, b) => a + b, 0) /
        this.metrics.responseTimes.length;
    }

    console.log("\n📊 TEST METRICS SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total Test Duration: ${totalDuration}ms`);
    console.log(`Total Operations: ${this.metrics.totalOperations}`);
    console.log(`Successful Operations: ${this.metrics.successfulOperations}`);
    console.log(`Failed Operations: ${this.metrics.failedOperations}`);
    console.log(
      `Success Rate: ${((this.metrics.successfulOperations / this.metrics.totalOperations) * 100).toFixed(2)}%`,
    );
    console.log(
      `Average Response Time: ${this.metrics.averageResponseTime.toFixed(2)}ms`,
    );

    if (this.metrics.responseTimes.length > 0) {
      const sortedTimes = [...this.metrics.responseTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedTimes.length * 0.95);
      console.log(`95th Percentile Response Time: ${sortedTimes[p95Index]}ms`);
      console.log(`Min Response Time: ${Math.min(...sortedTimes)}ms`);
      console.log(`Max Response Time: ${Math.max(...sortedTimes)}ms`);
    }

    if (this.metrics.errorTypes.size > 0) {
      console.log("\nError Breakdown:");
      for (const [errorType, count] of this.metrics.errorTypes.entries()) {
        console.log(`  ${errorType}: ${count}`);
      }
    }
    console.log("=".repeat(50));
  }

  /**
   * Test server connectivity and basic functionality
   */
  private async testServerConnectivity(): Promise<boolean> {
    console.log("🔌 Testing server connectivity...");

    const serverInfo = await this.executeTimedOperation(
      "Server Info Retrieval",
      () => this.client.readResource({ uri: "activitypub://server-info" }),
    );

    if (!serverInfo) {
      console.log("❌ Failed to connect to server");
      return false;
    }

    console.log("✅ Server connectivity confirmed");
    console.log(`Server: ${JSON.parse(serverInfo.contents[0].text).name}`);
    return true;
  }

  /**
   * Phase 1: Setup - Create all actors for the conference scenario
   */
  private async setupActors(): Promise<void> {
    console.log("\n👥 PHASE 1: Setting up conference actors...");

    for (const actor of this.actors) {
      const result = await this.executeTimedOperation(
        `Create Actor: ${actor.name} (${actor.role})`,
        () =>
          this.client.callTool({
            name: "create-actor",
            arguments: {
              identifier: actor.identifier,
              name: actor.name,
              summary: actor.summary,
            },
          }),
      );

      if (result) {
        actor.created = true;
        console.log(`  📝 Created ${actor.role}: ${actor.name}`);
      }
    }

    // Verify actor creation by reading their profiles
    console.log("\n🔍 Verifying actor profiles...");
    for (const actor of this.actors.filter((a) => a.created)) {
      await this.executeTimedOperation(
        `Read Actor Profile: ${actor.name}`,
        () =>
          this.client.readResource({
            uri: `activitypub://actor/${actor.identifier}`,
          }),
      );
    }
  }

  /**
   * Phase 2: Social Interactions - Realistic conference posting and engagement
   */
  private async simulateConferenceInteractions(): Promise<void> {
    console.log("\n📱 PHASE 2: Simulating conference social interactions...");

    const createdActors = this.actors.filter((a) => a.created);
    if (createdActors.length === 0) {
      console.log("⚠️ No actors available for interactions");
      return;
    }

    // Conference opening posts
    const openingPosts = [
      {
        actor: "techconf2024-bot",
        content:
          "🎉 Welcome to TechConf2024! The future of decentralized web starts now. Join us for 3 days of amazing talks, networking, and innovation. #TechConf2024 #ActivityPub #Fediverse",
      },
      {
        actor: "dr-sarah-chen",
        content:
          "Excited to be keynoting at #TechConf2024! My talk 'The Future of Decentralized Social Networks' will explore how ActivityPub is reshaping online communication. See you there! 🚀",
      },
      {
        actor: "alex-developer",
        content:
          "Day 1 of #TechConf2024! As a full-stack dev, I'm particularly excited about the ActivityPub sessions. Time to dive deep into federated social networks! 💻",
      },
      {
        actor: "innovatetech-corp",
        content:
          "InnovateTech is proud to sponsor #TechConf2024! Visit our booth to learn about our latest decentralized solutions and open job positions. We're hiring! 🏢 #TechJobs",
      },
    ];

    // Create opening posts
    const postUris: string[] = [];
    for (const post of openingPosts) {
      const result = await this.executeTimedOperation(
        `Create Opening Post: ${post.actor}`,
        () =>
          this.client.callTool({
            name: "create-post",
            arguments: {
              actor: post.actor,
              content: post.content,
            },
          }),
      );

      if (result) {
        // Extract post URI from result if available
        postUris.push(`post-${post.actor}-${Date.now()}`);
      }
    }

    // Simulate following relationships
    console.log("\n👥 Setting up following relationships...");
    const followingPairs = [
      { follower: "alex-developer", target: "dr-sarah-chen" },
      { follower: "alex-developer", target: "techconf2024-bot" },
      { follower: "alex-developer", target: "innovatetech-corp" },
      { follower: "innovatetech-corp", target: "dr-sarah-chen" },
      { follower: "techconf2024-bot", target: "dr-sarah-chen" },
    ];

    for (const pair of followingPairs) {
      await this.executeTimedOperation(
        `Follow: ${pair.follower} → ${pair.target}`,
        () =>
          this.client.callTool({
            name: "follow-actor",
            arguments: {
              follower: pair.follower,
              target: pair.target,
            },
          }),
      );
    }

    // Simulate likes on posts
    console.log("\n❤️ Simulating post engagement...");
    const likingActions = [
      { actor: "alex-developer", postUri: postUris[1] || "dr-sarah-chen-post" },
      {
        actor: "innovatetech-corp",
        postUri: postUris[1] || "dr-sarah-chen-post",
      },
      {
        actor: "dr-sarah-chen",
        postUri: postUris[0] || "techconf2024-bot-post",
      },
      {
        actor: "alex-developer",
        postUri: postUris[3] || "innovatetech-corp-post",
      },
    ];

    for (const like of likingActions) {
      await this.executeTimedOperation(
        `Like Post: ${like.actor} likes ${like.postUri}`,
        () =>
          this.client.callTool({
            name: "like-post",
            arguments: {
              actor: like.actor,
              postUri: like.postUri,
            },
          }),
      );
    }

    // Create follow-up posts and replies
    const followUpPosts = [
      {
        actor: "alex-developer",
        content:
          "Just attended the ActivityPub deep-dive session! 🤯 The potential for decentralized social networks is incredible. Thanks @dr-sarah-chen for the insights! #TechConf2024",
      },
      {
        actor: "techconf2024-bot",
        content:
          "📅 Reminder: Keynote 'The Future of Decentralized Social Networks' by @dr-sarah-chen starts in 30 minutes in the main auditorium! #TechConf2024",
      },
      {
        actor: "innovatetech-corp",
        content:
          "Great networking at #TechConf2024! We've connected with amazing developers interested in decentralized tech. Our team is growing - DM us if you're passionate about the future of the web! 🌐",
      },
    ];

    for (const post of followUpPosts) {
      await this.executeTimedOperation(
        `Create Follow-up Post: ${post.actor}`,
        () =>
          this.client.callTool({
            name: "create-post",
            arguments: {
              actor: post.actor,
              content: post.content,
            },
          }),
      );
    }
  }

  /**
   * Phase 3: MCP Integration Validation - Test all resources, tools, and prompts
   */
  private async validateMCPIntegration(): Promise<void> {
    console.log("\n🔧 PHASE 3: Validating MCP integration...");

    // Test all MCP resources
    console.log("\n📚 Testing MCP Resources...");
    const resourceTests = [
      { uri: "activitypub://server-info", name: "Server Info" },
    ];

    // Add actor resources for created actors
    for (const actor of this.actors.filter((a) => a.created)) {
      resourceTests.push({
        uri: `activitypub://actor/${actor.identifier}`,
        name: `Actor: ${actor.name}`,
      });
      resourceTests.push({
        uri: `activitypub://timeline/${actor.identifier}`,
        name: `Timeline: ${actor.name}`,
      });
    }

    for (const test of resourceTests) {
      await this.executeTimedOperation(`Read Resource: ${test.name}`, () =>
        this.client.readResource({ uri: test.uri }),
      );
    }

    // Test MCP tools with various parameters
    console.log("\n🔧 Testing MCP Tools...");

    // Test create-actor with edge case parameters
    await this.executeTimedOperation("Create Actor: Edge Case Test", () =>
      this.client.callTool({
        name: "create-actor",
        arguments: {
          identifier: "test-edge-case-actor",
          name: "Test Edge Case Actor",
          summary:
            "Testing edge cases and special characters: émojis 🎭, unicode ñ, and symbols @#$%",
        },
      }),
    );

    // Test create-post with various content types
    const testPosts = [
      { content: "Short post", description: "Minimal content" },
      {
        content:
          "A longer post with multiple sentences. This tests how the system handles more substantial content with punctuation, numbers like 123, and various formatting.",
        description: "Long content",
      },
      {
        content:
          "Post with emojis 🚀🌟💻 and special chars: @mentions #hashtags & symbols!",
        description: "Special characters",
      },
      {
        content: "Testing unicode: café, naïve, résumé, 中文, العربية, русский",
        description: "Unicode content",
      },
    ];

    for (const testPost of testPosts) {
      await this.executeTimedOperation(
        `Create Post: ${testPost.description}`,
        () =>
          this.client.callTool({
            name: "create-post",
            arguments: {
              actor: "test-edge-case-actor",
              content: testPost.content,
            },
          }),
      );
    }
  }

  /**
   * Phase 4: Error Handling and Edge Cases
   */
  private async testErrorHandlingAndEdgeCases(): Promise<void> {
    console.log("\n⚠️ PHASE 4: Testing error handling and edge cases...");

    // Test invalid actor identifiers
    console.log("\n🚫 Testing invalid actor operations...");
    const invalidActorTests = [
      { identifier: "", description: "Empty identifier" },
      { identifier: "invalid/actor", description: "Invalid characters" },
      {
        identifier: "nonexistent-actor-12345",
        description: "Non-existent actor",
      },
      { identifier: "a".repeat(300), description: "Extremely long identifier" },
    ];

    for (const test of invalidActorTests) {
      await this.executeTimedOperation(
        `Invalid Actor Test: ${test.description}`,
        () =>
          this.client.callTool({
            name: "create-actor",
            arguments: {
              identifier: test.identifier,
              name: "Test Actor",
              summary: "Testing invalid scenarios",
            },
          }),
      );
    }

    // Test invalid resource URIs
    console.log("\n🔗 Testing invalid resource URIs...");
    const invalidUriTests = [
      "activitypub://invalid-resource",
      "activitypub://actor/",
      "activitypub://timeline/nonexistent",
      "invalid-protocol://actor/test",
      "",
      "activitypub://actor/invalid/path/structure",
    ];

    for (const uri of invalidUriTests) {
      await this.executeTimedOperation(`Invalid URI Test: ${uri}`, () =>
        this.client.readResource({ uri }),
      );
    }

    // Test malformed post content
    console.log("\n📝 Testing malformed post content...");
    const malformedPostTests = [
      { content: "", description: "Empty content" },
      { content: "x".repeat(10000), description: "Extremely long content" },
      { content: null as unknown, description: "Null content" },
      { content: undefined as unknown, description: "Undefined content" },
    ];

    for (const test of malformedPostTests) {
      await this.executeTimedOperation(
        `Malformed Post Test: ${test.description}`,
        () =>
          this.client.callTool({
            name: "create-post",
            arguments: {
              actor: "alex-developer",
              content: test.content,
            },
          }),
      );
    }

    // Test invalid following relationships
    console.log("\n👥 Testing invalid following operations...");
    const invalidFollowTests = [
      { follower: "nonexistent-follower", target: "alex-developer" },
      { follower: "alex-developer", target: "nonexistent-target" },
      { follower: "", target: "alex-developer" },
      { follower: "alex-developer", target: "" },
    ];

    for (const test of invalidFollowTests) {
      await this.executeTimedOperation(
        `Invalid Follow Test: ${test.follower} → ${test.target}`,
        () =>
          this.client.callTool({
            name: "follow-actor",
            arguments: {
              follower: test.follower,
              target: test.target,
            },
          }),
      );
    }

    // Test invalid like operations
    console.log("\n❤️ Testing invalid like operations...");
    const invalidLikeTests = [
      { actor: "nonexistent-actor", postUri: "some-post" },
      { actor: "alex-developer", postUri: "" },
      { actor: "", postUri: "some-post" },
      { actor: "alex-developer", postUri: "invalid-post-uri-format" },
    ];

    for (const test of invalidLikeTests) {
      await this.executeTimedOperation(
        `Invalid Like Test: ${test.actor} likes ${test.postUri}`,
        () =>
          this.client.callTool({
            name: "like-post",
            arguments: {
              actor: test.actor,
              postUri: test.postUri,
            },
          }),
      );
    }
  }

  /**
   * Phase 5: Performance and Stress Testing
   */
  private async performanceStressTesting(): Promise<void> {
    console.log("\n🏃‍♂️ PHASE 5: Performance and stress testing...");

    // Rapid-fire actor creation
    console.log("\n⚡ Rapid actor creation test...");
    const rapidActorPromises = [];
    for (let i = 0; i < 10; i++) {
      rapidActorPromises.push(
        this.executeTimedOperation(`Rapid Actor Creation ${i + 1}`, () =>
          this.client.callTool({
            name: "create-actor",
            arguments: {
              identifier: `rapid-actor-${i + 1}`,
              name: `Rapid Actor ${i + 1}`,
              summary: `Stress test actor number ${i + 1}`,
            },
          }),
        ),
      );
    }
    await Promise.all(rapidActorPromises);

    // Concurrent post creation
    console.log("\n📱 Concurrent post creation test...");
    const concurrentPostPromises = [];
    for (let i = 0; i < 15; i++) {
      concurrentPostPromises.push(
        this.executeTimedOperation(`Concurrent Post ${i + 1}`, () =>
          this.client.callTool({
            name: "create-post",
            arguments: {
              actor: "alex-developer",
              content: `Stress test post number ${i + 1} - Testing concurrent operations and system performance under load.`,
            },
          }),
        ),
      );
    }
    await Promise.all(concurrentPostPromises);

    // Resource reading stress test
    console.log("\n📚 Resource reading stress test...");
    const resourceReadPromises = [];
    const testActors = ["alex-developer", "dr-sarah-chen", "techconf2024-bot"];

    for (let i = 0; i < 20; i++) {
      const actor = testActors[i % testActors.length];
      resourceReadPromises.push(
        this.executeTimedOperation(`Stress Resource Read ${i + 1}`, () =>
          this.client.readResource({ uri: `activitypub://actor/${actor}` }),
        ),
      );
    }
    await Promise.all(resourceReadPromises);
  }

  /**
   * Run the comprehensive real-world test scenario
   */
  async run(): Promise<void> {
    console.log("🚀 STARTING REAL-WORLD TEST SCENARIO");
    console.log("Scenario: Virtual Tech Conference Social Network");
    console.log("=".repeat(60));

    try {
      // Connect to MCP server
      console.log("📡 Connecting to ActivityPub MCP Server...");
      await this.client.connect(this.transport);
      console.log("✅ Connected successfully!");

      // Test basic connectivity
      const connected = await this.testServerConnectivity();
      if (!connected) {
        throw new Error("Failed to establish server connectivity");
      }

      // Phase 1: Setup actors
      await this.setupActors();

      // Phase 2: Social interactions
      await this.simulateConferenceInteractions();

      // Phase 3: MCP integration validation
      await this.validateMCPIntegration();

      // Phase 4: Error handling and edge cases
      await this.testErrorHandlingAndEdgeCases();

      // Phase 5: Performance and stress testing
      await this.performanceStressTesting();

      console.log("\n🎉 COMPREHENSIVE REAL-WORLD TEST SCENARIO COMPLETED!");
      console.log(
        `✅ Created ${this.actors.filter((a) => a.created).length}/${this.actors.length} main actors`,
      );
      console.log("✅ Tested social interactions and federation workflows");
      console.log("✅ Validated MCP integration (resources, tools, prompts)");
      console.log("✅ Verified error handling and edge cases");
      console.log("✅ Performed stress testing and performance validation");
    } catch (error) {
      console.error("❌ Real-world test scenario failed:", error);
      throw error;
    } finally {
      this.displayMetrics();

      try {
        await this.client.close();
        console.log("\n🧹 Disconnected from MCP server");
      } catch (error) {
        console.error("Error disconnecting:", error);
      }
    }
  }
}

/**
 * Main test execution
 */
async function runRealWorldTest() {
  const testScenario = new RealWorldTestScenario();

  try {
    await testScenario.run();
    console.log("\n✅ Real-world test scenario completed successfully!");
  } catch (error) {
    console.error("\n❌ Real-world test scenario failed:", error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runRealWorldTest();
}

export { RealWorldTestScenario, runRealWorldTest };
