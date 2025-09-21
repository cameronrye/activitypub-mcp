# ActivityPub MCP Server Examples

This document provides practical examples of using the ActivityPub MCP Server with LLMs like Claude.

## 🚀 Getting Started

### 1. Start the Servers

```bash
# Terminal 1: Start ActivityPub server
npm run dev

# Terminal 2: Start MCP server  
npm run mcp
```

### 2. Connect with MCP Inspector

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Connect to the server
mcp-inspector
```

## 📖 MCP Resources Examples

### Get Server Information
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
  "name": "ActivityPub MCP Server",
  "version": "1.0.0",
  "description": "A Model Context Protocol server for ActivityPub interactions",
  "baseUrl": "http://localhost:8000",
  "capabilities": ["actor-creation", "post-creation", "following", "likes", "shares"],
  "protocols": ["activitypub", "webfinger"]
}
```

### Get Actor Information
```json
{
  "method": "resources/read", 
  "params": {
    "uri": "activitypub://actor/john"
  }
}
```

**Response:**
```json
{
  "@context": ["https://www.w3.org/ns/activitystreams", "..."],
  "id": "http://localhost:8000/users/john",
  "type": "Person",
  "name": "john",
  "preferredUsername": "john"
}
```

### Get Actor Timeline
```json
{
  "method": "resources/read",
  "params": {
    "uri": "activitypub://timeline/john"
  }
}
```

## 🔧 MCP Tools Examples

### Create a New Actor
```json
{
  "method": "tools/call",
  "params": {
    "name": "create-actor",
    "arguments": {
      "identifier": "alice",
      "name": "Alice Smith", 
      "summary": "Software developer passionate about decentralized social networks"
    }
  }
}
```

### Create a Post
```json
{
  "method": "tools/call",
  "params": {
    "name": "create-post",
    "arguments": {
      "actor": "alice",
      "content": "Hello Fediverse! 👋 Excited to be part of this decentralized community!",
      "to": ["https://www.w3.org/ns/activitystreams#Public"]
    }
  }
}
```

### Follow Another Actor
```json
{
  "method": "tools/call",
  "params": {
    "name": "follow-actor", 
    "arguments": {
      "follower": "alice",
      "target": "https://mastodon.social/users/bob"
    }
  }
}
```

### Like a Post
```json
{
  "method": "tools/call",
  "params": {
    "name": "like-post",
    "arguments": {
      "actor": "alice",
      "postUri": "https://example.com/posts/123"
    }
  }
}
```

## 💬 MCP Prompts Examples

### Compose a Social Media Post
```json
{
  "method": "prompts/get",
  "params": {
    "name": "compose-post",
    "arguments": {
      "topic": "open source software",
      "tone": "professional",
      "maxLength": 280
    }
  }
}
```

**Generated Prompt:**
```
Please help me compose a professional social media post about "open source software" (max 280 characters). Make it engaging and appropriate for the Fediverse/ActivityPub community.
```

### Actor Introduction
```json
{
  "method": "prompts/get",
  "params": {
    "name": "actor-introduction",
    "arguments": {
      "actorName": "Alice",
      "interests": "programming, decentralization, privacy",
      "background": "Full-stack developer with 5 years experience"
    }
  }
}
```

## 🤖 LLM Integration Examples

### Example 1: Automated Social Media Manager

```typescript
// Pseudo-code for LLM integration
const mcpClient = new MCPClient();

// Get server info
const serverInfo = await mcpClient.readResource("activitypub://server-info");

// Create a new actor
await mcpClient.callTool("create-actor", {
  identifier: "ai-assistant",
  name: "AI Assistant",
  summary: "Helpful AI assistant for the Fediverse"
});

// Generate and post content
const prompt = await mcpClient.getPrompt("compose-post", {
  topic: "AI and decentralization",
  tone: "informative"
});

const generatedContent = await llm.generate(prompt);

await mcpClient.callTool("create-post", {
  actor: "ai-assistant", 
  content: generatedContent,
  to: ["https://www.w3.org/ns/activitystreams#Public"]
});
```

### Example 2: Community Engagement Bot

```typescript
// Monitor and engage with community
const timeline = await mcpClient.readResource("activitypub://timeline/community");

for (const post of timeline.orderedItems) {
  // Generate contextual response
  const response = await llm.generateResponse(post.content);
  
  // Like interesting posts
  if (response.shouldLike) {
    await mcpClient.callTool("like-post", {
      actor: "community-bot",
      postUri: post.id
    });
  }
  
  // Reply to questions
  if (response.shouldReply) {
    await mcpClient.callTool("create-post", {
      actor: "community-bot",
      content: response.replyContent,
      inReplyTo: post.id
    });
  }
}
```

### Example 3: Content Curation Assistant

```typescript
// Help users discover and curate content
const interests = ["technology", "programming", "decentralization"];

for (const interest of interests) {
  // Generate engaging post about the topic
  const prompt = await mcpClient.getPrompt("compose-post", {
    topic: interest,
    tone: "engaging"
  });
  
  const content = await llm.generate(prompt);
  
  await mcpClient.callTool("create-post", {
    actor: "curator",
    content: content,
    to: ["https://www.w3.org/ns/activitystreams#Public"]
  });
}
```

## 🧪 Testing Examples

### Manual Testing with curl

```bash
# Test ActivityPub server directly
curl -H "Accept: application/activity+json" http://localhost:8000/users/john

# Test WebFinger (if implemented)
curl http://localhost:8000/.well-known/webfinger?resource=acct:john@localhost:8000
```

### Testing with Fedify CLI

```bash
# Look up an actor
fedify lookup http://localhost:8000/users/john

# Test with external actor
fedify lookup @user@mastodon.social
```

### Automated Testing

```bash
# Run MCP server tests
npx tsx test-mcp.ts

# Run integration tests
npx tsx test-integration.ts
```

## 🔗 Integration Patterns

### Pattern 1: Request-Response
```
LLM → MCP Client → MCP Server → ActivityPub Server → Fediverse
```

### Pattern 2: Event-Driven
```
Fediverse → ActivityPub Server → MCP Server → MCP Client → LLM
```

### Pattern 3: Bidirectional
```
LLM ↔ MCP Client ↔ MCP Server ↔ ActivityPub Server ↔ Fediverse
```

## 📚 Additional Resources

- [ActivityPub Specification](https://www.w3.org/TR/activitypub/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Fedify Documentation](https://fedify.dev/)
- [ActivityStreams Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/)

## 🤝 Contributing

See [README.md](README.md) for contribution guidelines and development setup instructions.
