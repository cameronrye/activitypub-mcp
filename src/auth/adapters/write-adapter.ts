/**
 * Shared contracts for platform write adapters.
 *
 * Owns the normalized response schemas/types (Mastodon-shaped — Misskey
 * responses are normalized into these), the WriteAdapter interface every
 * platform implements, and the guarded authenticatedFetch helper both
 * adapters share.
 */

import { z } from "zod";
import { REQUEST_TIMEOUT, USER_AGENT } from "../../config.js";
import { instanceBlocklist } from "../../policy/instance-blocklist.js";
import { fetchWithRedirectGuard } from "../../utils/fetch-helpers.js";
import { validateExternalUrl } from "../../validation/url.js";
import type { AccountCredentials } from "../account-manager.js";

export type PostVisibility = "public" | "unlisted" | "private" | "direct";

export interface CreatePostOptions {
  content: string;
  spoilerText?: string;
  visibility?: PostVisibility;
  inReplyToId?: string;
  language?: string;
  sensitive?: boolean;
  mediaIds?: string[];
  poll?: { options: string[]; expiresIn: number; multiple?: boolean; hideTotals?: boolean };
  scheduledAt?: string;
  idempotencyKey?: string;
}

export const StatusSchema = z.object({
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

export const RelationshipSchema = z.object({
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

export const MediaAttachmentSchema = z.object({
  id: z.string(),
  type: z.enum(["unknown", "image", "gifv", "video", "audio"]),
  url: z.string().nullable(),
  preview_url: z.string().nullable().optional(),
  remote_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  blurhash: z.string().nullable().optional(),
});
export type MediaAttachment = z.infer<typeof MediaAttachmentSchema>;

export const AccountInfoSchema = z.object({
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

export interface AccountLookup {
  id: string;
  username: string;
  acct: string;
  url: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  created_at: string;
  account: { id: string; username: string; acct: string };
  status?: Status;
}

export interface ListPageOptions {
  limit?: number;
  maxId?: string;
  minId?: string;
  sinceId?: string;
}

export interface FollowOptions {
  reblogs?: boolean;
  notify?: boolean;
  languages?: string[];
}

export interface MuteOptions {
  notifications?: boolean;
  duration?: number;
}

export interface UploadMediaOptions {
  filename?: string;
  description?: string;
  focus?: { x: number; y: number };
}

export interface NotificationOptions {
  limit?: number;
  maxId?: string;
  minId?: string;
  types?: string[];
  excludeTypes?: string[];
}

/**
 * The authenticated operations every platform adapter implements. Ops with no
 * cross-platform equivalent (bookmarks, polls, scheduled posts) are NOT here —
 * they remain Mastodon-only on AuthenticatedClient.
 */
export interface WriteAdapter {
  createPost(account: AccountCredentials, options: CreatePostOptions): Promise<Status>;
  deletePost(account: AccountCredentials, statusId: string): Promise<void>;
  boostPost(account: AccountCredentials, statusId: string): Promise<Status>;
  unboostPost(account: AccountCredentials, statusId: string): Promise<Status>;
  favouritePost(account: AccountCredentials, statusId: string): Promise<Status>;
  unfavouritePost(account: AccountCredentials, statusId: string): Promise<Status>;
  followAccount(
    account: AccountCredentials,
    targetId: string,
    options?: FollowOptions,
  ): Promise<Relationship>;
  unfollowAccount(account: AccountCredentials, targetId: string): Promise<Relationship>;
  muteAccount(
    account: AccountCredentials,
    targetId: string,
    options?: MuteOptions,
  ): Promise<Relationship>;
  unmuteAccount(account: AccountCredentials, targetId: string): Promise<Relationship>;
  blockAccount(account: AccountCredentials, targetId: string): Promise<Relationship>;
  unblockAccount(account: AccountCredentials, targetId: string): Promise<Relationship>;
  getRelationship(account: AccountCredentials, targetId: string): Promise<Relationship>;
  getRelationships(account: AccountCredentials, targetIds: string[]): Promise<Relationship[]>;
  lookupAccount(account: AccountCredentials, acct: string): Promise<AccountLookup>;
  verifyCredentials(account: AccountCredentials): Promise<AccountInfo>;
  uploadMedia(
    account: AccountCredentials,
    file: Buffer | Blob,
    options?: UploadMediaOptions,
  ): Promise<MediaAttachment>;
  getHomeTimeline(account: AccountCredentials, options?: ListPageOptions): Promise<Status[]>;
  getNotifications(
    account: AccountCredentials,
    options?: NotificationOptions,
  ): Promise<NotificationItem[]>;
}

/**
 * Make a guarded authenticated request to `https://<account.instance><endpoint>`.
 * Applies SSRF allow-list, operator blocklist, timeout, and redirect re-validation.
 * Extracted verbatim from the previous authenticated-client.ts implementation.
 */
export async function authenticatedFetch(
  account: AccountCredentials,
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `https://${account.instance}${endpoint}`;
  await validateExternalUrl(url);
  instanceBlocklist.validateNotBlocked(account.instance);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetchWithRedirectGuard(
      url,
      {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `${account.tokenType} ${account.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
      },
      async (target) => {
        await validateExternalUrl(target);
        instanceBlocklist.validateNotBlocked(new URL(target).hostname);
      },
    );
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out: ${endpoint}`);
    }
    throw error;
  }
}
