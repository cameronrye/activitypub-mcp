/**
 * MCP Write Tools for authenticated operations.
 *
 * These tools require an authenticated account and enable posting,
 * boosting, favouriting, and following operations.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CallToolResult, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { auditLogger } from "../audit/logger.js";
import { accountManager, authenticatedClient } from "../auth/index.js";
import { ENABLE_WRITES } from "../config.js";
import type { RateLimiter } from "../resilience/rate-limiter.js";
import { formatRemoteError, getErrorMessage } from "../utils/errors.js";
import { sniffMediaType } from "../utils/media-type.js";
import { sanitizeInline, wrapUntrusted } from "../utils/untrusted.js";
import { trackedMcpServer } from "./capabilities.js";
import { checkRateLimit } from "./rate-limit-guard.js";

const logger = getLogger("activitypub-mcp:tools-write");

/**
 * Registers all write operation tools.
 */
export function registerWriteTools(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  trackedMcpServer(mcpServer);

  // Always on: account management + authenticated reads
  registerListAccountsTool(mcpServer);
  registerSwitchAccountTool(mcpServer);
  registerVerifyAccountTool(mcpServer, rateLimiter);
  registerGetHomeTimelineTool(mcpServer, rateLimiter);
  registerGetNotificationsTool(mcpServer, rateLimiter);
  registerGetBookmarksTool(mcpServer, rateLimiter);
  registerGetFavouritesTool(mcpServer, rateLimiter);
  registerGetRelationshipTool(mcpServer, rateLimiter);

  if (!ENABLE_WRITES) {
    logger.info("Write tools disabled (set ACTIVITYPUB_ENABLE_WRITES=true to enable)");
    return;
  }

  logger.info("Write tools ENABLED");
  // Mutations
  registerPostStatusTool(mcpServer, rateLimiter);
  registerReplyToPostTool(mcpServer, rateLimiter);
  registerDeletePostTool(mcpServer, rateLimiter);
  registerBoostPostTool(mcpServer, rateLimiter);
  registerUnboostPostTool(mcpServer, rateLimiter);
  registerFavouritePostTool(mcpServer, rateLimiter);
  registerUnfavouritePostTool(mcpServer, rateLimiter);
  registerBookmarkPostTool(mcpServer, rateLimiter);
  registerUnbookmarkPostTool(mcpServer, rateLimiter);
  registerFollowAccountTool(mcpServer, rateLimiter);
  registerUnfollowAccountTool(mcpServer, rateLimiter);
  registerMuteAccountTool(mcpServer, rateLimiter);
  registerUnmuteAccountTool(mcpServer, rateLimiter);
  registerBlockAccountTool(mcpServer, rateLimiter);
  registerUnblockAccountTool(mcpServer, rateLimiter);
  registerVoteOnPollTool(mcpServer, rateLimiter);
  registerUploadMediaTool(mcpServer, rateLimiter);
  registerGetScheduledPostsTool(mcpServer, rateLimiter);
  registerCancelScheduledPostTool(mcpServer, rateLimiter);
  registerUpdateScheduledPostTool(mcpServer, rateLimiter);
}

/**
 * Pure predicate for whether a mutation may proceed. Returns a reason code when
 * blocked, or null when allowed. `writes-disabled` takes precedence so a
 * read-only deployment never leaks that an account exists.
 *
 * Exported so the rule is unit-tested directly: it is the runtime
 * belt-and-suspenders behind tool-registration gating — even if a mutation
 * handler is ever reachable with writes off, it must independently refuse.
 */
export function writeBlockReason(
  enableWrites: boolean,
  hasAccounts: boolean,
): "writes-disabled" | "no-auth" | null {
  if (!enableWrites) return "writes-disabled";
  if (!hasAccounts) return "no-auth";
  return null;
}

/**
 * Helper for write tools: requires both that writes are enabled and that an
 * authenticated account exists.
 */
function requireWriteEnabled(): void {
  const reason = writeBlockReason(ENABLE_WRITES, authenticatedClient.hasAuthenticatedAccount());
  if (reason === "writes-disabled") {
    throw new McpError(
      ErrorCode.InternalError,
      "Write operations are disabled. Set ACTIVITYPUB_ENABLE_WRITES=true to enable mutation tools.",
    );
  }
  if (reason === "no-auth") {
    throw new McpError(
      ErrorCode.InternalError,
      "This write operation requires authentication. Run `activitypub-mcp login <instance>` to sign in, " +
        "or set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables.",
    );
  }
}

/**
 * Helper for authenticated read-only tools (home timeline, notifications, etc.):
 * same underlying check but a clearer error so users aren't told they need
 * 'write' for a read.
 */
function requireAuthEnabled(): void {
  if (!authenticatedClient.hasAuthenticatedAccount()) {
    throw new McpError(
      ErrorCode.InternalError,
      "This tool requires an authenticated account. Run `activitypub-mcp login <instance>` to sign in, " +
        "or set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables.",
    );
  }
}

/** A resolved (non-null) account, as returned by the account manager. */
type ResolvedAccount = NonNullable<ReturnType<typeof accountManager.getActiveAccount>>;

/**
 * Specification for a mutation tool, supplying only the parts that differ between
 * tools. See {@link withWriteTool}.
 */
interface WriteToolSpec<RawArgs extends { accountId?: string }> {
  /** Tool name, used as the audit-log identifier. */
  name: string;
  rateLimiter: RateLimiter;
  /** Verb for the failure message, e.g. "Failed to boost". */
  failurePrefix: string;
  /** Audit-log parameters derived from the (default-applied) input. */
  auditParams: (args: RawArgs) => Record<string, unknown>;
  /** Perform the mutation and return the success message text. */
  run: (args: RawArgs, account: ResolvedAccount) => Promise<string>;
}

/**
 * Build the handler for a mutation tool, factoring out the scaffold every write
 * tool shares: the writes-enabled gate, account resolution, the no-account branch,
 * the rate-limit check, and success/failure audit logging. Each tool supplies only
 * its audit params, the operation (returning the success message), and the failure
 * verb.
 *
 * Centralizing this is a correctness control, not just deduplication: the audit
 * log is the security record for LLM-driven account mutations, and hand-copying
 * the success/failure logging per tool made it easy for a new tool to ship missing
 * an audit entry. Here it cannot.
 */
function withWriteTool<RawArgs extends { accountId?: string }>(
  spec: WriteToolSpec<RawArgs>,
): (args: RawArgs) => Promise<CallToolResult> {
  return async (args: RawArgs): Promise<CallToolResult> => {
    requireWriteEnabled();
    const startTime = Date.now();
    const auditParams = spec.auditParams(args);

    const account = args.accountId
      ? accountManager.getAccount(args.accountId)
      : accountManager.getActiveAccount();

    if (!account) {
      auditLogger.logToolInvocation(spec.name, auditParams, {
        success: false,
        duration: Date.now() - startTime,
        error: "No account configured",
      });
      return {
        content: [{ type: "text", text: "❌ No account configured." }],
        isError: true,
      };
    }

    // Before the try (mirrors the read tools' McpError-propagation contract): a
    // rate-limit McpError must surface as a protocol error, not be captured into
    // an isError text response.
    checkRateLimit(spec.rateLimiter, account.instance);

    try {
      const text = await spec.run(args, account);
      auditLogger.logToolInvocation(spec.name, auditParams, {
        success: true,
        duration: Date.now() - startTime,
      });
      return { content: [{ type: "text", text }] };
    } catch (error) {
      auditLogger.logToolInvocation(spec.name, auditParams, {
        success: false,
        duration: Date.now() - startTime,
        error: getErrorMessage(error),
      });
      return {
        content: [
          {
            type: "text",
            text: `❌ ${spec.failurePrefix}: ${formatRemoteError(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
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
      annotations: { readOnlyHint: true },
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

💡 For multiple accounts, use \`ACTIVITYPUB_ACCOUNTS=id1|instance1|token1|username1|label1,id2|instance2|token2|username2|label2\` (pipe-delimited; v2 changed from colon to avoid conflict with colons in tokens).`,
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
      annotations: { readOnlyHint: false },
    },
    async ({ accountId }) => {
      requireAuthEnabled();
      const startTime = Date.now();
      const auditParams = { accountId };

      const success = accountManager.setActiveAccount(accountId);

      if (!success) {
        auditLogger.logToolInvocation("switch-account", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "Account not found",
        });
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

      auditLogger.logToolInvocation("switch-account", auditParams, {
        success: true,
        duration: Date.now() - startTime,
      });

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
      annotations: { readOnlyHint: true },
    },
    async ({ accountId }) => {
      requireAuthEnabled();
      const startTime = Date.now();
      const auditParams = { accountId };

      const targetId = accountId || accountManager.getActiveAccount()?.id;
      if (!targetId) {
        auditLogger.logToolInvocation("verify-account", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account specified",
        });
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
        auditLogger.logToolInvocation("verify-account", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "Account not found",
        });
        return {
          content: [{ type: "text", text: `❌ Account not found: ${targetId}` }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const info = await accountManager.verifyAccount(targetId);

        if (!info) {
          auditLogger.logToolInvocation("verify-account", auditParams, {
            success: false,
            duration: Date.now() - startTime,
            error: "Credentials invalid or expired",
          });
          return {
            content: [
              {
                type: "text",
                text: `❌ **Verification Failed**

Account credentials for \`${targetId}\` (@${account.username}@${account.instance}) are invalid or expired.

Run \`activitypub-mcp login ${account.instance}\` to re-authorize.`,
              },
            ],
            isError: true,
          };
        }

        auditLogger.logToolInvocation("verify-account", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ **Account Verified**

👤 **${sanitizeInline(info.display_name || info.username || "")}** (@${sanitizeInline(info.acct || "")})
🆔 ID: ${sanitizeInline(info.id)}
🔗 ${sanitizeInline(info.url)}

📊 **Stats:**
- Followers: ${info.followers_count.toLocaleString()}
- Following: ${info.following_count.toLocaleString()}
- Posts: ${info.statuses_count.toLocaleString()}

✅ Credentials are valid and working.`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("verify-account", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Verification failed: ${formatRemoteError(error)}`,
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
      description:
        "Publish a post to your fediverse account. PUBLIC by default and visible to the world; " +
        "most fediverse software does not allow editing after posting. " +
        "Use visibility: 'direct' for DMs, 'private' for followers-only, or 'scheduledAt' to " +
        "queue the post for later instead of publishing immediately.",
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
        mediaIds: z
          .array(z.string())
          .max(4, "post-status accepts at most 4 media IDs")
          .optional()
          .describe("Media IDs from upload-media (max 4)"),
        scheduledAt: z
          .string()
          .datetime({ message: "scheduledAt must be ISO 8601 (e.g., 2026-06-01T15:00:00Z)" })
          .refine((d) => new Date(d).getTime() > Date.now(), {
            message: "scheduledAt must be in the future",
          })
          .optional()
          .describe("ISO 8601 datetime to schedule the post (e.g., one hour from now in ISO 8601)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({
      content,
      visibility = "public",
      spoilerText,
      sensitive,
      language,
      accountId,
      mediaIds,
      scheduledAt,
    }) => {
      requireWriteEnabled();
      const startTime = Date.now();
      const auditParams = {
        content,
        visibility,
        spoilerText,
        sensitive,
        language,
        accountId,
        mediaIds,
        scheduledAt,
      };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("post-status", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured for posting." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        logger.info("Creating post", { instance: account.instance, visibility });

        const result = await authenticatedClient.createPost(
          {
            content,
            visibility,
            spoilerText,
            sensitive,
            language,
            mediaIds,
            scheduledAt,
          },
          accountId,
        );

        auditLogger.logToolInvocation("post-status", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

        if (result.kind === "scheduled") {
          const scheduled = result.scheduled;
          return {
            content: [
              {
                type: "text",
                text: `✅ **Post Scheduled!**

🆔 Scheduled ID: ${sanitizeInline(scheduled.id)}
🕒 Scheduled for: ${sanitizeInline(scheduled.scheduled_at)}
📝 ${wrapUntrusted(scheduled.params.text || content, `scheduled post on ${account.instance}`)}

Use \`get-scheduled-posts\` to view it or \`cancel-scheduled-post\` to cancel.`,
              },
            ],
          };
        }

        const status = result.status;
        return {
          content: [
            {
              type: "text",
              text: `✅ **Post Created!**

📝 ${wrapUntrusted(status.content, `post on ${account.instance}`)}

🆔 ID: ${sanitizeInline(status.id)}
🔗 ${sanitizeInline(status.url || status.uri)}
👁️ Visibility: ${status.visibility}
${status.spoiler_text ? `⚠️ CW: ${wrapUntrusted(status.spoiler_text, `content warning on ${account.instance}`)}` : ""}

Posted as @${sanitizeInline(status.account.username || "")}`,
            },
          ],
        };
      } catch (error) {
        const message = getErrorMessage(error);
        auditLogger.logToolInvocation("post-status", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to create post: ${formatRemoteError(message)}`,
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
      description:
        "Publish a reply to an existing post. Replies are PUBLIC by default and " +
        "cannot be edited after posting. The reply appears in the parent post's " +
        "thread, visible to followers of either account. Use visibility: 'direct' " +
        "for a private reply (DM) instead.",
      inputSchema: {
        statusId: z.string().describe("The ID of the post to reply to"),
        content: z.string().min(1).max(5000).describe("The content of your reply"),
        visibility: z
          .enum(["public", "unlisted", "private", "direct"])
          .optional()
          .describe(
            "Visibility for this reply (default: your account's default posting visibility, " +
              "which is usually public). Mastodon does NOT auto-match the parent post.",
          ),
        spoilerText: z.string().max(500).optional().describe("Content warning"),
        accountId: z.string().optional().describe("Account ID to reply from"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ statusId, content, visibility, spoilerText, accountId }) => {
      requireWriteEnabled();
      const startTime = Date.now();
      const auditParams = { statusId, content, visibility, spoilerText, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("reply-to-post", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const result = await authenticatedClient.createPost(
          {
            content,
            visibility,
            spoilerText,
            inReplyToId: statusId,
          },
          accountId,
        );
        // Replies never carry scheduledAt, so the result is always published.
        if (result.kind !== "published") {
          throw new Error("Reply unexpectedly returned a scheduled status");
        }
        const status = result.status;

        auditLogger.logToolInvocation("reply-to-post", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ **Reply Posted!**

📝 ${wrapUntrusted(status.content, `post on ${account.instance}`)}

🆔 ID: ${sanitizeInline(status.id)}
🔗 ${sanitizeInline(status.url || status.uri)}
↩️ Replying to: ${statusId}`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("reply-to-post", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to reply: ${formatRemoteError(error)}`,
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
      description:
        "Permanently delete one of your own posts. CANNOT BE UNDONE. " +
        "Federated copies on other servers may persist after deletion.",
      inputSchema: {
        statusId: z.string().describe("The ID of your post to delete"),
        accountId: z.string().optional().describe("Account ID"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ statusId, accountId }) => {
      requireWriteEnabled();
      const startTime = Date.now();
      const auditParams = { statusId, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("delete-post", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        await authenticatedClient.deletePost(statusId, accountId);
        auditLogger.logToolInvocation("delete-post", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

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
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("delete-post", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to delete post: ${formatRemoteError(error)}`,
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ statusId: string; accountId?: string }>({
      name: "boost-post",
      rateLimiter,
      failurePrefix: "Failed to boost",
      auditParams: ({ statusId, accountId }) => ({ statusId, accountId }),
      run: async ({ statusId, accountId }) => {
        const status = await authenticatedClient.boostPost(statusId, accountId);
        return `🔁 **Post Boosted!**

You boosted a post by @${sanitizeInline(status.account.username || "")}

🔗 ${sanitizeInline(status.url || status.uri)}`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ statusId: string; accountId?: string }>({
      name: "unboost-post",
      rateLimiter,
      failurePrefix: "Failed to unboost",
      auditParams: ({ statusId, accountId }) => ({ statusId, accountId }),
      run: async ({ statusId, accountId }) => {
        await authenticatedClient.unboostPost(statusId, accountId);
        return `✅ **Boost Removed**

Your boost has been removed from post ${statusId}.`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ statusId: string; accountId?: string }>({
      name: "favourite-post",
      rateLimiter,
      failurePrefix: "Failed to favourite",
      auditParams: ({ statusId, accountId }) => ({ statusId, accountId }),
      run: async ({ statusId, accountId }) => {
        const status = await authenticatedClient.favouritePost(statusId, accountId);
        return `⭐ **Post Favourited!**

You favourited a post by @${sanitizeInline(status.account.username || "")}

🔗 ${sanitizeInline(status.url || status.uri)}`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ statusId: string; accountId?: string }>({
      name: "unfavourite-post",
      rateLimiter,
      failurePrefix: "Failed to unfavourite",
      auditParams: ({ statusId, accountId }) => ({ statusId, accountId }),
      run: async ({ statusId, accountId }) => {
        await authenticatedClient.unfavouritePost(statusId, accountId);
        return `✅ **Favourite Removed**

Post ${statusId} has been removed from your favourites.`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ statusId: string; accountId?: string }>({
      name: "bookmark-post",
      rateLimiter,
      failurePrefix: "Failed to bookmark",
      auditParams: ({ statusId, accountId }) => ({ statusId, accountId }),
      run: async ({ statusId, accountId }) => {
        const status = await authenticatedClient.bookmarkPost(statusId, accountId);
        return `🔖 **Post Bookmarked!**

Saved post by @${sanitizeInline(status.account.username || "")}

🔗 ${sanitizeInline(status.url || status.uri)}`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ statusId: string; accountId?: string }>({
      name: "unbookmark-post",
      rateLimiter,
      failurePrefix: "Failed to unbookmark",
      auditParams: ({ statusId, accountId }) => ({ statusId, accountId }),
      run: async ({ statusId, accountId }) => {
        await authenticatedClient.unbookmarkPost(statusId, accountId);
        return `✅ **Bookmark Removed**

Post ${statusId} has been removed from your bookmarks.`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ acct: string; showBoosts?: boolean; notify?: boolean; accountId?: string }>({
      name: "follow-account",
      rateLimiter,
      failurePrefix: "Failed to follow",
      auditParams: ({ acct, showBoosts = true, notify = false, accountId }) => ({
        acct,
        showBoosts,
        notify,
        accountId,
      }),
      run: async ({ acct, showBoosts = true, notify = false, accountId }) => {
        // First, lookup the account to get its ID
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);

        const relationship = await authenticatedClient.followAccount(
          targetAccount.id,
          { reblogs: showBoosts, notify },
          accountId,
        );

        const statusText = relationship.requested
          ? "Follow request sent (awaiting approval)"
          : "Now following";

        return `✅ **${statusText}** @${acct}

👥 Relationship:
- Following: ${relationship.following ? "Yes" : "Pending"}
- Show Boosts: ${showBoosts ? "Yes" : "No"}
- Notifications: ${notify ? "Enabled" : "Disabled"}`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ acct: string; accountId?: string }>({
      name: "unfollow-account",
      rateLimiter,
      failurePrefix: "Failed to unfollow",
      auditParams: ({ acct, accountId }) => ({ acct, accountId }),
      run: async ({ acct, accountId }) => {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.unfollowAccount(targetAccount.id, accountId);

        return `✅ **Unfollowed** @${acct}

You are no longer following this account.`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{
      acct: string;
      muteNotifications?: boolean;
      duration?: number;
      accountId?: string;
    }>({
      name: "mute-account",
      rateLimiter,
      failurePrefix: "Failed to mute",
      auditParams: ({ acct, muteNotifications = true, duration = 0, accountId }) => ({
        acct,
        muteNotifications,
        duration,
        accountId,
      }),
      run: async ({ acct, muteNotifications = true, duration = 0, accountId }) => {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.muteAccount(
          targetAccount.id,
          { notifications: muteNotifications, duration },
          accountId,
        );

        const durationText = duration > 0 ? `for ${duration} seconds` : "indefinitely";

        return `🔇 **Muted** @${acct} ${durationText}

- Notifications muted: ${muteNotifications ? "Yes" : "No"}`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ acct: string; accountId?: string }>({
      name: "unmute-account",
      rateLimiter,
      failurePrefix: "Failed to unmute",
      auditParams: ({ acct, accountId }) => ({ acct, accountId }),
      run: async ({ acct, accountId }) => {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.unmuteAccount(targetAccount.id, accountId);

        return `🔊 **Unmuted** @${acct}

Their posts will now appear in your timelines again.`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ acct: string; accountId?: string }>({
      name: "block-account",
      rateLimiter,
      failurePrefix: "Failed to block",
      auditParams: ({ acct, accountId }) => ({ acct, accountId }),
      run: async ({ acct, accountId }) => {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.blockAccount(targetAccount.id, accountId);

        return `🚫 **Blocked** @${acct}

They can no longer see your posts or interact with you.`;
      },
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    withWriteTool<{ acct: string; accountId?: string }>({
      name: "unblock-account",
      rateLimiter,
      failurePrefix: "Failed to unblock",
      auditParams: ({ acct, accountId }) => ({ acct, accountId }),
      run: async ({ acct, accountId }) => {
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        await authenticatedClient.unblockAccount(targetAccount.id, accountId);

        return `✅ **Unblocked** @${acct}

They can now see your posts and interact with you again.`;
      },
    }),
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
      annotations: { readOnlyHint: true },
    },
    async ({ limit = 20, maxId, sinceId, accountId }) => {
      requireAuthEnabled();
      const startTime = Date.now();
      const auditParams = { limit, maxId, sinceId, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("get-home-timeline", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
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
            const content = wrapUntrusted(post.content, `post on ${account.instance}`);
            const cw = post.spoiler_text
              ? `⚠️ CW: ${wrapUntrusted(post.spoiler_text, `content warning on ${account.instance}`)}\n`
              : "";
            return `${i + 1}. **@${sanitizeInline(post.account.acct || "")}**
   ${cw}${content}
   ❤️ ${post.favourites_count} | 🔁 ${post.reblogs_count} | 💬 ${post.replies_count}`;
          })
          .join("\n\n");

        auditLogger.logToolInvocation("get-home-timeline", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

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
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("get-home-timeline", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get timeline: ${formatRemoteError(error)}`,
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
      annotations: { readOnlyHint: true },
    },
    async ({ limit = 20, types, accountId }) => {
      requireAuthEnabled();
      const startTime = Date.now();
      const auditParams = { limit, types, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("get-notifications", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
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
              ? `\n   ${wrapUntrusted(n.status.content, `notification on ${account.instance}`)}`
              : "";
            return `${emoji} **${sanitizeInline(n.type)}** from @${sanitizeInline(n.account.acct || "")}${statusPreview}`;
          })
          .join("\n\n");

        auditLogger.logToolInvocation("get-notifications", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

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
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("get-notifications", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get notifications: ${formatRemoteError(error)}`,
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
      annotations: { readOnlyHint: true },
    },
    async ({ limit = 20, accountId }) => {
      requireAuthEnabled();
      const startTime = Date.now();
      const auditParams = { limit, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("get-bookmarks", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
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
            const content = wrapUntrusted(post.content, `post on ${account.instance}`);
            return `${i + 1}. **@${sanitizeInline(post.account.acct || "")}**
   ${content}`;
          })
          .join("\n\n");

        auditLogger.logToolInvocation("get-bookmarks", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

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
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("get-bookmarks", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get bookmarks: ${formatRemoteError(error)}`,
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
      annotations: { readOnlyHint: true },
    },
    async ({ limit = 20, accountId }) => {
      requireAuthEnabled();
      const startTime = Date.now();
      const auditParams = { limit, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("get-favourites", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
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
            const content = wrapUntrusted(post.content, `post on ${account.instance}`);
            return `${i + 1}. **@${sanitizeInline(post.account.acct || "")}**
   ${content}`;
          })
          .join("\n\n");

        auditLogger.logToolInvocation("get-favourites", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

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
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("get-favourites", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get favourites: ${formatRemoteError(error)}`,
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
        "Check your relationship status with another account (following, followed by, blocking, muting, etc.). Pass a single acct like 'username@instance'. To check multiple accounts, call this tool once per account.",
      inputSchema: {
        acct: z
          .string()
          .describe(
            "Account to check relationship with (username@instance). If you have multiple accounts to check, call this tool once per account.",
          ),
        accountId: z.string().optional().describe("Your account ID"),
        // Detector for the legacy/wrong field name from old docs:
        accountIds: z
          .never({
            message:
              "get-relationship takes 'acct' (a single username@instance string), not 'accountIds'. Call this tool once per account.",
          })
          .optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ acct, accountId }) => {
      requireAuthEnabled();
      const startTime = Date.now();
      const auditParams = { acct, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("get-relationship", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        // First, lookup the account to get its ID
        const targetAccount = await authenticatedClient.lookupAccount(acct, accountId);
        const relationship = await authenticatedClient.getRelationship(targetAccount.id, accountId);

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

        auditLogger.logToolInvocation("get-relationship", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

        return {
          content: [
            {
              type: "text",
              text: `👥 **Relationship with @${acct}**

${statusItems.join("\n")}
${relationship.note ? `\n📝 **Note**: ${wrapUntrusted(relationship.note, `relationship note`)}` : ""}

💡 **Actions:**
- Use \`follow-account\` or \`unfollow-account\` to change follow status
- Use \`mute-account\` or \`block-account\` to manage interactions`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("get-relationship", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get relationship: ${formatRemoteError(error)}`,
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ pollId, choices, accountId }) => {
      requireWriteEnabled();
      const startTime = Date.now();
      const auditParams = { pollId, choices, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("vote-on-poll", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const poll = await authenticatedClient.voteOnPoll(pollId, choices, accountId);

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
            return `${voted} ${sanitizeInline(opt.title || "")}\n   ${bar} ${percentage}% (${opt.votes_count || 0} votes)`;
          })
          .join("\n\n");

        const expiryText = poll.expired
          ? "🔒 Poll closed"
          : poll.expires_at
            ? `⏰ Expires: ${new Date(poll.expires_at).toLocaleString()}`
            : "";

        auditLogger.logToolInvocation("vote-on-poll", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

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
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("vote-on-poll", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to vote: ${formatRemoteError(error)}`,
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
        "Upload a media file (image, video, audio) to use in posts. Returns a media ID that " +
        "can be used with post-status. Note: filePath is read from the machine running this " +
        "MCP server, not the user's local machine — a path that exists locally for the user " +
        "may not exist on the server's filesystem.",
      inputSchema: {
        filePath: z
          .string()
          .describe(
            "Absolute path to the file ON THE MCP SERVER's filesystem (not the user's machine).",
          ),
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ filePath, description, focusX, focusY, accountId }) => {
      requireWriteEnabled();
      const startTime = Date.now();
      const auditParams = { filePath, description, focusX, focusY, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("upload-media", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        // Read the file
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        const fileBuffer = await fs.readFile(filePath);

        // Validate by content, not extension: only forward actual media. A
        // model coaxed by prompt-injected fediverse content could otherwise
        // name any path (~/.ssh/id_rsa, the credential store, a .env file) and
        // exfiltrate it to a public media URL. A non-media file is refused
        // before its bytes are handed to the instance.
        const mediaType = sniffMediaType(fileBuffer);
        if (!mediaType) {
          throw new Error(
            `File is not a recognized media file (image, video, or audio): ${path.basename(filePath)}. upload-media only accepts media files.`,
          );
        }

        const filename = path.basename(filePath);

        const focus =
          focusX !== undefined && focusY !== undefined ? { x: focusX, y: focusY } : undefined;

        const media = await authenticatedClient.uploadMedia(
          fileBuffer,
          { filename, description, focus },
          accountId,
        );

        auditLogger.logToolInvocation("upload-media", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

        return {
          content: [
            {
              type: "text",
              text: `📎 **Media Uploaded!**

🆔 **Media ID**: \`${media.id}\`
📝 Type: ${media.type}
${media.description ? `📖 Description: ${sanitizeInline(media.description)}` : "⚠️ No alt text set"}
${media.url ? `🔗 URL: ${sanitizeInline(media.url)}` : ""}

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
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("upload-media", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to upload media: ${formatRemoteError(error)}`,
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
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ limit = 20, accountId }) => {
      requireAuthEnabled();
      const startTime = Date.now();
      const auditParams = { limit, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("get-scheduled-posts", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const scheduled = await authenticatedClient.getScheduledPosts({ limit }, accountId);

        auditLogger.logToolInvocation("get-scheduled-posts", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

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
            const content = sanitizeInline(post.params.text || "") || "No content";
            const truncated = content.length > 150 ? `${content.slice(0, 150)}...` : content;
            const scheduledDate = new Date(post.scheduled_at).toLocaleString();
            const visibility = post.params.visibility || "public";
            const cw = post.params.spoiler_text
              ? `⚠️ CW: ${sanitizeInline(post.params.spoiler_text)}\n`
              : "";
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
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("get-scheduled-posts", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get scheduled posts: ${formatRemoteError(error)}`,
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
        scheduledPostId: z.string().describe("ID of the scheduled post to cancel"),
        accountId: z.string().optional().describe("Account ID (defaults to active)"),
        // Legacy field detector — gives a clear error to anyone using the old name.
        scheduledId: z
          .never({
            message: "scheduledId was renamed to scheduledPostId in v2. Update your call.",
          })
          .optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ scheduledPostId, accountId }) => {
      requireWriteEnabled();
      const startTime = Date.now();
      const auditParams = { scheduledPostId, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("cancel-scheduled-post", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        await authenticatedClient.cancelScheduledPost(scheduledPostId, accountId);
        auditLogger.logToolInvocation("cancel-scheduled-post", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ **Scheduled Post Canceled**

The scheduled post \`${scheduledPostId}\` has been canceled and will not be published.`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("cancel-scheduled-post", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to cancel scheduled post: ${formatRemoteError(error)}`,
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
        scheduledPostId: z.string().describe("ID of the scheduled post to update"),
        scheduledAt: z
          .string()
          .datetime({ message: "scheduledAt must be ISO 8601 (e.g., 2099-01-01T15:00:00Z)" })
          .refine((d) => new Date(d).getTime() > Date.now(), {
            message: "scheduledAt must be in the future",
          })
          .describe("New scheduled time in ISO 8601 format (e.g., one hour from now in UTC)"),
        accountId: z.string().optional().describe("Account ID (defaults to active)"),
        // Legacy field detector — gives a clear error to anyone using the old name.
        scheduledId: z
          .never({
            message: "scheduledId was renamed to scheduledPostId in v2. Update your call.",
          })
          .optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ scheduledPostId, scheduledAt, accountId }) => {
      requireWriteEnabled();
      const startTime = Date.now();
      const auditParams = { scheduledPostId, scheduledAt, accountId };

      const account = accountId
        ? accountManager.getAccount(accountId)
        : accountManager.getActiveAccount();

      if (!account) {
        auditLogger.logToolInvocation("update-scheduled-post", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: "No account configured",
        });
        return {
          content: [{ type: "text", text: "❌ No account configured." }],
          isError: true,
        };
      }

      checkRateLimit(rateLimiter, account.instance);

      try {
        const updated = await authenticatedClient.updateScheduledPost(
          scheduledPostId,
          scheduledAt,
          accountId,
        );
        auditLogger.logToolInvocation("update-scheduled-post", auditParams, {
          success: true,
          duration: Date.now() - startTime,
        });

        const newDate = new Date(updated.scheduled_at).toLocaleString();

        return {
          content: [
            {
              type: "text",
              text: `✅ **Scheduled Post Updated**

Post \`${scheduledPostId}\` is now scheduled for: **${newDate}**`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        auditLogger.logToolInvocation("update-scheduled-post", auditParams, {
          success: false,
          duration: Date.now() - startTime,
          error: message,
        });
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to update scheduled post: ${formatRemoteError(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
