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

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

// =============================================================================
// Mastodon read adapter (existing REST behaviour, lifted into the adapter)
// =============================================================================

const SEARCH_LIMIT = 20;

/**
 * Validate + normalize ONE untrusted Mastodon status. A hostile or non-conformant
 * server (the default adapter for ALL detection failures) controls this JSON, so
 * we drop records lacking a string id or an attributable author rather than
 * surfacing authorless attacker content, and coerce every count through toCount.
 * Returns null for a record that should be dropped.
 */
function normalizeMastodonPost(raw: unknown, domain: string): NormalizedPost | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const account = isRecord(raw.account) ? raw.account : undefined;
  if (!account || typeof account.username !== "string") return null;
  return {
    id: raw.id,
    content: typeof raw.content === "string" ? raw.content : "",
    account: {
      username: account.username,
      acct: typeof account.acct === "string" ? account.acct : account.username,
      display_name: typeof account.display_name === "string" ? account.display_name : undefined,
      url: typeof account.url === "string" ? account.url : `https://${domain}`,
    },
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    reblogs_count: toCount(raw.reblogs_count),
    favourites_count: toCount(raw.favourites_count),
    replies_count: toCount(raw.replies_count),
    url: typeof raw.url === "string" ? raw.url : `https://${domain}/@${account.username}/${raw.id}`,
    spoiler_text: typeof raw.spoiler_text === "string" ? raw.spoiler_text : undefined,
  };
}

/** Normalize a batch of untrusted statuses, dropping malformed records and
 * capping the result so a server that ignores `limit` can't flood the model. */
function normalizeMastodonPosts(data: unknown, domain: string, limit: number): NormalizedPost[] {
  const out: NormalizedPost[] = [];
  for (const raw of asArray<unknown>(data)) {
    const post = normalizeMastodonPost(raw, domain);
    if (post) out.push(post);
    if (out.length >= limit) break;
  }
  return out;
}

/** Validate + normalize untrusted Mastodon trend tags, dropping malformed
 * records and capping the result. */
function normalizeMastodonHashtags(
  data: unknown,
  domain: string,
  limit: number,
): NormalizedHashtag[] {
  const out: NormalizedHashtag[] = [];
  for (const raw of asArray<unknown>(data)) {
    if (!isRecord(raw) || typeof raw.name !== "string") continue;
    out.push({
      name: raw.name,
      url:
        typeof raw.url === "string"
          ? raw.url
          : `https://${domain}/tags/${encodeURIComponent(raw.name)}`,
      history: Array.isArray(raw.history)
        ? (raw.history as NormalizedHashtag["history"])
        : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export const mastodonReadAdapter: ReadAdapter = {
  async fetchTrendingHashtags(domain, { limit = 20, offset = 0 }) {
    const url = `https://${domain}/api/v1/trends/tags?limit=${limit}&offset=${offset}`;
    return { hashtags: normalizeMastodonHashtags(await getJson(url), domain, limit) };
  },

  async fetchTrendingPosts(domain, { limit = 20, offset = 0 }) {
    const url = `https://${domain}/api/v1/trends/statuses?limit=${limit}&offset=${offset}`;
    return { posts: normalizeMastodonPosts(await getJson(url), domain, limit) };
  },

  async fetchPublicTimeline(domain, scope, { limit = 20, maxId, sinceId, minId }) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (scope === "local") params.set("local", "true");
    if (maxId) params.set("max_id", maxId);
    if (sinceId) params.set("since_id", sinceId);
    if (minId) params.set("min_id", minId);
    const url = `https://${domain}/api/v1/timelines/public?${params.toString()}`;
    const raw = asArray<unknown>(await getJson(url));
    const posts = normalizeMastodonPosts(raw, domain, limit);
    // Derive the cursor from the last RAW item (the true oldest item the server
    // returned), not the last surviving post. If a trailing record was dropped
    // by normalization, a cursor taken from the last survivor would be newer
    // than the page boundary and re-fetch the dropped item's range next page.
    const lastRaw = raw[raw.length - 1];
    const lastRawId = isRecord(lastRaw) && typeof lastRaw.id === "string" ? lastRaw.id : undefined;
    return {
      posts,
      // "more" reflects whether the server returned a full page, not how many
      // survived normalization.
      hasMore: raw.length >= limit,
      nextMaxId: lastRawId ?? (posts.length > 0 ? posts[posts.length - 1]?.id : undefined),
    };
  },

  async searchInstance(domain, query, type) {
    const url = `https://${domain}/api/v2/search?q=${encodeURIComponent(query)}&type=${type}&limit=${SEARCH_LIMIT}`;
    const raw = await getJson<unknown>(url);
    if (!isRecord(raw)) return {};
    const result: SearchResult = {};
    if (Array.isArray(raw.accounts)) {
      result.accounts = raw.accounts
        .filter(isRecord)
        .filter((a) => typeof a.username === "string")
        .slice(0, SEARCH_LIMIT)
        .map((a) => ({
          username: a.username as string,
          acct: typeof a.acct === "string" ? a.acct : (a.username as string),
          display_name: typeof a.display_name === "string" ? a.display_name : undefined,
          note: typeof a.note === "string" ? a.note : undefined,
          followers_count: typeof a.followers_count === "number" ? a.followers_count : undefined,
          statuses_count: typeof a.statuses_count === "number" ? a.statuses_count : undefined,
        }));
    }
    if (Array.isArray(raw.statuses)) {
      result.statuses = normalizeMastodonPosts(raw.statuses, domain, SEARCH_LIMIT);
    }
    if (Array.isArray(raw.hashtags)) {
      result.hashtags = normalizeMastodonHashtags(raw.hashtags, domain, SEARCH_LIMIT);
    }
    return result;
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

/**
 * Coerce an untrusted remote count to a finite, non-negative integer. Remote
 * JSON is typed `number` but a hostile/buggy instance can send a string, null,
 * or object; without this, summing reaction counts can string-concatenate
 * ("0"+"5"->"05") or produce NaN, and that value is shown to the model as a
 * numeric count.
 */
function toCount(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function misskeyAccount(
  user: MisskeyUser | null | undefined,
  domain: string,
): NormalizedPost["account"] {
  // A hostile/non-conformant instance can omit user; don't let that throw and
  // poison the whole batch.
  if (!user || typeof user.username !== "string") {
    return { username: "unknown", acct: "unknown", url: `https://${domain}` };
  }
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
  const reactionsTotal =
    note.reactions && typeof note.reactions === "object"
      ? Object.values(note.reactions).reduce((a: number, b) => a + toCount(b), 0)
      : 0;
  const fallbackUrl = `https://${domain}/notes/${note.id}`;
  return {
    id: note.id,
    content: note.text ?? "",
    account: misskeyAccount(note.user, domain),
    created_at: note.createdAt,
    reblogs_count: toCount(note.renoteCount),
    favourites_count: reactionsTotal,
    replies_count: toCount(note.repliesCount),
    url: note.url ?? note.uri ?? fallbackUrl,
    spoiler_text: note.cw ?? undefined,
  };
}

/**
 * Normalize a batch of remote notes, dropping (rather than throwing on) any
 * single malformed item so one bad record can't fail the entire timeline/
 * trending/search read.
 */
function normalizeNotes(notes: MisskeyNote[], domain: string): NormalizedPost[] {
  const out: NormalizedPost[] = [];
  for (const note of notes) {
    try {
      // Drop structurally-malformed records (no id, or no attributable author)
      // rather than surfacing authorless attacker content to the model.
      if (
        !note ||
        typeof note.id !== "string" ||
        !note.user ||
        typeof note.user.username !== "string"
      ) {
        continue;
      }
      out.push(misskeyNoteToPost(note, domain));
    } catch {
      // skip any other malformed item rather than poisoning the whole batch
    }
  }
  return out;
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
    // Enforce the cap defensively: a server that ignores `limit` can't flood the
    // model with attacker-influenced notes.
    return { posts: normalizeNotes(notes, domain).slice(0, limit) };
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
    const posts = normalizeNotes(notes, domain).slice(0, limit);
    return {
      posts,
      // "more" reflects whether the server returned a full page, not how many
      // survived normalization.
      hasMore: notes.length >= limit,
      nextMaxId: notes.length > 0 ? notes[notes.length - 1]?.id : undefined,
    };
  },

  async searchInstance(domain, query, type) {
    if (type === "accounts") {
      const users = asArray<MisskeyUser>(
        await postJson(`https://${domain}/api/users/search`, { query, limit: 20 }),
      );
      return {
        // Drop records without a usable username (mirrors the Mastodon accounts
        // path and normalizeNotes) so a hostile instance can't surface an
        // authorless "undefined@host" handle to the model.
        accounts: users
          .filter((u) => typeof u.username === "string")
          .map((u) => {
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
      return { statuses: normalizeNotes(notes, domain) };
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
