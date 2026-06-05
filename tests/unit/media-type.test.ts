import { describe, expect, it } from "vitest";
import { sniffMediaType } from "../../src/utils/media-type.js";

/** Build a byte array from a list of byte values, padded to `len` with zeros. */
function bytes(values: number[], len = values.length): Uint8Array {
  const out = new Uint8Array(len);
  out.set(values.slice(0, len));
  return out;
}

/** "ftyp" ISO-BMFF box: 4-byte size, "ftyp", 4-byte major brand. */
function ftyp(brand: string): Uint8Array {
  const enc = new TextEncoder();
  return new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x18,
    ...enc.encode("ftyp"),
    ...enc.encode(brand.padEnd(4, " ")),
    ...new Uint8Array(8),
  ]);
}

function ascii(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("sniffMediaType", () => {
  it("recognizes PNG", () => {
    expect(sniffMediaType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    );
  });

  it("recognizes JPEG", () => {
    expect(sniffMediaType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("recognizes GIF", () => {
    expect(sniffMediaType(ascii("GIF89a"))).toBe("image/gif");
  });

  it("recognizes WebP (RIFF/WEBP)", () => {
    const b = new Uint8Array(16);
    b.set(ascii("RIFF"), 0);
    b.set(ascii("WEBP"), 8);
    expect(sniffMediaType(b)).toBe("image/webp");
  });

  it("recognizes MP4 via ftyp", () => {
    expect(sniffMediaType(ftyp("isom"))).toBe("video/mp4");
  });

  it("recognizes QuickTime via ftyp", () => {
    expect(sniffMediaType(ftyp("qt"))).toBe("video/quicktime");
  });

  it("recognizes WebM (EBML)", () => {
    expect(sniffMediaType(bytes([0x1a, 0x45, 0xdf, 0xa3]))).toBe("video/webm");
  });

  it("recognizes Ogg", () => {
    expect(sniffMediaType(ascii("OggS"))).toBe("audio/ogg");
  });

  it("recognizes MP3 (ID3)", () => {
    expect(sniffMediaType(ascii("ID3"))).toBe("audio/mpeg");
  });

  it("recognizes WAV (RIFF/WAVE)", () => {
    const b = new Uint8Array(16);
    b.set(ascii("RIFF"), 0);
    b.set(ascii("WAVE"), 8);
    expect(sniffMediaType(b)).toBe("audio/wav");
  });

  it("recognizes FLAC", () => {
    expect(sniffMediaType(ascii("fLaC"))).toBe("audio/flac");
  });

  it("rejects JSON credential-store content", () => {
    expect(sniffMediaType(ascii('{\n  "accounts": [{ "token": "secret" }]\n}'))).toBeNull();
  });

  it("rejects an SSH private key", () => {
    expect(sniffMediaType(ascii("-----BEGIN OPENSSH PRIVATE KEY-----\n"))).toBeNull();
  });

  it("rejects a dotenv file", () => {
    expect(sniffMediaType(ascii("API_KEY=sk-live-1234\nDB_PASSWORD=hunter2\n"))).toBeNull();
  });

  it("rejects plain text", () => {
    expect(sniffMediaType(ascii("just some notes"))).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(sniffMediaType(new Uint8Array(0))).toBeNull();
  });
});
