# Send v2 — Professional Transfer Flow

## Overview

Send v2 replaces the minimal v1 Send page with a professional transfer flow featuring gas estimation, address validation, ENS resolution, contact book, and execution tracking. All transactions are built and signed client-side — no backend required.

## Architecture

```
SendPage.tsx         ← Main orchestrator (form state, execution)
├── AssetPicker.tsx  ← Token selection with search, balance, chain badges
├── AddressInput.tsx ← Destination with ENS, contacts, contract detection
└── FeePreview.tsx   ← Gas estimation, total cost, advanced gas options

sendStore.ts         ← Zustand (persisted): contacts, recent addresses, gas mode
sendService.ts       ← Gas estimation, max calculation, gas affordability check
address.ts           ← Checksum validation, ENS resolution, contract detection
txBuilder.ts         ← Native + ERC-20 transfer transaction building
```

## Fee Estimation

Gas estimation is triggered 400ms after the user stops typing (debounced). It uses the connected wallet's provider:

1. **Build transaction** — Native (`{to, value}`) or ERC-20 (`transfer(to, amount)` calldata)
2. **estimateGas()** — Provider estimates gas for the specific tx
3. **getFeeData()** — Gets current fee data (EIP-1559 or legacy)
4. **Apply gas mode multiplier** — Low (0.8x), Auto (1x), Market (1x), Fast (1.3x)
5. **Add gas limit buffer** — 15% extra on gas limit for safety

If estimation fails, the last good estimate stays visible. The send button is disabled only if we cannot confirm the user can pay gas.

### EIP-1559 vs Legacy

- **Ethereum, Polygon, Arbitrum**: EIP-1559 (`maxFeePerGas` + `maxPriorityFeePerGas`)
- **BSC**: Legacy (`gasPrice`)
- Detection is automatic via `getFeeData()` response

## Max Calculation

For native tokens (ETH/BNB/MATIC), Max = `balance - (estimatedFee * 1.15)`:
- Estimated fee already includes 15% gas limit buffer
- Additional 15% on fee total provides safety margin against gas price spikes

For ERC-20 tokens, Max = full token balance (gas is paid in native token).

## localStorage Persistence

| Key | Contents | Why |
|-----|----------|-----|
| `swaperex-send` | contacts, recentAddresses, gasMode | Contacts persist for convenience; gas mode remembers preference |

Sensitive data (amounts, addresses in-progress) is NOT persisted — only stored in React state.

## Contract Address Detection

When a valid address is entered, `provider.getCode(address)` is called. If code exists (length > 2), a yellow warning appears: "This is a contract address. Only send if you know it accepts transfers."

## ENS Resolution

On Ethereum (chainId=1) only, addresses ending in `.eth` are resolved via `provider.resolveName()`. Resolution is debounced 500ms. The resolved address is shown in green below the input.

## Activity Integration

Successful transfers are recorded in `swapHistoryStore` as records with `provider: 'transfer'`. These appear in the Portfolio Activity panel alongside swap history and blockchain explorer data.

## Testing

```bash
# Run Send v2 tests only
npx vitest run src/services/send

# Run all tests
npx vitest run

# Type check
npx tsc --noEmit

# Build
npm run build
```

### Test Coverage

- **txBuilder.test.ts** (11 tests): Amount parsing, decimal handling, native/ERC-20 tx building
- **address.test.ts** (9 tests): Checksum validation, ENS detection, edge cases
- **sendService.test.ts** (7 tests): Max calculation, gas affordability, fee buffers
- **sendStore.test.ts** (9 tests): Contacts CRUD, recent addresses, dedup, gas mode
