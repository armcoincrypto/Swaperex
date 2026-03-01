# Wallet Scan

Non-custodial token scanner for Ethereum, BSC, and Polygon. Reads public balances via RPC — no private keys, no signing, no transactions.

## Architecture

```
WalletScan.tsx (UI)
  └─ useScanStore (Zustand state machine)
       ├─ scanChain() → RPC engine with fallback
       ├─ fetchEnrichment() → backend risk data (optional)
       ├─ skipChain() / retryChain() → per-chain control
       └─ dustSettings (persisted filters)
```

### Files

| File | Purpose |
|------|---------|
| `components/radar/WalletScan.tsx` | Main UI component (~1100 lines) |
| `services/walletScan/types.ts` | All type definitions |
| `services/walletScan/rpcConfig.ts` | RPC endpoints, timeouts, explorer URLs |
| `services/walletScan/scanEngine.ts` | Balance fetching with concurrency + fallback |
| `services/walletScan/scanStore.ts` | Zustand store (state machine + persistence) |
| `services/walletScan/enrichment.ts` | Backend risk data enrichment (optional) |
| `services/walletScan/index.ts` | Public API barrel export |

## Chain Scan States

Each chain goes through:

```
pending → scanning → completed
                   → degraded (timeout after 15s) → retry / skip / switch RPC
                   → failed → retry / skip
                   → skipped (user chose)
```

**Degraded mode**: If a chain doesn't respond within `DEGRADED_AFTER_SEC` (15s), it's marked degraded with actions: Retry, Skip, Switch RPC (dropdown of fallback RPCs).

## Features

- **Portfolio summary**: total found, per-chain counts, top 3 holdings
- **Risk badges**: Low/Medium/High with "Why?" drawer showing GoPlus factors
- **Dust/spam filters**: persisted toggles, hidden count shown
- **Explorer links**: Etherscan/BscScan/PolygonScan + DexScreener per token
- **Trust banner**: read-only, no keys, no tx, verify via explorer
- **Logs**: grouped by chain, timestamps, copy button
- **Saved history**: last 5 scans persisted to localStorage

## RPC Configuration

Edit `services/walletScan/rpcConfig.ts`:

```typescript
const RPC_CONFIG: Record<ScanChainName, RpcEndpoint[]> = {
  ethereum: [
    { url: 'https://eth.llamarpc.com', name: 'LlamaRPC', timeout: 8000 },
    // add more fallback RPCs here
  ],
  // ...
};
```

Each chain has 3 fallback RPCs tried in order. Adjust `DEGRADED_AFTER_SEC` to change the degraded mode timeout.

## Signals API (Risk Enrichment)

Set the backend URL via environment variable:

```env
VITE_SIGNALS_API_URL=http://207.180.212.142:4001
```

The enrichment service calls `POST /api/v1/wallet/scan-summary` on the backend-signals server. If the backend is unavailable, the scan still works — risk badges just won't appear.

Risk data is cached in memory for 5 minutes to avoid repeated API calls.

## Running Tests

```bash
cd frontend
npm install          # ensure devDependencies are installed
npm test             # runs vitest
```

Test files are in `services/walletScan/__tests__/`:

| Test | What it covers |
|------|---------------|
| `types.test.ts` | Chain ID mappings |
| `rpcConfig.test.ts` | RPC endpoints, explorer URLs, degraded timeout |
| `formatBalance.test.ts` | Balance display formatting |
| `scanStore.test.ts` | Store state machine, skip chain, dust settings |
| `enrichment.test.ts` | Risk factor parsing, risk level computation |
| `dustFilter.test.ts` | Dust/spam classification logic |

## Building

```bash
cd frontend
npm run build        # tsc + vite build
```

Test files are excluded from `tsc` via `tsconfig.json` exclude rules.

## Security

- **Non-custodial**: Only reads public on-chain data via `eth_getBalance` and `balanceOf()` calls
- **No keys**: Never touches private keys, seed phrases, or signing
- **No transactions**: Read-only — no state-changing operations
- **Address validation**: All addresses normalized via EIP-55 checksum
- **Abort support**: All network calls use AbortController with explicit timeouts
