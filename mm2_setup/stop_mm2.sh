#!/bin/bash
# Stop MM2/KDF daemon

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}Stopping MM2/KDF...${NC}"

# Get RPC password if MM2.json exists
if [ -f "$SCRIPT_DIR/MM2.json" ]; then
    RPC_PASSWORD=$(grep -o '"rpc_password"[[:space:]]*:[[:space:]]*"[^"]*"' "$SCRIPT_DIR/MM2.json" | cut -d'"' -f4)

    # Try graceful shutdown first
    curl -s http://127.0.0.1:7762 -d "{\"userpass\":\"$RPC_PASSWORD\",\"method\":\"stop\"}" > /dev/null 2>&1
    sleep 2
fi

# Kill any remaining processes
pkill -f "mm2|kdf" 2>/dev/null || true

# Verify it's stopped
if pgrep -f "mm2|kdf" > /dev/null 2>&1; then
    echo -e "${RED}Warning: MM2 processes still running. Force killing...${NC}"
    pkill -9 -f "mm2|kdf" 2>/dev/null || true
fi

echo -e "${GREEN}MM2/KDF stopped${NC}"
