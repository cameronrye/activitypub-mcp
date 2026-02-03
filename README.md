<p align="center">
  <img src="public/logo.svg" alt="ActivityPub MCP Logo" width="200" />
</p>

<h1 align="center">ActivityPub MCP Server</h1>

<p align="center">
  <strong>Fediverse Client for LLMs</strong>
</p>

<p align="center">
  A comprehensive <strong>Model Context Protocol (MCP)</strong> server that enables LLMs like Claude to <strong>explore and interact with the existing Fediverse</strong> through standardized MCP tools, resources, and prompts.
</p>

<!-- Trigger CI -->

<p align="center">
  <a href="https://badge.fury.io/js/activitypub-mcp"><img src="https://badge.fury.io/js/activitypub-mcp.svg" alt="npm version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js" /></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-Compatible-blueviolet" alt="MCP Compatible" /></a>
</p>

<p align="center">
  <a href="https://github.com/cameronrye/activitypub-mcp/actions"><img src="https://github.com/cameronrye/activitypub-mcp/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/activitypub-mcp"><img src="https://img.shields.io/npm/dm/activitypub-mcp.svg" alt="npm downloads" /></a>
  <a href="https://github.com/cameronrye/activitypub-mcp"><img src="https://img.shields.io/github/stars/cameronrye/activitypub-mcp?style=social" alt="GitHub stars" /></a>
</p>

---

<h2 align="center">What's New in v1.1.0</h2>

<p align="center">
  <strong>The biggest release yet!</strong> Now with full write capabilities, multi-account support, and enterprise-ready features.
</p>

<table align="center">
  <tr>
    <td align="center"><strong>Post & Interact</strong><br/>Create posts, reply, boost, favourite, and bookmark directly from your LLM</td>
    <td align="center"><strong>Multi-Account</strong><br/>Manage multiple fediverse accounts with secure credential storage</td>
    <td align="center"><strong>Media & Polls</strong><br/>Upload images with alt text, vote on polls, schedule posts</td>
  </tr>
  <tr>
    <td align="center"><strong>Export Anywhere</strong><br/>Export timelines, threads, and accounts to JSON, Markdown, or CSV</td>
    <td align="center"><strong>HTTP Transport</strong><br/>Production-ready HTTP/SSE mode for enterprise deployments</td>
    <td align="center"><strong>53 Tools</strong><br/>21 read-only + 28 authenticated + 4 export tools</td>
  </tr>
</table>

<p align="center">
  <a href="#authenticated-write-tools-v110">See Authenticated Tools</a> |
  <a href="#content-export-tools-v110">See Export Tools</a> |
  <a href="CHANGELOG.md">Full Changelog</a>
</p>

---

## Features

### Core Capabilities

- **Fediverse Client**: Interact with existing ActivityPub servers (Mastodon, Pleroma, Misskey, etc.)
- **WebFinger Discovery**: Find and discover actors across the fediverse
- **MCP Protocol**: Complete MCP server with resources, tools, and prompts
- **LLM-Optimized**: Designed specifically for LLM interaction patterns
- **TypeScript**: Fully typed with modern TypeScript and ESM
- **High Performance**: Efficient resource management and caching
- **Secure**: Built-in security features and input validation
- **Dual Transport**: Supports both stdio (Claude Desktop) and HTTP transport modes

### Fediverse Interaction Features

- **Remote Actor Discovery**: Find users on any fediverse instance
- **Timeline Fetching**: Get posts from any user's timeline with pagination support
- **Trending Content**: Access trending hashtags and posts
- **Instance Discovery**: Find and explore fediverse instances via live API
- **Instance Information**: Get detailed info about any server
- **Search Capabilities**: Search for accounts, hashtags, and posts across instances
- **Post Threads**: Fetch complete conversation threads with replies
- **WebFinger Support**: Resolve actor identifiers across the network
- **Multi-Platform Support**: Works with Mastodon, Pleroma, Misskey, and more
- **Follower/Following Lists**: Access social connections
- **Batch Operations**: Fetch multiple actors or posts in a single request

### MCP Features

- **Resources** (10 total): Access remote ActivityPub data (actors, timelines, trending, instance info)
- **Tools** (53 total): Discover, interact, and create content in the fediverse
  - 21 read-only tools for discovery and exploration (including unified search)
  - 28 authenticated tools for posting, interactions, polls, media, and scheduling
  - 4 export tools for data export in JSON, Markdown, or CSV formats
- **Prompts** (11 total): Templates for fediverse exploration, content strategy, and community analysis
- **Monitoring**: Built-in logging, audit trails, and performance metrics
- **Health Checks**: Server health monitoring and diagnostics

### Authenticated Features (v1.1.0)

- **Multi-Account Support**: Manage multiple fediverse accounts with secure credential storage
- **Posting Operations**: Create, reply to, and delete posts
- **Social Interactions**: Boost, favourite, bookmark, follow, mute, and block
- **Authenticated Timelines**: Access home timeline, notifications, bookmarks, and favourites
- **Content Export**: Export timelines, threads, and account data in multiple formats

### Security & Administration

- **Instance Blocklist**: Block specific instances by domain or wildcard pattern
- **Audit Logging**: Comprehensive logging of all tool invocations and resource access
- **Content Warnings**: Respect and display content warnings from posts
- **Rate Limiting**: Protect against abuse with configurable rate limits

## Quick Start

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **npm** or **yarn** package manager
- **Git** for cloning the repository

### Cross-Platform Support

This project works on **Windows**, **macOS**, and **Linux** with automatic platform detection and appropriate script selection.

### One-Click Installation

For the fastest setup, use our automated installation script:

#### Universal (All Platforms)
```bash
# Install directly with npx (recommended)
npx activitypub-mcp install

# Or clone and run setup
git clone https://github.com/cameronrye/activitypub-mcp.git
cd activitypub-mcp
npm run setup
```

#### Platform-Specific Installation

**Windows (PowerShell):**
```powershell
# Clone and setup
git clone https://github.com/cameronrye/activitypub-mcp.git
cd activitypub-mcp
npm run setup:windows

# Or run PowerShell script directly
.\scripts\setup.ps1
```

**macOS/Linux (Bash):**
```bash
# Clone and setup
git clone https://github.com/cameronrye/activitypub-mcp.git
cd activitypub-mcp
npm run setup:unix

# Or run bash script directly
bash scripts/setup.sh
```

### Manual Installation

1. **Clone and install dependencies**:

```bash
git clone https://github.com/cameronrye/activitypub-mcp.git
cd activitypub-mcp
npm install
```

2. **Configure environment**:

**Windows:**
```cmd
# Copy environment template
copy .env.example .env

# Edit configuration (optional)
notepad .env
```

**macOS/Linux:**
```bash
# Copy environment template
cp .env.example .env

# Edit configuration (optional)
nano .env
```

3. **Start the MCP server**:

```bash
# Start the MCP server (no local ActivityPub server needed)
npm run mcp
```

### Testing the Setup

**Test MCP server** with MCP Inspector:

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Connect to the MCP server
mcp-inspector
```

### Claude Desktop Integration

To use this MCP server with Claude Desktop:

1. **Locate your Claude Desktop config file**:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add the server configuration**:

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

3. **Restart Claude Desktop** to load the new server.

## Documentation

### Quick Reference

For detailed usage instructions, examples, and troubleshooting, see:

- **[Usage Guide](docs/guides/USAGE_GUIDE.md)** - Comprehensive usage documentation
- **[Examples](docs/guides/EXAMPLES.md)** - Practical examples and integration patterns
- **[API Reference](#api-reference)** - Complete API documentation (below)

### API Reference

### MCP Resources

Resources provide read-only access to fediverse data from any ActivityPub server. All resources return JSON data unless otherwise specified.

#### Server Info Resource

Get information about the ActivityPub MCP server:

```uri
activitypub://server-info
```

**Parameters:**
- None required

**Example Response:**

```json
{
  "name": "activitypub-mcp",
  "version": "1.1.0",
  "description": "A Model Context Protocol server for exploring and interacting with the existing Fediverse",
  "capabilities": {
    "resources": ["server-info", "remote-actor", "remote-timeline", "remote-followers", "remote-following", "instance-info", "trending", "local-timeline", "federated-timeline", "post-thread"],
    "tools": {
      "discovery": ["discover-actor", "discover-instances", "discover-instances-live", "recommend-instances"],
      "content": ["fetch-timeline", "get-post-thread", "search-instance", "search-accounts", "search-hashtags", "search-posts"],
      "timelines": ["get-trending-hashtags", "get-trending-posts", "get-local-timeline", "get-federated-timeline"],
      "utility": ["convert-url", "batch-fetch-actors", "batch-fetch-posts"],
      "system": ["health-check", "performance-metrics"]
    },
    "prompts": ["explore-fediverse", "discover-content", "compare-instances", "compare-accounts", "analyze-user-activity", "find-experts", "summarize-trending"]
  },
  "features": {
    "auditLogging": true,
    "instanceBlocklist": true,
    "contentWarnings": true,
    "batchOperations": true
  }
}
```

#### Remote Actor Resource

Get information about any actor in the fediverse:

```uri
activitypub://remote-actor/{identifier}
```

**Parameters:**
- `identifier` (string): The actor's fediverse handle (e.g., user@mastodon.social)

**Example Response:**

```json
{
  "@context": ["https://www.w3.org/ns/activitystreams"],
  "id": "https://mastodon.social/users/alice",
  "type": "Person",
  "preferredUsername": "alice",
  "name": "Alice Smith",
  "summary": "Software developer passionate about decentralized social networks",
  "inbox": "https://mastodon.social/users/alice/inbox",
  "outbox": "https://mastodon.social/users/alice/outbox"
}
```

#### Remote Timeline Resource

Access any actor's timeline/outbox from across the fediverse:

```uri
activitypub://remote-timeline/{identifier}
```

**Parameters:**
- `identifier` (string): The actor's fediverse handle (e.g., user@mastodon.social)

**Example Response:**

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "id": "https://mastodon.social/users/alice/outbox",
  "totalItems": 42,
  "orderedItems": [...]
}
```

#### Instance Info Resource

Get information about any fediverse instance:

```uri
activitypub://instance-info/{domain}
```

**Parameters:**
- `domain` (string): The instance domain (e.g., mastodon.social)

**Example Response:**

```json
{
  "domain": "mastodon.social",
  "software": "mastodon",
  "version": "4.2.1",
  "description": "The original server operated by the Mastodon gGmbH non-profit",
  "registrations": true,
  "stats": {
    "user_count": 900000,
    "status_count": 50000000
  }
}
```

#### Remote Followers/Following Resources

Access follower and following lists from any actor:

```uri
activitypub://remote-followers/{identifier}
activitypub://remote-following/{identifier}
```

#### Trending Resource (New)

Get trending hashtags and posts from an instance:

```uri
activitypub://trending/{domain}
```

#### Local Timeline Resource (New)

Get the local public timeline from an instance:

```uri
activitypub://local-timeline/{domain}
```

#### Federated Timeline Resource (New)

Get the federated public timeline from an instance:

```uri
activitypub://federated-timeline/{domain}
```

#### Post Thread Resource (New)

Get a post and its full conversation thread:

```uri
activitypub://post-thread/{postUrl}
```

### MCP Tools

Tools enable LLMs to discover and interact with the fediverse. All tools return structured responses with success/error information.

#### Discover Actor

Discover and get information about any actor in the fediverse:

```json
{
  "name": "discover-actor",
  "arguments": {
    "identifier": "user@mastodon.social"
  }
}
```

**Parameters:**
- `identifier` (string, required): Fediverse handle (e.g., user@mastodon.social)

#### Fetch Timeline

Fetch posts from any actor's timeline with pagination support:

```json
{
  "name": "fetch-timeline",
  "arguments": {
    "identifier": "user@mastodon.social",
    "limit": 20,
    "cursor": null,
    "maxId": null
  }
}
```

**Parameters:**

- `identifier` (string, required): Fediverse handle
- `limit` (number, optional): Number of posts to fetch (1-50, default: 20)
- `cursor` (string, optional): Pagination cursor from previous response
- `minId` (string, optional): Return results newer than this ID
- `maxId` (string, optional): Return results older than this ID
- `sinceId` (string, optional): Return results since this ID

#### Get Instance Info

Get detailed information about any fediverse instance:

```json
{
  "name": "get-instance-info",
  "arguments": {
    "domain": "mastodon.social"
  }
}
```

**Parameters:**
- `domain` (string, required): Instance domain

#### Search Instance

Search for content on a specific fediverse instance:

```json
{
  "name": "search-instance",
  "arguments": {
    "domain": "mastodon.social",
    "query": "typescript",
    "type": "accounts"
  }
}
```

**Parameters:**
- `domain` (string, required): Instance domain to search
- `query` (string, required): Search query
- `type` (string, optional): Type of content ("accounts", "statuses", "hashtags")

#### Discover Instances

Find popular fediverse instances by category or topic:

```json
{
  "name": "discover-instances",
  "arguments": {
    "category": "mastodon",
    "topic": "technology",
    "size": "medium"
  }
}
```

**Parameters:**
- `category` (string, optional): Software type ("mastodon", "pleroma", "misskey", etc.)
- `topic` (string, optional): Topic or interest to search for
- `size` (string, optional): Instance size ("small", "medium", "large")
- `region` (string, optional): Geographic region or language
- `beginnerFriendly` (boolean, optional): Show only beginner-friendly instances

#### Recommend Instances

Get personalized instance recommendations based on interests:

```json
{
  "name": "recommend-instances",
  "arguments": {
    "interests": ["technology", "programming", "open source"]
  }
}
```

**Parameters:**

- `interests` (array, required): List of your interests or topics

#### Discover Instances Live (New)

Real-time instance discovery via instances.social API:

```json
{
  "name": "discover-instances-live",
  "arguments": {
    "software": "mastodon",
    "language": "en",
    "minUsers": 1000,
    "openRegistrations": true,
    "limit": 20
  }
}
```

**Parameters:**

- `software` (enum, optional): Filter by software type (mastodon, pleroma, misskey, pixelfed, lemmy, peertube, any)
- `language` (string, optional): Filter by language code (e.g., "en", "de", "ja")
- `minUsers` (number, optional): Minimum number of users
- `maxUsers` (number, optional): Maximum number of users
- `openRegistrations` (boolean, optional): Only show instances with open registrations
- `sortBy` (enum, optional): Sort by "users", "statuses", "connections", or "name"
- `limit` (number, optional): Number of results (default: 20)

#### Get Trending Hashtags (New)

Get currently trending hashtags on an instance:

```json
{
  "name": "get-trending-hashtags",
  "arguments": {
    "domain": "mastodon.social",
    "limit": 20
  }
}
```

#### Get Trending Posts (New)

Get currently trending posts on an instance:

```json
{
  "name": "get-trending-posts",
  "arguments": {
    "domain": "mastodon.social",
    "limit": 20
  }
}
```

#### Get Local Timeline (New)

Get the local public timeline from an instance:

```json
{
  "name": "get-local-timeline",
  "arguments": {
    "domain": "mastodon.social",
    "limit": 20
  }
}
```

#### Get Federated Timeline (New)

Get the federated public timeline from an instance:

```json
{
  "name": "get-federated-timeline",
  "arguments": {
    "domain": "mastodon.social",
    "limit": 20
  }
}
```

#### Get Post Thread (New)

Fetch a post and its full conversation thread:

```json
{
  "name": "get-post-thread",
  "arguments": {
    "postUrl": "https://mastodon.social/@user/123456789",
    "depth": 2,
    "maxReplies": 50
  }
}
```

#### Search Accounts (New)

Search for accounts on an instance:

```json
{
  "name": "search-accounts",
  "arguments": {
    "domain": "mastodon.social",
    "query": "developer",
    "limit": 20
  }
}
```

#### Search Hashtags (New)

Search for hashtags on an instance:

```json
{
  "name": "search-hashtags",
  "arguments": {
    "domain": "mastodon.social",
    "query": "programming",
    "limit": 20
  }
}
```

#### Search Posts (New)

Search for posts on an instance:

```json
{
  "name": "search-posts",
  "arguments": {
    "domain": "mastodon.social",
    "query": "typescript",
    "limit": 20
  }
}
```

#### Batch Fetch Actors (New)

Fetch multiple actors in a single request:

```json
{
  "name": "batch-fetch-actors",
  "arguments": {
    "identifiers": ["user1@mastodon.social", "user2@fosstodon.org"]
  }
}
```

#### Batch Fetch Posts (New)

Fetch multiple posts in a single request:

```json
{
  "name": "batch-fetch-posts",
  "arguments": {
    "urls": ["https://mastodon.social/@user/123", "https://fosstodon.org/@user/456"]
  }
}
```

#### Health Check

Check the health status of the MCP server:

```json
{
  "name": "health-check",
  "arguments": {}
}
```

**Parameters:**
- None required

#### Performance Metrics

Get performance metrics for the MCP server:

```json
{
  "name": "performance-metrics",
  "arguments": {
    "operation": "discover-actor"
  }
}
```

**Parameters:**
- `operation` (string, optional): Specific operation to get metrics for

### MCP Prompts

#### Explore Fediverse
```json
{
  "name": "explore-fediverse",
  "arguments": {
    "interests": "technology and programming",
    "instanceType": "mastodon"
  }
}
```

#### Compare Instances
```json
{
  "name": "compare-instances",
  "arguments": {
    "instances": "mastodon.social, fosstodon.org, hachyderm.io",
    "criteria": "community size and focus"
  }
}
```

#### Discover Content

```json
{
  "name": "discover-content",
  "arguments": {
    "topic": "artificial intelligence",
    "contentType": "people"
  }
}
```

#### Compare Accounts (New)

```json
{
  "name": "compare-accounts",
  "arguments": {
    "accounts": "user1@mastodon.social, user2@fosstodon.org",
    "aspects": "posting frequency, topics, engagement"
  }
}
```

#### Analyze User Activity (New)

```json
{
  "name": "analyze-user-activity",
  "arguments": {
    "identifier": "user@mastodon.social",
    "depth": "standard"
  }
}
```

#### Find Experts (New)

```json
{
  "name": "find-experts",
  "arguments": {
    "topic": "machine learning",
    "instances": "mastodon.social, fosstodon.org"
  }
}
```

#### Summarize Trending (New)

```json
{
  "name": "summarize-trending",
  "arguments": {
    "instances": "mastodon.social",
    "focus": "tech"
  }
}
```

#### Content Strategy (v1.1.0)

Plan your fediverse content strategy based on trending topics:

```json
{
  "name": "content-strategy",
  "arguments": {
    "topics": "programming, open source",
    "targetAudience": "developers",
    "postingFrequency": "several-per-week"
  }
}
```

#### Community Health (v1.1.0)

Analyze instance moderation and community health:

```json
{
  "name": "community-health",
  "arguments": {
    "instance": "fosstodon.org",
    "concerns": "moderation, spam"
  }
}
```

#### Migration Helper (v1.1.0)

Get help planning a migration to a new fediverse instance:

```json
{
  "name": "migration-helper",
  "arguments": {
    "currentInstance": "mastodon.social",
    "targetInstance": "fosstodon.org",
    "priorities": "moderation, privacy, community focus"
  }
}
```

#### Thread Composer (v1.1.0)

Help compose well-structured threaded posts:

```json
{
  "name": "thread-composer",
  "arguments": {
    "topic": "Introduction to the Fediverse",
    "keyPoints": "What is ActivityPub, Popular instances, Getting started",
    "tone": "informative",
    "targetLength": "medium"
  }
}
```

### Authenticated Write Tools (v1.1.0)

These tools require authentication via environment variables. See [Configuration](#environment-variables) for setup.

#### Account Management

- `list-accounts` - List configured accounts
- `switch-account` - Switch active account
- `verify-account` - Verify account credentials

#### Posting Operations

```json
{
  "name": "post-status",
  "arguments": {
    "content": "Hello Fediverse!",
    "visibility": "public",
    "contentWarning": "optional CW"
  }
}
```

- `post-status` - Create a new post
- `reply-to-post` - Reply to an existing post
- `delete-post` - Delete your own post

#### Social Interactions

- `boost-post` / `unboost-post` - Boost (reblog) posts
- `favourite-post` / `unfavourite-post` - Favourite posts
- `bookmark-post` / `unbookmark-post` - Bookmark posts
- `follow-account` / `unfollow-account` - Follow/unfollow accounts
- `mute-account` / `unmute-account` - Mute accounts
- `block-account` / `unblock-account` - Block accounts

#### Authenticated Timelines

- `get-home-timeline` - Your home timeline
- `get-notifications` - Your notifications
- `get-bookmarks` - Your bookmarked posts
- `get-favourites` - Your favourited posts

#### Unified Search (NEW)

Search across accounts, posts, and hashtags in a single query:

```json
{
  "name": "search",
  "arguments": {
    "domain": "mastodon.social",
    "query": "typescript programming",
    "type": "all",
    "limit": 20
  }
}
```

**Parameters:**

- `domain` (string, required): Instance domain to search
- `query` (string, required): Search query
- `type` (string, optional): "all", "accounts", "posts", or "hashtags" (default: "all")
- `limit` (number, optional): Results per type (1-40, default: 20)
- `resolve` (boolean, optional): Attempt WebFinger lookup for remote accounts

#### Relationship Checking (NEW)

Check your relationship status with other accounts:

```json
{
  "name": "get-relationship",
  "arguments": {
    "accountIds": ["12345", "67890"]
  }
}
```

**Parameters:**

- `accountIds` (array, required): Account IDs to check relationship status

**Returns:** Following, followed_by, blocking, muting, and other relationship statuses.

#### Poll Voting (NEW)

Vote on polls in posts:

```json
{
  "name": "vote-on-poll",
  "arguments": {
    "pollId": "123456",
    "choices": [0, 2]
  }
}
```

**Parameters:**

- `pollId` (string, required): The poll ID to vote on
- `choices` (array, required): Array of choice indices (0-based)

**Returns:** Updated poll with current results and visual bar chart.

#### Media Upload (NEW)

Upload media files with alt text descriptions:

```json
{
  "name": "upload-media",
  "arguments": {
    "filePath": "/path/to/image.jpg",
    "description": "A beautiful sunset over the ocean",
    "focus": "0.0,0.5"
  }
}
```

**Parameters:**

- `filePath` (string, required): Local file path or URL to upload
- `description` (string, optional): Alt text for accessibility (recommended)
- `focus` (string, optional): Focal point as "x,y" (-1.0 to 1.0)

**Supported types:** Images (jpg, png, gif, webp), Videos (mp4, webm), Audio (mp3, ogg)

#### Scheduled Posts (NEW)

Manage scheduled posts:

```json
{
  "name": "get-scheduled-posts",
  "arguments": {
    "limit": 20
  }
}
```

```json
{
  "name": "update-scheduled-post",
  "arguments": {
    "scheduledPostId": "123",
    "scheduledAt": "2026-02-14T18:00:00.000Z"
  }
}
```

```json
{
  "name": "cancel-scheduled-post",
  "arguments": {
    "scheduledPostId": "123"
  }
}
```

- `get-scheduled-posts` - List all pending scheduled posts
- `update-scheduled-post` - Change the scheduled time
- `cancel-scheduled-post` - Cancel a scheduled post

### Content Export Tools (v1.1.0)

Export fediverse content in multiple formats (JSON, Markdown, CSV):

```json
{
  "name": "export-timeline",
  "arguments": {
    "identifier": "user@mastodon.social",
    "format": "markdown",
    "limit": 50
  }
}
```

- `export-timeline` - Export actor timeline
- `export-thread` - Export post thread with replies
- `export-account-info` - Comprehensive account data export
- `export-hashtag` - Export posts with a specific hashtag

## Architecture

### Project Structure

```
activitypub-mcp/
├── src/                           # Source code
│   ├── mcp-main.ts                # MCP server entry point
│   ├── mcp-server.ts              # MCP server implementation
│   ├── webfinger.ts               # WebFinger discovery client
│   ├── remote-client.ts           # Remote ActivityPub client
│   ├── instance-discovery.ts      # Static instance discovery
│   ├── dynamic-instance-discovery.ts # Live API instance discovery
│   ├── instance-blocklist.ts      # Instance blocklist manager
│   ├── audit-logger.ts            # Audit logging infrastructure
│   ├── health-check.ts            # Health monitoring
│   ├── performance-monitor.ts     # Performance tracking
│   ├── config.ts                  # Configuration constants
│   ├── logging.ts                 # Logging configuration
│   ├── auth/                      # Authentication (v1.1.0)
│   │   ├── account-manager.ts     # Multi-account management
│   │   ├── authenticated-client.ts # Authenticated API client
│   │   └── index.ts               # Auth module exports
│   ├── mcp/                       # MCP handlers
│   │   ├── tools.ts               # Read-only tool implementations
│   │   ├── tools-write.ts         # Write operation tools (v1.1.0)
│   │   ├── tools-export.ts        # Export tools (v1.1.0)
│   │   ├── resources.ts           # Resource implementations
│   │   └── prompts.ts             # Prompt implementations
│   └── server/                    # Server infrastructure
│       ├── http-transport.ts      # HTTP/SSE transport
│       ├── adaptive-rate-limiter.ts # Per-instance rate limiting (v1.1.0)
│       └── rate-limiter.ts        # Rate limiting
├── docs/                          # Documentation
├── scripts/                       # Installation & setup scripts
├── tests/                         # Test files
│   ├── unit/                      # Unit tests
│   └── integration/               # Integration tests
├── dist/                          # Built JavaScript files
├── package.json                   # Dependencies and scripts
└── README.md                      # This file
```

### Technology Stack
- **[WebFinger](https://tools.ietf.org/rfc/rfc7033.txt)**: Actor discovery across the fediverse
- **[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)**: Model Context Protocol implementation
- **[ActivityPub](https://www.w3.org/TR/activitypub/)**: Decentralized social networking protocol
- **[LogTape](https://logtape.org/)**: Structured logging
- **TypeScript**: Type-safe development

### Communication Flow
```
LLM Client ←→ MCP Protocol ←→ Fediverse Client ←→ Remote ActivityPub Servers
                                     ↓
                              WebFinger Discovery
                                     ↓
                              Remote Data Fetching
```

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Setup & Installation](docs/setup/)** - Configuration and installation guides
- **[User Guides](docs/guides/)** - Usage examples and tutorials
- **[Development](docs/development/)** - Development setup and best practices
- **[Specifications](docs/specifications/)** - ActivityPub and protocol specifications

See the [Documentation Index](docs/README.md) for a complete overview.

## Development

### Available Scripts
- `npm run mcp` - Start MCP server
- `npm run mcp:dev` - Start MCP server in watch mode
- `npm run test` - Run tests
- `npm run build` - Build TypeScript

### Environment Variables

Create a `.env` file:

```env
# MCP Server configuration
MCP_SERVER_NAME=activitypub-mcp
MCP_SERVER_VERSION=1.1.0

# Transport configuration (stdio or http)
MCP_TRANSPORT_MODE=stdio
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_CORS_ENABLED=false

# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# Logging
LOG_LEVEL=info

# Audit logging
AUDIT_LOG_ENABLED=true
AUDIT_LOG_MAX_ENTRIES=10000

# Instance blocklist (comma-separated domains)
BLOCKED_INSTANCES=
INSTANCE_BLOCKING_ENABLED=true

# Dynamic instance discovery
INSTANCES_SOCIAL_TOKEN=
DYNAMIC_INSTANCE_CACHE_TTL=3600000

# Content warnings
RESPECT_CONTENT_WARNINGS=true
SHOW_CONTENT_WARNINGS=true

# Authentication (for write operations - v1.1.0)
ACTIVITYPUB_DEFAULT_INSTANCE=mastodon.social
ACTIVITYPUB_DEFAULT_TOKEN=your-oauth-access-token
ACTIVITYPUB_DEFAULT_USERNAME=your-username

# Multi-account configuration (JSON format)
# ACTIVITYPUB_ACCOUNTS='[{"id":"work","instance":"fosstodon.org","token":"token1","username":"work_account"},{"id":"personal","instance":"mastodon.social","token":"token2","username":"personal_account"}]'
```

### HTTP Transport Mode

For production deployments, you can run the server in HTTP mode:

```bash
# Start with HTTP transport
MCP_TRANSPORT_MODE=http MCP_HTTP_PORT=8080 npm run mcp

# The server exposes:
# - /mcp    - MCP protocol endpoint
# - /health - Health check endpoint
# - /metrics - Performance metrics
# - /       - Server info
```

### Testing
```bash
# Test MCP server with inspector
mcp-inspector

# Test fediverse interactions
npm run test

# Manual testing with specific actors
# Use the discover-actor tool to test WebFinger discovery
```

## Cross-Platform Compatibility

This project is designed to work seamlessly across different operating systems:

### Supported Platforms
- **Windows 10/11** (PowerShell, Command Prompt, Git Bash)
- **macOS** (Bash, Zsh)
- **Linux** (Bash, most distributions)

### Platform-Specific Features
- **Automatic script detection**: npm scripts automatically choose the right script for your platform
- **Native path handling**: Proper configuration paths for each platform
- **Shell compatibility**: Both PowerShell (.ps1) and Bash (.sh) scripts provided

### Installation Methods by Platform

| Platform | Recommended Method | Alternative Methods |
|----------|-------------------|-------------------|
| Windows | `npm run setup` | `.\scripts\setup.ps1` or `npm run setup:windows` |
| macOS | `npm run setup` | `bash scripts/setup.sh` or `npm run setup:unix` |
| Linux | `npm run setup` | `bash scripts/setup.sh` or `npm run setup:unix` |

### Troubleshooting Platform Issues

**Windows PowerShell Execution Policy:**
```powershell
# If you get execution policy errors, run:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Windows Git Bash:**
```bash
# Git Bash users can use Unix-style commands:
npm run setup:unix
```

**Linux/macOS Permissions:**
```bash
# If you get permission errors, make scripts executable:
chmod +x scripts/*.sh
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Fedify](https://fedify.dev/) - ActivityPub server framework
- [Model Context Protocol](https://modelcontextprotocol.io/) - LLM integration standard
- [ActivityPub](https://www.w3.org/TR/activitypub/) - W3C decentralized social networking protocol

## Links

- [ActivityPub Specification](https://www.w3.org/TR/activitypub/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Fedify Documentation](https://fedify.dev/)
- [Fediverse](https://fediverse.info/)

---

Made with ❤️ by [Cameron Rye](https://rye.dev/)
