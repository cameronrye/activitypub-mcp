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

## 🔧 MCP Tools

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
    limit: 20                                // Optional: 1-50, default 20
  }
});
```

**Use Cases:**
- Monitoring specific accounts
- Analyzing posting patterns
- Discovering content topics
- Tracking community discussions

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

## 💬 MCP Prompts

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

## 🔒 Security & Rate Limiting

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

## 🧪 Testing & Development

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

## 🔧 Troubleshooting

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
