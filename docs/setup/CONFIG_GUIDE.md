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

### Logging
- `LOG_LEVEL`: Logging level (`debug`/`info`/`warn`/`error`)
- `LOG_FORMAT`: Log format (`json`/`text`)
- `LOG_FILE`: Log file path

### Development/Debug
- `DEBUG`: Enable debug mode
- `DEBUG_MODE`: Enable debug features
- `VERBOSE_LOGGING`: Enable verbose logging

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
