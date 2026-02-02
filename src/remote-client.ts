import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import {
  CACHE_MAX_SIZE,
  CACHE_TTL,
  MAX_RESPONSE_SIZE,
  MAX_RETRIES,
  REQUEST_TIMEOUT,
  RETRY_BASE_DELAY,
  RETRY_MAX_DELAY,
  USER_AGENT,
} from "./config.js";
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
 * It includes caching, retry logic with exponential backoff, and SSRF protection.
 */
export class RemoteActivityPubClient {
  private readonly requestTimeout = REQUEST_TIMEOUT;
  private readonly maxRetries = MAX_RETRIES;
  private readonly baseRetryDelay = RETRY_BASE_DELAY;
  private readonly maxRetryDelay = RETRY_MAX_DELAY;
  private readonly instanceCache: LRUCache<string, InstanceInfo>;

  /**
   * Creates a new RemoteActivityPubClient instance.
   */
  constructor() {
    this.instanceCache = new LRUCache<string, InstanceInfo>({
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
   * Fetch with retry logic and exponential backoff.
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
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return schema.parse(data);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          logger.warn(`Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`, {
            url,
            error: lastError.message,
            nextAttempt: attempt + 1,
            delay: Math.round(delay),
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error("All retry attempts failed");
  }

  /**
   * Fetch with timeout and response size limit.
   * Includes SSRF protection to block requests to private/internal addresses.
   * Uses async DNS resolution to detect DNS rebinding attacks.
   *
   * @param url - The URL to fetch
   * @param options - Fetch options
   * @returns The fetch Response
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    // SSRF protection: validate URL before making request (async for DNS rebinding detection)
    await validateExternalUrl(url);

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
}

// Export singleton instance
export const remoteClient = new RemoteActivityPubClient();
