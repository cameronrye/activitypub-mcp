/**
 * Account Manager for multi-account support.
 *
 * Manages authenticated Mastodon/Fediverse accounts with secure credential
 * storage and context switching between accounts.
 */

import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { resolveWriteAdapter } from "./adapters/resolve.js";
import type { AccountInfo } from "./adapters/write-adapter.js";

const logger = getLogger("activitypub-mcp:account-manager");

// Re-export so existing importers (auth/index.ts) keep working; the canonical
// definition lives in the adapter layer alongside the other normalized types.
export type { AccountInfo };

/**
 * Schema for account credentials
 */
const AccountCredentialsSchema = z.object({
  /** Unique identifier for this account configuration */
  id: z.string(),
  /** Instance domain (e.g., mastodon.social) */
  instance: z.string(),
  /** Account username (without @domain) */
  username: z.string(),
  /** OAuth access token */
  accessToken: z.string(),
  /** Token type (usually "Bearer") */
  tokenType: z.string().default("Bearer"),
  /** Token scopes granted */
  scopes: z.array(z.string()).default(["read", "write", "follow"]),
  /** When the account was added */
  createdAt: z.string().datetime(),
  /** Optional display name for this account config */
  label: z.string().optional(),
});

export type AccountCredentials = z.infer<typeof AccountCredentialsSchema>;

/**
 * Account manager for handling multiple authenticated accounts.
 */
export class AccountManager {
  private accounts: Map<string, AccountCredentials> = new Map();
  private activeAccountId: string | null = null;

  constructor() {
    // Load accounts from environment if configured
    this.loadFromEnvironment();
  }

  /**
   * Load accounts from environment variables.
   * Format: ACTIVITYPUB_ACCOUNTS=id1|instance1|token1|username1|label1,id2|instance2|token2|username2|label2
   * Or individual: ACTIVITYPUB_ACCOUNT_<ID>_INSTANCE, ACTIVITYPUB_ACCOUNT_<ID>_TOKEN
   */
  private loadFromEnvironment(): void {
    // Check for default account
    const defaultInstance = process.env.ACTIVITYPUB_DEFAULT_INSTANCE;
    const defaultToken = process.env.ACTIVITYPUB_DEFAULT_TOKEN;
    const defaultUsername = process.env.ACTIVITYPUB_DEFAULT_USERNAME;

    if (defaultInstance && defaultToken) {
      try {
        const account: AccountCredentials = {
          id: "default",
          instance: defaultInstance,
          username: defaultUsername || "default",
          accessToken: defaultToken,
          tokenType: "Bearer",
          scopes: ["read", "write", "follow"],
          createdAt: new Date().toISOString(),
          label: "Default Account",
        };

        this.accounts.set("default", account);
        this.activeAccountId = "default";
        logger.info("Loaded default account from environment", { instance: defaultInstance });
      } catch (error) {
        logger.warn("Failed to load default account from environment", { error });
      }
    }

    // Check for additional accounts
    const rawAccounts = process.env.ACTIVITYPUB_ACCOUNTS;
    if (rawAccounts) {
      const entries = rawAccounts
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      // Migration guard: legacy `:`-delimited format silently truncated tokens
      // containing colons. Refuse to start if ANY entry looks legacy — catches
      // both all-legacy input and mixed legacy/v2 input.
      const legacyEntry = entries.find((e) => e.includes(":") && !e.includes("|"));
      if (legacyEntry) {
        throw new Error(
          "ACTIVITYPUB_ACCOUNTS uses pipe (|) delimiter as of v2. " +
            `Legacy entry detected: "${legacyEntry}". ` +
            "Migrate from 'id:inst:tok:user:label' to 'id|inst|tok|user|label'. " +
            "See MIGRATION-v2.md.",
        );
      }
      for (const entry of entries) {
        try {
          const parts = entry.split("|");
          const [id, instance, token, username = "user", label] = parts;
          if (!id || !instance || !token) {
            logger.warn("Skipping malformed account entry", { entry });
            continue;
          }
          this.addAccount({
            id,
            instance,
            accessToken: token,
            tokenType: "Bearer",
            username,
            label,
            scopes: ["read", "write"],
          });
        } catch (error) {
          logger.warn("Failed to load account from environment", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Add a new account.
   */
  addAccount(credentials: Omit<AccountCredentials, "createdAt">): AccountCredentials {
    const account: AccountCredentials = {
      ...credentials,
      createdAt: new Date().toISOString(),
    };

    // Validate
    AccountCredentialsSchema.parse(account);

    this.accounts.set(account.id, account);
    logger.info("Added account", { id: account.id, instance: account.instance });

    // Set as active if it's the first account
    if (!this.activeAccountId) {
      this.activeAccountId = account.id;
    }

    return account;
  }

  /**
   * Remove an account.
   */
  removeAccount(accountId: string): boolean {
    const removed = this.accounts.delete(accountId);

    if (removed) {
      logger.info("Removed account", { id: accountId });

      // Clear active account if it was the removed one
      if (this.activeAccountId === accountId) {
        const firstKey = this.accounts.keys().next();
        this.activeAccountId = this.accounts.size > 0 && !firstKey.done ? firstKey.value : null;
      }
    }

    return removed;
  }

  /**
   * Get an account by ID.
   */
  getAccount(accountId: string): AccountCredentials | undefined {
    return this.accounts.get(accountId);
  }

  /**
   * Get the currently active account.
   */
  getActiveAccount(): AccountCredentials | undefined {
    if (!this.activeAccountId) return undefined;
    return this.accounts.get(this.activeAccountId);
  }

  /**
   * Set the active account.
   */
  setActiveAccount(accountId: string): boolean {
    if (!this.accounts.has(accountId)) {
      logger.warn("Cannot set active account - not found", { id: accountId });
      return false;
    }

    this.activeAccountId = accountId;
    logger.info("Set active account", { id: accountId });
    return true;
  }

  /**
   * Get all configured accounts (without exposing tokens).
   */
  listAccounts(): Array<{
    id: string;
    instance: string;
    username: string;
    label?: string;
    isActive: boolean;
    scopes: string[];
  }> {
    return Array.from(this.accounts.values()).map((account) => ({
      id: account.id,
      instance: account.instance,
      username: account.username,
      label: account.label,
      isActive: account.id === this.activeAccountId,
      scopes: account.scopes,
    }));
  }

  /**
   * Check if any accounts are configured.
   */
  hasAccounts(): boolean {
    return this.accounts.size > 0;
  }

  /**
   * Get the number of configured accounts.
   */
  get accountCount(): number {
    return this.accounts.size;
  }

  /**
   * Check if an account has a specific scope.
   */
  hasScope(accountId: string, scope: string): boolean {
    const account = this.accounts.get(accountId);
    if (!account) return false;
    return account.scopes.includes(scope) || account.scopes.includes("write");
  }

  /**
   * Get account by instance domain.
   */
  getAccountByInstance(instance: string): AccountCredentials | undefined {
    for (const account of this.accounts.values()) {
      if (account.instance.toLowerCase() === instance.toLowerCase()) {
        return account;
      }
    }
    return undefined;
  }

  /**
   * Verify an access token is still valid by calling the platform adapter's
   * verifyCredentials. Returns null on any failure (not found, network, auth,
   * or SSRF/policy rejection — the adapter's guarded fetch enforces those).
   */
  async verifyAccount(accountId: string): Promise<AccountInfo | null> {
    const account = this.accounts.get(accountId);
    if (!account) {
      logger.warn("Cannot verify account - not found", { id: accountId });
      return null;
    }
    try {
      const adapter = await resolveWriteAdapter(account);
      return await adapter.verifyCredentials(account);
    } catch (error) {
      logger.error("Account verification error", {
        id: accountId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Export accounts configuration (without tokens for security).
   */
  exportConfig(): Array<{ id: string; instance: string; username: string; label?: string }> {
    return Array.from(this.accounts.values()).map((account) => ({
      id: account.id,
      instance: account.instance,
      username: account.username,
      label: account.label,
    }));
  }
}

// Export singleton instance.
// Construction throws if env vars are misconfigured (e.g. legacy ACTIVITYPUB_ACCOUNTS
// format). The server entry point catches this and exits non-zero.
export const accountManager = new AccountManager();
