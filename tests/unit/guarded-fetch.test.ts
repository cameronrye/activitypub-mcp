import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { guardedFetch } from "../../src/utils/fetch-helpers.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("guardedFetch", () => {
  it("performs a GET and parses JSON by default", async () => {
    server.use(http.get("https://x.test/thing", () => HttpResponse.json({ a: 1 })));
    const res = await guardedFetch<{ a: number }>("https://x.test/thing");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ a: 1 });
  });

  it("sends a form-encoded POST body and reads JSON", async () => {
    let contentType: string | null = null;
    let body = "";
    server.use(
      http.post("https://x.test/token", async ({ request }) => {
        contentType = request.headers.get("content-type");
        body = await request.text();
        return HttpResponse.json({ access_token: "t" });
      }),
    );
    const res = await guardedFetch<{ access_token: string }>("https://x.test/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: "c" }).toString(),
    });
    expect(contentType).toContain("application/x-www-form-urlencoded");
    expect(body).toContain("grant_type=authorization_code");
    expect(res.data?.access_token).toBe("t");
  });

  it("returns ok:false with parsed error body on 4xx", async () => {
    server.use(
      http.post("https://x.test/fail", () =>
        HttpResponse.json({ error: { message: "nope" } }, { status: 403 }),
      ),
    );
    const res = await guardedFetch<{ error: { message: string } }>("https://x.test/fail", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.data?.error.message).toBe("nope");
  });
});
