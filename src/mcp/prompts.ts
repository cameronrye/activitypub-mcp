/**
 * MCP Prompt handlers for ActivityPub interactions.
 *
 * This module defines all MCP prompts that provide guided interactions
 * for exploring and discovering Fediverse content.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Registers all MCP prompts on the server.
 *
 * @param mcpServer - The MCP server instance
 */
export function registerPrompts(mcpServer: McpServer): void {
  registerExploreFediversePrompt(mcpServer);
  registerCompareInstancesPrompt(mcpServer);
  registerDiscoverContentPrompt(mcpServer);
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
 * Instance comparison prompt.
 */
function registerCompareInstancesPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "compare-instances",
    {
      title: "Compare Fediverse Instances",
      description: "Get help comparing different fediverse instances",
      argsSchema: {
        instances: z
          .string()
          .min(1, "Instances list cannot be empty")
          .max(500, "Instances list too long")
          .describe("Comma-separated list of instance domains to compare"),
        criteria: z
          .string()
          .min(1, "Criteria cannot be empty")
          .max(500, "Criteria too long")
          .optional()
          .describe("Specific criteria for comparison (e.g., size, rules, features)"),
      },
    },
    ({ instances, criteria }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please help me compare these fediverse instances: ${instances}. ${criteria ? `I'm particularly interested in: ${criteria}.` : ""} What are the key differences, strengths, and characteristics of each instance? Which one might be best for different types of users?`,
          },
        },
      ],
    }),
  );
}

/**
 * Content discovery prompt.
 */
function registerDiscoverContentPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "discover-content",
    {
      title: "Discover Fediverse Content",
      description: "Get recommendations for discovering interesting content and people",
      argsSchema: {
        topics: z
          .string()
          .min(1, "Topics cannot be empty")
          .max(500, "Topics too long")
          .describe("Comma-separated topics or subjects you want to explore"),
        contentType: z
          .enum(["people", "hashtags", "instances", "all"])
          .optional()
          .describe("Type of content to discover"),
      },
    },
    ({ topics, contentType = "all" }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I want to discover ${contentType === "all" ? "content" : contentType} related to "${topics}" in the fediverse. Can you suggest specific ${contentType === "people" ? "accounts to follow" : contentType === "hashtags" ? "hashtags to search" : contentType === "instances" ? "instances to explore" : "accounts, hashtags, and instances"} that would be interesting for someone interested in ${topics}?`,
          },
        },
      ],
    }),
  );
}
