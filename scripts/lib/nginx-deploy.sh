#!/usr/bin/env bash
# Swaperex-only deploy helper — informational nginx check, NO reload.
# Source from prod-deploy.sh — do not execute directly.
#
# SCOPE: dex.kobbex.com static assets at /var/www/swaperex only.
# Swaperex deploys MUST NOT reload, restart, or modify shared nginx — other
# Kobbex/Kobbopay vhosts share the same host. Static rsync does not require reload.
#
# Return codes:
#   0 — informational check complete (reload intentionally skipped)
#   2 — warning (conf path issue noted; deploy validation should continue)

discover_nginx_conf_path() {
  local conf="" nginx_bin="${NGINX_BIN:-nginx}"

  if ! command -v "$nginx_bin" >/dev/null 2>&1; then
    return 1
  fi

  conf="$("$nginx_bin" -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p' | head -n 1)"
  if [ -n "$conf" ] && [ -f "$conf" ]; then
    printf '%s\n' "$conf"
    return 0
  fi

  return 1
}

# Informational nginx note for Swaperex static deploy — never reloads shared nginx.
swaperex_nginx_reload_optional() {
  local nginx_bin="${NGINX_BIN:-nginx}"
  local conf="" expected=""

  echo "== Nginx (Swaperex scope: skipped — static deploy only) =="
  echo "INFO: Swaperex deploy syncs /var/www/swaperex only."
  echo "INFO: No nginx reload/restart is performed (shared host — other products out of scope)."

  if ! command -v "$nginx_bin" >/dev/null 2>&1; then
    echo "INFO: nginx binary not found — irrelevant for static rsync deploy"
    return 0
  fi

  echo "nginx: $("$nginx_bin" -V 2>&1 | head -n 1)"

  if conf="$(discover_nginx_conf_path)"; then
    echo "INFO: nginx --conf-path resolves to $conf (not modified by Swaperex deploy)"
    if "$nginx_bin" -t -c "$conf" 2>&1; then
      echo "INFO: nginx -t OK (no reload performed — Swaperex policy)"
      return 0
    fi
    echo "WARN: nginx -t failed for $conf — Swaperex static deploy unaffected; escalate to platform ops if dex.kobbex.com breaks"
    return 2
  fi

  expected="$("$nginx_bin" -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p' | head -n 1)"
  echo "WARN: nginx conf not found at reported --conf-path=${expected:-unknown}"
  echo "WARN: Swaperex static deploy does not require nginx reload — verify dex.kobbex.com via scripts/audit/verify-live.sh"
  return 2
}
