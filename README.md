# ActivityPub MCP Server - Fediverse Client

![ActivityPub MCP Logo](public/logo.svg)

A comprehensive **Model Context Protocol (MCP)** server that enables LLMs like Claude to **explore and interact with the existing Fediverse** through standardized MCP tools, resources, and prompts.

<!-- Trigger CI -->

[![npm version](https://badge.fury.io/js/activitypub-mcp.svg)](https://badge.fury.io/js/activitypub-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

## Features

### Core Capabilities
- **Fediverse Client**: Interact with existing ActivityPub servers (Mastodon, Pleroma, Misskey, etc.)
- **WebFinger Discovery**: Find and discover actors across the fediverse
- **MCP Protocol**: Complete MCP server with resources, tools, and prompts
- **LLM-Optimized**: Designed specifically for LLM interaction patterns
- **TypeScript**: Fully typed with modern TypeScript and ESM
- **High Performance**: Efficient resource management and caching
- **Secure**: Built-in security features and input validation

### Fediverse Interaction Features
- **Remote Actor Discovery**: Find users on any fediverse instance
- **Timeline Fetching**: Get posts from any user's timeline
- **Instance Discovery**: Find and explore fediverse instances
- **Instance Information**: Get detailed info about any server
- **Search Capabilities**: Search for content across instances
- **WebFinger Support**: Resolve actor identifiers across the network
- **Multi-Platform Support**: Works with Mastodon, Pleroma, Misskey, and more
- **Follower/Following Lists**: Access social connections

### MCP Features
- **Resources**: Access remote ActivityPub data (actors, timelines, instance info)
- **Tools**: Discover and interact with fediverse content
- **Prompts**: Templates for fediverse exploration and discovery
- **Monitoring**: Built-in logging and performance metrics
- **Health Checks**: Server health monitoring and diagnostics

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
  "version": "1.0.2",
  "description": "A Model Context Protocol server for exploring and interacting with the existing Fediverse",
  "capabilities": {
    "resources": ["remote-actor", "remote-timeline", "instance-info", "remote-followers", "remote-following"],
    "tools": ["discover-actor", "fetch-timeline", "search-instance", "get-instance-info", "discover-instances", "recommend-instances", "health-check", "performance-metrics"],
    "prompts": ["explore-fediverse", "compare-instances", "discover-content"]
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

Fetch recent posts from any actor's timeline:

```json
{
  "name": "fetch-timeline",
  "arguments": {
    "identifier": "user@mastodon.social",
    "limit": 20
  }
}
```

**Parameters:**
- `identifier` (string, required): Fediverse handle
- `limit` (number, optional): Number of posts to fetch (1-50, default: 20)

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

## Architecture

### Project Structure
```
activitypub-mcp/
├── src/                     # Source code
│   ├── mcp-main.ts          # MCP server entry point
│   ├── mcp-server.ts        # MCP server implementation
│   ├── webfinger.ts         # WebFinger discovery client
│   ├── remote-client.ts     # Remote ActivityPub client
│   ├── instance-discovery.ts # Instance discovery service
│   ├── health-check.ts      # Health monitoring
│   ├── performance-monitor.ts # Performance tracking
│   ├── config.ts            # Configuration constants
│   └── logging.ts           # Logging configuration
├── docs/                    # Documentation
│   ├── setup/               # Installation & configuration guides
│   ├── guides/              # User guides & examples
│   ├── development/         # Development documentation
│   └── specifications/      # Protocol specifications
├── scripts/                 # Installation & setup scripts
├── tests/                   # Test files
├── dist/                    # Built JavaScript files
├── package.json             # Dependencies and scripts
└── README.md               # This file
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
MCP_SERVER_VERSION=1.0.0

# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# Logging
LOG_LEVEL=info
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

Made by [Cameron Rye](https://rye.dev/)
