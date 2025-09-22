import { getLogger } from "@logtape/logtape";
import { McpServer, ResourceTemplate, } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { healthChecker } from "./health-check.js";
import { instanceDiscovery } from "./instance-discovery.js";
import { performanceMonitor } from "./performance-monitor.js";
import { remoteClient } from "./remote-client.js";
import { webfingerClient } from "./webfinger.js";
const logger = getLogger("activitypub-mcp-server");
// Configuration from environment variables
const CONFIG = {
    serverName: process.env.MCP_SERVER_NAME || "activitypub-mcp-server",
    serverVersion: process.env.MCP_SERVER_VERSION || "1.0.0",
    logLevel: process.env.LOG_LEVEL || "info",
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
    rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || "100"),
    rateLimitWindow: Number.parseInt(process.env.RATE_LIMIT_WINDOW || "900000"),
};
// Input validation schemas
const ActorIdentifierSchema = z
    .string()
    .min(1, "Actor identifier cannot be empty")
    .max(100, "Actor identifier too long")
    .regex(/^[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9_-]+$/, "Actor identifier must be either a local username or a full fediverse handle (user@domain.com)");
const PostContentSchema = z
    .string()
    .min(1, "Post content cannot be empty")
    .max(5000, "Post content too long");
const UriSchema = z.string().url("Invalid URI format");
const DomainSchema = z
    .string()
    .min(1, "Domain cannot be empty")
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Invalid domain format");
/**
 * ActivityPub MCP Server
 *
 * A comprehensive Model Context Protocol server that enables LLMs to interact
 * with the ActivityPub/Fediverse ecosystem through standardized MCP tools,
 * resources, and prompts.
 */
class ActivityPubMCPServer {
    mcpServer;
    requestCounts = new Map();
    constructor() {
        this.mcpServer = new McpServer({
            name: CONFIG.serverName,
            version: CONFIG.serverVersion,
        });
        this.setupResources();
        this.setupTools();
        this.setupPrompts();
        this.setupErrorHandling();
    }
    /**
     * Set up global error handling for the MCP server
     */
    setupErrorHandling() {
        // Handle uncaught exceptions
        process.on("uncaughtException", (error) => {
            logger.error("Uncaught exception", {
                error: error.message,
                stack: error.stack,
            });
            process.exit(1);
        });
        // Handle unhandled promise rejections
        process.on("unhandledRejection", (reason, promise) => {
            logger.error("Unhandled promise rejection", { reason, promise });
        });
    }
    /**
     * Rate limiting check
     */
    checkRateLimit(identifier) {
        if (!CONFIG.rateLimitEnabled) {
            return true;
        }
        const now = Date.now();
        const key = identifier || "anonymous";
        const current = this.requestCounts.get(key);
        if (!current || now > current.resetTime) {
            this.requestCounts.set(key, {
                count: 1,
                resetTime: now + CONFIG.rateLimitWindow,
            });
            return true;
        }
        if (current.count >= CONFIG.rateLimitMax) {
            return false;
        }
        current.count++;
        return true;
    }
    /**
     * Validate and sanitize actor identifier
     */
    validateActorIdentifier(identifier) {
        try {
            return ActorIdentifierSchema.parse(identifier);
        }
        catch (error) {
            throw new McpError(ErrorCode.InvalidParams, `Invalid actor identifier: ${error instanceof z.ZodError ? error.errors[0].message : "Unknown validation error"}`);
        }
    }
    /**
     * Validate post content
     */
    validatePostContent(content) {
        try {
            return PostContentSchema.parse(content);
        }
        catch (error) {
            throw new McpError(ErrorCode.InvalidParams, `Invalid post content: ${error instanceof z.ZodError ? error.errors[0].message : "Unknown validation error"}`);
        }
    }
    /**
     * Validate URI format
     */
    validateUri(uri) {
        try {
            return UriSchema.parse(uri);
        }
        catch (error) {
            throw new McpError(ErrorCode.InvalidParams, `Invalid URI format: ${uri}`);
        }
    }
    /**
     * Set up MCP resources for ActivityPub data access
     */
    setupResources() {
        // Server info resource - get information about this MCP server
        this.mcpServer.registerResource("server-info", new ResourceTemplate("activitypub://server-info", {
            list: async () => ({
                resources: [
                    {
                        uri: "activitypub://server-info",
                        name: "server-info",
                        description: "Information about the ActivityPub MCP server",
                        mimeType: "application/json",
                    },
                ],
            }),
        }), {
            title: "ActivityPub MCP Server Information",
            description: "Get information about this ActivityPub MCP server",
            mimeType: "application/json",
        }, async (uri) => {
            const serverInfo = {
                name: CONFIG.serverName,
                version: CONFIG.serverVersion,
                description: "A Model Context Protocol server for exploring and interacting with the existing Fediverse",
                capabilities: {
                    resources: [
                        "remote-actor",
                        "remote-timeline",
                        "instance-info",
                        "remote-followers",
                        "remote-following",
                    ],
                    tools: [
                        "discover-actor",
                        "fetch-timeline",
                        "search-instance",
                        "get-instance-info",
                        "discover-instances",
                        "recommend-instances",
                        "health-check",
                        "performance-metrics",
                    ],
                    prompts: [
                        "explore-fediverse",
                        "compare-instances",
                        "discover-content",
                    ],
                },
                configuration: {
                    rateLimitEnabled: CONFIG.rateLimitEnabled,
                    rateLimitMax: CONFIG.rateLimitMax,
                    rateLimitWindow: CONFIG.rateLimitWindow,
                    logLevel: CONFIG.logLevel,
                },
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
            };
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(serverInfo, null, 2),
                    },
                ],
            };
        });
        // Remote actor resource - get actor information from any fediverse server
        this.mcpServer.registerResource("remote-actor", new ResourceTemplate("activitypub://remote-actor/{identifier}", {
            list: async () => ({
                resources: [
                    {
                        uri: "activitypub://remote-actor/{identifier}",
                        name: "remote-actor",
                        description: "Retrieve actor information from any fediverse server",
                        mimeType: "application/json",
                    },
                ],
            }),
        }), {
            title: "Remote ActivityPub Actor",
            description: "Retrieve actor information from any fediverse server (e.g., user@example.social)",
            mimeType: "application/json",
        }, async (uri, { identifier }) => {
            try {
                // Validate input
                const identifierStr = Array.isArray(identifier)
                    ? identifier[0]
                    : identifier;
                const validIdentifier = this.validateActorIdentifier(identifierStr);
                // Check rate limit
                if (!this.checkRateLimit(validIdentifier)) {
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Fetching remote actor", {
                    identifier: validIdentifier,
                });
                const actorData = await remoteClient.fetchRemoteActor(validIdentifier);
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: "application/json",
                            text: JSON.stringify(actorData, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to fetch remote actor", {
                    identifier,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, `Failed to fetch remote actor: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        });
        // Remote timeline resource - get actor's timeline/outbox from any fediverse server
        this.mcpServer.registerResource("remote-timeline", new ResourceTemplate("activitypub://remote-timeline/{identifier}", {
            list: async () => ({
                resources: [
                    {
                        uri: "activitypub://remote-timeline/{identifier}",
                        name: "remote-timeline",
                        description: "Retrieve actor's timeline/outbox from any fediverse server",
                        mimeType: "application/json",
                    },
                ],
            }),
        }), {
            title: "Remote ActivityPub Timeline",
            description: "Retrieve actor's timeline/outbox from any fediverse server (e.g., user@example.social)",
            mimeType: "application/json",
        }, async (uri, { identifier }) => {
            try {
                // Validate input
                const identifierStr = Array.isArray(identifier)
                    ? identifier[0]
                    : identifier;
                const validIdentifier = this.validateActorIdentifier(identifierStr);
                // Check rate limit
                if (!this.checkRateLimit(validIdentifier)) {
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Fetching remote timeline", {
                    identifier: validIdentifier,
                });
                const timelineData = await remoteClient.fetchActorOutbox(validIdentifier, 20);
                // Ensure the timeline data has the expected structure
                const normalizedTimeline = {
                    ...timelineData,
                    type: timelineData.type || "OrderedCollection",
                    orderedItems: timelineData.orderedItems || timelineData.items || [],
                };
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: "application/json",
                            text: JSON.stringify(normalizedTimeline, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to fetch remote timeline", {
                    identifier,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, `Failed to fetch remote timeline: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        });
        // Instance info resource - get information about any fediverse instance
        this.mcpServer.registerResource("instance-info", new ResourceTemplate("activitypub://instance-info/{domain}", {
            list: async () => ({
                resources: [
                    {
                        uri: "activitypub://instance-info/{domain}",
                        name: "instance-info",
                        description: "Get information about any fediverse instance",
                        mimeType: "application/json",
                    },
                ],
            }),
        }), {
            title: "Fediverse Instance Information",
            description: "Get information about any fediverse instance (e.g., example.social)",
            mimeType: "application/json",
        }, async (uri, { domain }) => {
            try {
                // Validate input
                const domainStr = Array.isArray(domain) ? domain[0] : domain;
                const validDomain = DomainSchema.parse(domainStr);
                // Check rate limit
                if (!this.checkRateLimit(validDomain)) {
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Fetching instance info", { domain: validDomain });
                const instanceInfo = await remoteClient.getInstanceInfo(validDomain);
                // Transform to the format expected by tests
                const normalizedInstanceInfo = {
                    ...instanceInfo,
                    title: instanceInfo.description ||
                        `${instanceInfo.software || "Unknown"} instance`,
                    uri: `https://${validDomain}`,
                };
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: "application/json",
                            text: JSON.stringify(normalizedInstanceInfo, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to fetch instance info", {
                    domain,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, `Failed to fetch instance info: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        });
        // Remote followers resource
        this.mcpServer.registerResource("remote-followers", new ResourceTemplate("activitypub://remote-followers/{identifier}", {
            list: async () => ({
                resources: [
                    {
                        uri: "activitypub://remote-followers/{identifier}",
                        name: "remote-followers",
                        description: "Retrieve followers of an actor from any fediverse server",
                        mimeType: "application/json",
                    },
                ],
            }),
        }), {
            title: "Remote Actor Followers",
            description: "Retrieve followers of an actor from any fediverse server",
            mimeType: "application/json",
        }, async (uri, { identifier }) => {
            try {
                const identifierStr = Array.isArray(identifier)
                    ? identifier[0]
                    : identifier;
                const validIdentifier = this.validateActorIdentifier(identifierStr);
                if (!this.checkRateLimit(validIdentifier)) {
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Fetching remote followers", {
                    identifier: validIdentifier,
                });
                const followersData = await remoteClient.fetchActorFollowers(validIdentifier, 20);
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: "application/json",
                            text: JSON.stringify(followersData, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to fetch remote followers", {
                    identifier,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, `Failed to fetch remote followers: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        });
        // Remote following resource
        this.mcpServer.registerResource("remote-following", new ResourceTemplate("activitypub://remote-following/{identifier}", {
            list: async () => ({
                resources: [
                    {
                        uri: "activitypub://remote-following/{identifier}",
                        name: "remote-following",
                        description: "Retrieve who an actor is following from any fediverse server",
                        mimeType: "application/json",
                    },
                ],
            }),
        }), {
            title: "Remote Actor Following",
            description: "Retrieve who an actor is following from any fediverse server",
            mimeType: "application/json",
        }, async (uri, { identifier }) => {
            try {
                const identifierStr = Array.isArray(identifier)
                    ? identifier[0]
                    : identifier;
                const validIdentifier = this.validateActorIdentifier(identifierStr);
                if (!this.checkRateLimit(validIdentifier)) {
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Fetching remote following", {
                    identifier: validIdentifier,
                });
                const followingData = await remoteClient.fetchActorFollowing(validIdentifier, 20);
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: "application/json",
                            text: JSON.stringify(followingData, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to fetch remote following", {
                    identifier,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, `Failed to fetch remote following: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        });
    }
    /**
     * Set up MCP tools for fediverse interactions
     */
    setupTools() {
        // Discover actor tool - find actors across the fediverse
        this.mcpServer.registerTool("discover-actor", {
            title: "Discover Fediverse Actor",
            description: "Discover and get information about any actor in the fediverse",
            inputSchema: {
                identifier: z
                    .string()
                    .describe("Actor identifier (e.g., user@example.social)"),
            },
        }, async ({ identifier }) => {
            const requestId = performanceMonitor.startRequest("discover-actor", {
                identifier,
            });
            try {
                const validIdentifier = this.validateActorIdentifier(identifier);
                if (!this.checkRateLimit(validIdentifier)) {
                    performanceMonitor.endRequest(requestId, false, "Rate limit exceeded");
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Discovering actor", { identifier: validIdentifier });
                const actor = await remoteClient.fetchRemoteActor(validIdentifier);
                performanceMonitor.endRequest(requestId, true);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully discovered actor: ${actor.preferredUsername || actor.name || validIdentifier}

🆔 ID: ${actor.id}
👤 Name: ${actor.name || "Not specified"}
📝 Summary: ${actor.summary || "No bio provided"}
🔗 URL: ${actor.url || actor.id}
📥 Inbox: ${actor.inbox}
📤 Outbox: ${actor.outbox}
👥 Followers: ${actor.followers || "Not available"}
👤 Following: ${actor.following || "Not available"}`,
                        },
                    ],
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                performanceMonitor.endRequest(requestId, false, errorMessage);
                logger.error("Failed to discover actor", {
                    identifier,
                    error: errorMessage,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to discover actor: ${error instanceof Error ? error.message : "Unknown error"}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        // Fetch actor timeline tool
        this.mcpServer.registerTool("fetch-timeline", {
            title: "Fetch Actor Timeline",
            description: "Fetch recent posts from any actor's timeline in the fediverse",
            inputSchema: {
                identifier: z
                    .string()
                    .describe("Actor identifier (e.g., user@example.social)"),
                limit: z
                    .number()
                    .min(1)
                    .max(50)
                    .optional()
                    .describe("Number of posts to fetch (default: 20)"),
            },
        }, async ({ identifier, limit = 20 }) => {
            try {
                const validIdentifier = this.validateActorIdentifier(identifier);
                if (!this.checkRateLimit(validIdentifier)) {
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Fetching timeline", {
                    identifier: validIdentifier,
                    limit,
                });
                const timeline = await remoteClient.fetchActorOutbox(validIdentifier, limit);
                const posts = timeline.orderedItems || timeline.items || [];
                const postCount = posts.length;
                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully fetched timeline for ${validIdentifier}

📊 Total items: ${timeline.totalItems || "Unknown"}
📝 Posts retrieved: ${postCount}
🔗 Timeline ID: ${timeline.id}

Recent posts:
${posts
                                .slice(0, 5)
                                .map((post, index) => {
                                const p = post;
                                return `${index + 1}. ${p.type || "Post"}: ${p.content || p.summary || "No content"}`;
                            })
                                .join("\n")}

${postCount > 5 ? `... and ${postCount - 5} more posts` : ""}`,
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to fetch timeline", {
                    identifier,
                    error: error instanceof Error ? error.message : String(error),
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to fetch timeline: ${error instanceof Error ? error.message : "Unknown error"}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        // Search instance tool
        this.mcpServer.registerTool("search-instance", {
            title: "Search Fediverse Instance",
            description: "Search for content on a specific fediverse instance",
            inputSchema: {
                domain: z.string().describe("Instance domain (e.g., example.social)"),
                query: z.string().describe("Search query"),
                type: z
                    .enum(["accounts", "statuses", "hashtags"])
                    .optional()
                    .describe("Type of content to search for"),
            },
        }, async ({ domain, query, type = "accounts" }) => {
            try {
                const validDomain = DomainSchema.parse(domain);
                if (!this.checkRateLimit(validDomain)) {
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Searching instance", {
                    domain: validDomain,
                    query,
                    type,
                });
                const results = await remoteClient.searchInstance(validDomain, query, type);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Search results for "${query}" on ${validDomain} (${type}):

${JSON.stringify(results, null, 2)}`,
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to search instance", {
                    domain,
                    query,
                    error: error instanceof Error ? error.message : String(error),
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to search instance: ${error instanceof Error ? error.message : "Unknown error"}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        // Get instance info tool
        this.mcpServer.registerTool("get-instance-info", {
            title: "Get Instance Information",
            description: "Get detailed information about a fediverse instance",
            inputSchema: {
                domain: z.string().describe("Instance domain (e.g., example.social)"),
            },
        }, async ({ domain }) => {
            try {
                const validDomain = DomainSchema.parse(domain);
                if (!this.checkRateLimit(validDomain)) {
                    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
                }
                logger.info("Getting instance info", { domain: validDomain });
                const instanceInfo = await remoteClient.getInstanceInfo(validDomain);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Instance Information for ${validDomain}:

🌐 Domain: ${instanceInfo.domain}
💻 Software: ${instanceInfo.software || "Unknown"}
📦 Version: ${instanceInfo.version || "Unknown"}
📝 Description: ${instanceInfo.description || "No description"}
🌍 Languages: ${instanceInfo.languages?.join(", ") || "Not specified"}
📝 Registrations: ${instanceInfo.registrations ? "Open" : "Closed"}
✅ Approval Required: ${instanceInfo.approval_required ? "Yes" : "No"}

${instanceInfo.stats
                                ? `📊 Statistics:
👥 Users: ${instanceInfo.stats.user_count || "Unknown"}
📝 Posts: ${instanceInfo.stats.status_count || "Unknown"}
🌐 Domains: ${instanceInfo.stats.domain_count || "Unknown"}`
                                : ""}

${instanceInfo.contact_account ? `📞 Contact: @${instanceInfo.contact_account.username} (${instanceInfo.contact_account.display_name || "No display name"})` : ""}`,
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to get instance info", {
                    domain,
                    error: error instanceof Error ? error.message : String(error),
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to get instance info: ${error instanceof Error ? error.message : "Unknown error"}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        // Discover instances tool
        this.mcpServer.registerTool("discover-instances", {
            title: "Discover Fediverse Instances",
            description: "Discover popular fediverse instances by category, topic, or size",
            inputSchema: {
                category: z
                    .enum([
                    "mastodon",
                    "pleroma",
                    "misskey",
                    "peertube",
                    "pixelfed",
                    "lemmy",
                    "all",
                ])
                    .optional()
                    .describe("Type of fediverse software"),
                topic: z
                    .string()
                    .optional()
                    .describe("Topic or interest to search for"),
                size: z
                    .enum(["small", "medium", "large"])
                    .optional()
                    .describe("Instance size preference"),
                region: z
                    .string()
                    .optional()
                    .describe("Geographic region or language"),
                beginnerFriendly: z
                    .boolean()
                    .optional()
                    .describe("Show only beginner-friendly instances"),
            },
        }, async ({ category, topic, size, region, beginnerFriendly }) => {
            try {
                logger.info("Discovering instances", {
                    category,
                    topic,
                    size,
                    region,
                    beginnerFriendly,
                });
                let instances = instanceDiscovery.getPopularInstances(category === "all" ? undefined : category);
                // Apply filters
                if (topic) {
                    instances = instanceDiscovery.searchInstancesByTopic(topic);
                }
                if (size) {
                    instances = instanceDiscovery.getInstancesBySize(size);
                }
                if (region) {
                    instances = instanceDiscovery.getInstancesByRegion(region);
                }
                if (beginnerFriendly) {
                    instances = instanceDiscovery.getBeginnerFriendlyInstances();
                }
                // Limit results to avoid overwhelming output
                const limitedInstances = instances.slice(0, 20);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Found ${instances.length} fediverse instances${limitedInstances.length < instances.length ? ` (showing first ${limitedInstances.length})` : ""}:

${limitedInstances
                                .map((instance, index) => `${index + 1}. **${instance.domain}** ${instance.software ? `(${instance.software})` : ""}
   👥 Users: ${instance.users}
   📝 ${instance.description}`)
                                .join("\n\n")}

${limitedInstances.length < instances.length ? `\n... and ${instances.length - limitedInstances.length} more instances` : ""}

💡 **Tip**: Use the \`get-instance-info\` tool to get detailed information about any specific instance.`,
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to discover instances", {
                    error: error instanceof Error ? error.message : String(error),
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to discover instances: ${error instanceof Error ? error.message : "Unknown error"}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        // Get instance recommendations tool
        this.mcpServer.registerTool("recommend-instances", {
            title: "Get Instance Recommendations",
            description: "Get personalized fediverse instance recommendations based on interests",
            inputSchema: {
                interests: z
                    .array(z.string())
                    .describe("List of your interests or topics"),
            },
        }, async ({ interests }) => {
            try {
                logger.info("Getting instance recommendations", { interests });
                const recommendations = instanceDiscovery.getInstanceRecommendations(interests);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Based on your interests (${interests.join(", ")}), here are some recommended fediverse instances:

${recommendations
                                .map((instance, index) => `${index + 1}. **${instance.domain}** ${instance.software ? `(${instance.software})` : ""}
   👥 Users: ${instance.users}
   📝 ${instance.description}
   🎯 Why recommended: Matches your interest in ${interests.find((i) => instance.description.toLowerCase().includes(i.toLowerCase()) ||
                                instance.domain.toLowerCase().includes(i.toLowerCase())) || "general topics"}`)
                                .join("\n\n")}

💡 **Next steps**:
- Use \`get-instance-info\` to learn more about any instance
- Use \`discover-actor\` to find interesting people on these instances
- Check out the instance's local timeline to see the community vibe`,
                        },
                    ],
                };
            }
            catch (error) {
                logger.error("Failed to get instance recommendations", {
                    interests,
                    error: error instanceof Error ? error.message : String(error),
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to get instance recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        // Health check tool
        this.mcpServer.registerTool("health-check", {
            title: "Server Health Check",
            description: "Check the health status of the ActivityPub MCP server",
            inputSchema: {
                includeMetrics: z
                    .boolean()
                    .optional()
                    .describe("Include detailed performance metrics in the response"),
            },
        }, async ({ includeMetrics = false }) => {
            const requestId = performanceMonitor.startRequest("health-check", {
                includeMetrics,
            });
            try {
                const healthStatus = await healthChecker.performHealthCheck(includeMetrics);
                performanceMonitor.endRequest(requestId, true);
                return {
                    content: [
                        {
                            type: "text",
                            text: `🏥 **Server Health Check**

**Overall Status**: ${healthStatus.status.toUpperCase()} ${healthStatus.status === "healthy" ? "✅" : healthStatus.status === "degraded" ? "⚠️" : "❌"}
**Uptime**: ${Math.round(healthStatus.uptime / 1000 / 60)} minutes
**Version**: ${healthStatus.version}
**Timestamp**: ${healthStatus.timestamp}

**Health Checks**:
${Object.entries(healthStatus.checks)
                                .map(([name, check]) => `• **${name}**: ${check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌"} ${check.message} (${check.duration}ms)`)
                                .join("\n")}

${healthStatus.metrics
                                ? `
**Performance Metrics**:
• **Requests**: ${healthStatus.metrics.requests.total} total, ${healthStatus.metrics.requests.errors} errors (${healthStatus.metrics.requests.errorRate.toFixed(2)}% error rate)
• **Response Times**: ${healthStatus.metrics.performance.averageResponseTime.toFixed(2)}ms avg, ${healthStatus.metrics.performance.p95ResponseTime.toFixed(2)}ms p95, ${healthStatus.metrics.performance.p99ResponseTime.toFixed(2)}ms p99
• **System**: ${healthStatus.metrics.system.memoryUsageMB}MB memory, ${Math.round(healthStatus.metrics.system.uptime / 1000 / 60)} min uptime
`
                                : ""}`,
                        },
                    ],
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                performanceMonitor.endRequest(requestId, false, errorMessage);
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ Health check failed: ${errorMessage}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        // Performance metrics tool
        this.mcpServer.registerTool("performance-metrics", {
            title: "Performance Metrics",
            description: "Get detailed performance metrics for the ActivityPub MCP server",
            inputSchema: {
                operation: z
                    .string()
                    .optional()
                    .describe("Specific operation to get metrics for (e.g., 'discover-actor')"),
            },
        }, async ({ operation }) => {
            const requestId = performanceMonitor.startRequest("performance-metrics", { operation });
            try {
                if (operation) {
                    const operationMetrics = performanceMonitor.getOperationMetrics(operation);
                    performanceMonitor.endRequest(requestId, true);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `📊 **Performance Metrics for "${operation}"**

• **Total Requests**: ${operationMetrics.count}
• **Successful**: ${operationMetrics.successCount} (${(operationMetrics.successRate * 100).toFixed(2)}%)
• **Failed**: ${operationMetrics.errorCount}
• **Average Response Time**: ${operationMetrics.averageResponseTime.toFixed(2)}ms`,
                            },
                        ],
                    };
                }
                const metrics = performanceMonitor.getMetrics();
                const requestHistory = performanceMonitor.getRequestHistory(10);
                performanceMonitor.endRequest(requestId, true);
                return {
                    content: [
                        {
                            type: "text",
                            text: `📊 **Overall Performance Metrics**

**Request Statistics**:
• **Total Requests**: ${metrics.requestCount}
• **Errors**: ${metrics.errorCount} (${metrics.requestCount > 0 ? ((metrics.errorCount / metrics.requestCount) * 100).toFixed(2) : 0}% error rate)

**Response Times**:
• **Average**: ${metrics.averageResponseTime.toFixed(2)}ms
• **Min**: ${metrics.minResponseTime}ms
• **Max**: ${metrics.maxResponseTime}ms
• **95th Percentile**: ${metrics.p95ResponseTime.toFixed(2)}ms
• **99th Percentile**: ${metrics.p99ResponseTime.toFixed(2)}ms

**System Resources**:
• **Memory Usage**: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB heap used
• **Uptime**: ${Math.round(metrics.uptime / 1000 / 60)} minutes

**Recent Requests** (last 10):
${requestHistory
                                .map((req) => `• ${req.operation}: ${req.duration}ms ${req.success ? "✅" : "❌"}`)
                                .join("\n")}`,
                        },
                    ],
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                performanceMonitor.endRequest(requestId, false, errorMessage);
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ Failed to get performance metrics: ${errorMessage}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }
    /**
     * Set up MCP prompts for fediverse interactions
     */
    setupPrompts() {
        // Fediverse exploration prompt
        this.mcpServer.registerPrompt("explore-fediverse", {
            title: "Explore the Fediverse",
            description: "Get guidance on exploring and discovering content in the fediverse",
            argsSchema: {
                interests: z
                    .string()
                    .describe("Your interests or topics you want to explore"),
                instanceType: z
                    .enum(["mastodon", "pleroma", "misskey", "any"])
                    .optional()
                    .describe("Preferred type of fediverse instance"),
            },
        }, ({ interests, instanceType }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `I'm interested in exploring the fediverse, particularly content related to: ${interests}. ${instanceType && instanceType !== "any" ? `I prefer ${instanceType} instances.` : ""} Can you help me discover interesting actors, instances, and communities to follow? Please suggest specific usernames and instances I should check out.`,
                    },
                },
            ],
        }));
        // Instance comparison prompt
        this.mcpServer.registerPrompt("compare-instances", {
            title: "Compare Fediverse Instances",
            description: "Get help comparing different fediverse instances",
            argsSchema: {
                instances: z
                    .string()
                    .describe("Comma-separated list of instance domains to compare"),
                criteria: z
                    .string()
                    .optional()
                    .describe("Specific criteria for comparison (e.g., size, rules, features)"),
            },
        }, ({ instances, criteria }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Please help me compare these fediverse instances: ${instances}. ${criteria ? `I'm particularly interested in: ${criteria}.` : ""} What are the key differences, strengths, and characteristics of each instance? Which one might be best for different types of users?`,
                    },
                },
            ],
        }));
        // Content discovery prompt
        this.mcpServer.registerPrompt("discover-content", {
            title: "Discover Fediverse Content",
            description: "Get recommendations for discovering interesting content and people",
            argsSchema: {
                topic: z.string().describe("Topic or subject you want to explore"),
                contentType: z
                    .enum(["people", "hashtags", "instances", "all"])
                    .optional()
                    .describe("Type of content to discover"),
            },
        }, ({ topic, contentType = "all" }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `I want to discover ${contentType === "all" ? "content" : contentType} related to "${topic}" in the fediverse. Can you suggest specific ${contentType === "people" ? "accounts to follow" : contentType === "hashtags" ? "hashtags to search" : contentType === "instances" ? "instances to explore" : "accounts, hashtags, and instances"} that would be interesting for someone interested in ${topic}?`,
                    },
                },
            ],
        }));
    }
    /**
     * Start the MCP server
     */
    async start() {
        const transport = new StdioServerTransport();
        await this.mcpServer.connect(transport);
        logger.info("ActivityPub MCP Server started");
    }
}
// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new ActivityPubMCPServer();
    server.start().catch((error) => {
        logger.error("Failed to start MCP server", error);
        process.exit(1);
    });
}
export default ActivityPubMCPServer;
//# sourceMappingURL=mcp-server.js.map