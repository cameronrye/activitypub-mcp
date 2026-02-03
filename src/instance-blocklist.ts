/**
 * Instance blocklist management for the ActivityPub MCP Server.
 *
 * Allows administrators to block specific instances from being accessed,
 * either for policy compliance, safety, or user preference reasons.
 */

import { getLogger } from "@logtape/logtape";
import { auditLogger } from "./audit-logger.js";
import { BLOCKED_INSTANCES } from "./config.js";

const logger = getLogger("activitypub-mcp:blocklist");

/**
 * Block reason categories.
 */
export type BlockReason =
  | "policy" // Admin policy block
  | "user" // User-requested block
  | "safety" // Safety/moderation block
  | "spam" // Known spam instance
  | "federation" // Defederated instance
  | "custom"; // Custom reason

/**
 * Blocked instance entry.
 */
export interface BlockedInstance {
  /** Domain of the blocked instance */
  domain: string;
  /** Reason for blocking */
  reason: BlockReason;
  /** Human-readable description */
  description?: string;
  /** When the block was added */
  addedAt: string;
  /** Who added the block (if known) */
  addedBy?: string;
  /** Optional expiration date */
  expiresAt?: string;
}

/**
 * Instance blocklist manager.
 */
export class InstanceBlocklist {
  private readonly blocklist: Map<string, BlockedInstance> = new Map();
  private readonly wildcardPatterns: Array<{ pattern: RegExp; entry: BlockedInstance }> = [];

  constructor() {
    // Initialize with configured blocked instances
    this.initializeFromConfig();
  }

  /**
   * Initialize blocklist from configuration.
   */
  private initializeFromConfig(): void {
    for (const domain of BLOCKED_INSTANCES) {
      this.addBlock({
        domain,
        reason: "policy",
        description: "Configured in environment",
        addedAt: new Date().toISOString(),
      });
    }

    if (BLOCKED_INSTANCES.length > 0) {
      logger.info("Initialized blocklist from config", {
        count: BLOCKED_INSTANCES.length,
      });
    }
  }

  /**
   * Normalize a domain for consistent comparison.
   */
  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().trim();
  }

  /**
   * Add an instance to the blocklist.
   */
  addBlock(entry: BlockedInstance): void {
    const normalizedDomain = this.normalizeDomain(entry.domain);

    // Check for wildcard pattern
    if (normalizedDomain.startsWith("*.")) {
      const patternStr = normalizedDomain.slice(2);
      const pattern = new RegExp(`^(.+\\.)?${this.escapeRegex(patternStr)}$`, "i");
      this.wildcardPatterns.push({
        pattern,
        entry: { ...entry, domain: normalizedDomain },
      });
      logger.info("Added wildcard block", { pattern: normalizedDomain, reason: entry.reason });
    } else {
      this.blocklist.set(normalizedDomain, {
        ...entry,
        domain: normalizedDomain,
      });
      logger.info("Added instance block", { domain: normalizedDomain, reason: entry.reason });
    }
  }

  /**
   * Remove an instance from the blocklist.
   */
  removeBlock(domain: string): boolean {
    const normalizedDomain = this.normalizeDomain(domain);

    // Remove exact match
    if (this.blocklist.has(normalizedDomain)) {
      this.blocklist.delete(normalizedDomain);
      logger.info("Removed instance block", { domain: normalizedDomain });
      return true;
    }

    // Remove wildcard pattern
    const wildcardIndex = this.wildcardPatterns.findIndex(
      (p) => p.entry.domain === normalizedDomain,
    );
    if (wildcardIndex !== -1) {
      this.wildcardPatterns.splice(wildcardIndex, 1);
      logger.info("Removed wildcard block", { pattern: normalizedDomain });
      return true;
    }

    return false;
  }

  /**
   * Check if a domain is blocked.
   */
  isBlocked(domain: string): { blocked: boolean; entry?: BlockedInstance } {
    const normalizedDomain = this.normalizeDomain(domain);

    // Check exact match
    const exactMatch = this.blocklist.get(normalizedDomain);
    if (exactMatch) {
      // Check expiration
      if (exactMatch.expiresAt && new Date(exactMatch.expiresAt) < new Date()) {
        this.blocklist.delete(normalizedDomain);
        return { blocked: false };
      }
      return { blocked: true, entry: exactMatch };
    }

    // Check wildcard patterns
    for (const { pattern, entry } of this.wildcardPatterns) {
      if (pattern.test(normalizedDomain)) {
        // Check expiration
        if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
          continue;
        }
        return { blocked: true, entry };
      }
    }

    return { blocked: false };
  }

  /**
   * Validate that a domain is not blocked, throwing an error if it is.
   */
  validateNotBlocked(domain: string): void {
    const result = this.isBlocked(domain);
    if (result.blocked) {
      const reason = result.entry?.description || result.entry?.reason || "blocked by policy";
      auditLogger.logBlockedInstance(domain, reason);
      throw new Error(`Access to instance "${domain}" is blocked: ${reason}`);
    }
  }

  /**
   * Get all blocked instances.
   */
  getBlockedInstances(): BlockedInstance[] {
    const now = new Date();

    // Filter out expired entries
    const exactBlocks = Array.from(this.blocklist.values()).filter(
      (entry) => !entry.expiresAt || new Date(entry.expiresAt) >= now,
    );

    const wildcardBlocks = this.wildcardPatterns
      .filter((p) => !p.entry.expiresAt || new Date(p.entry.expiresAt) >= now)
      .map((p) => p.entry);

    return [...exactBlocks, ...wildcardBlocks];
  }

  /**
   * Get blocklist statistics.
   */
  getStatistics(): {
    totalBlocked: number;
    byReason: Record<BlockReason, number>;
    wildcardPatterns: number;
  } {
    const byReason: Record<BlockReason, number> = {
      policy: 0,
      user: 0,
      safety: 0,
      spam: 0,
      federation: 0,
      custom: 0,
    };

    for (const entry of this.blocklist.values()) {
      byReason[entry.reason]++;
    }

    for (const { entry } of this.wildcardPatterns) {
      byReason[entry.reason]++;
    }

    return {
      totalBlocked: this.blocklist.size + this.wildcardPatterns.length,
      byReason,
      wildcardPatterns: this.wildcardPatterns.length,
    };
  }

  /**
   * Clear all blocks.
   */
  clear(): void {
    this.blocklist.clear();
    this.wildcardPatterns.length = 0;
    logger.info("Cleared all instance blocks");
  }

  /**
   * Escape special regex characters.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Import blocks from JSON.
   */
  importFromJson(json: string): number {
    const entries = JSON.parse(json) as BlockedInstance[];
    let imported = 0;

    for (const entry of entries) {
      if (entry.domain && entry.reason) {
        this.addBlock({
          ...entry,
          addedAt: entry.addedAt || new Date().toISOString(),
        });
        imported++;
      }
    }

    logger.info("Imported blocks from JSON", { count: imported });
    return imported;
  }

  /**
   * Export blocks to JSON.
   */
  exportToJson(): string {
    return JSON.stringify(this.getBlockedInstances(), null, 2);
  }
}

// Export singleton instance
export const instanceBlocklist = new InstanceBlocklist();
