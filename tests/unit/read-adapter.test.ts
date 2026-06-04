/**
 * The public read tools (search, trending, public timelines) used to hardcode
 * Mastodon REST endpoints, so they silently failed on Misskey/Foundkey instances
 * the project fully supports for writes. These tests pin the NodeInfo-routed read
 * adapter: the same instance domain must hit Mastodon endpoints when detected as
 * Mastodon and Misskey endpoints (with normalization) when detected as Misskey.
 */

import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteActivityPubClient } from "../../src/activitypub/remote-client.js";
import { clearNodeInfoCache } from "../../src/discovery/nodeinfo.js";
import { server } from "../mocks/server.js";

// resolveAndPin resolves fixture hosts via node:dns before fetching; pin them to
// a public IP so the pinned fetch is then intercepted by MSW (same pattern as
// remote-client.test.ts).
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

function nodeinfo(domain: string, softwareName: string) {
  return [
    http.get(`https://${domain}/.well-known/nodeinfo`, () =>
      HttpResponse.json({
        links: [
          {
            rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
            href: `https://${domain}/nodeinfo/2.0`,
          },
        ],
      }),
    ),
    http.get(`https://${domain}/nodeinfo/2.0`, () =>
      HttpResponse.json({
        version: "2.0",
        software: { name: softwareName, version: "1.0.0" },
        protocols: ["activitypub"],
      }),
    ),
  ];
}

const MASTO = "masto.social";
const MISSKEY = "misskey.test";

const misskeyNote = {
  id: "note1",
  createdAt: "2026-01-01T00:00:00Z",
  text: "hello from misskey",
  cw: null,
  visibility: "public",
  renoteCount: 4,
  repliesCount: 2,
  reactions: { "👍": 3, "🎉": 2 },
  user: {
    id: "u1",
    username: "alice",
    host: null,
    name: "Alice",
    url: "https://misskey.test/@alice",
  },
};

describe("read PlatformAdapter — NodeInfo routing", () => {
  let client: RemoteActivityPubClient;

  beforeEach(() => {
    clearNodeInfoCache();
    client = new RemoteActivityPubClient();
  });

  describe("Mastodon-detected instances use the Mastodon REST endpoints", () => {
    beforeEach(() => server.use(...nodeinfo(MASTO, "mastodon")));

    it("fetchTrendingHashtags hits /api/v1/trends/tags", async () => {
      server.use(
        http.get(`https://${MASTO}/api/v1/trends/tags`, () =>
          HttpResponse.json([
            {
              name: "art",
              url: `https://${MASTO}/tags/art`,
              history: [{ day: "1", uses: "5", accounts: "3" }],
            },
          ]),
        ),
      );
      const res = await client.fetchTrendingHashtags(MASTO, { limit: 5 });
      expect(res.hashtags).toHaveLength(1);
      expect(res.hashtags[0].name).toBe("art");
    });

    it("fetchTrendingPosts hits /api/v1/trends/statuses", async () => {
      server.use(
        http.get(`https://${MASTO}/api/v1/trends/statuses`, () =>
          HttpResponse.json([
            {
              id: "1",
              content: "trending",
              account: {
                username: "bob",
                acct: "bob",
                display_name: "Bob",
                url: `https://${MASTO}/@bob`,
              },
              created_at: "2026-01-01T00:00:00Z",
              reblogs_count: 9,
              favourites_count: 12,
              replies_count: 1,
              url: `https://${MASTO}/@bob/1`,
            },
          ]),
        ),
      );
      const res = await client.fetchTrendingPosts(MASTO, { limit: 5 });
      expect(res.posts[0].account.username).toBe("bob");
      expect(res.posts[0].favourites_count).toBe(12);
    });

    it("fetchLocalTimeline hits /api/v1/timelines/public?local=true", async () => {
      let sawLocal = false;
      server.use(
        http.get(`https://${MASTO}/api/v1/timelines/public`, ({ request }) => {
          sawLocal = new URL(request.url).searchParams.get("local") === "true";
          return HttpResponse.json([]);
        }),
      );
      await client.fetchLocalTimeline(MASTO, { limit: 5 });
      expect(sawLocal).toBe(true);
    });

    it("searchInstance hits /api/v2/search", async () => {
      server.use(
        http.get(`https://${MASTO}/api/v2/search`, () =>
          HttpResponse.json({
            accounts: [{ username: "carol", acct: "carol" }],
            statuses: [],
            hashtags: [],
          }),
        ),
      );
      const res = (await client.searchInstance(MASTO, "carol", "accounts")) as {
        accounts?: Array<{ acct: string }>;
      };
      expect(res.accounts?.[0].acct).toBe("carol");
    });
  });

  describe("Misskey-detected instances use the Misskey API with normalization", () => {
    beforeEach(() => server.use(...nodeinfo(MISSKEY, "misskey")));

    it("fetchTrendingHashtags hits /api/hashtags/trend and normalizes name+url", async () => {
      server.use(
        http.post(`https://${MISSKEY}/api/hashtags/trend`, () =>
          HttpResponse.json([{ tag: "art", chart: [3, 2, 1], usersCount: 6 }]),
        ),
      );
      const res = await client.fetchTrendingHashtags(MISSKEY, { limit: 5 });
      expect(res.hashtags[0].name).toBe("art");
      expect(res.hashtags[0].url).toBe(`https://${MISSKEY}/tags/art`);
      expect(Number.parseInt(res.hashtags[0].history?.[0]?.accounts ?? "", 10)).toBe(6);
    });

    it("fetchTrendingPosts hits /api/notes/featured and normalizes a note to a post", async () => {
      server.use(
        http.post(`https://${MISSKEY}/api/notes/featured`, () => HttpResponse.json([misskeyNote])),
      );
      const res = await client.fetchTrendingPosts(MISSKEY, { limit: 5 });
      expect(res.posts[0].content).toBe("hello from misskey");
      expect(res.posts[0].account.username).toBe("alice");
      expect(res.posts[0].reblogs_count).toBe(4); // renoteCount
      expect(res.posts[0].favourites_count).toBe(5); // summed reactions
    });

    it("fetchLocalTimeline hits /api/notes/local-timeline", async () => {
      let hit = false;
      server.use(
        http.post(`https://${MISSKEY}/api/notes/local-timeline`, () => {
          hit = true;
          return HttpResponse.json([misskeyNote]);
        }),
      );
      const res = await client.fetchLocalTimeline(MISSKEY, { limit: 5 });
      expect(hit).toBe(true);
      expect(res.posts[0].account.username).toBe("alice");
    });

    it("fetchFederatedTimeline hits /api/notes/global-timeline", async () => {
      let hit = false;
      server.use(
        http.post(`https://${MISSKEY}/api/notes/global-timeline`, () => {
          hit = true;
          return HttpResponse.json([misskeyNote]);
        }),
      );
      await client.fetchFederatedTimeline(MISSKEY, { limit: 5 });
      expect(hit).toBe(true);
    });

    it("searchInstance(accounts) hits /api/users/search and normalizes accounts", async () => {
      server.use(
        http.post(`https://${MISSKEY}/api/users/search`, () =>
          HttpResponse.json([
            {
              id: "u1",
              username: "dave",
              host: null,
              name: "Dave",
              followersCount: 10,
              notesCount: 3,
            },
          ]),
        ),
      );
      const res = (await client.searchInstance(MISSKEY, "dave", "accounts")) as {
        accounts?: Array<{ acct: string; followers_count?: number }>;
      };
      expect(res.accounts?.[0].acct).toBe("dave");
      expect(res.accounts?.[0].followers_count).toBe(10);
    });

    it("searchInstance(hashtags) hits /api/hashtags/search and normalizes tag strings", async () => {
      server.use(
        http.post(`https://${MISSKEY}/api/hashtags/search`, () =>
          HttpResponse.json(["art", "music"]),
        ),
      );
      const res = (await client.searchInstance(MISSKEY, "art", "hashtags")) as {
        hashtags?: Array<{ name: string }>;
      };
      expect(res.hashtags?.map((h) => h.name)).toEqual(["art", "music"]);
    });
  });
});
