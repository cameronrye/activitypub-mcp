/**
 * Magic-byte media-type sniffing.
 *
 * Used to gate `upload-media`: a file path supplied by the model is only read
 * and sent to the user's instance if its *content* is a recognized image,
 * video, or audio file. A path naming a credential store, SSH key, `.env`, or
 * any other non-media secret is rejected before any bytes leave the process, so
 * a prompt-injected model cannot turn the media uploader into a file
 * exfiltration primitive. Detection is by file signature, not extension, so a
 * secret renamed `cat.png` is still rejected.
 */

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, len: number): string {
  if (bytes.length < offset + len) return "";
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

/** Map an ISO base-media (`ftyp`) major brand to a concrete media type. */
function isoBmffType(brand: string): string {
  const b = brand.trim().toLowerCase();
  if (b === "qt") return "video/quicktime";
  if (b.startsWith("m4a")) return "audio/mp4";
  if (b.startsWith("heic") || b.startsWith("heix") || b === "mif1" || b === "msf1")
    return "image/heic";
  if (b.startsWith("avif") || b.startsWith("avis")) return "image/avif";
  // isom, mp41/mp42, iso2/iso4/iso5/iso6, M4V, dash, etc.
  return "video/mp4";
}

/**
 * Sniff the media type of a file from its leading bytes.
 *
 * @returns a MIME type string for recognized image/video/audio formats, or
 *   `null` if the content is not a media file we accept.
 */
export function sniffMediaType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  // Images
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"; // GIF8
  if (startsWith(bytes, [0x42, 0x4d])) return "image/bmp"; // BM

  // RIFF container: WEBP (image) or WAVE (audio)
  if (asciiAt(bytes, 0, 4) === "RIFF") {
    const form = asciiAt(bytes, 8, 4);
    if (form === "WEBP") return "image/webp";
    if (form === "WAVE") return "audio/wav";
    return null;
  }

  // ISO base media (MP4/MOV/M4A/HEIC/AVIF): "ftyp" box at offset 4
  if (asciiAt(bytes, 4, 4) === "ftyp") return isoBmffType(asciiAt(bytes, 8, 4));

  // Audio / video
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm"; // EBML (webm/mkv)
  if (asciiAt(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (asciiAt(bytes, 0, 3) === "ID3") return "audio/mpeg"; // MP3 with ID3 tag
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg"; // MP3 frame sync
  if (asciiAt(bytes, 0, 4) === "fLaC") return "audio/flac";

  return null;
}
