/**
 * Tests for the default-tool output schemas.
 *
 * Each schema is a Zod RAW SHAPE (the form MCP `outputSchema` expects). We wrap
 * it in `z.object(...)` to exercise parsing: a valid object must pass, and an
 * object missing a required field must fail. This guards the schema contract the
 * SDK enforces against `structuredContent` at runtime.
 */

import { describe, expect, it } from "vitest";
import { type ZodRawShape, z } from "zod";
import {
  accountListOutput,
  accountStatusOutput,
  discoverActorOutput,
  instanceInfoOutput,
  instanceListOutput,
  notificationsOutput,
  postListOutput,
  relationshipOutput,
  scheduledPostsOutput,
  searchOutput,
  threadOutput,
  trendingHashtagsOutput,
} from "../../src/mcp/output-schemas.js";

const parse = (shape: ZodRawShape, value: unknown) => z.object(shape).parse(value);
const fails = (shape: ZodRawShape, value: unknown) => () => z.object(shape).parse(value);

describe("output schemas", () => {
  it("discoverActorOutput accepts a valid actor and rejects a missing actor id", () => {
    expect(parse(discoverActorOutput, { actor: { id: "https://x/users/a" } })).toBeDefined();
    expect(fails(discoverActorOutput, { actor: {} })).toThrow();
  });

  it("postListOutput accepts a post list (incl. empty) and rejects a post missing id", () => {
    expect(parse(postListOutput, { posts: [] })).toBeDefined();
    expect(parse(postListOutput, { posts: [{ id: "1", content: "hi" }] })).toBeDefined();
    expect(fails(postListOutput, { posts: [{ content: "hi" }] })).toThrow();
  });

  it("threadOutput accepts a thread and rejects a missing main post", () => {
    expect(
      parse(threadOutput, {
        ancestors: [],
        post: { id: "1", content: "main" },
        replies: [],
      }),
    ).toBeDefined();
    expect(fails(threadOutput, { ancestors: [], replies: [] })).toThrow();
  });

  it("searchOutput accepts partial sections and rejects a malformed account", () => {
    expect(parse(searchOutput, {})).toBeDefined();
    expect(parse(searchOutput, { accounts: [{ id: "1" }], statuses: [] })).toBeDefined();
    expect(fails(searchOutput, { accounts: [{ preferredUsername: "x" }] })).toThrow();
  });

  it("instanceInfoOutput accepts a domain and rejects a missing domain", () => {
    expect(parse(instanceInfoOutput, { domain: "x.social" })).toBeDefined();
    expect(fails(instanceInfoOutput, { title: "no domain" })).toThrow();
  });

  it("instanceListOutput accepts instances and rejects a missing domain", () => {
    expect(parse(instanceListOutput, { instances: [{ domain: "x.social" }] })).toBeDefined();
    expect(fails(instanceListOutput, { instances: [{ software: "mastodon" }] })).toThrow();
  });

  it("trendingHashtagsOutput accepts hashtags and rejects a missing name", () => {
    expect(parse(trendingHashtagsOutput, { hashtags: [{ name: "tag" }] })).toBeDefined();
    expect(fails(trendingHashtagsOutput, { hashtags: [{ uses: 1 }] })).toThrow();
  });

  it("accountListOutput accepts accounts and rejects a missing writeEnabled", () => {
    expect(
      parse(accountListOutput, {
        accounts: [
          { id: "1", username: "u", instance: "x.social", isActive: true, scopes: ["read"] },
        ],
        writeEnabled: true,
      }),
    ).toBeDefined();
    expect(parse(accountListOutput, { accounts: [], writeEnabled: false })).toBeDefined();
    expect(fails(accountListOutput, { accounts: [] })).toThrow();
  });

  it("accountStatusOutput accepts a status object (all optional)", () => {
    expect(parse(accountStatusOutput, { accountId: "1", active: true })).toBeDefined();
    expect(parse(accountStatusOutput, {})).toBeDefined();
  });

  it("notificationsOutput accepts notifications and rejects one missing type", () => {
    expect(
      parse(notificationsOutput, { notifications: [{ id: "1", type: "mention" }] }),
    ).toBeDefined();
    expect(parse(notificationsOutput, { notifications: [] })).toBeDefined();
    expect(fails(notificationsOutput, { notifications: [{ id: "1" }] })).toThrow();
  });

  it("relationshipOutput accepts an acct and rejects a missing acct", () => {
    expect(parse(relationshipOutput, { acct: "u@x.social", following: true })).toBeDefined();
    expect(fails(relationshipOutput, { following: true })).toThrow();
  });

  it("scheduledPostsOutput accepts scheduled posts and rejects a missing scheduledAt", () => {
    expect(
      parse(scheduledPostsOutput, {
        scheduledPosts: [{ id: "1", scheduledAt: "2099-01-01T00:00:00Z" }],
      }),
    ).toBeDefined();
    expect(parse(scheduledPostsOutput, { scheduledPosts: [] })).toBeDefined();
    expect(fails(scheduledPostsOutput, { scheduledPosts: [{ id: "1" }] })).toThrow();
  });
});
