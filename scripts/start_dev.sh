#!/bin/bash
# Start development server (bot + API)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "Please edit .env with your configuration."
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
echo "Installing dependencies..."
pip install -e ".[dev]" --quiet

# Run migrations
echo "Running migrations..."
python scripts/migrate.py

# Start the application
echo "Starting Swaperex..."
echo "API will be available at http://localhost:8000"
echo "Press Ctrl+C to stop"
echo ""

python -m swaperex.main
