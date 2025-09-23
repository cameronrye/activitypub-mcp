import { getLogger } from "@logtape/logtape";
import "./logging.js";
const logger = getLogger("activitypub-mcp");
logger.info("🌐 ActivityPub MCP Server - Fediverse Client Mode");
logger.info("This server operates as a fediverse CLIENT, not a server.");
logger.info("It helps you interact with EXISTING ActivityPub servers across the fediverse.");
logger.info("To use this server:");
logger.info("1. Start the MCP server: npm run mcp");
logger.info("2. Connect with Claude Desktop or MCP Inspector");
logger.info("3. Use tools like discover-actor, fetch-timeline, get-instance-info, discover-instances");
logger.info("No local ActivityPub server is running. All interactions are with remote fediverse servers.");
// Keep the process alive for MCP connections
process.on("SIGINT", () => {
    logger.info("👋 Shutting down ActivityPub MCP Server...");
    process.exit(0);
});
// Prevent the process from exiting
setInterval(() => { }, 1000);
//# sourceMappingURL=main.js.map