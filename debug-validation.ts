import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Debug script to understand validation behavior
 */
async function debugValidation() {
  console.log("🔍 Debugging validation behavior...\n");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["./src/mcp-main.ts"],
  });

  const client = new Client({
    name: "debug-validation-client",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    console.log("✅ Connected to MCP server\n");

    // Test cases that should fail according to tests
    const testCases = [
      { name: "Empty identifier", input: "" },
      { name: "Invalid format", input: "invalid-format" },
      {
        name: "Very long identifier",
        input: `${"a".repeat(1000)}@example.com`,
      },
      { name: "Special characters", input: "test#hashtag@example.com" },
      { name: "No domain", input: "justusername" },
    ];

    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name} - "${testCase.input}"`);
      try {
        const result = await client.callTool({
          name: "discover-actor",
          arguments: {
            identifier: testCase.input,
          },
        });
        // If we get here, the call succeeded (no exception thrown)
        if (result.content[0].text?.includes("MCP error")) {
          console.log(
            `  ❌ Soft error (should be hard error): ${result.content[0].text?.substring(0, 100)}...`,
          );
        } else {
          console.log(
            `  ✅ Accepted (unexpected): ${result.content[0].text?.substring(0, 100)}...`,
          );
        }
      } catch (error) {
        // Exception was thrown - this is what we expect for validation errors
        if (error.message.includes("MCP error -32602")) {
          console.log(`  ✅ Rejected (expected): ${error.message.substring(0, 100)}...`);
        } else {
          console.log(`  ❌ Unexpected error: ${error.message.substring(0, 100)}...`);
        }
      }
      console.log();
    }

    // Test domain validation
    console.log("Testing domain validation:");
    const domainTestCases = [
      { name: "Empty domain", input: "" },
      { name: "Invalid domain", input: "not-a-domain" },
      { name: "Valid domain", input: "mastodon.social" },
    ];

    for (const testCase of domainTestCases) {
      console.log(`Testing domain: ${testCase.name} - "${testCase.input}"`);
      try {
        const result = await client.callTool({
          name: "get-instance-info",
          arguments: {
            domain: testCase.input,
          },
        });
        console.log(`  ✅ Accepted: ${result.content[0].text?.substring(0, 100)}...`);
      } catch (error) {
        console.log(`  ❌ Rejected: ${error.message}`);
      }
      console.log();
    }
  } catch (error) {
    console.error("Failed to connect:", error);
  } finally {
    await client.close();
  }
}

debugValidation().catch(console.error);
