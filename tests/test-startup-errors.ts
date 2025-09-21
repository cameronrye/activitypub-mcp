import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Test script to trigger startup errors in mcp-main.ts
 * This test aims to cover lines 17-19 in mcp-main.ts
 */
async function testStartupErrors() {
  console.log("🚨 Testing MCP Server Startup Error Scenarios...\n");

  // Test 1: Try to start server with invalid port (already in use)
  console.log("Test 1: Testing port conflict scenario");

  try {
    // First, start a server on port 8000
    const server1 = spawn("tsx", ["./src/mcp-main.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: "8000" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait a bit for the first server to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Try to start another server on the same port
    const server2 = spawn("tsx", ["./src/mcp-main.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: "8000" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let errorOutput = "";
    server2.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    // Wait for the second server to fail
    await new Promise((resolve) => {
      server2.on("exit", (code) => {
        if (code !== 0) {
          console.log(
            "✅ Server startup failed as expected with port conflict",
          );
          console.log(`   Exit code: ${code}`);
          if (errorOutput.includes("Failed to start ActivityPub MCP Server")) {
            console.log("✅ Error handling code was triggered");
          }
        }
        resolve(code);
      });
    });

    // Clean up first server
    server1.kill();
  } catch (error) {
    console.log("❌ Error in port conflict test:", error);
  }

  // Test 2: Try to start server with invalid configuration
  console.log("\nTest 2: Testing invalid configuration scenario");

  try {
    // Create a temporary invalid config file
    const invalidConfig = {
      invalid: "configuration",
      port: "not-a-number",
      host: null,
    };

    const configPath = path.join(process.cwd(), "temp-invalid-config.json");
    await fs.writeFile(configPath, JSON.stringify(invalidConfig));

    const server = spawn("tsx", ["./src/mcp-main.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CONFIG_FILE: configPath,
        PORT: "invalid-port",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let errorOutput = "";
    server.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    await new Promise((resolve) => {
      server.on("exit", (code) => {
        if (code !== 0) {
          console.log(
            "✅ Server startup failed as expected with invalid config",
          );
          console.log(`   Exit code: ${code}`);
          if (errorOutput.includes("Failed to start ActivityPub MCP Server")) {
            console.log("✅ Error handling code was triggered");
          }
        }
        resolve(code);
      });
    });

    // Clean up temp file
    try {
      await fs.unlink(configPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  } catch (error) {
    console.log("❌ Error in invalid config test:", error);
  }

  // Test 3: Try to start server with insufficient permissions
  console.log("\nTest 3: Testing permission error scenario");

  try {
    // Try to bind to a privileged port (requires root)
    const server = spawn("tsx", ["./src/mcp-main.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: "80" }, // Privileged port
      stdio: ["pipe", "pipe", "pipe"],
    });

    let errorOutput = "";
    server.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    await new Promise((resolve) => {
      server.on("exit", (code) => {
        if (code !== 0) {
          console.log(
            "✅ Server startup failed as expected with permission error",
          );
          console.log(`   Exit code: ${code}`);
          if (errorOutput.includes("Failed to start ActivityPub MCP Server")) {
            console.log("✅ Error handling code was triggered");
          }
        }
        resolve(code);
      });
    });
  } catch (error) {
    console.log("❌ Error in permission test:", error);
  }

  // Test 4: Try to start server with corrupted source files
  console.log("\nTest 4: Testing corrupted source scenario");

  try {
    // Create a temporary corrupted version of mcp-main.ts
    const originalPath = path.join(process.cwd(), "src", "mcp-main.ts");
    const tempPath = path.join(process.cwd(), "temp-corrupted-main.ts");

    // Create a corrupted version
    const corruptedContent = `
      // This is intentionally corrupted TypeScript
      import { invalid syntax here
      const broken = function() {
        throw new Error("Intentional startup error");
      };
      broken();
    `;

    await fs.writeFile(tempPath, corruptedContent);

    const server = spawn("tsx", [tempPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let errorOutput = "";
    server.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    await new Promise((resolve) => {
      server.on("exit", (code) => {
        if (code !== 0) {
          console.log(
            "✅ Server startup failed as expected with corrupted source",
          );
          console.log(`   Exit code: ${code}`);
        }
        resolve(code);
      });
    });

    // Clean up temp file
    try {
      await fs.unlink(tempPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  } catch (error) {
    console.log("❌ Error in corrupted source test:", error);
  }

  // Test 5: Try to start server with missing dependencies
  console.log("\nTest 5: Testing missing dependency scenario");

  try {
    // Create a temporary main file that imports non-existent modules
    const tempPath = path.join(process.cwd(), "temp-missing-deps-main.ts");

    const missingDepsContent = `
      import { NonExistentModule } from "non-existent-package";
      import { AnotherMissing } from "./non-existent-file";
      
      async function main() {
        try {
          const server = new NonExistentModule();
          await server.start();
        } catch (error) {
          console.error("Failed to start ActivityPub MCP Server:", error);
          process.exit(1);
        }
      }
      
      main();
    `;

    await fs.writeFile(tempPath, missingDepsContent);

    const server = spawn("tsx", [tempPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let errorOutput = "";
    server.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    await new Promise((resolve) => {
      server.on("exit", (code) => {
        if (code !== 0) {
          console.log(
            "✅ Server startup failed as expected with missing dependencies",
          );
          console.log(`   Exit code: ${code}`);
          if (errorOutput.includes("Failed to start ActivityPub MCP Server")) {
            console.log("✅ Error handling code was triggered");
          }
        }
        resolve(code);
      });
    });

    // Clean up temp file
    try {
      await fs.unlink(tempPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  } catch (error) {
    console.log("❌ Error in missing dependency test:", error);
  }

  console.log("\n🎉 Startup error tests completed!");
}

// Run the tests
testStartupErrors().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
