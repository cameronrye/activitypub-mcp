#!/usr/bin/env node

/**
 * Generate the raster icon set from the ActivityPub MCP brand mark (spec §2.3/§7).
 *
 * Outputs (all into repo-root public/, copied verbatim to /activitypub-mcp/):
 *   - favicon.ico             multi-res (16/32/48) PNG-in-ICO, opaque paper bg — legacy fallback
 *   - apple-touch-icon.png    180×180, opaque paper bg, padded — iOS Home Screen
 *   - icon-192.png            192×192, opaque, purpose "any"  — PWA / Android
 *   - icon-512.png            512×512, opaque, purpose "any"  — PWA install / splash
 *   - icon-512-maskable.png   512×512, opaque, logo inside the 80% safe circle — Android adaptive
 *
 * favicon.svg (the dark-aware vector primary) and manifest.webmanifest are authored
 * by hand; this script only produces the rasters. Rasterizing here uses a clean
 * no-@media mark (librsvg ignores prefers-color-scheme anyway) so the baked-in
 * top-left dot is always ink on the opaque paper background.
 *
 * Run: npm run generate:favicons   (outputs are committed, not built on deploy)
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

// Brand colors (spec §2.1)
const VERMILION = "#E8552D";
const PINE_TEAL = "#2F7D6B";
const GOLD = "#F4B740";
const INK = "#1A1714";
const PAPER = "#FBF7F0";

/**
 * The brand mark in a 0..100 coordinate box — small-size-tuned (thicker strokes,
 * larger dots than logo.svg). `scale` insets it within the canvas; `bg` paints an
 * opaque background (null = transparent). No @media: rasterizers ignore it, so the
 * top-left dot is always ink here (visible against the opaque paper bg).
 */
function markSvg({ size, bg, scale }) {
  const inset = (100 * (1 - scale)) / 2;
  const background = bg ? `<rect width="100" height="100" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  ${background}
  <g transform="translate(${inset} ${inset}) scale(${scale})">
    <g fill="none" stroke-linecap="round" stroke-width="12">
      <path d="M24 76 Q50 32 76 24" stroke="${VERMILION}"/>
      <path d="M24 24 Q50 68 76 76" stroke="${PINE_TEAL}"/>
    </g>
    <circle cx="20" cy="20" r="11" fill="${INK}"/>
    <circle cx="80" cy="20" r="11" fill="${PINE_TEAL}"/>
    <circle cx="20" cy="80" r="11" fill="${VERMILION}"/>
    <circle cx="80" cy="80" r="11" fill="${GOLD}"/>
  </g>
</svg>`;
}

function pngBuffer({ size, bg, scale }) {
  let pipe = sharp(Buffer.from(markSvg({ size, bg, scale }))).resize(size, size);
  // Flatten onto the bg so opaque icons (apple-touch, maskable) carry no alpha —
  // iOS paints transparent pixels black and maskable icons must be fully opaque.
  if (bg) pipe = pipe.flatten({ background: bg });
  return pipe.png().toBuffer();
}

/**
 * Assemble a multi-resolution .ico that embeds PNG images (supported by all
 * browsers/OSes since Windows Vista). Layout: ICONDIR + N×ICONDIRENTRY + PNG bytes.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4); // image count

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 ⇒ 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette size
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8); // size of image data
    e.writeUInt32LE(offset, 12); // offset of image data
    offset += buf.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]);
}

async function main() {
  console.log("🎨 Generating favicon raster set...");

  // PWA / Android / Apple — opaque paper bg, padded.
  const targets = [
    { name: "apple-touch-icon.png", size: 180, scale: 0.78 },
    { name: "icon-192.png", size: 192, scale: 0.8 },
    { name: "icon-512.png", size: 512, scale: 0.8 },
    { name: "icon-512-maskable.png", size: 512, scale: 0.62 }, // inside the 80% safe circle
  ];
  for (const { name, size, scale } of targets) {
    const buf = await pngBuffer({ size, bg: PAPER, scale });
    writeFileSync(join(publicDir, name), buf);
    console.log(`  ✓ ${name} (${size}×${size})`);
  }

  // Legacy multi-res favicon.ico — opaque paper bg so the mark is always legible.
  const icoSizes = [16, 32, 48];
  const icoImages = await Promise.all(
    icoSizes.map(async (size) => ({
      size,
      buf: await pngBuffer({ size, bg: PAPER, scale: 0.92 }),
    })),
  );
  writeFileSync(join(publicDir, "favicon.ico"), buildIco(icoImages));
  console.log(`  ✓ favicon.ico (${icoSizes.join("/")})`);

  console.log("✅ Favicon raster set written to public/");
}

main().catch((err) => {
  console.error("Failed to generate favicons:", err);
  process.exit(1);
});
