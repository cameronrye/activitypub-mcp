# Dependency Management Guide

This document outlines the dependency management strategy for the ActivityPub MCP Server project.

## Automated Dependency Updates

### Dependabot Configuration

The project uses GitHub Dependabot for automated dependency updates:

- **Schedule**: Weekly updates on Mondays at 09:00 UTC
- **Scope**: Both NPM packages and GitHub Actions
- **Grouping**: Related dependencies are grouped together for easier review
- **Limits**: Maximum 10 NPM PRs and 5 GitHub Actions PRs open at once

### Dependency Groups

Dependencies are automatically grouped for efficient review:

1. **TypeScript**: TypeScript compiler, type definitions, and tsx
2. **Testing**: Testing frameworks and coverage tools
3. **Linting**: Code quality and formatting tools
4. **Build Tools**: Build and development utilities
5. **GitHub Actions**: CI/CD workflow dependencies

### Update Policy

- **Patch & Minor Updates**: Automatically grouped and can be merged after CI passes
- **Major Updates**: Require manual review due to potential breaking changes
- **Security Updates**: Prioritized and should be reviewed immediately

## Manual Dependency Management

### Adding New Dependencies

```bash
# Production dependencies
npm install package-name

# Development dependencies
npm install --save-dev package-name
```

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update all dependencies (be cautious with major versions)
npm update

# Update specific package
npm install package-name@latest
```

### Security Audits

```bash
# Run security audit
npm audit

# Fix automatically fixable vulnerabilities
npm audit fix

# Fix with breaking changes (review carefully)
npm audit fix --force
```

## Security Monitoring

### Automated Security Checks

The project includes several automated security measures:

1. **Weekly Security Scans**: CodeQL analysis every Monday
2. **Dependency Review**: Automatic review of dependency changes in PRs
3. **NPM Audit**: Regular security audits of dependencies
4. **License Checking**: Verification of dependency licenses

### Security Workflow

1. **Dependabot Security Updates**: Automatically created for security vulnerabilities
2. **Manual Review**: All security-related PRs require manual review
3. **Testing**: Security updates must pass all tests before merging
4. **Documentation**: Security changes should be documented in CHANGELOG.md

## Dependency Review Process

### For Maintainers

When reviewing Dependabot PRs:

1. **Check CI Status**: Ensure all tests pass
2. **Review Changes**: Check the changelog for breaking changes
3. **Test Locally**: For major updates, test locally if needed
4. **Merge Strategy**: Use "Squash and merge" for cleaner history

### For Contributors

When adding new dependencies:

1. **Justify Need**: Explain why the dependency is necessary
2. **Check Alternatives**: Consider if existing dependencies can be used
3. **Security Review**: Verify the package is well-maintained and secure
4. **License Compatibility**: Ensure license is compatible with MIT

## Dependency Categories

### Core Dependencies

- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `@logtape/logtape`: Logging framework
- `zod`: Schema validation
- `tsx`: TypeScript execution

### Development Dependencies

- `@biomejs/biome`: Linting and formatting
- `typescript`: TypeScript compiler
- `c8`: Code coverage
- `cross-env`: Cross-platform environment variables

### Build Dependencies

- `rimraf`: File cleanup
- `npm-run-all`: Script orchestration

## Troubleshooting

### Common Issues

**Dependency Conflicts**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Security Vulnerabilities**
```bash
# Check for vulnerabilities
npm audit

# Review and fix
npm audit fix
```

**Outdated Dependencies**
```bash
# Check what's outdated
npm outdated

# Update carefully
npm update
```

### Getting Help

1. Check the [npm documentation](https://docs.npmjs.com/)
2. Review dependency changelogs for breaking changes
3. Test changes in a development environment first
4. Ask for help in GitHub issues if needed

## Best Practices

1. **Regular Updates**: Keep dependencies up to date for security
2. **Test Changes**: Always test dependency updates thoroughly
3. **Read Changelogs**: Review breaking changes before updating
4. **Pin Versions**: Use exact versions for critical dependencies
5. **Monitor Security**: Stay informed about security advisories
6. **Document Changes**: Update CHANGELOG.md for significant updates

## Monitoring and Alerts

### GitHub Security Alerts

- Enable Dependabot security updates
- Review security advisories regularly
- Subscribe to security notifications

### NPM Audit

- Run `npm audit` regularly
- Address high and critical vulnerabilities immediately
- Review moderate vulnerabilities based on usage

### License Compliance

- Use `license-checker` to verify licenses
- Ensure all dependencies use compatible licenses
- Document any license exceptions

## Emergency Procedures

### Critical Security Vulnerability

1. **Immediate Action**: Update the vulnerable dependency
2. **Testing**: Run full test suite
3. **Deployment**: Deploy fix as soon as possible
4. **Communication**: Notify users if necessary
5. **Documentation**: Document the incident and resolution

### Broken Dependency

1. **Rollback**: Revert to previous working version
2. **Investigation**: Identify the cause of the issue
3. **Fix or Replace**: Either fix the issue or find alternative
4. **Testing**: Ensure fix works correctly
5. **Update**: Apply the fix and update documentation
