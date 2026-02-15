#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
#  Swaperex Server Inventory — READ-ONLY audit script
#
#  Run on VPS as root to collect system state for DevOps audit.
#  Does NOT modify anything. Safe to run in production.
#
#  Usage:
#    bash scripts/server-inventory.sh > /tmp/swaperex-inventory.txt 2>&1
#    cat /tmp/swaperex-inventory.txt
# ──────────────────────────────────────────────────────────────────
set -uo pipefail

divider() { echo ""; echo "======== $1 ========"; echo ""; }

divider "1. SYSTEM INFO"
date
uname -a
lsb_release -a 2>/dev/null || cat /etc/os-release

divider "2. DISK & MEMORY"
df -h
echo "---"
du -sh /root/Swaperex /var/www/swaperex 2>/dev/null
echo "---"
free -h
uptime

divider "3. LISTENING PORTS"
ss -lntup 2>/dev/null | head -80

divider "4. NGINX"
nginx -v 2>&1
echo "---"
echo "sites-enabled:"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null
echo "sites-available:"
ls -la /etc/nginx/sites-available/ 2>/dev/null
echo "conf.d:"
ls -la /etc/nginx/conf.d/ 2>/dev/null
echo "---"
echo "Key nginx directives:"
nginx -T 2>/dev/null | grep -nE "listen 80|listen 443|server_name|root |return 301|proxy_pass|location" | head -60
echo "---"
nginx -t 2>&1

divider "5. NGINX LOGS (last 30 lines)"
echo "--- error.log ---"
tail -n 30 /var/log/nginx/error.log 2>/dev/null || echo "(not found)"
echo "--- access.log ---"
tail -n 30 /var/log/nginx/access.log 2>/dev/null || echo "(not found)"

divider "6. DEPLOYED FRONTEND"
echo "index.html stat:"
stat /var/www/swaperex/index.html 2>/dev/null || echo "(not found)"
echo "---"
echo "Asset reference in HTML:"
grep -oE '/assets/index-[^"]+\.js' /var/www/swaperex/index.html 2>/dev/null || echo "(not found)"
echo "---"
echo "Assets directory:"
ls -lah /var/www/swaperex/assets/ 2>/dev/null | head -20
echo "---"
echo "version.txt:"
cat /var/www/swaperex/version.txt 2>/dev/null || echo "(not found)"

divider "7. HTTP SMOKE TESTS"
echo "localhost:"
curl -sS -D- http://127.0.0.1/ -o /dev/null 2>&1 | head -10
echo "---"
echo "public IP:"
curl -sS -D- http://207.180.212.142/ -o /dev/null 2>&1 | head -10
echo "---"
echo "HTTPS (expect failure if no cert):"
curl -k -sS -D- https://207.180.212.142/ -o /dev/null 2>&1 | head -10 || echo "(no HTTPS)"

divider "8. PM2"
pm2 ls 2>/dev/null || echo "pm2 not found"
echo "---"
pm2 show backend-signals 2>/dev/null | head -30 || true
echo "---"
echo "PM2 logs (last 20 lines):"
pm2 logs --nostream --lines 20 2>/dev/null || true

divider "9. CERTBOT / SSL"
certbot certificates 2>/dev/null || echo "certbot not found or no certificates"
echo "---"
ls -la /etc/letsencrypt/live/ 2>/dev/null || echo "(no letsencrypt dir)"

divider "10. CRONTAB"
crontab -l 2>/dev/null || echo "(no crontab)"

divider "11. SYSTEMD SERVICES (custom)"
systemctl list-units --type=service --state=running 2>/dev/null | grep -iE "swaperex|node|nginx|docker|pm2|certbot" || echo "(none matched)"

divider "12. DOCKER"
docker ps -a 2>/dev/null || echo "docker not running"
echo "---"
docker images 2>/dev/null | head -10 || true

divider "13. UFW FIREWALL"
ufw status verbose 2>/dev/null || echo "ufw not installed"

divider "14. GIT REPO STATE"
cd /root/Swaperex 2>/dev/null && git status -sb && git log -5 --oneline --decorate || echo "(repo not found)"

divider "15. NODE VERSIONS"
node -v 2>/dev/null || echo "node not found"
npm -v 2>/dev/null || echo "npm not found"

echo ""
echo "======== INVENTORY COMPLETE ========"
echo "Save this output and share for audit review."
