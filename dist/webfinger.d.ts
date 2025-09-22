import { z } from "zod";
declare const WebFingerResponseSchema: z.ZodObject<{
    subject: z.ZodString;
    aliases: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    links: z.ZodArray<z.ZodObject<{
        rel: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        href: z.ZodOptional<z.ZodString>;
        template: z.ZodOptional<z.ZodString>;
        titles: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        rel: string;
        type?: string | undefined;
        properties?: Record<string, string> | undefined;
        href?: string | undefined;
        template?: string | undefined;
        titles?: Record<string, string> | undefined;
    }, {
        rel: string;
        type?: string | undefined;
        properties?: Record<string, string> | undefined;
        href?: string | undefined;
        template?: string | undefined;
        titles?: Record<string, string> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    subject: string;
    links: {
        rel: string;
        type?: string | undefined;
        properties?: Record<string, string> | undefined;
        href?: string | undefined;
        template?: string | undefined;
        titles?: Record<string, string> | undefined;
    }[];
    aliases?: string[] | undefined;
    properties?: Record<string, string> | undefined;
}, {
    subject: string;
    links: {
        rel: string;
        type?: string | undefined;
        properties?: Record<string, string> | undefined;
        href?: string | undefined;
        template?: string | undefined;
        titles?: Record<string, string> | undefined;
    }[];
    aliases?: string[] | undefined;
    properties?: Record<string, string> | undefined;
}>;
export type WebFingerResponse = z.infer<typeof WebFingerResponseSchema>;
declare const ActivityPubActorSchema: z.ZodObject<{
    "@context": z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>]>, "many">]>>;
    id: z.ZodString;
    type: z.ZodString;
    preferredUsername: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodObject<{
        type: z.ZodString;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        url: string;
    }, {
        type: string;
        url: string;
    }>>;
    image: z.ZodOptional<z.ZodObject<{
        type: z.ZodString;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        url: string;
    }, {
        type: string;
        url: string;
    }>>;
    inbox: z.ZodString;
    outbox: z.ZodString;
    followers: z.ZodOptional<z.ZodString>;
    following: z.ZodOptional<z.ZodString>;
    liked: z.ZodOptional<z.ZodString>;
    publicKey: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        owner: z.ZodString;
        publicKeyPem: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        owner: string;
        publicKeyPem: string;
    }, {
        id: string;
        owner: string;
        publicKeyPem: string;
    }>>;
    endpoints: z.ZodOptional<z.ZodObject<{
        sharedInbox: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        sharedInbox?: string | undefined;
    }, {
        sharedInbox?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    inbox: string;
    outbox: string;
    "@context"?: string | (string | {})[] | undefined;
    preferredUsername?: string | undefined;
    name?: string | undefined;
    summary?: string | undefined;
    url?: string | undefined;
    icon?: {
        type: string;
        url: string;
    } | undefined;
    image?: {
        type: string;
        url: string;
    } | undefined;
    followers?: string | undefined;
    following?: string | undefined;
    liked?: string | undefined;
    publicKey?: {
        id: string;
        owner: string;
        publicKeyPem: string;
    } | undefined;
    endpoints?: {
        sharedInbox?: string | undefined;
    } | undefined;
}, {
    type: string;
    id: string;
    inbox: string;
    outbox: string;
    "@context"?: string | (string | {})[] | undefined;
    preferredUsername?: string | undefined;
    name?: string | undefined;
    summary?: string | undefined;
    url?: string | undefined;
    icon?: {
        type: string;
        url: string;
    } | undefined;
    image?: {
        type: string;
        url: string;
    } | undefined;
    followers?: string | undefined;
    following?: string | undefined;
    liked?: string | undefined;
    publicKey?: {
        id: string;
        owner: string;
        publicKeyPem: string;
    } | undefined;
    endpoints?: {
        sharedInbox?: string | undefined;
    } | undefined;
}>;
export type ActivityPubActor = z.infer<typeof ActivityPubActorSchema>;
/**
 * WebFinger client for discovering ActivityPub actors across the fediverse
 */
export declare class WebFingerClient {
    private cache;
    private actorCache;
    private readonly cacheTimeout;
    private readonly requestTimeout;
    /**
     * Discover an ActivityPub actor using WebFinger
     * @param identifier - Actor identifier (e.g., "user@domain.com" or "@user@domain.com")
     * @returns Promise<ActivityPubActor>
     */
    discoverActor(identifier: string): Promise<ActivityPubActor>;
    /**
     * Perform WebFinger lookup
     */
    private performWebFingerLookup;
    /**
     * Extract ActivityPub actor URL from WebFinger response
     */
    private extractActivityPubUrl;
    /**
     * Fetch ActivityPub actor from URL
     */
    private fetchActor;
    /**
     * Normalize identifier format
     */
    private normalizeIdentifier;
    /**
     * Check if cached data is expired
     */
    private isExpired;
    /**
     * Clear all caches
     */
    clearCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        webfingerEntries: number;
        actorEntries: number;
    };
}
export declare const webfingerClient: WebFingerClient;
export {};
//# sourceMappingURL=webfinger.d.ts.map