#!/bin/bash
#
# VPS Auto-Update Script for Swaperex
#
# PHASE 14: Production deployment automation
#
# OPTIONS:
# 1. Cron job (recommended) - runs every 5 minutes
# 2. GitHub webhook - triggers on push
# 3. Manual run
#
# SETUP:
# 1. Copy this script to your VPS: scp scripts/vps-auto-update.sh user@your-vps:/opt/swaperex/
# 2. Make executable: chmod +x /opt/swaperex/vps-auto-update.sh
# 3. Add to crontab: crontab -e
#    */5 * * * * /opt/swaperex/vps-auto-update.sh >> /var/log/swaperex-update.log 2>&1
#

set -e

# Configuration
REPO_DIR="/opt/swaperex/Swaperex"
BRANCH="main"  # Change to your production branch
LOG_PREFIX="[Swaperex Update]"
LOCK_FILE="/tmp/swaperex-update.lock"

# Logging
log() {
    echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') | $1"
}

error() {
    echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') | ERROR: $1" >&2
}

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE")
    if ps -p "$LOCK_PID" > /dev/null 2>&1; then
        log "Another update is running (PID: $LOCK_PID). Exiting."
        exit 0
    else
        log "Removing stale lock file"
        rm -f "$LOCK_FILE"
    fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Check if repo exists
if [ ! -d "$REPO_DIR/.git" ]; then
    error "Repository not found at $REPO_DIR"
    exit 1
fi

cd "$REPO_DIR"

# Fetch latest changes
log "Fetching updates from origin/$BRANCH..."
git fetch origin "$BRANCH" --quiet

# Check if there are updates
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($LOCAL)"
    exit 0
fi

log "Updates available: $LOCAL -> $REMOTE"

# Pull changes
log "Pulling changes..."
git pull origin "$BRANCH" --quiet

# Install dependencies if package.json changed
if git diff --name-only "$LOCAL" "$REMOTE" | grep -q "package.json"; then
    log "package.json changed, installing dependencies..."

    if [ -f "frontend/package.json" ]; then
        cd frontend
        npm install --production --silent
        cd ..
    fi

    if [ -f "backend/package.json" ]; then
        cd backend
        npm install --production --silent
        cd ..
    fi
fi

# Rebuild frontend if source changed
if git diff --name-only "$LOCAL" "$REMOTE" | grep -q "frontend/src/"; then
    log "Frontend source changed, rebuilding..."
    cd frontend
    npm run build --silent
    cd ..
fi

# Restart services
log "Restarting services..."

# Option 1: PM2 (recommended)
if command -v pm2 &> /dev/null; then
    pm2 restart swaperex-frontend --silent 2>/dev/null || true
    pm2 restart swaperex-backend --silent 2>/dev/null || true
fi

# Option 2: Systemd
# sudo systemctl restart swaperex-frontend
# sudo systemctl restart swaperex-backend

# Option 3: Docker
# docker-compose -f docker-compose.prod.yml up -d --build

log "Update completed successfully!"
log "New version: $(git rev-parse --short HEAD)"

# Optional: Send notification (uncomment and configure)
# curl -X POST "https://your-webhook-url" \
#   -H "Content-Type: application/json" \
#   -d "{\"text\": \"Swaperex updated to $(git rev-parse --short HEAD)\"}"
