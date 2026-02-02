/**
 * MSW (Mock Service Worker) handlers for HTTP mocking in tests.
 *
 * These handlers intercept HTTP requests during testing and return
 * mock responses, allowing us to test without hitting real servers.
 */

import { HttpResponse, http } from "msw";

// Mock WebFinger response
export const mockWebFingerResponse = {
  subject: "acct:testuser@example.social",
  aliases: ["https://example.social/@testuser", "https://example.social/users/testuser"],
  links: [
    {
      rel: "self",
      type: "application/activity+json",
      href: "https://example.social/users/testuser",
    },
    {
      rel: "http://webfinger.net/rel/profile-page",
      type: "text/html",
      href: "https://example.social/@testuser",
    },
  ],
};

// Mock ActivityPub Actor response
export const mockActorResponse = {
  "@context": ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"],
  id: "https://example.social/users/testuser",
  type: "Person",
  preferredUsername: "testuser",
  name: "Test User",
  summary: "<p>This is a test user for unit testing.</p>",
  url: "https://example.social/@testuser",
  inbox: "https://example.social/users/testuser/inbox",
  outbox: "https://example.social/users/testuser/outbox",
  followers: "https://example.social/users/testuser/followers",
  following: "https://example.social/users/testuser/following",
  publicKey: {
    id: "https://example.social/users/testuser#main-key",
    owner: "https://example.social/users/testuser",
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----",
  },
};

// Mock Outbox (timeline) response
export const mockOutboxResponse = {
  "@context": "https://www.w3.org/ns/activitystreams",
  id: "https://example.social/users/testuser/outbox",
  type: "OrderedCollection",
  totalItems: 42,
  first: "https://example.social/users/testuser/outbox?page=true",
  orderedItems: [
    {
      id: "https://example.social/users/testuser/statuses/1",
      type: "Note",
      content: "<p>Hello, this is a test post!</p>",
      published: "2024-01-15T10:00:00Z",
      attributedTo: "https://example.social/users/testuser",
    },
    {
      id: "https://example.social/users/testuser/statuses/2",
      type: "Note",
      content: "<p>Another test post for testing purposes.</p>",
      published: "2024-01-14T10:00:00Z",
      attributedTo: "https://example.social/users/testuser",
    },
  ],
};

// Mock Mastodon instance info response
export const mockInstanceInfoResponse = {
  domain: "example.social",
  title: "Example Social",
  version: "4.2.0",
  description: "A test instance for unit testing",
  languages: ["en"],
  registrations: true,
  approval_required: false,
  invites_enabled: true,
  stats: {
    user_count: 1000,
    status_count: 50000,
    domain_count: 5000,
  },
  contact_account: {
    id: "1",
    username: "admin",
    display_name: "Admin User",
  },
};

// Mock search results
export const mockSearchResponse = {
  accounts: [
    {
      id: "123",
      username: "testuser",
      display_name: "Test User",
      note: "A test user",
    },
  ],
  statuses: [],
  hashtags: [],
};

// Default handlers for common endpoints
export const handlers = [
  // WebFinger endpoint
  http.get("https://example.social/.well-known/webfinger", ({ request }) => {
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");

    if (resource === "acct:testuser@example.social") {
      return HttpResponse.json(mockWebFingerResponse);
    }

    if (resource === "acct:notfound@example.social") {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json(mockWebFingerResponse);
  }),

  // ActivityPub Actor endpoint
  http.get("https://example.social/users/testuser", () => {
    return HttpResponse.json(mockActorResponse, {
      headers: {
        "Content-Type": "application/activity+json",
      },
    });
  }),

  // Outbox endpoint
  http.get("https://example.social/users/testuser/outbox", () => {
    return HttpResponse.json(mockOutboxResponse, {
      headers: {
        "Content-Type": "application/activity+json",
      },
    });
  }),

  // Instance info endpoint (Mastodon API)
  http.get("https://example.social/api/v1/instance", () => {
    return HttpResponse.json(mockInstanceInfoResponse);
  }),

  // Misskey meta endpoint (returns 404 for Mastodon instances)
  http.get("https://example.social/api/meta", () => {
    return new HttpResponse(null, { status: 404 });
  }),

  // NodeInfo endpoint
  http.get("https://example.social/nodeinfo/2.0", () => {
    return HttpResponse.json({
      software: {
        name: "mastodon",
        version: "4.2.0",
      },
      metadata: {
        nodeDescription: "A test instance",
      },
    });
  }),

  // Search endpoint
  http.get("https://example.social/api/v2/search", () => {
    return HttpResponse.json(mockSearchResponse);
  }),

  // Health check endpoint (for connectivity tests)
  http.head("https://mastodon.social/.well-known/nodeinfo", () => {
    return new HttpResponse(null, { status: 200 });
  }),

  // Private IP test - should be blocked by SSRF protection
  http.get("http://localhost/*", () => {
    return new HttpResponse("Should not reach here", { status: 500 });
  }),

  // Error scenarios
  http.get("https://error.social/.well-known/webfinger", () => {
    return new HttpResponse(null, { status: 500 });
  }),

  http.get("https://timeout.social/.well-known/webfinger", async () => {
    // Simulate a slow response that will timeout
    await new Promise((resolve) => setTimeout(resolve, 15000));
    return HttpResponse.json(mockWebFingerResponse);
  }),
];
