#!/usr/bin/env bash
# Dev-only: Vite live preview for dev.dex.kobbex.com (127.0.0.1:5173, nginx proxy).
# Does not touch production dex.kobbex.com.
#
# Usage:
#   bash scripts/dev-vite-preview.sh start
#   bash scripts/dev-vite-preview.sh stop
#   bash scripts/dev-vite-preview.sh status
#   bash scripts/dev-vite-preview.sh restart
#
# Prerequisites:
#   - nginx dev vhost in LIVE PREVIEW mode (scripts/nginx/dev.dex.kobbex.com.conf)
#   - frontend/node_modules installed

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/Swaperex}"
FRONTEND_DIR="$REPO_DIR/frontend"
PID_FILE="${PID_FILE:-/tmp/swaperex-vite-dev.pid}"
LOG_FILE="${LOG_FILE:-/var/log/swaperex-vite-dev.log}"
HOST="127.0.0.1"
PORT="5173"

cmd="${1:-status}"

log() { echo "[dev-vite] $(date '+%Y-%m-%d %H:%M:%S') $1"; }

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  ss -tlnp 2>/dev/null | grep -q ":${PORT} " && return 0
  return 1
}

start_server() {
  if is_running; then
    log "Already running (pid $(cat "$PID_FILE" 2>/dev/null || echo '?'), port $PORT)"
    exit 0
  fi
  [[ -d "$FRONTEND_DIR" ]] || { log "Missing $FRONTEND_DIR"; exit 1; }
  command -v npm >/dev/null || { log "npm not found"; exit 1; }

  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  log "Starting Vite on $HOST:$PORT (log: $LOG_FILE)"
  cd "$FRONTEND_DIR"
  nohup npm run dev -- --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 2
  if ! is_running; then
    log "Failed to start — tail $LOG_FILE"
    tail -20 "$LOG_FILE" 2>/dev/null || true
    exit 1
  fi
  log "OK — https://dev.dex.kobbex.com/ (via nginx proxy)"
}

stop_server() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      log "Stopping pid $pid"
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  log "Stopped (port $PORT should be free)"
}

case "$cmd" in
  start) start_server ;;
  stop) stop_server ;;
  restart) stop_server; start_server ;;
  status)
    if is_running; then
      log "running — pid $(cat "$PID_FILE" 2>/dev/null || echo '?'), $HOST:$PORT"
      curl -sI "http://${HOST}:${PORT}/" 2>/dev/null | head -3 || true
    else
      log "not running"
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
