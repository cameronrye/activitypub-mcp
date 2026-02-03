# ActivityPub MCP Server Usage Guide

This comprehensive guide covers everything you need to know about using the ActivityPub MCP Server effectively.

## Quick Start

### 1. Installation

This project supports **Windows**, **macOS**, and **Linux** with automatic platform detection.

#### Option A: Automated Installation (Recommended)

**Universal (All Platforms):**
```bash
# Install for Claude Desktop
npm run install:claude

# Or install for Cursor
npm run install:cursor

# Or use cross-platform shell script
npm run install:shell
```

**Platform-Specific:**
```bash
# Windows (PowerShell)
npm run install:shell:windows

# macOS/Linux (Bash)
npm run install:shell:unix
```

#### Option B: Manual Setup

**Universal (All Platforms):**
```bash
# Clone and setup (auto-detects platform)
git clone https://github.com/cameronrye/activitypub-mcp.git
cd activitypub-mcp
npm run setup

# Start MCP server (no local ActivityPub server needed)
npm run mcp
```

**Windows-Specific:**
```powershell
# Clone and setup
git clone https://github.com/cameronrye/activitypub-mcp.git
cd activitypub-mcp
npm run setup:windows

# Or run PowerShell script directly
.\scripts\setup.ps1

# Start MCP server (no local ActivityPub server needed)
npm run mcp
```

**macOS/Linux-Specific:**
```bash
# Clone and setup
git clone https://github.com/cameronrye/activitypub-mcp.git
cd activitypub-mcp
npm run setup:unix

# Or run bash script directly
bash scripts/setup.sh

# Start MCP server (no local ActivityPub server needed)
npm run mcp
```

### 2. Configuration

Edit `.env` file to customize your setup:

```bash
# MCP Server Configuration
MCP_SERVER_NAME=activitypub-mcp
MCP_SERVER_VERSION=1.1.0

# Transport Mode (stdio or http)
MCP_TRANSPORT_MODE=stdio

# HTTP Transport (when using http mode)
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_CORS_ENABLED=false

# Security & Performance
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# Instance Blocklist
BLOCKED_INSTANCES=spam.example.com,malicious.example.org
INSTANCE_BLOCKING_ENABLED=true

# Audit Logging
AUDIT_LOG_ENABLED=true
AUDIT_LOG_MAX_ENTRIES=10000

# Content Warnings
RESPECT_CONTENT_WARNINGS=true
SHOW_CONTENT_WARNINGS=true

# Logging
LOG_LEVEL=info
```

### 3. Testing Your Setup

```bash
# Run comprehensive tests
npm run test:comprehensive

# Test individual components
npm run test              # Basic MCP tests
npm run test:integration  # Integration tests
```

## Transport Modes

The server supports two transport modes: **stdio** (default) and **HTTP**.

### Stdio Mode (Default)

Standard input/output transport for direct integration with MCP clients:

```bash
npm run mcp
```

### HTTP Mode

HTTP/SSE transport for web-based clients and production deployments:

```bash
# Basic HTTP mode
MCP_TRANSPORT_MODE=http npm run mcp

# Custom port and host
MCP_TRANSPORT_MODE=http MCP_HTTP_PORT=8080 MCP_HTTP_HOST=0.0.0.0 npm run mcp

# With CORS enabled for web clients
MCP_TRANSPORT_MODE=http MCP_HTTP_CORS_ENABLED=true MCP_HTTP_CORS_ORIGINS=https://myapp.com npm run mcp
```

**HTTP Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `/mcp` | MCP protocol endpoint (for MCP clients) |
| `/health` | Health check endpoint (returns server health status) |
| `/metrics` | Performance metrics endpoint |
| `/` | Server info (name, version, available endpoints) |

## MCP Resources

Resources provide **read-only** access to fediverse data from remote ActivityPub servers.

### Server Information
Get comprehensive server details and capabilities:

```typescript
const serverInfo = await client.readResource({
  uri: "activitypub://server-info"
});
```

**Response includes:**
- Server name, version, and description
- Available resources and tools
- Configuration settings
- Current operational status

### Remote Actor Information
Discover and retrieve information about any actor in the fediverse:

```typescript
const actor = await client.readResource({
  uri: "activitypub://remote-actor/Gargron@mastodon.social"
});
```

**Features:**
- Discovers actors via WebFinger protocol
- Returns full ActivityPub actor objects
- Works with any fediverse instance
- Includes rate limiting protection

**Example identifiers:**
- `Gargron@mastodon.social`
- `user@fosstodon.org`
- `developer@hachyderm.io`

### Remote Timeline Access
Access any actor's public timeline/outbox:

```typescript
const timeline = await client.readResource({
  uri: "activitypub://remote-timeline/Gargron@mastodon.social"
});
```

**Capabilities:**
- Fetches real timeline data from remote servers
- Returns ActivityStreams OrderedCollection format
- Includes recent posts and activities
- Respects instance privacy settings

### Instance Information
Get details about any fediverse instance:

```typescript
const instanceInfo = await client.readResource({
  uri: "activitypub://instance-info/mastodon.social"
});
```

**Returns:**
- Instance software and version
- User and post statistics
- Registration status
- Instance description and policies

### Remote Followers/Following

Access social connection lists:

```typescript
// Get followers
const followers = await client.readResource({
  uri: "activitypub://remote-followers/user@example.social"
});

// Get following
const following = await client.readResource({
  uri: "activitypub://remote-following/user@example.social"
});
```

### Trending Content (New in v1.1.0)

Get trending hashtags and posts from an instance:

```typescript
const trending = await client.readResource({
  uri: "activitypub://trending/mastodon.social"
});
```

**Returns:**
- Trending hashtags with usage statistics
- Trending posts with engagement metrics
- Time-based trend data

### Local Timeline (New in v1.1.0)

Access the local public timeline of an instance:

```typescript
const localTimeline = await client.readResource({
  uri: "activitypub://local-timeline/fosstodon.org"
});
```

**Returns:**
- Recent posts from local users only
- Public posts visible on the instance

### Federated Timeline (New in v1.1.0)

Access the federated public timeline:

```typescript
const federatedTimeline = await client.readResource({
  uri: "activitypub://federated-timeline/mastodon.social"
});
```

**Returns:**
- Posts from all federated instances
- Broader view of fediverse activity

### Post Thread (New in v1.1.0)

Get a post with its full conversation thread:

```typescript
const thread = await client.readResource({
  uri: "activitypub://post-thread/https%3A%2F%2Fmastodon.social%2F%40Gargron%2F123456"
});
```

**Returns:**
- Original post
- Parent posts (ancestors)
- Reply posts (descendants)
- Full conversation context

## MCP Tools

Tools enable LLMs to **discover and explore** the fediverse interactively. All tools are **read-only** and designed for content discovery.

### Discover Actor
Find and get information about any actor in the fediverse:

```typescript
const result = await client.callTool({
  name: "discover-actor",
  arguments: {
    identifier: "Gargron@mastodon.social"  // Required: user@domain format
  }
});
```

**Use Cases:**
- Finding interesting people to follow
- Discovering community members
- Researching fediverse personalities
- Exploring social connections

### Fetch Timeline

Retrieve recent posts from any actor's public timeline:

```typescript
const result = await client.callTool({
  name: "fetch-timeline",
  arguments: {
    identifier: "Gargron@mastodon.social",  // Required
    limit: 20,                               // Optional: 1-50, default 20
    cursor: "next_page_cursor",              // Optional: pagination cursor
    minId: "12345",                          // Optional: return results newer than this ID
    maxId: "67890",                          // Optional: return results older than this ID
    sinceId: "11111"                         // Optional: return results since this ID
  }
});
```

**Use Cases:**

- Monitoring specific accounts
- Analyzing posting patterns
- Discovering content topics
- Tracking community discussions
- Paginating through historical posts

### Search Instance
Search for content on a specific fediverse instance:

```typescript
const result = await client.callTool({
  name: "search-instance",
  arguments: {
    domain: "mastodon.social",     // Required
    query: "typescript",            // Required
    type: "accounts"                // Optional: accounts|statuses|hashtags
  }
});
```

**Use Cases:**
- Finding accounts by topic
- Discovering relevant content
- Exploring hashtags
- Researching communities

### Get Instance Info
Get detailed information about a fediverse instance:

```typescript
const result = await client.callTool({
  name: "get-instance-info",
  arguments: {
    domain: "fosstodon.org"  // Required
  }
});
```

**Use Cases:**
- Comparing instances
- Understanding community focus
- Checking registration status
- Researching instance policies

### Discover Instances
Find popular fediverse instances by category or topic:

```typescript
const result = await client.callTool({
  name: "discover-instances",
  arguments: {
    category: "mastodon",        // Optional: mastodon|pleroma|misskey|etc
    topic: "technology",         // Optional
    size: "medium",              // Optional: small|medium|large
    region: "europe",            // Optional
    beginnerFriendly: true       // Optional
  }
});
```

**Use Cases:**
- Finding the right instance to join
- Discovering specialized communities
- Exploring different fediverse platforms
- Researching instance options

### Recommend Instances
Get personalized instance recommendations:

```typescript
const result = await client.callTool({
  name: "recommend-instances",
  arguments: {
    interests: ["technology", "programming", "open source"]  // Required
  }
});
```

**Use Cases:**
- Helping users choose an instance
- Finding communities matching interests
- Discovering niche instances
- Personalized recommendations

### Health Check
Check the MCP server's health status:

```typescript
const result = await client.callTool({
  name: "health-check",
  arguments: {
    includeMetrics: true  // Optional: include performance metrics
  }
});
```

### Performance Metrics

Get detailed performance metrics:

```typescript
const result = await client.callTool({
  name: "performance-metrics",
  arguments: {
    operation: "discover-actor"  // Optional: specific operation
  }
});
```

### Get Trending Hashtags (New in v1.1.0)

Get trending hashtags from an instance:

```typescript
const result = await client.callTool({
  name: "get-trending-hashtags",
  arguments: {
    domain: "mastodon.social",  // Required
    limit: 10                    // Optional: default 10
  }
});
```

### Get Trending Posts (New in v1.1.0)

Get trending posts from an instance:

```typescript
const result = await client.callTool({
  name: "get-trending-posts",
  arguments: {
    domain: "mastodon.social",  // Required
    limit: 20                    // Optional: default 20
  }
});
```

### Get Local Timeline (New in v1.1.0)

Get the local public timeline from an instance:

```typescript
const result = await client.callTool({
  name: "get-local-timeline",
  arguments: {
    domain: "fosstodon.org",    // Required
    limit: 20                    // Optional: default 20
  }
});
```

### Get Federated Timeline (New in v1.1.0)

Get the federated public timeline from an instance:

```typescript
const result = await client.callTool({
  name: "get-federated-timeline",
  arguments: {
    domain: "mastodon.social",  // Required
    limit: 20                    // Optional: default 20
  }
});
```

### Get Post Thread (New in v1.1.0)

Fetch a post with its full conversation thread:

```typescript
const result = await client.callTool({
  name: "get-post-thread",
  arguments: {
    postUrl: "https://mastodon.social/@Gargron/123456"  // Required
  }
});
```

**Returns:**

- The original post
- Ancestor posts (parents in the thread)
- Descendant posts (replies)

### Search Accounts (New in v1.1.0)

Specialized account search:

```typescript
const result = await client.callTool({
  name: "search-accounts",
  arguments: {
    domain: "mastodon.social",  // Required
    query: "developer",          // Required
    limit: 20                    // Optional: default 20
  }
});
```

### Search Hashtags (New in v1.1.0)

Specialized hashtag search:

```typescript
const result = await client.callTool({
  name: "search-hashtags",
  arguments: {
    domain: "mastodon.social",  // Required
    query: "programming",        // Required
    limit: 20                    // Optional: default 20
  }
});
```

### Search Posts (New in v1.1.0)

Specialized post/status search:

```typescript
const result = await client.callTool({
  name: "search-posts",
  arguments: {
    domain: "mastodon.social",  // Required
    query: "typescript tips",    // Required
    limit: 20                    // Optional: default 20
  }
});
```

### Unified Search (NEW)

Search across accounts, posts, and hashtags in a single query:

```typescript
const result = await client.callTool({
  name: "search",
  arguments: {
    domain: "mastodon.social",   // Required: instance to search
    query: "programming",         // Required: search query
    type: "all",                  // Optional: all|accounts|posts|hashtags
    limit: 20,                    // Optional: results per type (1-40)
    resolve: true                 // Optional: attempt WebFinger lookup for remote accounts
  }
});
```

**Use Cases:**

- Quick discovery across all content types
- Finding accounts, posts, and hashtags in one request
- Resolving remote account handles

### Discover Instances Live (New in v1.1.0)

Real-time instance discovery with advanced filters:

```typescript
const result = await client.callTool({
  name: "discover-instances-live",
  arguments: {
    software: "mastodon",        // Optional: filter by software
    language: "en",              // Optional: filter by language
    minUsers: 1000,              // Optional: minimum user count
    allowsRegistration: true,    // Optional: only open registration
    limit: 20                    // Optional: default 20
  }
});
```

**Data Sources:**

- instances.social API (primary)
- Fediverse Observer GraphQL API (fallback)

### Batch Fetch Actors (New in v1.1.0)

Fetch multiple actors in a single request:

```typescript
const result = await client.callTool({
  name: "batch-fetch-actors",
  arguments: {
    identifiers: [
      "Gargron@mastodon.social",
      "admin@fosstodon.org",
      "user@hachyderm.io"
    ]
  }
});
```

**Use Cases:**

- Bulk profile lookups
- Comparing multiple accounts
- Building follow lists

### Batch Fetch Posts (New in v1.1.0)

Fetch multiple posts in a single request:

```typescript
const result = await client.callTool({
  name: "batch-fetch-posts",
  arguments: {
    postUrls: [
      "https://mastodon.social/@Gargron/123",
      "https://fosstodon.org/@admin/456"
    ]
  }
});
```

### Convert URL (New in v1.1.0)

URL conversion utility for ActivityPub URLs:

```typescript
const result = await client.callTool({
  name: "convert-url",
  arguments: {
    url: "https://mastodon.social/@Gargron/123456",
    targetFormat: "activitypub"  // or "web"
  }
});
```

## MCP Prompts

Prompts help LLMs guide users through fediverse exploration.

### Explore Fediverse
Get guidance on exploring the fediverse:

```typescript
const prompt = await client.getPrompt({
  name: "explore-fediverse",
  arguments: {
    interests: "technology and programming",  // Required
    instanceType: "mastodon"                  // Optional
  }
});
```

**Generated prompt helps with:**
- Discovering interesting actors
- Finding relevant instances
- Exploring communities
- Getting started in the fediverse

### Compare Instances
Get help comparing different instances:

```typescript
const prompt = await client.getPrompt({
  name: "compare-instances",
  arguments: {
    instances: "mastodon.social, fosstodon.org, hachyderm.io",  // Required
    criteria: "community size and focus"                         // Optional
  }
});
```

**Generated prompt helps with:**
- Understanding instance differences
- Choosing the right instance
- Comparing features and policies
- Making informed decisions

### Discover Content

Get recommendations for discovering content:

```typescript
const prompt = await client.getPrompt({
  name: "discover-content",
  arguments: {
    topics: "artificial intelligence, machine learning",  // Required
    contentType: "people"                                 // Optional: people|hashtags|instances|all
  }
});
```

**Generated prompt helps with:**

- Finding relevant accounts
- Discovering hashtags
- Exploring topics
- Building a following list

### Compare Accounts (New in v1.1.0)

Compare multiple fediverse accounts side by side:

```typescript
const prompt = await client.getPrompt({
  name: "compare-accounts",
  arguments: {
    accounts: "Gargron@mastodon.social, admin@fosstodon.org"  // Required: comma-separated
  }
});
```

**Generated prompt helps with:**

- Comparing posting frequency
- Analyzing content focus
- Understanding engagement patterns
- Evaluating account activity

### Analyze User Activity (New in v1.1.0)

Get detailed analysis of a user's activity:

```typescript
const prompt = await client.getPrompt({
  name: "analyze-user-activity",
  arguments: {
    identifier: "Gargron@mastodon.social"  // Required
  }
});
```

**Generated prompt helps with:**

- Understanding posting patterns
- Identifying topics of interest
- Analyzing engagement metrics
- Profiling user behavior

### Find Experts (New in v1.1.0)

Find experts on specific topics in the fediverse:

```typescript
const prompt = await client.getPrompt({
  name: "find-experts",
  arguments: {
    topic: "rust programming",      // Required
    instance: "fosstodon.org"       // Optional: limit to specific instance
  }
});
```

**Generated prompt helps with:**

- Discovering thought leaders
- Finding domain experts
- Building curated follow lists
- Research and learning

### Summarize Trending (New in v1.1.0)

Get a summary of what's trending:

```typescript
const prompt = await client.getPrompt({
  name: "summarize-trending",
  arguments: {
    domain: "mastodon.social",  // Required
    category: "hashtags"         // Optional: hashtags|posts|all
  }
});
```

**Generated prompt helps with:**

- Understanding current discussions
- Identifying hot topics
- Tracking community trends
- Content discovery

### Content Strategy (New in v1.1.0)

Plan your fediverse content strategy:

```typescript
const prompt = await client.getPrompt({
  name: "content-strategy",
  arguments: {
    topics: "programming, open source",    // Required
    targetAudience: "developers",          // Optional
    postingFrequency: "several-per-week",  // Optional: daily|several-per-week|weekly|occasional
    instances: "fosstodon.org"             // Optional: instances to analyze
  }
});
```

**Generated prompt helps with:**

- Content pillar development
- Hashtag strategy
- Optimal posting times
- Audience engagement

### Community Health (New in v1.1.0)

Analyze instance moderation and community health:

```typescript
const prompt = await client.getPrompt({
  name: "community-health",
  arguments: {
    instance: "fosstodon.org",             // Required
    concerns: "moderation, spam"           // Optional: specific concerns to investigate
  }
});
```

**Generated prompt helps with:**

- Instance moderation assessment
- Community culture analysis
- Red/green flag identification
- Instance selection decisions

### Migration Helper (New in v1.1.0)

Plan a migration to a new fediverse instance:

```typescript
const prompt = await client.getPrompt({
  name: "migration-helper",
  arguments: {
    currentInstance: "mastodon.social",     // Optional
    targetInstance: "fosstodon.org",        // Optional
    priorities: "moderation, privacy",      // Required
    currentFollowers: 500                   // Optional
  }
});
```

**Generated prompt helps with:**

- Instance comparison
- Migration planning
- Pre-migration checklist
- Follower preservation

### Thread Composer (New in v1.1.0)

Compose well-structured threaded posts:

```typescript
const prompt = await client.getPrompt({
  name: "thread-composer",
  arguments: {
    topic: "Introduction to the Fediverse",              // Required
    keyPoints: "What is ActivityPub, Getting started",   // Required
    tone: "informative",                                  // Optional: informative|casual|professional|persuasive|storytelling
    targetLength: "medium",                               // Optional: short (3-5)|medium (6-10)|long (11+)
    includeHashtags: true,                                // Optional
    contentWarning: "tech discussion"                     // Optional
  }
});
```

**Generated prompt helps with:**

- Thread structure planning
- Post length management
- Hashtag recommendations
- Content warning usage

## Authenticated Write Operations (New in v1.1.0)

The authenticated tools enable write operations on your fediverse account. Configure authentication via environment variables.

### Authentication Setup

```bash
# Single account configuration
ACTIVITYPUB_DEFAULT_INSTANCE=mastodon.social
ACTIVITYPUB_DEFAULT_TOKEN=your-oauth-access-token
ACTIVITYPUB_DEFAULT_USERNAME=your-username

# Multi-account configuration (JSON format)
ACTIVITYPUB_ACCOUNTS='[{"id":"work","instance":"fosstodon.org","token":"token1","username":"work_account"},{"id":"personal","instance":"mastodon.social","token":"token2","username":"personal_account"}]'
```

### Account Management Tools

```typescript
// List configured accounts
const result = await client.callTool({
  name: "list-accounts",
  arguments: {}
});

// Switch active account
const result = await client.callTool({
  name: "switch-account",
  arguments: {
    accountId: "work"  // Account ID from configuration
  }
});

// Verify account credentials
const result = await client.callTool({
  name: "verify-account",
  arguments: {}
});
```

### Posting Tools

```typescript
// Create a new post
const result = await client.callTool({
  name: "post-status",
  arguments: {
    content: "Hello Fediverse!",     // Required: post content
    visibility: "public",            // Optional: public|unlisted|private|direct
    contentWarning: "Tech talk",     // Optional: CW/spoiler text
    sensitive: false,                // Optional: mark media as sensitive
    language: "en"                   // Optional: ISO 639-1 language code
  }
});

// Reply to a post
const result = await client.callTool({
  name: "reply-to-post",
  arguments: {
    postId: "123456789",             // Required: ID of post to reply to
    content: "Great post!",          // Required: reply content
    visibility: "public"             // Optional
  }
});

// Delete your own post
const result = await client.callTool({
  name: "delete-post",
  arguments: {
    postId: "123456789"              // Required: ID of post to delete
  }
});
```

### Interaction Tools

```typescript
// Boost/reblog a post
const result = await client.callTool({
  name: "boost-post",
  arguments: { postId: "123456789" }
});

// Unboost a post
const result = await client.callTool({
  name: "unboost-post",
  arguments: { postId: "123456789" }
});

// Favourite a post
const result = await client.callTool({
  name: "favourite-post",
  arguments: { postId: "123456789" }
});

// Bookmark a post
const result = await client.callTool({
  name: "bookmark-post",
  arguments: { postId: "123456789" }
});
```

### Relationship Tools

```typescript
// Check relationship status with accounts (NEW)
const result = await client.callTool({
  name: "get-relationship",
  arguments: {
    accountIds: ["123456789", "987654321"]  // Required: array of account IDs
  }
});
// Returns: following, followed_by, blocking, muting, requested status for each

// Follow an account
const result = await client.callTool({
  name: "follow-account",
  arguments: {
    accountId: "123456789",          // Required: account ID to follow
    reblogs: true,                   // Optional: show reblogs in home timeline
    notify: false                    // Optional: receive notifications for posts
  }
});

// Unfollow an account
const result = await client.callTool({
  name: "unfollow-account",
  arguments: { accountId: "123456789" }
});

// Mute an account
const result = await client.callTool({
  name: "mute-account",
  arguments: {
    accountId: "123456789",
    notifications: true,             // Optional: also mute notifications
    duration: 86400                  // Optional: mute duration in seconds
  }
});

// Block an account
const result = await client.callTool({
  name: "block-account",
  arguments: { accountId: "123456789" }
});
```

### Poll Tools (NEW)

```typescript
// Vote on a poll
const result = await client.callTool({
  name: "vote-on-poll",
  arguments: {
    pollId: "123456789",       // Required: poll ID
    choices: [0, 2]            // Required: array of choice indices (0-based)
  }
});
// Returns: updated poll with vote counts and visual bar chart
```

### Media Tools (NEW)

```typescript
// Upload media file
const result = await client.callTool({
  name: "upload-media",
  arguments: {
    filePath: "/path/to/image.jpg",           // Required: file path or URL
    description: "A sunset over mountains",   // Optional: alt text (recommended)
    focus: "0.0,0.5"                          // Optional: focal point x,y (-1.0 to 1.0)
  }
});
// Returns: media attachment with ID to use in post-status
```

### Scheduling Tools (NEW)

```typescript
// Get all scheduled posts
const result = await client.callTool({
  name: "get-scheduled-posts",
  arguments: {
    limit: 20,                       // Optional: number of posts (default: 20)
    maxId: "123456789"               // Optional: for pagination
  }
});

// Update scheduled post time
const result = await client.callTool({
  name: "update-scheduled-post",
  arguments: {
    scheduledPostId: "123456789",                    // Required: scheduled post ID
    scheduledAt: "2026-02-14T18:00:00.000Z"         // Required: new ISO 8601 datetime
  }
});

// Cancel a scheduled post
const result = await client.callTool({
  name: "cancel-scheduled-post",
  arguments: {
    scheduledPostId: "123456789"     // Required: scheduled post ID to cancel
  }
});
```

### Authenticated Timelines

```typescript
// Get home timeline
const result = await client.callTool({
  name: "get-home-timeline",
  arguments: {
    limit: 20,                       // Optional: number of posts (default: 20)
    maxId: "123456789"               // Optional: for pagination
  }
});

// Get notifications
const result = await client.callTool({
  name: "get-notifications",
  arguments: {
    limit: 20,
    types: ["mention", "favourite"]  // Optional: filter by type
  }
});

// Get bookmarks
const result = await client.callTool({
  name: "get-bookmarks",
  arguments: { limit: 20 }
});

// Get favourites
const result = await client.callTool({
  name: "get-favourites",
  arguments: { limit: 20 }
});
```

## Content Export Tools (New in v1.1.0)

Export fediverse content in multiple formats for backup, analysis, or archival purposes.

### Export Timeline

```typescript
const result = await client.callTool({
  name: "export-timeline",
  arguments: {
    identifier: "user@mastodon.social",  // Required: actor identifier
    format: "markdown",                   // Optional: json|markdown|csv (default: json)
    limit: 50,                            // Optional: number of posts (default: 20)
    includeMedia: false                   // Optional: include media URLs
  }
});
```

### Export Thread

```typescript
const result = await client.callTool({
  name: "export-thread",
  arguments: {
    postUrl: "https://mastodon.social/@user/123456",  // Required
    format: "markdown",                                // Optional: json|markdown|csv
    includeContext: true                               // Optional: include ancestors
  }
});
```

### Export Account Info

```typescript
const result = await client.callTool({
  name: "export-account-info",
  arguments: {
    identifier: "user@mastodon.social",  // Required
    format: "json",                       // Optional: json|markdown
    includeStats: true                    // Optional: include follower/following counts
  }
});
```

### Export Hashtag

```typescript
const result = await client.callTool({
  name: "export-hashtag",
  arguments: {
    domain: "mastodon.social",           // Required: instance to search
    hashtag: "programming",               // Required: hashtag (without #)
    format: "csv",                        // Optional: json|markdown|csv
    limit: 100                            // Optional: number of posts
  }
});
```

## Security & Administration

### Instance Blocklist (New in v1.1.0)

Block specific fediverse instances by domain:

```bash
# Configure via environment variable
BLOCKED_INSTANCES=spam.example.com,malicious.example.org
INSTANCE_BLOCKING_ENABLED=true
```

**Features:**

- Block by exact domain or wildcard pattern (e.g., `*.badnetwork.example`)
- Multiple block reasons: policy, user, safety, spam, federation, custom
- Expiration support for temporary blocks
- Import/export blocklist as JSON

### Audit Logging (New in v1.1.0)

Comprehensive logging of all operations:

```bash
# Enable audit logging
AUDIT_LOG_ENABLED=true
AUDIT_LOG_MAX_ENTRIES=10000
```

**Tracked Events:**

- `tool_invocation` - Tool calls and their results
- `resource_access` - Resource reads
- `rate_limit_exceeded` - Rate limit violations
- `blocked_instance` - Blocked instance access attempts
- `ssrf_blocked` - SSRF protection triggers
- `error` - Error events

**Sensitive Data Handling:**

The audit logger automatically redacts sensitive fields containing:
- password, token, secret, key, auth, credential

### Content Warnings (New in v1.1.0)

Configure how content warnings are handled:

```bash
# Respect content warnings in output
RESPECT_CONTENT_WARNINGS=true

# Include content warnings in responses
SHOW_CONTENT_WARNINGS=true
```

### Rate Limiting

Protects against abuse with configurable limits:

- **Default**: 100 requests per 15 minutes per identifier
- **Scope**: Applied per actor identifier or 'anonymous'
- **Configuration**: Set via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW`
- **Behavior**: Returns clear error messages when exceeded

### Input Validation
Comprehensive validation for all inputs:

- **Actor Identifiers**: Format validation (user@domain.com), length limits
- **Domain Names**: DNS-compliant format validation
- **Query Strings**: Length validation, sanitization
- **Error Handling**: Structured error responses with clear messages

**Valid identifier format:**
```
user@domain.com
username@mastodon.social
developer@fosstodon.org
```

### Error Handling
Robust error handling throughout:

```typescript
// Errors are returned as structured MCP errors
{
  "error": {
    "code": "InvalidParams",
    "message": "Invalid actor identifier format. Expected: user@domain.com"
  }
}
```

**Common error codes:**
- `InvalidParams` - Invalid input parameters
- `InternalError` - Server-side errors (rate limits, network issues)

## Testing & Development

### Running Tests

```bash
# Full test suite
npm run test:all

# Individual test suites
npm run test:comprehensive  # Complete functionality tests
npm run test:fediverse     # Fediverse client tests
npm run test:integration   # Integration tests
npm run test               # Basic MCP tests
```

### Development Mode

```bash
# Start MCP server with auto-reload
npm run mcp:dev

# Run tests in watch mode
npm run test -- --watch
```

### Debugging

Enable detailed logging:

```bash
# Set environment variables
LOG_LEVEL=debug
DEBUG=true

# View logs
tail -f logs/activitypub-mcp.log
```

## Troubleshooting

### Common Issues

#### "Rate limit exceeded"
- **Cause**: Too many requests from same identifier
- **Solution**: Wait for rate limit window to reset (15 minutes) or increase limits in `.env`

#### "Invalid actor identifier"
- **Cause**: Identifier format is incorrect
- **Solution**: Use format `user@domain.com` (e.g., `Gargron@mastodon.social`)

#### "Actor not found"
- **Cause**: Actor doesn't exist on the remote server or server is unreachable
- **Solution**: Verify the identifier is correct and the instance is online

#### "Failed to fetch remote actor"
- **Cause**: Network issues, instance down, or WebFinger not configured
- **Solution**:
  - Check if the instance is accessible in a browser
  - Verify the actor exists on that instance
  - Try a different instance

#### "Connection timeout"
- **Cause**: Remote server is slow or unreachable
- **Solution**: Increase `REQUEST_TIMEOUT` in config or try again later

### Cross-Platform Issues

#### Windows PowerShell Execution Policy
- **Cause**: PowerShell blocks script execution by default
- **Solution**:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

#### Windows Path Issues
- **Cause**: Different path formats between Windows and Unix systems
- **Solution**: Use the Node.js installer scripts instead of shell scripts:
  ```bash
  npm run install:claude  # Instead of shell scripts
  npm run setup          # Instead of bash scripts
  ```

#### Linux/macOS Permission Issues
- **Cause**: Scripts don't have execute permissions
- **Solution**:
  ```bash
  chmod +x scripts/*.sh
  ```

#### Git Bash on Windows
- **Cause**: Git Bash may have different environment variables
- **Solution**: Use Unix-style commands in Git Bash:
  ```bash
  npm run setup:unix
  npm run install:shell:unix
  ```

### Logs and Monitoring

Check logs for detailed error information:

```bash
# View recent logs
tail -f logs/activitypub-mcp.log

# Search for errors
grep "ERROR" logs/activitypub-mcp.log

# Monitor in real-time
npm run dev --verbose
```

### Performance Optimization

For production deployments:

```bash
# Use production mode
npm run prod

# Enable performance monitoring
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
```

## Integration Examples

### Claude Desktop Integration
The server automatically integrates with Claude Desktop when installed via:

```bash
npm run install:claude
```

Configuration is added to `claude_desktop_config.json`:

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

### Custom Client Integration

For custom MCP clients using stdio transport:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["activitypub-mcp"]
});

const client = new Client({
  name: "my-activitypub-client",
  version: "1.0.0"
});

await client.connect(transport);
```

For HTTP transport (New in v1.1.0):

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Start server with: MCP_TRANSPORT_MODE=http npm run mcp
const transport = new SSEClientTransport(
  new URL("http://localhost:3000/mcp")
);

const client = new Client({
  name: "my-activitypub-client",
  version: "1.0.0"
});

await client.connect(transport);
```

## Best Practices

### Actor Management
- Use descriptive but concise identifiers
- Provide meaningful names and summaries
- Follow community naming conventions

### Content Creation
- Keep posts within reasonable length limits
- Use appropriate visibility settings (to/cc)
- Include relevant context for replies

### Error Handling
- Always check for error responses
- Implement retry logic for transient failures
- Log errors for debugging

### Performance
- Respect rate limits
- Cache frequently accessed data
- Use appropriate timeouts

## Contributing

See the main [README.md](../../README.md) for contribution guidelines and development setup instructions.

## Additional Resources

- [ActivityPub Specification](https://www.w3.org/TR/activitypub/)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Fedify Framework](https://fedify.dev/)
- [Project Repository](https://github.com/cameronrye/activitypub-mcp)
