/**
 * MCP Tool handlers for ActivityPub operations.
 *
 * This module defines all MCP tools that provide operations for
 * discovering and interacting with ActivityPub/Fediverse content.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { healthChecker } from "../health-check.js";
import { instanceDiscovery } from "../instance-discovery.js";
import { performanceMonitor } from "../performance-monitor.js";
import { remoteClient } from "../remote-client.js";
import { validateActorIdentifier, validateDomain, validateQuery } from "../server/index.js";
import type { RateLimiter } from "../server/rate-limiter.js";
import { getErrorMessage } from "../utils.js";
import { ActorIdentifierSchema, DomainSchema, QuerySchema } from "../validation/schemas.js";

const logger = getLogger("activitypub-mcp:tools");

/**
 * Registers all MCP tools on the server.
 *
 * @param mcpServer - The MCP server instance
 * @param rateLimiter - The rate limiter instance
 */
export function registerTools(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  registerDiscoverActorTool(mcpServer, rateLimiter);
  registerFetchTimelineTool(mcpServer, rateLimiter);
  registerSearchInstanceTool(mcpServer, rateLimiter);
  registerGetInstanceInfoTool(mcpServer, rateLimiter);
  registerDiscoverInstancesTool(mcpServer);
  registerRecommendInstancesTool(mcpServer);
  registerHealthCheckTool(mcpServer);
  registerPerformanceMetricsTool(mcpServer);
}

/**
 * Helper to check rate limit and throw if exceeded.
 */
function checkRateLimit(rateLimiter: RateLimiter, identifier: string): void {
  if (!rateLimiter.checkLimit(identifier)) {
    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
  }
}

/**
 * Discover actor tool - find actors across the fediverse.
 */
function registerDiscoverActorTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "discover-actor",
    {
      title: "Discover Fediverse Actor",
      description: "Discover and get information about any actor in the fediverse",
      inputSchema: {
        identifier: ActorIdentifierSchema.describe("Actor identifier (e.g., user@example.social)"),
      },
    },
    async ({ identifier }) => {
      const validIdentifier = validateActorIdentifier(identifier);

      const requestId = performanceMonitor.startRequest("discover-actor", {
        identifier: validIdentifier,
      });

      try {
        checkRateLimit(rateLimiter, validIdentifier);

        logger.info("Discovering actor", { identifier: validIdentifier });

        const actor = await remoteClient.fetchRemoteActor(validIdentifier);
        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `Successfully discovered actor: ${actor.preferredUsername || actor.name || validIdentifier}

🆔 ID: ${actor.id}
👤 Name: ${actor.name || "Not specified"}
📝 Summary: ${actor.summary || "No bio provided"}
🔗 URL: ${actor.url || actor.id}
📥 Inbox: ${actor.inbox}
📤 Outbox: ${actor.outbox}
👥 Followers: ${actor.followers || "Not available"}
👤 Following: ${actor.following || "Not available"}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to discover actor", {
          identifier,
          error: errorMessage,
        });

        if (error instanceof McpError) {
          throw error;
        }

        return {
          content: [
            {
              type: "text",
              text: `Failed to discover actor: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Fetch actor timeline tool.
 */
function registerFetchTimelineTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "fetch-timeline",
    {
      title: "Fetch Actor Timeline",
      description: "Fetch recent posts from any actor's timeline in the fediverse",
      inputSchema: {
        identifier: z.string().describe("Actor identifier (e.g., user@example.social)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Number of posts to fetch (default: 20)"),
      },
    },
    async ({ identifier, limit = 20 }) => {
      const validIdentifier = validateActorIdentifier(identifier);

      const requestId = performanceMonitor.startRequest("fetch-timeline", {
        identifier: validIdentifier,
        limit,
      });

      try {
        checkRateLimit(rateLimiter, validIdentifier);

        logger.info("Fetching timeline", { identifier: validIdentifier, limit });

        const timeline = await remoteClient.fetchActorOutbox(validIdentifier, limit);
        performanceMonitor.endRequest(requestId, true);

        const posts = timeline.orderedItems || timeline.items || [];
        const postCount = posts.length;

        return {
          content: [
            {
              type: "text",
              text: `Successfully fetched timeline for ${validIdentifier}

📊 Total items: ${timeline.totalItems || "Unknown"}
📝 Posts retrieved: ${postCount}
🔗 Timeline ID: ${timeline.id}

Recent posts:
${posts
  .slice(0, 5)
  .map((post: unknown, index: number) => {
    const p = post as { type?: string; content?: string; summary?: string };
    return `${index + 1}. ${p.type || "Post"}: ${p.content || p.summary || "No content"}`;
  })
  .join("\n")}

${postCount > 5 ? `... and ${postCount - 5} more posts` : ""}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to fetch timeline", {
          identifier,
          error: errorMessage,
        });

        if (error instanceof McpError) {
          throw error;
        }

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch timeline: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Search instance tool.
 */
function registerSearchInstanceTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "search-instance",
    {
      title: "Search Fediverse Instance",
      description: "Search for content on a specific fediverse instance",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., example.social)"),
        query: QuerySchema.describe("Search query"),
        type: z
          .enum(["accounts", "statuses", "hashtags"])
          .optional()
          .describe("Type of content to search for"),
      },
    },
    async ({ domain, query, type = "accounts" }) => {
      const validDomain = validateDomain(domain);
      const validQuery = validateQuery(query);

      const requestId = performanceMonitor.startRequest("search-instance", {
        domain: validDomain,
        query: validQuery,
        type,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Searching instance", { domain: validDomain, query: validQuery, type });

        const results = await remoteClient.searchInstance(validDomain, validQuery, type);
        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `Search results for "${validQuery}" on ${validDomain} (${type}):

${JSON.stringify(results, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to search instance", {
          domain,
          query,
          error: errorMessage,
        });

        if (error instanceof McpError) {
          throw error;
        }

        return {
          content: [
            {
              type: "text",
              text: `Failed to search instance: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Get instance info tool.
 */
function registerGetInstanceInfoTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-instance-info",
    {
      title: "Get Instance Information",
      description: "Get detailed information about a fediverse instance",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., example.social)"),
      },
    },
    async ({ domain }) => {
      const validDomain = validateDomain(domain);

      const requestId = performanceMonitor.startRequest("get-instance-info", {
        domain: validDomain,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Getting instance info", { domain: validDomain });

        const instanceInfo = await remoteClient.getInstanceInfo(validDomain);
        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `Instance Information for ${validDomain}:

🌐 Domain: ${instanceInfo.domain}
💻 Software: ${instanceInfo.software || "Unknown"}
📦 Version: ${instanceInfo.version || "Unknown"}
📝 Description: ${instanceInfo.description || "No description"}
🌍 Languages: ${instanceInfo.languages?.join(", ") || "Not specified"}
📝 Registrations: ${instanceInfo.registrations ? "Open" : "Closed"}
✅ Approval Required: ${instanceInfo.approval_required ? "Yes" : "No"}

${
  instanceInfo.stats
    ? `📊 Statistics:
👥 Users: ${instanceInfo.stats.user_count || "Unknown"}
📝 Posts: ${instanceInfo.stats.status_count || "Unknown"}
🌐 Domains: ${instanceInfo.stats.domain_count || "Unknown"}`
    : ""
}

${instanceInfo.contact_account ? `📞 Contact: @${instanceInfo.contact_account.username} (${instanceInfo.contact_account.display_name || "No display name"})` : ""}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to get instance info", {
          domain,
          error: errorMessage,
        });

        if (error instanceof McpError) {
          throw error;
        }

        return {
          content: [
            {
              type: "text",
              text: `Failed to get instance info: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Discover instances tool.
 */
function registerDiscoverInstancesTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "discover-instances",
    {
      title: "Discover Fediverse Instances",
      description: "Discover popular fediverse instances by category, topic, or size",
      inputSchema: {
        category: z
          .enum(["mastodon", "pleroma", "misskey", "peertube", "pixelfed", "lemmy", "all"])
          .optional()
          .describe("Type of fediverse software"),
        topic: z.string().optional().describe("Topic or interest to search for"),
        size: z.enum(["small", "medium", "large"]).optional().describe("Instance size preference"),
        region: z.string().optional().describe("Geographic region or language"),
        beginnerFriendly: z.boolean().optional().describe("Show only beginner-friendly instances"),
      },
    },
    async ({ category, topic, size, region, beginnerFriendly }) => {
      try {
        logger.info("Discovering instances", { category, topic, size, region, beginnerFriendly });

        let instances = instanceDiscovery.getPopularInstances(
          category === "all" ? undefined : category,
        );

        if (topic) {
          instances = instanceDiscovery.searchInstancesByTopic(topic);
        }

        if (size) {
          instances = instanceDiscovery.getInstancesBySize(size);
        }

        if (region) {
          instances = instanceDiscovery.getInstancesByRegion(region);
        }

        if (beginnerFriendly) {
          instances = instanceDiscovery.getBeginnerFriendlyInstances();
        }

        const limitedInstances = instances.slice(0, 20);

        return {
          content: [
            {
              type: "text",
              text: `Found ${instances.length} fediverse instances${limitedInstances.length < instances.length ? ` (showing first ${limitedInstances.length})` : ""}:

${limitedInstances
  .map(
    (instance, index) =>
      `${index + 1}. **${instance.domain}** ${instance.software ? `(${instance.software})` : ""}
   👥 Users: ${instance.users}
   📝 ${instance.description}`,
  )
  .join("\n\n")}

${limitedInstances.length < instances.length ? `\n... and ${instances.length - limitedInstances.length} more instances` : ""}

💡 **Tip**: Use the \`get-instance-info\` tool to get detailed information about any specific instance.`,
            },
          ],
        };
      } catch (error) {
        logger.error("Failed to discover instances", { error: getErrorMessage(error) });

        return {
          content: [
            {
              type: "text",
              text: `Failed to discover instances: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Get instance recommendations tool.
 */
function registerRecommendInstancesTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "recommend-instances",
    {
      title: "Get Instance Recommendations",
      description: "Get personalized fediverse instance recommendations based on interests",
      inputSchema: {
        interests: z.array(z.string()).describe("List of your interests or topics"),
      },
    },
    async ({ interests }) => {
      try {
        logger.info("Getting instance recommendations", { interests });

        const recommendations = instanceDiscovery.getInstanceRecommendations(interests);

        return {
          content: [
            {
              type: "text",
              text: `Based on your interests (${interests.join(", ")}), here are some recommended fediverse instances:

${recommendations
  .map(
    (instance, index) =>
      `${index + 1}. **${instance.domain}** ${instance.software ? `(${instance.software})` : ""}
   👥 Users: ${instance.users}
   📝 ${instance.description}
   🎯 Why recommended: Matches your interest in ${
     interests.find(
       (i) =>
         instance.description.toLowerCase().includes(i.toLowerCase()) ||
         instance.domain.toLowerCase().includes(i.toLowerCase()),
     ) || "general topics"
   }`,
  )
  .join("\n\n")}

💡 **Next steps**:
- Use \`get-instance-info\` to learn more about any instance
- Use \`discover-actor\` to find interesting people on these instances
- Check out the instance's local timeline to see the community vibe`,
            },
          ],
        };
      } catch (error) {
        logger.error("Failed to get instance recommendations", {
          interests,
          error: getErrorMessage(error),
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to get instance recommendations: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Health check tool.
 */
function registerHealthCheckTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "health-check",
    {
      title: "Server Health Check",
      description: "Check the health status of the ActivityPub MCP server",
      inputSchema: {
        includeMetrics: z
          .boolean()
          .optional()
          .describe("Include detailed performance metrics in the response"),
      },
    },
    async ({ includeMetrics = false }) => {
      const requestId = performanceMonitor.startRequest("health-check", { includeMetrics });

      try {
        const healthStatus = await healthChecker.performHealthCheck(includeMetrics);
        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `🏥 **Server Health Check**

**Overall Status**: ${healthStatus.status.toUpperCase()} ${healthStatus.status === "healthy" ? "✅" : healthStatus.status === "degraded" ? "⚠️" : "❌"}
**Uptime**: ${Math.round(healthStatus.uptime / 1000 / 60)} minutes
**Version**: ${healthStatus.version}
**Timestamp**: ${healthStatus.timestamp}

**Health Checks**:
${Object.entries(healthStatus.checks)
  .map(
    ([name, check]) =>
      `• **${name}**: ${check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌"} ${check.message} (${check.duration}ms)`,
  )
  .join("\n")}

${
  healthStatus.metrics
    ? `
**Performance Metrics**:
• **Requests**: ${healthStatus.metrics.requests.total} total, ${healthStatus.metrics.requests.errors} errors (${healthStatus.metrics.requests.errorRate.toFixed(2)}% error rate)
• **Response Times**: ${healthStatus.metrics.performance.averageResponseTime.toFixed(2)}ms avg, ${healthStatus.metrics.performance.p95ResponseTime.toFixed(2)}ms p95, ${healthStatus.metrics.performance.p99ResponseTime.toFixed(2)}ms p99
• **System**: ${healthStatus.metrics.system.memoryUsageMB}MB memory, ${Math.round(healthStatus.metrics.system.uptime / 1000 / 60)} min uptime
`
    : ""
}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        return {
          content: [
            {
              type: "text",
              text: `❌ Health check failed: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Performance metrics tool.
 */
function registerPerformanceMetricsTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "performance-metrics",
    {
      title: "Performance Metrics",
      description: "Get detailed performance metrics for the ActivityPub MCP server",
      inputSchema: {
        operation: z
          .string()
          .optional()
          .describe("Specific operation to get metrics for (e.g., 'discover-actor')"),
      },
    },
    async ({ operation }) => {
      const requestId = performanceMonitor.startRequest("performance-metrics", { operation });

      try {
        if (operation) {
          const operationMetrics = performanceMonitor.getOperationMetrics(operation);
          performanceMonitor.endRequest(requestId, true);

          return {
            content: [
              {
                type: "text",
                text: `📊 **Performance Metrics for "${operation}"**

• **Total Requests**: ${operationMetrics.count}
• **Successful**: ${operationMetrics.successCount} (${(operationMetrics.successRate * 100).toFixed(2)}%)
• **Failed**: ${operationMetrics.errorCount}
• **Average Response Time**: ${operationMetrics.averageResponseTime.toFixed(2)}ms`,
              },
            ],
          };
        }

        const metrics = performanceMonitor.getMetrics();
        const requestHistory = performanceMonitor.getRequestHistory(10);
        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `📊 **Overall Performance Metrics**

**Request Statistics**:
• **Total Requests**: ${metrics.requestCount}
• **Errors**: ${metrics.errorCount} (${metrics.requestCount > 0 ? ((metrics.errorCount / metrics.requestCount) * 100).toFixed(2) : 0}% error rate)

**Response Times**:
• **Average**: ${metrics.averageResponseTime.toFixed(2)}ms
• **Min**: ${metrics.minResponseTime}ms
• **Max**: ${metrics.maxResponseTime}ms
• **95th Percentile**: ${metrics.p95ResponseTime.toFixed(2)}ms
• **99th Percentile**: ${metrics.p99ResponseTime.toFixed(2)}ms

**System Resources**:
• **Memory Usage**: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB heap used
• **Uptime**: ${Math.round(metrics.uptime / 1000 / 60)} minutes

**Recent Requests** (last 10):
${requestHistory
  .map((req) => `• ${req.operation}: ${req.duration}ms ${req.success ? "✅" : "❌"}`)
  .join("\n")}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get performance metrics: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
