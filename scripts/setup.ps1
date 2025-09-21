# ActivityPub MCP Server Setup Script for Windows
# Comprehensive setup for development and production environments

param(
    [switch]$InstallMCP,
    [string]$Client = "claude",
    [switch]$Verbose
)

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

Write-Host "🚀 Setting up ActivityPub MCP Server..." -ForegroundColor $Colors.Blue

# Check Node.js version
function Test-NodeVersion {
    Write-Step "Checking Node.js version..."

    try {
        $nodeVersion = node --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Node.js not found"
        }
        
        $versionNumber = $nodeVersion -replace 'v', ''
        $majorVersion = ($versionNumber -split '\.')[0]

        if ([int]$majorVersion -lt 18) {
            Write-Error "Node.js version $nodeVersion is not supported. Please install Node.js 18+ first."
            exit 1
        }

        Write-Info "Node.js version $nodeVersion is supported"
    } catch {
        Write-Error "Node.js is not installed. Please install Node.js 18+ first."
        Write-Host "Visit: https://nodejs.org/"
        exit 1
    }
}

# Check npm
function Test-Npm {
    Write-Step "Checking npm..."

    try {
        $npmVersion = npm --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "npm not found"
        }
        Write-Info "npm version $npmVersion is available"
    } catch {
        Write-Error "npm is not installed. Please install npm first."
        exit 1
    }
}

# Install dependencies
function Install-Dependencies {
    Write-Step "Installing dependencies..."

    try {
        npm install
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Dependencies installed successfully"
        } else {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    } catch {
        Write-Error "Failed to install dependencies: $_"
        exit 1
    }
}

# Setup environment
function Set-Environment {
    Write-Step "Setting up environment configuration..."

    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Write-Info "Created .env file from template"
        Write-Warn "Please edit .env file with your configuration"
    } else {
        Write-Info ".env file already exists"

        # Check if .env.example is newer
        $envExample = Get-Item ".env.example" -ErrorAction SilentlyContinue
        $env = Get-Item ".env" -ErrorAction SilentlyContinue
        
        if ($envExample -and $env -and $envExample.LastWriteTime -gt $env.LastWriteTime) {
            Write-Warn ".env.example is newer than .env - you may want to update your configuration"
        }
    }
}

# Create directories
function New-Directories {
    Write-Step "Creating necessary directories..."

    $dirs = @("data", "logs", "keys", "media", "tmp")

    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            if ($Verbose) {
                Write-Info "Created directory: $dir"
            }
        }
    }

    Write-Info "Directory structure created"
}

# Install MCP server
function Install-MCPServer {
    Write-Step "Installing MCP server for $Client..."

    try {
        & ".\scripts\install.ps1" -Client $Client
        Write-Info "MCP server installed successfully"
    } catch {
        Write-Error "Failed to install MCP server: $_"
        exit 1
    }
}

# Main setup function
function Start-Setup {
    Test-NodeVersion
    Test-Npm
    Install-Dependencies
    Set-Environment
    New-Directories

    if ($InstallMCP) {
        Install-MCPServer
    }

    Write-Info "🎉 Setup completed successfully!"
    Write-Host ""
    Write-Info "Next steps:"
    Write-Host "1. Edit .env file with your configuration"
    Write-Host "2. Run 'npm run dev' to start development server"
    Write-Host "3. Run 'npm run mcp' to start MCP server"
    if (-not $InstallMCP) {
        Write-Host "4. Run 'npm run install:claude' to install MCP server for Claude Desktop"
    }
    Write-Host ""
    Write-Info "For more information, see README.md"
    Write-Host ""
    Write-Info "Available commands:"
    Write-Host "  npm run dev          - Start ActivityPub server in development mode"
    Write-Host "  npm run mcp          - Start MCP server"
    Write-Host "  npm run test         - Run tests"
    Write-Host "  npm run install:claude - Install MCP server for Claude Desktop"
    Write-Host "  npm run install:cursor - Install MCP server for Cursor"
}

# Run main function
Start-Setup
