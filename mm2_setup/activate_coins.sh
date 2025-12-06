#!/bin/bash

# Activate coins in MM2
RPC_URL="http://127.0.0.1:7762"
USERPASS="Testpass123#"

echo "Activating coins in MM2..."

# Function to activate UTXO coin via electrum
activate_utxo() {
    local COIN=$1
    shift
    local SERVERS=("$@")

    # Build servers JSON array
    local SERVERS_JSON="["
    for i in "${!SERVERS[@]}"; do
        if [ $i -gt 0 ]; then
            SERVERS_JSON+=","
        fi
        SERVERS_JSON+="{\"url\":\"${SERVERS[$i]}\"}"
    done
    SERVERS_JSON+="]"

    echo "Activating $COIN..."
    curl -s --url "$RPC_URL" --data "{
        \"userpass\": \"$USERPASS\",
        \"method\": \"electrum\",
        \"coin\": \"$COIN\",
        \"servers\": $SERVERS_JSON
    }" | head -c 200
    echo ""
}

# Activate DASH
activate_utxo "DASH" \
    "electrum.dash.org:50002" \
    "drk.p2pay.com:50002" \
    "electrum.masternode.io:50002"

# Activate KMD
activate_utxo "KMD" \
    "electrum1.cipig.net:10001" \
    "electrum2.cipig.net:10001" \
    "electrum3.cipig.net:10001"

# Activate BTC
activate_utxo "BTC" \
    "electrum1.cipig.net:10000" \
    "electrum2.cipig.net:10000" \
    "electrum3.cipig.net:10000"

# Activate LTC
activate_utxo "LTC" \
    "electrum-ltc.bysh.me:50002" \
    "electrum.ltc.xurious.com:50002"

# Activate DOGE
activate_utxo "DOGE" \
    "electrum1.cipig.net:10060" \
    "electrum2.cipig.net:10060"

echo ""
echo "Coin activation complete!"
echo ""
echo "Check balances with:"
echo "curl -s http://127.0.0.1:7762 --data '{\"userpass\":\"Testpass123#\",\"method\":\"my_balance\",\"coin\":\"DASH\"}'"
