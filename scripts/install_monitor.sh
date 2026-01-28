#!/bin/bash
#
# Install Skye Monitor as a launchd service
# This will auto-start Skye when you log in and keep it running
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKYE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_NAME="com.skye.monitor.plist"
PLIST_SOURCE="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

install_service() {
    log_info "Installing Skye Monitor service..."

    # Create LaunchAgents directory if it doesn't exist
    mkdir -p "$HOME/Library/LaunchAgents"

    # Stop existing service if running
    if launchctl list | grep -q "com.skye.monitor"; then
        log_info "Stopping existing service..."
        launchctl unload "$PLIST_DEST" 2>/dev/null
    fi

    # Copy plist file
    cp "$PLIST_SOURCE" "$PLIST_DEST"

    # Update paths in plist to use actual user home
    sed -i '' "s|/Users/ganathan|$HOME|g" "$PLIST_DEST"

    # Find node path
    NODE_PATH=$(which node)
    if [ -n "$NODE_PATH" ]; then
        sed -i '' "s|/opt/homebrew/bin/node|$NODE_PATH|g" "$PLIST_DEST"
    fi

    # Load the service
    launchctl load "$PLIST_DEST"

    if launchctl list | grep -q "com.skye.monitor"; then
        log_info "Skye Monitor service installed and started!"
        log_info "Skye will now automatically start on login and restart if it crashes."
        echo ""
        log_info "To check status: launchctl list | grep skye"
        log_info "To view logs: tail -f $SKYE_DIR/skye-monitor.log"
    else
        log_error "Failed to start service"
        log_error "Check: launchctl list | grep skye"
        return 1
    fi
}

uninstall_service() {
    log_info "Uninstalling Skye Monitor service..."

    if launchctl list | grep -q "com.skye.monitor"; then
        launchctl unload "$PLIST_DEST" 2>/dev/null
    fi

    if [ -f "$PLIST_DEST" ]; then
        rm "$PLIST_DEST"
    fi

    log_info "Skye Monitor service uninstalled"
}

status_service() {
    if launchctl list | grep -q "com.skye.monitor"; then
        log_info "Skye Monitor service is installed and running"
        launchctl list | grep "com.skye.monitor"
    else
        log_warn "Skye Monitor service is not running"
    fi
}

case "$1" in
    install)
        install_service
        ;;
    uninstall)
        uninstall_service
        ;;
    status)
        status_service
        ;;
    *)
        echo "Skye Monitor Service Installer"
        echo ""
        echo "Usage: $0 {install|uninstall|status}"
        echo ""
        echo "Commands:"
        echo "  install    Install and start the monitor service"
        echo "  uninstall  Stop and remove the monitor service"
        echo "  status     Check if the service is running"
        exit 1
        ;;
esac
