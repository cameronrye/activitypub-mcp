<p align="center">
  <img src="public/logo.svg" alt="ActivityPub MCP Logo" width="200" />
</p>

<h1 align="center">ActivityPub MCP Server</h1>

<p align="center">
  <strong>Fediverse Client for LLMs</strong>
</p>

<p align="center">
  A lightweight <strong>Model Context Protocol (MCP)</strong> server that lets an LLM explore and interact with the existing Fediverse — Mastodon, Misskey, Foundkey, Pleroma, and compatible servers. Read-only by default; write tools are opt-in.
</p>

<p align="center">
  <a href="https://badge.fury.io/js/activitypub-mcp"><img src="https://badge.fury.io/js/activitypub-mcp.svg" alt="npm version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white" alt="Node.js" /></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-Compatible-blueviolet" alt="MCP Compatible" /></a>
</p>

<p align="center">
  <a href="https://github.com/cameronrye/activitypub-mcp/actions"><img src="https://github.com/cameronrye/activitypub-mcp/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/activitypub-mcp"><img src="https://img.shields.io/npm/dm/activitypub-mcp.svg" alt="npm downloads" /></a>
  <a href="https://github.com/cameronrye/activitypub-mcp"><img src="https://img.shields.io/github/stars/cameronrye/activitypub-mcp?style=social" alt="GitHub stars" /></a>
</p>

---

## Install

Requires **Node.js 20+**.

```bash
npx -y activitypub-mcp
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "activitypub": {
      "command": "npx",
      "args": ["-y", "activitypub-mcp"]
    }
  }
}
```

Restart Claude Desktop.

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "activitypub": {
      "command": "npx",
      "args": ["-y", "activitypub-mcp"]
    }
  }
}
```

Restart Cursor.

---

## Read-only by default

Out of the box, only **read tools** are registered: discover actors, fetch timelines, search, get threads, explore instances, read trending content. No write tools exist in the MCP session, so injected fediverse content cannot trigger account actions.

**Public read tools** (no account needed): `discover-actor`, `fetch-timeline`, `get-post-thread`, `get-instance-info`, `get-public-timeline`, `get-trending-hashtags`, `get-trending-posts`, `search`, `discover-instances`.

**Authenticated read tools** (account required): `list-accounts`, `switch-account`, `verify-account`, `get-home-timeline`, `get-notifications`, `get-bookmarks`, `get-favourites`, `get-relationship`.

### Enabling writes

Set `ACTIVITYPUB_ENABLE_WRITES=true` in the environment or MCP config `env` block. This registers the full set of mutation tools: post, reply, delete, boost, favourite, bookmark, follow, mute, block, vote, upload media, and scheduled posts. **Read the [threat model](SECURITY.md) before enabling.**

```json
{
  "mcpServers": {
    "activitypub": {
      "command": "npx",
      "args": ["-y", "activitypub-mcp"],
      "env": {
        "ACTIVITYPUB_ENABLE_WRITES": "true"
      }
    }
  }
}
```

### Authentication

Log in with the CLI:

```bash
npx activitypub-mcp login mastodon.social
```

This runs OAuth (Mastodon-family) or MiAuth (Misskey) in your browser and saves credentials to `~/.config/activitypub-mcp/accounts.json`. Multi-account is supported — use `switch-account` to change the active account.

Alternatively, set `ACTIVITYPUB_DEFAULT_INSTANCE` and `ACTIVITYPUB_DEFAULT_TOKEN` env vars for a single account without the CLI flow.

---

## Example

After adding the server to your MCP client, try:

> "Look up @gargron@mastodon.social and summarize their latest posts."

The model will call `discover-actor` to fetch the profile, then `fetch-timeline` to read recent posts.

---

## HTTP transport

In addition to stdio (default), the server supports HTTP mode with a bearer-gated `/mcp` endpoint and `/health` liveness check. Set `MCP_HTTP_SECRET` (min 16 chars) to enable. See the [docs](https://cameronrye.github.io/activitypub-mcp/docs/) for full configuration.

---

## Security

This server fetches world-writable fediverse content — posts, bios, notifications — and feeds it to the LLM. That content can contain prompt-injection payloads. Notifications are an unsolicited channel: anyone can mention your account. The `<untrusted-content>` envelope and read-only default reduce the risk surface, but **do not eliminate it**.

See [SECURITY.md](SECURITY.md) for the full threat model, SSRF protections, credential handling, and reporting instructions.

---

## Documentation

The full tool reference, resource list, prompt catalog, environment variable guide, and deployment notes live on the docs site:

**[cameronrye.github.io/activitypub-mcp/docs/](https://cameronrye.github.io/activitypub-mcp/docs/)**

---

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Built on the [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic, and interacts with the decentralized social web as specified by [ActivityPub](https://www.w3.org/TR/activitypub/) (W3C) and [ActivityStreams](https://www.w3.org/TR/activitystreams-core/).
