/**
 * Unit coverage for RemoteActivityPubClient's URL-conversion and batch-fetch
 * methods. These were previously exercised only by the gated live-integration
 * suite (skipped in normal CI), so their parsing and partial-failure behaviour
 * went unverified on every PR.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteActivityPubClient } from "../../src/activitypub/remote-client.js";

// Pin fixture hosts to a public IP so SSRF resolution passes and MSW (shared
// server in tests/setup.ts) intercepts the fetch (same pattern as
// remote-client.test.ts). Only the batch tests touch the network.
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

describe("RemoteActivityPubClient URL conversion", () => {
  let client: RemoteActivityPubClient;
  beforeEach(() => {
    client = new RemoteActivityPubClient();
  });

  describe("convertActivityPubToWebUrl (pure)", () => {
    it("maps a /users/<name> actor URI to the @-handle web URL", () => {
      expect(client.convertActivityPubToWebUrl("https://example.social/users/bob")).toEqual({
        webUrl: "https://example.social/@bob",
        type: "actor",
        domain: "example.social",
      });
    });

    it("maps a /users/<name>/statuses/<id> URI to the web post URL", () => {
      expect(
        client.convertActivityPubToWebUrl("https://example.social/users/bob/statuses/123"),
      ).toEqual({
        webUrl: "https://example.social/@bob/123",
        type: "post",
        domain: "example.social",
      });
    });

    it("maps a Pleroma /objects/<uuid> URI to the /notice/ web URL", () => {
      const r = client.convertActivityPubToWebUrl("https://example.social/objects/abc-uuid");
      expect(r).toEqual({
        webUrl: "https://example.social/notice/abc-uuid",
        type: "post",
        domain: "example.social",
      });
    });

    it("returns type 'unknown' and the original URI for an unrecognized path", () => {
      const r = client.convertActivityPubToWebUrl("https://example.social/something/else");
      expect(r.type).toBe("unknown");
      expect(r.webUrl).toBe("https://example.social/something/else");
    });
  });

  describe("convertWebUrlToActivityPub (already-ActivityPub paths need no network)", () => {
    it("classifies an existing /users/.../statuses/... URL as a post", async () => {
      const r = await client.convertWebUrlToActivityPub(
        "https://example.social/users/bob/statuses/123",
      );
      expect(r).toEqual({
        activityPubUri: "https://example.social/users/bob/statuses/123",
        type: "post",
        domain: "example.social",
      });
    });

    it("classifies a bare /users/<name> URL as an actor", async () => {
      const r = await client.convertWebUrlToActivityPub("https://example.social/users/bob");
      expect(r.type).toBe("actor");
      expect(r.domain).toBe("example.social");
    });
  });
});

describe("RemoteActivityPubClient batch fetching", () => {
  let client: RemoteActivityPubClient;
  beforeEach(() => {
    client = new RemoteActivityPubClient();
  });
  afterEach(() => vi.clearAllMocks());

  it("records per-item success and failure without aborting (continueOnError)", async () => {
    // testuser@example.social resolves (mocked in tests/mocks/handlers.ts);
    // notfound@example.social returns a 404 from the webfinger handler.
    const result = await client.batchFetchActors([
      "testuser@example.social",
      "notfound@example.social",
    ]);

    expect(result.successful).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(2);

    const ok = result.results.find((r) => r.identifier === "testuser@example.social");
    const bad = result.results.find((r) => r.identifier === "notfound@example.social");
    expect(ok?.actor).toBeDefined();
    expect(bad?.error).toBeTruthy();
    expect(bad?.actor).toBeUndefined();
  });
});
