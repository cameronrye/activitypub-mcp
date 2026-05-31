/**
 * Mastodon REST API write adapter. Also serves all Mastodon-API-compatible
 * software (Pleroma, Akkoma, GotoSocial, Sharkey, Firefish, Iceshrimp) and is
 * the fail-safe default when software detection is unavailable.
 */

import { z } from "zod";
import { MAX_RESPONSE_SIZE, USER_AGENT } from "../../config.js";
import { instanceBlocklist } from "../../policy/instance-blocklist.js";
import { pinnedFetch, readErrorText, readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import {
  type AccountInfo,
  AccountInfoSchema,
  type AccountLookup,
  authenticatedFetch,
  type CreatePostOptions,
  type FollowOptions,
  type ListPageOptions,
  type MediaAttachment,
  MediaAttachmentSchema,
  type MuteOptions,
  type NotificationItem,
  type NotificationOptions,
  type Relationship,
  RelationshipSchema,
  type Status,
  StatusSchema,
  type UploadMediaOptions,
  type WriteAdapter,
} from "./write-adapter.js";

async function postAndParseStatus(
  account: AccountCredentials,
  endpoint: string,
  init: RequestInit,
  failVerb: string,
): Promise<Status> {
  const response = await authenticatedFetch(account, endpoint, init);
  if (!response.ok) {
    const errorText = await readErrorText(response);
    throw new Error(`Failed to ${failVerb}: HTTP ${response.status} - ${errorText}`);
  }
  return StatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

async function postAndParseRelationship(
  account: AccountCredentials,
  endpoint: string,
  init: RequestInit,
  failVerb: string,
): Promise<Relationship> {
  const response = await authenticatedFetch(account, endpoint, init);
  if (!response.ok) {
    const errorText = await readErrorText(response);
    throw new Error(`Failed to ${failVerb}: HTTP ${response.status} - ${errorText}`);
  }
  return RelationshipSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export class MastodonWriteAdapter implements WriteAdapter {
  async createPost(account: AccountCredentials, options: CreatePostOptions): Promise<Status> {
    const body: Record<string, unknown> = { status: options.content };
    if (options.spoilerText) body.spoiler_text = options.spoilerText;
    if (options.visibility) body.visibility = options.visibility;
    if (options.inReplyToId) body.in_reply_to_id = options.inReplyToId;
    if (options.language) body.language = options.language;
    if (options.sensitive !== undefined) body.sensitive = options.sensitive;
    if (options.mediaIds?.length) body.media_ids = options.mediaIds;
    if (options.poll) body.poll = options.poll;
    if (options.scheduledAt) body.scheduled_at = options.scheduledAt;

    const headers: Record<string, string> = {};
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    return postAndParseStatus(
      account,
      "/api/v1/statuses",
      { method: "POST", headers, body: JSON.stringify(body) },
      "create post",
    );
  }

  async deletePost(account: AccountCredentials, statusId: string): Promise<void> {
    const response = await authenticatedFetch(account, `/api/v1/statuses/${statusId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to delete post: HTTP ${response.status} - ${errorText}`);
    }
  }

  boostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    return postAndParseStatus(
      account,
      `/api/v1/statuses/${statusId}/reblog`,
      { method: "POST" },
      "boost post",
    );
  }

  unboostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    return postAndParseStatus(
      account,
      `/api/v1/statuses/${statusId}/unreblog`,
      { method: "POST" },
      "unboost post",
    );
  }

  favouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    return postAndParseStatus(
      account,
      `/api/v1/statuses/${statusId}/favourite`,
      { method: "POST" },
      "favourite post",
    );
  }

  unfavouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    return postAndParseStatus(
      account,
      `/api/v1/statuses/${statusId}/unfavourite`,
      { method: "POST" },
      "unfavourite post",
    );
  }

  followAccount(
    account: AccountCredentials,
    targetId: string,
    options?: FollowOptions,
  ): Promise<Relationship> {
    const body: Record<string, unknown> = {};
    if (options?.reblogs !== undefined) body.reblogs = options.reblogs;
    if (options?.notify !== undefined) body.notify = options.notify;
    if (options?.languages) body.languages = options.languages;
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/follow`,
      { method: "POST", body: Object.keys(body).length ? JSON.stringify(body) : undefined },
      "follow account",
    );
  }

  unfollowAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/unfollow`,
      { method: "POST" },
      "unfollow account",
    );
  }

  muteAccount(
    account: AccountCredentials,
    targetId: string,
    options?: MuteOptions,
  ): Promise<Relationship> {
    const body: Record<string, unknown> = {};
    if (options?.notifications !== undefined) body.notifications = options.notifications;
    if (options?.duration !== undefined) body.duration = options.duration;
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/mute`,
      { method: "POST", body: Object.keys(body).length ? JSON.stringify(body) : undefined },
      "mute account",
    );
  }

  unmuteAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/unmute`,
      { method: "POST" },
      "unmute account",
    );
  }

  blockAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/block`,
      { method: "POST" },
      "block account",
    );
  }

  unblockAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return postAndParseRelationship(
      account,
      `/api/v1/accounts/${targetId}/unblock`,
      { method: "POST" },
      "unblock account",
    );
  }

  async getRelationship(account: AccountCredentials, targetId: string): Promise<Relationship> {
    const results = await this.getRelationships(account, [targetId]);
    if (results.length === 0) throw new Error("No relationship data returned");
    return results[0];
  }

  async getRelationships(
    account: AccountCredentials,
    targetIds: string[],
  ): Promise<Relationship[]> {
    const params = new URLSearchParams();
    for (const id of targetIds) params.append("id[]", id);
    const response = await authenticatedFetch(account, `/api/v1/accounts/relationships?${params}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to get relationship: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(RelationshipSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async lookupAccount(account: AccountCredentials, acct: string): Promise<AccountLookup> {
    const response = await authenticatedFetch(
      account,
      `/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to lookup account: HTTP ${response.status} - ${errorText}`);
    }
    return await readJsonWithLimit<AccountLookup>(response, MAX_RESPONSE_SIZE);
  }

  async verifyCredentials(account: AccountCredentials): Promise<AccountInfo> {
    const response = await authenticatedFetch(account, "/api/v1/accounts/verify_credentials", {
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Failed to verify credentials: HTTP ${response.status}`);
    }
    return AccountInfoSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async uploadMedia(
    account: AccountCredentials,
    file: Buffer | Blob,
    options?: UploadMediaOptions,
  ): Promise<MediaAttachment> {
    const formData = new FormData();
    const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)]);
    formData.append("file", blob, options?.filename || "upload");
    if (options?.description) formData.append("description", options.description);
    if (options?.focus) formData.append("focus", `${options.focus.x},${options.focus.y}`);

    const url = `https://${account.instance}/api/v2/media`;
    // pinnedFetch resolves + validates + pins the connection's IP and re-pins
    // every redirect hop (closes the DNS-rebinding TOCTOU). The onHop callback
    // applies the operator blocklist on the initial URL and each redirect hop.
    const response = await pinnedFetch(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `${account.tokenType} ${account.accessToken}`,
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: formData,
      },
      (target) => instanceBlocklist.validateNotBlocked(new URL(target).hostname),
    );
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to upload media: HTTP ${response.status} - ${errorText}`);
    }
    return MediaAttachmentSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getHomeTimeline(account: AccountCredentials, options?: ListPageOptions): Promise<Status[]> {
    const { limit = 20, maxId, minId, sinceId } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    if (sinceId) params.set("since_id", sinceId);
    const response = await authenticatedFetch(account, `/api/v1/timelines/home?${params}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to get home timeline: HTTP ${response.status} - ${errorText}`);
    }
    return z.array(StatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
  }

  async getNotifications(
    account: AccountCredentials,
    options?: NotificationOptions,
  ): Promise<NotificationItem[]> {
    const { limit = 20, maxId, minId, types, excludeTypes } = options || {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (maxId) params.set("max_id", maxId);
    if (minId) params.set("min_id", minId);
    if (types) for (const t of types) params.append("types[]", t);
    if (excludeTypes) for (const t of excludeTypes) params.append("exclude_types[]", t);
    const response = await authenticatedFetch(account, `/api/v1/notifications?${params}`, {
      method: "GET",
    });
    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(`Failed to get notifications: HTTP ${response.status} - ${errorText}`);
    }
    return await readJsonWithLimit<NotificationItem[]>(response, MAX_RESPONSE_SIZE);
  }
}

export const mastodonWriteAdapter = new MastodonWriteAdapter();
