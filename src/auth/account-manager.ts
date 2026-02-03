/**
 * Account Manager for multi-account support.
 *
 * Manages authenticated Mastodon/Fediverse accounts with secure credential
 * storage and context switching between accounts.
 */

import { getLogger } from "@logtape/logtape";
import { z } from "zod";

const logger = getLogger("activitypub-mcp:account-manager");

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
 * Schema for account information returned from API
 */
const AccountInfoSchema = z.object({
  id: z.string(),
  username: z.string(),
  acct: z.string(),
  display_name: z.string().optional(),
  note: z.string().optional(),
  url: z.string(),
  avatar: z.string().optional(),
  header: z.string().optional(),
  followers_count: z.number(),
  following_count: z.number(),
  statuses_count: z.number(),
  created_at: z.string().optional(),
});

export type AccountInfo = z.infer<typeof AccountInfoSchema>;

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
   * Format: ACTIVITYPUB_ACCOUNTS=id1:instance1:token1,id2:instance2:token2
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
    const accountsEnv = process.env.ACTIVITYPUB_ACCOUNTS;
    if (accountsEnv) {
      const accountEntries = accountsEnv.split(",");
      for (const entry of accountEntries) {
        const parts = entry.trim().split(":");
        if (parts.length >= 3) {
          const [id, instance, token, username = "user", label] = parts;
          try {
            const account: AccountCredentials = {
              id,
              instance,
              username,
              accessToken: token,
              tokenType: "Bearer",
              scopes: ["read", "write", "follow"],
              createdAt: new Date().toISOString(),
              label: label || undefined,
            };

            this.accounts.set(id, account);
            if (!this.activeAccountId) {
              this.activeAccountId = id;
            }
            logger.info("Loaded account from environment", { id, instance });
          } catch (error) {
            logger.warn("Failed to load account from environment", { id, error });
          }
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
   * Verify an access token is still valid.
   */
  async verifyAccount(accountId: string): Promise<AccountInfo | null> {
    const account = this.accounts.get(accountId);
    if (!account) {
      logger.warn("Cannot verify account - not found", { id: accountId });
      return null;
    }

    try {
      const response = await fetch(
        `https://${account.instance}/api/v1/accounts/verify_credentials`,
        {
          headers: {
            Authorization: `${account.tokenType} ${account.accessToken}`,
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        logger.warn("Account verification failed", {
          id: accountId,
          status: response.status,
        });
        return null;
      }

      const data = await response.json();
      return AccountInfoSchema.parse(data);
    } catch (error) {
      logger.error("Account verification error", { id: accountId, error });
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

// Export singleton instance
export const accountManager = new AccountManager();
