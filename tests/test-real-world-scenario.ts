import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Real-world scenario test for ActivityPub MCP Server
 * This test simulates comprehensive fediverse exploration and discovery
 * using the existing read-only client functionality
 */

interface ActorDiscovery {
  identifier: string;
  name: string;
  description: string;
  role: string;
}

interface InstanceInfo {
  domain: string;
  description: string;
  expectedSoftware?: string;
}

interface SearchQuery {
  domain: string;
  query: string;
  description: string;
}

interface TestMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalDuration: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  errorBreakdown: Record<string, number>;
}

class RealWorldScenarioTest {
  private client: Client;
  private transport: StdioClientTransport;
  private metrics: TestMetrics;
  private responseTimes: number[];

  // Test data representing realistic fediverse exploration
  private actorsToDiscover: ActorDiscovery[] = [
    {
      identifier: "gargron@mastodon.social",
      name: "Eugen Rochko",
      description: "Founder of Mastodon",
      role: "Developer",
    },
    {
      identifier: "Mastodon@mastodon.social",
      name: "Mastodon",
      description: "Official Mastodon account",
      role: "Organization",
    },
  ];

  private instancesToExplore: InstanceInfo[] = [
    {
      domain: "mastodon.social",
      description: "Flagship Mastodon instance",
      expectedSoftware: "mastodon",
    },
    {
      domain: "fosstodon.org",
      description: "FOSS community instance",
      expectedSoftware: "mastodon",
    },
  ];

  private searchQueries: SearchQuery[] = [
    {
      domain: "mastodon.social",
      query: "ActivityPub",
      description: "Search for ActivityPub content",
    },
    {
      domain: "mastodon.social",
      query: "fediverse",
      description: "Search for fediverse discussions",
    },
  ];

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
      totalDuration: 0,
      averageResponseTime: 0,
      minResponseTime: Number.MAX_VALUE,
      maxResponseTime: 0,
      errorBreakdown: {},
    };

    this.responseTimes = [];
  }

  private async executeTimedOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
  ): Promise<{
    success: boolean;
    result?: T;
    error?: Error;
    duration: number;
  }> {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    try {
      console.log(`🔄 ${operationName}...`);
      const result = await operation();
      const duration = Date.now() - startTime;

      this.responseTimes.push(duration);
      this.metrics.successfulOperations++;
      this.updateResponseTimeMetrics(duration);

      console.log(`✅ ${operationName} completed in ${duration}ms`);
      return { success: true, result, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);
      this.metrics.failedOperations++;
      this.updateResponseTimeMetrics(duration);

      const errorType =
        error instanceof Error ? error.constructor.name : "Unknown";
      this.metrics.errorBreakdown[errorType] =
        (this.metrics.errorBreakdown[errorType] || 0) + 1;

      console.log(
        `❌ ${operationName} failed in ${duration}ms: ${error instanceof Error ? error.message : error}`,
      );
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
      };
    }
  }

  private updateResponseTimeMetrics(duration: number): void {
    this.metrics.minResponseTime = Math.min(
      this.metrics.minResponseTime,
      duration,
    );
    this.metrics.maxResponseTime = Math.max(
      this.metrics.maxResponseTime,
      duration,
    );
    this.metrics.averageResponseTime =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  async run(): Promise<void> {
    console.log(
      "🌐 STARTING COMPREHENSIVE REAL-WORLD FEDIVERSE EXPLORATION SCENARIO",
    );
    console.log("=".repeat(80));

    const overallStartTime = Date.now();

    try {
      // Connect to MCP server
      await this.executeTimedOperation("Connect to MCP Server", () =>
        this.client.connect(this.transport),
      );

      // Phase 1: Discover fediverse instances
      console.log("\n📡 Phase 1: Discovering Fediverse Instances");
      await this.discoverInstances();

      // Phase 2: Explore specific actors
      console.log("\n👤 Phase 2: Discovering Notable Actors");
      await this.discoverActors();

      // Phase 3: Fetch timelines and content
      console.log("\n📰 Phase 3: Fetching Timelines and Content");
      await this.fetchTimelines();

      // Phase 4: Search for content
      console.log("\n🔍 Phase 4: Searching for Content");
      await this.searchContent();

      // Phase 5: Test MCP resources
      console.log("\n📚 Phase 5: Testing MCP Resources");
      await this.testResources();

      // Phase 6: Test MCP prompts
      console.log("\n💭 Phase 6: Testing MCP Prompts");
      await this.testPrompts();

      // Phase 7: Performance and stress testing
      console.log("\n⚡ Phase 7: Performance Testing");
      await this.performanceTests();

      this.metrics.totalDuration = Date.now() - overallStartTime;
      this.printFinalReport();
    } catch (error) {
      console.error("❌ Real-world scenario test failed:", error);
      throw error;
    } finally {
      try {
        await this.client.close();
        console.log("🧹 Disconnected from MCP server");
      } catch (error) {
        console.error("Error disconnecting:", error);
      }
    }
  }

  private async discoverInstances(): Promise<void> {
    // Test discover-instances tool
    await this.executeTimedOperation("Discover Fediverse Instances", () =>
      this.client.callTool({
        name: "discover-instances",
        arguments: {
          criteria: "popular",
          limit: 10,
        },
      }),
    );

    // Test recommend-instances tool
    await this.executeTimedOperation("Get Instance Recommendations", () =>
      this.client.callTool({
        name: "recommend-instances",
        arguments: {
          interests: ["technology", "programming", "open source"],
          language: "en",
        },
      }),
    );

    // Get detailed info for specific instances
    for (const instance of this.instancesToExplore) {
      await this.executeTimedOperation(
        `Get Instance Info: ${instance.domain}`,
        () =>
          this.client.callTool({
            name: "get-instance-info",
            arguments: {
              domain: instance.domain,
            },
          }),
      );
    }
  }

  private async discoverActors(): Promise<void> {
    for (const actor of this.actorsToDiscover) {
      await this.executeTimedOperation(`Discover Actor: ${actor.name}`, () =>
        this.client.callTool({
          name: "discover-actor",
          arguments: {
            identifier: actor.identifier,
          },
        }),
      );
    }
  }

  private async fetchTimelines(): Promise<void> {
    for (const actor of this.actorsToDiscover) {
      await this.executeTimedOperation(`Fetch Timeline: ${actor.name}`, () =>
        this.client.callTool({
          name: "fetch-timeline",
          arguments: {
            identifier: actor.identifier,
            limit: 10,
          },
        }),
      );
    }
  }

  private async searchContent(): Promise<void> {
    for (const search of this.searchQueries) {
      await this.executeTimedOperation(`Search: ${search.description}`, () =>
        this.client.callTool({
          name: "search-instance",
          arguments: {
            domain: search.domain,
            query: search.query,
          },
        }),
      );
    }
  }

  private async testResources(): Promise<void> {
    // Test server-info resource
    await this.executeTimedOperation("Read Server Info Resource", () =>
      this.client.readResource({
        uri: "activitypub://server-info",
      }),
    );

    // Test remote actor resources
    for (const actor of this.actorsToDiscover) {
      await this.executeTimedOperation(
        `Read Remote Actor Resource: ${actor.name}`,
        () =>
          this.client.readResource({
            uri: `activitypub://remote-actor/${actor.identifier}`,
          }),
      );
    }

    // Test instance info resources
    for (const instance of this.instancesToExplore) {
      await this.executeTimedOperation(
        `Read Instance Info Resource: ${instance.domain}`,
        () =>
          this.client.readResource({
            uri: `activitypub://instance-info/${instance.domain}`,
          }),
      );
    }
  }

  private async testPrompts(): Promise<void> {
    // Test explore-fediverse prompt
    await this.executeTimedOperation(
      "Generate Fediverse Exploration Prompt",
      () =>
        this.client.getPrompt({
          name: "explore-fediverse",
          arguments: {
            interests: "decentralized social media and ActivityPub",
            instanceType: "mastodon",
          },
        }),
    );

    // Test compare-instances prompt
    await this.executeTimedOperation(
      "Generate Instance Comparison Prompt",
      () =>
        this.client.getPrompt({
          name: "compare-instances",
          arguments: {
            instances: "mastodon.social, fosstodon.org",
            criteria: "community focus and moderation policies",
          },
        }),
    );

    // Test discover-content prompt
    await this.executeTimedOperation("Generate Content Discovery Prompt", () =>
      this.client.getPrompt({
        name: "discover-content",
        arguments: {
          topics: "ActivityPub, fediverse, decentralization",
          contentType: "all",
        },
      }),
    );
  }

  private async performanceTests(): Promise<void> {
    console.log("\n🚀 Running concurrent operations test...");

    const concurrentPromises = [];

    // Test concurrent actor discoveries
    for (let i = 0; i < 5; i++) {
      concurrentPromises.push(
        this.executeTimedOperation(`Concurrent Actor Discovery ${i + 1}`, () =>
          this.client.callTool({
            name: "discover-actor",
            arguments: {
              identifier: "gargron@mastodon.social",
            },
          }),
        ),
      );
    }

    // Test concurrent resource reads
    for (let i = 0; i < 5; i++) {
      concurrentPromises.push(
        this.executeTimedOperation(`Concurrent Resource Read ${i + 1}`, () =>
          this.client.readResource({
            uri: "activitypub://server-info",
          }),
        ),
      );
    }

    const results = await Promise.all(concurrentPromises);
    const successes = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success).length;

    console.log(
      `✅ Concurrent operations completed: ${successes} successes, ${failures} failures`,
    );
  }

  private printFinalReport(): void {
    console.log(`\n${"=".repeat(80)}`);
    console.log("📊 COMPREHENSIVE REAL-WORLD TEST SCENARIO COMPLETED!");
    console.log("=".repeat(80));

    const p95Index = Math.floor(this.responseTimes.length * 0.95);
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const p95ResponseTime = sortedTimes[p95Index] || 0;

    console.log("📊 TEST METRICS SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total Test Duration: ${this.metrics.totalDuration}ms`);
    console.log(`Total Operations: ${this.metrics.totalOperations}`);
    console.log(`Successful Operations: ${this.metrics.successfulOperations}`);
    console.log(`Failed Operations: ${this.metrics.failedOperations}`);
    console.log(
      `Success Rate: ${((this.metrics.successfulOperations / this.metrics.totalOperations) * 100).toFixed(2)}%`,
    );
    console.log(
      `Average Response Time: ${this.metrics.averageResponseTime.toFixed(2)}ms`,
    );
    console.log(`95th Percentile Response Time: ${p95ResponseTime}ms`);
    console.log(
      `Min Response Time: ${this.metrics.minResponseTime === Number.MAX_VALUE ? 0 : this.metrics.minResponseTime}ms`,
    );
    console.log(`Max Response Time: ${this.metrics.maxResponseTime}ms`);

    if (Object.keys(this.metrics.errorBreakdown).length > 0) {
      console.log("\nError Breakdown:");
      for (const [errorType, count] of Object.entries(
        this.metrics.errorBreakdown,
      )) {
        console.log(`  ${errorType}: ${count}`);
      }
    }
    console.log("=".repeat(50));

    console.log(
      "\n✅ Real-world fediverse exploration scenario completed successfully!",
    );
  }
}

// Run the test
async function runRealWorldScenario() {
  const test = new RealWorldScenarioTest();
  await test.run();
}

runRealWorldScenario().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
