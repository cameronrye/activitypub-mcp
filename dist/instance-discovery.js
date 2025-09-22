import { getLogger } from "@logtape/logtape";
import { z } from "zod";
const logger = getLogger("activitypub-mcp-server");
// Popular fediverse instances by category
const POPULAR_INSTANCES = {
    mastodon: [
        {
            domain: "mastodon.social",
            description: "The flagship Mastodon instance",
            users: "900k+",
        },
        {
            domain: "mas.to",
            description: "General purpose Mastodon instance",
            users: "100k+",
        },
        {
            domain: "mstdn.social",
            description: "Japanese Mastodon instance",
            users: "200k+",
        },
        {
            domain: "fosstodon.org",
            description: "For FOSS enthusiasts",
            users: "50k+",
        },
        {
            domain: "hachyderm.io",
            description: "For tech professionals",
            users: "30k+",
        },
        {
            domain: "pixelfed.social",
            description: "Photo sharing (Pixelfed)",
            users: "20k+",
        },
        {
            domain: "techhub.social",
            description: "Technology focused",
            users: "25k+",
        },
        {
            domain: "scholar.social",
            description: "Academic community",
            users: "15k+",
        },
        { domain: "journa.host", description: "For journalists", users: "5k+" },
        {
            domain: "art.lgbt",
            description: "LGBTQ+ artists community",
            users: "3k+",
        },
    ],
    pleroma: [
        {
            domain: "pleroma.social",
            description: "Main Pleroma instance",
            users: "10k+",
        },
        {
            domain: "shitposter.club",
            description: "Free speech focused",
            users: "5k+",
        },
        {
            domain: "freespeechextremist.com",
            description: "Minimal moderation",
            users: "3k+",
        },
        { domain: "poa.st", description: "General Pleroma instance", users: "8k+" },
    ],
    misskey: [
        {
            domain: "misskey.io",
            description: "Main Misskey instance",
            users: "50k+",
        },
        { domain: "misskey.dev", description: "Development focused", users: "5k+" },
        {
            domain: "mi.nakn.jp",
            description: "Japanese Misskey instance",
            users: "3k+",
        },
    ],
    peertube: [
        {
            domain: "framatube.org",
            description: "Framasoft's PeerTube instance",
            users: "10k+",
        },
        {
            domain: "peertube.tv",
            description: "General PeerTube instance",
            users: "5k+",
        },
        {
            domain: "tube.tchncs.de",
            description: "German tech-focused",
            users: "3k+",
        },
    ],
    pixelfed: [
        {
            domain: "pixelfed.social",
            description: "Main Pixelfed instance",
            users: "20k+",
        },
        {
            domain: "pixelfed.de",
            description: "German Pixelfed instance",
            users: "5k+",
        },
    ],
    lemmy: [
        { domain: "lemmy.ml", description: "Main Lemmy instance", users: "30k+" },
        {
            domain: "lemmy.world",
            description: "General purpose Lemmy",
            users: "100k+",
        },
        {
            domain: "beehaw.org",
            description: "Curated Lemmy community",
            users: "15k+",
        },
    ],
};
/**
 * Service for discovering and managing fediverse instances
 */
export class InstanceDiscoveryService {
    requestTimeout = 10000;
    /**
     * Get popular instances by software type
     */
    getPopularInstances(software) {
        if (software && software in POPULAR_INSTANCES) {
            return POPULAR_INSTANCES[software].map((instance) => ({
                ...instance,
                software,
                category: software,
            }));
        }
        // Return all instances if no specific software requested
        const allInstances = [];
        for (const [softwareType, instances] of Object.entries(POPULAR_INSTANCES)) {
            allInstances.push(...instances.map((instance) => ({
                ...instance,
                software: softwareType,
                category: softwareType,
            })));
        }
        return allInstances;
    }
    /**
     * Search for instances by topic or interest
     */
    searchInstancesByTopic(topic) {
        const topicLower = topic.toLowerCase();
        const allInstances = this.getPopularInstances();
        return allInstances.filter((instance) => instance.description.toLowerCase().includes(topicLower) ||
            instance.domain.toLowerCase().includes(topicLower));
    }
    /**
     * Get instances by size category
     */
    getInstancesBySize(size) {
        const allInstances = this.getPopularInstances();
        return allInstances.filter((instance) => {
            const userCount = this.parseUserCount(instance.users);
            switch (size) {
                case "small":
                    return userCount < 10000;
                case "medium":
                    return userCount >= 10000 && userCount < 100000;
                case "large":
                    return userCount >= 100000;
                default:
                    return true;
            }
        });
    }
    /**
     * Get recommended instances for beginners
     */
    getBeginnerFriendlyInstances() {
        // These are well-moderated, stable instances good for newcomers
        const beginnerFriendly = [
            "mastodon.social",
            "mas.to",
            "fosstodon.org",
            "techhub.social",
            "scholar.social",
            "pixelfed.social",
            "lemmy.world",
        ];
        const allInstances = this.getPopularInstances();
        return allInstances.filter((instance) => beginnerFriendly.includes(instance.domain));
    }
    /**
     * Get instances by language/region
     */
    getInstancesByRegion(region) {
        const regionLower = region.toLowerCase();
        const allInstances = this.getPopularInstances();
        // Simple region matching based on domain and description
        return allInstances.filter((instance) => {
            const domain = instance.domain.toLowerCase();
            const description = instance.description.toLowerCase();
            return (domain.includes(regionLower) ||
                description.includes(regionLower) ||
                (regionLower === "japan" &&
                    (domain.includes(".jp") || description.includes("japanese"))) ||
                (regionLower === "germany" &&
                    (domain.includes(".de") || description.includes("german"))) ||
                (regionLower === "france" &&
                    (domain.includes(".fr") || description.includes("french"))));
        });
    }
    /**
     * Check if an instance is online and responsive
     */
    async checkInstanceHealth(domain) {
        const startTime = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
            // Try to fetch the instance's nodeinfo or API endpoint
            const response = await fetch(`https://${domain}/api/v1/instance`, {
                method: "HEAD",
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const responseTime = Date.now() - startTime;
            return {
                online: response.ok,
                responseTime,
            };
        }
        catch (error) {
            return {
                online: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    /**
     * Get instance statistics and information
     */
    async getInstanceStats(domain) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
            const response = await fetch(`https://${domain}/api/v1/instance`, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "ActivityPub-MCP-Client/1.0.0",
                },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                return { domain, online: false };
            }
            const data = await response.json();
            return {
                domain,
                online: true,
                software: data.version?.includes("Pleroma") ? "pleroma" : "mastodon",
                version: data.version,
                users: data.stats?.user_count,
                posts: data.stats?.status_count,
                description: data.description,
                languages: data.languages,
                registrations: data.registrations,
            };
        }
        catch (error) {
            logger.error("Failed to get instance stats", { domain, error });
            return { domain, online: false };
        }
    }
    /**
     * Parse user count string to number for comparison
     */
    parseUserCount(userCountStr) {
        const cleaned = userCountStr.replace(/[^\d.]/g, "");
        const num = Number.parseFloat(cleaned);
        if (userCountStr.includes("k") || userCountStr.includes("K")) {
            return num * 1000;
        }
        if (userCountStr.includes("m") || userCountStr.includes("M")) {
            return num * 1000000;
        }
        return num || 0;
    }
    /**
     * Get curated instance recommendations based on interests
     */
    getInstanceRecommendations(interests) {
        const recommendations = [];
        const interestsLower = interests.map((i) => i.toLowerCase());
        // Tech/Programming
        if (interestsLower.some((i) => ["tech", "programming", "coding", "development", "software"].includes(i))) {
            recommendations.push(...this.getPopularInstances().filter((i) => ["fosstodon.org", "hachyderm.io", "techhub.social"].includes(i.domain)));
        }
        // Academic/Research
        if (interestsLower.some((i) => ["academic", "research", "science", "education"].includes(i))) {
            recommendations.push(...this.getPopularInstances().filter((i) => ["scholar.social"].includes(i.domain)));
        }
        // Art/Creative
        if (interestsLower.some((i) => ["art", "creative", "design", "photography"].includes(i))) {
            recommendations.push(...this.getPopularInstances().filter((i) => ["pixelfed.social", "art.lgbt"].includes(i.domain)));
        }
        // Journalism/News
        if (interestsLower.some((i) => ["journalism", "news", "media"].includes(i))) {
            recommendations.push(...this.getPopularInstances().filter((i) => ["journa.host"].includes(i.domain)));
        }
        // If no specific matches, return general instances
        if (recommendations.length === 0) {
            recommendations.push(...this.getBeginnerFriendlyInstances().slice(0, 5));
        }
        return recommendations;
    }
}
// Export singleton instance
export const instanceDiscovery = new InstanceDiscoveryService();
//# sourceMappingURL=instance-discovery.js.map