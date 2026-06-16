/**
 * Raw-ActivityPub read coverage across non-Mastodon/Misskey platforms.
 *
 * `discover-actor` (WebFinger -> actor) and `fetch-timeline` (actor -> outbox)
 * use plain ActivityPub, not the Mastodon/Misskey instance APIs, so they read
 * ANY conformant ActivityPub server. These tests pin that contract for Lemmy
 * (Group/community actors with Page posts), PeerTube (Person actors with Video
 * posts), and GoToSocial (Mastodon-compatible Person actors with Note posts).
 *
 * Each test drives the REAL RemoteActivityPubClient (WebFinger lookup + actor
 * fetch + outbox fetch + schema validation) and the REAL summarizeOutboxItem
 * renderer — so a regression that hardcoded the read path to Mastodon shapes
 * would fail here. The instance-API tools (search, trending, get-public-timeline)
 * remain Mastodon/Misskey-only by design and are not covered by this file.
 */

import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteActivityPubClient } from "../../src/activitypub/remote-client.js";
import { summarizeOutboxItem } from "../../src/mcp/tools.js";
import { server } from "../mocks/server.js";

// resolveAndPin resolves fixture hosts via node:dns before the (MSW-mocked)
// fetch and fails closed when a host doesn't resolve; pin every fixture host to a
// public IP so the pinned fetch is then intercepted by MSW. Same pattern as
// remote-client.test.ts / read-adapter.test.ts.
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

/**
 * Register a WebFinger -> actor -> outbox fixture chain for one platform.
 * `actorType` exercises the schema's `type: z.string()` (Person/Group/...).
 */
function platformFixture(opts: {
  domain: string;
  username: string;
  actorPath: string;
  actorType: string;
  outboxItems: unknown[];
}) {
  const { domain, username, actorPath, actorType, outboxItems } = opts;
  const actorUrl = `https://${domain}${actorPath}`;
  const outboxUrl = `${actorUrl}/outbox`;
  return [
    http.get(`https://${domain}/.well-known/webfinger`, () =>
      HttpResponse.json({
        subject: `acct:${username}@${domain}`,
        links: [{ rel: "self", type: "application/activity+json", href: actorUrl }],
      }),
    ),
    http.get(actorUrl, () =>
      HttpResponse.json({
        id: actorUrl,
        type: actorType,
        preferredUsername: username,
        inbox: `${actorUrl}/inbox`,
        outbox: outboxUrl,
      }),
    ),
    http.get(outboxUrl, () =>
      HttpResponse.json({
        id: outboxUrl,
        type: "OrderedCollection",
        totalItems: outboxItems.length,
        orderedItems: outboxItems,
      }),
    ),
  ];
}

describe("raw-ActivityPub read coverage (non-Mastodon/Misskey platforms)", () => {
  let client: RemoteActivityPubClient;

  beforeEach(() => {
    client = new RemoteActivityPubClient();
  });

  it("reads a Lemmy community: Group actor + Create(Page) outbox", async () => {
    server.use(
      ...platformFixture({
        domain: "lemmy.example",
        username: "technology",
        actorPath: "/c/technology",
        actorType: "Group",
        outboxItems: [
          {
            type: "Create",
            object: { type: "Page", name: "Headline", content: "a lemmy post body" },
          },
        ],
      }),
    );

    const actor = await client.fetchRemoteActor("technology@lemmy.example");
    expect(actor.type).toBe("Group");
    expect(actor.preferredUsername).toBe("technology");

    const timeline = await client.fetchActorOutboxPaginated("technology@lemmy.example");
    expect(timeline.items).toHaveLength(1);
    expect(summarizeOutboxItem(timeline.items[0]).content).toContain("a lemmy post body");
  });

  it("reads a PeerTube account: Person actor + Create(Video) outbox", async () => {
    server.use(
      ...platformFixture({
        domain: "peertube.example",
        username: "creator",
        actorPath: "/accounts/creator",
        actorType: "Person",
        outboxItems: [
          {
            type: "Create",
            object: { type: "Video", name: "My Video", content: "<p>video description</p>" },
          },
        ],
      }),
    );

    const actor = await client.fetchRemoteActor("creator@peertube.example");
    expect(actor.type).toBe("Person");

    const timeline = await client.fetchActorOutboxPaginated("creator@peertube.example");
    expect(timeline.items).toHaveLength(1);
    const summary = summarizeOutboxItem(timeline.items[0]);
    expect(summary.type).toBe("Video");
    expect(summary.content).toContain("video description");
  });

  it("reads a GoToSocial account: Person actor + Create(Note) outbox", async () => {
    server.use(
      ...platformFixture({
        domain: "gts.example",
        username: "alice",
        actorPath: "/users/alice",
        actorType: "Person",
        outboxItems: [
          {
            type: "Create",
            object: { type: "Note", content: "hello from gotosocial" },
          },
        ],
      }),
    );

    const actor = await client.fetchRemoteActor("alice@gts.example");
    expect(actor.type).toBe("Person");
    expect(actor.preferredUsername).toBe("alice");

    const timeline = await client.fetchActorOutboxPaginated("alice@gts.example");
    expect(timeline.items).toHaveLength(1);
    expect(summarizeOutboxItem(timeline.items[0]).content).toContain("hello from gotosocial");
  });
});
