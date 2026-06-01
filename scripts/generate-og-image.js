#!/usr/bin/env node

/**
 * Generate Open Graph image for ActivityPub MCP
 * Creates a 1200x630 PNG with logo, title, and tagline
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// OG Image dimensions
const WIDTH = 1200;
const HEIGHT = 630;

// Brand colors (spec §2.1)
const VERMILION = "#E8552D";
const PINE_TEAL = "#2F7D6B";
const GOLD = "#F4B740";
const INK = "#1A1714";
const PAPER = "#FBF7F0";

async function generateOGImage() {
  console.log("🎨 Generating Open Graph image...");

  // Create gradient background using SVG
  const backgroundSVG = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${VERMILION};stop-opacity:1" />
          <stop offset="55%" style="stop-color:${INK};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${PINE_TEAL};stop-opacity:1" />
        </linearGradient>
        
        <!-- Decorative network pattern -->
        <pattern id="network" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
          <circle cx="50" cy="50" r="1" fill="${GOLD}" opacity="0.25"/>
          <circle cx="0" cy="0" r="1" fill="${PAPER}" opacity="0.15"/>
          <circle cx="100" cy="100" r="1" fill="${PAPER}" opacity="0.15"/>
        </pattern>
      </defs>

      <!-- Background -->
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg-gradient)"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#network)" opacity="0.4"/>

      <!-- Decorative glow circles -->
      <circle cx="200" cy="150" r="150" fill="${VERMILION}" opacity="0.12"/>
      <circle cx="1000" cy="480" r="200" fill="${PINE_TEAL}" opacity="0.12"/>
    </svg>
  `;

  // Read and scale the logo
  const logoPath = join(projectRoot, "public", "logo-inverse.svg");
  const logoSVG = readFileSync(logoPath, "utf-8");

  // Scale logo to 200x200
  const logoBuffer = await sharp(Buffer.from(logoSVG)).resize(200, 200).png().toBuffer();

  // Create text overlay SVG
  const textSVG = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <!-- Title -->
      <text x="420" y="260" 
            font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" 
            font-size="72" 
            font-weight="800" 
            fill="${PAPER}"
            letter-spacing="-0.02em">
        ActivityPub MCP
      </text>
      
      <!-- Tagline -->
      <text x="420" y="340" 
            font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" 
            font-size="36" 
            font-weight="500" 
            fill="${GOLD}"
            letter-spacing="-0.01em">
        Connect LLMs to the Fediverse
      </text>
      
      <!-- Subtitle -->
      <text x="420" y="400" 
            font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" 
            font-size="24" 
            font-weight="400" 
            fill="#94a3b8"
            letter-spacing="0">
        Model Context Protocol Server
      </text>
    </svg>
  `;

  // Composite all layers
  const outputPath = join(projectRoot, "public", "og-image.png");

  await sharp(Buffer.from(backgroundSVG))
    .composite([
      {
        input: logoBuffer,
        top: 215,
        left: 150,
      },
      {
        input: Buffer.from(textSVG),
        top: 0,
        left: 0,
      },
    ])
    .png({
      quality: 90,
      compressionLevel: 9,
    })
    .toFile(outputPath);

  console.log("✅ Open Graph image generated successfully!");
  console.log(`📍 Location: ${outputPath}`);
  console.log(`📐 Dimensions: ${WIDTH}x${HEIGHT}px`);

  // Get file size
  const stats = await sharp(outputPath).metadata();
  console.log(`📦 File size: ${(stats.size / 1024).toFixed(2)} KB`);
}

// Run the generator
generateOGImage().catch((error) => {
  console.error("❌ Error generating OG image:", error);
  process.exit(1);
});
