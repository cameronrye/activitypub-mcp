/**
 * Streaming response readers with safety caps.
 *
 * Replaces the legacy Content-Length-only checks scattered across
 * remote-client.ts and auth/authenticated-client.ts. The streaming
 * reader aborts the body once `maxBytes` is exceeded, regardless of
 * whether the server sent an accurate Content-Length header.
 */

export class ResponseTooLargeError extends Error {
  constructor(
    public readonly bytesRead: number,
    public readonly maxBytes: number,
  ) {
    super(`Response too large: read ${bytesRead} bytes, cap ${maxBytes} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

/**
 * Read a Response body as JSON, aborting if it would exceed `maxBytes`.
 *
 * - Fast-path rejects when Content-Length is present and exceeds the cap.
 * - Otherwise streams the body and stops as soon as the running byte count
 *   passes the cap.
 */
export async function readJsonWithLimit<T = unknown>(
  response: Response,
  maxBytes: number,
): Promise<T> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new ResponseTooLargeError(declared, maxBytes);
    }
  }

  if (!response.body) {
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).length;
    if (byteLength > maxBytes) {
      throw new ResponseTooLargeError(byteLength, maxBytes);
    }
    return JSON.parse(text) as T;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel(`response exceeded ${maxBytes} bytes`);
        throw new ResponseTooLargeError(total, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(merged);
  return JSON.parse(text) as T;
}
