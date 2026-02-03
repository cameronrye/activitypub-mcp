/**
 * Dynamic Instance Discovery Service
 *
 * Provides real-time discovery of fediverse instances using the instances.social API
 * and other discovery mechanisms.
 *
 * @module dynamic-instance-discovery
 */

import { getLogger } from "@logtape/logtape";
import {
  DYNAMIC_INSTANCE_CACHE_TTL,
  INSTANCES_SOCIAL_TOKEN,
  MAX_DYNAMIC_INSTANCES,
  REQUEST_TIMEOUT,
  USER_AGENT,
} from "./config.js";
import { LRUCache } from "./utils/lru-cache.js";
import { validateExternalUrl } from "./utils.js";

const logger = getLogger("activitypub-mcp:discovery");

/**
 * Instance information from dynamic discovery
 */
export interface DynamicInstance {
  domain: string;
  name?: string;
  description?: string;
  users?: number;
  statuses?: number;
  connections?: number;
  software?: string;
  version?: string;
  registrations?: boolean;
  approvalRequired?: boolean;
  language?: string;
  category?: string;
  thumbnail?: string;
  lastChecked?: string;
  uptime?: number;
  https?: boolean;
  obs?: number;
}

/**
 * Search/filter options for dynamic instance discovery
 */
export interface InstanceSearchOptions {
  /** Filter by software type (mastodon, pleroma, misskey, etc.) */
  software?: string;
  /** Minimum number of users */
  minUsers?: number;
  /** Maximum number of users */
  maxUsers?: number;
  /** Filter by language code (e.g., 'en', 'de', 'ja') */
  language?: string;
  /** Only show instances with open registrations */
  openRegistrations?: boolean;
  /** Sort by field */
  sortBy?: "users" | "statuses" | "connections" | "name";
  /** Sort order */
  sortOrder?: "asc" | "desc";
  /** Number of results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Response from dynamic instance search
 */
export interface InstanceSearchResult {
  instances: DynamicInstance[];
  total: number;
  hasMore: boolean;
  source: "api" | "cache" | "fallback";
  timestamp: string;
}

/**
 * Dynamic Instance Discovery Service
 *
 * Fetches and caches instance data from external APIs like instances.social
 */
export class DynamicInstanceDiscoveryService {
  private readonly cache: LRUCache<string, InstanceSearchResult>;
  private readonly apiToken: string;
  private readonly requestTimeout: number;
  private readonly maxInstances: number;

  private static readonly INSTANCES_SOCIAL_API = "https://instances.social/api/1.0";
  private static readonly FEDIVERSE_OBSERVER_API = "https://api.fediverse.observer/";

  constructor() {
    this.cache = new LRUCache<string, InstanceSearchResult>({
      maxSize: 100,
      ttl: DYNAMIC_INSTANCE_CACHE_TTL,
    });
    this.apiToken = INSTANCES_SOCIAL_TOKEN;
    this.requestTimeout = REQUEST_TIMEOUT;
    this.maxInstances = MAX_DYNAMIC_INSTANCES;
  }

  /**
   * Search for instances using the instances.social API
   */
  async searchInstances(options: InstanceSearchOptions = {}): Promise<InstanceSearchResult> {
    const cacheKey = this.buildCacheKey(options);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug("Returning cached instance search results", { cacheKey });
      return { ...cached, source: "cache" };
    }

    try {
      const result = await this.fetchFromInstancesSocial(options);
      this.cache.set(cacheKey, result);
      return result;
    } catch (instancesSocialError) {
      logger.warn("Failed to fetch from instances.social, trying Fediverse Observer", {
        error:
          instancesSocialError instanceof Error
            ? instancesSocialError.message
            : String(instancesSocialError),
      });

      // Try Fediverse Observer as fallback
      try {
        const result = await this.fetchFromFediverseObserver(options);
        this.cache.set(cacheKey, result);
        return result;
      } catch (fediverseObserverError) {
        logger.warn("Failed to fetch from Fediverse Observer, using static fallback", {
          error:
            fediverseObserverError instanceof Error
              ? fediverseObserverError.message
              : String(fediverseObserverError),
        });
        return this.getFallbackInstances(options);
      }
    }
  }

  /**
   * Get a random selection of instances
   */
  async getRandomInstances(count = 10): Promise<InstanceSearchResult> {
    const cacheKey = `random:${count}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      // Shuffle cached results for variety
      const shuffled = [...cached.instances].sort(() => Math.random() - 0.5);
      return {
        ...cached,
        instances: shuffled.slice(0, count),
        source: "cache",
      };
    }

    try {
      const result = await this.fetchFromInstancesSocial({ limit: this.maxInstances });
      this.cache.set(cacheKey, result);

      // Return random subset
      const shuffled = [...result.instances].sort(() => Math.random() - 0.5);
      return {
        ...result,
        instances: shuffled.slice(0, count),
      };
    } catch (error) {
      logger.warn("Failed to fetch random instances", {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.getFallbackInstances({ limit: count });
    }
  }

  /**
   * Get instances by software type
   */
  async getInstancesBySoftware(software: string, limit = 20): Promise<InstanceSearchResult> {
    return this.searchInstances({ software, limit });
  }

  /**
   * Get instances by language
   */
  async getInstancesByLanguage(language: string, limit = 20): Promise<InstanceSearchResult> {
    return this.searchInstances({ language, limit });
  }

  /**
   * Get trending/popular instances
   */
  async getTrendingInstances(limit = 20): Promise<InstanceSearchResult> {
    return this.searchInstances({
      sortBy: "users",
      sortOrder: "desc",
      minUsers: 1000,
      limit,
    });
  }

  /**
   * Get small community instances
   */
  async getSmallCommunityInstances(limit = 20): Promise<InstanceSearchResult> {
    return this.searchInstances({
      minUsers: 10,
      maxUsers: 5000,
      openRegistrations: true,
      sortBy: "users",
      sortOrder: "asc",
      limit,
    });
  }

  /**
   * Fetch instances from instances.social API
   */
  private async fetchFromInstancesSocial(
    options: InstanceSearchOptions,
  ): Promise<InstanceSearchResult> {
    const url = new URL(`${DynamicInstanceDiscoveryService.INSTANCES_SOCIAL_API}/instances/list`);

    // Build query parameters
    if (options.software) {
      url.searchParams.set("software", options.software);
    }
    if (options.minUsers !== undefined) {
      url.searchParams.set("min_users", options.minUsers.toString());
    }
    if (options.maxUsers !== undefined) {
      url.searchParams.set("max_users", options.maxUsers.toString());
    }
    if (options.language) {
      url.searchParams.set("language", options.language);
    }
    if (options.openRegistrations !== undefined) {
      url.searchParams.set("include_closed", options.openRegistrations ? "false" : "true");
    }
    if (options.sortBy) {
      url.searchParams.set("sort_by", options.sortBy);
    }
    if (options.sortOrder) {
      url.searchParams.set("sort_order", options.sortOrder);
    }

    const limit = Math.min(options.limit || 20, this.maxInstances);
    url.searchParams.set("count", limit.toString());

    if (options.offset) {
      url.searchParams.set("offset", options.offset.toString());
    }

    // Validate URL for SSRF protection
    await validateExternalUrl(url.toString());

    logger.info("Fetching instances from instances.social", { url: url.toString() });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      };

      // Add API token if available (increases rate limits)
      if (this.apiToken) {
        headers.Authorization = `Bearer ${this.apiToken}`;
      }

      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Transform API response to our format
      const instances = this.transformInstancesSocialResponse(data);

      return {
        instances,
        total: data.pagination?.total || instances.length,
        hasMore: instances.length === limit,
        source: "api",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Fetch instances from Fediverse Observer GraphQL API
   */
  private async fetchFromFediverseObserver(
    options: InstanceSearchOptions,
  ): Promise<InstanceSearchResult> {
    const limit = Math.min(options.limit || 20, this.maxInstances);

    // Build GraphQL query with filters
    // Escape the software name to prevent GraphQL injection
    const escapedSoftware = options.software
      ? options.software
          .replaceAll("\\", "\\\\")
          .replaceAll('"', '\\"')
          .replaceAll(/[\n\r]/g, "")
      : "";
    const softwareFilter = escapedSoftware ? `softwarename: "${escapedSoftware}"` : "";
    const query = `{
      nodes(${softwareFilter}) {
        domain
        name
        softwarename
        softwareversion
        countryname
        total_users
        local_posts
        signup
        metadescription
      }
    }`;

    // Validate URL for SSRF protection
    await validateExternalUrl(DynamicInstanceDiscoveryService.FEDIVERSE_OBSERVER_API);

    logger.info("Fetching instances from Fediverse Observer", { software: options.software });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(DynamicInstanceDiscoveryService.FEDIVERSE_OBSERVER_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      let instances = this.transformFediverseObserverResponse(data);

      // Apply client-side filters
      instances = this.applyFilters(instances, options);

      // Apply limit
      const limited = instances.slice(0, limit);

      return {
        instances: limited,
        total: instances.length,
        hasMore: instances.length > limit,
        source: "api",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Transform Fediverse Observer GraphQL response to our format
   */
  private transformFediverseObserverResponse(data: unknown): DynamicInstance[] {
    if (!data || typeof data !== "object") {
      return [];
    }

    const responseData = data as { data?: { nodes?: unknown[] } };
    const nodes = responseData.data?.nodes;

    if (!Array.isArray(nodes)) {
      return [];
    }

    return nodes
      .map((node: unknown) => {
        const n = node as Record<string, unknown>;
        return {
          domain: typeof n.domain === "string" ? n.domain : "",
          name: typeof n.name === "string" ? n.name : undefined,
          description: typeof n.metadescription === "string" ? n.metadescription : undefined,
          users: typeof n.total_users === "number" ? n.total_users : undefined,
          statuses: typeof n.local_posts === "number" ? n.local_posts : undefined,
          software: typeof n.softwarename === "string" ? n.softwarename : undefined,
          version: typeof n.softwareversion === "string" ? n.softwareversion : undefined,
          registrations: n.signup === true,
          language: typeof n.countryname === "string" ? n.countryname : undefined,
        };
      })
      .filter((inst) => inst.domain);
  }

  /**
   * Apply filters to instance list (for APIs that don't support server-side filtering)
   */
  private applyFilters(
    instances: DynamicInstance[],
    options: InstanceSearchOptions,
  ): DynamicInstance[] {
    let filtered = instances;

    if (options.language) {
      const lang = options.language.toLowerCase();
      filtered = filtered.filter((i) => i.language?.toLowerCase().includes(lang));
    }
    if (options.minUsers !== undefined) {
      const minUsers = options.minUsers;
      filtered = filtered.filter((i) => (i.users || 0) >= minUsers);
    }
    if (options.maxUsers !== undefined) {
      const maxUsers = options.maxUsers;
      filtered = filtered.filter((i) => (i.users || 0) <= maxUsers);
    }
    if (options.openRegistrations !== undefined) {
      filtered = filtered.filter((i) => i.registrations === options.openRegistrations);
    }

    // Sort
    if (options.sortBy) {
      filtered.sort((a, b) => {
        let diff = 0;
        switch (options.sortBy) {
          case "users":
            diff = (b.users || 0) - (a.users || 0);
            break;
          case "statuses":
            diff = (b.statuses || 0) - (a.statuses || 0);
            break;
          case "name":
            diff = (a.domain || "").localeCompare(b.domain || "");
            break;
        }
        return options.sortOrder === "asc" ? -diff : diff;
      });
    }

    return filtered;
  }

  /**
   * Transform instances.social API response to our format
   */
  private transformInstancesSocialResponse(data: unknown): DynamicInstance[] {
    if (!data || typeof data !== "object") {
      return [];
    }

    const responseData = data as { instances?: unknown[] };
    const instances = responseData.instances;

    if (!Array.isArray(instances)) {
      return [];
    }

    return instances
      .map((instance: unknown) => {
        const inst = instance as Record<string, unknown>;
        const info = (inst.info as Record<string, unknown>) || {};

        return {
          domain: String(inst.name || ""),
          name: inst.title ? String(inst.title) : undefined,
          description: info.short_description
            ? String(info.short_description)
            : info.full_description
              ? String(info.full_description)
              : undefined,
          users: typeof inst.users === "number" ? inst.users : undefined,
          statuses: typeof inst.statuses === "number" ? inst.statuses : undefined,
          connections: typeof inst.connections === "number" ? inst.connections : undefined,
          software: inst.software ? String(inst.software) : undefined,
          version: inst.version ? String(inst.version) : undefined,
          registrations:
            typeof inst.open_registrations === "boolean" ? inst.open_registrations : undefined,
          approvalRequired:
            typeof inst.approval_required === "boolean" ? inst.approval_required : undefined,
          language:
            Array.isArray(info.languages) && info.languages.length > 0
              ? String(info.languages[0])
              : undefined,
          thumbnail: inst.thumbnail ? String(inst.thumbnail) : undefined,
          uptime: typeof inst.uptime === "number" ? inst.uptime : undefined,
          https: typeof inst.https_score === "number" ? inst.https_score > 0 : undefined,
          obs: typeof inst.obs_score === "number" ? inst.obs_score : undefined,
        };
      })
      .filter((inst) => inst.domain);
  }

  /**
   * Build cache key from search options
   */
  private buildCacheKey(options: InstanceSearchOptions): string {
    const parts = [
      options.software || "any",
      options.minUsers?.toString() || "0",
      options.maxUsers?.toString() || "max",
      options.language || "any",
      options.openRegistrations?.toString() || "any",
      options.sortBy || "default",
      options.sortOrder || "desc",
      options.limit?.toString() || "20",
      options.offset?.toString() || "0",
    ];
    return `search:${parts.join(":")}`;
  }

  /**
   * Get fallback instances when API is unavailable
   */
  private getFallbackInstances(options: InstanceSearchOptions): InstanceSearchResult {
    // Curated list of well-known instances as fallback
    const fallbackInstances: DynamicInstance[] = [
      {
        domain: "mastodon.social",
        name: "Mastodon",
        description: "The original server operated by the Mastodon gGmbH non-profit",
        users: 2000000,
        software: "mastodon",
        registrations: true,
        language: "en",
      },
      {
        domain: "fosstodon.org",
        name: "Fosstodon",
        description: "A Mastodon instance for people interested in FOSS",
        users: 60000,
        software: "mastodon",
        registrations: true,
        language: "en",
        category: "tech",
      },
      {
        domain: "hachyderm.io",
        name: "Hachyderm",
        description: "A curated network of respectful professionals for tech industry",
        users: 50000,
        software: "mastodon",
        registrations: true,
        language: "en",
        category: "tech",
      },
      {
        domain: "infosec.exchange",
        name: "Infosec Exchange",
        description: "A Mastodon instance for info/cyber security-minded people",
        users: 30000,
        software: "mastodon",
        registrations: true,
        language: "en",
        category: "security",
      },
      {
        domain: "techhub.social",
        name: "TechHub",
        description: "A hub for tech enthusiasts and professionals",
        users: 25000,
        software: "mastodon",
        registrations: true,
        language: "en",
        category: "tech",
      },
      {
        domain: "mas.to",
        name: "mas.to",
        description: "A general-purpose Mastodon server",
        users: 150000,
        software: "mastodon",
        registrations: true,
        language: "en",
      },
      {
        domain: "mstdn.social",
        name: "mstdn.social",
        description: "A general purpose Mastodon instance",
        users: 100000,
        software: "mastodon",
        registrations: true,
        language: "en",
      },
      {
        domain: "pixelfed.social",
        name: "Pixelfed",
        description: "Photo sharing for everyone",
        users: 30000,
        software: "pixelfed",
        registrations: true,
        language: "en",
        category: "photography",
      },
      {
        domain: "lemmy.world",
        name: "Lemmy World",
        description: "A link aggregator and forum for the fediverse",
        users: 100000,
        software: "lemmy",
        registrations: true,
        language: "en",
        category: "discussion",
      },
      {
        domain: "misskey.io",
        name: "Misskey.io",
        description: "A Misskey instance in Japan",
        users: 300000,
        software: "misskey",
        registrations: true,
        language: "ja",
      },
    ];

    // Apply filters
    let filtered = fallbackInstances;

    if (options.software) {
      filtered = filtered.filter((i) => i.software === options.software);
    }
    if (options.language) {
      filtered = filtered.filter((i) => i.language === options.language);
    }
    if (options.minUsers !== undefined) {
      const minUsers = options.minUsers;
      filtered = filtered.filter((i) => (i.users || 0) >= minUsers);
    }
    if (options.maxUsers !== undefined) {
      const maxUsers = options.maxUsers;
      filtered = filtered.filter((i) => (i.users || 0) <= maxUsers);
    }
    if (options.openRegistrations !== undefined) {
      filtered = filtered.filter((i) => i.registrations === options.openRegistrations);
    }

    // Sort
    if (options.sortBy === "users") {
      filtered.sort((a, b) => {
        const diff = (b.users || 0) - (a.users || 0);
        return options.sortOrder === "asc" ? -diff : diff;
      });
    }

    // Apply limit and offset
    const offset = options.offset || 0;
    const limit = options.limit || 20;
    const sliced = filtered.slice(offset, offset + limit);

    return {
      instances: sliced,
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
      source: "fallback",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const dynamicInstanceDiscovery = new DynamicInstanceDiscoveryService();
