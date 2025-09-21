# Fedify CLI Specification Guide for Large Language Models

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Installation and Setup](#installation-and-setup)
3. [Command Reference](#command-reference)
4. [Project Scaffolding](#project-scaffolding)
5. [Development Workflow](#development-workflow)
6. [Configuration Management](#configuration-management)
7. [Build and Deployment](#build-and-deployment)
8. [Debugging and Troubleshooting](#debugging-and-troubleshooting)
9. [Integration Patterns](#integration-patterns)
10. [Best Practices](#best-practices)
11. [Examples and Use Cases](#examples-and-use-cases)
12. [Technical Requirements](#technical-requirements)

---

## Executive Summary

### Purpose and Overview

The Fedify CLI (`fedify`) is a comprehensive command-line toolchain designed for building, testing, and debugging ActivityPub-enabled federated server applications. While primarily designed for developers using the Fedify framework, it provides universal utilities that work with any ActivityPub-enabled server, making it an essential tool for fediverse development and debugging.

### Core Concepts

The Fedify CLI provides five primary categories of functionality:

1. **Project Initialization**: Scaffolding new Fedify projects with customizable runtime, framework, and infrastructure choices
2. **ActivityPub Debugging**: Looking up and inspecting ActivityPub objects, actors, and collections across the fediverse
3. **Development Testing**: Creating ephemeral servers for testing federation, inbox handling, and activity delivery
4. **Network Utilities**: Tunneling local servers to public internet and WebFinger resource discovery
5. **Instance Analysis**: Visualizing NodeInfo data and server metadata for fediverse instances

### Key Components

- **Project Generator**: Interactive and non-interactive project scaffolding with multiple runtime and framework options
- **Object Inspector**: Comprehensive ActivityPub object lookup with multiple output formats (TypeScript objects, JSON-LD, raw JSON)
- **Ephemeral Server**: Temporary ActivityPub server creation for testing federation workflows
- **Network Tools**: Secure tunneling and WebFinger discovery utilities
- **Instance Profiler**: NodeInfo visualization and metadata analysis tools

### Relationship to Fedify Framework

The CLI serves as both a development companion and standalone debugging tool:

- **Fedify Projects**: Provides project initialization, scaffolding, and development workflow automation
- **Universal Debugging**: Works with any ActivityPub server for object inspection and federation testing
- **Development Integration**: Seamlessly integrates with Fedify's development patterns and testing workflows
- **Cross-Platform Support**: Available across multiple package managers and platforms for broad accessibility

---

## Installation and Setup

### System Requirements

**Supported Platforms**:
- macOS (Intel and Apple Silicon)
- Linux (x86_64, ARM64)
- Windows (x86_64, WSL recommended)

**Runtime Dependencies**:
- Node.js 18+ (for npm installation)
- Deno 1.40+ (for Deno installation)
- Bun 1.0+ (for Bun installation)

### Installation Methods

#### Using npm (Node.js/Bun)

```bash
# Global installation
npm install -g @fedify/cli

# Using Bun
bun install -g @fedify/cli
```

#### Using Homebrew (macOS/Linux)

```bash
# Install via Homebrew
brew install fedify
```

#### Using Scoop (Windows)

```powershell
# Install via Scoop
scoop install fedify
```

#### Using Deno

```bash
# Linux/macOS
deno install \
  -gA \
  --unstable-fs --unstable-kv --unstable-temporal \
  -n fedify \
  jsr:@fedify/cli

# Windows PowerShell
deno install `
  -gA `
  --unstable-fs --unstable-kv --unstable-temporal `
  -n fedify `
  jsr:@fedify/cli
```

#### Pre-built Executables

Download platform-specific executables from the [releases page](https://github.com/fedify-dev/fedify/releases) and add to your system PATH.

### Shell Completions

#### Bash
```bash
# Add to ~/.bashrc, ~/.bash_profile, or ~/.profile
source <(fedify completions bash)
```

#### Fish
```fish
# Add to ~/.config/fish/config.fish
source (fedify completions fish | psub)
```

#### Zsh
```zsh
# Add to ~/.zshrc
source <(fedify completions zsh)
```

### Verification

```bash
# Verify installation
fedify --version

# Display help
fedify --help
```

---

## Command Reference

### Global Options

All commands support these global options:

- `--help, -h`: Display command help
- `--version, -V`: Display version information

### fedify init

**Purpose**: Initialize a new Fedify project with customizable configuration.

**Syntax**:
```bash
fedify init [project-name] [options]
```

**Options**:
- `-r, --runtime <runtime>`: JavaScript runtime (`deno`, `bun`, `node`)
- `-p, --package-manager <manager>`: Package manager for Node.js (`npm`, `pnpm`, `yarn`)
- `-w, --web-framework <framework>`: Web framework (`fresh`, `hono`, `express`, `nitro`)
- `-k, --kv-store <store>`: Key-value store (`redis`, `postgres`, `denokv`)
- `-q, --message-queue <queue>`: Message queue (`redis`, `postgres`, `amqp`, `denokv`)
- `--dry-run`: Preview files without creating them

**Interactive Mode**:
When run without options, prompts for configuration choices.

**Examples**:
```bash
# Interactive initialization
fedify init my-project

# Non-interactive with specific options
fedify init my-project -r deno -w fresh -k denokv -q denokv

# Preview without creating files
fedify init my-project --dry-run
```

### fedify lookup

**Purpose**: Look up ActivityPub objects, actors, and collections.

**Syntax**:
```bash
fedify lookup <url-or-handle> [options]
```

**Options**:
- `-c, --compact`: Output compacted JSON-LD format
- `-e, --expanded`: Output expanded JSON-LD format
- `-r, --raw`: Output raw JSON format
- `-t, --traverse`: Traverse collections and output items
- `-S, --suppress-errors`: Suppress partial errors during traversal
- `-a, --authorized-fetch`: Use authenticated requests
- `--first-knock <spec>`: HTTP Signatures spec preference (`draft-cavage-http-signatures-12`, `rfc9421`)
- `-u, --user-agent <agent>`: Custom User-Agent header
- `-s, --separator <sep>`: Output separator for multiple objects
- `-o, --output <file>`: Save output to file

**Examples**:
```bash
# Look up an actor by handle
fedify lookup @user@example.com

# Look up object with compact JSON-LD
fedify lookup --compact https://example.com/objects/123

# Look up with authentication
fedify lookup --authorized-fetch @private@example.com

# Traverse a collection
fedify lookup --traverse https://example.com/users/alice/outbox

# Multiple lookups with custom separator
fedify lookup -s "====" @user1@example.com @user2@example.com
```

### fedify inbox

**Purpose**: Create ephemeral ActivityPub server for testing federation.

**Syntax**:
```bash
fedify inbox [options]
```

**Options**:
- `-f, --follow <handle>`: Send follow request to actor
- `-a, --accept-follow <handle>`: Accept follow requests from actor (use `*` for all)
- `-T, --no-tunnel`: Disable public tunneling (local HTTP only)

**Server Information**:
The command displays:
- Public server URL (with tunneling)
- Actor handle and URI
- Inbox and shared inbox URLs

**Examples**:
```bash
# Basic ephemeral server
fedify inbox

# Follow specific actors
fedify inbox -f @alice@example.com -f @bob@example.com

# Accept all follow requests
fedify inbox -a "*"

# Local server without tunneling
fedify inbox --no-tunnel
```

### fedify nodeinfo

**Purpose**: Fetch and visualize instance NodeInfo data.

**Syntax**:
```bash
fedify nodeinfo <hostname-or-url> [options]
```

**Options**:
- `-r, --raw`: Output raw JSON format
- `-b, --best-effort`: Parse with best effort for malformed data
- `--no-favicon`: Disable favicon fetching
- `-m, --metadata`: Show additional metadata fields
- `-u, --user-agent <agent>`: Custom User-Agent header

**Examples**:
```bash
# Visualize instance info
fedify nodeinfo mastodon.social

# Raw JSON output
fedify nodeinfo --raw fosstodon.org

# Show metadata with best-effort parsing
fedify nodeinfo --metadata --best-effort example.com
```

### fedify tunnel

**Purpose**: Expose local HTTP server to public internet via secure tunnel.

**Syntax**:
```bash
fedify tunnel <port> [options]
```

**Options**:
- `-s, --service <service>`: Tunneling service to use

**Headers Added**:
- `X-Forwarded-For`: Client IP address
- `X-Forwarded-Proto`: Protocol (`http` or `https`)
- `X-Forwarded-Host`: Public tunnel host

**Examples**:
```bash
# Tunnel local server on port 3000
fedify tunnel 3000

# Use specific tunneling service
fedify tunnel --service serveo.net 8080
```

### fedify webfinger

**Purpose**: Look up WebFinger resources for discovery.

**Syntax**:
```bash
fedify webfinger <resource> [options]
```

**Options**:
- `-u, --user-agent <agent>`: Custom User-Agent header
- `-p, --allow-private-address`: Allow private IP addresses
- `--max-redirection <count>`: Maximum redirections (default: 5)

**Supported Resource Formats**:
- Handle: `@username@domain.com`
- HTTP URL: `https://domain.com/@username`
- acct URL: `acct:username@domain.com`

**Examples**:
```bash
# Look up by handle
fedify webfinger @user@example.com

# Look up by URL
fedify webfinger https://example.com/@user

# Multiple resources
fedify webfinger @user1@example.com @user2@example.com

# Allow private addresses for testing
fedify webfinger --allow-private-address @user@localhost
```

---

## Project Scaffolding

### Project Structure

A typical Fedify project initialized by the CLI includes:

```
my-fedify-project/
├── src/
│   ├── main.ts          # Application entry point
│   ├── federation.ts    # ActivityPub federation setup
│   └── routes/          # Web framework routes
├── static/              # Static assets
├── deno.json           # Deno configuration (if Deno)
├── package.json        # Node.js configuration (if Node.js/Bun)
├── tsconfig.json       # TypeScript configuration
└── README.md           # Project documentation
```

### Runtime-Specific Configurations

#### Deno Projects
- Uses `deno.json` for configuration
- Imports from JSR (`jsr:@fedify/fedify`)
- Built-in TypeScript support
- Optional Fresh framework integration

#### Node.js Projects
- Uses `package.json` and `tsconfig.json`
- Imports from npm (`@fedify/fedify`)
- Express or other framework integration
- Package manager choice (npm, pnpm, yarn)

#### Bun Projects
- Similar to Node.js but optimized for Bun runtime
- Fast package installation and execution
- Native TypeScript support

### Framework Integrations

#### Fresh (Deno)
- File-based routing
- Island architecture
- Server-side rendering
- ActivityPub routes integration

#### Hono (Universal)
- Lightweight web framework
- Edge runtime support
- Middleware ecosystem
- Type-safe routing

#### Express (Node.js)
- Traditional Node.js web framework
- Extensive middleware ecosystem
- RESTful API patterns
- ActivityPub endpoint integration

#### Nitro (Node.js/Bun)
- Universal server framework
- Multiple deployment targets
- Built-in caching
- API route patterns

### Infrastructure Choices

#### Key-Value Stores
- **In-memory**: Development only, no persistence
- **Redis**: Production-ready, distributed caching
- **PostgreSQL**: Relational database with KV capabilities
- **Deno KV**: Deno-native distributed database

#### Message Queues
- **In-process**: Development only, single instance
- **Redis**: Redis-based job queuing
- **PostgreSQL**: Database-backed job queuing
- **AMQP**: RabbitMQ and compatible brokers
- **Deno KV**: Deno-native job queuing

---

## Development Workflow

### Project Initialization Workflow

1. **Planning Phase**:
   ```bash
   # Preview project structure
   fedify init my-project --dry-run
   ```

2. **Interactive Setup**:
   ```bash
   # Start interactive initialization
   fedify init my-project
   # Follow prompts for runtime, framework, storage
   ```

3. **Non-Interactive Setup**:
   ```bash
   # Direct configuration
   fedify init my-project -r deno -w fresh -k denokv -q denokv
   ```

4. **Post-Initialization**:
   ```bash
   cd my-project
   # Install dependencies (if Node.js/Bun)
   npm install
   # Start development server
   npm run dev
   ```

### Development Testing Workflow

1. **Local Development**:
   ```bash
   # Start local server
   npm run dev  # or deno task dev
   
   # In another terminal, create tunnel
   fedify tunnel 3000
   ```

2. **Federation Testing**:
   ```bash
   # Create ephemeral inbox for testing
   fedify inbox -f @test@example.com
   
   # Test object lookup
   fedify lookup @your-actor@tunnel-url.com
   ```

3. **Object Inspection**:
   ```bash
   # Inspect ActivityPub objects
   fedify lookup https://mastodon.social/@user/123456
   
   # Check with different formats
   fedify lookup --compact https://example.com/objects/123
   fedify lookup --raw https://example.com/objects/123
   ```

### Debugging Workflow

1. **Actor Discovery**:
   ```bash
   # Check WebFinger discovery
   fedify webfinger @actor@your-domain.com
   
   # Verify actor object
   fedify lookup @actor@your-domain.com
   ```

2. **Federation Testing**:
   ```bash
   # Test with ephemeral server
   fedify inbox -a "*"  # Accept all follows
   
   # Send test activities from your server
   # Monitor ephemeral server logs
   ```

3. **Instance Analysis**:
   ```bash
   # Check target instance capabilities
   fedify nodeinfo target-instance.com
   
   # Verify connectivity
   fedify lookup @known-actor@target-instance.com
   ```

### Continuous Integration Workflow

1. **Testing Scripts**:
   ```bash
   # Add to package.json scripts
   {
     "scripts": {
       "test:federation": "fedify lookup @test@localhost:3000",
       "test:webfinger": "fedify webfinger @test@localhost:3000"
     }
   }
   ```

2. **CI Pipeline Integration**:
   ```yaml
   # GitHub Actions example
   - name: Test Federation
     run: |
       npm start &
       sleep 5
       fedify lookup @test@localhost:3000
   ```

---

## Configuration Management

### Environment Variables

The Fedify CLI respects standard environment variables:

- `HTTP_PROXY`, `HTTPS_PROXY`: Proxy configuration
- `NO_PROXY`: Proxy bypass list
- `USER_AGENT`: Default User-Agent override
- `FEDIFY_DEBUG`: Enable debug logging

### Configuration Files

#### Global Configuration
```bash
# Location: ~/.fedify/config.json
{
  "defaultRuntime": "deno",
  "defaultFramework": "hono",
  "userAgent": "MyApp/1.0 (Fedify CLI)",
  "tunnelService": "serveo.net"
}
```

#### Project Configuration
```bash
# Location: .fedify/config.json (project root)
{
  "development": {
    "port": 3000,
    "host": "localhost"
  },
  "testing": {
    "ephemeralServer": true,
    "autoFollow": ["@test@example.com"]
  }
}
```

### Runtime-Specific Configuration

#### Deno Configuration (deno.json)
```json
{
  "tasks": {
    "dev": "deno run --allow-all src/main.ts",
    "fedify:lookup": "fedify lookup",
    "fedify:test": "fedify inbox"
  },
  "imports": {
    "@fedify/fedify": "jsr:@fedify/fedify@^1.0.0"
  }
}
```

#### Node.js Configuration (package.json)
```json
{
  "scripts": {
    "dev": "tsx src/main.ts",
    "fedify:lookup": "fedify lookup",
    "fedify:test": "fedify inbox"
  },
  "dependencies": {
    "@fedify/fedify": "^1.0.0"
  }
}
```

### Framework-Specific Configuration

#### Fresh Configuration (fresh.config.ts)
```typescript
import { defineConfig } from "$fresh/server.ts";
import { federation } from "./src/federation.ts";

export default defineConfig({
  plugins: [federation.plugin()],
});
```

#### Express Configuration
```typescript
import express from "express";
import { federation } from "./src/federation.js";

const app = express();
federation.mount(app);
```

---

## Build and Deployment

### Build Processes

#### Deno Deployment
```bash
# No build step required for Deno
# Deploy directly to Deno Deploy
deno deploy --project=my-project src/main.ts
```

#### Node.js Build
```bash
# TypeScript compilation
npm run build

# Production dependencies only
npm ci --production
```

#### Bun Build
```bash
# Fast TypeScript compilation
bun build src/main.ts --outdir dist

# Bundle for deployment
bun build --compile src/main.ts --outfile my-app
```

### Deployment Verification

#### Pre-Deployment Testing
```bash
# Test local build
fedify lookup @actor@localhost:3000

# Verify WebFinger
fedify webfinger @actor@localhost:3000

# Check NodeInfo endpoint
fedify nodeinfo localhost:3000
```

#### Post-Deployment Verification
```bash
# Verify deployed actor
fedify lookup @actor@your-domain.com

# Test federation
fedify inbox -f @actor@your-domain.com

# Check instance metadata
fedify nodeinfo your-domain.com
```

### Deployment Platforms

#### Deno Deploy
```bash
# Deploy with environment variables
deno deploy \
  --project=my-project \
  --env=FEDIFY_KV_URL=... \
  src/main.ts
```

#### Vercel (Node.js)
```json
{
  "functions": {
    "api/**/*.ts": {
      "runtime": "@vercel/node"
    }
  }
}
```

#### Railway
```dockerfile
FROM denoland/deno:alpine
WORKDIR /app
COPY . .
RUN deno cache src/main.ts
CMD ["deno", "run", "--allow-all", "src/main.ts"]
```

#### Traditional VPS
```bash
# PM2 process management
pm2 start src/main.ts --name fedify-app

# Systemd service
sudo systemctl enable fedify-app
sudo systemctl start fedify-app
```

### SSL/TLS Configuration

ActivityPub requires HTTPS in production:

```bash
# Verify HTTPS setup
fedify lookup https://your-domain.com/actor

# Test with Let's Encrypt
certbot --nginx -d your-domain.com
```

### Monitoring and Health Checks

```bash
# Health check script
#!/bin/bash
fedify lookup @actor@your-domain.com > /dev/null
if [ $? -eq 0 ]; then
  echo "Federation healthy"
else
  echo "Federation unhealthy"
  exit 1
fi
```

---

## Debugging and Troubleshooting

### Common Issues and Solutions

#### Actor Discovery Problems

**Issue**: Actor not found via WebFinger
```bash
# Debug WebFinger
fedify webfinger @actor@your-domain.com

# Check with verbose output
fedify webfinger --allow-private-address @actor@localhost:3000
```

**Solution**: Verify WebFinger endpoint and CORS headers

#### Federation Delivery Issues

**Issue**: Activities not being delivered
```bash
# Test with ephemeral inbox
fedify inbox -a "*"

# Check actor object
fedify lookup @your-actor@your-domain.com

# Verify with authorized fetch
fedify lookup --authorized-fetch @target@remote-instance.com
```

**Solution**: Check HTTP signatures and actor key configuration

#### Object Lookup Failures

**Issue**: Cannot fetch remote objects
```bash
# Try different output formats
fedify lookup --raw https://remote-instance.com/objects/123
fedify lookup --compact https://remote-instance.com/objects/123

# Use authorized fetch
fedify lookup --authorized-fetch https://remote-instance.com/objects/123
```

**Solution**: Verify authentication and content negotiation

### Debugging Techniques

#### Verbose Logging
```bash
# Enable debug mode
export FEDIFY_DEBUG=1
fedify lookup @actor@example.com

# Custom User-Agent for tracking
fedify lookup --user-agent "Debug/1.0" @actor@example.com
```

#### Network Analysis
```bash
# Check connectivity
fedify tunnel 3000  # Expose local server

# Test from external perspective
fedify lookup @actor@tunnel-url.com
```

#### Collection Traversal
```bash
# Debug collection issues
fedify lookup --traverse https://example.com/users/alice/outbox

# Suppress partial errors
fedify lookup --traverse --suppress-errors https://example.com/users/alice/followers
```

### Error Messages and Solutions

#### "Failed to fetch the object"
- Check network connectivity
- Verify HTTPS certificate
- Try with `--authorized-fetch`

#### "WebFinger resource not found"
- Verify `.well-known/webfinger` endpoint
- Check CORS headers
- Validate resource parameter format

#### "Invalid ActivityPub object"
- Check JSON-LD context
- Verify required properties
- Use `--raw` to see original response

#### "Tunnel connection failed"
- Check firewall settings
- Verify port availability
- Try different tunneling service

### Performance Debugging

#### Slow Object Lookups
```bash
# Time the request
time fedify lookup @actor@slow-instance.com

# Check with different formats
fedify lookup --compact @actor@slow-instance.com
```

#### Collection Performance
```bash
# Limit traversal depth
fedify lookup --traverse --suppress-errors https://large-instance.com/users/popular/followers
```

### Security Debugging

#### HTTP Signatures
```bash
# Test signature verification
fedify lookup --authorized-fetch @protected@instance.com

# Try different signature specs
fedify lookup --authorized-fetch --first-knock draft-cavage-http-signatures-12 @actor@instance.com
```

#### CORS Issues
```bash
# Check from browser context
fedify webfinger @actor@your-domain.com

# Verify preflight requests
curl -X OPTIONS -H "Origin: https://example.com" https://your-domain.com/.well-known/webfinger
```

---

## Integration Patterns

### CI/CD Integration

#### GitHub Actions
```yaml
name: Federation Tests
on: [push, pull_request]

jobs:
  test-federation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
      
      - name: Install Fedify CLI
        run: deno install -gA --unstable-fs --unstable-kv --unstable-temporal -n fedify jsr:@fedify/cli
      
      - name: Start test server
        run: deno run --allow-all src/main.ts &
        
      - name: Wait for server
        run: sleep 5
        
      - name: Test actor lookup
        run: fedify lookup @test@localhost:3000
        
      - name: Test WebFinger
        run: fedify webfinger @test@localhost:3000
```

#### GitLab CI
```yaml
test-federation:
  image: denoland/deno:alpine
  script:
    - deno install -gA --unstable-fs --unstable-kv --unstable-temporal -n fedify jsr:@fedify/cli
    - deno run --allow-all src/main.ts &
    - sleep 5
    - fedify lookup @test@localhost:3000
```

### Docker Integration

#### Dockerfile with CLI
```dockerfile
FROM denoland/deno:alpine

# Install Fedify CLI
RUN deno install -gA --unstable-fs --unstable-kv --unstable-temporal -n fedify jsr:@fedify/cli

WORKDIR /app
COPY . .
RUN deno cache src/main.ts

# Health check using CLI
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD fedify lookup @actor@localhost:3000 || exit 1

CMD ["deno", "run", "--allow-all", "src/main.ts"]
```

#### Docker Compose
```yaml
version: '3.8'
services:
  fedify-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - FEDIFY_KV_URL=redis://redis:6379
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "fedify", "lookup", "@actor@localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

### Monitoring Integration

#### Prometheus Metrics
```bash
#!/bin/bash
# federation-health.sh
RESULT=$(fedify lookup @actor@your-domain.com 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "federation_health 1"
else
  echo "federation_health 0"
fi
```

#### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "Federation Health",
    "panels": [
      {
        "title": "Actor Lookup Success Rate",
        "targets": [
          {
            "expr": "federation_health"
          }
        ]
      }
    ]
  }
}
```

### Development Tool Integration

#### VS Code Tasks
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Test Federation",
      "type": "shell",
      "command": "fedify",
      "args": ["lookup", "@actor@localhost:3000"],
      "group": "test"
    },
    {
      "label": "Start Ephemeral Inbox",
      "type": "shell",
      "command": "fedify",
      "args": ["inbox"],
      "group": "test",
      "isBackground": true
    }
  ]
}
```

#### Makefile Integration
```makefile
.PHONY: test-federation
test-federation:
	@echo "Testing federation..."
	@fedify lookup @actor@localhost:3000

.PHONY: debug-inbox
debug-inbox:
	@echo "Starting debug inbox..."
	@fedify inbox -a "*"

.PHONY: check-instance
check-instance:
	@echo "Checking instance info..."
	@fedify nodeinfo $(INSTANCE)
```

### API Integration

#### Webhook Testing
```bash
# Start ephemeral server for webhook testing
fedify inbox &
INBOX_PID=$!

# Send webhook to ephemeral server
curl -X POST https://ephemeral-url.com/inbox \
  -H "Content-Type: application/activity+json" \
  -d '{"type": "Create", "actor": "...", "object": "..."}'

# Clean up
kill $INBOX_PID
```

#### Load Testing
```bash
#!/bin/bash
# load-test.sh
for i in {1..100}; do
  fedify lookup @actor@your-domain.com &
done
wait
echo "Load test completed"
```

---

## Best Practices

### Development Best Practices

#### Project Structure
```bash
# Recommended project organization
my-fedify-project/
├── src/
│   ├── federation/          # ActivityPub logic
│   │   ├── actors.ts
│   │   ├── activities.ts
│   │   └── collections.ts
│   ├── routes/              # Web routes
│   ├── utils/               # Utilities
│   └── main.ts              # Entry point
├── tests/
│   ├── federation.test.ts   # Federation tests
│   └── integration.test.ts  # Integration tests
├── scripts/
│   ├── test-federation.sh   # CLI test scripts
│   └── deploy.sh            # Deployment scripts
└── docs/
    └── federation.md        # Documentation
```

#### Testing Strategy
```bash
# Unit tests for federation logic
npm test

# Integration tests with CLI
./scripts/test-federation.sh

# Manual testing with ephemeral server
fedify inbox -a "*"
```

#### Configuration Management
```typescript
// src/config.ts
export const config = {
  development: {
    baseUrl: "http://localhost:3000",
    debug: true
  },
  production: {
    baseUrl: process.env.BASE_URL!,
    debug: false
  }
};
```

### Security Best Practices

#### Actor Key Management
```bash
# Generate secure keys for production
openssl genrsa -out actor-private.pem 4096
openssl rsa -in actor-private.pem -pubout -out actor-public.pem

# Test key configuration
fedify lookup --authorized-fetch @actor@your-domain.com
```

#### HTTPS Enforcement
```bash
# Always use HTTPS in production
fedify lookup https://your-domain.com/actor

# Verify SSL configuration
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

#### Input Validation
```typescript
// Validate ActivityPub objects before processing
import { isActor, isActivity } from "@fedify/fedify";

if (!isActor(object)) {
  throw new Error("Invalid actor object");
}
```

### Performance Best Practices

#### Efficient Object Lookup
```bash
# Use compact format for faster parsing
fedify lookup --compact @actor@example.com

# Batch multiple lookups
fedify lookup @actor1@example.com @actor2@example.com
```

#### Collection Handling
```bash
# Use traversal for large collections
fedify lookup --traverse --suppress-errors https://example.com/users/popular/followers

# Limit collection size in implementation
# (not a CLI feature, but important for performance)
```

#### Caching Strategy
```typescript
// Implement caching for frequently accessed objects
const cache = new Map();

async function getCachedActor(handle: string) {
  if (cache.has(handle)) {
    return cache.get(handle);
  }
  
  // Use CLI for lookup in development
  const result = await exec(`fedify lookup ${handle}`);
  cache.set(handle, result);
  return result;
}
```

### Debugging Best Practices

#### Systematic Debugging
```bash
# 1. Check basic connectivity
fedify lookup @actor@your-domain.com

# 2. Verify WebFinger
fedify webfinger @actor@your-domain.com

# 3. Test with different formats
fedify lookup --raw @actor@your-domain.com
fedify lookup --compact @actor@your-domain.com

# 4. Try authorized fetch
fedify lookup --authorized-fetch @actor@your-domain.com
```

#### Logging and Monitoring
```bash
# Enable debug logging
export FEDIFY_DEBUG=1

# Use custom User-Agent for tracking
fedify lookup --user-agent "MyApp/1.0 Debug" @actor@example.com

# Save output for analysis
fedify lookup @actor@example.com -o debug-output.json
```

#### Error Handling
```bash
# Handle errors gracefully in scripts
if ! fedify lookup @actor@your-domain.com; then
  echo "Actor lookup failed, checking WebFinger..."
  fedify webfinger @actor@your-domain.com
fi
```

### Deployment Best Practices

#### Pre-Deployment Checklist
```bash
# 1. Test locally
fedify lookup @actor@localhost:3000

# 2. Test with tunnel
fedify tunnel 3000
fedify lookup @actor@tunnel-url.com

# 3. Verify all endpoints
fedify webfinger @actor@tunnel-url.com
fedify nodeinfo tunnel-url.com
```

#### Production Monitoring
```bash
# Health check script
#!/bin/bash
# health-check.sh
fedify lookup @actor@your-domain.com > /dev/null
if [ $? -eq 0 ]; then
  exit 0
else
  echo "Federation health check failed"
  exit 1
fi
```

#### Backup and Recovery
```bash
# Backup actor configuration
fedify lookup --raw @actor@your-domain.com > actor-backup.json

# Verify backup
jq '.publicKey' actor-backup.json
```

### Documentation Best Practices

#### API Documentation
```markdown
# Federation API

## Actor Endpoint
- URL: `https://your-domain.com/actor`
- Test: `fedify lookup @actor@your-domain.com`

## WebFinger Endpoint
- URL: `https://your-domain.com/.well-known/webfinger`
- Test: `fedify webfinger @actor@your-domain.com`
```

#### Troubleshooting Guide
```markdown
# Troubleshooting

## Actor Not Found
1. Check WebFinger: `fedify webfinger @actor@your-domain.com`
2. Verify HTTPS: `fedify lookup https://your-domain.com/actor`
3. Test locally: `fedify lookup @actor@localhost:3000`

## Federation Issues
1. Test with ephemeral inbox: `fedify inbox`
2. Check with authorized fetch: `fedify lookup --authorized-fetch @actor@remote.com`
```

---

## Examples and Use Cases

### Basic Development Workflow

#### Setting Up a New Project
```bash
# Interactive project creation
fedify init my-microblog
# Choose: Deno, Fresh, Deno KV, Deno KV

cd my-microblog

# Start development server
deno task dev

# In another terminal, test the setup
fedify lookup @test@localhost:8000
```

#### Testing Federation Locally
```bash
# Terminal 1: Start your app
deno task dev

# Terminal 2: Create public tunnel
fedify tunnel 8000
# Note the public URL: https://abc123.lhr.life

# Terminal 3: Test federation
fedify lookup @test@abc123.lhr.life
fedify webfinger @test@abc123.lhr.life
```

### ActivityPub Object Inspection

#### Analyzing Mastodon Posts
```bash
# Look up a public post
fedify lookup https://mastodon.social/@user/123456789

# Get compact JSON-LD format
fedify lookup --compact https://mastodon.social/@user/123456789

# Save for analysis
fedify lookup --raw https://mastodon.social/@user/123456789 -o post-analysis.json
```

#### Exploring Actor Profiles
```bash
# Look up actor by handle
fedify lookup @gargron@mastodon.social

# Check actor's outbox
fedify lookup --traverse https://mastodon.social/users/gargron/outbox

# Analyze followers collection (first page)
fedify lookup https://mastodon.social/users/gargron/followers
```

#### Collection Analysis
```bash
# Traverse a user's posts
fedify lookup --traverse https://pixelfed.social/users/username/outbox

# Get follower count and sample
fedify lookup https://lemmy.world/u/username/followers

# Analyze with error suppression for large collections
fedify lookup --traverse --suppress-errors https://popular-instance.com/users/celebrity/followers
```

### Development Testing Scenarios

#### Testing Follow Workflows
```bash
# Start ephemeral server that accepts all follows
fedify inbox -a "*"
# Note the actor handle: @i@abc123.lhr.life

# From your app, send a follow request to @i@abc123.lhr.life
# Monitor the ephemeral server logs for the Follow activity

# The ephemeral server will automatically send Accept activity back
```

#### Testing Activity Delivery
```bash
# Start ephemeral server
fedify inbox
# Note the inbox URL: https://abc123.lhr.life/i/inbox

# Send activities to the ephemeral inbox from your app
curl -X POST https://abc123.lhr.life/i/inbox \
  -H "Content-Type: application/activity+json" \
  -H "Date: $(date -u '+%a, %d %b %Y %H:%M:%S GMT')" \
  -d '{"type": "Create", "actor": "https://your-domain.com/actor", ...}'

# Monitor logs in the ephemeral server terminal
```

#### Testing Private Objects
```bash
# Test access to private objects
fedify lookup --authorized-fetch @private@instance.com

# Compare with unauthorized access
fedify lookup @private@instance.com
# Should fail with "Failed to fetch the object"
```

### Instance Analysis and Debugging

#### Analyzing Fediverse Instances
```bash
# Check instance software and version
fedify nodeinfo mastodon.social

# Get raw NodeInfo data
fedify nodeinfo --raw pleroma.instance.com

# Check instance with metadata
fedify nodeinfo --metadata --best-effort misskey.io
```

#### Debugging Federation Issues
```bash
# Check if remote actor is accessible
fedify lookup @problematic@remote-instance.com

# Verify WebFinger discovery
fedify webfinger @problematic@remote-instance.com

# Test with different signature specs
fedify lookup --authorized-fetch --first-knock draft-cavage-http-signatures-12 @actor@old-instance.com
```

#### Network Connectivity Testing
```bash
# Test from different perspectives
fedify tunnel 3000  # Your local server
fedify lookup @actor@tunnel-url.com  # External view

# Test WebFinger from external perspective
fedify webfinger @actor@tunnel-url.com

# Check instance info
fedify nodeinfo tunnel-url.com
```

### Production Monitoring

#### Health Check Scripts
```bash
#!/bin/bash
# federation-health.sh

ACTOR="@main@your-domain.com"
INSTANCE="your-domain.com"

echo "Checking actor accessibility..."
if fedify lookup "$ACTOR" > /dev/null 2>&1; then
  echo "✓ Actor lookup successful"
else
  echo "✗ Actor lookup failed"
  exit 1
fi

echo "Checking WebFinger..."
if fedify webfinger "$ACTOR" > /dev/null 2>&1; then
  echo "✓ WebFinger successful"
else
  echo "✗ WebFinger failed"
  exit 1
fi

echo "Checking NodeInfo..."
if fedify nodeinfo "$INSTANCE" > /dev/null 2>&1; then
  echo "✓ NodeInfo successful"
else
  echo "✗ NodeInfo failed"
  exit 1
fi

echo "All federation checks passed!"
```

#### Automated Testing
```bash
#!/bin/bash
# test-federation.sh

# Start test server
npm start &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Run tests
echo "Testing local actor..."
fedify lookup @test@localhost:3000

echo "Testing WebFinger..."
fedify webfinger @test@localhost:3000

echo "Testing with ephemeral inbox..."
timeout 10s fedify inbox -f @test@localhost:3000 &
INBOX_PID=$!

sleep 5
kill $INBOX_PID 2>/dev/null

# Cleanup
kill $SERVER_PID
echo "Tests completed"
```

### Advanced Use Cases

#### Multi-Instance Testing
```bash
# Test federation between multiple instances
fedify lookup @alice@instance1.com
fedify lookup @bob@instance2.com

# Test cross-instance interactions
fedify inbox -f @alice@instance1.com -f @bob@instance2.com
```

#### Performance Analysis
```bash
# Time object lookups
time fedify lookup @popular@large-instance.com

# Batch lookup for performance comparison
time fedify lookup @user1@instance.com @user2@instance.com @user3@instance.com

# Collection traversal performance
time fedify lookup --traverse https://large-instance.com/users/popular/outbox
```

#### Security Testing
```bash
# Test HTTP signature verification
fedify lookup --authorized-fetch @protected@instance.com

# Test with different signature algorithms
fedify lookup --authorized-fetch --first-knock rfc9421 @modern@instance.com
fedify lookup --authorized-fetch --first-knock draft-cavage-http-signatures-12 @legacy@instance.com

# Test CORS configuration
fedify webfinger @actor@your-domain.com
```

#### Integration Testing
```bash
# Test with real fediverse instances
fedify lookup @mastodon@mastodon.social
fedify lookup @pixelfed@pixelfed.social
fedify lookup @lemmy@lemmy.world

# Test interoperability
fedify inbox -f @mastodon@mastodon.social
# Send activities from your server and monitor responses
```

### Troubleshooting Scenarios

#### "Actor Not Found" Issues
```bash
# Step 1: Check WebFinger
fedify webfinger @actor@your-domain.com

# Step 2: Check direct actor URL
fedify lookup https://your-domain.com/users/actor

# Step 3: Test locally
fedify lookup @actor@localhost:3000

# Step 4: Check with tunnel
fedify tunnel 3000
fedify lookup @actor@tunnel-url.com
```

#### Federation Delivery Problems
```bash
# Test with ephemeral inbox
fedify inbox -a "*"
# Send activities from your server to the ephemeral inbox

# Check actor object format
fedify lookup --raw @your-actor@your-domain.com

# Verify HTTP signatures
fedify lookup --authorized-fetch @target@remote-instance.com
```

#### Performance Issues
```bash
# Check response times
time fedify lookup @actor@slow-instance.com

# Test with different output formats
time fedify lookup --compact @actor@slow-instance.com
time fedify lookup --raw @actor@slow-instance.com

# Test collection performance
time fedify lookup --traverse --suppress-errors https://slow-instance.com/users/popular/followers
```

---

## Technical Requirements

### System Requirements

#### Minimum Requirements
- **Operating System**: macOS 10.15+, Ubuntu 18.04+, Windows 10+, or equivalent Linux distributions
- **Memory**: 512 MB RAM available for CLI operations
- **Storage**: 100 MB free disk space for installation and temporary files
- **Network**: Internet connectivity for ActivityPub federation and package downloads

#### Recommended Requirements
- **Operating System**: Latest stable versions of supported platforms
- **Memory**: 2 GB RAM for optimal performance with large collections
- **Storage**: 1 GB free disk space for caching and development workflows
- **Network**: Stable broadband connection (10+ Mbps) for real-time federation testing

### Runtime Dependencies

#### Node.js Environment
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher (included with Node.js)
- **Package Managers**: npm, pnpm 7.0+, or Yarn 3.0+
- **TypeScript**: Version 4.9.0 or higher (for development)

#### Deno Environment
- **Deno**: Version 1.40.0 or higher
- **Permissions**: `--allow-net`, `--allow-read`, `--allow-write`, `--allow-env`
- **Unstable Features**: `--unstable-fs`, `--unstable-kv`, `--unstable-temporal`

#### Bun Environment
- **Bun**: Version 1.0.0 or higher
- **Compatibility**: Node.js API compatibility mode
- **TypeScript**: Built-in TypeScript support

### Network Requirements

#### Outbound Connectivity
- **HTTPS (443)**: Required for ActivityPub federation and object lookup
- **HTTP (80)**: Optional, for local development and testing
- **DNS Resolution**: Required for WebFinger discovery and actor resolution
- **Proxy Support**: HTTP_PROXY and HTTPS_PROXY environment variables

#### Inbound Connectivity (for tunneling)
- **Dynamic Ports**: Tunneling services may use various ports
- **Firewall**: Allow outbound connections to tunneling services
- **NAT Traversal**: Automatic handling through tunneling services

### Security Requirements

#### TLS/SSL Support
- **TLS 1.2+**: Minimum supported version for HTTPS connections
- **Certificate Validation**: Full certificate chain validation
- **SNI Support**: Server Name Indication for virtual hosts
- **ALPN**: Application-Layer Protocol Negotiation support

#### Cryptographic Requirements
- **RSA Keys**: 2048-bit minimum, 4096-bit recommended for production
- **ECDSA Keys**: P-256, P-384, P-521 curves supported
- **Hash Algorithms**: SHA-256, SHA-384, SHA-512
- **HTTP Signatures**: Draft Cavage and RFC 9421 support

### Platform-Specific Requirements

#### macOS
- **Architecture**: Intel x86_64 or Apple Silicon (ARM64)
- **Xcode Command Line Tools**: Required for native module compilation
- **Homebrew**: Optional, for package manager installation
- **Keychain Access**: For certificate storage and validation

#### Linux
- **Architecture**: x86_64, ARM64, or ARMv7
- **glibc**: Version 2.17 or higher
- **OpenSSL**: Version 1.1.1 or higher
- **ca-certificates**: Updated certificate bundle

#### Windows
- **Architecture**: x86_64 (ARM64 support via emulation)
- **Windows Subsystem for Linux**: Recommended for optimal compatibility
- **PowerShell**: Version 5.1 or higher
- **Visual C++ Redistributable**: For native module support

### Development Environment Requirements

#### Code Editors
- **VS Code**: Recommended with Deno/TypeScript extensions
- **WebStorm/IntelliJ**: Full TypeScript and Deno support
- **Vim/Neovim**: With appropriate language server configurations
- **Emacs**: With TypeScript and Deno modes

#### Version Control
- **Git**: Version 2.20.0 or higher
- **GitHub CLI**: Optional, for repository management
- **SSH Keys**: For secure repository access

#### Container Support
- **Docker**: Version 20.10.0 or higher
- **Docker Compose**: Version 2.0.0 or higher
- **Podman**: Alternative container runtime support

### Performance Considerations

#### Memory Usage
- **Base CLI**: ~50 MB memory footprint
- **Object Lookup**: ~10-100 MB depending on object size
- **Collection Traversal**: ~100-500 MB for large collections
- **Ephemeral Server**: ~100-200 MB for inbox operations

#### Network Performance
- **Concurrent Connections**: Up to 10 simultaneous HTTP connections
- **Request Timeout**: 30 seconds default, configurable
- **Retry Logic**: Exponential backoff for failed requests
- **Connection Pooling**: Automatic HTTP/2 connection reuse

#### Storage Requirements
- **Cache Directory**: ~/.fedify/cache (configurable)
- **Temporary Files**: System temp directory usage
- **Log Files**: Optional, configurable location and rotation
- **Configuration**: ~/.fedify/config.json (optional)

### Compatibility Matrix

#### JavaScript Runtimes
| Runtime | Version | Support Level | Notes |
|---------|---------|---------------|-------|
| Node.js | 18.x | Full | LTS recommended |
| Node.js | 20.x | Full | Current LTS |
| Node.js | 21.x+ | Full | Latest features |
| Deno | 1.40+ | Full | Native TypeScript |
| Bun | 1.0+ | Full | Fast execution |

#### Operating Systems
| OS | Architecture | Support Level | Notes |
|----|--------------|---------------|-------|
| macOS | x86_64 | Full | Intel Macs |
| macOS | ARM64 | Full | Apple Silicon |
| Ubuntu | x86_64 | Full | 18.04+ |
| Ubuntu | ARM64 | Full | 20.04+ |
| Debian | x86_64 | Full | 10+ |
| CentOS/RHEL | x86_64 | Full | 8+ |
| Windows | x86_64 | Full | 10+ |
| Alpine Linux | x86_64 | Full | Container use |

#### Package Managers
| Manager | Version | Support Level | Notes |
|---------|---------|---------------|-------|
| npm | 8.x+ | Full | Default Node.js |
| pnpm | 7.x+ | Full | Fast installs |
| Yarn | 3.x+ | Full | Modern Yarn |
| Homebrew | Latest | Full | macOS/Linux |
| Scoop | Latest | Full | Windows |

### Deployment Requirements

#### Production Environment
- **HTTPS**: Mandatory for ActivityPub federation
- **Domain Name**: Registered domain with DNS control
- **SSL Certificate**: Valid certificate from trusted CA
- **Reverse Proxy**: Nginx, Apache, or Cloudflare recommended

#### Development Environment
- **Local HTTPS**: Optional, can use HTTP for local testing
- **Tunneling**: Fedify CLI provides built-in tunneling
- **Port Access**: Ability to bind to development ports (3000, 8000, etc.)
- **File System**: Read/write access to project directories

#### Container Deployment
- **Base Images**: Official Node.js, Deno, or Alpine images
- **Multi-stage Builds**: Supported for optimized production images
- **Health Checks**: CLI commands can be used for container health checks
- **Environment Variables**: Full support for configuration via env vars

### Monitoring and Observability

#### Logging Requirements
- **Structured Logging**: JSON format support
- **Log Levels**: Debug, info, warn, error
- **Log Rotation**: Configurable size and time-based rotation
- **Remote Logging**: Syslog and HTTP endpoint support

#### Metrics and Monitoring
- **Health Checks**: CLI commands suitable for monitoring systems
- **Response Times**: Built-in timing for performance monitoring
- **Error Rates**: Automatic error categorization and reporting
- **Custom Metrics**: Integration with Prometheus and other systems

#### Debugging Support
- **Verbose Logging**: Debug mode with detailed request/response logging
- **Network Tracing**: HTTP request/response inspection
- **Error Context**: Detailed error messages with context
- **Performance Profiling**: Built-in timing and performance metrics

This comprehensive technical requirements section ensures that developers and system administrators have all the necessary information to successfully deploy and operate the Fedify CLI in various environments, from local development to production federation servers.
