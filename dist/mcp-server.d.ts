/**
 * ActivityPub MCP Server
 *
 * A comprehensive Model Context Protocol server that enables LLMs to interact
 * with the ActivityPub/Fediverse ecosystem through standardized MCP tools,
 * resources, and prompts.
 */
declare class ActivityPubMCPServer {
    private mcpServer;
    private requestCounts;
    constructor();
    /**
     * Set up global error handling for the MCP server
     */
    private setupErrorHandling;
    /**
     * Rate limiting check
     */
    private checkRateLimit;
    /**
     * Validate and sanitize actor identifier
     */
    private validateActorIdentifier;
    /**
     * Validate post content
     */
    private validatePostContent;
    /**
     * Validate URI format
     */
    private validateUri;
    /**
     * Set up MCP resources for ActivityPub data access
     */
    private setupResources;
    /**
     * Set up MCP tools for fediverse interactions
     */
    private setupTools;
    /**
     * Set up MCP prompts for fediverse interactions
     */
    private setupPrompts;
    /**
     * Start the MCP server
     */
    start(): Promise<void>;
}
export default ActivityPubMCPServer;
//# sourceMappingURL=mcp-server.d.ts.map