#!/bin/bash
# Run API server only (without bot)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found. Copying from .env.example..."
    cp .env.example .env
fi

# Create data directory
mkdir -p data

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]" --quiet

# Run migrations
python scripts/migrate.py

# Start API only
echo "Starting API server..."
echo "API available at http://localhost:8000"
echo "Docs at http://localhost:8000/docs"
echo ""

uvicorn swaperex.api.app:app --reload --host 0.0.0.0 --port 8000
