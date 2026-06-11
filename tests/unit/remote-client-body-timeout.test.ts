import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A hostile instance can send response HEADERS promptly, then trickle (or never
 * finish) the BODY. The request timeout must cover the body read, not just the
 * headers — otherwise readJsonWithLimit hangs forever with the AbortController
 * already disarmed, pinning the tool call (and its in-flight-dedup entry).
 *
 * We stub pinnedFetch to return a 200 whose body is a stream that yields nothing
 * until the request's AbortSignal fires (mirroring how undici aborts an in-flight
 * body read). With the timeout spanning the body read, the client must reject
 * with a timeout well within the test budget; if it only covers headers, the
 * read hangs and this test times out.
 */

// Small timeout + single attempt so the test resolves fast and doesn't retry.
vi.mock("../../src/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/config.js")>()),
  REQUEST_TIMEOUT: 120,
  MAX_RETRIES: 1,
}));

vi.mock("../../src/utils/fetch-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/fetch-helpers.js")>()),
  pinnedFetch: vi.fn(),
}));

import { RemoteActivityPubClient } from "../../src/activitypub/remote-client.js";
import { pinnedFetch } from "../../src/utils/fetch-helpers.js";

function stalledBodyResponse(signal: AbortSignal | null | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const abort = () =>
        controller.error(
          Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
        );
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      // Never enqueue: headers are "sent", the body stalls indefinitely.
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/activity+json" },
  });
}

describe("remote read timeout covers the response body, not just headers", () => {
  beforeEach(() => {
    vi.mocked(pinnedFetch).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aborts a stalled body read within the request timeout", async () => {
    vi.mocked(pinnedFetch).mockImplementation(async (_url: string, options: RequestInit) =>
      stalledBodyResponse(options.signal as AbortSignal | null | undefined),
    );

    const client = new RemoteActivityPubClient();
    const started = Date.now();

    await expect(client.fetchObject("https://example.social/objects/1")).rejects.toThrow(
      /timed out/i,
    );

    // Must reject around the 120ms timeout, not hang to the test deadline.
    expect(Date.now() - started).toBeLessThan(2000);
  }, 5000);
});
