#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.." || exit 1

TS="$(date +%F_%H%M%S)"
mkdir -p "$HOME/backups"

echo "== Repo backup =="
tar -czf "$HOME/backups/Swaperex_repo_${TS}.tgz" .

echo "== Deployed site backup =="
if [ -d /var/www/swaperex ]; then
  sudo tar -czf "$HOME/backups/swaperex_www_${TS}.tgz" /var/www/swaperex
else
  echo "WARN: /var/www/swaperex not found, skipping"
fi

echo "== Nginx backup =="
if [ -d /etc/nginx ]; then
  sudo tar -czf "$HOME/backups/nginx_${TS}.tgz" /etc/nginx
else
  echo "WARN: /etc/nginx not found, skipping"
fi

echo
echo "BACKUPS:"
ls -lah "$HOME/backups" | tail -n 20
