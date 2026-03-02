#!/usr/bin/env bash
set -euo pipefail

echo "== Host =="
hostnamectl || true
echo

echo "== Disk/mem =="
df -hT | sed -n '1,20p' || true
free -h || true
echo

echo "== Nginx =="
nginx -v 2>&1 || true
sudo nginx -T 2>/dev/null | head -n 40 || true
echo

echo "== Repo =="
cd ~/Swaperex || exit 1
git status -sb
git log -1 --oneline --decorate
echo

echo "== Deployed assets =="
ls -la /var/www/swaperex/assets 2>/dev/null | head -n 30 || true
echo
