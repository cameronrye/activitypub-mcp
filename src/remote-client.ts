import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import {
  CACHE_MAX_SIZE,
  CACHE_TTL,
  INSTANCE_BLOCKING_ENABLED,
  MAX_RESPONSE_SIZE,
  MAX_RETRIES,
  REQUEST_TIMEOUT,
  RETRY_BASE_DELAY,
  RETRY_MAX_DELAY,
  USER_AGENT,
} from "./config.js";
import { instanceBlocklist } from "./instance-blocklist.js";
import { LRUCache } from "./utils/lru-cache.js";
import { getErrorMessage, validateExternalUrl } from "./utils.js";
import { DomainSchema } from "./validation/schemas.js";
import { type ActivityPubActor, webfingerClient } from "./webfinger.js";

const logger = getLogger("activitypub-mcp");

// ActivityPub Collection schema
const ActivityPubCollectionSchema = z.object({
  "@context": z.union([z.string(), z.array(z.union([z.string(), z.object({})]))]).optional(),
  id: z.string(),
  type: z.enum(["Collection", "OrderedCollection", "CollectionPage", "OrderedCollectionPage"]),
  totalItems: z.number().optional(),
  first: z.union([z.string(), z.object({})]).optional(),
  last: z.union([z.string(), z.object({})]).optional(),
  next: z.string().optional(),
  prev: z.string().optional(),
  items: z.array(z.any()).optional(),
  orderedItems: z.array(z.any()).optional(),
  partOf: z.string().optional(),
});

export type ActivityPubCollection = z.infer<typeof ActivityPubCollectionSchema>;

/**
 * Pagination options for fetching collections
 */
export interface PaginationOptions {
  /** Maximum number of items to fetch */
  limit?: number;
  /** Cursor for the next page (URL or ID) */
  cursor?: string;
  /** Fetch items newer than this ID */
  minId?: string;
  /** Fetch items older than this ID */
  maxId?: string;
  /** Fetch items since this ID */
  sinceId?: string;
}

/**
 * Paginated response with navigation info
 */
export interface PaginatedCollection<T = unknown> {
  items: T[];
  totalItems?: number;
  hasMore: boolean;
  nextCursor?: string;
  prevCursor?: string;
  collectionId: string;
}

// ActivityPub Object schema (for posts/notes)
const ActivityPubObjectSchema = z.object({
  "@context": z.union([z.string(), z.array(z.string())]).optional(),
  id: z.string(),
  type: z.string(),
  attributedTo: z.string().optional(),
  content: z.string().optional(),
  summary: z.string().optional(),
  published: z.string().optional(),
  updated: z.string().optional(),
  url: z.string().optional(),
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  inReplyTo: z.string().optional(),
  replies: z.union([z.string(), z.object({})]).optional(),
  likes: z.union([z.string(), z.object({})]).optional(),
  shares: z.union([z.string(), z.object({})]).optional(),
  tag: z
    .array(
      z.object({
        type: z.string(),
        name: z.string().optional(),
        href: z.string().optional(),
      }),
    )
    .optional(),
  attachment: z
    .array(
      z.object({
        type: z.string(),
        mediaType: z.string().optional(),
        url: z.string(),
        name: z.string().optional(),
      }),
    )
    .optional(),
});

export type ActivityPubObject = z.infer<typeof ActivityPubObjectSchema>;

// Instance information schema
const InstanceInfoSchema = z.object({
  domain: z.string(),
  software: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  languages: z.array(z.string()).optional(),
  registrations: z.boolean().optional(),
  approval_required: z.boolean().optional(),
  invites_enabled: z.boolean().optional(),
  contact_account: z
    .object({
      id: z.string(),
      username: z.string(),
      display_name: z.string().optional(),
    })
    .optional(),
  stats: z
    .object({
      user_count: z.number().optional(),
      status_count: z.number().optional(),
      domain_count: z.number().optional(),
    })
    .optional(),
});

export type InstanceInfo = z.infer<typeof InstanceInfoSchema>;

/**
 * Client for interacting with remote ActivityPub servers.
 *
 * This client provides methods for fetching ActivityPub data from remote
 * servers, including actors, timelines, followers, and instance information.
 * It includes caching, retry logic with exponential backoff, SSRF protection,
 * and request deduplication to prevent redundant in-flight requests.
 */
/**
 * Cached response with ETag for conditional requests
 */
interface CachedResponse<T> {
  data: T;
  etag: string;
  cachedAt: number;
}

export class RemoteActivityPubClient {
  private readonly requestTimeout = REQUEST_TIMEOUT;
  private readonly maxRetries = MAX_RETRIES;
  private readonly baseRetryDelay = RETRY_BASE_DELAY;
  private readonly maxRetryDelay = RETRY_MAX_DELAY;
  private readonly instanceCache: LRUCache<string, InstanceInfo>;
  /** In-flight requests map for deduplication */
  private readonly inFlightRequests: Map<string, Promise<unknown>> = new Map();
  /** ETag cache for conditional requests */
  private readonly etagCache: LRUCache<string, CachedResponse<unknown>>;

  /**
   * Creates a new RemoteActivityPubClient instance.
   */
  constructor() {
    this.instanceCache = new LRUCache<string, InstanceInfo>({
      maxSize: CACHE_MAX_SIZE,
      ttl: CACHE_TTL,
    });
    this.etagCache = new LRUCache<string, CachedResponse<unknown>>({
      maxSize: CACHE_MAX_SIZE,
      ttl: CACHE_TTL,
    });
  }

  /**
   * Calculates the delay for exponential backoff.
   *
   * @param attempt - The current attempt number (1-based)
   * @returns The delay in milliseconds
   */
  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    const delay = this.baseRetryDelay * 2 ** (attempt - 1);
    // Cap at maxRetryDelay and add some jitter (0-10%)
    const jitter = Math.random() * 0.1 * delay;
    return Math.min(delay + jitter, this.maxRetryDelay);
  }

  /**
   * Fetch actor information from remote server.
   *
   * @param identifier - The actor identifier (e.g., user@domain.social)
   * @returns The ActivityPub actor data
   */
  async fetchRemoteActor(identifier: string): Promise<ActivityPubActor> {
    logger.info("Fetching remote actor", { identifier });

    try {
      return await webfingerClient.discoverActor(identifier);
    } catch (error) {
      logger.error("Failed to fetch remote actor", { identifier, error: getErrorMessage(error) });
      throw new Error(`Failed to fetch actor ${identifier}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Fetch actor's outbox (timeline/posts)
   */
  async fetchActorOutbox(identifier: string, limit = 20): Promise<ActivityPubCollection> {
    // Validate limit parameter
    if (limit < 1 || limit > 100) {
      throw new Error("Limit must be between 1 and 100");
    }

    const actor = await this.fetchRemoteActor(identifier);

    if (!actor.outbox) {
      throw new Error(`Actor ${identifier} has no outbox`);
    }

    logger.info("Fetching actor outbox", {
      identifier,
      outbox: actor.outbox,
      limit,
    });

    const outboxUrl = new URL(actor.outbox);
    if (limit > 0) {
      outboxUrl.searchParams.set("limit", limit.toString());
    }

    return await this.fetchWithRetry(
      outboxUrl.toString(),
      {
        headers: {
          Accept:
            'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          "User-Agent": USER_AGENT,
        },
      },
      ActivityPubCollectionSchema,
    );
  }

  /**
   * Fetch actor's outbox with pagination support
   */
  async fetchActorOutboxPaginated(
    identifier: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedCollection> {
    const { limit = 20, cursor, minId, maxId, sinceId } = options;

    // Validate limit parameter
    if (limit < 1 || limit > 100) {
      throw new Error("Limit must be between 1 and 100");
    }

    const actor = await this.fetchRemoteActor(identifier);

    if (!actor.outbox) {
      throw new Error(`Actor ${identifier} has no outbox`);
    }

    // Parse the actor's outbox URL to get the trusted origin
    const outboxUrl = new URL(actor.outbox);
    const trustedOrigin = outboxUrl.origin;

    // If cursor is provided, validate it belongs to the same origin as the outbox
    let fetchUrl: URL;
    if (cursor) {
      fetchUrl = new URL(cursor);
      // Security: Ensure cursor URL matches the actor's outbox origin to prevent SSRF
      if (fetchUrl.origin !== trustedOrigin) {
        throw new Error(
          `Invalid cursor URL: origin "${fetchUrl.origin}" does not match actor's outbox origin "${trustedOrigin}"`,
        );
      }
    } else {
      fetchUrl = outboxUrl;
    }

    // Set pagination parameters
    fetchUrl.searchParams.set("limit", limit.toString());
    if (minId) fetchUrl.searchParams.set("min_id", minId);
    if (maxId) fetchUrl.searchParams.set("max_id", maxId);
    if (sinceId) fetchUrl.searchParams.set("since_id", sinceId);

    logger.info("Fetching actor outbox with pagination", {
      identifier,
      url: fetchUrl.toString(),
      options,
    });

    const collection = await this.fetchWithRetry(
      fetchUrl.toString(),
      {
        headers: {
          Accept:
            'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          "User-Agent": USER_AGENT,
        },
      },
      ActivityPubCollectionSchema,
    );

    // Extract items from the collection
    const items = collection.orderedItems || collection.items || [];

    // Determine pagination cursors
    const nextCursor = this.extractNextCursor(collection);
    const prevCursor = this.extractPrevCursor(collection);

    return {
      items,
      totalItems: collection.totalItems,
      hasMore: !!nextCursor || items.length === limit,
      nextCursor,
      prevCursor,
      collectionId: collection.id,
    };
  }

  /**
   * Extract next page cursor from collection
   */
  private extractNextCursor(collection: ActivityPubCollection): string | undefined {
    // Check for explicit next link
    if (collection.next) {
      return collection.next;
    }

    // Check for first page link (when at root collection)
    if (collection.first) {
      if (typeof collection.first === "string") {
        return collection.first;
      }
      if (typeof collection.first === "object" && collection.first !== null) {
        const firstObj = collection.first as unknown as Record<string, unknown>;
        if ("id" in firstObj && typeof firstObj.id === "string") {
          return firstObj.id;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract previous page cursor from collection
   */
  private extractPrevCursor(collection: ActivityPubCollection): string | undefined {
    if (collection.prev) {
      return collection.prev;
    }

    if (collection.last) {
      if (typeof collection.last === "string") {
        return collection.last;
      }
      if (typeof collection.last === "object" && collection.last !== null) {
        const lastObj = collection.last as unknown as Record<string, unknown>;
        if ("id" in lastObj && typeof lastObj.id === "string") {
          return lastObj.id;
        }
      }
    }

    return undefined;
  }

  /**
   * Fetch actor's followers
   */
  async fetchActorFollowers(identifier: string, limit = 20): Promise<ActivityPubCollection> {
    const actor = await this.fetchRemoteActor(identifier);

    if (!actor.followers) {
      throw new Error(`Actor ${identifier} has no followers collection`);
    }

    logger.info("Fetching actor followers", {
      identifier,
      followers: actor.followers,
      limit,
    });

    const followersUrl = new URL(actor.followers);
    if (limit > 0) {
      followersUrl.searchParams.set("limit", limit.toString());
    }

    return await this.fetchWithRetry(
      followersUrl.toString(),
      {
        headers: {
          Accept:
            'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          "User-Agent": USER_AGENT,
        },
      },
      ActivityPubCollectionSchema,
    );
  }

  /**
   * Fetch actor's following
   */
  async fetchActorFollowing(identifier: string, limit = 20): Promise<ActivityPubCollection> {
    const actor = await this.fetchRemoteActor(identifier);

    if (!actor.following) {
      throw new Error(`Actor ${identifier} has no following collection`);
    }

    logger.info("Fetching actor following", {
      identifier,
      following: actor.following,
      limit,
    });

    const followingUrl = new URL(actor.following);
    if (limit > 0) {
      followingUrl.searchParams.set("limit", limit.toString());
    }

    return await this.fetchWithRetry(
      followingUrl.toString(),
      {
        headers: {
          Accept:
            'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          "User-Agent": USER_AGENT,
        },
      },
      ActivityPubCollectionSchema,
    );
  }

  /**
   * Fetch a specific ActivityPub object (post, note, etc.)
   */
  async fetchObject(objectUrl: string): Promise<ActivityPubObject> {
    logger.info("Fetching ActivityPub object", { url: objectUrl });

    return await this.fetchWithRetry(
      objectUrl,
      {
        headers: {
          Accept:
            'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          "User-Agent": USER_AGENT,
        },
      },
      ActivityPubObjectSchema,
    );
  }

  /**
   * Get instance information (with LRU caching).
   *
   * @param domain - The instance domain to get information for
   * @returns The instance information
   */
  async getInstanceInfo(domain: string): Promise<InstanceInfo> {
    // Validate domain input
    const validDomain = DomainSchema.parse(domain);

    // Check cache first (LRU cache handles TTL internally)
    const cached = this.instanceCache.get(validDomain);
    if (cached) {
      logger.debug("Returning cached instance info", { domain: validDomain });
      return cached;
    }

    logger.info("Fetching instance info", { domain: validDomain });

    // Try multiple endpoints for instance information in parallel
    const endpoints = [
      `https://${validDomain}/api/v1/instance`, // Mastodon/Pleroma
      `https://${validDomain}/api/meta`, // Misskey
      `https://${validDomain}/nodeinfo/2.0`, // NodeInfo
    ];

    // Fetch from all endpoints in parallel
    const results = await Promise.allSettled(
      endpoints.map(async (endpoint) => {
        const response = await this.fetchWithTimeout(endpoint, {
          headers: {
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return { endpoint, data };
      }),
    );

    // Find the first successful result
    for (const result of results) {
      if (result.status === "fulfilled") {
        const { endpoint, data } = result.value;

        // Transform different API responses to our schema
        const instanceInfo = this.transformInstanceInfo(domain, data, endpoint);
        const validatedInfo = InstanceInfoSchema.parse(instanceInfo);

        // Cache the result (LRU cache handles eviction and TTL)
        this.instanceCache.set(validDomain, validatedInfo);

        return validatedInfo;
      }
    }

    throw new Error(`Failed to fetch instance information for ${domain}`);
  }

  /**
   * Search for content on a specific instance
   */
  async searchInstance(
    domain: string,
    query: string,
    type: "accounts" | "statuses" | "hashtags" = "accounts",
  ): Promise<unknown> {
    // Validate domain input
    const validDomain = DomainSchema.parse(domain);
    logger.info("Searching instance", { domain: validDomain, query, type });

    const searchUrl = `https://${validDomain}/api/v2/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`;

    return await this.fetchWithRetry(
      searchUrl,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      },
      z.any(),
    );
  }

  /**
   * Fetch with retry logic, exponential backoff, and request deduplication.
   * Concurrent requests to the same URL will share a single in-flight request.
   *
   * @param url - The URL to fetch
   * @param options - Fetch options
   * @param schema - Zod schema to validate the response
   * @returns The validated response data
   */
  private async fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    // Create a cache key from URL and relevant headers
    const cacheKey = this.buildRequestKey(url, options);

    // Check for in-flight request to the same URL
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      logger.debug("Deduplicating request, reusing in-flight request", { url });
      return inFlight as Promise<T>;
    }

    // Create the actual request promise
    const requestPromise = this.executeWithRetry(url, options, schema);

    // Store in-flight request
    this.inFlightRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up in-flight request
      this.inFlightRequests.delete(cacheKey);
    }
  }

  /**
   * Build a cache key for request deduplication.
   */
  private buildRequestKey(url: string, options: RequestInit): string {
    const method = options.method || "GET";
    return `${method}:${url}`;
  }

  /**
   * Process a successful response: validate and cache with ETag.
   */
  private async processResponse<T>(
    response: Response,
    url: string,
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    const data = await response.json();
    const validated = schema.parse(data);

    // Cache response with ETag if present
    const etag = response.headers.get("ETag");
    if (etag) {
      this.etagCache.set(url, {
        data: validated,
        etag,
        cachedAt: Date.now(),
      });
    }

    return validated;
  }

  /**
   * Handle retry delay with logging.
   */
  private async handleRetryDelay(attempt: number, url: string, error: Error): Promise<void> {
    const delay = this.calculateBackoffDelay(attempt);
    logger.warn(`Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`, {
      url,
      error: error.message,
      nextAttempt: attempt + 1,
      delay: Math.round(delay),
    });
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Execute fetch with retry logic, exponential backoff, and ETag support.
   */
  private async executeWithRetry<T>(
    url: string,
    options: RequestInit,
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    let lastError: Error | null = null;

    // Check for cached response with ETag
    const cached = this.etagCache.get(url) as CachedResponse<T> | undefined;

    // Prepare headers with ETag if available
    const headers = new Headers(options.headers);
    if (cached?.etag) {
      headers.set("If-None-Match", cached.etag);
    }
    const fetchOptions = { ...options, headers };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, fetchOptions);

        // Handle 304 Not Modified - return cached data
        if (response.status === 304 && cached) {
          logger.debug("Using cached response (304 Not Modified)", { url });
          return cached.data;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await this.processResponse(response, url, schema);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          await this.handleRetryDelay(attempt, url, lastError);
        }
      }
    }

    throw lastError ?? new Error("All retry attempts failed");
  }

  /**
   * Fetch with timeout and response size limit.
   * Includes SSRF protection to block requests to private/internal addresses.
   * Uses async DNS resolution to detect DNS rebinding attacks.
   * Validates against instance blocklist.
   *
   * @param url - The URL to fetch
   * @param options - Fetch options
   * @returns The fetch Response
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    // SSRF protection: validate URL before making request (async for DNS rebinding detection)
    await validateExternalUrl(url);

    // Instance blocklist check
    if (INSTANCE_BLOCKING_ENABLED) {
      const hostname = new URL(url).hostname;
      instanceBlocklist.validateNotBlocked(hostname);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Check response size to prevent DoS attacks
      const contentLength = response.headers.get("content-length");
      if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        throw new Error(
          `Response too large: ${contentLength} bytes (max: ${MAX_RESPONSE_SIZE} bytes)`,
        );
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out: ${url}`);
      }
      throw error;
    }
  }

  /**
   * Transforms Mastodon/Pleroma API response to our schema.
   */
  private transformMastodonInfo(
    base: Partial<InstanceInfo>,
    dataObj: Record<string, unknown>,
  ): Partial<InstanceInfo> {
    const version = typeof dataObj.version === "string" ? dataObj.version : undefined;
    return {
      ...base,
      software: version?.includes("Pleroma") ? "pleroma" : "mastodon",
      version,
      description: typeof dataObj.description === "string" ? dataObj.description : undefined,
      languages: Array.isArray(dataObj.languages) ? (dataObj.languages as string[]) : undefined,
      registrations: typeof dataObj.registrations === "boolean" ? dataObj.registrations : undefined,
      approval_required:
        typeof dataObj.approval_required === "boolean" ? dataObj.approval_required : undefined,
      contact_account:
        typeof dataObj.contact_account === "object"
          ? (dataObj.contact_account as {
              id: string;
              username: string;
              display_name?: string;
            })
          : undefined,
      stats:
        typeof dataObj.stats === "object"
          ? (dataObj.stats as {
              user_count?: number;
              status_count?: number;
              domain_count?: number;
            })
          : undefined,
    };
  }

  /**
   * Transforms Misskey API response to our schema.
   */
  private transformMisskeyInfo(
    base: Partial<InstanceInfo>,
    dataObj: Record<string, unknown>,
  ): Partial<InstanceInfo> {
    return {
      ...base,
      software: "misskey",
      version: typeof dataObj.version === "string" ? dataObj.version : undefined,
      description: typeof dataObj.description === "string" ? dataObj.description : undefined,
    };
  }

  /**
   * Transforms NodeInfo response to our schema.
   */
  private transformNodeInfo(
    base: Partial<InstanceInfo>,
    dataObj: Record<string, unknown>,
  ): Partial<InstanceInfo> {
    const software =
      typeof dataObj.software === "object" && dataObj.software !== null
        ? (dataObj.software as Record<string, unknown>)
        : {};
    const metadata =
      typeof dataObj.metadata === "object" && dataObj.metadata !== null
        ? (dataObj.metadata as Record<string, unknown>)
        : {};

    return {
      ...base,
      software: typeof software.name === "string" ? software.name : undefined,
      version: typeof software.version === "string" ? software.version : undefined,
      description:
        typeof metadata.nodeDescription === "string" ? metadata.nodeDescription : undefined,
    };
  }

  /**
   * Transform different instance API responses to our schema.
   *
   * @param domain - The instance domain
   * @param data - The raw API response data
   * @param endpoint - The endpoint that was called
   * @returns Partial instance info
   */
  private transformInstanceInfo(
    domain: string,
    data: unknown,
    endpoint: string,
  ): Partial<InstanceInfo> {
    const base: Partial<InstanceInfo> = { domain };

    // Type guard to ensure data is an object
    if (typeof data !== "object" || data === null) {
      return base;
    }

    const dataObj = data as Record<string, unknown>;

    if (endpoint.includes("/api/v1/instance")) {
      return this.transformMastodonInfo(base, dataObj);
    }

    if (endpoint.includes("/api/meta")) {
      return this.transformMisskeyInfo(base, dataObj);
    }

    if (endpoint.includes("/nodeinfo")) {
      return this.transformNodeInfo(base, dataObj);
    }

    return base;
  }

  /**
   * Fetch a post thread (the post and its replies)
   */
  async fetchPostThread(
    postUrl: string,
    options: { depth?: number; maxReplies?: number } = {},
  ): Promise<{
    post: ActivityPubObject;
    replies: ActivityPubObject[];
    ancestors: ActivityPubObject[];
    totalReplies: number;
  }> {
    const { depth = 2, maxReplies = 50 } = options;

    logger.info("Fetching post thread", { url: postUrl, depth, maxReplies });

    // Fetch the main post
    const post = await this.fetchObject(postUrl);

    // Fetch ancestors (in-reply-to chain)
    const ancestors: ActivityPubObject[] = [];
    let currentInReplyTo = post.inReplyTo;
    let ancestorDepth = 0;
    const maxAncestors = 10;

    while (currentInReplyTo && ancestorDepth < maxAncestors) {
      try {
        const ancestor = await this.fetchObject(currentInReplyTo);
        ancestors.unshift(ancestor); // Add to beginning to maintain chronological order
        currentInReplyTo = ancestor.inReplyTo;
        ancestorDepth++;
      } catch {
        // Stop if we can't fetch an ancestor
        break;
      }
    }

    // Fetch replies if available
    const replies: ActivityPubObject[] = [];
    let totalReplies = 0;

    if (post.replies) {
      try {
        const repliesUrl =
          typeof post.replies === "string" ? post.replies : (post.replies as { id?: string }).id;
        if (repliesUrl) {
          const repliesCollection = await this.fetchWithRetry(
            repliesUrl,
            {
              headers: {
                Accept:
                  'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
                "User-Agent": USER_AGENT,
              },
            },
            ActivityPubCollectionSchema,
          );

          totalReplies = repliesCollection.totalItems || 0;
          const items = repliesCollection.orderedItems || repliesCollection.items || [];

          // Fetch reply objects (they might be URLs)
          for (const item of items.slice(0, maxReplies)) {
            try {
              if (typeof item === "string") {
                const reply = await this.fetchObject(item);
                replies.push(reply);
              } else if (item && typeof item === "object") {
                replies.push(item as ActivityPubObject);
              }
            } catch {
              // Skip replies we can't fetch
            }
          }

          // Recursively fetch nested replies if depth > 1
          if (depth > 1) {
            for (const reply of replies.slice()) {
              if (reply.replies && replies.length < maxReplies) {
                try {
                  const nestedThread = await this.fetchPostThread(reply.id, {
                    depth: depth - 1,
                    maxReplies: Math.min(10, maxReplies - replies.length),
                  });
                  replies.push(...nestedThread.replies);
                } catch {
                  // Skip nested threads we can't fetch
                }
              }
            }
          }
        }
      } catch (error) {
        logger.warn("Failed to fetch replies", { url: postUrl, error: getErrorMessage(error) });
      }
    }

    return {
      post,
      replies: replies.slice(0, maxReplies),
      ancestors,
      totalReplies,
    };
  }

  /**
   * Fetch trending hashtags from an instance
   */
  async fetchTrendingHashtags(
    domain: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{
    hashtags: Array<{
      name: string;
      url: string;
      history?: Array<{ day: string; uses: string; accounts: string }>;
    }>;
  }> {
    const validDomain = DomainSchema.parse(domain);
    const { limit = 20, offset = 0 } = options;

    logger.info("Fetching trending hashtags", { domain: validDomain, limit, offset });

    const url = `https://${validDomain}/api/v1/trends/tags?limit=${limit}&offset=${offset}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { hashtags: Array.isArray(data) ? data : [] };
    } catch (error) {
      logger.error("Failed to fetch trending hashtags", {
        domain: validDomain,
        error: getErrorMessage(error),
      });
      throw new Error(`Failed to fetch trending hashtags: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Fetch trending posts/statuses from an instance
   */
  async fetchTrendingPosts(
    domain: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{
    posts: Array<{
      id: string;
      content: string;
      account: { username: string; display_name?: string; url: string };
      created_at: string;
      reblogs_count: number;
      favourites_count: number;
      replies_count: number;
      url: string;
      spoiler_text?: string;
    }>;
  }> {
    const validDomain = DomainSchema.parse(domain);
    const { limit = 20, offset = 0 } = options;

    logger.info("Fetching trending posts", { domain: validDomain, limit, offset });

    const url = `https://${validDomain}/api/v1/trends/statuses?limit=${limit}&offset=${offset}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { posts: Array.isArray(data) ? data : [] };
    } catch (error) {
      logger.error("Failed to fetch trending posts", {
        domain: validDomain,
        error: getErrorMessage(error),
      });
      throw new Error(`Failed to fetch trending posts: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Fetch local timeline from an instance
   */
  async fetchLocalTimeline(
    domain: string,
    options: { limit?: number; maxId?: string; sinceId?: string; minId?: string } = {},
  ): Promise<{
    posts: Array<{
      id: string;
      content: string;
      account: { username: string; display_name?: string; url: string };
      created_at: string;
      reblogs_count: number;
      favourites_count: number;
      replies_count: number;
      url: string;
      spoiler_text?: string;
    }>;
    hasMore: boolean;
    nextMaxId?: string;
  }> {
    const validDomain = DomainSchema.parse(domain);
    const { limit = 20, maxId, sinceId, minId } = options;

    logger.info("Fetching local timeline", { domain: validDomain, limit });

    const params = new URLSearchParams({ limit: String(limit), local: "true" });
    if (maxId) params.set("max_id", maxId);
    if (sinceId) params.set("since_id", sinceId);
    if (minId) params.set("min_id", minId);

    const url = `https://${validDomain}/api/v1/timelines/public?${params.toString()}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const posts = Array.isArray(data) ? data : [];

      return {
        posts,
        hasMore: posts.length === limit,
        nextMaxId: posts.length > 0 ? posts[posts.length - 1]?.id : undefined,
      };
    } catch (error) {
      logger.error("Failed to fetch local timeline", {
        domain: validDomain,
        error: getErrorMessage(error),
      });
      throw new Error(`Failed to fetch local timeline: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Fetch federated timeline from an instance
   */
  async fetchFederatedTimeline(
    domain: string,
    options: { limit?: number; maxId?: string; sinceId?: string; minId?: string } = {},
  ): Promise<{
    posts: Array<{
      id: string;
      content: string;
      account: { username: string; display_name?: string; url: string };
      created_at: string;
      reblogs_count: number;
      favourites_count: number;
      replies_count: number;
      url: string;
      spoiler_text?: string;
    }>;
    hasMore: boolean;
    nextMaxId?: string;
  }> {
    const validDomain = DomainSchema.parse(domain);
    const { limit = 20, maxId, sinceId, minId } = options;

    logger.info("Fetching federated timeline", { domain: validDomain, limit });

    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (sinceId) params.set("since_id", sinceId);
    if (minId) params.set("min_id", minId);

    const url = `https://${validDomain}/api/v1/timelines/public?${params.toString()}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const posts = Array.isArray(data) ? data : [];

      return {
        posts,
        hasMore: posts.length === limit,
        nextMaxId: posts.length > 0 ? posts[posts.length - 1]?.id : undefined,
      };
    } catch (error) {
      logger.error("Failed to fetch federated timeline", {
        domain: validDomain,
        error: getErrorMessage(error),
      });
      throw new Error(`Failed to fetch federated timeline: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Batch fetch multiple actors
   */
  async batchFetchActors(
    identifiers: string[],
    options: { concurrency?: number; continueOnError?: boolean } = {},
  ): Promise<{
    results: Array<{ identifier: string; actor?: ActivityPubActor; error?: string }>;
    successful: number;
    failed: number;
  }> {
    const { concurrency = 5, continueOnError = true } = options;

    logger.info("Batch fetching actors", { count: identifiers.length, concurrency });

    const results: Array<{ identifier: string; actor?: ActivityPubActor; error?: string }> = [];
    let successful = 0;
    let failed = 0;

    // Process in batches for controlled concurrency
    for (let i = 0; i < identifiers.length; i += concurrency) {
      const batch = identifiers.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(async (identifier) => {
          const actor = await this.fetchRemoteActor(identifier);
          return { identifier, actor };
        }),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
          successful++;
        } else {
          const identifier = batch[batchResults.indexOf(result)];
          results.push({
            identifier,
            error: getErrorMessage(result.reason),
          });
          failed++;

          if (!continueOnError) {
            throw new Error(
              `Failed to fetch actor ${identifier}: ${getErrorMessage(result.reason)}`,
            );
          }
        }
      }
    }

    return { results, successful, failed };
  }

  /**
   * Batch fetch multiple posts by URL
   */
  async batchFetchPosts(
    postUrls: string[],
    options: { concurrency?: number; continueOnError?: boolean } = {},
  ): Promise<{
    results: Array<{ url: string; post?: ActivityPubObject; error?: string }>;
    successful: number;
    failed: number;
  }> {
    const { concurrency = 5, continueOnError = true } = options;

    logger.info("Batch fetching posts", { count: postUrls.length, concurrency });

    const results: Array<{ url: string; post?: ActivityPubObject; error?: string }> = [];
    let successful = 0;
    let failed = 0;

    // Process in batches for controlled concurrency
    for (let i = 0; i < postUrls.length; i += concurrency) {
      const batch = postUrls.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(async (url) => {
          const post = await this.fetchObject(url);
          return { url, post };
        }),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
          successful++;
        } else {
          const url = batch[batchResults.indexOf(result)];
          results.push({
            url,
            error: getErrorMessage(result.reason),
          });
          failed++;

          if (!continueOnError) {
            throw new Error(`Failed to fetch post ${url}: ${getErrorMessage(result.reason)}`);
          }
        }
      }
    }

    return { results, successful, failed };
  }

  /**
   * Convert a web URL to an ActivityPub URI
   * Supports Mastodon, Pleroma, and other common formats
   */
  async convertWebUrlToActivityPub(webUrl: string): Promise<{
    activityPubUri: string;
    type: "post" | "actor" | "unknown";
    domain: string;
  }> {
    const parsedUrl = new URL(webUrl);
    const domain = parsedUrl.hostname;

    logger.info("Converting web URL to ActivityPub URI", { webUrl });

    // Try to detect URL patterns
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);

    // Mastodon post URL pattern: /@username/12345
    const mastodonPostMatch = parsedUrl.pathname.match(/^\/@([^/]+)\/(\d+)$/);
    if (mastodonPostMatch) {
      const [, , postId] = mastodonPostMatch;
      const activityPubUri = `https://${domain}/users/${mastodonPostMatch[1]}/statuses/${postId}`;

      // Verify the URI exists
      try {
        await this.fetchObject(activityPubUri);
        return { activityPubUri, type: "post", domain };
      } catch {
        // Try alternative format
        const altUri = `https://${domain}/statuses/${postId}`;
        try {
          await this.fetchObject(altUri);
          return { activityPubUri: altUri, type: "post", domain };
        } catch {
          // Return the original guess
          return { activityPubUri, type: "post", domain };
        }
      }
    }

    // Mastodon/Pleroma actor URL pattern: /@username
    const actorMatch = parsedUrl.pathname.match(/^\/@([^/]+)\/?$/);
    if (actorMatch) {
      const [, username] = actorMatch;
      const activityPubUri = `https://${domain}/users/${username}`;

      try {
        await this.fetchRemoteActor(`${username}@${domain}`);
        return { activityPubUri, type: "actor", domain };
      } catch {
        return { activityPubUri, type: "actor", domain };
      }
    }

    // Generic ActivityPub URL (already in ActivityPub format)
    if (
      parsedUrl.pathname.includes("/users/") ||
      parsedUrl.pathname.includes("/statuses/") ||
      parsedUrl.pathname.includes("/objects/")
    ) {
      const isPost =
        parsedUrl.pathname.includes("/statuses/") ||
        parsedUrl.pathname.includes("/objects/") ||
        (parsedUrl.pathname.includes("/posts/") && pathParts.length > 2);

      return {
        activityPubUri: webUrl,
        type: isPost ? "post" : "actor",
        domain,
      };
    }

    // Try fetching the URL directly with ActivityPub headers
    try {
      const response = await this.fetchWithTimeout(webUrl, {
        headers: {
          Accept:
            'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          "User-Agent": USER_AGENT,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.id) {
          const type = data.type?.toLowerCase().includes("person") ? "actor" : "post";
          return { activityPubUri: data.id, type, domain };
        }
      }
    } catch {
      // Fall through to unknown
    }

    return { activityPubUri: webUrl, type: "unknown", domain };
  }

  /**
   * Convert an ActivityPub URI to a web URL
   */
  convertActivityPubToWebUrl(activityPubUri: string): {
    webUrl: string;
    type: "post" | "actor" | "unknown";
    domain: string;
  } {
    const parsedUrl = new URL(activityPubUri);
    const domain = parsedUrl.hostname;

    // Mastodon/Pleroma user URL pattern: /users/username
    const userMatch = parsedUrl.pathname.match(/^\/users\/([^/]+)\/?$/);
    if (userMatch) {
      const [, username] = userMatch;
      return {
        webUrl: `https://${domain}/@${username}`,
        type: "actor",
        domain,
      };
    }

    // Mastodon status URL pattern: /users/username/statuses/12345
    const statusMatch = parsedUrl.pathname.match(/^\/users\/([^/]+)\/statuses\/(\d+)$/);
    if (statusMatch) {
      const [, username, statusId] = statusMatch;
      return {
        webUrl: `https://${domain}/@${username}/${statusId}`,
        type: "post",
        domain,
      };
    }

    // Pleroma/Akkoma object URL pattern: /objects/uuid
    const objectMatch = parsedUrl.pathname.match(/^\/objects\/([^/]+)$/);
    if (objectMatch) {
      return {
        webUrl: `https://${domain}/notice/${objectMatch[1]}`,
        type: "post",
        domain,
      };
    }

    // Return the original URL if no pattern matches
    return { webUrl: activityPubUri, type: "unknown", domain };
  }
}

// Export singleton instance
export const remoteClient = new RemoteActivityPubClient();
