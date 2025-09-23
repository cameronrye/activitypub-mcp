# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-21

### Added
- Initial release of ActivityPub MCP Server
- Comprehensive ActivityPub/Fediverse integration for LLM applications
- Support for ActivityStreams vocabulary and WebFinger protocol
- Cross-platform compatibility (Windows, macOS, Linux)
- Model Context Protocol (MCP) server implementation
- Integration with Fedify framework for ActivityPub functionality
- Comprehensive test suite with unit, integration, and comprehensive tests
- CLI interface for easy setup and configuration
- Platform-specific installation scripts (.ps1 for Windows, .sh for Unix)
- Automated GitHub workflows for CI/CD, security scanning, and releases
- TypeScript support with full type definitions
- Logging and monitoring capabilities
- Environment-based configuration with dotenv support

### Features
- **ActivityPub Protocol Support**: Full implementation of ActivityPub specification
- **Fediverse Integration**: Connect and interact with Mastodon, Pleroma, and other fediverse platforms
- **MCP Server**: Provides LLM context about ActivityPub activities and social interactions
- **Cross-Platform**: Works on Windows, macOS, and Linux with platform-specific optimizations
- **Type Safety**: Full TypeScript implementation with comprehensive type definitions
- **Security**: Built-in security scanning and dependency auditing
- **Testing**: Comprehensive test coverage with multiple test suites
- **Documentation**: Extensive documentation and usage guides

### Dependencies
- @modelcontextprotocol/sdk: ^1.18.1 - MCP protocol implementation
- @logtape/logtape: ^1.1.1 - Logging framework
- @dotenvx/dotenvx: ^1.50.1 - Environment configuration
- tsx: ^4.20.5 - TypeScript execution
- zod: ^3.25.76 - Schema validation

### Development Dependencies
- @biomejs/biome: ^1.9.4 - Linting and formatting
- cross-env: ^7.0.3 - Cross-platform environment variables
- npm-run-all: ^4.1.5 - Script runner
- rimraf: ^5.0.5 - File cleanup utility

## [Unreleased]

### Planned
- Enhanced federation capabilities
- Additional ActivityPub extensions
- Performance optimizations
- Extended documentation and examples
- Plugin system for custom extensions
