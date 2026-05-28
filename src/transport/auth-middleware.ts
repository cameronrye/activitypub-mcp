import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Constant-time string comparison used for Bearer secret verification.
 *
 * Called once per inbound HTTP request to `/mcp` and `/metrics` to compare
 * the provided token against `MCP_HTTP_SECRET`.
 *
 * **Guarantee:** The byte-by-byte comparison itself runs in constant time via
 * `crypto.timingSafeEqual`, so an attacker cannot distinguish a wrong token
 * from a right one by measuring how long the comparison takes — as long as the
 * two buffers have the same length.
 *
 * **Known limitation:** When the lengths differ, this function allocates a
 * padding buffer (`Buffer.alloc(aBuf.length)`) and compares it against `aBuf`
 * before returning `false`. That allocation and the branch that chooses it are
 * both length-proportional, so an attacker who can measure allocation cost or
 * branch timing can infer whether the supplied token's byte-length matches the
 * configured secret's byte-length. In practice this risk is negligible when
 * `MCP_HTTP_SECRET` is a fixed-length value set at deploy time (≥ 16 random
 * chars), because the secret length is effectively public knowledge.
 *
 * **If stronger guarantees are needed** (e.g., the secret length is itself
 * sensitive, or requests arrive over a high-resolution timing channel), replace
 * this function with an HMAC-then-compare-fixed-length pattern:
 * hash both values with the same HMAC key, then compare the two fixed-length
 * digests with `timingSafeEqual`. That neutralises the length-leak entirely.
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
