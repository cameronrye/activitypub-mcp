/**
 * Misskey / Foundkey write adapter. Misskey's API diverges from Mastodon's
 * (reactions instead of favourites, renote instead of boost), so responses are
 * normalized into the shared Mastodon-shaped Status/Relationship/AccountInfo.
 *
 * Auth: Authorization: Bearer <token> (Misskey >= 12, Foundkey).
 * IDs are platform-scoped — a noteId/userId must come from the same instance.
 */

import { MAX_RESPONSE_SIZE, USER_AGENT } from "../../config.js";
import { UnsupportedOnPlatformError } from "../../utils/errors.js";
import {
  blocklistHop,
  pinnedFetch,
  readErrorText,
  readJsonWithLimit,
} from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import {
  type AccountInfo,
  type AccountLookup,
  authenticatedFetch,
  type CreatePostOptions,
  type CreatePostResult,
  type FollowOptions,
  type ListPageOptions,
  type MediaAttachment,
  type MuteOptions,
  type NotificationItem,
  type NotificationOptions,
  type PostVisibility,
  type Relationship,
  type Status,
  type UploadMediaOptions,
  type WriteAdapter,
} from "./write-adapter.js";

const DEFAULT_REACTION = "👍";

interface MisskeyUser {
  id: string;
  username: string;
  host: string | null;
  name?: string | null;
  url?: string | null;
  uri?: string | null;
  followersCount?: number;
  followingCount?: number;
  notesCount?: number;
  description?: string | null;
  avatarUrl?: string | null;
}

interface MisskeyNote {
  id: string;
  createdAt: string;
  text: string | null;
  cw?: string | null;
  visibility: "public" | "home" | "followers" | "specified";
  renoteCount?: number;
  repliesCount?: number;
  reactions?: Record<string, number>;
  uri?: string;
  url?: string;
  user: MisskeyUser;
}

interface MisskeyRelation {
  isFollowing?: boolean;
  isFollowed?: boolean;
  isBlocking?: boolean;
  isMuted?: boolean;
  hasPendingFollowRequestFromYou?: boolean;
}

interface MisskeyNotification {
  id: string;
  type: string;
  createdAt: string;
  user?: MisskeyUser;
  note?: MisskeyNote;
}

interface MisskeyDriveFile {
  id: string;
  type?: string;
  url?: string | null;
  thumbnailUrl?: string | null;
  comment?: string | null;
  blurhash?: string | null;
}

function mastodonToMisskeyVisibility(v?: PostVisibility): string {
  switch (v) {
    case "unlisted":
      return "home";
    case "private":
      return "followers";
    case "direct":
      return "specified";
    default:
      return "public";
  }
}

function misskeyToMastodonVisibility(v: string): PostVisibility {
  switch (v) {
    case "home":
      return "unlisted";
    case "followers":
      return "private";
    case "specified":
      return "direct";
    default:
      return "public";
  }
}

function userToAccount(user: MisskeyUser, instance: string): Status["account"] {
  const acct = user.host ? `${user.username}@${user.host}` : user.username;
  const base = user.host ? `https://${user.host}` : `https://${instance}`;
  return {
    id: user.id,
    username: user.username,
    acct,
    display_name: user.name ?? undefined,
    url: user.url ?? user.uri ?? `${base}/@${user.username}`,
  };
}

function noteToStatus(note: MisskeyNote, instance: string): Status {
  const reactionsTotal = note.reactions
    ? Object.values(note.reactions).reduce((a, b) => a + b, 0)
    : 0;
  const fallbackUrl = `https://${instance}/notes/${note.id}`;
  return {
    id: note.id,
    uri: note.uri ?? fallbackUrl,
    url: note.url ?? fallbackUrl,
    created_at: note.createdAt,
    content: note.text ?? "",
    visibility: misskeyToMastodonVisibility(note.visibility),
    sensitive: !!note.cw,
    spoiler_text: note.cw ?? "",
    reblogs_count: note.renoteCount ?? 0,
    favourites_count: reactionsTotal,
    replies_count: note.repliesCount ?? 0,
    account: userToAccount(note.user, instance),
  };
}

function relationToRelationship(userId: string, rel: MisskeyRelation | undefined): Relationship {
  return {
    id: userId,
    following: rel?.isFollowing ?? false,
    followed_by: rel?.isFollowed ?? false,
    blocking: rel?.isBlocking ?? false,
    blocked_by: false,
    muting: rel?.isMuted ?? false,
    muting_notifications: false,
    requested: rel?.hasPendingFollowRequestFromYou ?? false,
    domain_blocking: false,
    endorsed: false,
  };
}

/** POST a Misskey endpoint; throw with the Misskey error message on failure. */
async function misskeyFetch(
  account: AccountCredentials,
  endpoint: string,
  body: Record<string, unknown>,
  failVerb: string,
): Promise<Response> {
  const response = await authenticatedFetch(account, endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // Bound the attacker-influenceable error body (2KB) before it reaches the
    // thrown message / logs / tool output — same cap the Mastodon adapter uses.
    const errorText = await readErrorText(response);
    let message = `HTTP ${response.status}`;
    try {
      const data = JSON.parse(errorText) as { error?: { message?: string } };
      if (data?.error?.message) message = data.error.message;
    } catch {
      // body not JSON — fall back to the bounded raw text if present
      if (errorText) message = errorText;
    }
    throw new Error(`Failed to ${failVerb}: ${message}`);
  }
  return response;
}

/** POST and parse the JSON body. Use for endpoints that always return a body. */
async function misskeyPostJson<T>(
  account: AccountCredentials,
  endpoint: string,
  body: Record<string, unknown>,
  failVerb: string,
): Promise<T> {
  const response = await misskeyFetch(account, endpoint, body, failVerb);
  return readJsonWithLimit<T>(response, MAX_RESPONSE_SIZE);
}

/** POST and discard the body. Use for endpoints that return 204 / empty. */
async function misskeyPostVoid(
  account: AccountCredentials,
  endpoint: string,
  body: Record<string, unknown>,
  failVerb: string,
): Promise<void> {
  await misskeyFetch(account, endpoint, body, failVerb);
}

export class MisskeyWriteAdapter implements WriteAdapter {
  async createPost(
    account: AccountCredentials,
    options: CreatePostOptions,
  ): Promise<CreatePostResult> {
    // Misskey core has no scheduled-post API. Reject up front so a "schedule for
    // later" request can't silently publish immediately (a destructive surprise).
    if (options.scheduledAt) {
      throw new UnsupportedOnPlatformError("Scheduled posts", "Misskey");
    }
    const body: Record<string, unknown> = {
      text: options.content,
      visibility: mastodonToMisskeyVisibility(options.visibility),
    };
    if (options.spoilerText) body.cw = options.spoilerText;
    if (options.inReplyToId) body.replyId = options.inReplyToId;
    if (options.mediaIds?.length) body.fileIds = options.mediaIds;
    if (options.poll) {
      body.poll = {
        choices: options.poll.options,
        expiredAfter: options.poll.expiresIn * 1000,
        multiple: options.poll.multiple ?? false,
      };
    }
    const data = await misskeyPostJson<{ createdNote: MisskeyNote }>(
      account,
      "/api/notes/create",
      body,
      "create post",
    );
    return { kind: "published", status: noteToStatus(data.createdNote, account.instance) };
  }

  async deletePost(account: AccountCredentials, statusId: string): Promise<void> {
    await misskeyPostVoid(account, "/api/notes/delete", { noteId: statusId }, "delete post");
  }

  async boostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    const data = await misskeyPostJson<{ createdNote: MisskeyNote }>(
      account,
      "/api/notes/create",
      { renoteId: statusId },
      "boost post",
    );
    return noteToStatus(data.createdNote, account.instance);
  }

  async unboostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPostVoid(account, "/api/notes/unrenote", { noteId: statusId }, "unboost post");
    return this.showNoteAsStatus(account, statusId);
  }

  async favouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPostVoid(
      account,
      "/api/notes/reactions/create",
      { noteId: statusId, reaction: DEFAULT_REACTION },
      "favourite post",
    );
    return this.showNoteAsStatus(account, statusId);
  }

  async unfavouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPostVoid(
      account,
      "/api/notes/reactions/delete",
      { noteId: statusId },
      "unfavourite post",
    );
    return this.showNoteAsStatus(account, statusId);
  }

  /** Fetch a note and normalize it (used after reaction/renote ops that return 204). */
  private async showNoteAsStatus(account: AccountCredentials, noteId: string): Promise<Status> {
    const note = await misskeyPostJson<MisskeyNote>(
      account,
      "/api/notes/show",
      { noteId },
      "fetch note",
    );
    return noteToStatus(note, account.instance);
  }

  private async relation(account: AccountCredentials, userId: string): Promise<Relationship> {
    // Misskey's `users/relation` returns `oneOf: [object, array]`: a single
    // userId string is answered with the relation wrapped in a one-element array
    // (`getRelation(...).then(it => [it])`), not a bare object. Unwrap either
    // shape so the relationship fields aren't silently read off the array.
    const rel = await misskeyPostJson<MisskeyRelation | MisskeyRelation[]>(
      account,
      "/api/users/relation",
      { userId },
      "get relationship",
    );
    return relationToRelationship(userId, Array.isArray(rel) ? rel[0] : rel);
  }

  async followAccount(
    account: AccountCredentials,
    targetId: string,
    _options?: FollowOptions,
  ): Promise<Relationship> {
    await misskeyPostVoid(account, "/api/following/create", { userId: targetId }, "follow account");
    return this.relation(account, targetId);
  }

  async unfollowAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    await misskeyPostVoid(
      account,
      "/api/following/delete",
      { userId: targetId },
      "unfollow account",
    );
    return this.relation(account, targetId);
  }

  async muteAccount(
    account: AccountCredentials,
    targetId: string,
    _options?: MuteOptions,
  ): Promise<Relationship> {
    await misskeyPostVoid(account, "/api/mute/create", { userId: targetId }, "mute account");
    return this.relation(account, targetId);
  }

  async unmuteAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    await misskeyPostVoid(account, "/api/mute/delete", { userId: targetId }, "unmute account");
    return this.relation(account, targetId);
  }

  async blockAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    await misskeyPostVoid(account, "/api/blocking/create", { userId: targetId }, "block account");
    return this.relation(account, targetId);
  }

  async unblockAccount(account: AccountCredentials, targetId: string): Promise<Relationship> {
    await misskeyPostVoid(account, "/api/blocking/delete", { userId: targetId }, "unblock account");
    return this.relation(account, targetId);
  }

  getRelationship(account: AccountCredentials, targetId: string): Promise<Relationship> {
    return this.relation(account, targetId);
  }

  getRelationships(account: AccountCredentials, targetIds: string[]): Promise<Relationship[]> {
    return Promise.all(targetIds.map((id) => this.relation(account, id)));
  }

  async lookupAccount(account: AccountCredentials, acct: string): Promise<AccountLookup> {
    const trimmed = acct.startsWith("@") ? acct.slice(1) : acct;
    const [username, host] = trimmed.split("@");
    const body: Record<string, unknown> = { username };
    if (host) body.host = host;
    const user = await misskeyPostJson<MisskeyUser>(
      account,
      "/api/users/show",
      body,
      "lookup account",
    );
    const a = userToAccount(user, account.instance);
    return { id: a.id, username: a.username, acct: a.acct, url: a.url };
  }

  async verifyCredentials(account: AccountCredentials): Promise<AccountInfo> {
    const user = await misskeyPostJson<MisskeyUser>(account, "/api/i", {}, "verify credentials");
    const a = userToAccount(user, account.instance);
    return {
      id: a.id,
      username: a.username,
      acct: a.acct,
      display_name: a.display_name,
      note: user.description ?? undefined,
      url: a.url,
      avatar: user.avatarUrl ?? undefined,
      followers_count: user.followersCount ?? 0,
      following_count: user.followingCount ?? 0,
      statuses_count: user.notesCount ?? 0,
    };
  }

  async uploadMedia(
    account: AccountCredentials,
    file: Buffer | Blob,
    options?: UploadMediaOptions,
  ): Promise<MediaAttachment> {
    const formData = new FormData();
    const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)]);
    formData.append("file", blob, options?.filename || "upload");
    if (options?.filename) formData.append("name", options.filename);
    if (options?.description) formData.append("comment", options.description);

    // Bypass authenticatedFetch so FormData can set its own multipart boundary
    // (authenticatedFetch forces Content-Type: application/json). SSRF + blocklist
    // guards are applied here directly, mirroring the Mastodon adapter.
    const url = `https://${account.instance}/api/drive/files/create`;
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
      blocklistHop,
    );
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Failed to upload media: HTTP ${response.status} - ${text}`);
    }
    const f = await readJsonWithLimit<MisskeyDriveFile>(response, MAX_RESPONSE_SIZE);
    const mt = (f.type ?? "").split("/")[0];
    const type: MediaAttachment["type"] =
      mt === "image" || mt === "video" || mt === "audio" ? mt : "unknown";
    return {
      id: f.id,
      type,
      url: f.url ?? null,
      preview_url: f.thumbnailUrl ?? null,
      description: f.comment ?? null,
      blurhash: f.blurhash ?? null,
    };
  }

  async getHomeTimeline(account: AccountCredentials, options?: ListPageOptions): Promise<Status[]> {
    const body: Record<string, unknown> = { limit: options?.limit ?? 20 };
    if (options?.maxId) body.untilId = options.maxId;
    // Misskey has no min_id; Mastodon min_id and since_id both mean "newer than",
    // so map either to Misskey's sinceId (minId wins), matching getNotifications.
    if (options?.minId) body.sinceId = options.minId;
    else if (options?.sinceId) body.sinceId = options.sinceId;
    const notes = await misskeyPostJson<MisskeyNote[]>(
      account,
      "/api/notes/timeline",
      body,
      "get home timeline",
    );
    return notes.map((n) => noteToStatus(n, account.instance));
  }

  async getNotifications(
    account: AccountCredentials,
    options?: NotificationOptions,
  ): Promise<NotificationItem[]> {
    const body: Record<string, unknown> = { limit: options?.limit ?? 20 };
    if (options?.maxId) body.untilId = options.maxId;
    if (options?.minId) body.sinceId = options.minId;
    const items = await misskeyPostJson<MisskeyNotification[]>(
      account,
      "/api/i/notifications",
      body,
      "get notifications",
    );
    return items.map((n) => {
      const acc = n.user
        ? userToAccount(n.user, account.instance)
        : { id: "", username: "", acct: "", url: "" };
      return {
        id: n.id,
        type: n.type,
        created_at: n.createdAt,
        account: { id: acc.id, username: acc.username, acct: acc.acct },
        status: n.note ? noteToStatus(n.note, account.instance) : undefined,
      };
    });
  }
}

export const misskeyWriteAdapter = new MisskeyWriteAdapter();
