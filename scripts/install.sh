#!/bin/bash

# ActivityPub MCP Server Installation Script
# Automatically installs and configures the ActivityPub MCP server for Claude Desktop

set -e

# Configuration
PACKAGE_NAME="activitypub-mcp-server"
SERVER_NAME="activitypub"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${BLUE}🔄 $1${NC}"
}

# Help function
show_help() {
    cat << EOF
ActivityPub MCP Server Installation Script

Usage: $0 [options] [command]

Commands:
  install     Install the MCP server (default)
  uninstall   Remove the MCP server configuration
  test        Test the installation

Options:
  --client=<name>   Target client (claude, cursor) [default: claude]
  --dry-run         Show what would be done without making changes
  --verbose         Show detailed output
  --help            Show this help message

Examples:
  $0                          # Install for Claude Desktop
  $0 --client=cursor          # Install for Cursor
  $0 uninstall                # Uninstall from Claude Desktop
  $0 --dry-run --verbose      # Preview installation steps

Supported platforms: macOS, Windows (WSL), Linux
Supported clients: Claude Desktop, Cursor
EOF
}

# Parse command line arguments
CLIENT="claude"
DRY_RUN=false
VERBOSE=false
COMMAND="install"

while [[ $# -gt 0 ]]; do
    case $1 in
        --client=*)
            CLIENT="${1#*=}"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        install|uninstall|test)
            COMMAND="$1"
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*)
            PLATFORM="darwin"
            ;;
        Linux*)
            PLATFORM="linux"
            ;;
        CYGWIN*|MINGW32*|MSYS*|MINGW*)
            PLATFORM="win32"
            ;;
        *)
            log_error "Unsupported platform: $(uname -s)"
            exit 1
            ;;
    esac
}

# Get config path for client
get_config_path() {
    local client="$1"
    local platform="$2"
    
    case "$client" in
        claude)
            case "$platform" in
                darwin)
                    echo "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
                    ;;
                linux)
                    echo "$HOME/.config/claude/claude_desktop_config.json"
                    ;;
                win32)
                    # Use USERPROFILE if available, fallback to HOME
                    local home_dir="${USERPROFILE:-$HOME}"
                    echo "$home_dir/AppData/Roaming/Claude/claude_desktop_config.json"
                    ;;
            esac
            ;;
        cursor)
            case "$platform" in
                darwin)
                    echo "$HOME/Library/Application Support/Cursor/User/globalStorage/mcp_config.json"
                    ;;
                linux)
                    echo "$HOME/.config/Cursor/User/globalStorage/mcp_config.json"
                    ;;
                win32)
                    # Use USERPROFILE if available, fallback to HOME
                    local home_dir="${USERPROFILE:-$HOME}"
                    echo "$home_dir/AppData/Roaming/Cursor/User/globalStorage/mcp_config.json"
                    ;;
            esac
            ;;
        *)
            log_error "Unsupported client: $client"
            exit 1
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    log_info "Node.js is installed: $(node --version)"
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    log_info "npm is installed: $(npm --version)"
    
    # Check if jq is available for JSON manipulation
    if ! command -v jq &> /dev/null; then
        log_warn "jq is not installed. Installing via npm for JSON manipulation..."
        if ! $DRY_RUN; then
            npm install -g jq-cli-wrapper 2>/dev/null || true
        fi
    fi
}

# Create directory if it doesn't exist
ensure_directory() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        if $VERBOSE; then
            log_info "Creating directory: $dir"
        fi
        if ! $DRY_RUN; then
            mkdir -p "$dir"
        fi
    fi
}

# Update configuration file
update_config() {
    local config_path="$1"
    local config_dir
    config_dir="$(dirname "$config_path")"
    
    log_step "Updating configuration: $config_path"
    
    ensure_directory "$config_dir"
    
    # Create server configuration
    local server_config
    server_config=$(cat << EOF
{
  "command": "npx",
  "args": ["-y", "$PACKAGE_NAME"],
  "env": {
    "ACTIVITYPUB_BASE_URL": "http://localhost:8000",
    "LOG_LEVEL": "info"
  }
}
EOF
)
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would update config at: $config_path"
        log_info "[DRY RUN] Server config: $server_config"
        return
    fi
    
    # Read existing config or create empty one
    local existing_config="{}"
    if [[ -f "$config_path" ]]; then
        existing_config=$(cat "$config_path")
    fi
    
    # Use Node.js to update JSON (more reliable than jq for complex operations)
    node -e "
        const fs = require('fs');
        const config = $existing_config;
        if (!config.mcpServers) config.mcpServers = {};
        config.mcpServers['$SERVER_NAME'] = $server_config;
        fs.writeFileSync('$config_path', JSON.stringify(config, null, 2));
    "
    
    log_info "Configuration updated successfully!"
}

# Install package
install_package() {
    log_step "Installing $PACKAGE_NAME..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would install package: $PACKAGE_NAME"
        return
    fi
    
    if npm install -g "$PACKAGE_NAME" 2>/dev/null; then
        log_info "Package installed globally successfully!"
    else
        log_warn "Global installation failed, package will be installed on first use via npx"
    fi
}

# Test installation
test_installation() {
    log_step "Testing installation..."
    
    if $DRY_RUN; then
        log_info "[DRY RUN] Would test installation"
        return
    fi
    
    if timeout 10s npx "$PACKAGE_NAME" --version >/dev/null 2>&1; then
        log_info "Installation test passed!"
    else
        log_warn "Installation test failed - the server may not start correctly"
    fi
}

# Uninstall function
uninstall() {
    log_step "Uninstalling ActivityPub MCP Server..."
    
    detect_platform
    local config_path
    config_path=$(get_config_path "$CLIENT" "$PLATFORM")
    
    if [[ -f "$config_path" ]]; then
        if $DRY_RUN; then
            log_info "[DRY RUN] Would remove $SERVER_NAME from $config_path"
        else
            # Remove server from config using Node.js
            node -e "
                const fs = require('fs');
                try {
                    const config = JSON.parse(fs.readFileSync('$config_path', 'utf8'));
                    if (config.mcpServers && config.mcpServers['$SERVER_NAME']) {
                        delete config.mcpServers['$SERVER_NAME'];
                        fs.writeFileSync('$config_path', JSON.stringify(config, null, 2));
                        console.log('Removed $SERVER_NAME from configuration');
                    } else {
                        console.log('$SERVER_NAME not found in configuration');
                    }
                } catch (error) {
                    console.error('Failed to update configuration:', error.message);
                }
            "
        fi
    else
        log_info "Configuration file not found: $config_path"
    fi
    
    # Optionally uninstall global package
    if ! $DRY_RUN; then
        if npm uninstall -g "$PACKAGE_NAME" 2>/dev/null; then
            log_info "Global package uninstalled"
        else
            log_warn "Global package was not installed or could not be removed"
        fi
    fi
    
    log_info "Uninstallation completed!"
}

# Main installation function
install() {
    log_info "🚀 Installing ActivityPub MCP Server for $CLIENT..."
    
    check_prerequisites
    detect_platform
    
    local config_path
    config_path=$(get_config_path "$CLIENT" "$PLATFORM")
    
    if [[ -z "$config_path" ]]; then
        log_error "Unsupported platform/client combination: $PLATFORM/$CLIENT"
        exit 1
    fi
    
    update_config "$config_path"
    install_package
    test_installation
    
    log_info "🎉 Installation completed successfully!"
    echo ""
    log_info "Next steps:"
    echo "1. Restart $CLIENT to load the new MCP server"
    echo "2. Start the ActivityPub server: npm run dev"
    echo "3. The MCP server will start automatically when needed"
    echo ""
    log_info "For more information, see: https://github.com/cameronrye/activitypub-mcp"
}

# Main execution
main() {
    case "$COMMAND" in
        install)
            install
            ;;
        uninstall)
            uninstall
            ;;
        test)
            test_installation
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main
