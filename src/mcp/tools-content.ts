/**
 * MCP feature tools: post editing/pinning, hashtag follows, lists, keyword
 * filters, profile editing, and follow-request management. All Mastodon-only —
 * requireMastodonAccount rejects Misskey accounts before any request.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditLogger } from "../audit/logger.js";
import * as filters from "../auth/mastodon-features/filters.js";
import * as followReqs from "../auth/mastodon-features/follow-requests.js";
import { requireMastodonAccount } from "../auth/mastodon-features/guard.js";
import * as hashtags from "../auth/mastodon-features/hashtags.js";
import * as lists from "../auth/mastodon-features/lists.js";
import * as posts from "../auth/mastodon-features/posts.js";
import * as profile from "../auth/mastodon-features/profile.js";
import { formatErrorWithSuggestion, getErrorMessage } from "../utils/errors.js";
import { trackedMcpServer } from "./capabilities.js";

const logger = getLogger("activitypub-mcp:tools-content");

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** Run a guarded feature op with audit logging + uniform error formatting. */
async function run(
  op: string,
  accountId: string | undefined,
  params: Record<string, unknown>,
  fn: (account: Awaited<ReturnType<typeof requireMastodonAccount>>) => Promise<ToolResult>,
): Promise<ToolResult> {
  const startTime = Date.now();
  try {
    const account = await requireMastodonAccount(op, accountId);
    const result = await fn(account);
    auditLogger.logToolInvocation(op, params, { success: true, duration: Date.now() - startTime });
    return result;
  } catch (error) {
    auditLogger.logToolInvocation(op, params, {
      success: false,
      duration: Date.now() - startTime,
      error: getErrorMessage(error),
    });
    return {
      content: [{ type: "text", text: `❌ ${formatErrorWithSuggestion(getErrorMessage(error))}` }],
      isError: true,
    };
  }
}

// ---- Handlers (exported for tests) ----

export async function __handleEditPost(args: {
  statusId: string;
  status: string;
  spoilerText?: string;
  sensitive?: boolean;
  language?: string;
  accountId?: string;
}): Promise<ToolResult> {
  return run("edit-post", args.accountId, { statusId: args.statusId }, async (account) => {
    const s = await posts.editPost(account, args.statusId, {
      status: args.status,
      spoilerText: args.spoilerText,
      sensitive: args.sensitive,
      language: args.language,
    });
    return ok(`✅ Edited post \`${s.id}\`.`);
  });
}

export function registerContentTools(mcpServer: McpServer): void {
  trackedMcpServer(mcpServer);

  // --- Posts ---
  mcpServer.registerTool(
    "edit-post",
    {
      title: "Edit Post",
      description: "Edit the text/CW of one of your existing posts (Mastodon only).",
      inputSchema: {
        statusId: z.string().min(1).describe("ID of the post to edit"),
        status: z.string().min(1).max(5000).describe("New post content"),
        spoilerText: z.string().max(500).optional().describe("New content warning"),
        sensitive: z.boolean().optional(),
        language: z.string().optional(),
        accountId: z.string().optional(),
      },
    },
    async (args) => __handleEditPost(args),
  );

  mcpServer.registerTool(
    "pin-post",
    {
      title: "Pin Post",
      description: "Pin one of your posts to your profile (Mastodon only).",
      inputSchema: { statusId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ statusId, accountId }) =>
      run("pin-post", accountId, { statusId }, async (a) => {
        const s = await posts.pinPost(a, statusId);
        return ok(`📌 Pinned post \`${s.id}\`.`);
      }),
  );

  mcpServer.registerTool(
    "unpin-post",
    {
      title: "Unpin Post",
      description: "Unpin one of your posts (Mastodon only).",
      inputSchema: { statusId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ statusId, accountId }) =>
      run("unpin-post", accountId, { statusId }, async (a) => {
        const s = await posts.unpinPost(a, statusId);
        return ok(`📌 Unpinned post \`${s.id}\`.`);
      }),
  );

  // --- Hashtags ---
  mcpServer.registerTool(
    "follow-hashtag",
    {
      title: "Follow Hashtag",
      description: "Follow a hashtag so its posts appear in your home timeline (Mastodon only).",
      inputSchema: {
        name: z.string().min(1).describe("Hashtag (with or without #)"),
        accountId: z.string().optional(),
      },
    },
    async ({ name, accountId }) =>
      run("follow-hashtag", accountId, { name }, async (a) => {
        const t = await hashtags.followHashtag(a, name);
        return ok(`#️⃣ Now following **#${t.name}**.`);
      }),
  );

  mcpServer.registerTool(
    "unfollow-hashtag",
    {
      title: "Unfollow Hashtag",
      description: "Unfollow a hashtag (Mastodon only).",
      inputSchema: { name: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ name, accountId }) =>
      run("unfollow-hashtag", accountId, { name }, async (a) => {
        const t = await hashtags.unfollowHashtag(a, name);
        return ok(`#️⃣ Unfollowed **#${t.name}**.`);
      }),
  );

  // --- Lists ---
  const repliesPolicy = z.enum(["followed", "list", "none"]).optional();
  mcpServer.registerTool(
    "create-list",
    {
      title: "Create List",
      description: "Create a new list (Mastodon only).",
      inputSchema: {
        title: z.string().min(1).max(255),
        repliesPolicy,
        exclusive: z.boolean().optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ title, repliesPolicy, exclusive, accountId }) =>
      run("create-list", accountId, { title }, async (a) => {
        const l = await lists.createList(a, { title, repliesPolicy, exclusive });
        return ok(`📋 Created list **${l.title}** (\`${l.id}\`).`);
      }),
  );

  mcpServer.registerTool(
    "get-lists",
    {
      title: "Get Lists",
      description: "List your lists (Mastodon only).",
      inputSchema: { accountId: z.string().optional() },
    },
    async ({ accountId }) =>
      run("get-lists", accountId, {}, async (a) => {
        const all = await lists.getLists(a);
        if (all.length === 0) return ok("You have no lists.");
        return ok(`📋 **Your lists:**\n${all.map((l) => `- ${l.title} (\`${l.id}\`)`).join("\n")}`);
      }),
  );

  mcpServer.registerTool(
    "update-list",
    {
      title: "Update List",
      description: "Rename or reconfigure a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        title: z.string().min(1).max(255).optional(),
        repliesPolicy,
        exclusive: z.boolean().optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, title, repliesPolicy, exclusive, accountId }) =>
      run("update-list", accountId, { listId }, async (a) => {
        const l = await lists.updateList(a, listId, {
          title: title ?? "",
          repliesPolicy,
          exclusive,
        });
        return ok(`📋 Updated list **${l.title}** (\`${l.id}\`).`);
      }),
  );

  mcpServer.registerTool(
    "delete-list",
    {
      title: "Delete List",
      description: "Delete a list (Mastodon only).",
      inputSchema: { listId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ listId, accountId }) =>
      run("delete-list", accountId, { listId }, async (a) => {
        await lists.deleteList(a, listId);
        return ok(`🗑️ Deleted list \`${listId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "get-list-timeline",
    {
      title: "Get List Timeline",
      description: "Read recent posts from a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        limit: z.number().int().min(1).max(40).optional(),
        maxId: z.string().optional(),
        minId: z.string().optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, limit, maxId, minId, accountId }) =>
      run("get-list-timeline", accountId, { listId }, async (a) => {
        const tl = await lists.getListTimeline(a, listId, { limit, maxId, minId });
        return ok(`📋 ${tl.length} posts in list \`${listId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "add-list-accounts",
    {
      title: "Add Accounts to List",
      description: "Add accounts (by account ID) to a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        accountIds: z.array(z.string()).min(1),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, accountIds, accountId }) =>
      run("add-list-accounts", accountId, { listId }, async (a) => {
        await lists.addListAccounts(a, listId, accountIds);
        return ok(`➕ Added ${accountIds.length} account(s) to list \`${listId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "remove-list-accounts",
    {
      title: "Remove Accounts from List",
      description: "Remove accounts (by account ID) from a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        accountIds: z.array(z.string()).min(1),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, accountIds, accountId }) =>
      run("remove-list-accounts", accountId, { listId }, async (a) => {
        await lists.removeListAccounts(a, listId, accountIds);
        return ok(`➖ Removed ${accountIds.length} account(s) from list \`${listId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "get-list-accounts",
    {
      title: "Get List Members",
      description: "List the accounts in a list (Mastodon only).",
      inputSchema: {
        listId: z.string().min(1),
        limit: z.number().int().min(1).max(80).optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ listId, limit, accountId }) =>
      run("get-list-accounts", accountId, { listId }, async (a) => {
        const members = await lists.getListAccounts(a, listId, { limit });
        if (members.length === 0) return ok(`List \`${listId}\` has no members.`);
        return ok(
          `📋 **Members:**\n${members.map((m) => `- @${m.acct} (\`${m.id}\`)`).join("\n")}`,
        );
      }),
  );

  // --- Filters ---
  mcpServer.registerTool(
    "get-filters",
    {
      title: "Get Filters",
      description: "List your keyword filters (Mastodon only).",
      inputSchema: { accountId: z.string().optional() },
    },
    async ({ accountId }) =>
      run("get-filters", accountId, {}, async (a) => {
        const all = await filters.getFilters(a);
        if (all.length === 0) return ok("You have no filters.");
        return ok(
          `🔇 **Filters:**\n${all
            .map(
              (f) => `- ${f.title} (\`${f.id}\`): ${f.keywords.map((k) => k.keyword).join(", ")}`,
            )
            .join("\n")}`,
        );
      }),
  );

  mcpServer.registerTool(
    "create-filter",
    {
      title: "Create Filter",
      description: "Create a keyword filter (Mastodon only).",
      inputSchema: {
        title: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(1),
        context: z
          .array(z.enum(["home", "notifications", "public", "thread", "account"]))
          .min(1)
          .describe("Where the filter applies"),
        filterAction: z.enum(["warn", "hide"]).optional(),
        wholeWord: z.boolean().optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ title, keywords, context, filterAction, wholeWord, accountId }) =>
      run("create-filter", accountId, { title }, async (a) => {
        const f = await filters.createFilter(a, {
          title,
          keywords,
          context,
          filterAction,
          wholeWord,
        });
        return ok(`🔇 Created filter **${f.title}** (\`${f.id}\`).`);
      }),
  );

  mcpServer.registerTool(
    "delete-filter",
    {
      title: "Delete Filter",
      description: "Delete a keyword filter (Mastodon only).",
      inputSchema: { filterId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ filterId, accountId }) =>
      run("delete-filter", accountId, { filterId }, async (a) => {
        await filters.deleteFilter(a, filterId);
        return ok(`🗑️ Deleted filter \`${filterId}\`.`);
      }),
  );

  // --- Profile ---
  mcpServer.registerTool(
    "update-profile",
    {
      title: "Update Profile",
      description: "Update your display name, bio, fields, or bot/locked flags (Mastodon only).",
      inputSchema: {
        displayName: z.string().max(30).optional(),
        note: z.string().max(500).optional().describe("Profile bio"),
        bot: z.boolean().optional(),
        locked: z.boolean().optional(),
        fields: z
          .array(z.object({ name: z.string(), value: z.string() }))
          .max(4)
          .optional()
          .describe("Profile metadata fields (max 4)"),
        accountId: z.string().optional(),
      },
    },
    async ({ displayName, note, bot, locked, fields, accountId }) =>
      run("update-profile", accountId, {}, async (a) => {
        const info = await profile.updateProfile(a, { displayName, note, bot, locked, fields });
        return ok(`👤 Updated profile for **@${info.acct}**.`);
      }),
  );

  // --- Follow requests ---
  mcpServer.registerTool(
    "get-follow-requests",
    {
      title: "Get Follow Requests",
      description: "List pending follow requests (locked accounts) (Mastodon only).",
      inputSchema: {
        limit: z.number().int().min(1).max(80).optional(),
        accountId: z.string().optional(),
      },
    },
    async ({ limit, accountId }) =>
      run("get-follow-requests", accountId, {}, async (a) => {
        const reqs = await followReqs.getFollowRequests(a, { limit });
        if (reqs.length === 0) return ok("No pending follow requests.");
        return ok(
          `🙋 **Pending requests:**\n${reqs.map((r) => `- @${r.acct} (\`${r.id}\`)`).join("\n")}`,
        );
      }),
  );

  mcpServer.registerTool(
    "accept-follow-request",
    {
      title: "Accept Follow Request",
      description: "Approve a pending follow request by account ID (Mastodon only).",
      inputSchema: { requestAccountId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ requestAccountId, accountId }) =>
      run("accept-follow-request", accountId, { requestAccountId }, async (a) => {
        await followReqs.acceptFollowRequest(a, requestAccountId);
        return ok(`✅ Approved follow request from \`${requestAccountId}\`.`);
      }),
  );

  mcpServer.registerTool(
    "reject-follow-request",
    {
      title: "Reject Follow Request",
      description: "Deny a pending follow request by account ID (Mastodon only).",
      inputSchema: { requestAccountId: z.string().min(1), accountId: z.string().optional() },
    },
    async ({ requestAccountId, accountId }) =>
      run("reject-follow-request", accountId, { requestAccountId }, async (a) => {
        await followReqs.rejectFollowRequest(a, requestAccountId);
        return ok(`🚫 Rejected follow request from \`${requestAccountId}\`.`);
      }),
  );

  logger.info("Registered content feature tools");
}
