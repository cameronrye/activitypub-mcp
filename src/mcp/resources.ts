/**
 * MCP Resource handlers for ActivityPub data access.
 *
 * This module defines all MCP resources that provide read access to
 * ActivityPub/Fediverse data including actors, timelines, and instances.
 */

import { getLogger } from "@logtape/logtape";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { remoteClient } from "../remote-client.js";
import { extractSingleValue, validateActorIdentifier } from "../server/index.js";
import type { RateLimiter } from "../server/rate-limiter.js";
import { getErrorMessage } from "../utils.js";
import { DomainSchema } from "../validation/schemas.js";

const logger = getLogger("activitypub-mcp:resources");

/**
 * Configuration for MCP resources.
 */
export interface ResourceConfig {
  serverName: string;
  serverVersion: string;
  logLevel: string;
  rateLimitEnabled: boolean;
  rateLimitMax: number;
  rateLimitWindow: number;
}

/**
 * Registers all MCP resources on the server.
 *
 * @param mcpServer - The MCP server instance
 * @param rateLimiter - The rate limiter instance
 * @param config - Resource configuration
 */
export function registerResources(
  mcpServer: McpServer,
  rateLimiter: RateLimiter,
  config: ResourceConfig,
): void {
  // Server resources
  registerServerInfoResource(mcpServer, config);

  // Actor resources
  registerRemoteActorResource(mcpServer, rateLimiter);
  registerRemoteTimelineResource(mcpServer, rateLimiter);
  registerRemoteFollowersResource(mcpServer, rateLimiter);
  registerRemoteFollowingResource(mcpServer, rateLimiter);

  // Instance resources
  registerInstanceInfoResource(mcpServer, rateLimiter);
  registerTrendingResource(mcpServer, rateLimiter);
  registerLocalTimelineResource(mcpServer, rateLimiter);
  registerFederatedTimelineResource(mcpServer, rateLimiter);

  // Content resources
  registerPostThreadResource(mcpServer, rateLimiter);
}

/**
 * Helper to check rate limit and throw if exceeded.
 */
function checkRateLimit(rateLimiter: RateLimiter, identifier: string): void {
  if (!rateLimiter.checkLimit(identifier)) {
    throw new McpError(ErrorCode.InternalError, "Rate limit exceeded. Please try again later.");
  }
}

/**
 * Server info resource - get information about this MCP server.
 */
function registerServerInfoResource(mcpServer: McpServer, config: ResourceConfig): void {
  mcpServer.registerResource(
    "server-info",
    new ResourceTemplate("activitypub://server-info", {
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
    }),
    {
      title: "ActivityPub MCP Server Information",
      description: "Get information about this ActivityPub MCP server",
      mimeType: "application/json",
    },
    async (uri) => {
      const serverInfo = {
        name: config.serverName,
        version: config.serverVersion,
        description:
          "A Model Context Protocol server for exploring and interacting with the existing Fediverse",
        capabilities: {
          resources: [
            "server-info",
            "remote-actor",
            "remote-timeline",
            "remote-followers",
            "remote-following",
            "instance-info",
            "trending",
            "local-timeline",
            "federated-timeline",
            "post-thread",
          ],
          tools: {
            discovery: [
              "discover-actor",
              "discover-instances",
              "discover-instances-live",
              "recommend-instances",
            ],
            content: [
              "fetch-timeline",
              "get-post-thread",
              "search-instance",
              "search-accounts",
              "search-hashtags",
              "search-posts",
            ],
            timelines: [
              "get-trending-hashtags",
              "get-trending-posts",
              "get-local-timeline",
              "get-federated-timeline",
            ],
            instance: ["get-instance-info"],
            utility: ["convert-url", "batch-fetch-actors", "batch-fetch-posts"],
            system: ["health-check", "performance-metrics"],
          },
          prompts: [
            "explore-fediverse",
            "discover-content",
            "compare-instances",
            "compare-accounts",
            "analyze-user-activity",
            "find-experts",
            "summarize-trending",
          ],
        },
        features: {
          auditLogging: true,
          instanceBlocklist: true,
          contentWarnings: true,
          batchOperations: true,
          trendingContent: true,
          threadSupport: true,
          urlConversion: true,
        },
        configuration: {
          rateLimitEnabled: config.rateLimitEnabled,
          rateLimitMax: config.rateLimitMax,
          rateLimitWindow: config.rateLimitWindow,
          logLevel: config.logLevel,
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
    },
  );
}

/**
 * Remote actor resource - get actor information from any fediverse server.
 */
function registerRemoteActorResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "remote-actor",
    new ResourceTemplate("activitypub://remote-actor/{identifier}", {
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
    }),
    {
      title: "Remote ActivityPub Actor",
      description:
        "Retrieve actor information from any fediverse server (e.g., user@example.social)",
      mimeType: "application/json",
    },
    async (uri, { identifier }) => {
      try {
        const identifierStr = extractSingleValue(identifier);
        const validIdentifier = validateActorIdentifier(identifierStr);

        checkRateLimit(rateLimiter, validIdentifier);

        logger.info("Fetching remote actor", { identifier: validIdentifier });

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
      } catch (error) {
        logger.error("Failed to fetch remote actor", {
          identifier,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch remote actor: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}

/**
 * Remote timeline resource - get actor's timeline/outbox from any fediverse server.
 */
function registerRemoteTimelineResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "remote-timeline",
    new ResourceTemplate("activitypub://remote-timeline/{identifier}", {
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
    }),
    {
      title: "Remote ActivityPub Timeline",
      description:
        "Retrieve actor's timeline/outbox from any fediverse server (e.g., user@example.social)",
      mimeType: "application/json",
    },
    async (uri, { identifier }) => {
      try {
        const identifierStr = extractSingleValue(identifier);
        const validIdentifier = validateActorIdentifier(identifierStr);

        checkRateLimit(rateLimiter, validIdentifier);

        logger.info("Fetching remote timeline", { identifier: validIdentifier });

        const timelineData = await remoteClient.fetchActorOutbox(validIdentifier, 20);

        if (!timelineData) {
          throw new McpError(ErrorCode.InternalError, "Failed to fetch timeline data");
        }

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
      } catch (error) {
        logger.error("Failed to fetch remote timeline", {
          identifier,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch remote timeline: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}

/**
 * Instance info resource - get information about any fediverse instance.
 */
function registerInstanceInfoResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "instance-info",
    new ResourceTemplate("activitypub://instance-info/{domain}", {
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
    }),
    {
      title: "Fediverse Instance Information",
      description: "Get information about any fediverse instance (e.g., example.social)",
      mimeType: "application/json",
    },
    async (uri, { domain }) => {
      try {
        const domainStr = extractSingleValue(domain);
        const validDomain = DomainSchema.parse(domainStr);

        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching instance info", { domain: validDomain });

        const instanceInfo = await remoteClient.getInstanceInfo(validDomain);

        const normalizedInstanceInfo = {
          ...instanceInfo,
          title: instanceInfo.description || `${instanceInfo.software || "Unknown"} instance`,
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
      } catch (error) {
        logger.error("Failed to fetch instance info", {
          domain,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch instance info: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}

/**
 * Remote followers resource - get followers of an actor.
 */
function registerRemoteFollowersResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "remote-followers",
    new ResourceTemplate("activitypub://remote-followers/{identifier}", {
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
    }),
    {
      title: "Remote Actor Followers",
      description: "Retrieve followers of an actor from any fediverse server",
      mimeType: "application/json",
    },
    async (uri, { identifier }) => {
      try {
        const identifierStr = extractSingleValue(identifier);
        const validIdentifier = validateActorIdentifier(identifierStr);

        checkRateLimit(rateLimiter, validIdentifier);

        logger.info("Fetching remote followers", { identifier: validIdentifier });

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
      } catch (error) {
        logger.error("Failed to fetch remote followers", {
          identifier,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch remote followers: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}

/**
 * Remote following resource - get who an actor is following.
 */
function registerRemoteFollowingResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "remote-following",
    new ResourceTemplate("activitypub://remote-following/{identifier}", {
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
    }),
    {
      title: "Remote Actor Following",
      description: "Retrieve who an actor is following from any fediverse server",
      mimeType: "application/json",
    },
    async (uri, { identifier }) => {
      try {
        const identifierStr = extractSingleValue(identifier);
        const validIdentifier = validateActorIdentifier(identifierStr);

        checkRateLimit(rateLimiter, validIdentifier);

        logger.info("Fetching remote following", { identifier: validIdentifier });

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
      } catch (error) {
        logger.error("Failed to fetch remote following", {
          identifier,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch remote following: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}

/**
 * Trending resource - get trending hashtags and posts from an instance.
 */
function registerTrendingResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "trending",
    new ResourceTemplate("activitypub://trending/{domain}", {
      list: async () => ({
        resources: [
          {
            uri: "activitypub://trending/{domain}",
            name: "trending",
            description: "Get trending hashtags and posts from a fediverse instance",
            mimeType: "application/json",
          },
        ],
      }),
    }),
    {
      title: "Instance Trending Content",
      description:
        "Get trending hashtags and posts from a fediverse instance (e.g., mastodon.social)",
      mimeType: "application/json",
    },
    async (uri, { domain }) => {
      try {
        const domainStr = extractSingleValue(domain);
        const validDomain = DomainSchema.parse(domainStr);

        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching trending content", { domain: validDomain });

        // Fetch both trending hashtags and posts in parallel
        const [hashtagsResult, postsResult] = await Promise.allSettled([
          remoteClient.fetchTrendingHashtags(validDomain, { limit: 10 }),
          remoteClient.fetchTrendingPosts(validDomain, { limit: 10 }),
        ]);

        const trendingData = {
          domain: validDomain,
          timestamp: new Date().toISOString(),
          hashtags: hashtagsResult.status === "fulfilled" ? hashtagsResult.value.hashtags : [],
          posts: postsResult.status === "fulfilled" ? postsResult.value.posts : [],
          errors: {
            hashtags:
              hashtagsResult.status === "rejected" ? getErrorMessage(hashtagsResult.reason) : null,
            posts: postsResult.status === "rejected" ? getErrorMessage(postsResult.reason) : null,
          },
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(trendingData, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Failed to fetch trending content", {
          domain,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch trending content: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}

/**
 * Local timeline resource - get the local public timeline from an instance.
 */
function registerLocalTimelineResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "local-timeline",
    new ResourceTemplate("activitypub://local-timeline/{domain}", {
      list: async () => ({
        resources: [
          {
            uri: "activitypub://local-timeline/{domain}",
            name: "local-timeline",
            description: "Get the local public timeline from a fediverse instance",
            mimeType: "application/json",
          },
        ],
      }),
    }),
    {
      title: "Instance Local Timeline",
      description:
        "Get the local public timeline from a fediverse instance (posts from local users only)",
      mimeType: "application/json",
    },
    async (uri, { domain }) => {
      try {
        const domainStr = extractSingleValue(domain);
        const validDomain = DomainSchema.parse(domainStr);

        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching local timeline", { domain: validDomain });

        const timelineData = await remoteClient.fetchLocalTimeline(validDomain, { limit: 20 });

        const resourceData = {
          domain: validDomain,
          type: "local",
          timestamp: new Date().toISOString(),
          posts: timelineData.posts,
          hasMore: timelineData.hasMore,
          nextMaxId: timelineData.nextMaxId,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(resourceData, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Failed to fetch local timeline", {
          domain,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch local timeline: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}

/**
 * Federated timeline resource - get the federated public timeline from an instance.
 */
function registerFederatedTimelineResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "federated-timeline",
    new ResourceTemplate("activitypub://federated-timeline/{domain}", {
      list: async () => ({
        resources: [
          {
            uri: "activitypub://federated-timeline/{domain}",
            name: "federated-timeline",
            description: "Get the federated public timeline from a fediverse instance",
            mimeType: "application/json",
          },
        ],
      }),
    }),
    {
      title: "Instance Federated Timeline",
      description:
        "Get the federated public timeline from a fediverse instance (posts from all connected instances)",
      mimeType: "application/json",
    },
    async (uri, { domain }) => {
      try {
        const domainStr = extractSingleValue(domain);
        const validDomain = DomainSchema.parse(domainStr);

        checkRateLimit(rateLimiter, validDomain);

        logger.info("Fetching federated timeline", { domain: validDomain });

        const timelineData = await remoteClient.fetchFederatedTimeline(validDomain, { limit: 20 });

        const resourceData = {
          domain: validDomain,
          type: "federated",
          timestamp: new Date().toISOString(),
          posts: timelineData.posts,
          hasMore: timelineData.hasMore,
          nextMaxId: timelineData.nextMaxId,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(resourceData, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Failed to fetch federated timeline", {
          domain,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch federated timeline: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}

/**
 * Post thread resource - get a post and its full conversation thread.
 */
function registerPostThreadResource(mcpServer: McpServer, rateLimiter: RateLimiter): void {
  mcpServer.registerResource(
    "post-thread",
    new ResourceTemplate("activitypub://post-thread/{postUrl}", {
      list: async () => ({
        resources: [
          {
            uri: "activitypub://post-thread/{postUrl}",
            name: "post-thread",
            description: "Get a post and its full conversation thread (replies and ancestors)",
            mimeType: "application/json",
          },
        ],
      }),
    }),
    {
      title: "Post Thread",
      description: "Get a post and its full conversation thread including replies and parent posts",
      mimeType: "application/json",
    },
    async (uri, { postUrl }) => {
      try {
        const postUrlStr = extractSingleValue(postUrl);

        // Validate URL format
        let parsedUrl: URL;
        try {
          // Handle URL-encoded post URLs
          const decodedUrl = decodeURIComponent(postUrlStr);
          parsedUrl = new URL(decodedUrl);
        } catch {
          throw new McpError(ErrorCode.InvalidParams, `Invalid post URL: ${postUrlStr}`);
        }

        checkRateLimit(rateLimiter, parsedUrl.hostname);

        logger.info("Fetching post thread", { postUrl: postUrlStr });

        const threadData = await remoteClient.fetchPostThread(parsedUrl.href, {
          depth: 2,
          maxReplies: 50,
        });

        const resourceData = {
          postUrl: parsedUrl.href,
          timestamp: new Date().toISOString(),
          post: threadData.post,
          ancestors: threadData.ancestors,
          replies: threadData.replies,
          totalReplies: threadData.totalReplies,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(resourceData, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Failed to fetch post thread", {
          postUrl,
          error: getErrorMessage(error),
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch post thread: ${getErrorMessage(error)}`,
        );
      }
    },
  );
}
