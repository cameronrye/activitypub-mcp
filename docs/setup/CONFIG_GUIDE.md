# Configuration Guide

This guide explains how to properly configure the ActivityPub MCP Server for different environments.

## Environment Templates

### Development Configuration (`.env.example`)
- **Purpose**: Local development and testing
- **Security**: Relaxed settings for ease of development
- **Logging**: Debug level for detailed information
- **CORS**: Allows common development ports
- **Performance**: Higher timeouts for debugging

### Production Configuration (`.env.production.example`)
- **Purpose**: Production deployment
- **Security**: Strict settings for production safety
- **Logging**: Info level for performance
- **CORS**: Requires specific domain configuration
- **Performance**: Optimized timeouts and caching

## Key Configuration Differences

| Setting | Development | Production | Notes |
|---------|-------------|------------|-------|
| `NODE_ENV` | `development` | `production` | Controls environment behavior |
| `LOG_LEVEL` | `debug` | `info` | Debug logs can impact performance |
| `DEBUG` | `true` | `false` | Enables debug features |
| `CORS_ORIGINS` | `localhost:*` | Specific domains | Security requirement |
| `HOST` | `localhost` | `0.0.0.0` | Production needs external access |
| `ACTIVITYPUB_BASE_URL` | `http://localhost:8000` | `https://yourdomain.com` | Production uses HTTPS |
| `FEDERATION_QUEUE_TYPE` | `memory` | `redis` | Production needs persistence |
| `REQUEST_TIMEOUT` | `15000` | `10000` | Development allows longer waits |

## Setup Instructions

### For Development
1. Copy `.env.example` to `.env`
2. Customize values as needed for your local setup
3. Start with: `npm run mcp:dev`

### For Production
1. Copy `.env.production.example` to `.env`
2. **CRITICAL**: Update all placeholder values:
   - Replace `yourdomain.com` with your actual domain
   - Set specific CORS origins (never use `*`)
   - Configure database and Redis URLs if using persistent storage
   - Set up SSL certificates if needed
3. Review security settings carefully
4. Start with: `npm run prod`

## Security Checklist for Production

- [ ] `NODE_ENV=production` is set
- [ ] `DEBUG=false` and `DEBUG_MODE=false`
- [ ] `CORS_ORIGINS` specifies exact domains (no wildcards)
- [ ] `ACTIVITYPUB_BASE_URL` uses HTTPS
- [ ] Rate limiting is enabled
- [ ] Logging level is `info` or `warn`
- [ ] Database credentials are secure
- [ ] SSL certificates are properly configured

## Environment Variables Reference

### Core Configuration

- `NODE_ENV`: Environment type (`development`/`production`)
- `MCP_SERVER_NAME`: Name of the MCP server
- `MCP_SERVER_VERSION`: Version identifier

### Transport Configuration (New in v1.1.0)

- `MCP_TRANSPORT_MODE`: Transport mode (`stdio` or `http`, default: `stdio`)
- `MCP_HTTP_PORT`: HTTP server port (default: `3000`)
- `MCP_HTTP_HOST`: HTTP server host (default: `127.0.0.1` for security)
- `MCP_HTTP_CORS_ENABLED`: Enable CORS for HTTP transport (default: `false`)
- `MCP_HTTP_CORS_ORIGINS`: CORS allowed origins, comma-separated (default: `*`)

### HTTP & Network

- `USER_AGENT`: HTTP User-Agent string for requests
- `REQUEST_TIMEOUT`: Request timeout in milliseconds
- `DEFAULT_INSTANCE`: Default fediverse instance for examples

### Server Settings

- `PORT`: Server port (default: 8000)
- `HOST`: Server host (localhost for dev, 0.0.0.0 for prod)
- `ACTIVITYPUB_BASE_URL`: Base URL for ActivityPub endpoints
- `ACTIVITYPUB_DOMAIN`: Domain for ActivityPub federation

### Security

- `ENABLE_CORS`: Enable CORS headers
- `CORS_ORIGINS`: Allowed CORS origins (comma-separated)
- `RATE_LIMIT_ENABLED`: Enable rate limiting
- `RATE_LIMIT_MAX`: Maximum requests per window
- `RATE_LIMIT_WINDOW`: Rate limit window in milliseconds

### Instance Blocklist (New in v1.1.0)

- `BLOCKED_INSTANCES`: Comma-separated list of blocked instance domains
- `INSTANCE_BLOCKING_ENABLED`: Enable instance blocking (default: `true`)

### Audit Logging (New in v1.1.0)

- `AUDIT_LOG_ENABLED`: Enable audit logging (default: `true`)
- `AUDIT_LOG_MAX_ENTRIES`: Maximum audit log entries in memory (default: `10000`)

### Dynamic Instance Discovery (New in v1.1.0)

- `INSTANCES_SOCIAL_TOKEN`: API token for instances.social (optional, for higher rate limits)
- `DYNAMIC_INSTANCE_CACHE_TTL`: Cache TTL for dynamic instance data in ms (default: `3600000` / 1 hour)
- `MAX_DYNAMIC_INSTANCES`: Maximum instances to fetch from external API (default: `100`)

### Content Warnings (New in v1.1.0)

- `RESPECT_CONTENT_WARNINGS`: Respect content warnings in output (default: `true`)
- `SHOW_CONTENT_WARNINGS`: Include content warnings in responses (default: `true`)

### Authentication (New in v1.1.0)

Configure authentication for write operations (posting, interactions, etc.):

**Single Account Configuration:**

- `ACTIVITYPUB_DEFAULT_INSTANCE`: Default instance domain (e.g., `mastodon.social`)
- `ACTIVITYPUB_DEFAULT_TOKEN`: OAuth access token for the account
- `ACTIVITYPUB_DEFAULT_USERNAME`: Username on the instance

**Multi-Account Configuration:**

- `ACTIVITYPUB_ACCOUNTS`: JSON array of account configurations

Example multi-account configuration:
```bash
ACTIVITYPUB_ACCOUNTS='[
  {
    "id": "work",
    "instance": "fosstodon.org",
    "token": "your-oauth-token-1",
    "username": "work_account"
  },
  {
    "id": "personal",
    "instance": "mastodon.social",
    "token": "your-oauth-token-2",
    "username": "personal_account"
  }
]'
```

**Obtaining OAuth Tokens:**

1. Go to your Mastodon instance Settings → Development → New Application
2. Set application name and permissions (read/write/follow as needed)
3. Copy the "Access Token" value
4. Add to your `.env` file

**Required Scopes for Write Operations:**

| Operation | Required Scopes |
|-----------|----------------|
| Post/Reply/Delete | `write:statuses` |
| Boost/Favourite | `write:statuses` |
| Bookmark | `write:bookmarks` |
| Follow/Unfollow | `write:follows` |
| Mute/Unmute | `write:mutes` |
| Block/Unblock | `write:blocks` |
| Home Timeline | `read:statuses` |
| Notifications | `read:notifications` |

### Logging

- `LOG_LEVEL`: Logging level (`debug`/`info`/`warn`/`error`)
- `LOG_FORMAT`: Log format (`json`/`text`)
- `LOG_FILE`: Log file path

### Development/Debug

- `DEBUG`: Enable debug mode
- `DEBUG_MODE`: Enable debug features
- `VERBOSE_LOGGING`: Enable verbose logging

## HTTP Transport Mode

When running in HTTP mode (`MCP_TRANSPORT_MODE=http`), the server exposes the following endpoints:

| Endpoint | Description |
|----------|-------------|
| `/mcp` | MCP protocol endpoint (for MCP clients) |
| `/health` | Health check endpoint (returns server health status) |
| `/metrics` | Performance metrics endpoint |
| `/` | Server info (name, version, available endpoints) |

### Starting in HTTP Mode

```bash
# Basic HTTP mode
MCP_TRANSPORT_MODE=http npm run mcp

# Custom port and host
MCP_TRANSPORT_MODE=http MCP_HTTP_PORT=8080 MCP_HTTP_HOST=0.0.0.0 npm run mcp

# With CORS enabled for web clients
MCP_TRANSPORT_MODE=http MCP_HTTP_CORS_ENABLED=true MCP_HTTP_CORS_ORIGINS=https://myapp.com npm run mcp
```

## Instance Blocklist

The instance blocklist allows you to block access to specific fediverse instances. Blocks can be configured via environment variables or managed programmatically.

### Configuration

```bash
# Block specific instances
BLOCKED_INSTANCES=spam.example.com,malicious.example.org

# Wildcard patterns are supported (when adding programmatically)
# *.badnetwork.example blocks all subdomains
```

### Block Reasons

When adding blocks programmatically, you can specify a reason:
- `policy`: Admin policy block
- `user`: User-requested block
- `safety`: Safety/moderation block
- `spam`: Known spam instance
- `federation`: Defederated instance
- `custom`: Custom reason

## Audit Logging

Audit logging tracks all tool invocations, resource access, and security-relevant events.

### Tracked Events

- `tool_invocation`: Tool calls and their results
- `resource_access`: Resource reads
- `rate_limit_exceeded`: Rate limit violations
- `blocked_instance`: Blocked instance access attempts
- `ssrf_blocked`: SSRF protection triggers
- `error`: Error events

### Sensitive Data Handling

The audit logger automatically redacts sensitive fields containing:
- `password`
- `token`
- `secret`
- `key`
- `auth`
- `credential`

## Troubleshooting

### Common Issues

**CORS Errors in Production**
- Ensure `CORS_ORIGINS` includes your exact domain
- Use HTTPS URLs in production
- Never use `*` for CORS in production

**Performance Issues**
- Check `LOG_LEVEL` is not `debug` in production
- Ensure `DEBUG_MODE=false` in production
- Consider using Redis for federation queues

**Connection Issues**
- Verify `HOST` is set to `0.0.0.0` for production
- Check firewall settings for the configured `PORT`
- Ensure `ACTIVITYPUB_BASE_URL` is accessible externally

### Getting Help

1. Check the logs at the configured `LOG_FILE` path
2. Verify environment variables are loaded correctly
3. Test with development configuration first
4. Review the security checklist for production issues

## Migration Between Environments

When moving from development to production:

1. **Never** copy `.env` directly between environments
2. Always start with the appropriate template
3. Review each setting individually
4. Test in a staging environment first
5. Monitor logs after deployment
