import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { CACHE_MAX_SIZE, CACHE_TTL, REQUEST_TIMEOUT, USER_AGENT } from "./config.js";
import { LRUCache } from "./utils/lru-cache.js";
import { validateExternalUrl } from "./utils.js";
import { ActorIdentifierSchema } from "./validation/schemas.js";

const logger = getLogger("activitypub-mcp");

// WebFinger response schema
const WebFingerResponseSchema = z.object({
  subject: z.string(),
  aliases: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.string()).optional(),
  links: z.array(
    z.object({
      rel: z.string(),
      type: z.string().optional(),
      href: z.string().optional(),
      template: z.string().optional(),
      titles: z.record(z.string(), z.string()).optional(),
      properties: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

export type WebFingerResponse = z.infer<typeof WebFingerResponseSchema>;

// ActivityPub actor schema
const ActivityPubActorSchema = z.object({
  "@context": z.union([z.string(), z.array(z.union([z.string(), z.object({})]))]).optional(),
  id: z.string(),
  type: z.string(),
  preferredUsername: z.string().optional(),
  name: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().optional(),
  icon: z
    .object({
      type: z.string(),
      url: z.string(),
    })
    .optional(),
  image: z
    .object({
      type: z.string(),
      url: z.string(),
    })
    .optional(),
  inbox: z.string(),
  outbox: z.string(),
  followers: z.string().optional(),
  following: z.string().optional(),
  liked: z.string().optional(),
  publicKey: z
    .object({
      id: z.string(),
      owner: z.string(),
      publicKeyPem: z.string(),
    })
    .optional(),
  endpoints: z
    .object({
      sharedInbox: z.string().optional(),
    })
    .optional(),
});

export type ActivityPubActor = z.infer<typeof ActivityPubActorSchema>;

/**
 * WebFinger client for discovering ActivityPub actors across the fediverse
 * Uses LRU caching with TTL to prevent unbounded memory growth.
 */
export class WebFingerClient {
  private readonly cache: LRUCache<string, WebFingerResponse>;
  private readonly actorCache: LRUCache<string, ActivityPubActor>;
  private readonly requestTimeout = REQUEST_TIMEOUT;

  constructor() {
    this.cache = new LRUCache<string, WebFingerResponse>({
      maxSize: CACHE_MAX_SIZE,
      ttl: CACHE_TTL,
    });
    this.actorCache = new LRUCache<string, ActivityPubActor>({
      maxSize: CACHE_MAX_SIZE,
      ttl: CACHE_TTL,
    });
  }

  /**
   * Discover an ActivityPub actor using WebFinger
   * @param identifier - Actor identifier (e.g., "user@domain.com" or "@user@domain.com")
   * @returns Promise<ActivityPubActor>
   */
  async discoverActor(identifier: string): Promise<ActivityPubActor> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);

    // Check actor cache first (LRU cache handles TTL internally)
    const cachedActor = this.actorCache.get(normalizedIdentifier);
    if (cachedActor) {
      logger.debug("Returning cached actor", {
        identifier: normalizedIdentifier,
      });
      return cachedActor;
    }

    // Perform WebFinger discovery
    const webfingerResponse = await this.performWebFingerLookup(normalizedIdentifier);

    // Extract ActivityPub actor URL
    const actorUrl = this.extractActivityPubUrl(webfingerResponse);
    if (!actorUrl) {
      throw new Error(`No ActivityPub actor URL found for ${normalizedIdentifier}`);
    }

    // Fetch the actor
    const actor = await this.fetchActor(actorUrl);

    // Cache the result (LRU cache handles eviction and TTL)
    this.actorCache.set(normalizedIdentifier, actor);

    return actor;
  }

  /**
   * Perform WebFinger lookup
   */
  private async performWebFingerLookup(identifier: string): Promise<WebFingerResponse> {
    // Check cache first (LRU cache handles TTL internally)
    const cached = this.cache.get(identifier);
    if (cached) {
      logger.debug("Returning cached WebFinger response", { identifier });
      return cached;
    }

    const [username, domain] = identifier.replace(/^@/, "").split("@");
    if (!username || !domain) {
      throw new Error(`Invalid identifier format: ${identifier}`);
    }

    const webfingerUrl = `https://${domain}/.well-known/webfinger?resource=acct:${username}@${domain}`;

    // SSRF protection: validate URL with async DNS resolution for rebinding detection
    await validateExternalUrl(webfingerUrl);

    logger.info("Performing WebFinger lookup", {
      identifier,
      url: webfingerUrl,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(webfingerUrl, {
        method: "GET",
        headers: {
          Accept: "application/jrd+json, application/json",
          "User-Agent": USER_AGENT,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`WebFinger lookup failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const webfingerResponse = WebFingerResponseSchema.parse(data);

      // Cache the result (LRU cache handles eviction and TTL)
      this.cache.set(identifier, webfingerResponse);

      return webfingerResponse;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`WebFinger lookup timed out for ${identifier}`);
      }
      throw error;
    }
  }

  /**
   * Extract ActivityPub actor URL from WebFinger response
   */
  private extractActivityPubUrl(webfingerResponse: WebFingerResponse): string | null {
    const activityPubLink = webfingerResponse.links.find(
      (link) =>
        link.rel === "self" &&
        (link.type === "application/activity+json" ||
          link.type === 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'),
    );

    return activityPubLink?.href || null;
  }

  /**
   * Fetch ActivityPub actor from URL
   */
  private async fetchActor(actorUrl: string): Promise<ActivityPubActor> {
    // SSRF protection: validate URL with async DNS resolution for rebinding detection
    await validateExternalUrl(actorUrl);

    logger.info("Fetching ActivityPub actor", { url: actorUrl });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(actorUrl, {
        method: "GET",
        headers: {
          Accept:
            'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          "User-Agent": USER_AGENT,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch actor: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return ActivityPubActorSchema.parse(data);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Actor fetch timed out for ${actorUrl}`);
      }
      throw error;
    }
  }

  /**
   * Normalize identifier format
   */
  private normalizeIdentifier(identifier: string): string {
    // Validate and normalize the identifier
    const validIdentifier = ActorIdentifierSchema.parse(identifier);

    // Remove leading @ if present
    const normalized = validIdentifier.replace(/^@/, "");

    return normalized;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
    this.actorCache.clear();
    logger.info("WebFinger cache cleared");
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { webfingerEntries: number; actorEntries: number } {
    return {
      webfingerEntries: this.cache.size,
      actorEntries: this.actorCache.size,
    };
  }
}

// Export singleton instance
export const webfingerClient = new WebFingerClient();
