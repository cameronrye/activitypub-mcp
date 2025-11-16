import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://cameronrye.github.io",
  base: "/activitypub-mcp",
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: "github-dark",
      wrap: true,
    },
  },

  outDir: "./dist-site",
  build: {
    assets: "assets",
  },

  vite: {
    build: {
      rollupOptions: {
        output: {
          // Ensure .well-known files are copied to dist
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.includes(".well-known")) {
              return assetInfo.name;
            }
            return "assets/[name]-[hash][extname]";
          },
        },
      },
    },
    server: {
      // Ensure proper MIME types for .well-known files
      headers: {
        "/.well-known/security.txt": {
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    },
  },
});
