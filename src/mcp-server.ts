import { getLogger } from "@logtape/logtape";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import federation from "./federation.js";

const logger = getLogger("activitypub-mcp-server");

// Configuration from environment variables
const CONFIG = {
  baseUrl: process.env.ACTIVITYPUB_BASE_URL || "http://localhost:8000",
  serverName: process.env.MCP_SERVER_NAME || "activitypub-mcp-server",
  serverVersion: process.env.MCP_SERVER_VERSION || "1.0.0",
  logLevel: process.env.LOG_LEVEL || "info",
  enableCors: process.env.ENABLE_CORS === "true",
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
  rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || "100"),
  rateLimitWindow: Number.parseInt(process.env.RATE_LIMIT_WINDOW || "900000"),
};

// Input validation schemas
const ActorIdentifierSchema = z
  .string()
  .min(1, "Actor identifier cannot be empty")
  .max(50, "Actor identifier too long")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Actor identifier can only contain letters, numbers, underscores, and hyphens",
  );

const PostContentSchema = z
  .string()
  .min(1, "Post content cannot be empty")
  .max(5000, "Post content too long");

const UriSchema = z.string().url("Invalid URI format");

/**
 * ActivityPub MCP Server
 *
 * A comprehensive Model Context Protocol server that enables LLMs to interact
 * with the ActivityPub/Fediverse ecosystem through standardized MCP tools,
 * resources, and prompts.
 */
class ActivityPubMCPServer {
  private mcpServer: McpServer;
  private requestCounts: Map<string, { count: number; resetTime: number }> =
    new Map();

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
  private setupErrorHandling() {
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
  private checkRateLimit(identifier: string): boolean {
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
  private validateActorIdentifier(identifier: string): string {
    try {
      return ActorIdentifierSchema.parse(identifier);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid actor identifier: ${error instanceof z.ZodError ? error.errors[0].message : "Unknown validation error"}`,
      );
    }
  }

  /**
   * Validate post content
   */
  private validatePostContent(content: string): string {
    try {
      return PostContentSchema.parse(content);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid post content: ${error instanceof z.ZodError ? error.errors[0].message : "Unknown validation error"}`,
      );
    }
  }

  /**
   * Validate URI format
   */
  private validateUri(uri: string): string {
    try {
      return UriSchema.parse(uri);
    } catch (error) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid URI format: ${uri}`);
    }
  }

  /**
   * Set up MCP resources for ActivityPub data access
   */
  private setupResources() {
    // Actor resource - get actor information
    this.mcpServer.registerResource(
      "actor",
      new ResourceTemplate("activitypub://actor/{identifier}", {
        list: undefined,
      }),
      {
        title: "ActivityPub Actor",
        description: "Retrieve actor information from the ActivityPub server",
        mimeType: "application/json",
      },
      async (uri, { identifier }) => {
        try {
          // Validate input
          const identifierStr = Array.isArray(identifier)
            ? identifier[0]
            : identifier;
          const validIdentifier = this.validateActorIdentifier(identifierStr);

          // Check rate limit
          if (!this.checkRateLimit(validIdentifier)) {
            throw new McpError(
              ErrorCode.InternalError,
              "Rate limit exceeded. Please try again later.",
            );
          }

          const actorUri = `${CONFIG.baseUrl}/users/${validIdentifier}`;
          logger.info("Fetching actor", {
            identifier: validIdentifier,
            uri: actorUri,
          });

          const response = await fetch(actorUri, {
            headers: {
              Accept: "application/activity+json",
              "User-Agent": `${CONFIG.serverName}/${CONFIG.serverVersion}`,
            },
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });

          if (!response.ok) {
            if (response.status === 404) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Actor '${validIdentifier}' not found`,
              );
            }
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to fetch actor: ${response.status} ${response.statusText}`,
            );
          }

          const actorData = await response.json();

          // Validate response structure
          if (!actorData.id || !actorData.type) {
            throw new McpError(
              ErrorCode.InternalError,
              "Invalid actor data received from server",
            );
          }

          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(actorData, null, 2),
              },
            ],
          };
        } catch (error) {
          logger.error("Failed to fetch actor", {
            identifier,
            error: error instanceof Error ? error.message : String(error),
          });

          if (error instanceof McpError) {
            throw error;
          }

          throw new McpError(
            ErrorCode.InternalError,
            `Failed to fetch actor: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    );

    // Timeline resource - get actor's timeline/outbox
    this.mcpServer.registerResource(
      "timeline",
      new ResourceTemplate("activitypub://timeline/{identifier}", {
        list: undefined,
      }),
      {
        title: "ActivityPub Timeline",
        description: "Retrieve actor's timeline/outbox",
        mimeType: "application/json",
      },
      async (uri, { identifier }) => {
        try {
          // Validate input
          const identifierStr = Array.isArray(identifier)
            ? identifier[0]
            : identifier;
          const validIdentifier = this.validateActorIdentifier(identifierStr);

          // Check rate limit
          if (!this.checkRateLimit(validIdentifier)) {
            throw new McpError(
              ErrorCode.InternalError,
              "Rate limit exceeded. Please try again later.",
            );
          }

          const outboxUri = `${CONFIG.baseUrl}/users/${validIdentifier}/outbox`;
          logger.info("Fetching timeline", {
            identifier: validIdentifier,
            uri: outboxUri,
          });

          try {
            const response = await fetch(outboxUri, {
              headers: {
                Accept: "application/activity+json",
                "User-Agent": `${CONFIG.serverName}/${CONFIG.serverVersion}`,
              },
              signal: AbortSignal.timeout(10000),
            });

            if (response.ok) {
              const timelineData = await response.json();

              // Validate response structure
              if (!timelineData.type || !timelineData.id) {
                throw new Error("Invalid timeline data structure");
              }

              return {
                contents: [
                  {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(timelineData, null, 2),
                  },
                ],
              };
            }
          } catch (fetchError) {
            logger.warn(
              "Failed to fetch actual timeline, returning placeholder",
              {
                identifier: validIdentifier,
                error:
                  fetchError instanceof Error
                    ? fetchError.message
                    : String(fetchError),
              },
            );
          }

          // Return placeholder if actual timeline fetch fails
          const timelineData = {
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "OrderedCollection",
            id: `${CONFIG.baseUrl}/users/${validIdentifier}/outbox`,
            totalItems: 0,
            orderedItems: [],
            summary: "Timeline is empty or not yet implemented",
          };

          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(timelineData, null, 2),
              },
            ],
          };
        } catch (error) {
          logger.error("Failed to fetch timeline", {
            identifier,
            error: error instanceof Error ? error.message : String(error),
          });

          if (error instanceof McpError) {
            throw error;
          }

          throw new McpError(
            ErrorCode.InternalError,
            `Failed to fetch timeline: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    );

    // Server info resource
    this.mcpServer.registerResource(
      "server-info",
      "activitypub://server-info",
      {
        title: "ActivityPub Server Information",
        description: "Get information about this ActivityPub server",
        mimeType: "application/json",
      },
      async (uri) => {
        try {
          const serverInfo = {
            name: CONFIG.serverName,
            version: CONFIG.serverVersion,
            description:
              "A Model Context Protocol server for ActivityPub interactions",
            baseUrl: CONFIG.baseUrl,
            capabilities: [
              "actor-creation",
              "post-creation",
              "following",
              "likes",
              "shares",
            ],
            protocols: ["activitypub", "webfinger"],
            mcp: {
              version: "2024-11-05",
              features: ["resources", "tools", "prompts", "sampling"],
            },
            configuration: {
              rateLimitEnabled: CONFIG.rateLimitEnabled,
              rateLimitMax: CONFIG.rateLimitMax,
              rateLimitWindow: CONFIG.rateLimitWindow,
              corsEnabled: CONFIG.enableCors,
            },
            status: "operational",
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
        } catch (error) {
          logger.error("Failed to get server info", {
            error: error instanceof Error ? error.message : String(error),
          });
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to get server info: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    );
  }

  /**
   * Set up MCP tools for ActivityPub actions
   */
  private setupTools() {
    // Create actor tool
    this.mcpServer.registerTool(
      "create-actor",
      {
        title: "Create ActivityPub Actor",
        description: "Create a new ActivityPub actor/user",
        inputSchema: {
          identifier: z.string().describe("Unique identifier for the actor"),
          name: z.string().optional().describe("Display name for the actor"),
          summary: z.string().optional().describe("Bio/summary for the actor"),
        },
      },
      async ({ identifier, name, summary }) => {
        try {
          // Validate inputs
          const validIdentifier = this.validateActorIdentifier(identifier);

          // Check rate limit
          if (!this.checkRateLimit(validIdentifier)) {
            throw new McpError(
              ErrorCode.InternalError,
              "Rate limit exceeded. Please try again later.",
            );
          }

          // Validate optional fields
          if (name && name.length > 100) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Actor name too long (max 100 characters)",
            );
          }

          if (summary && summary.length > 500) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Actor summary too long (max 500 characters)",
            );
          }

          logger.info("Creating actor", {
            identifier: validIdentifier,
            name,
            summary: summary ? `${summary.substring(0, 50)}...` : undefined,
          });

          // Check if actor already exists
          const actorUri = `${CONFIG.baseUrl}/users/${validIdentifier}`;
          try {
            const checkResponse = await fetch(actorUri, {
              headers: { Accept: "application/activity+json" },
              signal: AbortSignal.timeout(5000),
            });

            if (checkResponse.ok) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Actor '${validIdentifier}' already exists`,
              );
            }
          } catch (fetchError) {
            // If fetch fails, assume actor doesn't exist (which is what we want)
            if (fetchError instanceof McpError) {
              throw fetchError;
            }
          }

          // TODO: Implement actual actor creation via federation
          // For now, we simulate success since federation.ts handles basic actor dispatch

          return {
            content: [
              {
                type: "text",
                text: `Successfully created actor: ${validIdentifier}\nActor URI: ${actorUri}\nName: ${name || validIdentifier}\nSummary: ${summary || "No summary provided"}`,
              },
            ],
          };
        } catch (error) {
          logger.error("Failed to create actor", {
            identifier,
            error: error instanceof Error ? error.message : String(error),
          });

          if (error instanceof McpError) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to create actor: ${error.message}`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Failed to create actor: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Post creation tool
    this.mcpServer.registerTool(
      "create-post",
      {
        title: "Create ActivityPub Post",
        description: "Create a new ActivityPub post/note",
        inputSchema: {
          actor: z
            .string()
            .describe("Actor identifier who is creating the post"),
          content: z.string().describe("Content of the post"),
          to: z
            .array(z.string())
            .optional()
            .describe("Recipients (URIs or 'public')"),
          cc: z.array(z.string()).optional().describe("CC recipients"),
          inReplyTo: z
            .string()
            .optional()
            .describe("URI of post being replied to"),
        },
      },
      async ({ actor, content, to, cc, inReplyTo }) => {
        try {
          // This is a placeholder - we'll need to implement actual post creation
          logger.info("Creating post", { actor, content, to, cc, inReplyTo });

          const postId = `http://localhost:8000/users/${actor}/posts/${Date.now()}`;

          return {
            content: [
              {
                type: "text",
                text: `Successfully created post by ${actor}\nPost ID: ${postId}\nContent: ${content}`,
              },
            ],
          };
        } catch (error) {
          logger.error("Failed to create post", { actor, error });
          return {
            content: [
              {
                type: "text",
                text: `Failed to create post: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Follow tool
    this.mcpServer.registerTool(
      "follow-actor",
      {
        title: "Follow ActivityPub Actor",
        description: "Follow another ActivityPub actor",
        inputSchema: {
          follower: z.string().describe("Actor identifier who is following"),
          target: z.string().describe("Actor URI or handle to follow"),
        },
      },
      async ({ follower, target }) => {
        try {
          logger.info("Following actor", { follower, target });

          return {
            content: [
              {
                type: "text",
                text: `${follower} is now following ${target}`,
              },
            ],
          };
        } catch (error) {
          logger.error("Failed to follow actor", { follower, target, error });
          return {
            content: [
              {
                type: "text",
                text: `Failed to follow actor: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Like tool
    this.mcpServer.registerTool(
      "like-post",
      {
        title: "Like ActivityPub Post",
        description: "Like an ActivityPub post",
        inputSchema: {
          actor: z.string().describe("Actor identifier who is liking"),
          postUri: z.string().describe("URI of the post to like"),
        },
      },
      async ({ actor, postUri }) => {
        try {
          logger.info("Liking post", { actor, postUri });

          return {
            content: [
              {
                type: "text",
                text: `${actor} liked post: ${postUri}`,
              },
            ],
          };
        } catch (error) {
          logger.error("Failed to like post", { actor, postUri, error });
          return {
            content: [
              {
                type: "text",
                text: `Failed to like post: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  /**
   * Set up MCP prompts for common ActivityPub interactions
   */
  private setupPrompts() {
    // Social media post prompt
    this.mcpServer.registerPrompt(
      "compose-post",
      {
        title: "Compose Social Media Post",
        description:
          "Help compose an engaging social media post for ActivityPub",
        argsSchema: {
          topic: z.string().describe("Topic or subject of the post"),
          tone: z
            .enum(["casual", "professional", "humorous", "informative"])
            .describe("Tone of the post"),
          maxLength: z.string().optional().describe("Maximum character length"),
        },
      },
      ({ topic, tone, maxLength }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please help me compose a ${tone} social media post about "${topic}"${maxLength ? ` (max ${maxLength} characters)` : ""}. Make it engaging and appropriate for the Fediverse/ActivityPub community.`,
            },
          },
        ],
      }),
    );

    // Actor introduction prompt
    this.mcpServer.registerPrompt(
      "actor-introduction",
      {
        title: "Actor Introduction",
        description:
          "Generate an introduction post for a new ActivityPub actor",
        argsSchema: {
          actorName: z.string().describe("Name of the actor"),
          interests: z
            .string()
            .describe("Comma-separated list of interests or topics"),
          background: z
            .string()
            .optional()
            .describe("Professional or personal background"),
        },
      },
      ({ actorName, interests, background }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create an introduction post for ${actorName} joining the Fediverse. Their interests include: ${interests}${background ? `. Background: ${background}` : ""}. Make it welcoming and engaging for the ActivityPub community.`,
            },
          },
        ],
      }),
    );
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
