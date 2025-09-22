export interface FediverseInstance {
    domain: string;
    description: string;
    users: string;
    software?: string;
    category?: string;
}
/**
 * Service for discovering and managing fediverse instances
 */
export declare class InstanceDiscoveryService {
    private readonly requestTimeout;
    /**
     * Get popular instances by software type
     */
    getPopularInstances(software?: string): FediverseInstance[];
    /**
     * Search for instances by topic or interest
     */
    searchInstancesByTopic(topic: string): FediverseInstance[];
    /**
     * Get instances by size category
     */
    getInstancesBySize(size: "small" | "medium" | "large"): FediverseInstance[];
    /**
     * Get recommended instances for beginners
     */
    getBeginnerFriendlyInstances(): FediverseInstance[];
    /**
     * Get instances by language/region
     */
    getInstancesByRegion(region: string): FediverseInstance[];
    /**
     * Check if an instance is online and responsive
     */
    checkInstanceHealth(domain: string): Promise<{
        online: boolean;
        responseTime?: number;
        software?: string;
        version?: string;
        error?: string;
    }>;
    /**
     * Get instance statistics and information
     */
    getInstanceStats(domain: string): Promise<{
        domain: string;
        online: boolean;
        software?: string;
        version?: string;
        users?: number;
        posts?: number;
        description?: string;
        languages?: string[];
        registrations?: boolean;
    }>;
    /**
     * Parse user count string to number for comparison
     */
    private parseUserCount;
    /**
     * Get curated instance recommendations based on interests
     */
    getInstanceRecommendations(interests: string[]): FediverseInstance[];
}
export declare const instanceDiscovery: InstanceDiscoveryService;
//# sourceMappingURL=instance-discovery.d.ts.map