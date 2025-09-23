import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { REQUEST_TIMEOUT, USER_AGENT } from "./config.js";
const logger = getLogger("activitypub-mcp");
// Actor identifier validation schema
const ActorIdentifierSchema = z
    .string()
    .min(3, "Identifier too short")
    .max(320, "Identifier too long") // Max email length
    .regex(/^@?[a-zA-Z0-9._-]+@[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, "Invalid identifier format. Expected: user@domain.com");
// WebFinger response schema
const WebFingerResponseSchema = z.object({
    subject: z.string(),
    aliases: z.array(z.string()).optional(),
    properties: z.record(z.string()).optional(),
    links: z.array(z.object({
        rel: z.string(),
        type: z.string().optional(),
        href: z.string().optional(),
        template: z.string().optional(),
        titles: z.record(z.string()).optional(),
        properties: z.record(z.string()).optional(),
    })),
});
// ActivityPub actor schema
const ActivityPubActorSchema = z.object({
    "@context": z
        .union([z.string(), z.array(z.union([z.string(), z.object({})]))])
        .optional(),
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
/**
 * WebFinger client for discovering ActivityPub actors across the fediverse
 */
export class WebFingerClient {
    cache = new Map();
    actorCache = new Map();
    cacheTimeout = 5 * 60 * 1000; // 5 minutes
    requestTimeout = REQUEST_TIMEOUT;
    /**
     * Discover an ActivityPub actor using WebFinger
     * @param identifier - Actor identifier (e.g., "user@domain.com" or "@user@domain.com")
     * @returns Promise<ActivityPubActor>
     */
    async discoverActor(identifier) {
        const normalizedIdentifier = this.normalizeIdentifier(identifier);
        // Check actor cache first
        const cachedActor = this.actorCache.get(normalizedIdentifier);
        if (cachedActor && !this.isExpired(cachedActor.timestamp)) {
            logger.debug("Returning cached actor", {
                identifier: normalizedIdentifier,
            });
            return cachedActor.data;
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
        // Cache the result
        this.actorCache.set(normalizedIdentifier, {
            data: actor,
            timestamp: Date.now(),
        });
        return actor;
    }
    /**
     * Perform WebFinger lookup
     */
    async performWebFingerLookup(identifier) {
        // Check cache first
        const cached = this.cache.get(identifier);
        if (cached && !this.isExpired(cached.timestamp)) {
            logger.debug("Returning cached WebFinger response", { identifier });
            return cached.data;
        }
        const [username, domain] = identifier.replace(/^@/, "").split("@");
        if (!username || !domain) {
            throw new Error(`Invalid identifier format: ${identifier}`);
        }
        const webfingerUrl = `https://${domain}/.well-known/webfinger?resource=acct:${username}@${domain}`;
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
            // Cache the result
            this.cache.set(identifier, {
                data: webfingerResponse,
                timestamp: Date.now(),
            });
            return webfingerResponse;
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`WebFinger lookup timed out for ${identifier}`);
            }
            throw error;
        }
    }
    /**
     * Extract ActivityPub actor URL from WebFinger response
     */
    extractActivityPubUrl(webfingerResponse) {
        const activityPubLink = webfingerResponse.links.find((link) => link.rel === "self" &&
            (link.type === "application/activity+json" ||
                link.type ===
                    'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'));
        return activityPubLink?.href || null;
    }
    /**
     * Fetch ActivityPub actor from URL
     */
    async fetchActor(actorUrl) {
        logger.info("Fetching ActivityPub actor", { url: actorUrl });
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
            const response = await fetch(actorUrl, {
                method: "GET",
                headers: {
                    Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
                    "User-Agent": "ActivityPub-MCP-Client/1.0.0",
                },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`Failed to fetch actor: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return ActivityPubActorSchema.parse(data);
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`Actor fetch timed out for ${actorUrl}`);
            }
            throw error;
        }
    }
    /**
     * Normalize identifier format
     */
    normalizeIdentifier(identifier) {
        // Validate and normalize the identifier
        const validIdentifier = ActorIdentifierSchema.parse(identifier);
        // Remove leading @ if present
        const normalized = validIdentifier.replace(/^@/, "");
        return normalized;
    }
    /**
     * Check if cached data is expired
     */
    isExpired(timestamp) {
        return Date.now() - timestamp > this.cacheTimeout;
    }
    /**
     * Clear all caches
     */
    clearCache() {
        this.cache.clear();
        this.actorCache.clear();
        logger.info("WebFinger cache cleared");
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            webfingerEntries: this.cache.size,
            actorEntries: this.actorCache.size,
        };
    }
}
// Export singleton instance
export const webfingerClient = new WebFingerClient();
//# sourceMappingURL=webfinger.js.map