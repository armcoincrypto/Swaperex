#!/bin/bash
# Build frontend with VITE_WC_PROJECT_ID fetched from server .env
# Usage: ./scripts/build-frontend.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER="${SWAPEREX_SERVER:-root@207.180.212.142}"
ENV_PATHS="${SWAPEREX_ENV_PATHS:-/root/Swaperex/frontend/.env /root/Swaperex/.env}"

echo "[build-frontend] Fetching VITE_WC_PROJECT_ID from $SERVER..."
VITE_WC_PROJECT_ID=$(ssh "$SERVER" "grep -h -E '^(VITE_WC_PROJECT_ID|VITE_WALLETCONNECT_PROJECT_ID)=' $ENV_PATHS 2>/dev/null | head -1 | cut -d= -f2-" || true)

if [ -z "$VITE_WC_PROJECT_ID" ] || [ "$VITE_WC_PROJECT_ID" = "PASTE_YOUR_PROJECT_ID_HERE" ]; then
  echo "[build-frontend] WARN: No valid VITE_WC_PROJECT_ID from server. Build may have WalletConnect disabled."
fi

echo "[build-frontend] Building frontend..."
cd "$REPO_ROOT/frontend"
VITE_WC_PROJECT_ID="$VITE_WC_PROJECT_ID" npm run build
echo "[build-frontend] Done. Output: frontend/dist/"
