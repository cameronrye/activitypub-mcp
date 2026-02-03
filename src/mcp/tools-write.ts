/**
 * MCP Write Tools for authenticated operations.
 *
 * These tools require an authenticated account and enable posting,
 * boosting, favouriting, and following operations.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { accountManager, authenticatedClient } from "../auth/index.js";
import { performanceMonitor } from "../performance-monitor.js";
import type { RateLimiter } from "../server/rate-limiter.js";
import { formatErrorWithSuggestion, getErrorMessage, stripHtmlTags } from "../utils.js";

const logger = getLogger("activitypub-mcp:tools-write");

/**
 * Registers all write operation tools.
 */
export function registerWriteTools(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  // Account management tools
  registerListAccountsTool(mcpServer);
  registerSwitchAccountTool(mcpServer);
  registerVerifyAccountTool(mcpServer, rateLimiter);

  // Posting tools
  registerPostStatusTool(mcpServer, rateLimiter);
  registerReplyToPostTool(mcpServer, rateLimiter);
  registerDeletePostTool(mcpServer, rateLimiter);

  // Interaction tools
  registerBoostPostTool(mcpServer, rateLimiter);
  registerUnboostPostTool(mcpServer, rateLimiter);
  registerFavouritePostTool(mcpServer, rateLimiter);
  registerUnfavouritePostTool(mcpServer, rateLimiter);
  registerBookmarkPostTool(mcpServer, rateLimiter);
  registerUnbookmarkPostTool(mcpServer, rateLimiter);

  // Follow/relationship tools
  registerFollowAccountTool(mcpServer, rateLimiter);
  registerUnfollowAccountTool(mcpServer, rateLimiter);
  registerMuteAccountTool(mcpServer, rateLimiter);
  registerUnmuteAccountTool(mcpServer, rateLimiter);
  registerBlockAccountTool(mcpServer, rateLimiter);
  registerUnblockAccountTool(mcpServer, rateLimiter);

  // Authenticated timeline tools
  registerGetHomeTimelineTool(mcpServer, rateLimiter);
  registerGetNotificationsTool(mcpServer, rateLimiter);
  registerGetBookmarksTool(mcpServer, rateLimiter);
  registerGetFavouritesTool(mcpServer, rateLimiter);

  // Relationship tools
  registerGetRelationshipTool(mcpServer, rateLimiter);

  // Poll tools
  registerVoteOnPollTool(mcpServer, rateLimiter);

  // Media tools
  registerUploadMediaTool(mcpServer, rateLimiter);

  // Scheduled posts tools
  registerGetScheduledPostsTool(mcpServer, rateLimiter);
  registerCancelScheduledPostTool(mcpServer, rateLimiter);
  registerUpdateScheduledPostTool(mcpServer, rateLimiter);
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
 * Helper to check if write operations are available.
 */
function requireWriteEnabled(): void {
  if (!authenticatedClient.isWriteEnabled()) {
    throw new McpError(
      ErrorCode.InternalError,
      "Write operations require authentication. Configure ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables.",
    );
  }
}

// =============================================================================
// Account Management Tools
// =============================================================================

function registerListAccountsTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "list-accounts",
    {
      title: "List Configured Accounts",
      description: "List all configured authenticated accounts for write operations",
      inputSchema: {},
    },
    async () => {
      const accounts = accountManager.listAccounts();
      const writeStatus = authenticatedClient.getWriteStatus();

      if (accounts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `📭 **No Accounts Configured**

Write operations are currently disabled. To enable write operations, configure authentication:

**Environment Variables:**
- \`ACTIVITYPUB_DEFAULT_INSTANCE\` - Your instance domain (e.g., mastodon.social)
- \`ACTIVITYPUB_DEFAULT_TOKEN\` - Your OAuth access token
- \`ACTIVITYPUB_DEFAULT_USERNAME\` - Your username (optional)

**Getting an Access Token:**
1. Go to your instance's settings → Development → New Application
2. Set the name and required scopes (read, write, follow)
3. Copy the "Your access token" value

💡 For multiple accounts, use \`ACTIVITYPUB_ACCOUNTS=id1:instance1:token1:username1,id2:instance2:token2:username2\``,
            },
          ],
        };
      }

      const accountList = accounts
        .map(
          (acc, i) =>
            `${i + 1}. ${acc.isActive ? "✅" : "⬜"} **${acc.label || acc.username}** (@${acc.username}@${acc.instance})
   ID: \`${acc.id}\` | Scopes: ${acc.scopes.join(", ")}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `👥 **Configured Accounts** (${accounts.length} total)

${accountList}

**Write Status**: ${writeStatus.enabled ? "✅ Enabled" : "❌ Disabled"}
${writeStatus.activeAccount ? `**Active Account**: @${writeStatus.activeAccount.username}@${writeStatus.activeAccount.instance}` : ""}

💡 Use \`switch-account\` to change the active account for write operations.`,
          },
        ],
      };
    },
  );
}

function registerSwitchAccountTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "switch-account",
    {
      title: "Switch Active Account",
      description: "Switch the active account used for write operations",
      inputSchema: {
        accountId: z
          .string()
          .describe("The account ID to switch to (use list-accounts to see IDs)"),
      },
    },
    async ({ accountId }) => {
      const success = accountManager.setActiveAccount(accountId);

      if (!success) {
        return {
          content: [
            {
              type: "text",
              text: `❌ **Account Not Found**

Could not find account with ID: \`${accountId}\`

Use \`list-accounts\` to see available account IDs.`,
            },
          ],
          isError: true,
        };
      }

      const account = accountManager.getAccount(accountId);

      return {
        content: [
          {
            type: "text",
            text: `✅ **Account Switched**

Now using: **@${account?.username}@${account?.instance}**

All write operations will use this account until switched.`,
          },
        ],
      };
    },
  );
}

function registerVerifyAccountTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "verify-account",
    {
      title: "Verify Account Credentials",
      description: "Verify that the account credentials are valid and get account information",
      inputSchema: {
        accountId: z
          .string()
          .optional()
          .describe("The account ID to verify (defaults to active account)"),
      },
    },
    async ({ accountId }) => {
      requireWriteEnabled();

      const targetId = accountId || accountManager.getActiveAccount()?.id;
      if (!targetId) {
        return {
          content: [
            {
              type: "text",
              text: "❌ No account specified and no active account configured.",
            },
          ],
          isError: true,
        };
      }

      const account = accountManager.getAccount(targetId);
      if (!account) {
        return {
          content: [{ type: "text", text: `❌ Account not found: ${targetId}` }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("verify-account", { accountId: targetId });

      try {
        const info = await accountManager.verifyAccount(targetId);
        performanceMonitor.endRequest(requestId, true);

        if (!info) {
          return {
            content: [
              {
                type: "text",
                text: `❌ **Verification Failed**

Account credentials for \`${targetId}\` (@${account.username}@${account.instance}) are invalid or expired.

Please update your access token.`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ **Account Verified**

👤 **${info.display_name || info.username}** (@${info.acct})
🆔 ID: ${info.id}
🔗 ${info.url}

📊 **Stats:**
- Followers: ${info.followers_count.toLocaleString()}
- Following: ${info.following_count.toLocaleString()}
- Posts: ${info.statuses_count.toLocaleString()}

✅ Credentials are valid and working.`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Verification failed: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// =============================================================================
// Posting Tools
// =============================================================================

function registerPostStatusTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "post-status",
    {
      title: "Post Status",
      description: "Create a new post/status on your fediverse account",
      inputSchema: {
        content: z.string().min(1).max(5000).describe("The content of your post"),
        visibility: z
          .enum(["public", "unlisted", "private", "direct"])
          .optional()
          .describe("Post visibility (default: public)"),
        spoilerText: z.string().max(500).optional().describe("Content warning / spoiler text"),
        sensitive: z.boolean().optional().describe("Mark media as sensitive"),
        language: z.string().optional().describe("Language code (ISO 639-1, e.g., 'en')"),
        accountId: z.string().optional().describe("Account ID to post from (defaults to active)"),
      },
    },
    async ({ content, visibility = "public", spoilerText, sensitive, language, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured for posting." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("post-status", {
        instance: account.instance,
        visibility,
      });

      try {
        logger.info("Creating post", { instance: account.instance, visibility });

        const status = await authenticatedClient.createPost(
          {
            content,
            visibility,
            spoilerText,
            sensitive,
            language,
          },
          accountId,
        );

        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Post Created!**

📝 ${stripHtmlTags(status.content).slice(0, 200)}${status.content.length > 200 ? "..." : ""}

🆔 ID: ${status.id}
🔗 ${status.url || status.uri}
👁️ Visibility: ${status.visibility}
${status.spoiler_text ? `⚠️ CW: ${status.spoiler_text}` : ""}

Posted as @${status.account.username}`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to create post: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerReplyToPostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "reply-to-post",
    {
      title: "Reply to Post",
      description: "Reply to an existing post/status",
      inputSchema: {
        statusId: z.string().describe("The ID of the post to reply to"),
        content: z.string().min(1).max(5000).describe("The content of your reply"),
        visibility: z
          .enum(["public", "unlisted", "private", "direct"])
          .optional()
          .describe("Post visibility (default: matches original post)"),
        spoilerText: z.string().max(500).optional().describe("Content warning"),
        accountId: z.string().optional().describe("Account ID to reply from"),
      },
    },
    async ({ statusId, content, visibility, spoilerText, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("reply-to-post", {
        instance: account.instance,
        statusId,
      });

      try {
        const status = await authenticatedClient.createPost(
          {
            content,
            visibility,
            spoilerText,
            inReplyToId: statusId,
          },
          accountId,
        );

        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Reply Posted!**

📝 ${stripHtmlTags(status.content).slice(0, 200)}

🆔 ID: ${status.id}
🔗 ${status.url || status.uri}
↩️ Replying to: ${statusId}`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to reply: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerDeletePostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "delete-post",
    {
      title: "Delete Post",
      description: "Delete one of your own posts",
      inputSchema: {
        statusId: z.string().describe("The ID of your post to delete"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ statusId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("delete-post", {
        instance: account.instance,
        statusId,
      });

      try {
        await authenticatedClient.deletePost(statusId, accountId);
        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Post Deleted**

Post ${statusId} has been deleted.`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to delete post: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// =============================================================================
// Interaction Tools
// =============================================================================

function registerBoostPostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "boost-post",
    {
      title: "Boost Post",
      description: "Boost (reblog) a post to share it with your followers",
      inputSchema: {
        statusId: z.string().describe("The ID of the post to boost"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ statusId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("boost-post", {
        instance: account.instance,
        statusId,
      });

      try {
        const status = await authenticatedClient.boostPost(statusId, accountId);
        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `🔁 **Post Boosted!**

You boosted a post by @${status.account.username}

🔗 ${status.url || status.uri}`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to boost: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerUnboostPostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "unboost-post",
    {
      title: "Unboost Post",
      description: "Remove your boost from a post",
      inputSchema: {
        statusId: z.string().describe("The ID of the post to unboost"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ statusId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        await authenticatedClient.unboostPost(statusId, accountId);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Boost Removed**

Your boost has been removed from post ${statusId}.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to unboost: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerFavouritePostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "favourite-post",
    {
      title: "Favourite Post",
      description: "Add a post to your favourites (like)",
      inputSchema: {
        statusId: z.string().describe("The ID of the post to favourite"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ statusId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const status = await authenticatedClient.favouritePost(statusId, accountId);

        return {
          content: [
            {
              type: "text",
              text: `⭐ **Post Favourited!**

You favourited a post by @${status.account.username}

🔗 ${status.url || status.uri}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to favourite: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerUnfavouritePostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "unfavourite-post",
    {
      title: "Unfavourite Post",
      description: "Remove a post from your favourites",
      inputSchema: {
        statusId: z.string().describe("The ID of the post to unfavourite"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ statusId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        await authenticatedClient.unfavouritePost(statusId, accountId);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Favourite Removed**

Post ${statusId} has been removed from your favourites.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to unfavourite: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerBookmarkPostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "bookmark-post",
    {
      title: "Bookmark Post",
      description: "Add a post to your bookmarks for later",
      inputSchema: {
        statusId: z.string().describe("The ID of the post to bookmark"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ statusId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const status = await authenticatedClient.bookmarkPost(statusId, accountId);

        return {
          content: [
            {
              type: "text",
              text: `🔖 **Post Bookmarked!**

Saved post by @${status.account.username}

🔗 ${status.url || status.uri}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to bookmark: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerUnbookmarkPostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "unbookmark-post",
    {
      title: "Unbookmark Post",
      description: "Remove a post from your bookmarks",
      inputSchema: {
        statusId: z.string().describe("The ID of the post to unbookmark"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ statusId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        await authenticatedClient.unbookmarkPost(statusId, accountId);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Bookmark Removed**

Post ${statusId} has been removed from your bookmarks.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to unbookmark: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// =============================================================================
// Follow/Relationship Tools
// =============================================================================

function registerFollowAccountTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "follow-account",
    {
      title: "Follow Account",
      description: "Follow another fediverse account",
      inputSchema: {
        acct: z
          .string()
          .describe("Account to follow (username@instance or just username for local)"),
        showBoosts: z
          .boolean()
          .optional()
          .describe("Show boosts from this account (default: true)"),
        notify: z
          .boolean()
          .optional()
          .describe("Get notifications when this account posts (default: false)"),
        accountId: z.string().optional().describe("Your account ID to follow from"),
      },
    },
    async ({ acct, showBoosts = true, notify = false, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("follow-account", {
        instance: account.instance,
        acct,
      });

      try {
        // First, lookup the account to get its ID
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);

        const relationship = await authenticatedClient.followAccount(
          targetAccount.id,
          { reblogs: showBoosts, notify },
          accountId,
        );

        performanceMonitor.endRequest(requestId, true);

        const statusText = relationship.requested
          ? "Follow request sent (awaiting approval)"
          : "Now following";

        return {
          content: [
            {
              type: "text",
              text: `✅ **${statusText}** @${acct}

👥 Relationship:
- Following: ${relationship.following ? "Yes" : "Pending"}
- Show Boosts: ${showBoosts ? "Yes" : "No"}
- Notifications: ${notify ? "Enabled" : "Disabled"}`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to follow: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerUnfollowAccountTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "unfollow-account",
    {
      title: "Unfollow Account",
      description: "Unfollow a fediverse account",
      inputSchema: {
        acct: z.string().describe("Account to unfollow (username@instance)"),
        accountId: z.string().optional().describe("Your account ID"),
      },
    },
    async ({ acct, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.unfollowAccount(targetAccount.id, accountId);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Unfollowed** @${acct}

You are no longer following this account.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to unfollow: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerMuteAccountTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "mute-account",
    {
      title: "Mute Account",
      description: "Mute an account (hide their posts from your timelines)",
      inputSchema: {
        acct: z.string().describe("Account to mute"),
        muteNotifications: z
          .boolean()
          .optional()
          .describe("Also mute notifications (default: true)"),
        duration: z
          .number()
          .optional()
          .describe("Mute duration in seconds (0 = indefinite, default: indefinite)"),
        accountId: z.string().optional().describe("Your account ID"),
      },
    },
    async ({ acct, muteNotifications = true, duration = 0, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.muteAccount(
          targetAccount.id,
          { notifications: muteNotifications, duration },
          accountId,
        );

        const durationText = duration > 0 ? `for ${duration} seconds` : "indefinitely";

        return {
          content: [
            {
              type: "text",
              text: `🔇 **Muted** @${acct} ${durationText}

- Notifications muted: ${muteNotifications ? "Yes" : "No"}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to mute: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerUnmuteAccountTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "unmute-account",
    {
      title: "Unmute Account",
      description: "Unmute a previously muted account",
      inputSchema: {
        acct: z.string().describe("Account to unmute"),
        accountId: z.string().optional().describe("Your account ID"),
      },
    },
    async ({ acct, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.unmuteAccount(targetAccount.id, accountId);

        return {
          content: [
            {
              type: "text",
              text: `🔊 **Unmuted** @${acct}

Their posts will now appear in your timelines again.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to unmute: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerBlockAccountTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "block-account",
    {
      title: "Block Account",
      description: "Block an account (prevents them from seeing your posts and vice versa)",
      inputSchema: {
        acct: z.string().describe("Account to block"),
        accountId: z.string().optional().describe("Your account ID"),
      },
    },
    async ({ acct, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.blockAccount(targetAccount.id, accountId);

        return {
          content: [
            {
              type: "text",
              text: `🚫 **Blocked** @${acct}

They can no longer see your posts or interact with you.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to block: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerUnblockAccountTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "unblock-account",
    {
      title: "Unblock Account",
      description: "Unblock a previously blocked account",
      inputSchema: {
        acct: z.string().describe("Account to unblock"),
        accountId: z.string().optional().describe("Your account ID"),
      },
    },
    async ({ acct, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.unblockAccount(targetAccount.id, accountId);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Unblocked** @${acct}

They can now see your posts and interact with you again.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to unblock: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// =============================================================================
// Authenticated Timeline Tools
// =============================================================================

function registerGetHomeTimelineTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-home-timeline",
    {
      title: "Get Home Timeline",
      description: "Get your personalized home timeline (posts from accounts you follow)",
      inputSchema: {
        limit: z.number().min(1).max(40).optional().describe("Number of posts (default: 20)"),
        maxId: z.string().optional().describe("Return posts older than this ID"),
        sinceId: z.string().optional().describe("Return posts newer than this ID"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ limit = 20, maxId, sinceId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const posts = await authenticatedClient.getHomeTimeline(
          { limit, maxId, sinceId },
          accountId,
        );

        const postsList = posts
          .slice(0, 15)
          .map((post, i) => {
            const content = stripHtmlTags(post.content);
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            const cw = post.spoiler_text ? `⚠️ CW: ${post.spoiler_text}\n` : "";
            return `${i + 1}. **@${post.account.acct}**
   ${cw}${truncated}
   ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `🏠 **Your Home Timeline**

${postsList || "No posts found"}

${posts.length > 0 ? `📄 Use maxId: "${posts[posts.length - 1].id}" for next page` : ""}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get timeline: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerGetNotificationsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-notifications",
    {
      title: "Get Notifications",
      description: "Get your notifications (mentions, follows, boosts, favourites)",
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(40)
          .optional()
          .describe("Number of notifications (default: 20)"),
        types: z
          .array(
            z.enum([
              "mention",
              "status",
              "reblog",
              "follow",
              "follow_request",
              "favourite",
              "poll",
              "update",
            ]),
          )
          .optional()
          .describe("Filter by notification types"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ limit = 20, types, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const notifications = await authenticatedClient.getNotifications(
          { limit, types },
          accountId,
        );

        const typeEmoji: Record<string, string> = {
          mention: "💬",
          status: "📝",
          reblog: "🔁",
          follow: "👥",
          follow_request: "📩",
          favourite: "⭐",
          poll: "📊",
          update: "✏️",
        };

        const notificationList = notifications
          .slice(0, 15)
          .map((n) => {
            const emoji = typeEmoji[n.type] || "🔔";
            const statusPreview = n.status
              ? `\n   "${stripHtmlTags(n.status.content).slice(0, 100)}..."`
              : "";
            return `${emoji} **${n.type}** from @${n.account.acct}${statusPreview}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `🔔 **Your Notifications**

${notificationList || "No notifications"}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get notifications: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerGetBookmarksTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-bookmarks",
    {
      title: "Get Bookmarks",
      description: "Get your bookmarked posts",
      inputSchema: {
        limit: z.number().min(1).max(40).optional().describe("Number of posts (default: 20)"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ limit = 20, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const bookmarks = await authenticatedClient.getBookmarks({ limit }, accountId);

        const bookmarkList = bookmarks
          .slice(0, 15)
          .map((post, i) => {
            const content = stripHtmlTags(post.content);
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            return `${i + 1}. **@${post.account.acct}**
   ${truncated}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `🔖 **Your Bookmarks** (${bookmarks.length} posts)

${bookmarkList || "No bookmarks found"}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get bookmarks: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerGetFavouritesTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-favourites",
    {
      title: "Get Favourites",
      description: "Get posts you have favourited",
      inputSchema: {
        limit: z.number().min(1).max(40).optional().describe("Number of posts (default: 20)"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ limit = 20, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const favourites = await authenticatedClient.getFavourites({ limit }, accountId);

        const favouriteList = favourites
          .slice(0, 15)
          .map((post, i) => {
            const content = stripHtmlTags(post.content);
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            return `${i + 1}. **@${post.account.acct}**
   ${truncated}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `⭐ **Your Favourites** (${favourites.length} posts)

${favouriteList || "No favourites found"}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get favourites: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// =============================================================================
// Relationship Tools
// =============================================================================

function registerGetRelationshipTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-relationship",
    {
      title: "Get Relationship",
      description:
        "Check your relationship status with another account (following, followed by, blocking, muting, etc.)",
      inputSchema: {
        acct: z.string().describe("Account to check relationship with (username@instance)"),
        accountId: z.string().optional().describe("Your account ID"),
      },
    },
    async ({ acct, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("get-relationship", {
        instance: account.instance,
        acct,
      });

      try {
        // First, lookup the account to get its ID
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        const relationship = await authenticatedClient.getRelationship(targetAccount.id, accountId);

        performanceMonitor.endRequest(requestId, true);

        const statusItems = [];
        if (relationship.following) statusItems.push("✅ You follow them");
        else statusItems.push("⬜ You don't follow them");

        if (relationship.followed_by) statusItems.push("✅ They follow you");
        else statusItems.push("⬜ They don't follow you");

        if (relationship.requested) statusItems.push("⏳ Follow request pending");
        if (relationship.blocking) statusItems.push("🚫 You are blocking them");
        if (relationship.blocked_by) statusItems.push("🚫 They are blocking you");
        if (relationship.muting) statusItems.push("🔇 You are muting them");
        if (relationship.muting_notifications) statusItems.push("🔕 Muting their notifications");
        if (relationship.domain_blocking) statusItems.push("🌐 Domain blocked");
        if (relationship.endorsed) statusItems.push("⭐ Featured on your profile");

        return {
          content: [
            {
              type: "text",
              text: `👥 **Relationship with @${acct}**

${statusItems.join("\n")}
${relationship.note ? `\n📝 **Note**: ${relationship.note}` : ""}

💡 **Actions:**
- Use \`follow-account\` or \`unfollow-account\` to change follow status
- Use \`mute-account\` or \`block-account\` to manage interactions`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get relationship: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// =============================================================================
// Poll Tools
// =============================================================================

function registerVoteOnPollTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "vote-on-poll",
    {
      title: "Vote on Poll",
      description: "Vote on a poll attached to a post",
      inputSchema: {
        pollId: z.string().describe("The ID of the poll to vote on"),
        choices: z
          .array(z.number().min(0))
          .min(1)
          .describe(
            "Array of choice indices to vote for (0-indexed). For single-choice polls, provide one number.",
          ),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ pollId, choices, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("vote-on-poll", {
        instance: account.instance,
        pollId,
        choices,
      });

      try {
        const poll = await authenticatedClient.voteOnPoll(pollId, choices, accountId);
        performanceMonitor.endRequest(requestId, true);

        const optionsList = poll.options
          .map((opt, i) => {
            const voted = poll.own_votes?.includes(i) ? "✅" : "⬜";
            const percentage =
              poll.votes_count > 0
                ? Math.round(((opt.votes_count || 0) / poll.votes_count) * 100)
                : 0;
            const bar =
              "█".repeat(Math.floor(percentage / 10)) +
              "░".repeat(10 - Math.floor(percentage / 10));
            return `${voted} ${opt.title}\n   ${bar} ${percentage}% (${opt.votes_count || 0} votes)`;
          })
          .join("\n\n");

        const expiryText = poll.expired
          ? "🔒 Poll closed"
          : poll.expires_at
            ? `⏰ Expires: ${new Date(poll.expires_at).toLocaleString()}`
            : "";

        return {
          content: [
            {
              type: "text",
              text: `🗳️ **Vote Recorded!**

**Poll Results:**
${optionsList}

📊 Total votes: ${poll.votes_count}${poll.voters_count ? ` from ${poll.voters_count} voters` : ""}
${expiryText}`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to vote: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// =============================================================================
// Media Tools
// =============================================================================

function registerUploadMediaTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "upload-media",
    {
      title: "Upload Media",
      description:
        "Upload a media file (image, video, audio) to use in posts. Returns a media ID that can be used with post-status.",
      inputSchema: {
        filePath: z.string().describe("Absolute path to the file to upload"),
        description: z
          .string()
          .max(1500)
          .optional()
          .describe("Alt text description for accessibility (recommended)"),
        focusX: z
          .number()
          .min(-1)
          .max(1)
          .optional()
          .describe("Focal point X coordinate (-1 to 1, 0 is center)"),
        focusY: z
          .number()
          .min(-1)
          .max(1)
          .optional()
          .describe("Focal point Y coordinate (-1 to 1, 0 is center)"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ filePath, description, focusX, focusY, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("upload-media", {
        instance: account.instance,
        filePath,
        hasDescription: !!description,
      });

      try {
        // Read the file
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        const fileBuffer = await fs.readFile(filePath);
        const filename = path.basename(filePath);

        const focus =
          focusX !== undefined && focusY !== undefined ? { x: focusX, y: focusY } : undefined;

        const media = await authenticatedClient.uploadMedia(
          fileBuffer,
          { filename, description, focus },
          accountId,
        );

        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `📎 **Media Uploaded!**

🆔 **Media ID**: \`${media.id}\`
📝 Type: ${media.type}
${media.description ? `📖 Description: ${media.description}` : "⚠️ No alt text set"}
${media.url ? `🔗 URL: ${media.url}` : ""}

💡 **Usage:**
Use this media ID with the \`post-status\` tool by including it in the mediaIds parameter:
\`\`\`
post-status content="Your post" mediaIds=["${media.id}"]
\`\`\`

**Tip:** Always add alt text for accessibility!`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to upload media: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// =============================================================================
// Scheduled Posts Tools
// =============================================================================

function registerGetScheduledPostsTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "get-scheduled-posts",
    {
      title: "Get Scheduled Posts",
      description: "List your scheduled posts that haven't been published yet",
      inputSchema: {
        limit: z.number().min(1).max(40).optional().describe("Number of posts (default: 20)"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ limit = 20, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("get-scheduled-posts", {
        instance: account.instance,
        limit,
      });

      try {
        const scheduled = await authenticatedClient.getScheduledPosts({ limit }, accountId);
        performanceMonitor.endRequest(requestId, true);

        if (scheduled.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `📅 **Scheduled Posts**

No scheduled posts found.

💡 **Tip:** Use \`post-status\` with the \`scheduledAt\` parameter to schedule a post for later.`,
              },
            ],
          };
        }

        const postsList = scheduled
          .map((post, i) => {
            const content = post.params.text || "No content";
            const truncated = content.length > 150 ? `${content.slice(0, 150)}...` : content;
            const scheduledDate = new Date(post.scheduled_at).toLocaleString();
            const visibility = post.params.visibility || "public";
            const cw = post.params.spoiler_text ? `⚠️ CW: ${post.params.spoiler_text}\n` : "";
            const mediaCount = post.media_attachments?.length || 0;
            const pollInfo = post.params.poll ? "📊 Has poll" : "";

            return `${i + 1}. 🆔 \`${post.id}\`
   📅 Scheduled: ${scheduledDate}
   👁️ Visibility: ${visibility}
   ${cw}📝 ${truncated}
   ${mediaCount > 0 ? `📎 ${mediaCount} attachment(s)` : ""} ${pollInfo}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `📅 **Scheduled Posts** (${scheduled.length} posts)

${postsList}

💡 **Actions:**
- Use \`cancel-scheduled-post\` to cancel a scheduled post
- Use \`update-scheduled-post\` to change the scheduled time`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get scheduled posts: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerCancelScheduledPostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "cancel-scheduled-post",
    {
      title: "Cancel Scheduled Post",
      description: "Cancel a scheduled post before it's published",
      inputSchema: {
        scheduledId: z.string().describe("The ID of the scheduled post to cancel"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ scheduledId, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("cancel-scheduled-post", {
        instance: account.instance,
        scheduledId,
      });

      try {
        await authenticatedClient.cancelScheduledPost(scheduledId, accountId);
        performanceMonitor.endRequest(requestId, true);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Scheduled Post Canceled**

The scheduled post \`${scheduledId}\` has been canceled and will not be published.`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to cancel scheduled post: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function registerUpdateScheduledPostTool(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerTool(
    "update-scheduled-post",
    {
      title: "Update Scheduled Post",
      description: "Change the scheduled time for a scheduled post",
      inputSchema: {
        scheduledId: z.string().describe("The ID of the scheduled post to update"),
        scheduledAt: z
          .string()
          .describe("New scheduled time in ISO 8601 format (e.g., 2024-12-25T10:00:00Z)"),
        accountId: z.string().optional().describe("Account ID"),
      },
    },
    async ({ scheduledId, scheduledAt, accountId }) => {
      requireWriteEnabled();

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      const requestId = performanceMonitor.startRequest("update-scheduled-post", {
        instance: account.instance,
        scheduledId,
        scheduledAt,
      });

      try {
        const updated = await authenticatedClient.updateScheduledPost(
          scheduledId,
          scheduledAt,
          accountId,
        );
        performanceMonitor.endRequest(requestId, true);

        const newDate = new Date(updated.scheduled_at).toLocaleString();

        return {
          content: [
            {
              type: "text",
              text: `✅ **Scheduled Post Updated**

Post \`${scheduledId}\` is now scheduled for: **${newDate}**`,
            },
          ],
        };
      } catch (error) {
        performanceMonitor.endRequest(requestId, false, getErrorMessage(error));
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to update scheduled post: ${formatErrorWithSuggestion(getErrorMessage(error))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
