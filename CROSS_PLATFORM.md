# Cross-Platform Compatibility Guide

This document outlines the cross-platform compatibility features implemented in the ActivityPub MCP Server project.

## Supported Platforms

✅ **Windows 10/11**
- PowerShell 5.1+
- Command Prompt
- Git Bash
- Windows Subsystem for Linux (WSL)

✅ **macOS**
- macOS 10.15+ (Catalina and later)
- Bash and Zsh shells
- Both Intel and Apple Silicon

✅ **Linux**
- Ubuntu 18.04+
- Debian 10+
- CentOS 7+
- Fedora 30+
- Other distributions with Bash

## Cross-Platform Features

### Automatic Platform Detection
The project automatically detects your operating system and runs the appropriate scripts:

```bash
npm run setup          # Auto-detects platform
npm run install:shell  # Auto-detects platform
```

### Platform-Specific Scripts

| Platform | Setup Script | Install Script |
|----------|-------------|----------------|
| Windows | `scripts/setup.ps1` | `scripts/install.ps1` |
| macOS/Linux | `scripts/setup.sh` | `scripts/install.sh` |

### Cross-Platform npm Scripts

All npm scripts work across platforms:

```bash
npm run dev            # Start development server
npm run mcp            # Start MCP server
npm run test           # Run tests
npm run build          # Build project
npm run clean          # Clean build artifacts (uses rimraf)
npm run setup          # Platform-aware setup
npm run install:claude # Install for Claude Desktop
npm run install:cursor # Install for Cursor
```

## Installation Methods by Platform

### Windows

**Option 1: Automatic (Recommended)**
```bash
npm run setup
```

**Option 2: PowerShell Direct**
```powershell
.\scripts\setup.ps1
```

**Option 3: Git Bash**
```bash
npm run setup:unix
```

### macOS/Linux

**Option 1: Automatic (Recommended)**
```bash
npm run setup
```

**Option 2: Bash Direct**
```bash
bash scripts/setup.sh
```

## Configuration Paths

The project automatically uses the correct configuration paths for each platform:

### Claude Desktop
- **Windows**: `%USERPROFILE%\AppData\Roaming\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

### Cursor
- **Windows**: `%USERPROFILE%\AppData\Roaming\Cursor\User\globalStorage\mcp_config.json`
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/mcp_config.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/mcp_config.json`

## Troubleshooting

### Windows Issues

**PowerShell Execution Policy Error:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Path Issues:**
Use the Node.js scripts instead of shell scripts:
```bash
npm run setup          # Instead of .\scripts\setup.ps1
npm run install:claude # Instead of .\scripts\install.ps1
```

**Git Bash Issues:**
Use Unix-style commands in Git Bash:
```bash
npm run setup:unix
npm run install:shell:unix
```

### macOS/Linux Issues

**Permission Denied:**
```bash
chmod +x scripts/*.sh
```

**Node.js Version:**
Ensure Node.js 18+ is installed:
```bash
node --version  # Should be v18.0.0 or higher
```

## Development Dependencies

The following cross-platform dependencies are included:

- **cross-env**: Cross-platform environment variables
- **npm-run-all**: Run npm scripts sequentially or in parallel
- **rimraf**: Cross-platform file/directory removal

## Testing Cross-Platform Compatibility

### Test Platform Detection
```bash
node scripts/run-platform.js setup --help
```

### Test npm Scripts
```bash
npm run clean    # Should work on all platforms
npm run build    # Should work on all platforms
npm run test     # Should work on all platforms
```

### Test Installation
```bash
npm run install:claude --dry-run  # Safe test without changes
```

## Implementation Details

### Script Runner (`scripts/run-platform.js`)
- Automatically detects `process.platform`
- Chooses appropriate script (.ps1 for Windows, .sh for Unix)
- Passes through command-line arguments
- Provides helpful error messages

### PowerShell Scripts
- Use Windows-native paths and commands
- Handle Windows environment variables correctly
- Include proper error handling and logging
- Support both PowerShell 5.1 and PowerShell Core

### Bash Scripts
- Use Unix-style paths and commands
- Handle different shell environments (bash, zsh)
- Include POSIX-compliant features
- Support various Linux distributions

## Best Practices

1. **Always use npm scripts** for cross-platform compatibility
2. **Test on multiple platforms** when making changes
3. **Use Node.js path utilities** for file system operations
4. **Provide platform-specific documentation** when needed
5. **Handle environment variables** appropriately for each platform

## Contributing

When contributing to this project:

1. Test changes on Windows, macOS, and Linux if possible
2. Use cross-platform tools and libraries
3. Update both PowerShell and Bash scripts when adding features
4. Document platform-specific requirements or limitations
5. Use the provided npm scripts for consistency

## Support

If you encounter platform-specific issues:

1. Check this guide for common solutions
2. Verify Node.js version (18+ required)
3. Ensure proper permissions on script files
4. Try the alternative installation methods
5. Open an issue with platform details and error messages
