#!/usr/bin/env node

/**
 * Cross-platform script runner
 * Automatically detects platform and runs appropriate scripts
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLATFORM = process.platform;
const SCRIPT_NAME = process.argv[2];
const SCRIPT_ARGS = process.argv.slice(3);

if (!SCRIPT_NAME) {
  console.error("Usage: node run-platform.js <script-name> [args...]");
  console.error("Example: node run-platform.js setup");
  console.error("Example: node run-platform.js install --client=claude");
  process.exit(1);
}

/**
 * Get the appropriate script path and command for the current platform
 */
function getScriptInfo(scriptName) {
  const isWindows = PLATFORM === "win32";

  if (isWindows) {
    const psScript = join(__dirname, `${scriptName}.ps1`);
    if (existsSync(psScript)) {
      return {
        command: "powershell",
        args: ["-ExecutionPolicy", "Bypass", "-File", psScript, ...SCRIPT_ARGS],
        scriptPath: psScript,
      };
    }
  } else {
    const bashScript = join(__dirname, `${scriptName}.sh`);
    if (existsSync(bashScript)) {
      return {
        command: "bash",
        args: [bashScript, ...SCRIPT_ARGS],
        scriptPath: bashScript,
      };
    }
  }

  throw new Error(
    `No ${isWindows ? "PowerShell" : "bash"} script found for '${scriptName}' on ${PLATFORM}`,
  );
}

/**
 * Run the appropriate script for the current platform
 */
function runScript() {
  try {
    const { command, args, scriptPath } = getScriptInfo(SCRIPT_NAME);

    console.log(`Running ${scriptPath} on ${PLATFORM}...`);

    const child = spawn(command, args, {
      stdio: "inherit",
      shell: PLATFORM === "win32",
    });

    child.on("error", (error) => {
      console.error(`Failed to start script: ${error.message}`);
      process.exit(1);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`Script exited with code ${code}`);
        process.exit(code);
      }
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);

    // Provide helpful suggestions
    console.error("\nAvailable scripts:");
    const scripts = ["setup", "install"];
    for (const script of scripts) {
      const windowsScript = join(__dirname, `${script}.ps1`);
      const unixScript = join(__dirname, `${script}.sh`);

      if (existsSync(windowsScript) || existsSync(unixScript)) {
        console.error(`  - ${script}`);
      }
    }

    process.exit(1);
  }
}

runScript();
