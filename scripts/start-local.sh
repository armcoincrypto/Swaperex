#!/bin/bash
# Start frontend + backend-signals locally. Press Ctrl+C to stop both.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$REPO_ROOT"

# Free ports 3000 and 4001 if something is still holding them
for port in 3000 4001; do
  if lsof -ti:$port >/dev/null 2>&1; then
    echo "[start-local] Killing process on port $port..."
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

# Build backend if dist/ missing
if [ ! -f "backend-signals/dist/index.js" ]; then
  echo "[start-local] Building backend-signals..."
  (cd backend-signals && npm run build)
fi

# Start backend in background (auto-restart on crash)
echo "[start-local] Starting backend-signals on :4001..."
(
  cd backend-signals
  while true; do
    npm start || true
    echo "[start-local] Backend exited, restarting in 2s..."
    sleep 2
  done
) &
BACKEND_PID=$!

# Trap Ctrl+C to kill both
cleanup() {
  echo ""
  echo "[start-local] Stopping..."
  kill $BACKEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# Give backend a moment to start
sleep 2

# WalletConnect: use only local frontend/.env.local (no SSH — create it once for local dev)
if [ -f "frontend/.env.local" ]; then
  VITE_WC_PROJECT_ID=$(grep -E '^(VITE_WC_PROJECT_ID|VITE_WALLETCONNECT_PROJECT_ID)=' frontend/.env.local 2>/dev/null | head -1 | cut -d= -f2- || true)
fi
if [ -n "$VITE_WC_PROJECT_ID" ] && [ "$VITE_WC_PROJECT_ID" != "PASTE_YOUR_PROJECT_ID_HERE" ] && [ "$VITE_WC_PROJECT_ID" != "your_project_id_here" ]; then
  export VITE_WC_PROJECT_ID
  echo "[start-local] WalletConnect project ID loaded from frontend/.env.local"
else
  echo "[start-local] No VITE_WC_PROJECT_ID in frontend/.env.local — WalletConnect QR disabled. Add it to enable (get one at https://cloud.walletconnect.com)"
fi

# Start frontend (foreground, auto-restart on crash)
echo "[start-local] Starting frontend (Vite will print the URL below — open that in the browser, e.g. http://localhost:3000 or :3001 if 3000 was in use)"
cd frontend
while true; do
  npm run dev || true
  echo "[start-local] Frontend exited, restarting in 2s..."
  sleep 2
done
