import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getLogger } from "@logtape/logtape";
import { REQUEST_TIMEOUT, USER_AGENT } from "./config.js";

const logger = getLogger("activitypub-mcp");

// Load instance data from external JSON file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface InstanceData {
  domain: string;
  description: string;
  users: string;
}

type PopularInstancesData = Record<string, InstanceData[]>;

function loadInstanceData(): PopularInstancesData {
  try {
    const dataPath = join(__dirname, "data", "instances.json");
    const data = readFileSync(dataPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    logger.warn("Failed to load instance data from file, using empty defaults", { error });
    return {
      mastodon: [],
      pleroma: [],
      misskey: [],
      peertube: [],
      pixelfed: [],
      lemmy: [],
    };
  }
}

const POPULAR_INSTANCES = loadInstanceData();

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
export class InstanceDiscoveryService {
  private readonly requestTimeout = REQUEST_TIMEOUT;

  /**
   * Get popular instances by software type.
   *
   * @param software - Optional software type filter (e.g., "mastodon", "pleroma")
   * @returns Array of fediverse instances
   */
  getPopularInstances(software?: string): FediverseInstance[] {
    if (software) {
      const instances = POPULAR_INSTANCES[software];
      if (instances) {
        return instances.map((instance) => ({
          ...instance,
          software,
          category: software,
        }));
      }
    }

    // Return all instances if no specific software requested
    const allInstances: FediverseInstance[] = [];
    for (const [softwareType, instances] of Object.entries(POPULAR_INSTANCES)) {
      allInstances.push(
        ...instances.map((instance) => ({
          ...instance,
          software: softwareType,
          category: softwareType,
        })),
      );
    }

    return allInstances;
  }

  /**
   * Search for instances by topic or interest
   */
  searchInstancesByTopic(topic: string): FediverseInstance[] {
    const topicLower = topic.toLowerCase();
    const allInstances = this.getPopularInstances();

    return allInstances.filter(
      (instance) =>
        instance.description.toLowerCase().includes(topicLower) ||
        instance.domain.toLowerCase().includes(topicLower),
    );
  }

  /**
   * Get instances by size category
   */
  getInstancesBySize(size: "small" | "medium" | "large"): FediverseInstance[] {
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
  getBeginnerFriendlyInstances(): FediverseInstance[] {
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
  getInstancesByRegion(region: string): FediverseInstance[] {
    const regionLower = region.toLowerCase();
    const allInstances = this.getPopularInstances();

    // Simple region matching based on domain and description
    return allInstances.filter((instance) => {
      const domain = instance.domain.toLowerCase();
      const description = instance.description.toLowerCase();

      return (
        domain.includes(regionLower) ||
        description.includes(regionLower) ||
        (regionLower === "japan" && (domain.includes(".jp") || description.includes("japanese"))) ||
        (regionLower === "germany" && (domain.includes(".de") || description.includes("german"))) ||
        (regionLower === "france" && (domain.includes(".fr") || description.includes("french")))
      );
    });
  }

  /**
   * Check if an instance is online and responsive
   */
  async checkInstanceHealth(domain: string): Promise<{
    online: boolean;
    responseTime?: number;
    software?: string;
    version?: string;
    error?: string;
  }> {
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
    } catch (error) {
      return {
        online: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get instance statistics and information
   */
  async getInstanceStats(domain: string): Promise<{
    domain: string;
    online: boolean;
    software?: string;
    version?: string;
    users?: number;
    posts?: number;
    description?: string;
    languages?: string[];
    registrations?: boolean;
  }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(`https://${domain}/api/v1/instance`, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
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
    } catch (error) {
      logger.error("Failed to get instance stats", { domain, error });
      return { domain, online: false };
    }
  }

  /**
   * Parse user count string to number for comparison
   */
  private parseUserCount(userCountStr: string): number {
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
  getInstanceRecommendations(interests: string[]): FediverseInstance[] {
    const recommendations: FediverseInstance[] = [];
    const interestsLower = interests.map((i) => i.toLowerCase());

    // Tech/Programming
    if (
      interestsLower.some((i) =>
        ["tech", "programming", "coding", "development", "software"].includes(i),
      )
    ) {
      recommendations.push(
        ...this.getPopularInstances().filter((i) =>
          ["fosstodon.org", "hachyderm.io", "techhub.social"].includes(i.domain),
        ),
      );
    }

    // Academic/Research
    if (interestsLower.some((i) => ["academic", "research", "science", "education"].includes(i))) {
      recommendations.push(
        ...this.getPopularInstances().filter((i) => ["scholar.social"].includes(i.domain)),
      );
    }

    // Art/Creative
    if (interestsLower.some((i) => ["art", "creative", "design", "photography"].includes(i))) {
      recommendations.push(
        ...this.getPopularInstances().filter((i) =>
          ["pixelfed.social", "art.lgbt"].includes(i.domain),
        ),
      );
    }

    // Journalism/News
    if (interestsLower.some((i) => ["journalism", "news", "media"].includes(i))) {
      recommendations.push(
        ...this.getPopularInstances().filter((i) => ["journa.host"].includes(i.domain)),
      );
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
