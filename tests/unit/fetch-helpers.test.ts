import { describe, expect, it } from "vitest";
import { ResponseTooLargeError, readJsonWithLimit } from "../../src/utils/fetch-helpers.js";

function makeResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

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
