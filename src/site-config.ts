export const SITE = {
  title: "ActivityPub MCP Server",
  description:
    "A comprehensive Model Context Protocol server that enables LLMs like Claude to explore and interact with the existing Fediverse through standardized MCP tools, resources, and prompts.",
  defaultLanguage: "en_US",
  author: "ActivityPub MCP Server Contributors",

  // URLs
  url: "https://cameronrye.github.io",
  base: "/activitypub-mcp",

  // Social links
  social: {
    github: "https://github.com/cameronrye/activitypub-mcp",
    npm: "https://www.npmjs.com/package/activitypub-mcp-server",
  },

  // Package info
  npm_package: "activitypub-mcp-server",

  // Navigation
  nav: [
    { text: "Home", href: "/" },
    { text: "Documentation", href: "/docs/" },
    { text: "Guides", href: "/guides/" },
    { text: "API Reference", href: "/api/" },
  ],
} as const;
