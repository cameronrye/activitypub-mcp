# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
