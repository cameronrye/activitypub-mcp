# ActivityPub MCP Server Usage Guide

This comprehensive guide covers everything you need to know about using the ActivityPub MCP Server effectively.

## 🚀 Quick Start

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
MCP_SERVER_VERSION=1.0.0

# Security & Performance
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

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

## 📚 MCP Resources

### Server Information
Get comprehensive server details and capabilities:

```typescript
const serverInfo = await client.readResource({
  uri: "activitypub://server-info"
});
```

**Response includes:**
- Server name, version, and base URL
- Available capabilities and protocols
- Configuration settings
- Current operational status

### Actor Information
Retrieve detailed actor/user information:

```typescript
const actor = await client.readResource({
  uri: "activitypub://actor/username"
});
```

**Features:**
- Validates actor identifiers
- Returns full ActivityPub actor objects
- Handles missing actors gracefully
- Includes rate limiting protection

### Timeline Access
Access actor timelines and outboxes:

```typescript
const timeline = await client.readResource({
  uri: "activitypub://timeline/username"
});
```

**Capabilities:**
- Fetches real timeline data when available
- Provides structured placeholder data
- Supports ActivityStreams format
- Graceful fallback handling

## 🔧 MCP Tools

### Create Actor
Create new ActivityPub actors with validation:

```typescript
const result = await client.callTool({
  name: "create-actor",
  arguments: {
    identifier: "alice",           // Required: alphanumeric + _ -
    name: "Alice Smith",           // Optional: display name
    summary: "Developer & writer"  // Optional: bio/description
  }
});
```

**Validation Rules:**
- Identifier: 1-50 chars, alphanumeric + underscore/hyphen only
- Name: max 100 characters
- Summary: max 500 characters
- Checks for existing actors
- Rate limiting applied

### Create Post
Publish new ActivityPub posts:

```typescript
const result = await client.callTool({
  name: "create-post",
  arguments: {
    actor: "alice",                                    // Required
    content: "Hello, Fediverse! 👋",                  // Required: 1-5000 chars
    to: ["https://www.w3.org/ns/activitystreams#Public"], // Optional
    cc: ["https://example.com/followers"],             // Optional
    inReplyTo: "https://example.com/posts/123"         // Optional
  }
});
```

### Follow Actor
Establish following relationships:

```typescript
const result = await client.callTool({
  name: "follow-actor",
  arguments: {
    follower: "alice",                           // Local actor
    target: "https://mastodon.social/users/bob"  // Remote actor URI
  }
});
```

### Like Post
Express appreciation for posts:

```typescript
const result = await client.callTool({
  name: "like-post",
  arguments: {
    actor: "alice",                        // Actor performing the like
    postUri: "https://example.com/posts/123" // Post to like
  }
});
```

## 💬 MCP Prompts

### Compose Post Prompt
Generate engaging social media content:

```typescript
const prompt = await client.getPrompt({
  name: "compose-post",
  arguments: {
    topic: "open source software",     // Required
    tone: "professional",              // casual|professional|humorous|informative
    maxLength: 280                     // Optional character limit
  }
});
```

### Actor Introduction Prompt
Create welcoming introduction posts:

```typescript
const prompt = await client.getPrompt({
  name: "actor-introduction",
  arguments: {
    actorName: "Alice",                           // Required
    interests: "programming, privacy, art",       // Required
    background: "Full-stack developer"           // Optional
  }
});
```

## 🔒 Security & Rate Limiting

### Rate Limiting
Protects against abuse with configurable limits:

- **Default**: 100 requests per 15 minutes per identifier
- **Scope**: Applied per actor identifier or 'anonymous'
- **Configuration**: Set via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW`
- **Behavior**: Returns clear error messages when exceeded

### Input Validation
Comprehensive validation for all inputs:

- **Actor Identifiers**: Regex validation, length limits
- **Content**: Length validation, sanitization
- **URIs**: Format validation
- **Error Handling**: Structured error responses with clear messages

### Error Handling
Robust error handling throughout:

```typescript
// Errors are returned as structured MCP errors
{
  "error": {
    "code": "InvalidParams",
    "message": "Actor identifier too long (max 50 characters)"
  }
}
```

## 🧪 Testing & Development

### Running Tests

```bash
# Full test suite
npm run test:all

# Individual test suites
npm run test:comprehensive  # Complete functionality tests
npm run test:integration   # Integration tests
npm run test               # Basic MCP tests
```

### Development Mode

```bash
# Start with auto-reload
npm run dev     # ActivityPub server
npm run mcp:dev # MCP server with watch mode
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

## 🔧 Troubleshooting

### Common Issues

#### "Rate limit exceeded"
- **Cause**: Too many requests from same identifier
- **Solution**: Wait for rate limit window to reset or increase limits in config

#### "Invalid actor identifier"
- **Cause**: Identifier contains invalid characters or is too long
- **Solution**: Use only letters, numbers, underscores, and hyphens (max 50 chars)

#### "Actor not found"
- **Cause**: Requested actor doesn't exist on the server
- **Solution**: Create the actor first or verify the identifier

#### "Connection refused"
- **Cause**: ActivityPub server not running
- **Solution**: Start the server with `npm run dev`

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

## 🌐 Integration Examples

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
For custom MCP clients:

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

## 📖 Best Practices

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

## 🤝 Contributing

See the main [README.md](../../README.md) for contribution guidelines and development setup instructions.

## 📚 Additional Resources

- [ActivityPub Specification](https://www.w3.org/TR/activitypub/)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Fedify Framework](https://fedify.dev/)
- [Project Repository](https://github.com/cameronrye/activitypub-mcp)
