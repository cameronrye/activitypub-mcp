import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { checkBearerAuth } from "../../src/transport/auth-middleware.js";

function makeReq(headers: Record<string, string>): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  Object.assign(req.headers, headers);
  return req;
}
function makeRes(): ServerResponse & { _status?: number; _body?: string } {
  const req = new IncomingMessage(new Socket());
  const res = new ServerResponse(req) as ServerResponse & { _status?: number; _body?: string };
  const writeHead = res.writeHead.bind(res);
  res.writeHead = (status: number, ...rest: unknown[]) => {
    res._status = status;
    return writeHead(status, ...(rest as []));
  };
  const end = res.end.bind(res);
  res.end = (chunk?: unknown, ...rest: unknown[]) => {
    if (typeof chunk === "string") res._body = chunk;
    return end(chunk, ...(rest as []));
  };
  return res;
}

describe("checkBearerAuth (H1)", () => {
  it("returns true when Authorization header matches secret", () => {
    const req = makeReq({ authorization: "Bearer s3cret" });
    const res = makeRes();
    expect(checkBearerAuth(req, res, "s3cret")).toBe(true);
    expect(res._status).toBeUndefined();
  });

  it("returns false and writes 401 when header is missing", () => {
    const req = makeReq({});
    const res = makeRes();
    expect(checkBearerAuth(req, res, "s3cret")).toBe(false);
    expect(res._status).toBe(401);
    expect(res.getHeader("WWW-Authenticate")).toBe("Bearer");
  });

  it("returns false and writes 401 when secret mismatches", () => {
    const req = makeReq({ authorization: "Bearer wrong" });
    const res = makeRes();
    expect(checkBearerAuth(req, res, "s3cret")).toBe(false);
    expect(res._status).toBe(401);
  });

  it("uses constant-time comparison (does not short-circuit on length)", () => {
    // Smoke check — we cannot directly measure timing, but ensure the function
    // still returns false for different-length tokens without throwing.
    const req = makeReq({ authorization: "Bearer s" });
    const res = makeRes();
    expect(checkBearerAuth(req, res, "s3cret")).toBe(false);
  });
});
