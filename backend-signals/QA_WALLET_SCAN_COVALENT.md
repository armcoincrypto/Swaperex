# Wallet Scan QA - Covalent Provider

## Overview

The wallet scan now uses Covalent as the primary provider for token discovery and USD valuation.
Falls back to explorer APIs (BscScan, Etherscan, etc.) if Covalent is not configured or fails.

## Environment Variables

```bash
# Required for Covalent (primary provider)
COVALENT_API_KEY=your_covalent_api_key

# Optional overrides
WALLET_SCAN_PROVIDER=covalent|explorer  # Force specific provider (default: auto)
WALLET_SCAN_CACHE_TTL_SEC=300           # Cache TTL in seconds (default: 300)
```

## Test Commands

### 1. Backend Health Check
```bash
curl -s "http://127.0.0.1:4001/health" | jq
```

Expected: `{"status":"ok"}`

### 2. Wallet Scan - Happy Path (use wallet with tokens)
```bash
# Use a full 42-character address - example with known tokens
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=56&minUsd=0.01" | jq '.provider,.stats,.warnings,.cached, (.tokens|length)'
```

Expected output:
- `provider`: "covalent" (or "explorer" if Covalent not configured)
- `stats`: Object with scan statistics
- `warnings`: Array (may contain info about spam filtered, prices missing)
- `cached`: false (first request) or true (subsequent)
- Token count: Number of tokens found

### 3. Caching Test
```bash
# Run twice - second should show cached=true
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=56&minUsd=0.01" | jq '{cached, cacheAge, provider}'
```

Expected: `cached: true` on second request with `cacheAge` showing seconds since first scan.

### 4. Provider Not Configured Test
```bash
# Temporarily unset COVALENT_API_KEY and restart backend
# Should fall back to explorer or show warning
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=56&minUsd=0.01" | jq '{provider, warnings}'
```

Expected:
- Without COVALENT_API_KEY: `provider: "explorer"` or warnings containing "provider_not_configured"

### 5. Metrics Test
```bash
# Check metrics summary
curl -s "http://127.0.0.1:4001/api/v1/metrics/summary?hours=1" | jq '.events,.scanMetrics'

# Check raw event log
tail -20 /root/Swaperex/backend-signals/data/events.jsonl
```

Expected:
- Events should include `wallet_scan_started`, `wallet_scan_completed`
- After adding tokens: `wallet_scan_add_selected`

### 6. Multiple Chain Test
```bash
# Ethereum
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=1&minUsd=0.01" | jq '{chainName, provider, tokensFound: (.tokens|length)}'

# Arbitrum
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=42161&minUsd=0.01" | jq '{chainName, provider, tokensFound: (.tokens|length)}'

# Base
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=8453&minUsd=0.01" | jq '{chainName, provider, tokensFound: (.tokens|length)}'
```

## Backend Logs

Check structured logs for scan operations:
```bash
pm2 logs backend-signals --lines 40 | grep WalletScan
```

Expected log format:
```
[WalletScan] COMPLETE chain=56 wallet=0x509c...c196 provider=covalent raw=NN spam=NN belowMin=NN final=NN priced=NN missingPrice=NN ms=NNN
```

## Frontend QA Checklist

1. **Connect Wallet** - Connect MetaMask or WalletConnect
2. **Scan Wallet** - Click "Scan Wallet" button
3. **Skeleton Loading** - Should show animated skeleton during scan
4. **Results Display** - Should show found tokens with USD values
5. **Provider Info** - Stats bar shows "via covalent" or "via explorer"
6. **Details Panel** - Click "Details" to expand scan statistics
7. **Provider Error UI** - If provider fails, shows yellow warning banner
8. **Empty State** - If no tokens, shows smart action buttons

## Deploy Commands

```bash
cd /root/Swaperex

# Build
cd backend-signals && npm run build
cd ../frontend && npm run build

# Restart
pm2 restart ecosystem.config.cjs --update-env
# OR
pm2 restart backend-signals frontend --update-env

# Verify
pm2 list
pm2 logs backend-signals --lines 40
```

## Troubleshooting

### "provider_not_configured" warning
- Ensure `COVALENT_API_KEY` is set in environment
- Restart backend after setting: `pm2 restart backend-signals --update-env`

### "provider_denied" warning
- Check Covalent API key is valid
- Check rate limits on Covalent dashboard

### "0 tokens found" with valid wallet
- Check wallet actually has tokens on the selected chain
- Try lowering minUsd filter to 0.01
- Check backend logs for errors

### Falling back to explorer
- If Covalent fails, backend falls back to explorer APIs
- Check logs for `Covalent failed (...), falling back to explorer`
