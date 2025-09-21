#!/bin/bash

# ActivityPub MCP Server Setup Script
# Comprehensive setup for development and production environments

set -e

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

echo -e "${BLUE}🚀 Setting up ActivityPub MCP Server...${NC}"

# Parse command line arguments
INSTALL_MCP=false
CLIENT="claude"
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --install-mcp)
            INSTALL_MCP=true
            shift
            ;;
        --client=*)
            CLIENT="${1#*=}"
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --install-mcp     Also install MCP server for Claude Desktop"
            echo "  --client=<name>   Target client for MCP installation (claude, cursor)"
            echo "  --verbose         Show detailed output"
            echo "  --help            Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check Node.js version
check_node_version() {
    log_step "Checking Node.js version..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        echo "Visit: https://nodejs.org/"
        exit 1
    fi

    local node_version
    node_version=$(node --version | sed 's/v//')
    local major_version
    major_version=$(echo "$node_version" | cut -d. -f1)

    if [[ $major_version -lt 18 ]]; then
        log_error "Node.js version $node_version is not supported. Please install Node.js 18+ first."
        exit 1
    fi

    log_info "Node.js version $node_version is supported"
}

# Check npm
check_npm() {
    log_step "Checking npm..."

    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi

    local npm_version
    npm_version=$(npm --version)
    log_info "npm version $npm_version is installed"
}

# Install dependencies
install_dependencies() {
    log_step "Installing dependencies..."

    if $VERBOSE; then
        npm install
    else
        npm install --silent
    fi

    log_info "Dependencies installed successfully"
}

# Setup environment
setup_environment() {
    log_step "Setting up environment configuration..."

    if [[ ! -f .env ]]; then
        cp .env.example .env
        log_info "Created .env file from template"
        log_warn "Please edit .env file with your configuration"
    else
        log_info ".env file already exists"

        # Check if .env.example is newer
        if [[ .env.example -nt .env ]]; then
            log_warn ".env.example is newer than .env - you may want to update your configuration"
        fi
    fi
}

# Create directories
create_directories() {
    log_step "Creating necessary directories..."

    local dirs=("data" "logs" "keys" "media" "tmp")

    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            if $VERBOSE; then
                log_info "Created directory: $dir"
            fi
        fi
    done

    log_info "Directory structure created"
}

# Setup git hooks (if in git repo)
setup_git_hooks() {
    if [[ -d .git ]]; then
        log_step "Setting up git hooks..."

        # Create pre-commit hook for linting
        cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Run linting before commit
npm run lint
EOF
        chmod +x .git/hooks/pre-commit

        log_info "Git hooks configured"
    fi
}

# Install MCP server
install_mcp_server() {
    if $INSTALL_MCP; then
        log_step "Installing MCP server for $CLIENT..."

        if [[ -f scripts/install.sh ]]; then
            bash scripts/install.sh --client="$CLIENT"
        else
            log_warn "MCP installation script not found, skipping MCP installation"
        fi
    fi
}

# Main setup process
main() {
    check_node_version
    check_npm
    install_dependencies
    setup_environment
    create_directories
    setup_git_hooks
    install_mcp_server

    log_info "🎉 Setup completed successfully!"
    echo ""
    log_info "Next steps:"
    echo "1. Edit .env file with your configuration"
    echo "2. Run 'npm run dev' to start development server"
    echo "3. Run 'npm run mcp' to start MCP server"
    if ! $INSTALL_MCP; then
        echo "4. Run 'npm run install:claude' to install MCP server for Claude Desktop"
    fi
    echo ""
    log_info "For more information, see README.md"
    echo ""
    log_info "Available commands:"
    echo "  npm run dev          - Start ActivityPub server in development mode"
    echo "  npm run mcp          - Start MCP server"
    echo "  npm run test         - Run tests"
    echo "  npm run install:claude - Install MCP server for Claude Desktop"
    echo "  npm run install:cursor - Install MCP server for Cursor"
}

# Run main function
main
