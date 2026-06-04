/**
 * Platform read adapters for the PUBLIC (unauthenticated, instance-scoped) read
 * tools: search, trending hashtags/posts, and public timelines.
 *
 * These mirror the write-side adapter pattern: a ReadAdapter interface with a
 * Mastodon and a Misskey implementation, selected per instance by NodeInfo
 * software detection (resolveReadAdapter). Misskey's API diverges from Mastodon's
 * (POST bodies, notes-not-statuses, reactions-not-favourites), so Misskey
 * responses are normalized into the same Mastodon-shaped objects the formatters
 * already consume — making multi-platform reads real end-to-end instead of
 * silently failing on Misskey/Foundkey instances.
 *
 * All outbound requests go through guardedFetch (SSRF allow-list + operator
 * blocklist + IP-pinning + timeout + size cap), the same guarded path NodeInfo
 * discovery and the login flows use.
 */

import { detectSoftwareKind } from "../discovery/software-kind.js";
import { guardedFetch } from "../utils/fetch-helpers.js";

export interface NormalizedHashtag {
  name: string;
  url: string;
  history?: Array<{ day: string; uses: string; accounts: string }>;
}

export interface NormalizedPost {
  id: string;
  content: string;
  account: { username: string; acct: string; display_name?: string; url: string };
  created_at: string;
  reblogs_count: number;
  favourites_count: number;
  replies_count: number;
  url: string;
  spoiler_text?: string;
}

export interface PublicTimelineResult {
  posts: NormalizedPost[];
  hasMore: boolean;
  nextMaxId?: string;
}

export type SearchType = "accounts" | "statuses" | "hashtags";

export interface SearchResult {
  accounts?: Array<{
    username: string;
    acct: string;
    display_name?: string;
    note?: string;
    followers_count?: number;
    statuses_count?: number;
  }>;
  statuses?: NormalizedPost[];
  hashtags?: NormalizedHashtag[];
}

export interface TimelineOptions {
  limit?: number;
  maxId?: string;
  sinceId?: string;
  minId?: string;
}

export interface TrendingOptions {
  limit?: number;
  offset?: number;
}

export type TimelineScope = "local" | "federated";

export interface ReadAdapter {
  fetchTrendingHashtags(
    domain: string,
    options: TrendingOptions,
  ): Promise<{ hashtags: NormalizedHashtag[] }>;
  fetchTrendingPosts(
    domain: string,
    options: TrendingOptions,
  ): Promise<{ posts: NormalizedPost[] }>;
  fetchPublicTimeline(
    domain: string,
    scope: TimelineScope,
    options: TimelineOptions,
  ): Promise<PublicTimelineResult>;
  searchInstance(domain: string, query: string, type: SearchType): Promise<SearchResult>;
}

// =============================================================================
// Guarded HTTP helpers
// =============================================================================

async function getJson<T>(url: string): Promise<T> {
  const res = await guardedFetch<T>(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.data as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await guardedFetch<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.data as T;
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

// =============================================================================
// Mastodon read adapter (existing REST behaviour, lifted into the adapter)
// =============================================================================

export const mastodonReadAdapter: ReadAdapter = {
  async fetchTrendingHashtags(domain, { limit = 20, offset = 0 }) {
    const url = `https://${domain}/api/v1/trends/tags?limit=${limit}&offset=${offset}`;
    return { hashtags: asArray<NormalizedHashtag>(await getJson(url)) };
  },

  async fetchTrendingPosts(domain, { limit = 20, offset = 0 }) {
    const url = `https://${domain}/api/v1/trends/statuses?limit=${limit}&offset=${offset}`;
    return { posts: asArray<NormalizedPost>(await getJson(url)) };
  },

  async fetchPublicTimeline(domain, scope, { limit = 20, maxId, sinceId, minId }) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (scope === "local") params.set("local", "true");
    if (maxId) params.set("max_id", maxId);
    if (sinceId) params.set("since_id", sinceId);
    if (minId) params.set("min_id", minId);
    const url = `https://${domain}/api/v1/timelines/public?${params.toString()}`;
    const posts = asArray<NormalizedPost>(await getJson(url));
    return {
      posts,
      hasMore: posts.length === limit,
      nextMaxId: posts.length > 0 ? posts[posts.length - 1]?.id : undefined,
    };
  },

  async searchInstance(domain, query, type) {
    const url = `https://${domain}/api/v2/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`;
    return (await getJson<SearchResult>(url)) ?? {};
  },
};

// =============================================================================
// Misskey read adapter (Misskey/Foundkey API, normalized to Mastodon shapes)
// =============================================================================

interface MisskeyUser {
  id: string;
  username: string;
  host: string | null;
  name?: string | null;
  url?: string | null;
  uri?: string | null;
  followersCount?: number;
  notesCount?: number;
  description?: string | null;
}

interface MisskeyNote {
  id: string;
  createdAt: string;
  text: string | null;
  cw?: string | null;
  renoteCount?: number;
  repliesCount?: number;
  reactions?: Record<string, number>;
  uri?: string;
  url?: string;
  user: MisskeyUser;
}

interface MisskeyTrendTag {
  tag: string;
  chart?: number[];
  usersCount?: number;
}

function misskeyAccount(user: MisskeyUser, domain: string): NormalizedPost["account"] {
  const acct = user.host ? `${user.username}@${user.host}` : user.username;
  const base = user.host ? `https://${user.host}` : `https://${domain}`;
  return {
    username: user.username,
    acct,
    display_name: user.name ?? undefined,
    url: user.url ?? user.uri ?? `${base}/@${user.username}`,
  };
}

function misskeyNoteToPost(note: MisskeyNote, domain: string): NormalizedPost {
  const reactionsTotal = note.reactions
    ? Object.values(note.reactions).reduce((a, b) => a + b, 0)
    : 0;
  const fallbackUrl = `https://${domain}/notes/${note.id}`;
  return {
    id: note.id,
    content: note.text ?? "",
    account: misskeyAccount(note.user, domain),
    created_at: note.createdAt,
    reblogs_count: note.renoteCount ?? 0,
    favourites_count: reactionsTotal,
    replies_count: note.repliesCount ?? 0,
    url: note.url ?? note.uri ?? fallbackUrl,
    spoiler_text: note.cw ?? undefined,
  };
}

export const misskeyReadAdapter: ReadAdapter = {
  async fetchTrendingHashtags(domain, { limit = 20 }) {
    const tags = asArray<MisskeyTrendTag>(
      await postJson(`https://${domain}/api/hashtags/trend`, {}),
    );
    const hashtags: NormalizedHashtag[] = tags.slice(0, limit).map((t) => {
      // Misskey reports usersCount (and a usage chart) rather than Mastodon's
      // separate uses/accounts; surface usersCount in both so the formatter,
      // which reads history[0].uses/accounts, shows a meaningful count.
      const count = String(t.usersCount ?? t.chart?.[0] ?? 0);
      return {
        name: t.tag,
        url: `https://${domain}/tags/${encodeURIComponent(t.tag)}`,
        history: [{ day: "", uses: count, accounts: count }],
      };
    });
    return { hashtags };
  },

  async fetchTrendingPosts(domain, { limit = 20 }) {
    const notes = asArray<MisskeyNote>(
      await postJson(`https://${domain}/api/notes/featured`, { limit }),
    );
    return { posts: notes.map((n) => misskeyNoteToPost(n, domain)) };
  },

  async fetchPublicTimeline(domain, scope, { limit = 20, maxId, sinceId, minId }) {
    const endpoint = scope === "local" ? "local-timeline" : "global-timeline";
    const body: Record<string, unknown> = { limit };
    if (maxId) body.untilId = maxId;
    // Misskey has no max_id/min_id split for forward paging; sinceId (or minId)
    // both mean "newer than".
    if (sinceId ?? minId) body.sinceId = sinceId ?? minId;
    const notes = asArray<MisskeyNote>(
      await postJson(`https://${domain}/api/notes/${endpoint}`, body),
    );
    const posts = notes.map((n) => misskeyNoteToPost(n, domain));
    return {
      posts,
      hasMore: posts.length === limit,
      nextMaxId: notes.length > 0 ? notes[notes.length - 1]?.id : undefined,
    };
  },

  async searchInstance(domain, query, type) {
    if (type === "accounts") {
      const users = asArray<MisskeyUser>(
        await postJson(`https://${domain}/api/users/search`, { query, limit: 20 }),
      );
      return {
        accounts: users.map((u) => {
          const acct = u.host ? `${u.username}@${u.host}` : u.username;
          return {
            username: u.username,
            acct,
            display_name: u.name ?? undefined,
            note: u.description ?? undefined,
            followers_count: u.followersCount,
            statuses_count: u.notesCount,
          };
        }),
      };
    }
    if (type === "statuses") {
      const notes = asArray<MisskeyNote>(
        await postJson(`https://${domain}/api/notes/search`, { query, limit: 20 }),
      );
      return { statuses: notes.map((n) => misskeyNoteToPost(n, domain)) };
    }
    // hashtags: Misskey returns an array of tag-name strings.
    const tags = asArray<string>(
      await postJson(`https://${domain}/api/hashtags/search`, { query, limit: 20 }),
    );
    return {
      hashtags: tags.map((name) => ({
        name,
        url: `https://${domain}/tags/${encodeURIComponent(name)}`,
      })),
    };
  },
};

/**
 * Pick the read adapter for an instance from its detected software. Misskey-family
 * software uses the Misskey adapter; everything else (including Pleroma/Akkoma/
 * GoToSocial/Sharkey and detection failures) uses the Mastodon adapter.
 */
export async function resolveReadAdapter(domain: string): Promise<ReadAdapter> {
  const kind = await detectSoftwareKind(domain);
  return kind === "misskey" ? misskeyReadAdapter : mastodonReadAdapter;
}
