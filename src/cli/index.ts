/**
 * Subcommand router for the activitypub-mcp bin. Returns true if a subcommand
 * was handled (caller must then exit/return instead of starting the server),
 * false if there was no subcommand (start the MCP server as usual).
 */

import { runAccounts } from "./accounts.js";
import { runLogin } from "./login.js";
import { runLogout } from "./logout.js";

export const COMMANDS = new Set(["login", "logout", "accounts"]);

export async function dispatchCli(argv: string[]): Promise<boolean> {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS.has(command)) return false;

  switch (command) {
    case "login":
      await runLogin(rest);
      return true;
    case "logout":
      await runLogout(rest);
      return true;
    case "accounts":
      await runAccounts();
      return true;
    default:
      return false;
  }
}
