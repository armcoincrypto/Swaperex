#!/usr/bin/env bash
#
# Swaperex VPS Server Inventory (READ-ONLY)
#
# Collects diagnostic info about the running server state.
# Does NOT modify anything. Safe to run anytime.
#
# Usage:
#   bash scripts/server-inventory.sh
#   bash scripts/server-inventory.sh > inventory-$(date +%F).txt
#

set -uo pipefail

SEP="────────────────────────────────────────────────────────"

section() {
    echo ""
    echo "$SEP"
    echo "  $1"
    echo "$SEP"
}

# ──────────────────────────────────────────────
section "1. SYSTEM INFO"
# ──────────────────────────────────────────────
echo "Hostname:    $(hostname 2>/dev/null || echo unknown)"
echo "OS:          $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"' || uname -s)"
echo "Kernel:      $(uname -r)"
echo "Uptime:      $(uptime -p 2>/dev/null || uptime)"
echo "Date (UTC):  $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "Disk usage:"
df -h / 2>/dev/null | tail -1 | awk '{print "  Used: "$3" / "$2"  ("$5" full)"}'
echo "Memory:"
free -h 2>/dev/null | awk '/^Mem:/{print "  Used: "$3" / "$2}' || echo "  (free not available)"

# ──────────────────────────────────────────────
section "2. NGINX STATUS"
# ──────────────────────────────────────────────
if command -v nginx &>/dev/null; then
    echo "Installed:   $(nginx -v 2>&1)"
    echo "Active:      $(systemctl is-active nginx 2>/dev/null || echo unknown)"
    echo "Enabled:     $(systemctl is-enabled nginx 2>/dev/null || echo unknown)"
    echo ""
    echo "Config test:"
    nginx -t 2>&1 | sed 's/^/  /'
    echo ""
    echo "Enabled sites:"
    ls -1 /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/  /' || echo "  (no sites-enabled dir)"
    echo ""
    echo "All server_name directives:"
    grep -r 'server_name' /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/  /' || echo "  (none found)"
    echo ""
    echo "All root directives:"
    grep -r '^\s*root' /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/  /' || echo "  (none found)"
    echo ""
    echo "All proxy_pass directives:"
    grep -r 'proxy_pass' /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/  /' || echo "  (none found)"
else
    echo "nginx NOT installed"
fi

# ──────────────────────────────────────────────
section "3. DEPLOY DIRECTORY"
# ──────────────────────────────────────────────
DEPLOY_DIR="/var/www/swaperex"
if [[ -d "$DEPLOY_DIR" ]]; then
    echo "Path:        $DEPLOY_DIR"
    echo "Owner:       $(stat -c '%U:%G' "$DEPLOY_DIR" 2>/dev/null || ls -ld "$DEPLOY_DIR" | awk '{print $3":"$4}')"
    echo "File count:  $(find "$DEPLOY_DIR" -type f 2>/dev/null | wc -l)"
    echo "Disk size:   $(du -sh "$DEPLOY_DIR" 2>/dev/null | cut -f1)"
    echo ""
    if [[ -f "$DEPLOY_DIR/version.txt" ]]; then
        echo "version.txt:"
        cat "$DEPLOY_DIR/version.txt" | sed 's/^/  /'
    else
        echo "version.txt: NOT FOUND (no version tracking yet)"
    fi
    echo ""
    echo "index.html:  $(test -f "$DEPLOY_DIR/index.html" && echo "EXISTS" || echo "MISSING")"
    echo ".map files:  $(find "$DEPLOY_DIR" -name '*.map' 2>/dev/null | wc -l) found"
    echo ".env files:  $(find "$DEPLOY_DIR" -name '.env*' 2>/dev/null | wc -l) found"
else
    echo "$DEPLOY_DIR does NOT exist"
fi

# ──────────────────────────────────────────────
section "4. GIT REPO STATUS"
# ──────────────────────────────────────────────
REPO_DIR="/root/Swaperex"
if [[ -d "$REPO_DIR/.git" ]]; then
    echo "Path:        $REPO_DIR"
    echo "Branch:      $(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    echo "Commit:      $(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null)"
    echo "Full SHA:    $(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null)"
    echo "Last commit: $(git -C "$REPO_DIR" log -1 --format='%s (%ar)' 2>/dev/null)"
    echo "Dirty:       $(git -C "$REPO_DIR" status --porcelain 2>/dev/null | wc -l) modified files"
    echo ""
    echo "Remote:"
    git -C "$REPO_DIR" remote -v 2>/dev/null | sed 's/^/  /'
else
    echo "Git repo not found at $REPO_DIR"
    # Try alternate location
    if [[ -d "/opt/swaperex/Swaperex/.git" ]]; then
        echo "Found repo at /opt/swaperex/Swaperex/ instead"
    fi
fi

# ──────────────────────────────────────────────
section "5. NODE.JS / NPM"
# ──────────────────────────────────────────────
echo "Node:    $(node --version 2>/dev/null || echo 'NOT installed')"
echo "NPM:    $(npm --version 2>/dev/null || echo 'NOT installed')"

# ──────────────────────────────────────────────
section "6. PM2 PROCESSES"
# ──────────────────────────────────────────────
if command -v pm2 &>/dev/null; then
    echo "PM2 version: $(pm2 --version 2>/dev/null)"
    echo ""
    pm2 list 2>/dev/null || echo "  (pm2 list failed)"
else
    echo "PM2 NOT installed"
fi

# ──────────────────────────────────────────────
section "7. SYSTEMD SWAPEREX SERVICES"
# ──────────────────────────────────────────────
systemctl list-units --type=service --all 2>/dev/null | grep -i 'swap\|swaperex\|signal' | sed 's/^/  /' || echo "  No swaperex systemd services found"

# ──────────────────────────────────────────────
section "8. LISTENING PORTS"
# ──────────────────────────────────────────────
echo "Ports in use (swaperex-relevant):"
ss -tlnp 2>/dev/null | grep -E ':(80|443|3000|3001|4001|8000|9000)\s' | sed 's/^/  /' || \
    netstat -tlnp 2>/dev/null | grep -E ':(80|443|3000|3001|4001|8000|9000)\s' | sed 's/^/  /' || \
    echo "  (ss/netstat not available)"

# ──────────────────────────────────────────────
section "9. CERTIFICATE STATUS"
# ──────────────────────────────────────────────
if command -v certbot &>/dev/null; then
    echo "Certbot installed"
    certbot certificates 2>/dev/null | grep -E '(Certificate Name|Domains|Expiry)' | sed 's/^/  /' || echo "  (no certs or permission denied)"
else
    echo "Certbot NOT installed"
fi

# Check for any SSL certs referenced in nginx
echo ""
echo "SSL certs referenced in nginx configs:"
grep -r 'ssl_certificate' /etc/nginx/ 2>/dev/null | grep -v '#' | sed 's/^/  /' || echo "  (none found)"

# ──────────────────────────────────────────────
section "10. SMOKE TESTS"
# ──────────────────────────────────────────────
echo "Testing localhost endpoints:"

# Homepage
HTTP_CODE=$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1/ 2>/dev/null || echo "000")
echo "  GET /              → HTTP $HTTP_CODE"

# Version
HTTP_CODE=$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1/version.txt 2>/dev/null || echo "000")
echo "  GET /version.txt   → HTTP $HTTP_CODE"

# API health
HTTP_CODE=$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1/api/health 2>/dev/null || echo "000")
echo "  GET /api/health    → HTTP $HTTP_CODE"

# Security: dotfiles should be blocked
HTTP_CODE=$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1/.env 2>/dev/null || echo "000")
echo "  GET /.env          → HTTP $HTTP_CODE (should be 403/404)"

# Security: source maps
HTTP_CODE=$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1/assets/index.js.map 2>/dev/null || echo "000")
echo "  GET /*.map         → HTTP $HTTP_CODE (should be 403/404)"

# Redirect check
LOCATION=$(curl -sI http://127.0.0.1/ 2>/dev/null | grep -i '^location:' | tr -d '\r' || true)
if [[ -n "$LOCATION" ]]; then
    echo ""
    echo "  WARNING: / redirects to: $LOCATION"
else
    echo "  (no redirect on / — good)"
fi

# ──────────────────────────────────────────────
section "11. STALE CONFIGS CHECK"
# ──────────────────────────────────────────────
echo "Checking for known stale configs:"

# Old/disabled nginx configs
for f in /etc/nginx/sites-available/bots.armcoincrypto.am.conf \
         /etc/nginx/sites-enabled/bots.armcoincrypto.am.conf \
         /etc/nginx/conf.d/bots.armcoincrypto.am.conf; do
    if [[ -f "$f" ]]; then
        echo "  FOUND (stale): $f"
    fi
done

# Check for multiple server blocks that could cause redirect issues
SERVER_BLOCKS=$(grep -rl 'server {' /etc/nginx/sites-enabled/ 2>/dev/null | wc -l)
echo "  Enabled server blocks: $SERVER_BLOCKS"

echo ""
echo "$SEP"
echo "  Inventory complete — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "$SEP"
