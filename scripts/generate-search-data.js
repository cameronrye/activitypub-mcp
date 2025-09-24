#!/usr/bin/env node

/**
 * Generate search data for the Astro website
 * This creates a search.json file with page content for fallback search
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, "..", "dist");
const searchDataPath = path.join(distDir, "search.json");

// Function to extract text content from HTML
function extractTextContent(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Remove script and style elements
  const scripts = document.querySelectorAll("script, style");
  for (const el of scripts) {
    el.remove();
  }

  // Get main content area
  const mainContent =
    document.querySelector("[data-pagefind-body]") ||
    document.querySelector("main") ||
    document.body;

  return mainContent ? mainContent.textContent.trim() : "";
}

// Function to extract title from HTML
function extractTitle(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const titleEl = document.querySelector("title");
  const h1El = document.querySelector("h1");

  return titleEl?.textContent || h1El?.textContent || "Untitled";
}

// Function to create excerpt from content
function createExcerpt(content, maxLength = 200) {
  if (content.length <= maxLength) return content;

  const truncated = content.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  return lastSpace > 0
    ? `${truncated.substring(0, lastSpace)}...`
    : `${truncated}...`;
}

// Function to scan HTML files and generate search data
function generateSearchData() {
  const searchData = [];

  function scanDirectory(dir, baseUrl = "") {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && item !== "pagefind" && item !== "assets") {
        scanDirectory(fullPath, path.join(baseUrl, item));
      } else if (stat.isFile() && item.endsWith(".html")) {
        try {
          const html = fs.readFileSync(fullPath, "utf-8");
          const title = extractTitle(html);
          const content = extractTextContent(html);
          const excerpt = createExcerpt(content);

          // Create URL path
          let url = baseUrl;
          if (item !== "index.html") {
            url = path.join(baseUrl, item.replace(".html", ""));
          }

          // Ensure URL starts with /activitypub-mcp/
          if (!url.startsWith("/activitypub-mcp/")) {
            url = `/activitypub-mcp${url.startsWith("/") ? url : `/${url}`}`;
          }

          // Normalize URL
          url = url.replace(/\\/g, "/");
          if (url.endsWith("/index")) {
            url = url.replace("/index", "/");
          }

          searchData.push({
            title: title,
            url: url,
            excerpt: excerpt,
            content: content.substring(0, 500), // Limit content for search
          });
        } catch (error) {
          console.warn(`Error processing ${fullPath}:`, error.message);
        }
      }
    }
  }

  if (fs.existsSync(distDir)) {
    scanDirectory(distDir);

    // Write search data
    fs.writeFileSync(searchDataPath, JSON.stringify(searchData, null, 2));
    console.log(`Generated search data with ${searchData.length} pages`);
    console.log(`Search data written to: ${searchDataPath}`);
  } else {
    console.error(
      'Dist directory not found. Please run "npm run build:site" first.',
    );
  }
}

// Run the script
generateSearchData();
