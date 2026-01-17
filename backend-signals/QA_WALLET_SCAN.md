# Wallet Scan QA - Multi-Provider

## Overview

Wallet scan uses multiple providers with automatic fallback:
1. **1inch** (primary) - Free, no API key required
2. **Covalent** (fallback) - Requires API key
3. **Explorer** (final fallback) - BscScan, Etherscan, etc.

## No Configuration Required!

1inch works out of the box - no API keys needed.

## Optional Environment Variables

```bash
# Optional: Covalent API key for fallback
COVALENT_API_KEY=your_key_here

# Force specific provider (default: auto)
WALLET_SCAN_PROVIDER=1inch|covalent|explorer

# Cache TTL (default: 300 seconds)
WALLET_SCAN_CACHE_TTL_SEC=300
```

## Test Commands

### 1. Backend Health
```bash
curl -s "http://127.0.0.1:4001/health" | jq
```

### 2. Wallet Scan (should use 1inch by default)
```bash
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=56&minUsd=0.01" | jq '{provider, tokensFound: (.tokens|length), warnings}'
```

Expected: `provider: "1inch"`

### 3. Caching Test
```bash
# Second call should show cached=true
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=56&minUsd=0.01" | jq '{cached, cacheAge, provider}'
```

### 4. Multi-Chain Test
```bash
# Ethereum
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=1&minUsd=0.01" | jq '{chainName, provider}'

# BSC
curl -s "http://127.0.0.1:4001/api/v1/wallet/tokens?address=0x509c5b1459a1e0d0d81729fe2f1e90ea82a5c196&chainId=56&minUsd=0.01" | jq '{chainName, provider}'
```

### 5. Metrics
```bash
curl -s "http://127.0.0.1:4001/api/v1/metrics/summary?hours=1" | jq '.scanMetrics'
tail -10 /root/Swaperex/backend-signals/data/events.jsonl
```

## Deploy

```bash
cd /root/Swaperex
cd backend-signals && npm run build
cd ../frontend && npm run build
pm2 restart backend-signals frontend --update-env
pm2 logs backend-signals --lines 20
```

## Provider Chain Support

| Chain | 1inch | Covalent | Explorer |
|-------|-------|----------|----------|
| Ethereum (1) | ✓ | ✓ | ✓ |
| BSC (56) | ✓ | ✓ | ✓ |
| Polygon (137) | ✓ | ✓ | ✓ |
| Arbitrum (42161) | ✓ | ✓ | ✓ |
| Base (8453) | ✓ | ✓ | ✓ |
