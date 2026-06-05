/**
 * Authenticated client for write operations.
 *
 * Thin router over platform write adapters: interface ops delegate to the
 * adapter resolved from the instance's detected software; Mastodon-only ops
 * (bookmarks, polls, scheduled posts) guard against Misskey accounts and
 * otherwise call the Mastodon REST API directly via the shared fetch helper.
 */

import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../config.js";
import { UnsupportedOnPlatformError } from "../utils/errors.js";
import { readErrorText, readJsonWithLimit } from "../utils/fetch-helpers.js";
import { type AccountCredentials, accountManager } from "./account-manager.js";
import { resolveSoftwareKind, resolveWriteAdapter } from "./adapters/resolve.js";
import {
  authenticatedFetch,
  type CreatePostOptions,
  type CreatePostResult,
  type ListPageOptions,
  type MediaAttachment,
  MediaAttachmentSchema,
  type NotificationItem,
  type NotificationOptions,
  type Relationship,
  type ScheduledStatus,
  ScheduledStatusSchema,
  type Status,
  StatusSchema,
  type WriteAdapter,
} from "./adapters/write-adapter.js";

// Re-export shared types so existing importers (auth/index.ts, tools-write.ts) are unaffected.
export type {
  CreatePostOptions,
  CreatePostResult,
  MediaAttachment,
  PostVisibility,
  Relationship,
  ScheduledStatus,
  Status,
} from "./adapters/write-adapter.js";

const logger = getLogger("activitypub-mcp:authenticated-client");

// Poll + scheduled-status schemas stay here — they back Mastodon-only ops.
const PollSchema = z.object({
  id: z.string(),
  expires_at: z.string().nullable(),
  expired: z.boolean(),
  multiple: z.boolean(),
  votes_count: z.number(),
  voters_count: z.number().nullable().optional(),
  voted: z.boolean().optional(),
  own_votes: z.array(z.number()).optional(),
  options: z.array(z.object({ title: z.string(), votes_count: z.number().nullable() })),
});
export type Poll = z.infer<typeof PollSchema>;

export class AuthenticatedClient {
  private requireActiveAccount(): AccountCredentials {
    const account = accountManager.getActiveAccount();
    if (!account) {
      throw new Error(
        "No authenticated account configured. Set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables, or use the account management tools.",
      );
    }
    return account;
  }

  private getAccountOrActive(accountId?: string): AccountCredentials {
    if (accountId) {
      const account = accountManager.getAccount(accountId);
      if (!account) throw new Error(`Account not found: ${accountId}`);
      return account;
    }
    return this.requireActiveAccount();
  }

  /** Resolve account + its platform adapter for an interface op. */
  private async resolve(
    accountId?: string,
  ): Promise<{ account: AccountCredentials; adapter: WriteAdapter }> {
    const account = this.getAccountOrActive(accountId);
    const adapter = await resolveWriteAdapter(account);
    return { account, adapter };
  }

  /** Guard a Mastodon-only op; throw a clear error on Misskey accounts. */
  private async assertMastodonApi(op: string, accountId?: string): Promise<AccountCredentials> {
    const account = this.getAccountOrActive(accountId);
    const kind = await resolveSoftwareKind(account);
    if (kind === "misskey") throw new UnsupportedOnPlatformError(op, "Misskey");
    return account;
  }

  // --- Interface ops: delegate to the resolved adapter ---

  async createPost(options: CreatePostOptions, accountId?: string): Promise<CreatePostResult> {
    const { account, adapter } = await this.resolve(accountId);
    logger.info("Creating post", {
      instance: account.instance,
      visibility: options.visibility || "public",
    });
    return adapter.createPost(account, options);
  }

  async deletePost(statusId: string, accountId?: string): Promise<void> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.deletePost(account, statusId);
  }

  async boostPost(statusId: string, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.boostPost(account, statusId);
  }

  async unboostPost(statusId: string, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unboostPost(account, statusId);
  }

  async favouritePost(statusId: string, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.favouritePost(account, statusId);
  }

  async unfavouritePost(statusId: string, accountId?: string): Promise<Status> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unfavouritePost(account, statusId);
  }

  async followAccount(
    targetAccountId: string,
    options?: { reblogs?: boolean; notify?: boolean; languages?: string[] },
    accountId?: string,
  ): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.followAccount(account, targetAccountId, options);
  }

  async unfollowAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unfollowAccount(account, targetAccountId);
  }

  async muteAccount(
    targetAccountId: string,
    options?: { notifications?: boolean; duration?: number },
    accountId?: string,
  ): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.muteAccount(account, targetAccountId, options);
  }

  async unmuteAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unmuteAccount(account, targetAccountId);
  }

  async blockAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.blockAccount(account, targetAccountId);
  }

  async unblockAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.unblockAccount(account, targetAccountId);
  }

  async getRelationship(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.getRelationship(account, targetAccountId);
  }

  async getRelationships(targetAccountIds: string[], accountId?: string): Promise<Relationship[]> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.getRelationships(account, targetAccountIds);
  }

  async lookupAccount(
    acct: string,
    accountId?: string,
  ): Promise<{ id: string; username: string; acct: string; url: string }> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.lookupAccount(account, acct);
  }

  async uploadMedia(
    file: Buffer | Blob,
    options?: { filename?: string; description?: string; focus?: { x: number; y: number } },
    accountId?: string,
  ): Promise<MediaAttachment> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.uploadMedia(account, file, options);
  }

  async getHomeTimeline(options?: ListPageOptions, accountId?: string): Promise<Status[]> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.getHomeTimeline(account, options);
  }

  async getNotifications(
    options?: NotificationOptions,
    accountId?: string,
  ): Promise<NotificationItem[]> {
    const { account, adapter } = await this.resolve(accountId);
    return adapter.getNotifications(account, options);
  }

  // --- Status helpers (unchanged) ---

  /**
   * Whether at least one authenticated account is configured. Named for what it
   * actually checks — it does NOT consult ENABLE_WRITES (that gate lives in
   * tools-write via {@link writeBlockReason}); the two are deliberately separate
   * so authenticated READS work without writes being enabled.
   */
  hasAuthenticatedAccount(): boolean {
    return accountManager.hasAccounts();
  }

  getWriteStatus(): {
    enabled: boolean;
    accountCount: number;
    activeAccount: { id: string; instance: string; username: string } | null;
  } {
    const active = accountManager.getActiveAccount();
    return {
      enabled: accountManager.hasAccounts(),
      accountCount: accountManager.accountCount,
      activeAccount: active
        ? { id: active.id, instance: active.instance, username: active.username }
        : null,
    };
  }

  // --- Mastodon-only ops: guard against Misskey, else call Mastodon REST ---

  async getBookmarks(
    options?: { limit?: number; maxId?: string; minId?: string },
    accountId?: string,
  ): Promise<Status[]> {
    const account = await this.assertMastodonApi("get-bookmarks", accountId);
    const { limit = 20, maxId, minId } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    const response = await authenticatedFetch(account, `/api/v1/bookmarks?${params}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to get bookmarks: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(StatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getFavourites(
    options?: { limit?: number; maxId?: string; minId?: string },
    accountId?: string,
  ): Promise<Status[]> {
    const account = await this.assertMastodonApi("get-favourites", accountId);
    const { limit = 20, maxId, minId } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    const response = await authenticatedFetch(account, `/api/v1/favourites?${params}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to get favourites: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(StatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async bookmarkPost(statusId: string, accountId?: string): Promise<Status> {
    const account = await this.assertMastodonApi("bookmark-post", accountId);
    const response = await authenticatedFetch(account, `/api/v1/statuses/${statusId}/bookmark`, {
      method: "POST",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to bookmark post: HTTP ${response.status} - ${errorText}`);
    }
    return StatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async unbookmarkPost(statusId: string, accountId?: string): Promise<Status> {
    const account = await this.assertMastodonApi("unbookmark-post", accountId);
    const response = await authenticatedFetch(account, `/api/v1/statuses/${statusId}/unbookmark`, {
      method: "POST",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to unbookmark post: HTTP ${response.status} - ${errorText}`);
    }
    return StatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async voteOnPoll(pollId: string, choices: number[], accountId?: string): Promise<Poll> {
    const account = await this.assertMastodonApi("vote-on-poll", accountId);
    const response = await authenticatedFetch(account, `/api/v1/polls/${pollId}/votes`, {
      method: "POST",
      body: JSON.stringify({ choices }),
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to vote on poll: HTTP ${response.status} - ${errorText}`);
    }
    return PollSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getPoll(pollId: string, accountId?: string): Promise<Poll> {
    const account = await this.assertMastodonApi("get-poll", accountId);
    const response = await authenticatedFetch(account, `/api/v1/polls/${pollId}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to get poll: HTTP ${response.status} - ${errorText}`);
    }
    return PollSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async updateMedia(
    mediaId: string,
    options: { description?: string; focus?: { x: number; y: number } },
    accountId?: string,
  ): Promise<MediaAttachment> {
    const account = await this.assertMastodonApi("update-media", accountId);
    const body: Record<string, unknown> = {};
    if (options.description !== undefined) body.description = options.description;
    if (options.focus) body.focus = `${options.focus.x},${options.focus.y}`;
    const response = await authenticatedFetch(account, `/api/v1/media/${mediaId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to update media: HTTP ${response.status} - ${errorText}`);
    }
    return MediaAttachmentSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getScheduledPosts(
    options?: { limit?: number; maxId?: string; sinceId?: string; minId?: string },
    accountId?: string,
  ): Promise<ScheduledStatus[]> {
    const account = await this.assertMastodonApi("get-scheduled-posts", accountId);
    const { limit = 20, maxId, sinceId, minId } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (sinceId) params.set("since_id", sinceId);
    if (minId) params.set("min_id", minId);
    const response = await authenticatedFetch(account, `/api/v1/scheduled_statuses?${params}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to get scheduled posts: HTTP ${response.status} - ${errorText}`);
    }
    return z
      .array(ScheduledStatusSchema)
      .parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getScheduledPost(scheduledId: string, accountId?: string): Promise<ScheduledStatus> {
    const account = await this.assertMastodonApi("get-scheduled-post", accountId);
    const response = await authenticatedFetch(
      account,
      `/api/v1/scheduled_statuses/${scheduledId}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to get scheduled post: HTTP ${response.status} - ${errorText}`);
    }
    return ScheduledStatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async updateScheduledPost(
    scheduledId: string,
    scheduledAt: string,
    accountId?: string,
  ): Promise<ScheduledStatus> {
    const account = await this.assertMastodonApi("update-scheduled-post", accountId);
    const response = await authenticatedFetch(
      account,
      `/api/v1/scheduled_statuses/${scheduledId}`,
      { method: "PUT", body: JSON.stringify({ scheduled_at: scheduledAt }) },
    );
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to update scheduled post: HTTP ${response.status} - ${errorText}`);
    }
    return ScheduledStatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async cancelScheduledPost(scheduledId: string, accountId?: string): Promise<void> {
    const account = await this.assertMastodonApi("cancel-scheduled-post", accountId);
    const response = await authenticatedFetch(
      account,
      `/api/v1/scheduled_statuses/${scheduledId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to cancel scheduled post: HTTP ${response.status} - ${errorText}`);
    }
  }
}

export const authenticatedClient = new AuthenticatedClient();
