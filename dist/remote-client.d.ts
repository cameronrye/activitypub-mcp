import { z } from "zod";
import { type ActivityPubActor } from "./webfinger.js";
declare const ActivityPubCollectionSchema: z.ZodObject<{
    "@context": z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>]>, "many">]>>;
    id: z.ZodString;
    type: z.ZodEnum<["Collection", "OrderedCollection", "CollectionPage", "OrderedCollectionPage"]>;
    totalItems: z.ZodOptional<z.ZodNumber>;
    first: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>]>>;
    last: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>]>>;
    next: z.ZodOptional<z.ZodString>;
    prev: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    orderedItems: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    partOf: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "Collection" | "OrderedCollection" | "CollectionPage" | "OrderedCollectionPage";
    id: string;
    "@context"?: string | (string | {})[] | undefined;
    totalItems?: number | undefined;
    first?: string | {} | undefined;
    last?: string | {} | undefined;
    next?: string | undefined;
    prev?: string | undefined;
    items?: any[] | undefined;
    orderedItems?: any[] | undefined;
    partOf?: string | undefined;
}, {
    type: "Collection" | "OrderedCollection" | "CollectionPage" | "OrderedCollectionPage";
    id: string;
    "@context"?: string | (string | {})[] | undefined;
    totalItems?: number | undefined;
    first?: string | {} | undefined;
    last?: string | {} | undefined;
    next?: string | undefined;
    prev?: string | undefined;
    items?: any[] | undefined;
    orderedItems?: any[] | undefined;
    partOf?: string | undefined;
}>;
export type ActivityPubCollection = z.infer<typeof ActivityPubCollectionSchema>;
declare const ActivityPubObjectSchema: z.ZodObject<{
    "@context": z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    id: z.ZodString;
    type: z.ZodString;
    attributedTo: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
    published: z.ZodOptional<z.ZodString>;
    updated: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    cc: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    inReplyTo: z.ZodOptional<z.ZodString>;
    replies: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>]>>;
    likes: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>]>>;
    shares: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>]>>;
    tag: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        href: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        href?: string | undefined;
        name?: string | undefined;
    }, {
        type: string;
        href?: string | undefined;
        name?: string | undefined;
    }>, "many">>;
    attachment: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        mediaType: z.ZodOptional<z.ZodString>;
        url: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        url: string;
        name?: string | undefined;
        mediaType?: string | undefined;
    }, {
        type: string;
        url: string;
        name?: string | undefined;
        mediaType?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    "@context"?: string | string[] | undefined;
    summary?: string | undefined;
    url?: string | undefined;
    attributedTo?: string | undefined;
    content?: string | undefined;
    published?: string | undefined;
    updated?: string | undefined;
    to?: string[] | undefined;
    cc?: string[] | undefined;
    inReplyTo?: string | undefined;
    replies?: string | {} | undefined;
    likes?: string | {} | undefined;
    shares?: string | {} | undefined;
    tag?: {
        type: string;
        href?: string | undefined;
        name?: string | undefined;
    }[] | undefined;
    attachment?: {
        type: string;
        url: string;
        name?: string | undefined;
        mediaType?: string | undefined;
    }[] | undefined;
}, {
    type: string;
    id: string;
    "@context"?: string | string[] | undefined;
    summary?: string | undefined;
    url?: string | undefined;
    attributedTo?: string | undefined;
    content?: string | undefined;
    published?: string | undefined;
    updated?: string | undefined;
    to?: string[] | undefined;
    cc?: string[] | undefined;
    inReplyTo?: string | undefined;
    replies?: string | {} | undefined;
    likes?: string | {} | undefined;
    shares?: string | {} | undefined;
    tag?: {
        type: string;
        href?: string | undefined;
        name?: string | undefined;
    }[] | undefined;
    attachment?: {
        type: string;
        url: string;
        name?: string | undefined;
        mediaType?: string | undefined;
    }[] | undefined;
}>;
export type ActivityPubObject = z.infer<typeof ActivityPubObjectSchema>;
declare const InstanceInfoSchema: z.ZodObject<{
    domain: z.ZodString;
    software: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    registrations: z.ZodOptional<z.ZodBoolean>;
    approval_required: z.ZodOptional<z.ZodBoolean>;
    invites_enabled: z.ZodOptional<z.ZodBoolean>;
    contact_account: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        username: z.ZodString;
        display_name: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        username: string;
        display_name?: string | undefined;
    }, {
        id: string;
        username: string;
        display_name?: string | undefined;
    }>>;
    stats: z.ZodOptional<z.ZodObject<{
        user_count: z.ZodOptional<z.ZodNumber>;
        status_count: z.ZodOptional<z.ZodNumber>;
        domain_count: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        user_count?: number | undefined;
        status_count?: number | undefined;
        domain_count?: number | undefined;
    }, {
        user_count?: number | undefined;
        status_count?: number | undefined;
        domain_count?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    domain: string;
    software?: string | undefined;
    version?: string | undefined;
    description?: string | undefined;
    languages?: string[] | undefined;
    registrations?: boolean | undefined;
    approval_required?: boolean | undefined;
    invites_enabled?: boolean | undefined;
    contact_account?: {
        id: string;
        username: string;
        display_name?: string | undefined;
    } | undefined;
    stats?: {
        user_count?: number | undefined;
        status_count?: number | undefined;
        domain_count?: number | undefined;
    } | undefined;
}, {
    domain: string;
    software?: string | undefined;
    version?: string | undefined;
    description?: string | undefined;
    languages?: string[] | undefined;
    registrations?: boolean | undefined;
    approval_required?: boolean | undefined;
    invites_enabled?: boolean | undefined;
    contact_account?: {
        id: string;
        username: string;
        display_name?: string | undefined;
    } | undefined;
    stats?: {
        user_count?: number | undefined;
        status_count?: number | undefined;
        domain_count?: number | undefined;
    } | undefined;
}>;
export type InstanceInfo = z.infer<typeof InstanceInfoSchema>;
/**
 * Client for interacting with remote ActivityPub servers
 */
export declare class RemoteActivityPubClient {
    private readonly requestTimeout;
    private readonly maxRetries;
    private readonly retryDelay;
    /**
     * Fetch actor information from remote server
     */
    fetchRemoteActor(identifier: string): Promise<ActivityPubActor>;
    /**
     * Fetch actor's outbox (timeline/posts)
     */
    fetchActorOutbox(identifier: string, limit?: number): Promise<ActivityPubCollection>;
    /**
     * Fetch actor's followers
     */
    fetchActorFollowers(identifier: string, limit?: number): Promise<ActivityPubCollection>;
    /**
     * Fetch actor's following
     */
    fetchActorFollowing(identifier: string, limit?: number): Promise<ActivityPubCollection>;
    /**
     * Fetch a specific ActivityPub object (post, note, etc.)
     */
    fetchObject(objectUrl: string): Promise<ActivityPubObject>;
    /**
     * Get instance information
     */
    getInstanceInfo(domain: string): Promise<InstanceInfo>;
    /**
     * Search for content on a specific instance
     */
    searchInstance(domain: string, query: string, type?: "accounts" | "statuses" | "hashtags"): Promise<unknown>;
    /**
     * Fetch with retry logic
     */
    private fetchWithRetry;
    /**
     * Fetch with timeout
     */
    private fetchWithTimeout;
    /**
     * Transform different instance API responses to our schema
     */
    private transformInstanceInfo;
}
export declare const remoteClient: RemoteActivityPubClient;
export {};
//# sourceMappingURL=remote-client.d.ts.map