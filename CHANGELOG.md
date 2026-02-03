# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-02

### Added

#### Authenticated Write Operations (NEW)

- **Multi-account support** with secure credential management
- **Account management tools**: `list-accounts`, `switch-account`, `verify-account`
- **Posting tools**: `post-status`, `reply-to-post`, `delete-post`
- **Interaction tools**: `boost-post`, `unboost-post`, `favourite-post`, `unfavourite-post`, `bookmark-post`, `unbookmark-post`
- **Relationship tools**: `follow-account`, `unfollow-account`, `mute-account`, `unmute-account`, `block-account`, `unblock-account`, `get-relationship`
- **Authenticated timelines**: `get-home-timeline`, `get-notifications`, `get-bookmarks`, `get-favourites`
- **Poll tools**: `vote-on-poll` with visual results display
- **Media tools**: `upload-media` with alt text and focal point support
- **Scheduling tools**: `get-scheduled-posts`, `update-scheduled-post`, `cancel-scheduled-post`
- Environment variable configuration for accounts:
  - `ACTIVITYPUB_DEFAULT_INSTANCE` - Default instance domain
  - `ACTIVITYPUB_DEFAULT_TOKEN` - OAuth access token
  - `ACTIVITYPUB_DEFAULT_USERNAME` - Username
  - `ACTIVITYPUB_ACCOUNTS` - Multi-account configuration

#### Content Export Tools (NEW)

- `export-timeline` - Export actor timeline to JSON, Markdown, or CSV
- `export-thread` - Export post thread with ancestors and replies
- `export-account-info` - Comprehensive account data export
- `export-hashtag` - Export posts containing a specific hashtag

#### New MCP Prompts (4 additional prompts)

- `content-strategy` - Plan fediverse content strategy based on trends and audience
- `community-health` - Analyze instance moderation and community health
- `migration-helper` - Evaluate and plan instance migration
- `thread-composer` - Help compose well-structured threaded posts

#### Adaptive Rate Limiting (NEW)

- Per-instance rate limit tracking from response headers
- Automatic parsing of `X-RateLimit-*` headers
- Recommended delay calculations based on remaining quota
- Rate-limited instance tracking and statistics

#### HTTP Transport Support

- New HTTP/SSE transport mode for production deployments (`MCP_TRANSPORT_MODE=http`)
- Built-in endpoints: `/mcp`, `/health`, `/metrics`, `/` (server info)
- CORS support with configurable origins
- Graceful shutdown with active connection tracking

#### Audit Logging System

- Comprehensive logging of tool invocations, resource access, and security events
- Automatic sensitive data redaction (passwords, tokens, secrets)
- In-memory circular buffer with configurable size
- Statistics and filtering by event type/domain
- JSON export capability

#### Instance Blocklist

- Block specific fediverse instances by domain or wildcard pattern
- Multiple block reasons: policy, user, safety, spam, federation, custom
- Expiration support for temporary blocks
- Import/export blocklist as JSON

#### Dynamic Instance Discovery

- Real-time instance discovery via instances.social API
- Fediverse Observer GraphQL API as fallback
- Filter by software, language, user count, registration status
- Caching with configurable TTL

#### New MCP Tools (13 read-only tools)

- `discover-instances-live` - Real-time instance discovery with advanced filters
- `get-post-thread` - Fetch post with full conversation thread
- `get-trending-hashtags` - Trending hashtags on an instance
- `get-trending-posts` - Trending posts on an instance
- `get-local-timeline` - Local public timeline
- `get-federated-timeline` - Federated public timeline
- `search-accounts` - Specialized account search
- `search-hashtags` - Specialized hashtag search
- `search-posts` - Specialized post search
- `search` - Unified search across accounts, posts, and hashtags with type filtering
- `convert-url` - URL conversion utility
- `batch-fetch-actors` - Fetch multiple actors at once
- `batch-fetch-posts` - Fetch multiple posts at once

#### New MCP Resources (4 resources)

- `activitypub://trending/{domain}` - Trending content from an instance
- `activitypub://local-timeline/{domain}` - Local timeline resource
- `activitypub://federated-timeline/{domain}` - Federated timeline resource
- `activitypub://post-thread/{postUrl}` - Post thread resource

#### Previous Prompts (4 prompts)

- `compare-accounts` - Compare fediverse accounts side by side
- `analyze-user-activity` - Detailed user activity analysis
- `find-experts` - Find experts on specific topics
- `summarize-trending` - Summarize what's trending

#### CLI Improvements

- Added `--help` / `-h` flag with comprehensive usage documentation
- Added `--version` / `-v` flag
- Environment variable documentation in help output

### Changed

- `fetch-timeline` now supports pagination (cursor, minId, maxId, sinceId parameters)
- Improved error messages with `formatErrorWithSuggestion()` helper
- Better organized tool/resource/prompt registration with categorized groupings
- Enhanced server-info resource with categorized capabilities and feature flags

### New Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT_MODE` | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_HTTP_PORT` | `3000` | HTTP server port |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP server host |
| `MCP_HTTP_CORS_ENABLED` | `false` | Enable CORS |
| `MCP_HTTP_CORS_ORIGINS` | `*` | Allowed CORS origins |
| `INSTANCES_SOCIAL_TOKEN` | - | API token for instances.social |
| `DYNAMIC_INSTANCE_CACHE_TTL` | `3600000` | Cache TTL for discovery (1hr) |
| `MAX_DYNAMIC_INSTANCES` | `100` | Max instances to fetch |
| `AUDIT_LOG_ENABLED` | `true` | Enable audit logging |
| `AUDIT_LOG_MAX_ENTRIES` | `10000` | Max audit log entries |
| `BLOCKED_INSTANCES` | - | Comma-separated blocked domains |
| `INSTANCE_BLOCKING_ENABLED` | `true` | Enable instance blocking |
| `RESPECT_CONTENT_WARNINGS` | `true` | Respect CW in output |
| `SHOW_CONTENT_WARNINGS` | `true` | Include CW in responses |
| `ACTIVITYPUB_DEFAULT_INSTANCE` | - | Default instance for auth |
| `ACTIVITYPUB_DEFAULT_TOKEN` | - | OAuth access token |
| `ACTIVITYPUB_DEFAULT_USERNAME` | - | Account username |
| `ACTIVITYPUB_ACCOUNTS` | - | Multi-account config |

## [1.0.3] - 2025-11-16

### Added
- OG image generation for social media sharing
- Enhanced documentation site with improved navigation and search
- Production-ready deployment configurations

### Changed
- Upgraded dependencies to latest versions for security and performance
- Updated Astro to 5.15.8 for improved site building
- Updated MCP SDK to 1.22.0 for latest protocol features
- Replaced deprecated npm-run-all with npm-run-all2
- Improved site styling and mobile responsiveness
- Enhanced code review findings and documentation clarity

### Fixed
- Documentation formatting and broken links
- Mobile search functionality
- Code block horizontal scrolling issues
- Biome configuration schema validation
- Various text and formatting improvements

### Security
- Fixed security vulnerabilities in dependencies
- Updated packages with known security issues

## [1.0.2] - 2024-09-24

### Fixed
- Fixed GitHub token permissions for automated release creation
- Resolved 403 "Resource not accessible by integration" error
- GitHub releases now create automatically when tags are pushed

## [1.0.1] - 2024-09-24

### Added
- Automated CI/CD pipeline with GitHub Actions
- GitHub Pages deployment workflow for documentation site
- Automated release workflow that creates tags on version changes
- Comprehensive test suite with multiple test scenarios
- Security scanning with CodeQL and dependency audits
- Cross-platform support (Windows, macOS, Linux)
- Biome linting and formatting configuration

### Changed
- Improved error handling and logging throughout the codebase
- Enhanced documentation with detailed setup guides
- Updated dependencies to latest stable versions
- Optimized build process for better performance

### Fixed
- Resolved linting issues and improved code quality
- Fixed Windows compatibility issues in scripts
- Corrected TypeScript configuration for better type safety
- Fixed package.json scripts for cross-platform compatibility

### Security
- Added automated security vulnerability scanning
- Implemented dependency review for pull requests
- Added license compliance checking
- Enhanced input validation and sanitization

## [1.0.0] - 2024-09-20

### Added
- Initial release of ActivityPub MCP Server
- Core ActivityPub protocol implementation
- Model Context Protocol (MCP) server functionality
- Fediverse exploration and interaction tools
- WebFinger protocol support
- ActivityStreams vocabulary implementation
- Fedify integration for ActivityPub operations
- Comprehensive documentation and guides
- Example configurations and usage scenarios
- Cross-platform installation scripts

### Features
- **ActivityPub Tools**: Complete set of tools for ActivityPub operations
  - Actor management and discovery
  - Activity creation and processing
  - Object handling and validation
  - Collection management
- **Fediverse Integration**: Native support for Fediverse protocols
  - WebFinger lookups
  - Actor following and unfollowing
  - Content federation
  - Instance discovery
- **MCP Compliance**: Full Model Context Protocol implementation
  - Resource management
  - Tool execution
  - Prompt handling
  - Logging and monitoring
- **Developer Experience**: Rich development tools and documentation
  - TypeScript support
  - Comprehensive test suite
  - Development server with hot reload
  - Production-ready build process

### Documentation
- Complete API documentation
- Setup and configuration guides
- Usage examples and tutorials
- Security best practices
- Cross-platform installation instructions
- Troubleshooting guides

### Supported Platforms
- Node.js 18.0.0 or higher
- Windows, macOS, and Linux
- Claude Desktop integration
- Cursor IDE integration
- Shell/terminal usage

---

## Release Notes

### Version 1.0.1 Highlights

This release focuses on improving the development experience and establishing a robust CI/CD pipeline:

- **Automated Deployments**: GitHub Pages site now deploys automatically on every push
- **Release Automation**: Version bumps in package.json automatically trigger releases and NPM publishing
- **Enhanced Testing**: Comprehensive test suite covering all major functionality
- **Security First**: Automated security scanning and dependency management
- **Cross-Platform**: Improved Windows, macOS, and Linux compatibility

### Upgrade Instructions

To upgrade from version 1.0.0:

```bash
npm update -g activitypub-mcp
```

Or install the latest version:

```bash
npm install -g activitypub-mcp@latest
```

### Breaking Changes

No breaking changes in this release. All existing configurations and usage patterns remain compatible.

### Contributors

- Cameron Rye (@cameronrye) - Lead Developer

### Links

- [GitHub Repository](https://github.com/cameronrye/activitypub-mcp)
- [Documentation Site](https://cameronrye.github.io/activitypub-mcp/)
- [NPM Package](https://www.npmjs.com/package/activitypub-mcp)
- [Issue Tracker](https://github.com/cameronrye/activitypub-mcp/issues)
