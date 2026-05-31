/**
 * One-shot OAuth loopback callback server (RFC 8252 §7.3).
 *
 * Binds to 127.0.0.1 on an OS-assigned EPHEMERAL port (never a fixed/predictable
 * one, never 0.0.0.0) so a co-resident local process cannot pre-bind and steal
 * the authorization code / MiAuth session. Resolves only when /callback carries
 * the exact expected `state` (Mastodon) or `session` (Misskey), compared in
 * constant time; everything else gets a static 404 and does not resolve.
 */

import { timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";

const SUCCESS_PAGE =
  "<!doctype html><meta charset=utf-8><title>activitypub-mcp</title>" +
  '<body style="font-family:sans-serif;padding:2rem">' +
  "<h1>Authorized</h1><p>You can close this window and return to the terminal.</p>";

const FAILURE_PAGE =
  "<!doctype html><meta charset=utf-8><title>activitypub-mcp</title>" +
  '<body style="font-family:sans-serif;padding:2rem">' +
  "<h1>Authorization failed</h1><p>The login did not complete. " +
  "Return to the terminal for details.</p>";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface CallbackExpectation {
  state?: string;
  session?: string;
  timeoutMs?: number;
}

export interface LoopbackServer {
  /** http://127.0.0.1:<port>/callback */
  redirectUri: string;
  /** Resolves once with the callback query params, or rejects on timeout. */
  waitForCallback(expected: CallbackExpectation): Promise<URLSearchParams>;
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

export function createLoopbackServer(port = 0): Promise<LoopbackServer> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCb: ((params: URLSearchParams) => void) | null = null;
    let expectation: CallbackExpectation | null = null;
    let activeTimer: ReturnType<typeof setTimeout> | null = null;

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback" || !resolveCb || !expectation) {
        res.writeHead(404).end();
        return;
      }
      const params = url.searchParams;
      const okState = expectation.state
        ? safeEqual(params.get("state") ?? "", expectation.state)
        : true;
      const okSession = expectation.session
        ? safeEqual(params.get("session") ?? "", expectation.session)
        : true;
      if (!okState || !okSession) {
        res.writeHead(404).end();
        return;
      }
      // Only show the success page when the callback actually carries an
      // authorization result. A provider that redirects with ?error=... (user
      // clicked Deny) or omits the code/session must not be told "Authorized" —
      // that contradicts the failure the strategy is about to report. We still
      // resolve with the params so the strategy can surface the precise error.
      const authorized = !params.get("error") && (params.has("code") || params.has("session"));
      res
        .writeHead(authorized ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" })
        .end(authorized ? SUCCESS_PAGE : FAILURE_PAGE);
      const done = resolveCb;
      resolveCb = null;
      done(params);
    });

    server.on("error", rejectServer);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        rejectServer(new Error("Failed to bind loopback server"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${addr.port}/callback`;

      resolveServer({
        redirectUri,
        waitForCallback(expected) {
          if (!expected.state && !expected.session) {
            return Promise.reject(
              new Error("waitForCallback requires at least one of state or session"),
            );
          }
          if (resolveCb !== null) {
            return Promise.reject(new Error("waitForCallback is already pending"));
          }
          expectation = expected;
          return new Promise<URLSearchParams>((resolve, reject) => {
            const ms = expected.timeoutMs ?? DEFAULT_TIMEOUT_MS;
            const timer = setTimeout(() => {
              resolveCb = null;
              activeTimer = null;
              reject(new Error(`Authorization timed out after ${ms}ms`));
            }, ms);
            timer.unref(); // never keep the process alive waiting on a callback
            activeTimer = timer;
            resolveCb = (params) => {
              clearTimeout(timer);
              activeTimer = null;
              resolve(params);
            };
          });
        },
        close() {
          if (activeTimer) {
            clearTimeout(activeTimer);
            activeTimer = null;
          }
          resolveCb = null;
          server.close();
        },
      });
    });
  });
}
