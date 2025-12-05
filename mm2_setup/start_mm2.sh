#!/bin/bash
# MM2/KDF Startup Script for Swaperex
# This script starts the MM2 atomic swap daemon

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MM2_DIR="$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Swaperex MM2/KDF Startup ===${NC}"

# Check if MM2.json exists
if [ ! -f "$MM2_DIR/MM2.json" ]; then
    echo -e "${RED}Error: MM2.json not found!${NC}"
    echo "Please copy MM2_template.json to MM2.json and fill in your details:"
    echo "  cp MM2_template.json MM2.json"
    echo "  # Edit MM2.json with your seed phrase and rpc_password"
    exit 1
fi

# Check if mm2 binary exists
MM2_BIN=""
if [ -f "$MM2_DIR/mm2" ]; then
    MM2_BIN="$MM2_DIR/mm2"
elif [ -f "$MM2_DIR/kdf" ]; then
    MM2_BIN="$MM2_DIR/kdf"
elif command -v mm2 &> /dev/null; then
    MM2_BIN="mm2"
elif command -v kdf &> /dev/null; then
    MM2_BIN="kdf"
else
    echo -e "${RED}Error: MM2/KDF binary not found!${NC}"
    echo ""
    echo "Please download the latest release from:"
    echo "  https://github.com/KomodoPlatform/komodo-defi-framework/releases"
    echo ""
    echo "For macOS (Apple Silicon):"
    echo "  Download: kdf-*-Darwin-Release.zip"
    echo ""
    echo "For macOS (Intel):"
    echo "  Download: kdf-*-Darwin-Release.zip"
    echo ""
    echo "For Linux:"
    echo "  Download: kdf-*-Linux-Release.zip"
    echo ""
    echo "Extract and place 'mm2' or 'kdf' binary in this directory ($MM2_DIR)"
    exit 1
fi

# Create DB directory if it doesn't exist
mkdir -p "$MM2_DIR/DB"

# Check if MM2 is already running
if pgrep -f "mm2|kdf" > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: MM2/KDF appears to be already running${NC}"
    echo "To stop it: pkill -f 'mm2|kdf'"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

echo -e "${GREEN}Starting MM2/KDF...${NC}"
cd "$MM2_DIR"

# Start MM2 in background
nohup "$MM2_BIN" > mm2_output.log 2>&1 &
MM2_PID=$!

echo "MM2 started with PID: $MM2_PID"
echo "Waiting for MM2 to initialize..."

# Wait for MM2 to start
sleep 3

# Check if MM2 is running
if ps -p $MM2_PID > /dev/null 2>&1; then
    echo -e "${GREEN}MM2 is running!${NC}"

    # Test the connection
    RPC_PASSWORD=$(grep -o '"rpc_password"[[:space:]]*:[[:space:]]*"[^"]*"' MM2.json | cut -d'"' -f4)

    echo "Testing RPC connection..."
    RESPONSE=$(curl -s --max-time 5 http://127.0.0.1:7762 -d "{\"userpass\":\"$RPC_PASSWORD\",\"method\":\"version\"}" 2>/dev/null || echo "failed")

    if [[ "$RESPONSE" == *"result"* ]]; then
        echo -e "${GREEN}MM2 RPC is responding!${NC}"
        echo "Response: $RESPONSE"
    else
        echo -e "${YELLOW}MM2 RPC not responding yet. Check mm2.log for details.${NC}"
    fi

    echo ""
    echo -e "${GREEN}MM2 Setup Complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Update your .env file with:"
    echo "   MM2_RPC_URL=http://127.0.0.1:7762"
    echo "   MM2_USERPASS=<your_rpc_password>"
    echo ""
    echo "2. Activate coins using: ./activate_coins.sh"
    echo ""
    echo "3. Start your Swaperex bot"
    echo ""
    echo "Logs: $MM2_DIR/mm2.log"
    echo "Output: $MM2_DIR/mm2_output.log"
else
    echo -e "${RED}MM2 failed to start!${NC}"
    echo "Check mm2_output.log for errors:"
    cat "$MM2_DIR/mm2_output.log"
    exit 1
fi
