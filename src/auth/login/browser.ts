/**
 * Opens the system browser to a URL using an argv-array spawn (never a shell
 * string). On win32 it uses rundll32's FileProtocolHandler rather than
 * `cmd /c start`: cmd treats every unquoted `&` (always present in OAuth
 * authorize URLs) as a command separator, which truncated the URL at the first
 * `&` and broke login on every Windows machine. rundll32 receives the URL as a
 * single argv argument with no shell parsing, so `&`/`%`/`^` survive intact.
 * On failure the caller falls back to printing the URL.
 */

import { spawn } from "node:child_process";

export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];
    switch (process.platform) {
      case "darwin":
        command = "open";
        args = [url];
        break;
      case "win32":
        // rundll32 url.dll,FileProtocolHandler opens the default browser without
        // a shell, so '&' in the OAuth URL is not parsed as a command separator.
        command = "rundll32";
        args = ["url.dll,FileProtocolHandler", url];
        break;
      default:
        command = "xdg-open";
        args = [url];
        break;
    }
    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      // Resolve only once the child actually spawns; reject if the OS can't exec
      // the opener (e.g. the binary is missing) so the caller can fall back to
      // printing the URL. Resolving eagerly would swallow that async failure.
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
