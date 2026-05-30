/**
 * Opens the system browser to a URL using an argv-array spawn (never a shell
 * string), so query values containing &, %, ^ cannot be interpreted by a shell.
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
        // `start` is a cmd builtin; "" is the (empty) window title, url is a discrete arg.
        command = "cmd";
        args = ["/c", "start", "", url];
        break;
      default:
        command = "xdg-open";
        args = [url];
        break;
    }
    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.on("error", reject);
      child.unref();
      resolve();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
