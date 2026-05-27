import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Constant-time string comparison.
 * Returns false (without throwing) when lengths differ.
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // timingSafeEqual throws on length mismatch; compare against a same-length
    // padding buffer to keep timing roughly constant, then return false.
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Check the `Authorization: Bearer <secret>` header against the configured
 * secret. Returns true on match; on miss, writes a 401 + WWW-Authenticate
 * response and returns false. The caller MUST stop processing if false.
 */
export function checkBearerAuth(
  req: IncomingMessage,
  res: ServerResponse,
  secret: string,
): boolean {
  const header = req.headers.authorization;
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  if (provided && safeEqual(provided, secret)) {
    return true;
  }

  res.setHeader("WWW-Authenticate", "Bearer");
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}
