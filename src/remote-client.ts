import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { REQUEST_TIMEOUT, USER_AGENT } from "./config.js";
import { type ActivityPubActor, webfingerClient } from "./webfinger.js";

const logger = getLogger("activitypub-mcp");

// Domain validation schema
const DomainSchema = z
  .string()
  .min(1, "Domain cannot be empty")
  .max(253, "Domain too long")
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    "Invalid domain format",
  )
  .refine(
    (domain) =>
      !domain.includes("..") &&
      !domain.startsWith(".") &&
      !domain.endsWith("."),
    "Invalid domain format",
  );

// URL validation schema
const UrlSchema = z
  .string()
  .url("Invalid URL format")
  .refine((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }, "URL must use HTTP or HTTPS protocol");

// ActivityPub Collection schema
const ActivityPubCollectionSchema = z.object({
  "@context": z
    .union([z.string(), z.array(z.union([z.string(), z.object({})]))])
    .optional(),
  id: z.string(),
  type: z.enum([
    "Collection",
    "OrderedCollection",
    "CollectionPage",
    "OrderedCollectionPage",
  ]),
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
 * Client for interacting with remote ActivityPub servers
 */
export class RemoteActivityPubClient {
  private readonly requestTimeout = REQUEST_TIMEOUT;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  /**
   * Fetch actor information from remote server
   */
  async fetchRemoteActor(identifier: string): Promise<ActivityPubActor> {
    logger.info("Fetching remote actor", { identifier });

    try {
      return await webfingerClient.discoverActor(identifier);
    } catch (error) {
      logger.error("Failed to fetch remote actor", { identifier, error });
      throw new Error(
        `Failed to fetch actor ${identifier}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Fetch actor's outbox (timeline/posts)
   */
  async fetchActorOutbox(
    identifier: string,
    limit = 20,
  ): Promise<ActivityPubCollection> {
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
  async fetchActorFollowers(
    identifier: string,
    limit = 20,
  ): Promise<ActivityPubCollection> {
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
  async fetchActorFollowing(
    identifier: string,
    limit = 20,
  ): Promise<ActivityPubCollection> {
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
   * Get instance information
   */
  async getInstanceInfo(domain: string): Promise<InstanceInfo> {
    // Validate domain input
    const validDomain = DomainSchema.parse(domain);
    logger.info("Fetching instance info", { domain: validDomain });

    // Try multiple endpoints for instance information
    const endpoints = [
      `https://${validDomain}/api/v1/instance`, // Mastodon/Pleroma
      `https://${validDomain}/api/meta`, // Misskey
      `https://${validDomain}/nodeinfo/2.0`, // NodeInfo
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.fetchWithTimeout(endpoint, {
          headers: {
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
        });

        if (response.ok) {
          const data = await response.json();

          // Transform different API responses to our schema
          const instanceInfo = this.transformInstanceInfo(
            domain,
            data,
            endpoint,
          );
          return InstanceInfoSchema.parse(instanceInfo);
        }
      } catch (error) {
        logger.debug("Failed to fetch from endpoint", { endpoint, error });
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
   * Fetch with retry logic
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
          logger.warn(`Attempt ${attempt} failed, retrying...`, {
            url,
            error: lastError.message,
          });
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * attempt),
          );
        }
      }
    }

    throw lastError || new Error("All retry attempts failed");
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
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
   * Transform different instance API responses to our schema
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
      // Mastodon/Pleroma format
      return {
        ...base,
        software:
          typeof dataObj.version === "string" &&
          dataObj.version.includes("Pleroma")
            ? "pleroma"
            : "mastodon",
        version:
          typeof dataObj.version === "string" ? dataObj.version : undefined,
        description:
          typeof dataObj.description === "string"
            ? dataObj.description
            : undefined,
        languages: Array.isArray(dataObj.languages)
          ? (dataObj.languages as string[])
          : undefined,
        registrations:
          typeof dataObj.registrations === "boolean"
            ? dataObj.registrations
            : undefined,
        approval_required:
          typeof dataObj.approval_required === "boolean"
            ? dataObj.approval_required
            : undefined,
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

    if (endpoint.includes("/api/meta")) {
      // Misskey format
      return {
        ...base,
        software: "misskey",
        version:
          typeof dataObj.version === "string" ? dataObj.version : undefined,
        description:
          typeof dataObj.description === "string"
            ? dataObj.description
            : undefined,
      };
    }

    if (endpoint.includes("/nodeinfo")) {
      // NodeInfo format
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
        version:
          typeof software.version === "string" ? software.version : undefined,
        description:
          typeof metadata.nodeDescription === "string"
            ? metadata.nodeDescription
            : undefined,
      };
    }

    return base;
  }
}

// Export singleton instance
export const remoteClient = new RemoteActivityPubClient();
