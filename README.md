# ActivityPub MCP Server

A comprehensive **Model Context Protocol (MCP)** server that enables LLMs like Claude to interact with the **ActivityPub/Fediverse** ecosystem through standardized MCP tools, resources, and prompts.

[![npm version](https://badge.fury.io/js/activitypub-mcp-server.svg)](https://badge.fury.io/js/activitypub-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

## 🌟 Features

### Core Capabilities
- **🔗 ActivityPub Integration**: Full ActivityPub server implementation using [Fedify](https://fedify.dev/)
- **🤖 MCP Protocol**: Complete MCP server with resources, tools, and prompts
- **🧠 LLM-Optimized**: Designed specifically for LLM interaction patterns
- **📝 TypeScript**: Fully typed with modern TypeScript and ESM
- **⚡ High Performance**: Efficient resource management and caching
- **🔒 Secure**: Built-in security features and input validation

### ActivityPub Features
- ✅ Actor creation and management
- ✅ Post creation and publishing
- ✅ Following/unfollowing actors
- ✅ Likes and reactions
- ✅ Timeline and outbox access
- ✅ WebFinger support
- 🚧 Direct messages (planned)
- 🚧 Media attachments (planned)
- 🚧 Search functionality (planned)

### MCP Features
- **📚 Resources**: Access ActivityPub data (actors, timelines, server info)
- **🔧 Tools**: Perform ActivityPub actions (post, follow, like)
- **💬 Prompts**: Templates for common social media interactions
- **🔄 Completions**: Context-aware argument completion
- **🎯 Sampling**: LLM integration for content generation
- **📊 Monitoring**: Built-in logging and performance metrics

## 🚀 Quick Start

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
npx activitypub-mcp-server install

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

3. **Start the servers**:

```bash
# Terminal 1: Start ActivityPub server
npm run dev

# Terminal 2: Start MCP server
npm run mcp
```

### Testing the Setup

1. **Test ActivityPub server**:

```bash
# Look up an actor
fedify lookup http://localhost:8000/users/john

# Check server is running
curl -H "Accept: application/activity+json" http://localhost:8000/users/john
```

2. **Test MCP server** with MCP Inspector:

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
      "args": ["-y", "activitypub-mcp-server"],
      "env": {
        "ACTIVITYPUB_BASE_URL": "http://localhost:8000"
      }
    }
  }
}
```

3. **Restart Claude Desktop** to load the new server.

## 📖 Documentation

### Quick Reference

For detailed usage instructions, examples, and troubleshooting, see:

- **[📚 Usage Guide](USAGE_GUIDE.md)** - Comprehensive usage documentation
- **[🧪 Examples](EXAMPLES.md)** - Practical examples and integration patterns
- **[🔧 API Reference](#api-reference)** - Complete API documentation (below)

### API Reference

### MCP Resources

Resources provide read-only access to ActivityPub data. All resources return JSON data unless otherwise specified.

#### Actor Resource

Get information about an ActivityPub actor:

```uri
activitypub://actor/{identifier}
```

**Parameters:**
- `identifier` (string): The actor's username/identifier

**Example Response:**

```json
{
  "@context": ["https://www.w3.org/ns/activitystreams"],
  "id": "http://localhost:8000/users/alice",
  "type": "Person",
  "preferredUsername": "alice",
  "name": "Alice Smith",
  "summary": "Software developer passionate about decentralized social networks"
}
```

#### Timeline Resource

Access an actor's timeline/outbox:

```uri
activitypub://timeline/{identifier}
```

**Parameters:**
- `identifier` (string): The actor's username/identifier

**Example Response:**

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "id": "http://localhost:8000/users/alice/outbox",
  "totalItems": 5,
  "orderedItems": [...]
}
```

#### Server Info Resource

Get server information and capabilities:

```uri
activitypub://server-info
```

**Example Response:**

```json
{
  "name": "ActivityPub MCP Server",
  "version": "1.0.0",
  "description": "A Model Context Protocol server for ActivityPub interactions",
  "baseUrl": "http://localhost:8000",
  "capabilities": ["actor-creation", "post-creation", "following", "likes"],
  "protocols": ["activitypub", "webfinger"]
}
```

### MCP Tools

Tools enable LLMs to perform actions on the ActivityPub server. All tools return structured responses with success/error information.

#### Create Actor

Create a new ActivityPub actor/user:

```json
{
  "name": "create-actor",
  "arguments": {
    "identifier": "alice",
    "name": "Alice Smith",
    "summary": "Software developer interested in decentralized social networks"
  }
}
```

**Parameters:**
- `identifier` (string, required): Unique identifier for the actor
- `name` (string, optional): Display name for the actor
- `summary` (string, optional): Bio/summary for the actor

#### Create Post

Create a new ActivityPub post/note:

```json
{
  "name": "create-post",
  "arguments": {
    "actor": "alice",
    "content": "Hello Fediverse! 👋",
    "to": ["https://www.w3.org/ns/activitystreams#Public"]
  }
}
```

**Parameters:**
- `actor` (string, required): Actor identifier who is creating the post
- `content` (string, required): Content of the post
- `to` (array, optional): Recipients (URIs or 'public')
- `cc` (array, optional): CC recipients
- `inReplyTo` (string, optional): URI of post being replied to

#### Follow Actor

Follow another ActivityPub actor:

```json
{
  "name": "follow-actor",
  "arguments": {
    "follower": "alice",
    "target": "https://mastodon.social/users/bob"
  }
}
```

**Parameters:**
- `follower` (string, required): Actor identifier who is following
- `target` (string, required): Actor URI or handle to follow

#### Like Post

Like an ActivityPub post:

```json
{
  "name": "like-post",
  "arguments": {
    "actor": "alice",
    "postUri": "https://example.com/posts/123"
  }
}
```

**Parameters:**
- `actor` (string, required): Actor identifier who is liking
- `postUri` (string, required): URI of the post to like

### MCP Prompts

#### Compose Post
```json
{
  "name": "compose-post",
  "arguments": {
    "topic": "open source software",
    "tone": "professional",
    "maxLength": 280
  }
}
```

#### Actor Introduction
```json
{
  "name": "actor-introduction",
  "arguments": {
    "actorName": "Alice",
    "interests": ["programming", "decentralization", "privacy"],
    "background": "Full-stack developer with 5 years experience"
  }
}
```

## 🏗️ Architecture

### Project Structure
```
activitypub-mcp-server/
├── main.ts              # ActivityPub server entry point
├── mcp-main.ts          # MCP server entry point  
├── mcp-server.ts        # MCP server implementation
├── federation.ts        # ActivityPub federation setup
├── logging.ts           # Logging configuration
├── package.json         # Dependencies and scripts
└── README.md           # This file
```

### Technology Stack
- **[Fedify](https://fedify.dev/)**: ActivityPub server framework
- **[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)**: Model Context Protocol implementation
- **[Hono](https://hono.dev/)**: Web framework for HTTP server
- **[LogTape](https://logtape.org/)**: Structured logging
- **TypeScript**: Type-safe development

### Communication Flow
```
LLM Client ←→ MCP Protocol ←→ MCP Server ←→ ActivityPub Federation ←→ Fediverse
```

## 🔧 Development

### Available Scripts
- `npm run dev` - Start ActivityPub server in development mode
- `npm run prod` - Start ActivityPub server in production mode  
- `npm run mcp` - Start MCP server
- `npm run mcp:dev` - Start MCP server in watch mode

### Environment Variables
Create a `.env` file:
```env
# Server configuration
PORT=8000
HOST=localhost

# ActivityPub configuration  
ACTIVITYPUB_BASE_URL=http://localhost:8000

# Logging
LOG_LEVEL=info
```

### Testing
```bash
# Test ActivityPub functionality
fedify lookup http://localhost:8000/users/test

# Test MCP server with inspector
mcp-inspector

# Manual testing with curl
curl -H "Accept: application/activity+json" http://localhost:8000/users/test
```

## 🌐 Cross-Platform Compatibility

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

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Fedify](https://fedify.dev/) - ActivityPub server framework
- [Model Context Protocol](https://modelcontextprotocol.io/) - LLM integration standard
- [ActivityPub](https://www.w3.org/TR/activitypub/) - W3C decentralized social networking protocol

## 🔗 Links

- [ActivityPub Specification](https://www.w3.org/TR/activitypub/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Fedify Documentation](https://fedify.dev/)
- [Fediverse](https://fediverse.info/)

---

**Made with ❤️ for the decentralized web and AI integration**
