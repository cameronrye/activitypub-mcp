import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../mocks/server.js";

vi.mock("../../src/validation/url.js", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/discovery/nodeinfo.js", () => ({
  getInstanceSoftware: vi.fn().mockResolvedValue({
    domain: "mastodon.test",
    detection: "success",
    software: { name: "mastodon", version: "4.3.0" },
    protocols: ["activitypub"],
    openRegistrations: true,
  }),
}));
vi.mock("../../src/auth/login/loopback-server.js", () => ({
  createLoopbackServer: vi.fn().mockResolvedValue({
    redirectUri: "http://127.0.0.1:7777/callback",
    waitForCallback: vi.fn(async (exp: { state?: string }) => {
      const p = new URLSearchParams();
      p.set("code", "auth-code");
      if (exp.state) p.set("state", exp.state);
      return p;
    }),
    close: vi.fn(),
  }),
}));
vi.mock("../../src/auth/login/browser.js", () => ({
  openBrowser: vi.fn().mockResolvedValue(undefined),
}));

const SECRET_TOKEN = "SECRET-ACCESS-TOKEN-zzz";
const SECRET_CLIENT = "SECRET-CLIENT-SECRET-zzz";

describe("secret hygiene: a full login leaks no secrets to stdout/stderr", () => {
  const originalEnv = process.env;
  let captured: string;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.ACTIVITYPUB_CONFIG_DIR = join(mkdtempSync(join(tmpdir(), "apmcp-hy-")), "cfg");
    captured = "";
    const sink = ((chunk: string | Uint8Array) => {
      captured += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    vi.spyOn(process.stdout, "write").mockImplementation(sink);
    vi.spyOn(process.stderr, "write").mockImplementation(sink);

    // Register the Mastodon HTTP handlers on the global MSW server for this test.
    server.use(
      http.post("https://mastodon.test/api/v1/apps", () =>
        HttpResponse.json({ client_id: "cid", client_secret: SECRET_CLIENT }),
      ),
      http.post("https://mastodon.test/oauth/token", () =>
        HttpResponse.json({
          access_token: SECRET_TOKEN,
          token_type: "Bearer",
          scope: "read write follow",
        }),
      ),
      http.get("https://mastodon.test/api/v1/accounts/verify_credentials", () =>
        HttpResponse.json({
          id: "1",
          username: "alice",
          acct: "alice",
          url: "https://mastodon.test/@alice",
        }),
      ),
    );
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("prints the success line but no token / client secret / verifier", async () => {
    const { runLogin } = await import(/* @vite-ignore */ "../../src/cli/login.js");
    await runLogin(["mastodon.test"]);

    expect(captured).toContain("Authorized as @alice@mastodon.test");
    expect(captured).not.toContain(SECRET_TOKEN);
    expect(captured).not.toContain(SECRET_CLIENT);
    expect(captured).not.toContain("code_verifier");
  });
});
