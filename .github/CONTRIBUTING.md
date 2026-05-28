# Contributing to ActivityPub MCP Server

Thank you for your interest in contributing to the ActivityPub MCP Server! This document provides guidelines and information for contributors.

## How to Contribute

### Reporting Issues

1. **Search existing issues** first to avoid duplicates
2. **Use the appropriate issue template** (Bug Report, Feature Request, or Question)
3. **Provide detailed information** including environment details and reproduction steps
4. **Be respectful and constructive** in your communication

### Submitting Pull Requests

1. **Fork the repository** and create a new branch from `master`
2. **Follow the coding standards** outlined below
3. **Write or update tests** for your changes
4. **Update documentation** as needed
5. **Fill out the pull request template** completely
6. **Ensure all CI checks pass** before requesting review

## Development Setup

### Prerequisites

- **Node.js 20+** (LTS recommended; CI runs on Node 20 and 22)
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

4. **Start MCP server in development mode**:
   ```bash
   # Start MCP server with auto-reload
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
npm run test:integration  # Integration tests (see below — requires opt-in env var)
```

Integration tests that hit the live fediverse (`tests/integration/`) are gated
behind the `RUN_INTEGRATION_TESTS` environment variable so they never run as
part of routine local development or PR CI. To run them locally:

```bash
RUN_INTEGRATION_TESTS=1 npm run test:integration
```

CI runs them on a daily schedule via `.github/workflows/integration.yml`;
failures there are reported but non-blocking.

### Code Quality

Before submitting, ensure your code passes all quality checks:

```bash
npm run typecheck         # Type-check without emitting
npm run lint              # Check linting (read-only; CI runs the same check)
npm run lint:fix          # Fix linting issues locally
npm run format            # Format code
npm run build             # Build TypeScript
```

> **CI is read-only.** The pipeline runs `npm run lint` (not `lint:fix`). Run
> `lint:fix` locally before pushing — never expect CI to auto-fix style.

#### Recommended: precommit hook

The repo ships a `precommit` npm script that runs validation and lint:

```bash
npm run precommit
```

Wire it into a local git pre-commit hook so issues are caught before push:

```bash
# One-time setup — uses a plain pre-commit hook (no extra deps):
cat > .git/hooks/pre-commit <<'EOF'
#!/usr/bin/env bash
exec npm run precommit
EOF
chmod +x .git/hooks/pre-commit
```

### Schema-first rule for tool changes

When you add or modify an MCP tool parameter:

1. **Add the parameter to the Zod schema in `src/mcp/`** first.
2. **Update the README and the Astro docs (`src/pages/docs/api/tools.astro`)
   in the same commit.** Code and docs drifted in v1; the v2 audit found
   five mismatched tools. Keep them in sync at commit time.
3. **Add a test** that exercises the new parameter (success + at least one
   refusal/refinement case).

The MCP `server-info` capability list is generated from the live registry
(`src/mcp/capabilities.ts`), so a missing tool registration shows up at
runtime — but parameter-level drift between schema and docs does not, so
it is on the author to keep the doc in sync.

## Coding Standards

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

`src/` is organized by topic (see MIGRATION-v2.md "Internal refactor" for the
full move table from v1 → v2):

```
src/
├── main.ts                       # Info display entry point
├── mcp-main.ts                   # MCP server entry point
├── mcp-server.ts                 # MCP server implementation
├── config.ts                     # Configuration constants
├── activitypub/                  # Remote ActivityPub client
├── audit/                        # Audit logging
├── auth/                         # Multi-account auth + authenticated client
├── discovery/                    # WebFinger + instance discovery
├── mcp/                          # MCP tools, resources, prompts, capabilities
├── policy/                       # Instance blocklist
├── resilience/                   # Rate limiters
├── telemetry/                    # Health checks, performance monitor, logging
├── transport/                    # HTTP transport + bearer auth middleware
├── utils/                        # Errors, HTML helpers, fetch helpers, LRU cache
└── validation/                   # URL validation, Zod schemas, request validators
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

## Testing Guidelines

### Test Structure

- **Unit tests** (`tests/unit/*.test.ts`): Vitest + MSW. Test individual
  modules in isolation with mocked HTTP. Always-on in CI.
- **Integration tests** (`tests/integration/*.test.ts`): hit the live
  fediverse. Gated by `RUN_INTEGRATION_TESTS=1`. Run nightly in CI.

### Writing Tests

- **Test both success and failure cases**
- **Use descriptive test names**
- **Mock external dependencies** with MSW handlers in `tests/mocks/`
- **Keep tests focused and independent**

### Test Files

```
tests/
├── setup.ts              # Vitest setup (MSW init, env shim)
├── mocks/                # MSW request handlers
├── unit/                 # Vitest suites with mocked HTTP — always run in CI
└── integration/          # Live-fediverse suites — opt-in via RUN_INTEGRATION_TESTS=1
```

## Documentation

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

## Security

### Security Guidelines

- **Never commit secrets** or sensitive data
- **Use environment variables** for configuration
- **Validate all inputs** and sanitize outputs
- **Follow security best practices** for ActivityPub

### Reporting Security Issues

Please report security vulnerabilities privately by emailing the maintainers or using GitHub's security advisory feature.

## Release Process

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

## Project Goals

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

## Communication

### Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and community discussion
- **Pull Request Reviews**: For code-related discussions

### Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Recognition

Contributors will be recognized in:
- **CONTRIBUTORS.md** file
- **GitHub contributors** section
- **Release notes** for significant contributions

Thank you for contributing to the ActivityPub MCP Server!
