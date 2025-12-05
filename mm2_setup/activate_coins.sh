#!/bin/bash
# Coin Activation Script for MM2/KDF
# Activates the coins needed for trading

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get RPC password from MM2.json
if [ ! -f "$SCRIPT_DIR/MM2.json" ]; then
    echo -e "${RED}Error: MM2.json not found!${NC}"
    exit 1
fi

RPC_PASSWORD=$(grep -o '"rpc_password"[[:space:]]*:[[:space:]]*"[^"]*"' "$SCRIPT_DIR/MM2.json" | cut -d'"' -f4)
RPC_URL="http://127.0.0.1:7762"

echo -e "${GREEN}=== MM2 Coin Activation ===${NC}"
echo "RPC URL: $RPC_URL"
echo ""

# Function to call MM2 RPC
mm2_call() {
    curl -s "$RPC_URL" -d "$1"
}

# Function to activate UTXO coin
activate_utxo() {
    COIN=$1
    echo -n "Activating $COIN... "

    RESULT=$(mm2_call "{
        \"userpass\": \"$RPC_PASSWORD\",
        \"method\": \"electrum\",
        \"coin\": \"$COIN\",
        \"servers\": $(get_electrum_servers "$COIN")
    }")

    if [[ "$RESULT" == *"result"* ]] && [[ "$RESULT" == *"address"* ]]; then
        ADDRESS=$(echo "$RESULT" | grep -o '"address":"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}OK${NC} - Address: $ADDRESS"
    else
        echo -e "${RED}FAILED${NC}"
        echo "  Response: $RESULT"
    fi
}

# Function to activate ETH/ERC20
activate_eth() {
    COIN=$1
    echo -n "Activating $COIN... "

    RESULT=$(mm2_call "{
        \"userpass\": \"$RPC_PASSWORD\",
        \"method\": \"enable\",
        \"coin\": \"$COIN\",
        \"urls\": [\"https://eth-mainnet.g.alchemy.com/v2/demo\", \"https://cloudflare-eth.com\"],
        \"swap_contract_address\": \"0x24ABE4c71FC658C91313b6552cd40cD808b3Ea80\",
        \"fallback_swap_contract\": \"0x8500AFc0bc5214728082163326C2FF0C73f4a871\"
    }")

    if [[ "$RESULT" == *"result"* ]] && [[ "$RESULT" == *"address"* ]]; then
        ADDRESS=$(echo "$RESULT" | grep -o '"address":"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}OK${NC} - Address: $ADDRESS"
    else
        echo -e "${RED}FAILED${NC}"
        echo "  Response: $RESULT"
    fi
}

# Get electrum servers for a coin
get_electrum_servers() {
    case $1 in
        "BTC")
            echo '[
                {"url": "electrum1.cipig.net:10000"},
                {"url": "electrum2.cipig.net:10000"},
                {"url": "electrum3.cipig.net:10000"}
            ]'
            ;;
        "LTC")
            echo '[
                {"url": "electrum1.cipig.net:10063"},
                {"url": "electrum2.cipig.net:10063"},
                {"url": "electrum3.cipig.net:10063"}
            ]'
            ;;
        "DASH")
            echo '[
                {"url": "electrum1.cipig.net:10061"},
                {"url": "electrum2.cipig.net:10061"},
                {"url": "electrum3.cipig.net:10061"}
            ]'
            ;;
        "DOGE")
            echo '[
                {"url": "electrum1.cipig.net:10060"},
                {"url": "electrum2.cipig.net:10060"},
                {"url": "electrum3.cipig.net:10060"}
            ]'
            ;;
        "KMD")
            echo '[
                {"url": "electrum1.cipig.net:10001"},
                {"url": "electrum2.cipig.net:10001"},
                {"url": "electrum3.cipig.net:10001"}
            ]'
            ;;
        *)
            echo '[]'
            ;;
    esac
}

# Check MM2 is running
echo "Checking MM2 connection..."
VERSION=$(mm2_call "{\"userpass\":\"$RPC_PASSWORD\",\"method\":\"version\"}")
if [[ "$VERSION" != *"result"* ]]; then
    echo -e "${RED}Error: Cannot connect to MM2!${NC}"
    echo "Make sure MM2 is running: ./start_mm2.sh"
    exit 1
fi
echo -e "${GREEN}Connected to MM2${NC}"
echo ""

# Activate UTXO coins
echo "=== Activating UTXO Coins ==="
activate_utxo "BTC"
activate_utxo "LTC"
activate_utxo "DASH"
activate_utxo "DOGE"
activate_utxo "KMD"

echo ""
echo "=== Activating ETH/ERC20 ==="
activate_eth "ETH"

echo ""
echo -e "${GREEN}Coin activation complete!${NC}"
echo ""
echo "To check your balances, run:"
echo '  curl http://127.0.0.1:7762 -d '\''{"userpass":"YOUR_PASSWORD","method":"my_balance","coin":"DASH"}'\'''
echo ""
echo "To see orderbook:"
echo '  curl http://127.0.0.1:7762 -d '\''{"userpass":"YOUR_PASSWORD","method":"orderbook","base":"DASH","rel":"KMD"}'\'''
