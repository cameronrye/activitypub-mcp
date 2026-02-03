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
import { dynamicInstanceDiscovery } from "../dynamic-instance-discovery.js";
import { healthChecker } from "../health-check.js";
import { instanceDiscovery } from "../instance-discovery.js";
import { performanceMonitor } from "../performance-monitor.js";
import { remoteClient } from "../remote-client.js";
import { validateActorIdentifier, validateDomain, validateQuery } from "../server/index.js";
import type { RateLimiter } from "../server/rate-limiter.js";
import { formatErrorWithSuggestion, getErrorMessage, stripHtmlTags } from "../utils.js";
import { ActorIdentifierSchema, DomainSchema, QuerySchema } from "../validation/schemas.js";
import { registerExportTools } from "./tools-export.js";
import { registerWriteTools } from "./tools-write.js";

const logger = getLogger("activitypub-mcp:tools");

/**
 * Registers all MCP tools on the server.
 *
 * @param mcpServer - The MCP server instance
 * @param rateLimiter - The rate limiter instance
 */
export function registerTools(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  // Discovery tools
  registerDiscoverActorTool(mcpServer, rateLimiter);
  registerDiscoverInstancesTool(mcpServer);
  registerDiscoverInstancesLiveTool(mcpServer, rateLimiter);
  registerRecommendInstancesTool(mcpServer);

  // Content tools
  registerFetchTimelineTool(mcpServer, rateLimiter);
  registerGetPostThreadTool(mcpServer, rateLimiter);
  registerSearchInstanceTool(mcpServer, rateLimiter);
  registerSearchAccountsTool(mcpServer, rateLimiter);
  registerSearchHashtagsTool(mcpServer, rateLimiter);
  registerSearchPostsTool(mcpServer, rateLimiter);
  registerUnifiedSearchTool(mcpServer, rateLimiter);

  // Timeline tools
  registerGetTrendingHashtagsTool(mcpServer, rateLimiter);
  registerGetTrendingPostsTool(mcpServer, rateLimiter);
  registerGetLocalTimelineTool(mcpServer, rateLimiter);
  registerGetFederatedTimelineTool(mcpServer, rateLimiter);

  // Instance tools
  registerGetInstanceInfoTool(mcpServer, rateLimiter);

  // Utility tools
  registerConvertUrlTool(mcpServer, rateLimiter);
  registerBatchFetchActorsTool(mcpServer, rateLimiter);
  registerBatchFetchPostsTool(mcpServer, rateLimiter);

  // System tools
  registerHealthCheckTool(mcpServer);
  registerPerformanceMetricsTool(mcpServer);

  // Write operation tools (authenticated)
  registerWriteTools(mcpServer, rateLimiter);

  // Export tools
  registerExportTools(mcpServer, rateLimiter);
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
              text: `Failed to discover actor: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Fetch actor timeline tool with pagination support.
 */
function registerFetchTimelineTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "fetch-timeline",
    {
      title: "Fetch Actor Timeline",
      description: "Fetch posts from any actor's timeline in the fediverse with pagination support",
      inputSchema: {
        identifier: z.string().describe("Actor identifier (e.g., user@example.social)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Number of posts to fetch (default: 20)"),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor from previous response to fetch next page"),
        minId: z.string().optional().describe("Return results newer than this ID"),
        maxId: z.string().optional().describe("Return results older than this ID"),
        sinceId: z.string().optional().describe("Return results since this ID"),
      },
    },
    async ({ identifier, limit = 20, cursor, minId, maxId, sinceId }) => {
      const validIdentifier = validateActorIdentifier(identifier);

      const requestId = performanceMonitor.startRequest("fetch-timeline", {
        identifier: validIdentifier,
        limit,
        cursor,
        minId,
        maxId,
        sinceId,
      });

      try {
        checkRateLimit(rateLimiter, validIdentifier);

        logger.info("Fetching timeline", {
          identifier: validIdentifier,
          limit,
          cursor,
          minId,
          maxId,
          sinceId,
        });

        const timeline = await remoteClient.fetchActorOutboxPaginated(validIdentifier, {
          limit,
          cursor,
          minId,
          maxId,
          sinceId,
        });
        performanceMonitor.endRequest(requestId, true);

        const posts = timeline.items;
        const postCount = posts.length;

        // Build pagination info section
        const paginationInfo = [];
        if (timeline.hasMore && timeline.nextCursor) {
          paginationInfo.push(`📄 Next page cursor: ${timeline.nextCursor}`);
        }
        if (timeline.prevCursor) {
          paginationInfo.push(`📄 Previous page cursor: ${timeline.prevCursor}`);
        }

        // Format pagination section
        const paginationSection =
          paginationInfo.length > 0 ? `**Pagination:**\n${paginationInfo.join("\n")}\n` : "";

        // Format posts section
        const postsSection = posts
          .slice(0, 10)
          .map((post: unknown, index: number) => {
            const p = post as { type?: string; content?: string; summary?: string; id?: string };
            const content = p.content || p.summary || "No content";
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            const postType = p.type || "Post";
            return `${index + 1}. [${postType}] ${truncated}`;
          })
          .join("\n\n");

        const remainingPosts = postCount - 10;
        const morePostsNote =
          postCount > 10 ? `\n... and ${remainingPosts} more posts in this page` : "";

        return {
          content: [
            {
              type: "text",
              text: `Successfully fetched timeline for ${validIdentifier}

📊 Total items: ${timeline.totalItems || "Unknown"}
📝 Posts retrieved: ${postCount}
🔗 Collection ID: ${timeline.collectionId}
${timeline.hasMore ? "📄 More posts available (use cursor for next page)" : "📄 No more posts"}

${paginationSection}
**Recent posts:**
${postsSection}
${morePostsNote}`,
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
              text: `Failed to fetch timeline: ${formatErrorWithSuggestion(errorMessage)}`,
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
              text: `Failed to search instance: ${formatErrorWithSuggestion(errorMessage)}`,
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
              text: `Failed to get instance info: ${formatErrorWithSuggestion(errorMessage)}`,
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
              text: `Failed to discover instances: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Discover instances live tool - fetches real-time data from instances.social API
 */
function registerDiscoverInstancesLiveTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "discover-instances-live",
    {
      title: "Discover Instances (Live)",
      description:
        "Discover fediverse instances in real-time using the instances.social API with advanced filtering",
      inputSchema: {
        software: z
          .enum(["mastodon", "pleroma", "misskey", "pixelfed", "lemmy", "peertube", "any"])
          .optional()
          .describe("Filter by software type"),
        language: z
          .string()
          .optional()
          .describe("Filter by language code (e.g., 'en', 'de', 'ja')"),
        minUsers: z.number().optional().describe("Minimum number of users"),
        maxUsers: z.number().optional().describe("Maximum number of users"),
        openRegistrations: z
          .boolean()
          .optional()
          .describe("Only show instances with open registrations"),
        sortBy: z
          .enum(["users", "statuses", "connections", "name"])
          .optional()
          .describe("Sort results by field"),
        sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort order (default: desc)"),
        limit: z.number().min(1).max(50).optional().describe("Number of results (default: 20)"),
      },
    },
    async ({
      software,
      language,
      minUsers,
      maxUsers,
      openRegistrations,
      sortBy,
      sortOrder,
      limit = 20,
    }) => {
      const requestId = performanceMonitor.startRequest("discover-instances-live", {
        software,
        language,
        minUsers,
        maxUsers,
        openRegistrations,
        sortBy,
        limit,
      });

      try {
        checkRateLimit(rateLimiter, "discover-instances-live");

        logger.info("Discovering instances live", {
          software,
          language,
          minUsers,
          maxUsers,
          openRegistrations,
          sortBy,
          limit,
        });

        const result = await dynamicInstanceDiscovery.searchInstances({
          software: software === "any" ? undefined : software,
          language,
          minUsers,
          maxUsers,
          openRegistrations,
          sortBy,
          sortOrder,
          limit,
        });

        performanceMonitor.endRequest(requestId, true);

        const instances = result.instances;

        // Determine source label
        let sourceLabel: string;
        if (result.source === "api") {
          sourceLabel = "instances.social API";
        } else if (result.source === "cache") {
          sourceLabel = "cache";
        } else {
          sourceLabel = "fallback data";
        }

        // Format instance list
        const instanceList = instances
          .map((instance, index) => {
            const parts = [
              `${index + 1}. **${instance.domain}**`,
              instance.software ? `(${instance.software})` : "",
            ];

            const details = [];
            if (instance.users !== undefined) {
              details.push(`👥 ${instance.users.toLocaleString()} users`);
            }
            if (instance.language) {
              details.push(`🌐 ${instance.language}`);
            }
            if (instance.registrations !== undefined) {
              details.push(instance.registrations ? "✅ Open" : "🔒 Closed");
            }

            if (details.length > 0) {
              parts.push(`\n   ${details.join(" | ")}`);
            }

            if (instance.description) {
              const desc =
                instance.description.length > 150
                  ? `${instance.description.slice(0, 150)}...`
                  : instance.description;
              parts.push(`\n   📝 ${desc}`);
            }

            return parts.join(" ");
          })
          .join("\n\n");

        const hasMoreText = result.hasMore
          ? `\n\n📄 More instances available (${result.total} total)`
          : "";

        return {
          content: [
            {
              type: "text",
              text: `🔍 **Live Instance Discovery**

Source: ${sourceLabel}
Found: ${instances.length} instances
${result.total > instances.length ? `Total available: ${result.total}` : ""}

${instanceList}${hasMoreText}

💡 **Tips:**
- Use \`get-instance-info\` for detailed information about any instance
- Use \`discover-actor\` to find users on these instances
- Filter by \`software\`, \`language\`, or \`minUsers\` for more specific results`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to discover instances live", { error: errorMessage });

        return {
          content: [
            {
              type: "text",
              text: `Failed to discover instances: ${formatErrorWithSuggestion(errorMessage)}`,
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
              text: `Failed to get instance recommendations: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
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

/**
 * Get post thread tool - fetch a post and its replies/ancestors.
 */
function registerGetPostThreadTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-post-thread",
    {
      title: "Get Post Thread",
      description:
        "Fetch a post and its full conversation thread including replies and parent posts",
      inputSchema: {
        postUrl: z.string().url().describe("The URL of the post to fetch the thread for"),
        depth: z
          .number()
          .min(1)
          .max(5)
          .optional()
          .describe("How many levels of nested replies to fetch (default: 2)"),
        maxReplies: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of replies to fetch (default: 50)"),
      },
    },
    async ({ postUrl, depth = 2, maxReplies = 50 }) => {
      const requestId = performanceMonitor.startRequest("get-post-thread", {
        postUrl,
        depth,
        maxReplies,
      });

      try {
        const domain = new URL(postUrl).hostname;
        checkRateLimit(rateLimiter, domain);

        logger.info("Fetching post thread", { postUrl, depth, maxReplies });

        const thread = await remoteClient.fetchPostThread(postUrl, { depth, maxReplies });
        performanceMonitor.endRequest(requestId, true);

        // Format ancestors
        const ancestorsSection =
          thread.ancestors.length > 0
            ? `**Conversation Context** (${thread.ancestors.length} parent posts):\n${thread.ancestors
                .map((a, i) => {
                  const content = a.content || a.summary || "No content";
                  const truncated = content.length > 150 ? `${content.slice(0, 150)}...` : content;
                  return `${i + 1}. ${truncated}`;
                })
                .join("\n")}\n\n`
            : "";

        // Format main post
        const postContent = thread.post.content || thread.post.summary || "No content";
        const spoilerText =
          thread.post.summary && thread.post.content ? `⚠️ CW: ${thread.post.summary}\n` : "";

        // Format replies
        const repliesSection =
          thread.replies.length > 0
            ? `**Replies** (${thread.replies.length} of ${thread.totalReplies} total):\n${thread.replies
                .slice(0, 10)
                .map((r, i) => {
                  const content = r.content || r.summary || "No content";
                  const truncated = content.length > 150 ? `${content.slice(0, 150)}...` : content;
                  const cw = r.summary && r.content ? `[CW: ${r.summary}] ` : "";
                  return `${i + 1}. ${cw}${truncated}`;
                })
                .join(
                  "\n",
                )}${thread.replies.length > 10 ? `\n... and ${thread.replies.length - 10} more replies` : ""}`
            : "**No replies yet**";

        return {
          content: [
            {
              type: "text",
              text: `🧵 **Post Thread**

${ancestorsSection}**Main Post**:
${spoilerText}${postContent}

🔗 URL: ${thread.post.url || thread.post.id}
📅 Published: ${thread.post.published || "Unknown"}

${repliesSection}

💡 **Tips:**
- Use \`discover-actor\` to learn more about the post author
- Use \`fetch-timeline\` to see more posts from this user`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to fetch post thread", { postUrl, error: errorMessage });

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch post thread: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Get trending hashtags tool.
 */
function registerGetTrendingHashtagsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-trending-hashtags",
    {
      title: "Get Trending Hashtags",
      description: "Get currently trending hashtags on a fediverse instance",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of hashtags to fetch (default: 20)"),
      },
    },
    async ({ domain, limit = 20 }) => {
      const validDomain = validateDomain(domain);

      const requestId = performanceMonitor.startRequest("get-trending-hashtags", {
        domain: validDomain,
        limit,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching trending hashtags", { domain: validDomain, limit });

        const result = await remoteClient.fetchTrendingHashtags(validDomain, { limit });
        performanceMonitor.endRequest(requestId, true);

        const hashtagsList = result.hashtags
          .map((tag, i) => {
            const history = tag.history?.[0];
            const uses = history?.uses || "?";
            const accounts = history?.accounts || "?";
            return `${i + 1}. **#${tag.name}** - ${uses} uses by ${accounts} accounts`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `📈 **Trending Hashtags on ${validDomain}**

${hashtagsList || "No trending hashtags found"}

💡 **Tips:**
- Use \`search-hashtags\` to explore posts with a specific hashtag
- Use \`get-local-timeline\` to see recent posts from this instance`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to fetch trending hashtags", {
          domain: validDomain,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch trending hashtags: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Get trending posts tool.
 */
function registerGetTrendingPostsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-trending-posts",
    {
      title: "Get Trending Posts",
      description: "Get currently trending posts/statuses on a fediverse instance",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of posts to fetch (default: 20)"),
      },
    },
    async ({ domain, limit = 20 }) => {
      const validDomain = validateDomain(domain);

      const requestId = performanceMonitor.startRequest("get-trending-posts", {
        domain: validDomain,
        limit,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching trending posts", { domain: validDomain, limit });

        const result = await remoteClient.fetchTrendingPosts(validDomain, { limit });
        performanceMonitor.endRequest(requestId, true);

        const postsList = result.posts
          .slice(0, 10)
          .map((post, i) => {
            const content = stripHtmlTags(post.content || "") || "No content";
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            const cw = post.spoiler_text ? `⚠️ CW: ${post.spoiler_text}\n` : "";
            return `${i + 1}. **@${post.account.username}** (${post.account.display_name || post.account.username})
   ${cw}${truncated}
   ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}`;
          })
          .join("\n\n");

        const moreText =
          result.posts.length > 10
            ? `\n... and ${result.posts.length - 10} more trending posts`
            : "";

        return {
          content: [
            {
              type: "text",
              text: `🔥 **Trending Posts on ${validDomain}**

${postsList || "No trending posts found"}${moreText}

💡 **Tips:**
- Use \`get-post-thread\` to see replies to a post
- Use \`discover-actor\` to learn more about a post author`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to fetch trending posts", {
          domain: validDomain,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch trending posts: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Get local timeline tool.
 */
function registerGetLocalTimelineTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-local-timeline",
    {
      title: "Get Local Timeline",
      description:
        "Get the local public timeline from a fediverse instance (posts from local users only)",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of posts to fetch (default: 20)"),
        maxId: z.string().optional().describe("Return results older than this ID (for pagination)"),
      },
    },
    async ({ domain, limit = 20, maxId }) => {
      const validDomain = validateDomain(domain);

      const requestId = performanceMonitor.startRequest("get-local-timeline", {
        domain: validDomain,
        limit,
        maxId,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching local timeline", { domain: validDomain, limit, maxId });

        const result = await remoteClient.fetchLocalTimeline(validDomain, { limit, maxId });
        performanceMonitor.endRequest(requestId, true);

        const postsList = result.posts
          .slice(0, 15)
          .map((post, i) => {
            const content = stripHtmlTags(post.content || "") || "No content";
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            const cw = post.spoiler_text ? `⚠️ CW: ${post.spoiler_text}\n` : "";
            return `${i + 1}. **@${post.account.username}**
   ${cw}${truncated}
   ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}`;
          })
          .join("\n\n");

        const paginationInfo =
          result.hasMore && result.nextMaxId
            ? `\n📄 **More posts available** - use maxId: "${result.nextMaxId}" for next page`
            : "";

        return {
          content: [
            {
              type: "text",
              text: `🏠 **Local Timeline for ${validDomain}**

${postsList || "No posts found"}${paginationInfo}

💡 **Tips:**
- Local timeline shows posts from users on this instance only
- Use \`get-federated-timeline\` to see posts from all connected instances
- Use \`get-trending-posts\` to see what's popular`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to fetch local timeline", {
          domain: validDomain,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch local timeline: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Get federated timeline tool.
 */
function registerGetFederatedTimelineTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-federated-timeline",
    {
      title: "Get Federated Timeline",
      description:
        "Get the federated public timeline from a fediverse instance (posts from all connected instances)",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of posts to fetch (default: 20)"),
        maxId: z.string().optional().describe("Return results older than this ID (for pagination)"),
      },
    },
    async ({ domain, limit = 20, maxId }) => {
      const validDomain = validateDomain(domain);

      const requestId = performanceMonitor.startRequest("get-federated-timeline", {
        domain: validDomain,
        limit,
        maxId,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching federated timeline", { domain: validDomain, limit, maxId });

        const result = await remoteClient.fetchFederatedTimeline(validDomain, { limit, maxId });
        performanceMonitor.endRequest(requestId, true);

        const postsList = result.posts
          .slice(0, 15)
          .map((post, i) => {
            const content = stripHtmlTags(post.content || "") || "No content";
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            const cw = post.spoiler_text ? `⚠️ CW: ${post.spoiler_text}\n` : "";
            return `${i + 1}. **@${post.account.username}**
   ${cw}${truncated}
   ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}`;
          })
          .join("\n\n");

        const paginationInfo =
          result.hasMore && result.nextMaxId
            ? `\n📄 **More posts available** - use maxId: "${result.nextMaxId}" for next page`
            : "";

        return {
          content: [
            {
              type: "text",
              text: `🌐 **Federated Timeline via ${validDomain}**

${postsList || "No posts found"}${paginationInfo}

💡 **Tips:**
- Federated timeline includes posts from all instances connected to ${validDomain}
- Use \`get-local-timeline\` to see posts from ${validDomain} users only
- Use \`discover-actor\` to learn more about any user`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to fetch federated timeline", {
          domain: validDomain,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch federated timeline: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Search accounts tool - specialized search for accounts.
 */
function registerSearchAccountsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "search-accounts",
    {
      title: "Search Accounts",
      description: "Search for accounts/users on a fediverse instance",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        query: QuerySchema.describe("Search query (username or display name)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of results to fetch (default: 20)"),
      },
    },
    async ({ domain, query, limit = 20 }) => {
      const validDomain = validateDomain(domain);
      const validQuery = validateQuery(query);

      const requestId = performanceMonitor.startRequest("search-accounts", {
        domain: validDomain,
        query: validQuery,
        limit,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Searching accounts", { domain: validDomain, query: validQuery, limit });

        const results = (await remoteClient.searchInstance(
          validDomain,
          validQuery,
          "accounts",
        )) as {
          accounts?: Array<{
            id: string;
            username: string;
            acct: string;
            display_name?: string;
            note?: string;
            followers_count?: number;
            following_count?: number;
            statuses_count?: number;
          }>;
        };
        performanceMonitor.endRequest(requestId, true);

        const accounts = results.accounts || [];
        const accountsList = accounts
          .slice(0, 15)
          .map((acc, i) => {
            const note = stripHtmlTags(acc.note || "") || "No bio";
            const truncatedNote = note.length > 100 ? `${note.slice(0, 100)}...` : note;
            return `${i + 1}. **@${acc.acct}** (${acc.display_name || acc.username})
   ${truncatedNote}
   👥 ${acc.followers_count || 0} followers | 📝 ${acc.statuses_count || 0} posts`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `👤 **Account Search Results for "${validQuery}" on ${validDomain}**

Found ${accounts.length} accounts:

${accountsList || "No accounts found"}

💡 **Tips:**
- Use \`discover-actor\` with the full @username@domain to get detailed profile info
- Use \`fetch-timeline\` to see an account's recent posts`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to search accounts", {
          domain: validDomain,
          query: validQuery,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to search accounts: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Search hashtags tool - specialized search for hashtags.
 */
function registerSearchHashtagsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "search-hashtags",
    {
      title: "Search Hashtags",
      description: "Search for hashtags on a fediverse instance",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        query: QuerySchema.describe("Search query (hashtag name without #)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of results to fetch (default: 20)"),
      },
    },
    async ({ domain, query, limit = 20 }) => {
      const validDomain = validateDomain(domain);
      const validQuery = validateQuery(query.replace(/^#/, "")); // Remove leading # if present

      const requestId = performanceMonitor.startRequest("search-hashtags", {
        domain: validDomain,
        query: validQuery,
        limit,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Searching hashtags", { domain: validDomain, query: validQuery, limit });

        const results = (await remoteClient.searchInstance(
          validDomain,
          validQuery,
          "hashtags",
        )) as {
          hashtags?: Array<{
            name: string;
            url: string;
            history?: Array<{ day: string; uses: string; accounts: string }>;
          }>;
        };
        performanceMonitor.endRequest(requestId, true);

        const hashtags = results.hashtags || [];
        const hashtagsList = hashtags
          .slice(0, 20)
          .map((tag, i) => {
            const recentUses =
              tag.history?.slice(0, 7).reduce((sum, h) => sum + Number.parseInt(h.uses, 10), 0) ||
              0;
            return `${i + 1}. **#${tag.name}** - ${recentUses} uses in the last 7 days`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `#️⃣ **Hashtag Search Results for "${validQuery}" on ${validDomain}**

Found ${hashtags.length} hashtags:

${hashtagsList || "No hashtags found"}

💡 **Tips:**
- Use \`search-posts\` to find posts containing a specific hashtag
- Use \`get-trending-hashtags\` to see what's currently popular`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to search hashtags", {
          domain: validDomain,
          query: validQuery,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to search hashtags: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Search posts tool - specialized search for posts/statuses.
 */
function registerSearchPostsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "search-posts",
    {
      title: "Search Posts",
      description: "Search for posts/statuses on a fediverse instance",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        query: QuerySchema.describe("Search query (keywords or hashtag)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of results to fetch (default: 20)"),
      },
    },
    async ({ domain, query, limit = 20 }) => {
      const validDomain = validateDomain(domain);
      const validQuery = validateQuery(query);

      const requestId = performanceMonitor.startRequest("search-posts", {
        domain: validDomain,
        query: validQuery,
        limit,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Searching posts", { domain: validDomain, query: validQuery, limit });

        const results = (await remoteClient.searchInstance(
          validDomain,
          validQuery,
          "statuses",
        )) as {
          statuses?: Array<{
            id: string;
            content: string;
            created_at: string;
            account: { username: string; acct: string; display_name?: string };
            reblogs_count: number;
            favourites_count: number;
            replies_count: number;
            url: string;
            spoiler_text?: string;
          }>;
        };
        performanceMonitor.endRequest(requestId, true);

        const statuses = results.statuses || [];
        const postsList = statuses
          .slice(0, 10)
          .map((post, i) => {
            const content = stripHtmlTags(post.content || "") || "No content";
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            const cw = post.spoiler_text ? `⚠️ CW: ${post.spoiler_text}\n` : "";
            return `${i + 1}. **@${post.account.acct}** (${post.account.display_name || post.account.username})
   ${cw}${truncated}
   ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `📝 **Post Search Results for "${validQuery}" on ${validDomain}**

Found ${statuses.length} posts:

${postsList || "No posts found"}

💡 **Tips:**
- Use \`get-post-thread\` to see the full conversation for a post
- Use \`discover-actor\` to learn more about a post author`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to search posts", {
          domain: validDomain,
          query: validQuery,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to search posts: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Unified search tool - combines all search types in one convenient tool.
 */
function registerUnifiedSearchTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "search",
    {
      title: "Search Fediverse",
      description:
        "Unified search across the fediverse - find accounts, posts, or hashtags on any instance",
      inputSchema: {
        query: QuerySchema.describe("Search query"),
        domain: DomainSchema.optional().describe(
          "Instance domain to search on (default: mastodon.social)",
        ),
        type: z
          .enum(["all", "accounts", "posts", "hashtags"])
          .optional()
          .describe("Type of content to search for (default: all)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of results per type (default: 10)"),
      },
    },
    async ({ query, domain = "mastodon.social", type = "all", limit = 10 }) => {
      const validDomain = validateDomain(domain);
      const validQuery = validateQuery(query);

      const requestId = performanceMonitor.startRequest("search", {
        domain: validDomain,
        query: validQuery,
        type,
        limit,
      });

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Unified search", { domain: validDomain, query: validQuery, type, limit });

        const sections: string[] = [];

        // Search accounts if requested
        if (type === "all" || type === "accounts") {
          const accountResults = (await remoteClient.searchInstance(
            validDomain,
            validQuery,
            "accounts",
          )) as {
            accounts?: Array<{
              username: string;
              acct: string;
              display_name?: string;
              note?: string;
              followers_count?: number;
              statuses_count?: number;
            }>;
          };

          const accounts = accountResults.accounts?.slice(0, limit) || [];
          if (accounts.length > 0) {
            const accountsList = accounts
              .map((acc, i) => {
                const note = stripHtmlTags(acc.note || "");
                const truncatedNote = note.length > 80 ? `${note.slice(0, 80)}...` : note;
                return `${i + 1}. **@${acc.acct}** (${acc.display_name || acc.username})
   👥 ${acc.followers_count || 0} followers | ${truncatedNote}`;
              })
              .join("\n\n");
            sections.push(`## 👤 Accounts (${accounts.length})\n\n${accountsList}`);
          } else if (type === "accounts") {
            sections.push("## 👤 Accounts\n\nNo accounts found.");
          }
        }

        // Search posts if requested
        if (type === "all" || type === "posts") {
          const postResults = (await remoteClient.searchInstance(
            validDomain,
            validQuery,
            "statuses",
          )) as {
            statuses?: Array<{
              content: string;
              account: { username: string; acct: string; display_name?: string };
              favourites_count: number;
              reblogs_count: number;
              replies_count: number;
              spoiler_text?: string;
            }>;
          };

          const posts = postResults.statuses?.slice(0, limit) || [];
          if (posts.length > 0) {
            const postsList = posts
              .map((post, i) => {
                const content = stripHtmlTags(post.content || "") || "No content";
                const truncated = content.length > 150 ? `${content.slice(0, 150)}...` : content;
                const cw = post.spoiler_text ? `⚠️ CW: ${post.spoiler_text}\n` : "";
                return `${i + 1}. **@${post.account.acct}**
   ${cw}${truncated}
   ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}`;
              })
              .join("\n\n");
            sections.push(`## 📝 Posts (${posts.length})\n\n${postsList}`);
          } else if (type === "posts") {
            sections.push("## 📝 Posts\n\nNo posts found.");
          }
        }

        // Search hashtags if requested
        if (type === "all" || type === "hashtags") {
          const hashtagResults = (await remoteClient.searchInstance(
            validDomain,
            validQuery.replace(/^#/, ""),
            "hashtags",
          )) as {
            hashtags?: Array<{
              name: string;
              history?: Array<{ uses: string; accounts: string }>;
            }>;
          };

          const hashtags = hashtagResults.hashtags?.slice(0, limit) || [];
          if (hashtags.length > 0) {
            const hashtagsList = hashtags
              .map((tag, i) => {
                const recentUses =
                  tag.history
                    ?.slice(0, 7)
                    .reduce((sum, h) => sum + Number.parseInt(h.uses, 10), 0) || 0;
                return `${i + 1}. **#${tag.name}** - ${recentUses} uses (last 7 days)`;
              })
              .join("\n");
            sections.push(`## #️⃣ Hashtags (${hashtags.length})\n\n${hashtagsList}`);
          } else if (type === "hashtags") {
            sections.push("## #️⃣ Hashtags\n\nNo hashtags found.");
          }
        }

        performanceMonitor.endRequest(requestId, true);

        const resultsText =
          sections.length > 0 ? sections.join("\n\n---\n\n") : "No results found for your search.";

        return {
          content: [
            {
              type: "text",
              text: `🔍 **Search Results for "${validQuery}" on ${validDomain}**

${resultsText}

---
💡 **Tips:**
- Use \`discover-actor\` with @username@domain for detailed profile info
- Use \`get-post-thread\` to see full conversations
- Use \`fetch-timeline\` to see an account's recent posts`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Unified search failed", {
          domain: validDomain,
          query: validQuery,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to search: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Convert URL tool - convert between web URLs and ActivityPub URIs.
 */
function registerConvertUrlTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "convert-url",
    {
      title: "Convert URL",
      description:
        "Convert between web URLs and ActivityPub URIs (e.g., https://mastodon.social/@user/123 <-> ActivityPub URI)",
      inputSchema: {
        url: z.string().url().describe("The URL to convert"),
        direction: z
          .enum(["to-activitypub", "to-web", "auto"])
          .optional()
          .describe("Conversion direction: to-activitypub, to-web, or auto-detect (default: auto)"),
      },
    },
    async ({ url, direction = "auto" }) => {
      const requestId = performanceMonitor.startRequest("convert-url", { url, direction });

      try {
        const domain = new URL(url).hostname;
        checkRateLimit(rateLimiter, domain);

        logger.info("Converting URL", { url, direction });

        let result: { url: string; type: string; domain: string };

        if (direction === "to-activitypub" || (direction === "auto" && url.includes("/@"))) {
          const converted = await remoteClient.convertWebUrlToActivityPub(url);
          result = {
            url: converted.activityPubUri,
            type: converted.type,
            domain: converted.domain,
          };
        } else if (direction === "to-web") {
          const converted = remoteClient.convertActivityPubToWebUrl(url);
          result = { url: converted.webUrl, type: converted.type, domain: converted.domain };
        } else {
          // Auto-detect: try to determine if it's already an ActivityPub URI
          const isActivityPub =
            url.includes("/users/") || url.includes("/statuses/") || url.includes("/objects/");

          if (isActivityPub) {
            const converted = remoteClient.convertActivityPubToWebUrl(url);
            result = { url: converted.webUrl, type: converted.type, domain: converted.domain };
          } else {
            const converted = await remoteClient.convertWebUrlToActivityPub(url);
            result = {
              url: converted.activityPubUri,
              type: converted.type,
              domain: converted.domain,
            };
          }
        }

        performanceMonitor.endRequest(requestId, true);

        const typeEmoji = result.type === "actor" ? "👤" : result.type === "post" ? "📝" : "❓";

        return {
          content: [
            {
              type: "text",
              text: `🔄 **URL Conversion**

**Input**: ${url}
**Output**: ${result.url}
**Type**: ${typeEmoji} ${result.type}
**Domain**: ${result.domain}

💡 **Tips:**
- Use the converted URL with other tools like \`get-post-thread\` or \`discover-actor\`
- ActivityPub URIs are used for federation, web URLs are for browsers`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed to convert URL", { url, error: errorMessage });

        return {
          content: [
            {
              type: "text",
              text: `Failed to convert URL: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Batch fetch actors tool.
 */
function registerBatchFetchActorsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "batch-fetch-actors",
    {
      title: "Batch Fetch Actors",
      description: "Fetch multiple actor profiles at once for efficient bulk lookups",
      inputSchema: {
        identifiers: z
          .array(z.string())
          .min(1)
          .max(20)
          .describe(
            "Array of actor identifiers (e.g., ['user1@mastodon.social', 'user2@fosstodon.org'])",
          ),
      },
    },
    async ({ identifiers }) => {
      const requestId = performanceMonitor.startRequest("batch-fetch-actors", {
        count: identifiers.length,
      });

      try {
        // Check rate limit for each unique domain
        const domains = new Set(identifiers.map((id) => id.split("@").pop()?.toLowerCase()));
        for (const domain of domains) {
          if (domain) {
            checkRateLimit(rateLimiter, domain);
          }
        }

        logger.info("Batch fetching actors", { count: identifiers.length });

        const result = await remoteClient.batchFetchActors(identifiers);
        performanceMonitor.endRequest(requestId, true);

        const successList = result.results
          .filter(
            (r): r is typeof r & { actor: NonNullable<typeof r.actor> } =>
              r.actor !== null && r.actor !== undefined,
          )
          .map((r, i) => {
            const actor = r.actor;
            return `${i + 1}. ✅ **${actor.preferredUsername || r.identifier}** (@${r.identifier})
   ${actor.name || "No display name"} - ${actor.summary?.slice(0, 100) || "No bio"}...`;
          })
          .join("\n\n");

        const failedList = result.results
          .filter((r) => r.error)
          .map((r) => `• ❌ ${r.identifier}: ${r.error}`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `👥 **Batch Actor Fetch Results**

**Summary**: ${result.successful} successful, ${result.failed} failed

${successList ? `**Successful Fetches:**\n${successList}` : ""}

${failedList ? `**Failed Fetches:**\n${failedList}` : ""}

💡 **Tips:**
- Use \`fetch-timeline\` to see posts from any of these actors
- Failed fetches may be due to rate limits or private accounts`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed batch fetch actors", { error: errorMessage });

        return {
          content: [
            {
              type: "text",
              text: `Failed to batch fetch actors: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Batch fetch posts tool.
 */
function registerBatchFetchPostsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "batch-fetch-posts",
    {
      title: "Batch Fetch Posts",
      description: "Fetch multiple posts at once for efficient bulk lookups",
      inputSchema: {
        postUrls: z.array(z.string().url()).min(1).max(20).describe("Array of post URLs to fetch"),
      },
    },
    async ({ postUrls }) => {
      const requestId = performanceMonitor.startRequest("batch-fetch-posts", {
        count: postUrls.length,
      });

      try {
        // Check rate limit for each unique domain
        const domains = new Set(postUrls.map((url) => new URL(url).hostname));
        for (const domain of domains) {
          checkRateLimit(rateLimiter, domain);
        }

        logger.info("Batch fetching posts", { count: postUrls.length });

        const result = await remoteClient.batchFetchPosts(postUrls);
        performanceMonitor.endRequest(requestId, true);

        const successList = result.results
          .filter(
            (r): r is typeof r & { post: NonNullable<typeof r.post> } =>
              r.post !== null && r.post !== undefined,
          )
          .map((r, i) => {
            const post = r.post;
            const content = stripHtmlTags(post.content || post.summary || "No content");
            const truncated = content.length > 150 ? `${content.slice(0, 150)}...` : content;
            return `${i + 1}. ✅ ${truncated}`;
          })
          .join("\n\n");

        const failedList = result.results
          .filter((r) => r.error)
          .map((r) => `• ❌ ${r.url}: ${r.error}`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `📝 **Batch Post Fetch Results**

**Summary**: ${result.successful} successful, ${result.failed} failed

${successList ? `**Successful Fetches:**\n${successList}` : ""}

${failedList ? `**Failed Fetches:**\n${failedList}` : ""}

💡 **Tips:**
- Use \`get-post-thread\` to see the full conversation for any post
- Failed fetches may be due to deleted posts or private visibility`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        performanceMonitor.endRequest(requestId, false, errorMessage);

        logger.error("Failed batch fetch posts", { error: errorMessage });

        return {
          content: [
            {
              type: "text",
              text: `Failed to batch fetch posts: ${formatErrorWithSuggestion(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
