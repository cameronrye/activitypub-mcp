/**
 * MCP onboarding tools: start-login / complete-login.
 *
 * Drives the out-of-band OAuth (Mastodon) / MiAuth (Misskey) flow so an LLM can
 * connect a fediverse account end-to-end. Tokens are never echoed back.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditLogger } from "../audit/logger.js";
import { beginLogin, completeLogin } from "../auth/login/login-manager.js";
import { getErrorMessage } from "../utils/errors.js";
import { trackedMcpServer } from "./capabilities.js";

const logger = getLogger("activitypub-mcp:tools-auth");

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export async function __handleStartLogin({ instance }: { instance: string }): Promise<ToolResult> {
  const startTime = Date.now();
  try {
    const { loginId, authorizeUrl, kind } = await beginLogin(instance);
    auditLogger.logToolInvocation(
      "start-login",
      { instance },
      { success: true, duration: Date.now() - startTime },
    );
    const codeStep =
      kind === "mastodon"
        ? "3. Copy the authorization code it shows you.\n4. Call `complete-login` with this `loginId` and that `code`."
        : "3. After approving, call `complete-login` with this `loginId` (no code needed).";
    return {
      content: [
        {
          type: "text",
          text: `🔐 **Connect your account** (${kind})

1. Open this URL in your browser:
${authorizeUrl}

2. Approve access for **${instance}**.
${codeStep}

\`loginId\`: \`${loginId}\`
(This login expires in 10 minutes.)`,
        },
      ],
    };
  } catch (error) {
    auditLogger.logToolInvocation(
      "start-login",
      { instance },
      { success: false, duration: Date.now() - startTime, error: getErrorMessage(error) },
    );
    return {
      content: [{ type: "text", text: `❌ Could not start login: ${getErrorMessage(error)}` }],
      isError: true,
    };
  }
}

export async function __handleCompleteLogin({
  loginId,
  code,
}: {
  loginId: string;
  code?: string;
}): Promise<ToolResult> {
  const startTime = Date.now();
  try {
    const { accountId, username, instance, isActive } = await completeLogin(loginId, code);
    auditLogger.logToolInvocation(
      "complete-login",
      { loginId },
      { success: true, duration: Date.now() - startTime },
    );
    return {
      content: [
        {
          type: "text",
          text: `✅ **Account connected**

**@${username}@${instance}** is now configured (id: \`${accountId}\`).${
            isActive ? "\n\nIt is now the active account for write operations." : ""
          }

The credentials are saved and will persist across restarts.`,
        },
      ],
    };
  } catch (error) {
    auditLogger.logToolInvocation(
      "complete-login",
      { loginId },
      { success: false, duration: Date.now() - startTime, error: getErrorMessage(error) },
    );
    return {
      content: [{ type: "text", text: `❌ Login failed: ${getErrorMessage(error)}` }],
      isError: true,
    };
  }
}

export function registerAuthTools(mcpServer: McpServer): void {
  trackedMcpServer(mcpServer);

  mcpServer.registerTool(
    "start-login",
    {
      title: "Start Account Login",
      description:
        "Begin connecting a fediverse account (Mastodon OAuth or Misskey MiAuth). Returns a URL " +
        "to open in a browser and a loginId to pass to complete-login.",
      inputSchema: {
        instance: z
          .string()
          .min(1)
          .describe("Instance hostname to log in to (e.g., mastodon.social)"),
      },
    },
    async ({ instance }) => __handleStartLogin({ instance }),
  );

  mcpServer.registerTool(
    "complete-login",
    {
      title: "Complete Account Login",
      description:
        "Finish connecting an account started with start-login. For Mastodon, pass the " +
        "authorization code you copied; for Misskey, just pass the loginId after approving.",
      inputSchema: {
        loginId: z.string().min(1).describe("The loginId returned by start-login"),
        code: z
          .string()
          .optional()
          .describe("Mastodon authorization code (omit for Misskey MiAuth)"),
      },
    },
    async ({ loginId, code }) => __handleCompleteLogin({ loginId, code }),
  );

  logger.info("Registered onboarding tools (start-login, complete-login)");
}
