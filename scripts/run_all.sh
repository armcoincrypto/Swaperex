#!/bin/bash
# Run all Swaperex services
# Usage: ./scripts/run_all.sh

set -e

cd "$(dirname "$0")/.."

# Kill any existing processes
echo "Stopping existing services..."
pkill -f "uvicorn swaperex" 2>/dev/null || true
pkill -f "swaperex.scanner" 2>/dev/null || true
pkill -f "swaperex.bot" 2>/dev/null || true
sleep 1

# Activate venv if not already
if [ -z "$VIRTUAL_ENV" ]; then
    source .venv/bin/activate
fi

export PYTHONPATH=src

# Reduce SQL logging noise
export SQLALCHEMY_SILENCE_UBER_WARNING=1

echo "Starting API server on port 8000..."
uvicorn swaperex.api.app:app --port 8000 --log-level warning &
API_PID=$!
sleep 2

echo "Starting deposit scanners..."
python -m swaperex.scanner.runner --asset BTC --interval 60 &
BTC_PID=$!
python -m swaperex.scanner.runner --asset ETH --interval 60 &
ETH_PID=$!
python -m swaperex.scanner.runner --asset TRX --interval 60 &
TRX_PID=$!

echo "Starting Telegram bot..."
python -m swaperex.bot.bot &
BOT_PID=$!

echo ""
echo "=== All services started ==="
echo "API:     http://localhost:8000 (PID: $API_PID)"
echo "Scanners:"
echo "  BTC:   every 60s (PID: $BTC_PID)"
echo "  ETH:   every 60s (PID: $ETH_PID)"
echo "  TRX:   every 60s (PID: $TRX_PID)"
echo "Bot:     Telegram polling (PID: $BOT_PID)"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for all processes (Ctrl+C will interrupt)
trap "echo 'Stopping...'; kill $API_PID $BTC_PID $ETH_PID $TRX_PID $BOT_PID 2>/dev/null; exit 0" INT TERM
wait
