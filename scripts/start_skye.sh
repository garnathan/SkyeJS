#!/bin/bash
#
# Skye Control Script
# Usage: ./start_skye.sh {start|stop|restart|status|monitor}
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKYE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$SKYE_DIR/skye.pid"
MONITOR_PID_FILE="$SKYE_DIR/skye-monitor.pid"
LOG_FILE="$SKYE_DIR/skye.log"

SERVER_PORT=3001
CLIENT_PORT=5055

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

is_running() {
    curl -s --max-time 3 "http://localhost:$SERVER_PORT/health" > /dev/null 2>&1
    return $?
}

get_pids() {
    # Get PIDs of processes using our ports
    lsof -ti:$SERVER_PORT 2>/dev/null
    lsof -ti:$CLIENT_PORT 2>/dev/null
}

check_and_install_deps() {
    cd "$SKYE_DIR"

    # With npm workspaces, all deps are hoisted to root node_modules
    # Just check if root node_modules exists
    if [ ! -d "node_modules" ]; then
        log_info "First run detected - installing dependencies..."
        npm install
        if [ $? -ne 0 ]; then
            log_error "Failed to install dependencies"
            return 1
        fi
        log_info "Dependencies installed successfully"
    fi

    return 0
}

start_skye() {
    if is_running; then
        log_info "Skye is already running"
        log_info "Server: http://localhost:$SERVER_PORT"
        log_info "Client: http://localhost:$CLIENT_PORT"
        return 0
    fi

    log_info "Starting Skye..."
    cd "$SKYE_DIR"

    # Check and install dependencies if needed
    check_and_install_deps
    if [ $? -ne 0 ]; then
        return 1
    fi

    # Start in background
    nohup npm run dev > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"

    # Wait for startup
    log_info "Waiting for Skye to start..."
    for i in {1..30}; do
        if is_running; then
            log_info "Skye started successfully (PID: $(cat $PID_FILE))"
            log_info "Server: http://localhost:$SERVER_PORT"
            log_info "Client: http://localhost:$CLIENT_PORT"
            return 0
        fi
        sleep 1
    done

    log_error "Skye failed to start within 30 seconds"
    log_error "Check logs: tail -f $LOG_FILE"
    return 1
}

stop_skye() {
    log_info "Stopping Skye..."

    # Kill by PID file
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID" 2>/dev/null
        fi
        rm -f "$PID_FILE"
    fi

    # Kill any processes on our ports
    PIDS=$(get_pids)
    if [ -n "$PIDS" ]; then
        echo "$PIDS" | xargs kill -9 2>/dev/null
    fi

    # Also kill any node processes running SkyeJS
    pkill -f "node.*SkyeJS" 2>/dev/null

    sleep 1

    if is_running; then
        log_error "Failed to stop Skye completely"
        return 1
    else
        log_info "Skye stopped"
        return 0
    fi
}

status_skye() {
    if is_running; then
        log_info "Skye is running"
        log_info "Server: http://localhost:$SERVER_PORT"
        log_info "Client: http://localhost:$CLIENT_PORT"

        # Show PIDs
        PIDS=$(get_pids | sort -u | tr '\n' ' ')
        if [ -n "$PIDS" ]; then
            log_info "PIDs: $PIDS"
        fi
        return 0
    else
        log_warn "Skye is not running"
        return 1
    fi
}

start_monitor() {
    if [ -f "$MONITOR_PID_FILE" ] && kill -0 $(cat "$MONITOR_PID_FILE") 2>/dev/null; then
        log_info "Monitor is already running (PID: $(cat $MONITOR_PID_FILE))"
        return 0
    fi

    log_info "Starting Skye monitor..."
    cd "$SKYE_DIR"

    nohup node scripts/keep_alive.js >> "$LOG_FILE" 2>&1 &
    echo $! > "$MONITOR_PID_FILE"

    log_info "Monitor started (PID: $!)"
    log_info "Skye will be automatically restarted if it stops responding"
}

stop_monitor() {
    if [ -f "$MONITOR_PID_FILE" ]; then
        PID=$(cat "$MONITOR_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            log_info "Monitor stopped"
        fi
        rm -f "$MONITOR_PID_FILE"
    fi

    # Also kill any keep_alive processes
    pkill -f "node.*keep_alive" 2>/dev/null
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        log_error "No log file found"
    fi
}

case "$1" in
    start)
        start_skye
        ;;
    stop)
        stop_monitor
        stop_skye
        ;;
    restart)
        stop_monitor
        stop_skye
        sleep 2
        start_skye
        ;;
    status)
        status_skye
        ;;
    monitor)
        start_monitor
        ;;
    stop-monitor)
        stop_monitor
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Skye Control Script"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|monitor|stop-monitor|logs}"
        echo ""
        echo "Commands:"
        echo "  start        Start Skye"
        echo "  stop         Stop Skye and monitor"
        echo "  restart      Restart Skye"
        echo "  status       Check if Skye is running"
        echo "  monitor      Start the keep-alive monitor"
        echo "  stop-monitor Stop the keep-alive monitor"
        echo "  logs         Tail the log file"
        exit 1
        ;;
esac
