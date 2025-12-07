#!/bin/bash

# Fix MM2 RPC to allow external connections on VPS
# Run this on your VPS: bash <(curl -s https://raw.githubusercontent.com/.../fix_vps_rpc.sh)

MM2_DIR="/root/mm2_setup"
MM2_CONFIG="$MM2_DIR/MM2.json"

echo "=== MM2 VPS RPC Fix ==="
echo ""

# Check if MM2.json exists
if [ ! -f "$MM2_CONFIG" ]; then
    echo "Error: $MM2_CONFIG not found"
    exit 1
fi

# Stop MM2 if running
echo "Stopping MM2..."
pkill -f kdf 2>/dev/null
sleep 2

# Backup current config
cp "$MM2_CONFIG" "$MM2_CONFIG.backup"
echo "Backed up to $MM2_CONFIG.backup"

# Read current passphrase
PASSPHRASE=$(grep -o '"passphrase"[[:space:]]*:[[:space:]]*"[^"]*"' "$MM2_CONFIG" | cut -d'"' -f4)
RPC_PASSWORD=$(grep -o '"rpc_password"[[:space:]]*:[[:space:]]*"[^"]*"' "$MM2_CONFIG" | cut -d'"' -f4)

if [ -z "$PASSPHRASE" ]; then
    echo "Error: Could not read passphrase from config"
    exit 1
fi

# Create new config with external RPC enabled
cat > "$MM2_CONFIG" << EOF
{
    "gui": "swaperex",
    "netid": 8762,
    "rpc_password": "$RPC_PASSWORD",
    "passphrase": "$PASSPHRASE",
    "rpcip": "0.0.0.0",
    "rpcport": 7762,
    "rpc_local_only": false,
    "allow_weak_password": true,
    "i_am_seed": true,
    "skip_startup_checks": true,
    "seednodes": [
        "seeds.komodo.earth",
        "94.130.224.11:42845",
        "149.28.224.212:42845"
    ]
}
EOF

echo "Updated $MM2_CONFIG with external RPC enabled"
echo ""

# Restart MM2
echo "Starting MM2..."
cd "$MM2_DIR"
nohup ./kdf > mm2_output.log 2>&1 &
sleep 3

# Check if running
if pgrep -f kdf > /dev/null; then
    echo "MM2 started successfully!"
    echo ""
    echo "Test locally:"
    echo "  curl -s http://127.0.0.1:7762 --data '{\"userpass\":\"$RPC_PASSWORD\",\"method\":\"version\"}'"
    echo ""
    echo "Test remotely:"
    echo "  curl -s http://$(hostname -I | awk '{print $1}'):7762 --data '{\"userpass\":\"$RPC_PASSWORD\",\"method\":\"version\"}'"
else
    echo "Error: MM2 failed to start. Check mm2_output.log"
    cat mm2_output.log
fi
