#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/nginx/dex.kobbex.com.conf"
DST="/etc/nginx/sites-available/dex.kobbex.com.conf"
EN="/etc/nginx/sites-enabled/dex.kobbex.com.conf"

echo "[1/4] Installing nginx config..."
sudo cp -a "$SRC" "$DST"
sudo ln -sf "$DST" "$EN"

echo "[2/4] Testing nginx..."
sudo nginx -t

echo "[3/4] Restarting nginx..."
sudo systemctl restart nginx

echo "[4/4] Quick verify:"
sudo ss -lntp | grep -E '(:80\s|:443\s)' || true
echo "Try:"
echo "  curl -I http://127.0.0.1 -H 'Host: dex.kobbex.com' | head"
echo "  curl -kI https://127.0.0.1 -H 'Host: dex.kobbex.com' | head"
