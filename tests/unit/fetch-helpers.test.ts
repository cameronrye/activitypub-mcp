import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  fetchWithRedirectGuard,
  ResponseTooLargeError,
  readErrorText,
  readJsonWithLimit,
} from "../../src/utils/fetch-helpers.js";
import { server } from "../mocks/server.js";

function makeResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("readErrorText", () => {
  it("returns a short error body verbatim", async () => {
    const res = new Response("nope", { status: 500 });
    expect(await readErrorText(res, 2048)).toBe("nope");
  });

  it("caps a hostile/large error body and marks it truncated", async () => {
    const huge = "x".repeat(100_000);
    const res = new Response(huge, { status: 500 });
    const out = await readErrorText(res, 256);
    expect(out.length).toBeLessThan(huge.length);
    expect(out.length).toBeLessThanOrEqual(256 + 20);
    expect(out).toContain("truncated");
  });

  it("never throws — returns empty string on a body that errors", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("boom"));
      },
    });
    const res = new Response(stream, { status: 500 });
    expect(await readErrorText(res)).toBe("");
  });
});

describe("readJsonWithLimit (M2)", () => {
  it("returns parsed JSON when body is under the limit", async () => {
    const payload = { hello: "world" };
    const res = makeResponse(JSON.stringify(payload));
    const out = await readJsonWithLimit<typeof payload>(res, 1024);
    expect(out).toEqual(payload);
  });

  it("throws ResponseTooLargeError when Content-Length exceeds limit", async () => {
    const body = JSON.stringify({ data: "x".repeat(200) });
    const res = makeResponse(body, { "Content-Length": String(body.length) });
    await expect(readJsonWithLimit(res, 50)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("throws ResponseTooLargeError when streamed bytes exceed limit even without Content-Length", async () => {
    // Construct a Response from a ReadableStream so Content-Length is unknown
    const big = "x".repeat(200);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const res = new Response(stream, { headers: { "Content-Type": "application/json" } });
    await expect(readJsonWithLimit(res, 50)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("propagates JSON parse errors", async () => {
    const res = makeResponse("not valid json");
    await expect(readJsonWithLimit(res, 1024)).rejects.toThrow(/JSON/i);
  });

  it("throws when multi-byte UTF-8 body exceeds byte limit in null-body fallback", async () => {
    // Build a payload of 50 CJK characters — each is 3 UTF-8 bytes → 150 bytes total,
    // well above a 100-byte cap, but String.length would only report 50.
    const cjk50 = "日".repeat(50); // 50 chars, 150 UTF-8 bytes
    const payload = JSON.stringify({ v: cjk50 });
    const res = makeResponse(payload);
    // Force the null-body fallback path
    Object.defineProperty(res, "body", { value: null, writable: false });
    await expect(readJsonWithLimit(res, 100)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});

describe("fetchWithRedirectGuard", () => {
  it("follows a same-origin 302 after re-running validate", async () => {
    const seen: string[] = [];
    server.use(
      http.get("https://redir.example/start", () => {
        return new HttpResponse(null, {
          status: 302,
          headers: { Location: "https://redir.example/landing" },
        });
      }),
      http.get("https://redir.example/landing", () => {
        return HttpResponse.json({ ok: true });
      }),
    );

    const response = await fetchWithRedirectGuard(
      "https://redir.example/start",
      {},
      async (target) => {
        seen.push(target);
      },
    );
    expect(response.status).toBe(200);
    expect(seen).toEqual(["https://redir.example/landing"]);
  });

  it("throws when validate rejects the redirect target", async () => {
    server.use(
      http.get("https://safe.example/start", () => {
        return new HttpResponse(null, {
          status: 302,
          // Hostile redirect target — the validator below should refuse.
          headers: { Location: "http://192.168.1.1/admin" },
        });
      }),
    );

    await expect(
      fetchWithRedirectGuard("https://safe.example/start", {}, async (target) => {
        if (target.includes("192.168.")) {
          throw new Error(`refused redirect to ${target}`);
        }
      }),
    ).rejects.toThrow(/refused redirect/);
  });

  it("throws on missing Location header", async () => {
    server.use(
      http.get("https://noloc.example/", () => {
        return new HttpResponse(null, { status: 302 });
      }),
    );
    await expect(fetchWithRedirectGuard("https://noloc.example/", {}, () => {})).rejects.toThrow(
      /missing Location/,
    );
  });

  it("caps redirect chain length", async () => {
    server.use(
      http.get("https://chain.example/", ({ request }) => {
        const next = new URL(request.url);
        const hop = Number.parseInt(next.searchParams.get("hop") ?? "0", 10);
        next.searchParams.set("hop", String(hop + 1));
        return new HttpResponse(null, {
          status: 302,
          headers: { Location: next.toString() },
        });
      }),
    );
    await expect(fetchWithRedirectGuard("https://chain.example/", {}, () => {}, 2)).rejects.toThrow(
      /Too many redirects/,
    );
  });
});
