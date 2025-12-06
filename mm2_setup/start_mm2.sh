#!/bin/bash

# Start MM2 (KDF - Komodo DeFi Framework)
# Download KDF from: https://github.com/KomodoPlatform/komodo-defi-framework/releases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if MM2.json exists
if [ ! -f "MM2.json" ]; then
    echo "Error: MM2.json not found in $SCRIPT_DIR"
    exit 1
fi

# Check if kdf binary exists
if [ -f "./kdf" ]; then
    KDF_BIN="./kdf"
elif [ -f "./mm2" ]; then
    KDF_BIN="./mm2"
elif command -v kdf &> /dev/null; then
    KDF_BIN="kdf"
elif command -v mm2 &> /dev/null; then
    KDF_BIN="mm2"
else
    echo "Error: KDF/MM2 binary not found!"
    echo "Download from: https://github.com/KomodoPlatform/komodo-defi-framework/releases"
    echo "Place the 'kdf' binary in this directory: $SCRIPT_DIR"
    exit 1
fi

# Check if already running
if curl -s http://127.0.0.1:7762 > /dev/null 2>&1; then
    echo "MM2 is already running on port 7762"
    exit 0
fi

# Copy coins file if needed
mkdir -p ~/.kdf
if [ -f "coins.json" ] && [ ! -f ~/.kdf/coins ]; then
    cp coins.json ~/.kdf/coins
fi

echo "Starting MM2/KDF..."
$KDF_BIN &

sleep 3

if curl -s http://127.0.0.1:7762 > /dev/null 2>&1; then
    echo "MM2 started successfully on port 7762"
else
    echo "MM2 may have failed to start. Check logs."
fi
