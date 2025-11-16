# Security Policy

## Supported Versions

We actively support the following versions of ActivityPub MCP Server with security updates:

| Version | Supported |
| ------- | --------- |
| 1.x.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do Not Create Public Issues

**Please do not report security vulnerabilities through public GitHub issues.** This could put users at risk.

### 2. Report Privately

Choose one of these methods to report security issues:

#### GitHub Security Advisories (Preferred)
1. Go to the [Security tab](https://github.com/cameronrye/activitypub-mcp/security) of this repository
2. Click "Report a vulnerability"
3. Fill out the security advisory form with details

#### Email
Send an email to the maintainers with:
- **Subject**: `[SECURITY] ActivityPub MCP Server - [Brief Description]`
- **Details**: Full description of the vulnerability
- **Impact**: Potential impact and affected versions
- **Reproduction**: Steps to reproduce (if applicable)

### 3. What to Include

When reporting a vulnerability, please include:

- **Description**: Clear description of the vulnerability
- **Impact**: What could an attacker accomplish?
- **Affected versions**: Which versions are affected?
- **Reproduction steps**: How to reproduce the issue
- **Proof of concept**: Code or screenshots (if applicable)
- **Suggested fix**: If you have ideas for a fix

## Security Response Process

### 1. Acknowledgment
We will acknowledge receipt of your vulnerability report within **48 hours**.

### 2. Investigation
We will investigate the issue and determine:
- Severity level
- Affected versions
- Potential impact
- Required fixes

### 3. Fix Development
We will develop and test a fix for the vulnerability.

### 4. Disclosure Timeline
- **Day 0**: Vulnerability reported
- **Day 1-2**: Acknowledgment sent
- **Day 3-14**: Investigation and fix development
- **Day 14-30**: Security release published
- **Day 30+**: Public disclosure (if appropriate)

### 5. Security Release
We will:
- Release a patched version
- Publish a security advisory
- Credit the reporter (if desired)

## Security Best Practices

### For Users

#### Installation Security
- **Use official packages**: Only install from npm or official sources
- **Verify checksums**: Check package integrity when possible
- **Keep updated**: Regularly update to the latest version

#### Configuration Security
- **Secure environment variables**: Never commit `.env` files
- **Use HTTPS**: Always use HTTPS in production
- **Limit access**: Restrict network access to necessary ports
- **Regular audits**: Run `npm audit` regularly

#### Runtime Security
- **Monitor logs**: Watch for suspicious activity
- **Rate limiting**: Enable rate limiting in production
- **Input validation**: Validate all external inputs
- **Secure headers**: Use appropriate HTTP security headers

### For Developers

#### Code Security
- **Input validation**: Validate and sanitize all inputs
- **Output encoding**: Properly encode outputs
- **Authentication**: Implement proper authentication
- **Authorization**: Check permissions for all actions

#### Dependencies
- **Minimal dependencies**: Only include necessary dependencies
- **Regular updates**: Keep dependencies updated
- **Security scanning**: Use automated security scanning
- **License compliance**: Ensure license compatibility

#### ActivityPub Security
- **Signature verification**: Verify HTTP signatures
- **Actor validation**: Validate remote actors
- **Content filtering**: Filter malicious content
- **Rate limiting**: Implement federation rate limits

## Known Security Considerations

### ActivityPub Protocol
- **HTTP Signature verification** is critical for federation security
- **Actor impersonation** is possible without proper verification
- **Content injection** through malicious ActivityPub objects
- **Denial of service** through federation flooding

### MCP Integration
- **Command injection** through malicious MCP requests
- **Resource exhaustion** through excessive MCP calls
- **Information disclosure** through verbose error messages
- **Privilege escalation** through improper tool access

### Node.js Environment
- **Prototype pollution** in JavaScript objects
- **Path traversal** in file operations
- **Code injection** through eval or similar functions
- **Memory leaks** in long-running processes

## Security Tools and Automation

We use the following tools to maintain security:

- **npm audit**: Dependency vulnerability scanning
- **CodeQL**: Static code analysis
- **Dependabot**: Automated dependency updates
- **GitHub Security Advisories**: Vulnerability tracking

## Responsible Disclosure

We believe in responsible disclosure and will work with security researchers to:

- **Understand the issue** fully before disclosure
- **Develop appropriate fixes** before public release
- **Coordinate disclosure timing** to protect users
- **Provide credit** to researchers (if desired)

## Security Contact

For security-related questions or concerns:

- **GitHub Security Advisories**: [Report a vulnerability](https://github.com/cameronrye/activitypub-mcp/security)
- **General security questions**: Create a private issue or discussion

## Legal

This security policy is provided in good faith. We reserve the right to:

- Determine the severity and impact of reported issues
- Decide on appropriate disclosure timelines
- Modify this policy as needed

Thank you for helping keep ActivityPub MCP Server secure!
