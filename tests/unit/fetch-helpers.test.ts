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
});
