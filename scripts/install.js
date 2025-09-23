#!/usr/bin/env node

/**
 * ActivityPub MCP Server Installation Script
 *
 * Automatically installs and configures the ActivityPub MCP server for various MCP clients
 * including Claude Desktop, Cursor, Windsurf, and others.
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PACKAGE_NAME = "activitypub-mcp-server";
const SERVER_NAME = "activitypub";

// Configuration paths for different MCP clients
const CONFIG_PATHS = {
  claude: {
    darwin: path.join(
      os.homedir(),
      "Library/Application Support/Claude/claude_desktop_config.json",
    ),
    win32: path.join(
      os.homedir(),
      "AppData/Roaming/Claude/claude_desktop_config.json",
    ),
    linux: path.join(os.homedir(), ".config/claude/claude_desktop_config.json"),
  },
  cursor: {
    darwin: path.join(
      os.homedir(),
      "Library/Application Support/Cursor/User/globalStorage/mcp_config.json",
    ),
    win32: path.join(
      os.homedir(),
      "AppData/Roaming/Cursor/User/globalStorage/mcp_config.json",
    ),
    linux: path.join(
      os.homedir(),
      ".config/Cursor/User/globalStorage/mcp_config.json",
    ),
  },
};

// Default server configuration
const SERVER_CONFIG = {
  command: "npx",
  args: ["-y", PACKAGE_NAME],
  env: {
    ACTIVITYPUB_BASE_URL: "http://localhost:8000",
    LOG_LEVEL: "info",
  },
};

class MCPInstaller {
  constructor() {
    this.platform = os.platform();
    this.verbose =
      process.argv.includes("--verbose") || process.argv.includes("-v");
    this.dryRun = process.argv.includes("--dry-run");
    this.client = this.parseClientArg();
  }

  parseClientArg() {
    const clientArg = process.argv.find((arg) => arg.startsWith("--client="));
    if (clientArg) {
      return clientArg.split("=")[1];
    }
    return "claude"; // default
  }

  log(message, level = "info") {
    const timestamp = new Date().toISOString();
    const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : "✅";
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async checkPrerequisites() {
    this.log("Checking prerequisites...");

    try {
      execSync("node --version", { stdio: "pipe" });
      this.log("Node.js is installed");
    } catch (error) {
      throw new Error(
        "Node.js is not installed. Please install Node.js 18+ first.",
      );
    }

    try {
      execSync("npm --version", { stdio: "pipe" });
      this.log("npm is installed");
    } catch (error) {
      throw new Error("npm is not installed. Please install npm first.");
    }
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      if (this.verbose) {
        this.log(`Creating directory: ${dirPath}`);
      }
      if (!this.dryRun) {
        await fs.mkdir(dirPath, { recursive: true });
      }
    }
  }

  async readConfigFile(configPath) {
    try {
      const content = await fs.readFile(configPath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {}; // File doesn't exist, return empty config
      }
      throw new Error(`Failed to read config file: ${error.message}`);
    }
  }

  async writeConfigFile(configPath, config) {
    if (this.dryRun) {
      this.log(`[DRY RUN] Would write config to: ${configPath}`);
      this.log(`[DRY RUN] Config content: ${JSON.stringify(config, null, 2)}`);
      return;
    }

    await this.ensureDirectoryExists(path.dirname(configPath));
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  }

  async installForClaude() {
    const configPath = CONFIG_PATHS.claude[this.platform];
    if (!configPath) {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }

    this.log(`Installing for Claude Desktop (${this.platform})...`);
    this.log(`Config path: ${configPath}`);

    const config = await this.readConfigFile(configPath);

    // Initialize mcpServers if it doesn't exist
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Add or update the ActivityPub server configuration
    config.mcpServers[SERVER_NAME] = SERVER_CONFIG;

    await this.writeConfigFile(configPath, config);
    this.log("Claude Desktop configuration updated successfully!");
  }

  async installForCursor() {
    const configPath = CONFIG_PATHS.cursor[this.platform];
    if (!configPath) {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }

    this.log(`Installing for Cursor (${this.platform})...`);
    this.log(`Config path: ${configPath}`);

    const config = await this.readConfigFile(configPath);

    // Initialize mcpServers if it doesn't exist
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Add or update the ActivityPub server configuration
    config.mcpServers[SERVER_NAME] = SERVER_CONFIG;

    await this.writeConfigFile(configPath, config);
    this.log("Cursor configuration updated successfully!");
  }

  async installPackage() {
    if (this.dryRun) {
      this.log(`[DRY RUN] Would install package: ${PACKAGE_NAME}`);
      return;
    }

    this.log(`Installing ${PACKAGE_NAME} globally...`);
    try {
      execSync(`npm install -g ${PACKAGE_NAME}`, {
        stdio: this.verbose ? "inherit" : "pipe",
      });
      this.log("Package installed successfully!");
    } catch (error) {
      this.log(
        "Global installation failed, package will be installed on first use via npx",
        "warn",
      );
    }
  }

  async testInstallation() {
    if (this.dryRun) {
      this.log("[DRY RUN] Would test installation");
      return;
    }

    this.log("Testing installation...");
    try {
      // Test that the package can be found
      execSync(`npx ${PACKAGE_NAME} --version`, {
        stdio: "pipe",
        timeout: 10000,
      });
      this.log("Installation test passed!");
    } catch (error) {
      this.log(
        "Installation test failed - the server may not start correctly",
        "warn",
      );
      if (this.verbose) {
        this.log(`Test error: ${error.message}`, "warn");
      }
    }
  }

  async uninstall() {
    this.log("Uninstalling ActivityPub MCP Server...");

    const configPath = CONFIG_PATHS[this.client][this.platform];
    if (!configPath) {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }

    const config = await this.readConfigFile(configPath);

    if (config.mcpServers?.[SERVER_NAME]) {
      delete config.mcpServers[SERVER_NAME];
      await this.writeConfigFile(configPath, config);
      this.log(`Removed ${SERVER_NAME} from ${this.client} configuration`);
    } else {
      this.log(`${SERVER_NAME} not found in ${this.client} configuration`);
    }

    // Optionally uninstall the global package
    if (!this.dryRun) {
      try {
        execSync(`npm uninstall -g ${PACKAGE_NAME}`, { stdio: "pipe" });
        this.log("Global package uninstalled");
      } catch (error) {
        this.log(
          "Global package was not installed or could not be removed",
          "warn",
        );
      }
    }
  }

  async install() {
    try {
      await this.checkPrerequisites();

      if (this.client === "claude") {
        await this.installForClaude();
      } else if (this.client === "cursor") {
        await this.installForCursor();
      } else {
        throw new Error(`Unsupported client: ${this.client}`);
      }

      await this.installPackage();
      await this.testInstallation();

      this.log("🎉 Installation completed successfully!");
      this.log("");
      this.log("Next steps:");
      this.log(`1. Restart ${this.client} to load the new MCP server`);
      this.log("2. Start the ActivityPub server: npm run dev");
      this.log("3. The MCP server will start automatically when needed");
      this.log("");
      this.log(
        "For more information, see: https://github.com/cameronrye/activitypub-mcp",
      );
    } catch (error) {
      this.log(`Installation failed: ${error.message}`, "error");
      process.exit(1);
    }
  }

  showHelp() {
    console.log(`
ActivityPub MCP Server Installer

Usage: node install.js [options] [command]

Commands:
  install     Install the MCP server (default)
  uninstall   Remove the MCP server configuration

Options:
  --client=<name>   Target client (claude, cursor) [default: claude]
  --dry-run         Show what would be done without making changes
  --verbose, -v     Show detailed output
  --help, -h        Show this help message

Examples:
  node install.js                          # Install for Claude Desktop
  node install.js --client=cursor          # Install for Cursor
  node install.js uninstall                # Uninstall from Claude Desktop
  node install.js --dry-run --verbose      # Preview installation steps

Supported platforms: macOS, Windows, Linux
Supported clients: Claude Desktop, Cursor
`);
  }
}

// Main execution
async function main() {
  const installer = new MCPInstaller();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    installer.showHelp();
    return;
  }

  const command = process.argv[2];

  if (command === "uninstall") {
    await installer.uninstall();
  } else {
    await installer.install();
  }
}

// Run the installer
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Installation failed:", error.message);
    process.exit(1);
  });
}

export default MCPInstaller;
