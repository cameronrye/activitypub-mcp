# ActivityPub MCP Server Examples

This document provides practical examples of using the ActivityPub MCP Server with LLMs like Claude to **explore and discover content** in the existing Fediverse.

## 🚀 Getting Started

### 1. Start the MCP Server

```bash
# Start the MCP server (no local ActivityPub server needed)
npm run mcp
```

**Important**: This project is a **read-only fediverse CLIENT** designed for LLMs to explore existing ActivityPub servers. It does NOT create actors, posts, or perform write operations. It enables LLMs to discover and analyze content across the fediverse.

### 2. Connect with MCP Inspector

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Connect to the server
mcp-inspector
```

### 3. Use with Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

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

## 📖 MCP Resources Examples

Resources provide read-only access to fediverse data. All resources return JSON data.

### Get Server Information

**Request:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "activitypub://server-info"
  }
}
```

**Response:**
```json
{
  "name": "activitypub-mcp",
  "version": "1.0.0",
  "description": "A Model Context Protocol server for exploring and interacting with the existing Fediverse",
  "capabilities": {
    "resources": [
      "remote-actor",
      "remote-timeline",
      "instance-info",
      "remote-followers",
      "remote-following"
    ],
    "tools": [
      "discover-actor",
      "fetch-timeline",
      "search-instance",
      "get-instance-info",
      "discover-instances",
      "recommend-instances"
    ]
  }
}
```

### Get Remote Actor Information

Discover any actor in the fediverse using their handle (e.g., `user@mastodon.social`).

**Request:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "activitypub://remote-actor/Gargron@mastodon.social"
  }
}
```

**Response:**
```json
{
  "@context": ["https://www.w3.org/ns/activitystreams"],
  "id": "https://mastodon.social/users/Gargron",
  "type": "Person",
  "preferredUsername": "Gargron",
  "name": "Eugen Rochko",
  "summary": "Founder and lead developer of Mastodon",
  "inbox": "https://mastodon.social/users/Gargron/inbox",
  "outbox": "https://mastodon.social/users/Gargron/outbox",
  "followers": "https://mastodon.social/users/Gargron/followers",
  "following": "https://mastodon.social/users/Gargron/following"
}
```

### Get Remote Actor Timeline

Fetch posts from any actor's public timeline.

**Request:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "activitypub://remote-timeline/Gargron@mastodon.social"
  }
}
```

**Response:**
```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "id": "https://mastodon.social/users/Gargron/outbox",
  "totalItems": 42,
  "orderedItems": [
    {
      "type": "Create",
      "actor": "https://mastodon.social/users/Gargron",
      "object": {
        "type": "Note",
        "content": "Hello Fediverse!",
        "published": "2024-01-15T10:30:00Z"
      }
    }
  ]
}
```

### Get Instance Information

Get details about any fediverse instance.

**Request:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "activitypub://instance-info/mastodon.social"
  }
}
```

**Response:**
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

### Get Remote Followers

Access an actor's followers list.

**Request:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "activitypub://remote-followers/user@example.social"
  }
}
```

### Get Remote Following

Access who an actor is following.

**Request:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "activitypub://remote-following/user@example.social"
  }
}
```

## 🔧 MCP Tools Examples

Tools enable LLMs to discover and explore the fediverse interactively.

### Discover Actor

Find and get information about any actor in the fediverse.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "discover-actor",
    "arguments": {
      "identifier": "Gargron@mastodon.social"
    }
  }
}
```

**Response:**
```
Successfully discovered actor: Gargron

🆔 ID: https://mastodon.social/users/Gargron
👤 Name: Eugen Rochko
📝 Summary: Founder and lead developer of Mastodon
🔗 URL: https://mastodon.social/@Gargron
📥 Inbox: https://mastodon.social/users/Gargron/inbox
📤 Outbox: https://mastodon.social/users/Gargron/outbox
```

### Fetch Timeline

Fetch recent posts from any actor's timeline.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "fetch-timeline",
    "arguments": {
      "identifier": "Gargron@mastodon.social",
      "limit": 20
    }
  }
}
```

**Response:**
```
Successfully fetched timeline for Gargron@mastodon.social

📊 Total items: 1234
📝 Posts retrieved: 20
🔗 Timeline ID: https://mastodon.social/users/Gargron/outbox

Recent posts:
1. Note: Working on some exciting new features...
2. Note: Thanks everyone for the feedback!
...
```

### Search Instance

Search for content on a specific fediverse instance.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "search-instance",
    "arguments": {
      "domain": "mastodon.social",
      "query": "typescript",
      "type": "accounts"
    }
  }
}
```

**Response:**
```json
{
  "accounts": [
    {
      "id": "123",
      "username": "typescript_dev",
      "display_name": "TypeScript Developer",
      "url": "https://mastodon.social/@typescript_dev"
    }
  ]
}
```

### Get Instance Info

Get detailed information about a fediverse instance.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "get-instance-info",
    "arguments": {
      "domain": "fosstodon.org"
    }
  }
}
```

**Response:**
```
Instance Information for fosstodon.org:

🌐 Domain: fosstodon.org
💻 Software: mastodon
📦 Version: 4.2.0
📝 Description: A community for FOSS enthusiasts
🌍 Languages: en
📝 Registrations: Open
✅ Approval Required: Yes

📊 Statistics:
👥 Users: 50000
📝 Posts: 2000000
🌐 Domains: 15000
```

### Discover Instances

Find popular fediverse instances by category or topic.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "discover-instances",
    "arguments": {
      "category": "mastodon",
      "topic": "technology",
      "size": "medium"
    }
  }
}
```

**Response:**
```
Found 15 fediverse instances (showing first 15):

1. **fosstodon.org** (mastodon)
   👥 Users: 50000
   📝 A community for FOSS enthusiasts

2. **hachyderm.io** (mastodon)
   👥 Users: 30000
   📝 Safe space for tech professionals
...
```

### Recommend Instances

Get personalized instance recommendations based on interests.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "recommend-instances",
    "arguments": {
      "interests": ["technology", "programming", "open source"]
    }
  }
}
```

**Response:**
```
Based on your interests (technology, programming, open source), here are some recommended fediverse instances:

1. **fosstodon.org** (mastodon)
   👥 Users: 50000
   📝 A community for FOSS enthusiasts
   🎯 Why recommended: Matches your interest in open source
...
```

## 💬 MCP Prompts Examples

Prompts help LLMs guide users through fediverse exploration.

### Explore Fediverse

**Request:**
```json
{
  "method": "prompts/get",
  "params": {
    "name": "explore-fediverse",
    "arguments": {
      "interests": "technology and programming",
      "instanceType": "mastodon"
    }
  }
}
```

**Generated Prompt:**
```
I'm interested in exploring the fediverse, particularly content related to: technology and programming. I prefer mastodon instances. Can you help me discover interesting actors, instances, and communities to follow? Please suggest specific usernames and instances I should check out.
```

### Compare Instances

**Request:**
```json
{
  "method": "prompts/get",
  "params": {
    "name": "compare-instances",
    "arguments": {
      "instances": "mastodon.social, fosstodon.org, hachyderm.io",
      "criteria": "community size and focus"
    }
  }
}
```

**Generated Prompt:**
```
Please help me compare these fediverse instances: mastodon.social, fosstodon.org, hachyderm.io. I'm particularly interested in: community size and focus. What are the key differences, strengths, and characteristics of each instance? Which one might be best for different types of users?
```

### Discover Content

**Request:**
```json
{
  "method": "prompts/get",
  "params": {
    "name": "discover-content",
    "arguments": {
      "topics": "artificial intelligence, machine learning",
      "contentType": "people"
    }
  }
}
```

**Generated Prompt:**
```
I want to discover people related to "artificial intelligence, machine learning" in the fediverse. Can you suggest specific accounts to follow that would be interesting for someone interested in artificial intelligence, machine learning?
```

## 🤖 LLM Integration Examples

These examples show how LLMs can use the MCP server to explore and discover content in the fediverse.

### Example 1: Fediverse Explorer Assistant

Help users discover interesting people and content in the fediverse.

```typescript
// Natural language interaction with Claude
// User: "Help me find interesting people in the tech community on Mastodon"

// Claude uses the MCP server to:

// 1. Discover popular tech-focused instances
const instances = await mcpClient.callTool("discover-instances", {
  category: "mastodon",
  topic: "technology"
});

// 2. Get recommendations based on interests
const recommendations = await mcpClient.callTool("recommend-instances", {
  interests: ["technology", "programming", "open source"]
});

// 3. Explore specific instances
for (const instance of recommendations) {
  const info = await mcpClient.callTool("get-instance-info", {
    domain: instance.domain
  });

  // 4. Search for interesting accounts
  const accounts = await mcpClient.callTool("search-instance", {
    domain: instance.domain,
    query: "developer",
    type: "accounts"
  });

  // 5. Discover specific actors
  for (const account of accounts.slice(0, 5)) {
    const actor = await mcpClient.callTool("discover-actor", {
      identifier: `${account.username}@${instance.domain}`
    });

    // Present findings to user
    console.log(`Found: ${actor.name} - ${actor.summary}`);
  }
}
```

### Example 2: Content Discovery and Analysis

Monitor and analyze content from specific actors or communities.

```typescript
// Natural language interaction with Claude
// User: "Show me what Eugen Rochko has been posting about lately"

// Claude uses the MCP server to:

// 1. Discover the actor
const actor = await mcpClient.callTool("discover-actor", {
  identifier: "Gargron@mastodon.social"
});

// 2. Fetch their recent timeline
const timeline = await mcpClient.callTool("fetch-timeline", {
  identifier: "Gargron@mastodon.social",
  limit: 20
});

// 3. Analyze the content
const posts = timeline.orderedItems || [];
const topics = new Set();
const mentions = new Set();

for (const item of posts) {
  // Extract topics, hashtags, mentions
  if (item.object?.tag) {
    for (const tag of item.object.tag) {
      if (tag.type === "Hashtag") {
        topics.add(tag.name);
      }
    }
  }
}

// 4. Present analysis to user
console.log(`Recent activity from ${actor.name}:`);
console.log(`- ${posts.length} posts analyzed`);
console.log(`- Topics: ${Array.from(topics).join(", ")}`);
console.log(`- Most recent: ${posts[0]?.object?.content}`);
```

### Example 3: Instance Comparison Tool

Help users choose the right fediverse instance for their needs.

```typescript
// Natural language interaction with Claude
// User: "Compare mastodon.social, fosstodon.org, and hachyderm.io for me"

// Claude uses the MCP server to:

const instancesToCompare = [
  "mastodon.social",
  "fosstodon.org",
  "hachyderm.io"
];

const comparison = [];

for (const domain of instancesToCompare) {
  // Get detailed instance information
  const info = await mcpClient.callTool("get-instance-info", {
    domain: domain
  });

  comparison.push({
    domain: info.domain,
    software: info.software,
    users: info.stats?.user_count,
    posts: info.stats?.status_count,
    description: info.description,
    registrations: info.registrations,
    languages: info.languages
  });
}

// Present comparison to user
console.log("Instance Comparison:");
for (const instance of comparison) {
  console.log(`\n${instance.domain}:`);
  console.log(`  Users: ${instance.users?.toLocaleString()}`);
  console.log(`  Posts: ${instance.posts?.toLocaleString()}`);
  console.log(`  Open Registration: ${instance.registrations ? "Yes" : "No"}`);
  console.log(`  Focus: ${instance.description}`);
}
```

### Example 4: Network Analysis

Explore social connections and community structure.

```typescript
// Natural language interaction with Claude
// User: "Who does @user@example.social follow in the tech community?"

// Claude uses the MCP server to:

// 1. Get the actor's following list
const following = await mcpClient.readResource(
  "activitypub://remote-following/user@example.social"
);

// 2. Analyze each followed account
const techAccounts = [];

for (const followedUrl of following.orderedItems?.slice(0, 50) || []) {
  try {
    // Extract identifier from URL and discover actor
    const actor = await mcpClient.callTool("discover-actor", {
      identifier: extractIdentifierFromUrl(followedUrl)
    });

    // Check if tech-related based on bio
    if (actor.summary?.toLowerCase().includes("developer") ||
        actor.summary?.toLowerCase().includes("programmer") ||
        actor.summary?.toLowerCase().includes("engineer")) {
      techAccounts.push({
        name: actor.name,
        username: actor.preferredUsername,
        summary: actor.summary
      });
    }
  } catch (error) {
    // Skip if actor can't be discovered
    continue;
  }
}

// Present findings
console.log(`Found ${techAccounts.length} tech-related accounts:`);
for (const account of techAccounts.slice(0, 10)) {
  console.log(`- ${account.name} (@${account.username})`);
  console.log(`  ${account.summary}`);
}
```

## 🗣️ Natural Language Usage with Claude

When using this MCP server with Claude Desktop, you can interact naturally:

### Example Conversations

**User:** "Find me some interesting people in the Rust programming community on Mastodon"

**Claude (using MCP tools):**
```
I'll help you discover Rust developers on Mastodon!

[Uses discover-instances with topic="rust"]
[Uses search-instance on rust-focused instances]
[Uses discover-actor for found accounts]

Here are some interesting Rust community members I found:
1. @rustlang@fosstodon.org - Official Rust language account
2. @user@hachyderm.io - Rust core team member
...
```

**User:** "What has Eugen been posting about lately?"

**Claude (using MCP tools):**
```
Let me check Eugen Rochko's recent activity...

[Uses discover-actor for "Gargron@mastodon.social"]
[Uses fetch-timeline to get recent posts]

Based on his last 20 posts, Eugen has been discussing:
- New Mastodon features in development
- Fediverse growth and statistics
- Community moderation improvements
...
```

**User:** "Compare mastodon.social and fosstodon.org - which should I join?"

**Claude (using MCP tools):**
```
I'll compare these two instances for you...

[Uses get-instance-info for both domains]

Here's what I found:

mastodon.social:
- Largest general-purpose instance
- 900,000+ users
- Open registration
- General topics

fosstodon.org:
- FOSS-focused community
- 50,000+ users
- Registration requires approval
- Tech and open source focus

Recommendation: If you're interested in FOSS and want a more focused community...
```

## 🧪 Testing Examples

### Test MCP Server with Inspector

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Start inspector and connect to the server
mcp-inspector

# In the inspector, try these commands:
# 1. List available resources
# 2. Call discover-actor tool
# 3. Read remote-actor resource
```

### Test with Real Fediverse Data

```bash
# Run comprehensive tests
npm run test:comprehensive

# Test fediverse client functionality
npm run test:fediverse

# Run all tests
npm run test:all
```

### Manual Testing with curl

Test remote ActivityPub servers directly:

```bash
# Discover an actor via WebFinger
curl "https://mastodon.social/.well-known/webfinger?resource=acct:Gargron@mastodon.social"

# Fetch actor information
curl -H "Accept: application/activity+json" https://mastodon.social/users/Gargron

# Fetch actor's outbox
curl -H "Accept: application/activity+json" https://mastodon.social/users/Gargron/outbox
```

## 🔗 Integration Patterns

### Pattern 1: Discovery and Exploration
```
User Question → LLM (Claude) → MCP Client → MCP Server → Remote Fediverse Servers
                                                              ↓
User Answer ← LLM Analysis ← MCP Response ← ActivityPub Data
```

**Use Cases:**
- Finding interesting accounts to follow
- Discovering communities and instances
- Exploring topics and hashtags
- Analyzing social connections

### Pattern 2: Content Monitoring
```
LLM → MCP Server → Fetch Timelines → Analyze Content → Present Insights
```

**Use Cases:**
- Tracking specific accounts
- Monitoring topics or hashtags
- Analyzing posting patterns
- Discovering trending content

### Pattern 3: Instance Research
```
LLM → MCP Server → Query Multiple Instances → Compare Data → Recommendations
```

**Use Cases:**
- Choosing an instance to join
- Understanding instance policies
- Comparing community sizes
- Finding specialized communities

## 📚 Additional Resources

### Protocol Specifications
- [ActivityPub Specification](https://www.w3.org/TR/activitypub/) - W3C standard for decentralized social networking
- [ActivityStreams Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/) - Data format for social activities
- [WebFinger Protocol](https://tools.ietf.org/html/rfc7033) - Actor discovery mechanism
- [Model Context Protocol](https://modelcontextprotocol.io/) - LLM integration standard

### Fediverse Resources
- [Fediverse.info](https://fediverse.info/) - General information about the fediverse
- [Fediverse Observer](https://fediverse.observer/) - Instance statistics and monitoring
- [Join Mastodon](https://joinmastodon.org/) - Find Mastodon instances

### Development Resources
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) - Build MCP servers
- [ActivityPub Rocks!](https://activitypub.rocks/) - Test suite and validator
- [Mastodon API Documentation](https://docs.joinmastodon.org/api/) - API reference

## 🎯 Best Practices

### For LLM Interactions

1. **Start Broad, Then Narrow**: Begin with instance discovery, then explore specific actors
2. **Respect Rate Limits**: The server has built-in rate limiting to protect remote servers
3. **Cache Results**: Actor and instance information doesn't change frequently
4. **Handle Errors Gracefully**: Not all instances support all features

### For Developers

1. **Use Proper Identifiers**: Always use full handles (user@domain.com)
2. **Check Resource Availability**: Not all actors have public timelines
3. **Validate Domains**: Ensure domain names are properly formatted
4. **Monitor Performance**: Use the health-check and performance-metrics tools

## 🤝 Contributing

Contributions are welcome! See the main [README.md](../../README.md) for:
- Development setup instructions
- Contribution guidelines
- Code style requirements
- Testing procedures

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](../../LICENSE) file for details.
