#!/bin/bash
set -euo pipefail
OBS_DIR="$1"
checkpoint() {
  local label="$1"
  {
    echo "=== OBS $label $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    curl -sS --resolve dex.kobbex.com:443:127.0.0.1 -o /dev/null -w 'homepage=%{http_code} ttfb=%{time_starttransfer}\n' https://dex.kobbex.com/
    curl -sS --resolve dex.kobbex.com:443:127.0.0.1 https://dex.kobbex.com/version.txt | tr '\n' ' '; echo
    curl -sS -o /dev/null -w 'signals=%{http_code}\n' http://127.0.0.1:4001/health
    curl -sS -o /dev/null -w 'admin=%{http_code}\n' http://127.0.0.1:8001/api/v1/admin/overview || true
    pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin);
for x in d:
  e=x.get("pm2_env",{});
  print(x.get("name"), e.get("status"), "restarts", e.get("restart_time"))' 2>/dev/null
  } | tee "$OBS_DIR/checkpoint-${label}.txt"
}
checkpoint T0
sleep 300; checkpoint T5m
sleep 600; checkpoint T15m
sleep 900; checkpoint T30m
sleep 1800; checkpoint T1h
echo DONE | tee "$OBS_DIR/obs-complete.flag"
