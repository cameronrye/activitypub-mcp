/**
 * MCP Tool handlers for ActivityPub operations.
 *
 * This module defines all MCP tools that provide operations for
 * discovering and interacting with ActivityPub/Fediverse content.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CallToolResult, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { remoteClient } from "../activitypub/remote-client.js";
import { dynamicInstanceDiscovery } from "../discovery/dynamic-instance-discovery.js";
import type { RateLimiter } from "../resilience/rate-limiter.js";
import { formatRemoteError, getErrorMessage } from "../utils/errors.js";
import { sanitizeInline, wrapUntrusted } from "../utils/untrusted.js";
import { ActorIdentifierSchema, DomainSchema, QuerySchema } from "../validation/schemas.js";
import {
  validateActorIdentifier,
  validateDomain,
  validateQuery,
} from "../validation/validators.js";
import { trackedMcpServer } from "./capabilities.js";
import { registerWriteTools } from "./tools-write.js";

const logger = getLogger("activitypub-mcp:tools");

/**
 * Registers all MCP tools on the server.
 *
 * @param mcpServer - The MCP server instance
 * @param rateLimiter - The rate limiter instance
 */
export function registerTools(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  trackedMcpServer(mcpServer);

  // Discovery tools
  registerDiscoverActorTool(mcpServer, rateLimiter);
  registerDiscoverInstancesLiveTool(mcpServer, rateLimiter);

  // Content tools
  registerFetchTimelineTool(mcpServer, rateLimiter);
  registerGetPostThreadTool(mcpServer, rateLimiter);
  registerUnifiedSearchTool(mcpServer, rateLimiter);

  // Timeline tools
  registerGetTrendingHashtagsTool(mcpServer, rateLimiter);
  registerGetTrendingPostsTool(mcpServer, rateLimiter);
  registerGetPublicTimelineTool(mcpServer, rateLimiter);

  // Instance tools
  registerGetInstanceInfoTool(mcpServer, rateLimiter);

  // Write operation tools (authenticated)
  registerWriteTools(mcpServer, rateLimiter);
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
 * Wraps a read tool's body with the shared failure handling: log the error with
 * the given context and return an `isError` text result carrying the
 * failure-prefixed, suggestion-augmented message. Any input validation that must
 * surface as a protocol error (e.g. an McpError from a validator) is expected to
 * run BEFORE this call, outside the wrapped `run`, mirroring the read tools'
 * existing contract. Companion to `withWriteTool` in tools-write.ts.
 */
async function withReadTool(
  failurePrefix: string,
  logContext: Record<string, unknown>,
  run: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error(failurePrefix, { ...logContext, error: errorMessage });
    return {
      content: [{ type: "text", text: `${failurePrefix}: ${formatRemoteError(errorMessage)}` }],
      isError: true,
    };
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
      description:
        "Find and retrieve the profile of any fediverse user or account (called an 'actor' " +
        "in ActivityPub). Returns display name, bio, follower/following URLs, and inbox/outbox " +
        "endpoints. Pass a handle like '@alice@mastodon.social' or 'alice@mastodon.social'.",
      inputSchema: {
        identifier: ActorIdentifierSchema.describe(
          "Actor handle in 'user@domain' or '@user@domain' form (e.g., 'alice@mastodon.social')",
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ identifier }) => {
      const validIdentifier = validateActorIdentifier(identifier);

      try {
        checkRateLimit(rateLimiter, validIdentifier);

        logger.info("Discovering actor", { identifier: validIdentifier });

        const actor = await remoteClient.fetchRemoteActor(validIdentifier);

        return {
          content: [
            {
              type: "text",
              text: `Successfully discovered actor: ${sanitizeInline(actor.preferredUsername || actor.name || "") || validIdentifier}

🆔 ID: ${sanitizeInline(actor.id)}
👤 Name: ${sanitizeInline(actor.name || "") || "Not specified"}
📝 Summary: ${actor.summary ? wrapUntrusted(actor.summary, `bio of ${validIdentifier}`) : "No bio provided"}
🔗 URL: ${sanitizeInline(actor.url || actor.id)}
📥 Inbox: ${sanitizeInline(actor.inbox)}
📤 Outbox: ${sanitizeInline(actor.outbox)}
👥 Followers: ${sanitizeInline(actor.followers || "") || "Not available"}
👤 Following: ${sanitizeInline(actor.following || "") || "Not available"}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);

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
              text: `Failed to discover actor: ${formatRemoteError(errorMessage)}`,
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
      description:
        "Fetch recent posts (the outbox) from any fediverse actor — a user or account — " +
        "with cursor- and ID-based pagination. Pass a handle like 'alice@mastodon.social'.",
      inputSchema: {
        identifier: ActorIdentifierSchema.describe("Actor identifier (e.g., user@example.social)"),
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
        minId: z.string().optional().describe("Return posts newer than this post ID (pagination)"),
        maxId: z.string().optional().describe("Return posts older than this post ID (pagination)"),
        sinceId: z.string().optional().describe("Return posts more recent than this post ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ identifier, limit = 20, cursor, minId, maxId, sinceId }) => {
      const validIdentifier = validateActorIdentifier(identifier);

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

        const posts = timeline.items;
        const postCount = posts.length;

        // Build pagination info section
        const paginationInfo = [];
        if (timeline.hasMore && timeline.nextCursor) {
          paginationInfo.push(`📄 Next page cursor: ${sanitizeInline(timeline.nextCursor)}`);
        }
        if (timeline.prevCursor) {
          paginationInfo.push(`📄 Previous page cursor: ${sanitizeInline(timeline.prevCursor)}`);
        }

        // Format pagination section
        const paginationSection =
          paginationInfo.length > 0 ? `**Pagination:**\n${paginationInfo.join("\n")}\n` : "";

        // Format posts section
        const postsSection = posts
          .map((post: unknown, index: number) => {
            const p = post as { type?: string; content?: string; summary?: string; id?: string };
            const content = wrapUntrusted(
              p.content || p.summary || "",
              `post by ${validIdentifier}`,
            );
            const postType = sanitizeInline(p.type || "") || "Post";
            return `${index + 1}. [${postType}] ${content}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Successfully fetched timeline for ${validIdentifier}

📊 Total items: ${timeline.totalItems || "Unknown"}
📝 Posts retrieved: ${postCount}
🔗 Collection ID: ${sanitizeInline(timeline.collectionId)}
${timeline.hasMore ? "📄 More posts available (use cursor for next page)" : "📄 No more posts"}

${paginationSection}
**Recent posts:**
${postsSection}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);

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
              text: `Failed to fetch timeline: ${formatRemoteError(errorMessage)}`,
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
      description:
        "Get detailed information about a fediverse instance: software and version, " +
        "description, registration policy, supported languages, user/post/domain counts, " +
        "and contact account.",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., example.social)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ domain }) => {
      const validDomain = validateDomain(domain);

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Getting instance info", { domain: validDomain });

        const instanceInfo = await remoteClient.getInstanceInfo(validDomain);

        return {
          content: [
            {
              type: "text",
              text: `Instance Information for ${validDomain}:

🌐 Domain: ${instanceInfo.domain}
💻 Software: ${sanitizeInline(instanceInfo.software || "") || "Unknown"}
📦 Version: ${sanitizeInline(instanceInfo.version || "") || "Unknown"}
📝 Description: ${instanceInfo.description ? wrapUntrusted(instanceInfo.description, `instance description of ${validDomain}`) : "No description"}
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

${instanceInfo.contact_account ? `📞 Contact: @${sanitizeInline(instanceInfo.contact_account.username || "")} (${sanitizeInline(instanceInfo.contact_account.display_name || "") || "No display name"})` : ""}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);

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
              text: `Failed to get instance info: ${formatRemoteError(errorMessage)}`,
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
/**
 * Discover instances tool - fetches real-time data from instances.social API
 */
function registerDiscoverInstancesLiveTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "discover-instances",
    {
      title: "Discover Fediverse Instances",
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
      annotations: { readOnlyHint: true },
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
      try {
        checkRateLimit(rateLimiter, "discover-instances");

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
              `${index + 1}. **${sanitizeInline(instance.domain || "")}**`,
              instance.software ? `(${sanitizeInline(instance.software)})` : "",
            ];

            const details = [];
            if (instance.users !== undefined) {
              details.push(`👥 ${instance.users.toLocaleString()} users`);
            }
            if (instance.language) {
              details.push(`🌐 ${sanitizeInline(instance.language)}`);
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
              parts.push(
                `\n   📝 ${wrapUntrusted(desc, `instance description of ${instance.domain}`)}`,
              );
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

        logger.error("Failed to discover instances live", { error: errorMessage });

        return {
          content: [
            {
              type: "text",
              text: `Failed to discover instances: ${formatRemoteError(errorMessage)}`,
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
      annotations: { readOnlyHint: true },
    },
    async ({ postUrl, depth = 2, maxReplies = 50 }) => {
      return withReadTool("Failed to fetch post thread", { postUrl }, async () => {
        const domain = new URL(postUrl).hostname;
        checkRateLimit(rateLimiter, domain);

        logger.info("Fetching post thread", { postUrl, depth, maxReplies });

        const thread = await remoteClient.fetchPostThread(postUrl, { depth, maxReplies });

        // Format ancestors
        const ancestorsSection =
          thread.ancestors.length > 0
            ? `**Conversation Context** (${thread.ancestors.length} parent posts):\n${thread.ancestors
                .map((a, i) => {
                  const content = wrapUntrusted(a.content || a.summary || "", `post on ${domain}`);
                  return `${i + 1}. ${content}`;
                })
                .join("\n")}\n\n`
            : "";

        // Format main post
        const postContent = wrapUntrusted(
          thread.post.content || thread.post.summary || "",
          `post on ${domain}`,
        );
        const spoilerText =
          thread.post.summary && thread.post.content
            ? `⚠️ CW: ${wrapUntrusted(thread.post.summary, `content warning on ${domain}`)}\n`
            : "";

        // Format replies
        const repliesSection =
          thread.replies.length > 0
            ? `**Replies** (${thread.replies.length} of ${thread.totalReplies} total):\n${thread.replies
                .slice(0, 10)
                .map((r, i) => {
                  const stub = r as unknown as { crossOrigin?: boolean; fetched?: boolean };
                  if (stub.crossOrigin === true && stub.fetched === false) {
                    return `${i + 1}. _(cross-origin, not fetched)_ ${sanitizeInline(r.id)}`;
                  }
                  const content = wrapUntrusted(r.content || r.summary || "", `post on ${domain}`);
                  const cw =
                    r.summary && r.content
                      ? `[CW: ${wrapUntrusted(r.summary, `content warning on ${domain}`)}] `
                      : "";
                  return `${i + 1}. ${cw}${content}`;
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

🔗 URL: ${sanitizeInline(thread.post.url || thread.post.id)}
📅 Published: ${sanitizeInline(thread.post.published || "") || "Unknown"}

${repliesSection}

💡 **Tips:**
- Use \`discover-actor\` to learn more about the post author
- Use \`fetch-timeline\` to see more posts from this user`,
            },
          ],
        };
      });
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
      description:
        "Get currently trending hashtags on a fediverse instance (Mastodon-compatible " +
        "instances that expose a trends API).",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of hashtags to fetch (default: 20)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ domain, limit = 20 }) => {
      const validDomain = validateDomain(domain);

      return withReadTool(
        "Failed to fetch trending hashtags",
        { domain: validDomain },
        async () => {
          checkRateLimit(rateLimiter, validDomain);

          logger.info("Fetching trending hashtags", { domain: validDomain, limit });

          const result = await remoteClient.fetchTrendingHashtags(validDomain, { limit });

          const hashtagsList = result.hashtags
            .map((tag, i) => {
              const history = tag.history?.[0];
              // uses/accounts are unvalidated remote strings — coerce to numbers so
              // an injected payload can't ride along (matches the unified-search path).
              const uses = Number.parseInt(history?.uses ?? "", 10);
              const accounts = Number.parseInt(history?.accounts ?? "", 10);
              return `${i + 1}. **#${sanitizeInline(tag.name || "")}** - ${Number.isFinite(uses) ? uses : "?"} uses by ${Number.isFinite(accounts) ? accounts : "?"} accounts`;
            })
            .join("\n");

          return {
            content: [
              {
                type: "text",
                text: `📈 **Trending Hashtags on ${validDomain}**

${hashtagsList || "No trending hashtags found"}

💡 **Tips:**
- Use \`search\` with \`type: "hashtags"\` to explore posts with a specific hashtag
- Use \`get-public-timeline\` to see recent posts from this instance`,
              },
            ],
          };
        },
      );
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
      description:
        "Get currently trending posts on a fediverse instance (Mastodon-compatible " +
        "instances that expose a trends API).",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain (e.g., mastodon.social)"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of posts to fetch (default: 20)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ domain, limit = 20 }) => {
      const validDomain = validateDomain(domain);

      return withReadTool("Failed to fetch trending posts", { domain: validDomain }, async () => {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching trending posts", { domain: validDomain, limit });

        const result = await remoteClient.fetchTrendingPosts(validDomain, { limit });

        const postsList = result.posts
          .slice(0, 10)
          .map((post, i) => {
            const content = wrapUntrusted(post.content || "", `post on ${validDomain}`);
            const cw = post.spoiler_text
              ? `⚠️ CW: ${wrapUntrusted(post.spoiler_text, `content warning on ${validDomain}`)}\n`
              : "";
            return `${i + 1}. **@${sanitizeInline(post.account.username || "")}** (${sanitizeInline(post.account.display_name || post.account.username || "")})
   ${cw}${content}
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
      });
    },
  );
}

/**
 * Get public timeline tool (local or federated scope).
 */
function registerGetPublicTimelineTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-public-timeline",
    {
      title: "Get Public Timeline",
      description:
        "Fetch an instance's public timeline. scope 'federated' (default) shows " +
        "posts the instance has seen from across the fediverse; 'local' shows only " +
        "posts authored on that instance.",
      inputSchema: {
        domain: DomainSchema.describe("Instance domain, e.g. mastodon.social"),
        scope: z.enum(["local", "federated"]).optional().describe("default: federated"),
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of posts to fetch (default: 20)"),
        maxId: z.string().optional().describe("Return results older than this ID (for pagination)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ domain, scope = "federated", limit = 20, maxId }) => {
      const validDomain = validateDomain(domain);

      try {
        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching public timeline", { domain: validDomain, scope, limit, maxId });

        const result =
          scope === "local"
            ? await remoteClient.fetchLocalTimeline(validDomain, { limit, maxId })
            : await remoteClient.fetchFederatedTimeline(validDomain, { limit, maxId });

        const postsList = result.posts
          .slice(0, 15)
          .map((post, i) => {
            const content = wrapUntrusted(post.content || "", `post on ${validDomain}`);
            const cw = post.spoiler_text
              ? `⚠️ CW: ${wrapUntrusted(post.spoiler_text, `content warning on ${validDomain}`)}\n`
              : "";
            return `${i + 1}. **@${sanitizeInline(post.account.username || "")}**
   ${cw}${content}
   ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}`;
          })
          .join("\n\n");

        const paginationInfo =
          result.hasMore && result.nextMaxId
            ? `\n📄 **More posts available** - use maxId: "${result.nextMaxId}" for next page`
            : "";

        const header =
          scope === "local"
            ? `🏠 **Local Timeline for ${validDomain}**`
            : `🌐 **Federated Timeline via ${validDomain}**`;

        return {
          content: [
            {
              type: "text",
              text: `${header}

${postsList || "No posts found"}${paginationInfo}

💡 **Tips:**
- Use scope "local" to see posts from ${validDomain} users only
- Use scope "federated" to see posts from all connected instances
- Use \`get-trending-posts\` to see what's popular`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);

        logger.error("Failed to fetch public timeline", {
          domain: validDomain,
          scope,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch ${scope} timeline: ${formatRemoteError(errorMessage)}`,
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
      annotations: { readOnlyHint: true },
    },
    async ({ query, domain = "mastodon.social", type = "all", limit = 10 }) => {
      const validDomain = validateDomain(domain);
      const validQuery = validateQuery(query);

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
                const note = wrapUntrusted(acc.note || "", `bio on ${validDomain}`);
                return `${i + 1}. **@${sanitizeInline(acc.acct || "")}** (${sanitizeInline(acc.display_name || acc.username || "")})
   👥 ${acc.followers_count || 0} followers | ${note}`;
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
                const content = wrapUntrusted(post.content || "", `post on ${validDomain}`);
                const cw = post.spoiler_text
                  ? `⚠️ CW: ${wrapUntrusted(post.spoiler_text, `content warning on ${validDomain}`)}\n`
                  : "";
                return `${i + 1}. **@${sanitizeInline(post.account.acct || "")}**
   ${cw}${content}
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
                return `${i + 1}. **#${sanitizeInline(tag.name || "")}** - ${recentUses} uses (last 7 days)`;
              })
              .join("\n");
            sections.push(`## #️⃣ Hashtags (${hashtags.length})\n\n${hashtagsList}`);
          } else if (type === "hashtags") {
            sections.push("## #️⃣ Hashtags\n\nNo hashtags found.");
          }
        }

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

        logger.error("Unified search failed", {
          domain: validDomain,
          query: validQuery,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to search: ${formatRemoteError(errorMessage)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
