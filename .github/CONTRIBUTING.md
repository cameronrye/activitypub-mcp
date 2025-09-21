# Contributing to ActivityPub MCP Server

Thank you for your interest in contributing to the ActivityPub MCP Server! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Issues

1. **Search existing issues** first to avoid duplicates
2. **Use the appropriate issue template** (Bug Report, Feature Request, or Question)
3. **Provide detailed information** including environment details and reproduction steps
4. **Be respectful and constructive** in your communication

### Submitting Pull Requests

1. **Fork the repository** and create a new branch from `main`
2. **Follow the coding standards** outlined below
3. **Write or update tests** for your changes
4. **Update documentation** as needed
5. **Fill out the pull request template** completely
6. **Ensure all CI checks pass** before requesting review

## 🛠️ Development Setup

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **npm** or **yarn**
- **Git**

### Local Development

1. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/activitypub-mcp.git
   cd activitypub-mcp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development servers**:
   ```bash
   # Terminal 1: ActivityPub server
   npm run dev
   
   # Terminal 2: MCP server
   npm run mcp:dev
   ```

### Testing

Run the full test suite:
```bash
npm run test:all
```

Run specific test types:
```bash
npm run test              # Unit tests
npm run test:integration  # Integration tests
npm run test:comprehensive # Comprehensive tests
```

### Code Quality

Before submitting, ensure your code passes all quality checks:

```bash
npm run lint              # Check linting
npm run lint:fix          # Fix linting issues
npm run format            # Format code
npm run build             # Build TypeScript
```

## 📝 Coding Standards

### TypeScript Guidelines

- **Use TypeScript** for all new code
- **Enable strict mode** and fix all type errors
- **Use proper types** instead of `any` when possible
- **Document complex types** with JSDoc comments

### Code Style

We use **Biome** for code formatting and linting:

- **Follow the existing code style** in the project
- **Use meaningful variable and function names**
- **Keep functions small and focused**
- **Add comments for complex logic**

### File Organization

```
src/
├── main.ts              # ActivityPub server entry point
├── mcp-main.ts          # MCP server entry point
├── mcp-server.ts        # MCP server implementation
├── federation.ts        # ActivityPub federation logic
└── logging.ts           # Logging configuration
```

### Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

Examples:
```
feat(mcp): add new ActivityPub tool for sharing posts
fix(federation): resolve actor discovery timeout issue
docs(readme): update installation instructions
```

## 🧪 Testing Guidelines

### Test Structure

- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test MCP server integration
- **Comprehensive tests**: Test full workflow scenarios

### Writing Tests

- **Test both success and failure cases**
- **Use descriptive test names**
- **Mock external dependencies**
- **Keep tests focused and independent**

### Test Files

```
tests/
├── test-mcp.ts           # MCP server tests
├── test-integration.ts   # Integration tests
└── test-comprehensive.ts # End-to-end tests
```

## 📚 Documentation

### Code Documentation

- **Use JSDoc comments** for public APIs
- **Document complex algorithms** and business logic
- **Include usage examples** in documentation
- **Keep documentation up to date** with code changes

### User Documentation

- **Update README.md** for user-facing changes
- **Add examples** to EXAMPLES.md
- **Update USAGE_GUIDE.md** for new features
- **Maintain CHANGELOG.md** for releases

## 🔒 Security

### Security Guidelines

- **Never commit secrets** or sensitive data
- **Use environment variables** for configuration
- **Validate all inputs** and sanitize outputs
- **Follow security best practices** for ActivityPub

### Reporting Security Issues

Please report security vulnerabilities privately by emailing the maintainers or using GitHub's security advisory feature.

## 🚀 Release Process

### Version Management

We follow **Semantic Versioning** (SemVer):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Workflow

1. **Update version** in package.json
2. **Update CHANGELOG.md** with changes
3. **Create release tag**: `git tag v1.2.3`
4. **Push tag**: `git push origin v1.2.3`
5. **GitHub Actions** will automatically publish to npm

## 🎯 Project Goals

### Core Objectives

- **Seamless MCP integration** for ActivityPub interactions
- **High-quality TypeScript** codebase
- **Comprehensive documentation** and examples
- **Cross-platform compatibility**
- **Security and performance** focus

### Non-Goals

- **Full ActivityPub client** implementation
- **Web UI** for server management
- **Database-specific** implementations

## 💬 Communication

### Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and community discussion
- **Pull Request Reviews**: For code-related discussions

### Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## 🙏 Recognition

Contributors will be recognized in:
- **CONTRIBUTORS.md** file
- **GitHub contributors** section
- **Release notes** for significant contributions

Thank you for contributing to the ActivityPub MCP Server! 🎉
