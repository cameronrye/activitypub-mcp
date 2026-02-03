/**
 * Authenticated Client for write operations.
 *
 * Provides authenticated API calls for posting, boosting, favouriting,
 * and other write operations on Mastodon-compatible instances.
 */

import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { MAX_RESPONSE_SIZE, REQUEST_TIMEOUT, USER_AGENT } from "../config.js";
import { validateExternalUrl } from "../utils.js";
import { type AccountCredentials, accountManager } from "./account-manager.js";

const logger = getLogger("activitypub-mcp:authenticated-client");

/**
 * Visibility options for posts
 */
export type PostVisibility = "public" | "unlisted" | "private" | "direct";

/**
 * Options for creating a new post
 */
export interface CreatePostOptions {
  /** Post content (required) */
  content: string;
  /** Content warning / spoiler text */
  spoilerText?: string;
  /** Post visibility */
  visibility?: PostVisibility;
  /** ID of post to reply to */
  inReplyToId?: string;
  /** Language code (ISO 639-1) */
  language?: string;
  /** Whether post is sensitive */
  sensitive?: boolean;
  /** Media attachment IDs */
  mediaIds?: string[];
  /** Poll options */
  poll?: {
    options: string[];
    expiresIn: number;
    multiple?: boolean;
    hideTotals?: boolean;
  };
  /** Scheduled time (ISO 8601) */
  scheduledAt?: string;
  /** Idempotency key to prevent duplicate posts */
  idempotencyKey?: string;
}

/**
 * Schema for created status response
 */
const StatusSchema = z.object({
  id: z.string(),
  uri: z.string(),
  url: z.string().nullable().optional(),
  created_at: z.string(),
  content: z.string(),
  visibility: z.enum(["public", "unlisted", "private", "direct"]),
  sensitive: z.boolean(),
  spoiler_text: z.string(),
  reblogs_count: z.number(),
  favourites_count: z.number(),
  replies_count: z.number(),
  in_reply_to_id: z.string().nullable().optional(),
  in_reply_to_account_id: z.string().nullable().optional(),
  account: z.object({
    id: z.string(),
    username: z.string(),
    acct: z.string(),
    display_name: z.string().optional(),
    url: z.string(),
  }),
  media_attachments: z.array(z.any()).optional(),
  mentions: z.array(z.any()).optional(),
  tags: z.array(z.any()).optional(),
  poll: z.any().nullable().optional(),
});

export type Status = z.infer<typeof StatusSchema>;

/**
 * Schema for relationship response
 */
const RelationshipSchema = z.object({
  id: z.string(),
  following: z.boolean(),
  followed_by: z.boolean(),
  blocking: z.boolean(),
  blocked_by: z.boolean(),
  muting: z.boolean(),
  muting_notifications: z.boolean(),
  requested: z.boolean(),
  domain_blocking: z.boolean(),
  endorsed: z.boolean(),
  note: z.string().optional(),
});

export type Relationship = z.infer<typeof RelationshipSchema>;

/**
 * Schema for poll response
 */
const PollSchema = z.object({
  id: z.string(),
  expires_at: z.string().nullable(),
  expired: z.boolean(),
  multiple: z.boolean(),
  votes_count: z.number(),
  voters_count: z.number().nullable().optional(),
  voted: z.boolean().optional(),
  own_votes: z.array(z.number()).optional(),
  options: z.array(
    z.object({
      title: z.string(),
      votes_count: z.number().nullable(),
    }),
  ),
});

export type Poll = z.infer<typeof PollSchema>;

/**
 * Schema for media attachment response
 */
const MediaAttachmentSchema = z.object({
  id: z.string(),
  type: z.enum(["unknown", "image", "gifv", "video", "audio"]),
  url: z.string().nullable(),
  preview_url: z.string().nullable().optional(),
  remote_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  blurhash: z.string().nullable().optional(),
});

export type MediaAttachment = z.infer<typeof MediaAttachmentSchema>;

/**
 * Schema for scheduled status response
 */
const ScheduledStatusSchema = z.object({
  id: z.string(),
  scheduled_at: z.string(),
  params: z.object({
    text: z.string().optional(),
    visibility: z.enum(["public", "unlisted", "private", "direct"]).optional(),
    spoiler_text: z.string().optional(),
    media_ids: z.array(z.string()).nullable().optional(),
    in_reply_to_id: z.string().nullable().optional(),
    poll: z
      .object({
        options: z.array(z.string()),
        expires_in: z.number(),
        multiple: z.boolean().optional(),
        hide_totals: z.boolean().optional(),
      })
      .nullable()
      .optional(),
  }),
  media_attachments: z.array(MediaAttachmentSchema).optional(),
});

export type ScheduledStatus = z.infer<typeof ScheduledStatusSchema>;

/**
 * Authenticated client for write operations.
 */
export class AuthenticatedClient {
  private requestTimeout = REQUEST_TIMEOUT;

  /**
   * Get the authorization header for an account.
   */
  private getAuthHeader(account: AccountCredentials): string {
    return `${account.tokenType} ${account.accessToken}`;
  }

  /**
   * Make an authenticated request.
   */
  private async authenticatedFetch(
    account: AccountCredentials,
    endpoint: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const url = `https://${account.instance}${endpoint}`;

    // SSRF protection
    await validateExternalUrl(url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: this.getAuthHeader(account),
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Check response size
      const contentLength = response.headers.get("content-length");
      if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        throw new Error(`Response too large: ${contentLength} bytes`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out: ${endpoint}`);
      }
      throw error;
    }
  }

  /**
   * Require an active account or throw.
   */
  private requireActiveAccount(): AccountCredentials {
    const account = accountManager.getActiveAccount();
    if (!account) {
      throw new Error(
        "No authenticated account configured. Set ACTIVITYPUB_DEFAULT_INSTANCE and ACTIVITYPUB_DEFAULT_TOKEN environment variables, or use the account management tools.",
      );
    }
    return account;
  }

  /**
   * Get account by ID or use active account.
   */
  private getAccountOrActive(accountId?: string): AccountCredentials {
    if (accountId) {
      const account = accountManager.getAccount(accountId);
      if (!account) {
        throw new Error(`Account not found: ${accountId}`);
      }
      return account;
    }
    return this.requireActiveAccount();
  }

  /**
   * Create a new post/status.
   */
  async createPost(options: CreatePostOptions, accountId?: string): Promise<Status> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Creating post", {
      instance: account.instance,
      visibility: options.visibility || "public",
      hasReplyTo: !!options.inReplyToId,
      hasMedia: (options.mediaIds?.length || 0) > 0,
    });

    const body: Record<string, unknown> = {
      status: options.content,
    };

    if (options.spoilerText) body.spoiler_text = options.spoilerText;
    if (options.visibility) body.visibility = options.visibility;
    if (options.inReplyToId) body.in_reply_to_id = options.inReplyToId;
    if (options.language) body.language = options.language;
    if (options.sensitive !== undefined) body.sensitive = options.sensitive;
    if (options.mediaIds?.length) body.media_ids = options.mediaIds;
    if (options.poll) body.poll = options.poll;
    if (options.scheduledAt) body.scheduled_at = options.scheduledAt;

    const headers: Record<string, string> = {};
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const response = await this.authenticatedFetch(account, "/api/v1/statuses", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return StatusSchema.parse(data);
  }

  /**
   * Delete a post.
   */
  async deletePost(statusId: string, accountId?: string): Promise<void> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Deleting post", { instance: account.instance, statusId });

    const response = await this.authenticatedFetch(account, `/api/v1/statuses/${statusId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete post: HTTP ${response.status} - ${errorText}`);
    }
  }

  /**
   * Boost/reblog a post.
   */
  async boostPost(statusId: string, accountId?: string): Promise<Status> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Boosting post", { instance: account.instance, statusId });

    const response = await this.authenticatedFetch(account, `/api/v1/statuses/${statusId}/reblog`, {
      method: "POST",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to boost post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return StatusSchema.parse(data);
  }

  /**
   * Unboost/unreblog a post.
   */
  async unboostPost(statusId: string, accountId?: string): Promise<Status> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Unboosting post", { instance: account.instance, statusId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/statuses/${statusId}/unreblog`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unboost post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return StatusSchema.parse(data);
  }

  /**
   * Favourite a post.
   */
  async favouritePost(statusId: string, accountId?: string): Promise<Status> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Favouriting post", { instance: account.instance, statusId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/statuses/${statusId}/favourite`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to favourite post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return StatusSchema.parse(data);
  }

  /**
   * Unfavourite a post.
   */
  async unfavouritePost(statusId: string, accountId?: string): Promise<Status> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Unfavouriting post", { instance: account.instance, statusId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/statuses/${statusId}/unfavourite`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unfavourite post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return StatusSchema.parse(data);
  }

  /**
   * Bookmark a post.
   */
  async bookmarkPost(statusId: string, accountId?: string): Promise<Status> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Bookmarking post", { instance: account.instance, statusId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/statuses/${statusId}/bookmark`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to bookmark post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return StatusSchema.parse(data);
  }

  /**
   * Unbookmark a post.
   */
  async unbookmarkPost(statusId: string, accountId?: string): Promise<Status> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Unbookmarking post", { instance: account.instance, statusId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/statuses/${statusId}/unbookmark`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unbookmark post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return StatusSchema.parse(data);
  }

  /**
   * Follow an account.
   */
  async followAccount(
    targetAccountId: string,
    options?: { reblogs?: boolean; notify?: boolean; languages?: string[] },
    accountId?: string,
  ): Promise<Relationship> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Following account", { instance: account.instance, targetAccountId });

    const body: Record<string, unknown> = {};
    if (options?.reblogs !== undefined) body.reblogs = options.reblogs;
    if (options?.notify !== undefined) body.notify = options.notify;
    if (options?.languages) body.languages = options.languages;

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/${targetAccountId}/follow`,
      {
        method: "POST",
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to follow account: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return RelationshipSchema.parse(data);
  }

  /**
   * Unfollow an account.
   */
  async unfollowAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Unfollowing account", { instance: account.instance, targetAccountId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/${targetAccountId}/unfollow`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unfollow account: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return RelationshipSchema.parse(data);
  }

  /**
   * Mute an account.
   */
  async muteAccount(
    targetAccountId: string,
    options?: { notifications?: boolean; duration?: number },
    accountId?: string,
  ): Promise<Relationship> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Muting account", { instance: account.instance, targetAccountId });

    const body: Record<string, unknown> = {};
    if (options?.notifications !== undefined) body.notifications = options.notifications;
    if (options?.duration !== undefined) body.duration = options.duration;

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/${targetAccountId}/mute`,
      {
        method: "POST",
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to mute account: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return RelationshipSchema.parse(data);
  }

  /**
   * Unmute an account.
   */
  async unmuteAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Unmuting account", { instance: account.instance, targetAccountId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/${targetAccountId}/unmute`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unmute account: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return RelationshipSchema.parse(data);
  }

  /**
   * Block an account.
   */
  async blockAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Blocking account", { instance: account.instance, targetAccountId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/${targetAccountId}/block`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to block account: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return RelationshipSchema.parse(data);
  }

  /**
   * Unblock an account.
   */
  async unblockAccount(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Unblocking account", { instance: account.instance, targetAccountId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/${targetAccountId}/unblock`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unblock account: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return RelationshipSchema.parse(data);
  }

  /**
   * Get relationship with an account.
   */
  async getRelationship(targetAccountId: string, accountId?: string): Promise<Relationship> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Getting relationship", { instance: account.instance, targetAccountId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/relationships?id[]=${targetAccountId}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get relationship: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No relationship data returned");
    }

    return RelationshipSchema.parse(data[0]);
  }

  /**
   * Lookup an account by username@instance.
   */
  async lookupAccount(
    acct: string,
    accountId?: string,
  ): Promise<{ id: string; username: string; acct: string; url: string }> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Looking up account", { instance: account.instance, acct });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to lookup account: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Get bookmarked posts.
   */
  async getBookmarks(
    options?: { limit?: number; maxId?: string; minId?: string },
    accountId?: string,
  ): Promise<Status[]> {
    const account = this.getAccountOrActive(accountId);
    const { limit = 20, maxId, minId } = options || {};

    logger.info("Getting bookmarks", { instance: account.instance, limit });

    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);

    const response = await this.authenticatedFetch(account, `/api/v1/bookmarks?${params}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get bookmarks: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return z.array(StatusSchema).parse(data);
  }

  /**
   * Get favourited posts.
   */
  async getFavourites(
    options?: { limit?: number; maxId?: string; minId?: string },
    accountId?: string,
  ): Promise<Status[]> {
    const account = this.getAccountOrActive(accountId);
    const { limit = 20, maxId, minId } = options || {};

    logger.info("Getting favourites", { instance: account.instance, limit });

    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);

    const response = await this.authenticatedFetch(account, `/api/v1/favourites?${params}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get favourites: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return z.array(StatusSchema).parse(data);
  }

  /**
   * Get home timeline (authenticated).
   */
  async getHomeTimeline(
    options?: { limit?: number; maxId?: string; minId?: string; sinceId?: string },
    accountId?: string,
  ): Promise<Status[]> {
    const account = this.getAccountOrActive(accountId);
    const { limit = 20, maxId, minId, sinceId } = options || {};

    logger.info("Getting home timeline", { instance: account.instance, limit });

    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    if (sinceId) params.set("since_id", sinceId);

    const response = await this.authenticatedFetch(account, `/api/v1/timelines/home?${params}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get home timeline: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return z.array(StatusSchema).parse(data);
  }

  /**
   * Get notifications.
   */
  async getNotifications(
    options?: {
      limit?: number;
      maxId?: string;
      minId?: string;
      types?: string[];
      excludeTypes?: string[];
    },
    accountId?: string,
  ): Promise<
    Array<{
      id: string;
      type: string;
      created_at: string;
      account: { id: string; username: string; acct: string };
      status?: Status;
    }>
  > {
    const account = this.getAccountOrActive(accountId);
    const { limit = 20, maxId, minId, types, excludeTypes } = options || {};

    logger.info("Getting notifications", { instance: account.instance, limit });

    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    if (types) {
      for (const type of types) {
        params.append("types[]", type);
      }
    }
    if (excludeTypes) {
      for (const type of excludeTypes) {
        params.append("exclude_types[]", type);
      }
    }

    const response = await this.authenticatedFetch(account, `/api/v1/notifications?${params}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get notifications: HTTP ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Check if write operations are available.
   */
  isWriteEnabled(): boolean {
    return accountManager.hasAccounts();
  }

  /**
   * Get write status information.
   */
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

  /**
   * Vote on a poll.
   */
  async voteOnPoll(pollId: string, choices: number[], accountId?: string): Promise<Poll> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Voting on poll", { instance: account.instance, pollId, choices });

    const response = await this.authenticatedFetch(account, `/api/v1/polls/${pollId}/votes`, {
      method: "POST",
      body: JSON.stringify({ choices }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to vote on poll: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return PollSchema.parse(data);
  }

  /**
   * Get a poll by ID.
   */
  async getPoll(pollId: string, accountId?: string): Promise<Poll> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Getting poll", { instance: account.instance, pollId });

    const response = await this.authenticatedFetch(account, `/api/v1/polls/${pollId}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get poll: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return PollSchema.parse(data);
  }

  /**
   * Upload media attachment.
   */
  async uploadMedia(
    file: Buffer | Blob,
    options?: {
      filename?: string;
      description?: string;
      focus?: { x: number; y: number };
    },
    accountId?: string,
  ): Promise<MediaAttachment> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Uploading media", {
      instance: account.instance,
      filename: options?.filename,
      hasDescription: !!options?.description,
    });

    const formData = new FormData();

    // Handle the file - if it's a Buffer, convert to Blob via Uint8Array
    const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)]);
    formData.append("file", blob, options?.filename || "upload");

    if (options?.description) {
      formData.append("description", options.description);
    }

    if (options?.focus) {
      formData.append("focus", `${options.focus.x},${options.focus.y}`);
    }

    const url = `https://${account.instance}/api/v2/media`;
    await validateExternalUrl(url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout * 3); // Longer timeout for uploads

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: this.getAuthHeader(account),
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          // Note: Don't set Content-Type for FormData - browser will set it with boundary
        },
        body: formData,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload media: HTTP ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return MediaAttachmentSchema.parse(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Media upload timed out");
      }
      throw error;
    }
  }

  /**
   * Update media attachment description/metadata.
   */
  async updateMedia(
    mediaId: string,
    options: {
      description?: string;
      focus?: { x: number; y: number };
    },
    accountId?: string,
  ): Promise<MediaAttachment> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Updating media", { instance: account.instance, mediaId });

    const body: Record<string, unknown> = {};
    if (options.description !== undefined) body.description = options.description;
    if (options.focus) body.focus = `${options.focus.x},${options.focus.y}`;

    const response = await this.authenticatedFetch(account, `/api/v1/media/${mediaId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update media: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return MediaAttachmentSchema.parse(data);
  }

  /**
   * Get scheduled posts.
   */
  async getScheduledPosts(
    options?: { limit?: number; maxId?: string; sinceId?: string; minId?: string },
    accountId?: string,
  ): Promise<ScheduledStatus[]> {
    const account = this.getAccountOrActive(accountId);
    const { limit = 20, maxId, sinceId, minId } = options || {};

    logger.info("Getting scheduled posts", { instance: account.instance, limit });

    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (sinceId) params.set("since_id", sinceId);
    if (minId) params.set("min_id", minId);

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/scheduled_statuses?${params}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get scheduled posts: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return z.array(ScheduledStatusSchema).parse(data);
  }

  /**
   * Get a single scheduled post.
   */
  async getScheduledPost(scheduledId: string, accountId?: string): Promise<ScheduledStatus> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Getting scheduled post", { instance: account.instance, scheduledId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/scheduled_statuses/${scheduledId}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get scheduled post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return ScheduledStatusSchema.parse(data);
  }

  /**
   * Update a scheduled post's scheduled time.
   */
  async updateScheduledPost(
    scheduledId: string,
    scheduledAt: string,
    accountId?: string,
  ): Promise<ScheduledStatus> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Updating scheduled post", {
      instance: account.instance,
      scheduledId,
      scheduledAt,
    });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/scheduled_statuses/${scheduledId}`,
      {
        method: "PUT",
        body: JSON.stringify({ scheduled_at: scheduledAt }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update scheduled post: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return ScheduledStatusSchema.parse(data);
  }

  /**
   * Cancel a scheduled post.
   */
  async cancelScheduledPost(scheduledId: string, accountId?: string): Promise<void> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Canceling scheduled post", { instance: account.instance, scheduledId });

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/scheduled_statuses/${scheduledId}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to cancel scheduled post: HTTP ${response.status} - ${errorText}`);
    }
  }

  /**
   * Get relationships with multiple accounts.
   */
  async getRelationships(targetAccountIds: string[], accountId?: string): Promise<Relationship[]> {
    const account = this.getAccountOrActive(accountId);

    logger.info("Getting relationships", {
      instance: account.instance,
      targetCount: targetAccountIds.length,
    });

    const params = new URLSearchParams();
    for (const id of targetAccountIds) {
      params.append("id[]", id);
    }

    const response = await this.authenticatedFetch(
      account,
      `/api/v1/accounts/relationships?${params}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get relationships: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return z.array(RelationshipSchema).parse(data);
  }
}

// Export singleton instance
export const authenticatedClient = new AuthenticatedClient();
