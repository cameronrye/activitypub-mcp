# ActivityPub MCP Server Installation Script for Windows
# Automatically installs and configures the ActivityPub MCP server for Claude Desktop and Cursor

param(
    [string]$Client = "claude",
    [switch]$DryRun,
    [switch]$Verbose,
    [string]$Command = "install"
)

# Configuration
$PACKAGE_NAME = "activitypub-mcp"
$SERVER_NAME = "activitypub"

# Colors for output
$Colors = @{
    Red = "Red"
    Green = "Green"
    Yellow = "Yellow"
    Blue = "Blue"
}

# Logging functions
function Write-Info {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $Colors.Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $Colors.Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor $Colors.Red
}

function Write-Step {
    param([string]$Message)
    Write-Host "🔄 $Message" -ForegroundColor $Colors.Blue
}

# Help function
function Show-Help {
    Write-Host @"
ActivityPub MCP Server Installation Script for Windows

Usage: .\install.ps1 [options] [command]

Commands:
  install     Install the MCP server (default)
  uninstall   Remove the MCP server configuration
  test        Test the installation

Options:
  -Client <name>    Target client (claude, cursor) [default: claude]
  -DryRun           Show what would be done without making changes
  -Verbose          Show detailed output
  -Help             Show this help message

Examples:
  .\install.ps1                          # Install for Claude Desktop
  .\install.ps1 -Client cursor           # Install for Cursor
  .\install.ps1 uninstall                # Uninstall from Claude Desktop
  .\install.ps1 -DryRun -Verbose         # Preview installation steps

Supported clients: Claude Desktop, Cursor
"@
}

# Get config path for client
function Get-ConfigPath {
    param(
        [string]$ClientName
    )
    
    $userProfile = $env:USERPROFILE
    
    switch ($ClientName) {
        "claude" {
            return Join-Path $userProfile "AppData\Roaming\Claude\claude_desktop_config.json"
        }
        "cursor" {
            # Current Cursor reads ~/.cursor/mcp.json on every platform.
            return Join-Path $userProfile ".cursor\mcp.json"
        }
        default {
            throw "Unsupported client: $ClientName"
        }
    }
}

# Check prerequisites
function Test-Prerequisites {
    Write-Step "Checking prerequisites..."
    
    # Check Node.js
    try {
        $nodeVersion = node --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Node.js is installed: $nodeVersion"
        } else {
            throw "Node.js not found"
        }
    } catch {
        Write-Error "Node.js is not installed. Please install Node.js 20+ first."
        Write-Host "Visit: https://nodejs.org/"
        exit 1
    }
    
    # Check npm
    try {
        $npmVersion = npm --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "npm is installed: $npmVersion"
        } else {
            throw "npm not found"
        }
    } catch {
        Write-Error "npm is not installed. Please install npm first."
        exit 1
    }
}

# Create directory if it doesn't exist
function Ensure-Directory {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        if ($Verbose) {
            Write-Info "Creating directory: $Path"
        }
        if (-not $DryRun) {
            New-Item -ItemType Directory -Path $Path -Force | Out-Null
        }
    }
}

# Update configuration file
function Update-Config {
    param([string]$ConfigPath)

    $configDir = Split-Path $ConfigPath -Parent

    Write-Step "Updating configuration: $ConfigPath"

    Ensure-Directory $configDir

    if ($DryRun) {
        Write-Info "[DRY RUN] Would add '$SERVER_NAME' to MCP config at: $ConfigPath (preserving existing servers)"
        return
    }

    # Delegate the JSON merge to the shared, env-driven Node helper (Node is a
    # prerequisite). It preserves every existing mcpServers entry and REFUSES to
    # overwrite a config it can't parse. The old `ConvertFrom-Json -AsHashtable`
    # path is PowerShell 6+ only — on stock Windows PowerShell 5.1 it threw, the
    # catch reset the config to empty, and the script then wiped every other MCP
    # server the user had configured. This is the same helper install.sh uses.
    $merge = Join-Path $PSScriptRoot "merge-mcp-config.mjs"
    $env:AP_MCP_CONFIG_PATH = $ConfigPath
    $env:AP_MCP_SERVER_NAME = $SERVER_NAME
    $env:AP_MCP_PACKAGE_NAME = $PACKAGE_NAME
    $env:AP_MCP_ACTION = "add"
    node $merge
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to update configuration (existing config left untouched)."
        exit 1
    }

    Write-Info "Configuration updated successfully!"
}

# Install package globally
function Install-Package {
    Write-Step "Installing $PACKAGE_NAME globally..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would run: npm install -g $PACKAGE_NAME"
        return
    }
    
    try {
        npm install -g $PACKAGE_NAME
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Package installed successfully!"
        } else {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    } catch {
        Write-Error "Failed to install package: $_"
        exit 1
    }
}

# Test installation
function Test-Installation {
    Write-Step "Testing installation..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would test: npx $PACKAGE_NAME --version"
        return
    }
    
    try {
        $version = npx $PACKAGE_NAME --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Installation test successful! Version: $version"
        } else {
            Write-Warn "Installation test failed, but package may still work"
        }
    } catch {
        Write-Warn "Could not test installation: $_"
    }
}

# Uninstall function
function Uninstall-Server {
    Write-Info "🗑️ Uninstalling ActivityPub MCP Server for $Client..."
    
    $configPath = Get-ConfigPath $Client
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would remove server config from: $configPath"
        return
    }
    
    if (Test-Path $configPath) {
        # Delegate to the same Node helper as the add path: it removes only our
        # entry, preserves the rest, and refuses to clobber unparseable JSON —
        # avoiding the PowerShell 5.1 -AsHashtable failure that wiped configs.
        $merge = Join-Path $PSScriptRoot "merge-mcp-config.mjs"
        $env:AP_MCP_CONFIG_PATH = $configPath
        $env:AP_MCP_SERVER_NAME = $SERVER_NAME
        $env:AP_MCP_ACTION = "remove"
        node $merge
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to update config file (existing config left untouched)."
            exit 1
        }
    } else {
        Write-Warn "Config file not found: $configPath"
    }

    Write-Info "Uninstallation completed!"
}

# Main installation function
function Install-Server {
    Write-Info "🚀 Installing ActivityPub MCP Server for $Client..."
    
    Test-Prerequisites
    
    $configPath = Get-ConfigPath $Client
    
    if (-not $configPath) {
        Write-Error "Unsupported client: $Client"
        exit 1
    }
    
    Update-Config $configPath
    Install-Package
    Test-Installation
    
    Write-Info "🎉 Installation completed successfully!"
    Write-Host ""
    Write-Info "Next steps:"
    Write-Host "1. Restart $Client to load the new MCP server"
    Write-Host "2. Start the ActivityPub server: npm run dev"
    Write-Host "3. The MCP server will start automatically when needed"
    Write-Host ""
    Write-Info "For more information, see: https://github.com/cameronrye/activitypub-mcp"
}

# Main execution
switch ($Command) {
    "install" { Install-Server }
    "uninstall" { Uninstall-Server }
    "test" { Test-Installation }
    default {
        Write-Error "Unknown command: $Command"
        Show-Help
        exit 1
    }
}
