/**
 * MCP Prompt handlers for ActivityPub interactions.
 *
 * This module defines all MCP prompts that provide guided interactions
 * for exploring and discovering Fediverse content.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trackedMcpServer } from "./capabilities.js";

/**
 * Registers all MCP prompts on the server.
 *
 * @param mcpServer - The MCP server instance
 */
export function registerPrompts(mcpServer: McpServer): void {
  trackedMcpServer(mcpServer);

  // Discovery prompts
  registerExploreFediversePrompt(mcpServer);

  // Analysis prompts
  registerCompareAccountsPrompt(mcpServer);
  registerAnalyzeUserActivityPrompt(mcpServer);

  // Research prompts
  registerFindExpertsPrompt(mcpServer);
  registerSummarizeTrendingPrompt(mcpServer);
}

/**
 * Fediverse exploration prompt.
 */
function registerExploreFediversePrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "explore-fediverse",
    {
      title: "Explore the Fediverse",
      description: "Get guidance on exploring and discovering content in the fediverse",
      argsSchema: {
        interests: z
          .string()
          .min(1, "Interests cannot be empty")
          .max(500, "Interests too long")
          .describe("Your interests or topics you want to explore"),
        instanceType: z
          .enum(["mastodon", "pleroma", "misskey", "pixelfed", "peertube", "any"])
          .optional()
          .describe("Preferred type of fediverse instance"),
      },
    },
    ({ interests, instanceType }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I'm interested in exploring the fediverse, particularly content related to: ${interests}. ${instanceType && instanceType !== "any" ? `I prefer ${instanceType} instances.` : ""} Can you help me discover interesting actors, instances, and communities to follow? Please suggest specific usernames and instances I should check out.`,
          },
        },
      ],
    }),
  );
}

/**
 * Compare accounts prompt.
 */
function registerCompareAccountsPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "compare-accounts",
    {
      title: "Compare Fediverse Accounts",
      description: "Get help comparing different fediverse accounts side by side",
      argsSchema: {
        accounts: z
          .string()
          .min(1, "Accounts list cannot be empty")
          .max(500, "Accounts list too long")
          .describe(
            "Comma-separated list of account identifiers to compare (e.g., user1@mastodon.social, user2@fosstodon.org)",
          ),
        aspects: z
          .string()
          .min(1, "Aspects cannot be empty")
          .max(500, "Aspects too long")
          .optional()
          .describe("Specific aspects to compare (e.g., posting frequency, topics, engagement)"),
      },
    },
    ({ accounts, aspects }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please help me compare these fediverse accounts: ${accounts}. ${aspects ? `I'm particularly interested in comparing: ${aspects}.` : ""}

For each account, please analyze:
1. Their posting frequency and activity level
2. The topics and themes they discuss
3. Their engagement style (do they reply, boost, etc.)
4. Their follower/following ratio
5. Any notable characteristics

Please use the discover-actor and fetch-timeline tools to gather information about each account, then provide a comprehensive comparison.`,
          },
        },
      ],
    }),
  );
}

/**
 * Analyze user activity prompt.
 */
function registerAnalyzeUserActivityPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "analyze-user-activity",
    {
      title: "Analyze User Activity",
      description: "Get a detailed analysis of a fediverse user's activity and posting patterns",
      argsSchema: {
        identifier: z
          .string()
          .min(3, "Identifier too short")
          .max(320, "Identifier too long")
          .describe("Actor identifier (e.g., user@mastodon.social)"),
        depth: z
          .enum(["quick", "standard", "comprehensive"])
          .optional()
          .describe(
            "Analysis depth: quick (recent posts), standard (default), or comprehensive (full history)",
          ),
      },
    },
    ({ identifier, depth = "standard" }) => {
      let depthInstructions = "Analyze their recent 20 posts";
      if (depth === "quick") {
        depthInstructions = "Do a quick analysis of their 10 most recent posts";
      } else if (depth === "comprehensive") {
        depthInstructions = "Do a comprehensive analysis using up to 50 posts";
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please analyze the activity of this fediverse user: ${identifier}

${depthInstructions} and provide insights on:

1. **Posting Patterns**: When are they most active? How often do they post?
2. **Content Themes**: What topics do they discuss most frequently?
3. **Engagement Style**: Do they primarily post original content, reply to others, or boost content?
4. **Hashtag Usage**: What hashtags do they commonly use?
5. **Content Warnings**: Do they use content warnings? For what topics?
6. **Media Usage**: Do they share images, videos, or links frequently?
7. **Network**: Who do they interact with most?

Please use discover-actor to get their profile information and fetch-timeline to analyze their posts.`,
            },
          },
        ],
      };
    },
  );
}

/**
 * Find experts prompt.
 */
function registerFindExpertsPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "find-experts",
    {
      title: "Find Experts on Topic",
      description:
        "Find fediverse accounts that are experts or active contributors in a specific topic",
      argsSchema: {
        topic: z
          .string()
          .min(1, "Topic cannot be empty")
          .max(200, "Topic too long")
          .describe(
            "The topic or field to find experts in (e.g., 'machine learning', 'rust programming', 'climate science')",
          ),
        instances: z
          .string()
          .max(500, "Instances list too long")
          .optional()
          .describe(
            "Comma-separated list of instances to search (default: searches popular instances)",
          ),
      },
    },
    ({ topic, instances }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me find experts and active contributors discussing "${topic}" in the fediverse.

${instances ? `Please search these instances: ${instances}` : "Please search popular instances like mastodon.social, fosstodon.org, and relevant topic-specific instances."}

For each potential expert, please:
1. Search for accounts using the search tool (type: "accounts") with relevant keywords
2. Check their recent posts with fetch-timeline to verify they actively discuss the topic
3. Look at their bio and profile for credentials or expertise indicators

Provide a list of recommended accounts to follow, with a brief explanation of why each one is relevant to the topic. Prioritize:
- Accounts that post original content about the topic
- Accounts with thoughtful analysis or insights
- Active accounts (posting in the last month)
- Accounts that engage with the community (replies, discussions)`,
          },
        },
      ],
    }),
  );
}

/**
 * Summarize trending prompt.
 */
function registerSummarizeTrendingPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "summarize-trending",
    {
      title: "Summarize Trending Topics",
      description:
        "Get a summary of what's currently trending and being discussed in the fediverse",
      argsSchema: {
        instances: z
          .string()
          .max(500, "Instances list too long")
          .optional()
          .describe("Comma-separated list of instances to check (default: mastodon.social)"),
        focus: z
          .enum(["general", "tech", "news", "art", "science", "all"])
          .optional()
          .describe("Focus area for trending topics"),
      },
    },
    ({ instances = "mastodon.social", focus = "general" }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please provide a summary of what's currently trending in the fediverse.

Check these instances: ${instances}

Focus: ${focus === "all" ? "all topics" : focus}

Please:
1. Use get-trending-hashtags to see what hashtags are popular
2. Use get-trending-posts to see what content is getting engagement
3. Use get-public-timeline (scope: "local" or "federated") to sample recent discussions

Provide a summary that includes:
- **Top Trending Hashtags**: What tags are people using?
- **Hot Topics**: What are people discussing right now?
- **Popular Posts**: Highlight any particularly engaging or viral content
- **Emerging Discussions**: Any new topics gaining traction?

${focus !== "all" && focus !== "general" ? `Please focus particularly on ${focus}-related content.` : ""}

Format the summary in an easy-to-read way that helps me quickly understand what's happening in the fediverse right now.`,
          },
        },
      ],
    }),
  );
}
