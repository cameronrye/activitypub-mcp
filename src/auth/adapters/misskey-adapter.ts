/**
 * Misskey / Foundkey write adapter. Misskey's API diverges from Mastodon's
 * (reactions instead of favourites, renote instead of boost), so responses are
 * normalized into the shared Mastodon-shaped Status/Relationship/AccountInfo.
 *
 * Auth: Authorization: Bearer <token> (Misskey >= 12, Foundkey).
 * IDs are platform-scoped — a noteId/userId must come from the same instance.
 */

import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import {
  authenticatedFetch,
  type CreatePostOptions,
  type PostVisibility,
  type Status,
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

/** POST a Misskey endpoint; throw with the Misskey error message on failure. */
async function misskeyPost<T = unknown>(
  account: AccountCredentials,
  endpoint: string,
  body: Record<string, unknown>,
  failVerb: string,
): Promise<T | undefined> {
  const response = await authenticatedFetch(account, endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await readJsonWithLimit<{ error?: { message?: string } }>(
        response,
        MAX_RESPONSE_SIZE,
      );
      if (data?.error?.message) message = data.error.message;
    } catch {
      // body not JSON — keep the HTTP status message
    }
    throw new Error(`Failed to ${failVerb}: ${message}`);
  }
  if (response.status === 204) return undefined;
  return (await readJsonWithLimit<T>(response, MAX_RESPONSE_SIZE)) as T;
}

export class MisskeyWriteAdapter implements WriteAdapter {
  async createPost(account: AccountCredentials, options: CreatePostOptions): Promise<Status> {
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
    const data = await misskeyPost<{ createdNote: MisskeyNote }>(
      account,
      "/api/notes/create",
      body,
      "create post",
    );
    return noteToStatus(data!.createdNote, account.instance);
  }

  async deletePost(account: AccountCredentials, statusId: string): Promise<void> {
    await misskeyPost(account, "/api/notes/delete", { noteId: statusId }, "delete post");
  }

  async boostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    const data = await misskeyPost<{ createdNote: MisskeyNote }>(
      account,
      "/api/notes/create",
      { renoteId: statusId },
      "boost post",
    );
    return noteToStatus(data!.createdNote, account.instance);
  }

  async unboostPost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPost(account, "/api/notes/unrenote", { noteId: statusId }, "unboost post");
    return this.showNoteAsStatus(account, statusId);
  }

  async favouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPost(
      account,
      "/api/notes/reactions/create",
      { noteId: statusId, reaction: DEFAULT_REACTION },
      "favourite post",
    );
    return this.showNoteAsStatus(account, statusId);
  }

  async unfavouritePost(account: AccountCredentials, statusId: string): Promise<Status> {
    await misskeyPost(
      account,
      "/api/notes/reactions/delete",
      { noteId: statusId },
      "unfavourite post",
    );
    return this.showNoteAsStatus(account, statusId);
  }

  /** Fetch a note and normalize it (used after reaction/renote ops that return 204). */
  private async showNoteAsStatus(account: AccountCredentials, noteId: string): Promise<Status> {
    const note = await misskeyPost<MisskeyNote>(
      account,
      "/api/notes/show",
      { noteId },
      "fetch note",
    );
    return noteToStatus(note!, account.instance);
  }

  // --- social / account / media / timeline ops added in Task 5 ---
  followAccount!: WriteAdapter["followAccount"];
  unfollowAccount!: WriteAdapter["unfollowAccount"];
  muteAccount!: WriteAdapter["muteAccount"];
  unmuteAccount!: WriteAdapter["unmuteAccount"];
  blockAccount!: WriteAdapter["blockAccount"];
  unblockAccount!: WriteAdapter["unblockAccount"];
  getRelationship!: WriteAdapter["getRelationship"];
  getRelationships!: WriteAdapter["getRelationships"];
  lookupAccount!: WriteAdapter["lookupAccount"];
  verifyCredentials!: WriteAdapter["verifyCredentials"];
  uploadMedia!: WriteAdapter["uploadMedia"];
  getHomeTimeline!: WriteAdapter["getHomeTimeline"];
  getNotifications!: WriteAdapter["getNotifications"];
}

export const misskeyWriteAdapter = new MisskeyWriteAdapter();
