#!/usr/bin/env bash
# Install dev.dex.kobbex.com nginx vhost only. Uses reload (not restart) — no prod downtime.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/nginx/dev.dex.kobbex.com.conf"
DST="/etc/nginx/sites-available/dev.dex.kobbex.com.conf"
EN="/etc/nginx/sites-enabled/dev.dex.kobbex.com.conf"
WEBROOT="/var/www/swaperex-dev"

echo "[1/5] Ensure dev webroot exists..."
sudo mkdir -p "$WEBROOT"
sudo chown www-data:www-data "$WEBROOT"

echo "[2/5] Installing nginx config..."
sudo cp -a "$SRC" "$DST"
sudo ln -sf "$DST" "$EN"

echo "[3/5] Testing nginx (all vhosts)..."
if ! sudo nginx -t; then
  echo "If TLS paths are missing, issue cert first:"
  echo "  sudo certbot certonly --webroot -w $WEBROOT -d dev.dex.kobbex.com"
  exit 1
fi

echo "[4/5] Reloading nginx (graceful)..."
sudo systemctl reload nginx

echo "[5/5] Done. Deploy static files:"
echo "  sudo bash scripts/deploy-dev-frontend.sh"
echo "  bash scripts/audit/verify-dev-live.sh"
