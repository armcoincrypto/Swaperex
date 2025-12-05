# MM2/KDF Standalone Setup for Swaperex

This guide walks you through setting up a standalone MM2 (Komodo DeFi Framework) daemon for trustless atomic swaps.

## Prerequisites

- macOS or Linux
- A BIP39 seed phrase (12 or 24 words)
- curl installed

## Quick Start

### Step 1: Download MM2/KDF Binary

Download the latest release from:
https://github.com/KomodoPlatform/komodo-defi-framework/releases

**For macOS (Apple Silicon M1/M2/M3):**
```bash
# Download the Darwin release
curl -L -o kdf.zip "https://github.com/KomodoPlatform/komodo-defi-framework/releases/latest/download/kdf-latest-Darwin-Release.zip"
unzip kdf.zip
mv mm2 ./mm2_setup/
chmod +x ./mm2_setup/mm2
```

**For macOS (Intel):**
```bash
curl -L -o kdf.zip "https://github.com/KomodoPlatform/komodo-defi-framework/releases/latest/download/kdf-latest-Darwin-Release.zip"
unzip kdf.zip
mv mm2 ./mm2_setup/
chmod +x ./mm2_setup/mm2
```

**For Linux:**
```bash
curl -L -o kdf.zip "https://github.com/KomodoPlatform/komodo-defi-framework/releases/latest/download/kdf-latest-Linux-Release.zip"
unzip kdf.zip
mv mm2 ./mm2_setup/
chmod +x ./mm2_setup/mm2
```

### Step 2: Configure MM2

Copy the template and edit with your details:

```bash
cd mm2_setup
cp MM2_template.json MM2.json
```

Edit `MM2.json` and fill in:

```json
{
    "gui": "Swaperex",
    "netid": 8762,
    "rpc_password": "your_secure_password_here",
    "passphrase": "your twelve word seed phrase goes here in order",
    "rpc_local_only": true,
    "rpcport": 7762,
    "i_am_seed": false,
    "allow_weak_password": false,
    "dbdir": "./DB",
    "log": "./mm2.log",
    "metrics": 0
}
```

**IMPORTANT:**
- Use a strong `rpc_password` (at least 12 characters)
- Your `passphrase` is your BIP39 seed phrase - keep it secure!
- Never share your MM2.json file

### Step 3: Start MM2

```bash
chmod +x start_mm2.sh activate_coins.sh stop_mm2.sh
./start_mm2.sh
```

### Step 4: Activate Coins

After MM2 is running:

```bash
./activate_coins.sh
```

### Step 5: Configure Swaperex

Update your `.env` file:

```env
MM2_RPC_URL=http://127.0.0.1:7762
MM2_USERPASS=your_rpc_password_here
DRY_RUN=false
```

### Step 6: Start Swaperex Bot

```bash
cd ..
python -m swaperex.bot
```

## Managing MM2

### Check Status
```bash
curl http://127.0.0.1:7762 -d '{"userpass":"YOUR_PASSWORD","method":"version"}'
```

### Check Balance
```bash
curl http://127.0.0.1:7762 -d '{"userpass":"YOUR_PASSWORD","method":"my_balance","coin":"DASH"}'
```

### View Orderbook
```bash
curl http://127.0.0.1:7762 -d '{"userpass":"YOUR_PASSWORD","method":"orderbook","base":"DASH","rel":"KMD"}'
```

### Stop MM2
```bash
./stop_mm2.sh
```

## Troubleshooting

### MM2 won't start
- Check mm2_output.log and mm2.log for errors
- Ensure MM2.json is valid JSON
- Verify your seed phrase is correct

### Cannot connect to MM2
- Make sure MM2 is running: `pgrep -f mm2`
- Check the port is correct (7762)
- Verify rpc_password matches between MM2.json and your .env

### Coins won't activate
- MM2 must be running first
- Check electrum servers are reachable
- Look at mm2.log for detailed errors

### No orders in orderbook
- AtomicDEX is P2P - you need counterparties
- Check https://atomicdex.io for active markets
- Some pairs have low liquidity

## Supported Coins

The setup includes these coins:
- **UTXO**: BTC, LTC, DASH, DOGE, KMD
- **ETH/ERC20**: ETH, USDT-ERC20, USDC-ERC20
- **BEP20**: BNB, USDT-BEP20
- **Polygon**: MATIC

## Security Notes

1. **Never share your seed phrase** - it controls all your funds
2. **Keep MM2.json secure** - it contains your seed phrase
3. **Use a strong rpc_password** - it's your API authentication
4. **Run locally only** - don't expose MM2 to the internet

## Resources

- [Komodo DeFi Framework Docs](https://developers.komodoplatform.com/basic-docs/atomicdex-api-legacy/)
- [AtomicDEX Web](https://atomicdex.io/)
- [KomodoPlatform GitHub](https://github.com/KomodoPlatform/komodo-defi-framework)
