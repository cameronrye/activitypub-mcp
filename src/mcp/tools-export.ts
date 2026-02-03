/**
 * MCP Export Tools for content archival and export.
 *
 * These tools allow exporting fediverse content in various formats
 * for archival, analysis, or migration purposes.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { performanceMonitor } from "../performance-monitor.js";
import { remoteClient } from "../remote-client.js";
import { validateActorIdentifier, validateDomain } from "../server/index.js";
import type { RateLimiter } from "../server/rate-limiter.js";
import { formatErrorWithSuggestion, getErrorMessage, stripHtmlTags } from "../utils.js";

const logger = getLogger("activitypub-mcp:tools-export");

/**
 * Export format options
 */
export type ExportFormat = "json" | "markdown" | "csv";

/**
 * Registers all export tools.
 */
export function registerExportTools(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  registerExportTimelineTool(mcpServer, rateLimiter);
  registerExportThreadTool(mcpServer, rateLimiter);
  registerExportAccountInfoTool(mcpServer, rateLimiter);
  registerExportHashtagTool(mcpServer, rateLimiter);
}

/**
 * Helper to check rate limit.
 */
function checkRateLimit(rateLimiter: RateLimiter, identifier: string): void {
  if (!rateLimiter.checkLimit(identifier)) {
    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
  }
}

/**
 * Format a post for different export formats.
 */
function formatPost(
  post: {
    id?: string;
    content?: string;
    summary?: string;
    published?: string;
    url?: string;
    attributedTo?: string;
  },
  format: ExportFormat,
): string {
  const content = post.content || post.summary || "No content";
  const cleanContent = stripHtmlTags(content);
  const published = post.published || "Unknown date";
  const url = post.url || post.id || "No URL";
  const author = post.attributedTo || "Unknown author";

  switch (format) {
    case "json":
      return JSON.stringify(post, null, 2);

    case "markdown":
      return `## Post

**Author:** ${author}
**Date:** ${published}
**URL:** ${url}

${cleanContent}

---
`;

    case "csv": {
      // Escape CSV fields
      const escapeCSV = (field: string) => {
        if (field.includes(",") || field.includes('"') || field.includes("\n")) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      };
      return `${escapeCSV(post.id || "")},${escapeCSV(author)},${escapeCSV(published)},${escapeCSV(cleanContent)},${escapeCSV(url)}`;
    }

    default:
      return cleanContent;
  }
}

/**
 * Export timeline tool.
 */
function registerExportTimelineTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "export-timeline",
    {
      title: "Export Timeline",
      description: "Export an actor's timeline/posts to JSON, Markdown, or CSV format",
      inputSchema: {
        identifier: z.string().describe("Actor identifier (e.g., user@mastodon.social)"),
        format: z
          .enum(["json", "markdown", "csv"])
          .optional()
          .describe("Export format (default: markdown)"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of posts to export (default: 20)"),
        includeBoosts: z.boolean().optional().describe("Include boosted posts (default: true)"),
        includeReplies: z.boolean().optional().describe("Include replies (default: false)"),
      },
    },
    async ({
      identifier,
      format = "markdown",
      limit = 20,
      includeBoosts = true,
      includeReplies = false,
    }) => {
      const validIdentifier = validateActorIdentifier(identifier);
      checkRateLimit(rateLimiter, validIdentifier);

      const requestId = performanceMonitor.startRequest("export-timeline", {
        identifier: validIdentifier,
        format,
        limit,
      });

      try {
        logger.info("Exporting timeline", { identifier: validIdentifier, format, limit });

        // Fetch the timeline
        const timeline = await remoteClient.fetchActorOutboxPaginated(validIdentifier, { limit });
        const posts = timeline.items;

        // Filter posts based on options
        let filteredPosts = posts;
        if (!includeBoosts) {
          filteredPosts = filteredPosts.filter((post: unknown) => {
            const p = post as { type?: string };
            return p.type !== "Announce";
          });
        }
        if (!includeReplies) {
          filteredPosts = filteredPosts.filter((post: unknown) => {
            const p = post as { inReplyTo?: string };
            return !p.inReplyTo;
          });
        }

        // Format the export
        let exportContent: string;
        let fileExtension: string;

        switch (format) {
          case "json":
            exportContent = JSON.stringify(
              {
                actor: validIdentifier,
                exportedAt: new Date().toISOString(),
                totalItems: timeline.totalItems,
                posts: filteredPosts,
              },
              null,
              2,
            );
            fileExtension = "json";
            break;

          case "csv": {
            const csvHeader = "id,author,date,content,url\n";
            const csvRows = filteredPosts
              .map((post: unknown) =>
                formatPost(
                  post as {
                    id?: string;
                    content?: string;
                    summary?: string;
                    published?: string;
                    url?: string;
                    attributedTo?: string;
                  },
                  "csv",
                ),
              )
              .join("\n");
            exportContent = csvHeader + csvRows;
            fileExtension = "csv";
            break;
          }
          default: {
            const header = `# Timeline Export: ${validIdentifier}

**Exported:** ${new Date().toISOString()}
**Total posts available:** ${timeline.totalItems || "Unknown"}
**Posts in export:** ${filteredPosts.length}

---

`;
            const markdownPosts = filteredPosts
              .map((post: unknown) =>
                formatPost(
                  post as {
                    id?: string;
                    content?: string;
                    summary?: string;
                    published?: string;
                    url?: string;
                    attributedTo?: string;
                  },
                  "markdown",
                ),
              )
              .join("\n");
            exportContent = header + markdownPosts;
            fileExtension = "md";
            break;
          }
        }

        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `📦 **Timeline Export Complete**

**Actor:** ${validIdentifier}
**Format:** ${format}
**Posts exported:** ${filteredPosts.length}

---

\`\`\`${fileExtension}
${exportContent.slice(0, 10000)}${exportContent.length > 10000 ? `\n... (truncated, full export has ${exportContent.length} characters)` : ""}
\`\`\`

💡 **Tips:**
- For larger exports, consider pagination with cursor
- Copy the content between the code fences to save as a file`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        logger.error("Failed to export timeline", { identifier, error: getErrorMessage(error) });

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to export timeline: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Export thread tool.
 */
function registerExportThreadTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "export-thread",
    {
      title: "Export Thread",
      description: "Export a post thread (original post and all replies) to JSON or Markdown",
      inputSchema: {
        postUrl: z.string().url().describe("The URL of the post to export"),
        format: z
          .enum(["json", "markdown"])
          .optional()
          .describe("Export format (default: markdown)"),
        depth: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe("How many levels of replies (default: 3)"),
        includeAncestors: z.boolean().optional().describe("Include parent posts (default: true)"),
      },
    },
    async ({ postUrl, format = "markdown", depth = 3, includeAncestors = true }) => {
      const domain = new URL(postUrl).hostname;
      checkRateLimit(rateLimiter, domain);

      const requestId = performanceMonitor.startRequest("export-thread", {
        postUrl,
        format,
        depth,
      });

      try {
        logger.info("Exporting thread", { postUrl, format, depth });

        const thread = await remoteClient.fetchPostThread(postUrl, { depth, maxReplies: 100 });

        let exportContent: string;

        if (format === "json") {
          exportContent = JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              originalPostUrl: postUrl,
              ancestors: includeAncestors ? thread.ancestors : [],
              post: thread.post,
              replies: thread.replies,
              totalReplies: thread.totalReplies,
            },
            null,
            2,
          );
        } else {
          // Markdown format
          const parts: string[] = [];

          parts.push(`# Thread Export

**Original Post:** ${postUrl}
**Exported:** ${new Date().toISOString()}
**Total Replies:** ${thread.totalReplies}

---
`);

          // Ancestors (context)
          if (includeAncestors && thread.ancestors.length > 0) {
            parts.push("## Context (Parent Posts)\n");
            for (const ancestor of thread.ancestors) {
              const content = stripHtmlTags(ancestor.content || ancestor.summary || "No content");
              parts.push(`> **${ancestor.attributedTo || "Unknown"}** (${ancestor.published || "Unknown date"})
> ${content}

`);
            }
            parts.push("---\n");
          }

          // Main post
          parts.push("## Original Post\n");
          const mainContent = stripHtmlTags(
            thread.post.content || thread.post.summary || "No content",
          );
          const cw =
            thread.post.summary && thread.post.content ? `**CW:** ${thread.post.summary}\n\n` : "";
          parts.push(`**Author:** ${thread.post.attributedTo || "Unknown"}
**Date:** ${thread.post.published || "Unknown"}
**URL:** ${thread.post.url || thread.post.id}

${cw}${mainContent}

---
`);

          // Replies
          if (thread.replies.length > 0) {
            parts.push(
              `## Replies (${thread.replies.length} shown, ${thread.totalReplies} total)\n`,
            );
            for (let i = 0; i < thread.replies.length; i++) {
              const reply = thread.replies[i];
              const replyContent = stripHtmlTags(reply.content || reply.summary || "No content");
              const replyCw = reply.summary && reply.content ? `**CW:** ${reply.summary}\n` : "";
              parts.push(`### Reply ${i + 1}

**Author:** ${reply.attributedTo || "Unknown"}
**Date:** ${reply.published || "Unknown"}

${replyCw}${replyContent}

`);
            }
          }

          exportContent = parts.join("\n");
        }

        performanceMonitor.endRequest(requestId, true);

        const fileExtension = format === "json" ? "json" : "md";

        return {
          content: [
            {
              type: "text",
              text: `🧵 **Thread Export Complete**

**Post:** ${postUrl}
**Format:** ${format}
**Ancestors:** ${thread.ancestors.length}
**Replies:** ${thread.replies.length} of ${thread.totalReplies}

---

\`\`\`${fileExtension}
${exportContent.slice(0, 15000)}${exportContent.length > 15000 ? `\n... (truncated, full export has ${exportContent.length} characters)` : ""}
\`\`\``,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        logger.error("Failed to export thread", { postUrl, error: getErrorMessage(error) });

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to export thread: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Export account info tool.
 */
function registerExportAccountInfoTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "export-account-info",
    {
      title: "Export Account Info",
      description: "Export comprehensive account information for archival or analysis",
      inputSchema: {
        identifier: z.string().describe("Actor identifier (e.g., user@mastodon.social)"),
        includeTimeline: z.boolean().optional().describe("Include recent timeline (default: true)"),
        includeFollowers: z.boolean().optional().describe("Include follower list (default: false)"),
        includeFollowing: z
          .boolean()
          .optional()
          .describe("Include following list (default: false)"),
        timelineLimit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Number of timeline posts (default: 20)"),
      },
    },
    async ({
      identifier,
      includeTimeline = true,
      includeFollowers = false,
      includeFollowing = false,
      timelineLimit = 20,
    }) => {
      const validIdentifier = validateActorIdentifier(identifier);
      checkRateLimit(rateLimiter, validIdentifier);

      const requestId = performanceMonitor.startRequest("export-account-info", {
        identifier: validIdentifier,
      });

      try {
        logger.info("Exporting account info", { identifier: validIdentifier });

        // Fetch actor info
        const actor = await remoteClient.fetchRemoteActor(validIdentifier);

        const exportData: Record<string, unknown> = {
          exportedAt: new Date().toISOString(),
          account: {
            id: actor.id,
            type: actor.type,
            username: actor.preferredUsername,
            name: actor.name,
            summary: actor.summary,
            url: actor.url || actor.id,
            inbox: actor.inbox,
            outbox: actor.outbox,
            followers: actor.followers,
            following: actor.following,
            icon: actor.icon,
            image: actor.image,
            endpoints: actor.endpoints,
          },
        };

        // Optionally fetch timeline
        if (includeTimeline) {
          try {
            const timeline = await remoteClient.fetchActorOutboxPaginated(validIdentifier, {
              limit: timelineLimit,
            });
            exportData.timeline = {
              totalItems: timeline.totalItems,
              posts: timeline.items,
            };
          } catch (e) {
            exportData.timeline = { error: getErrorMessage(e) };
          }
        }

        // Optionally fetch followers
        if (includeFollowers) {
          try {
            const followers = await remoteClient.fetchActorFollowers(validIdentifier, 50);
            exportData.followers = {
              totalItems: followers.totalItems,
              items: followers.orderedItems || followers.items || [],
            };
          } catch (e) {
            exportData.followers = { error: getErrorMessage(e) };
          }
        }

        // Optionally fetch following
        if (includeFollowing) {
          try {
            const following = await remoteClient.fetchActorFollowing(validIdentifier, 50);
            exportData.following = {
              totalItems: following.totalItems,
              items: following.orderedItems || following.items || [],
            };
          } catch (e) {
            exportData.following = { error: getErrorMessage(e) };
          }
        }

        performanceMonitor.endRequest(requestId, true);

        const jsonExport = JSON.stringify(exportData, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `👤 **Account Export Complete**

**Account:** ${validIdentifier}
**Name:** ${actor.name || actor.preferredUsername || "Unknown"}
**URL:** ${actor.url || actor.id}

**Included Data:**
- Profile info: ✅
- Timeline: ${includeTimeline ? `✅ (${timelineLimit} posts)` : "❌"}
- Followers: ${includeFollowers ? "✅" : "❌"}
- Following: ${includeFollowing ? "✅" : "❌"}

---

\`\`\`json
${jsonExport.slice(0, 12000)}${jsonExport.length > 12000 ? "\n... (truncated)" : ""}
\`\`\``,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        logger.error("Failed to export account info", {
          identifier,
          error: getErrorMessage(error),
        });

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to export account: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/**
 * Export hashtag posts tool.
 */
function registerExportHashtagTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "export-hashtag",
    {
      title: "Export Hashtag Posts",
      description: "Export posts containing a specific hashtag from an instance",
      inputSchema: {
        domain: z.string().describe("Instance domain (e.g., mastodon.social)"),
        hashtag: z.string().describe("Hashtag to export (without #)"),
        format: z
          .enum(["json", "markdown", "csv"])
          .optional()
          .describe("Export format (default: markdown)"),
        limit: z.number().min(1).max(100).optional().describe("Number of posts (default: 40)"),
      },
    },
    async ({ domain, hashtag, format = "markdown", limit = 40 }) => {
      const validDomain = validateDomain(domain);
      const cleanHashtag = hashtag.replace(/^#/, "");
      checkRateLimit(rateLimiter, validDomain);

      const requestId = performanceMonitor.startRequest("export-hashtag", {
        domain: validDomain,
        hashtag: cleanHashtag,
        format,
        limit,
      });

      try {
        logger.info("Exporting hashtag posts", {
          domain: validDomain,
          hashtag: cleanHashtag,
          limit,
        });

        // Search for posts with the hashtag
        const results = (await remoteClient.searchInstance(
          validDomain,
          `#${cleanHashtag}`,
          "statuses",
        )) as {
          statuses?: Array<{
            id: string;
            content: string;
            created_at: string;
            account: { username: string; acct: string; display_name?: string };
            url: string;
            reblogs_count: number;
            favourites_count: number;
            replies_count: number;
            spoiler_text?: string;
          }>;
        };

        const posts = results.statuses || [];

        let exportContent: string;
        let fileExtension: string;

        switch (format) {
          case "json":
            exportContent = JSON.stringify(
              {
                hashtag: cleanHashtag,
                instance: validDomain,
                exportedAt: new Date().toISOString(),
                postCount: posts.length,
                posts: posts.slice(0, limit),
              },
              null,
              2,
            );
            fileExtension = "json";
            break;

          case "csv": {
            const csvHeader = "id,author,date,content,url,favourites,boosts,replies\n";
            const csvRows = posts
              .slice(0, limit)
              .map((post) => {
                const escapeCSV = (field: string) => {
                  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
                    return `"${field.replace(/"/g, '""')}"`;
                  }
                  return field;
                };
                const content = stripHtmlTags(post.content);
                return `${post.id},${escapeCSV(post.account.acct)},${post.created_at},${escapeCSV(content)},${post.url},${post.favourites_count},${post.reblogs_count},${post.replies_count}`;
              })
              .join("\n");
            exportContent = csvHeader + csvRows;
            fileExtension = "csv";
            break;
          }
          default: {
            const header = `# Hashtag Export: #${cleanHashtag}

**Instance:** ${validDomain}
**Exported:** ${new Date().toISOString()}
**Posts found:** ${posts.length}

---

`;
            const markdownPosts = posts
              .slice(0, limit)
              .map((post, i) => {
                const content = stripHtmlTags(post.content);
                const cw = post.spoiler_text ? `**CW:** ${post.spoiler_text}\n\n` : "";
                return `## Post ${i + 1}

**Author:** @${post.account.acct} (${post.account.display_name || post.account.username})
**Date:** ${post.created_at}
**URL:** ${post.url}

${cw}${content}

**Stats:** ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}

---
`;
              })
              .join("\n");
            exportContent = header + markdownPosts;
            fileExtension = "md";
            break;
          }
        }

        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `#️⃣ **Hashtag Export Complete**

**Hashtag:** #${cleanHashtag}
**Instance:** ${validDomain}
**Format:** ${format}
**Posts exported:** ${Math.min(posts.length, limit)}

---

\`\`\`${fileExtension}
${exportContent.slice(0, 12000)}${exportContent.length > 12000 ? "\n... (truncated)" : ""}
\`\`\``,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        logger.error("Failed to export hashtag", {
          domain,
          hashtag,
          error: getErrorMessage(error),
        });

        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to export hashtag: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
