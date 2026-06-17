/**
 * Output schemas (Zod raw shapes) for the default/read MCP tools.
 *
 * MCP `outputSchema` takes a Zod RAW SHAPE (a plain object of Zod fields, same
 * as `inputSchema`) — NOT a wrapped `z.object(...)`. The top-level
 * structuredContent the handler returns is always an object.
 *
 * When a tool declares an `outputSchema`, the SDK validates that every SUCCESS
 * return carries a `structuredContent` matching the schema (error returns skip
 * validation). Fields are `.optional()` generously so real, partially-populated
 * remote data always parses; the prose `content[0].text` stays the source of
 * truth for display and is never narrowed by these schemas.
 */

import { z } from "zod";

// --- Shared leaf shapes ---------------------------------------------------
// A single rendered post/status (timelines, bookmarks, favourites, thread, search).
export const PostItem = z.object({
  id: z.string().describe("Post/status ID"),
  url: z.string().optional().describe("Canonical URL of the post"),
  author: z.string().optional().describe("Author handle or display name"),
  content: z.string().describe("Plain-text/summarized post body"),
  contentWarning: z.string().optional().describe("Content warning / summary, if any"),
  type: z.string().optional().describe("ActivityPub object type (Note, Announce, …)"),
  createdAt: z.string().optional().describe("ISO timestamp"),
  replies: z.number().optional(),
  reblogs: z.number().optional(),
  favourites: z.number().optional(),
});

export const ActorSummary = z.object({
  id: z.string(),
  preferredUsername: z.string().optional(),
  name: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().optional(),
  inbox: z.string().optional(),
  outbox: z.string().optional(),
  followers: z.string().optional(),
  following: z.string().optional(),
});

// --- Per-tool raw shapes (ZodRawShape = bare objects) ---------------------

// discover-actor
export const discoverActorOutput = {
  actor: ActorSummary,
} as const;

// fetch-timeline, get-home-timeline, get-bookmarks, get-favourites,
// get-public-timeline, get-trending-posts
export const postListOutput = {
  posts: z.array(PostItem),
  nextCursor: z.string().optional().describe("Opaque cursor for the next page, if more results"),
  hasMore: z.boolean().optional(),
  source: z.string().optional().describe("Account/actor/instance the posts came from"),
} as const;

// get-post-thread
export const threadOutput = {
  ancestors: z.array(PostItem),
  post: PostItem,
  replies: z.array(PostItem),
} as const;

// search (multi-section)
export const searchOutput = {
  accounts: z.array(ActorSummary).optional(),
  statuses: z.array(PostItem).optional(),
  hashtags: z.array(z.object({ name: z.string(), url: z.string().optional() })).optional(),
} as const;

// get-instance-info
export const instanceInfoOutput = {
  domain: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  software: z.string().optional(),
  users: z.number().optional(),
  registrationsOpen: z.boolean().optional(),
} as const;

// discover-instances
export const instanceListOutput = {
  instances: z.array(
    z.object({
      domain: z.string(),
      software: z.string().optional(),
      users: z.number().optional(),
      description: z.string().optional(),
    }),
  ),
  hasMore: z.boolean().optional(),
} as const;

// get-trending-hashtags
export const trendingHashtagsOutput = {
  hashtags: z.array(
    z.object({
      name: z.string(),
      url: z.string().optional(),
      uses: z.number().optional(),
      accounts: z.number().optional(),
    }),
  ),
} as const;

// list-accounts
export const accountListOutput = {
  accounts: z.array(
    z.object({
      id: z.string(),
      username: z.string(),
      instance: z.string(),
      label: z.string().optional(),
      isActive: z.boolean(),
      scopes: z.array(z.string()),
    }),
  ),
  writeEnabled: z.boolean(),
  activeAccountId: z.string().optional(),
} as const;

// switch-account / verify-account
export const accountStatusOutput = {
  accountId: z.string().optional(),
  username: z.string().optional(),
  instance: z.string().optional(),
  active: z.boolean().optional(),
  verified: z.boolean().optional(),
} as const;

// get-notifications
export const notificationsOutput = {
  notifications: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      account: z.string().optional(),
      status: PostItem.optional(),
      createdAt: z.string().optional(),
    }),
  ),
} as const;

// get-relationship
export const relationshipOutput = {
  acct: z.string(),
  following: z.boolean().optional(),
  followedBy: z.boolean().optional(),
  blocking: z.boolean().optional(),
  muting: z.boolean().optional(),
  requested: z.boolean().optional(),
} as const;

// get-scheduled-posts
export const scheduledPostsOutput = {
  scheduledPosts: z.array(
    z.object({
      id: z.string(),
      scheduledAt: z.string(),
      text: z.string().optional(),
      visibility: z.string().optional(),
    }),
  ),
} as const;
