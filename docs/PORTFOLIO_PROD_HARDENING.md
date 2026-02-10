# Portfolio v2 — Production Hardening

## Overview

Production hardening layer for the multi-chain portfolio system.
Adds per-chain health tracking, exponential backoff, partial failure resilience,
stale data display, and a debug diagnostics panel.

## Architecture

```
usePortfolio hook
  └─ fetchSingleChain(addr, chain)     ← per-chain with timeout + backoff
       ├─ isInBackoff(health)?          ← skip if in cooldown, return stale
       ├─ fetchEvmChainBalance()        ← 15s timeout
       ├─ enrichEvmChainBalance()       ← 15s timeout (price enrichment)
       ├─ recordChainSuccess()          ← reset failures, store stale data
       └─ recordChainFailure()          ← increment failures, set backoff

portfolioStore
  └─ chainHealth: Record<chain, ChainHealthState>
       ├─ status: ok | degraded | down
       ├─ failureCount, nextRetryAt
       ├─ lastSuccessAt, lastLatencyMs
       ├─ lastError (redacted in UI)
       └─ staleData: ChainBalance | null

chainHealth.ts (utils)
  ├─ Backoff: calculateNextRetry, calculateBackoffDelay, isInBackoff
  ├─ Health: getHealthStatus, isStaleDataValid, createInitialHealth
  ├─ Formatting: formatUsdStrict, formatUsdStrictPrivate, formatMsAgo
  └─ Redaction: redactAddress, redactError
```

## Behavior Rules

### Backoff Schedule

| Consecutive Failures | Base Delay | With ±20% Jitter |
|---------------------|------------|-------------------|
| 1                   | 5s         | 4s – 6s           |
| 2                   | 15s        | 12s – 18s         |
| 3                   | 45s        | 36s – 54s         |
| 4+                  | 120s (max) | 96s – 144s        |

- Backoff is **per-chain** — one chain failing doesn't block others.
- On success, failureCount resets to 0 and backoff is cleared.
- `calculateNextRetry(failureCount)` applies jitter; `calculateBackoffDelay` is deterministic (for tests).

### Health Status Transitions

```
ok ──[1 failure]──→ degraded ──[3 failures]──→ down
                         ↑                        │
                         └─[success]──────────────┘
```

- `ok`: 0 failures — green dot in UI
- `degraded`: 1-2 failures — yellow dot, "(stale)" suffix if using cached data
- `down`: 3+ failures — red dot, shows "—" if no stale data

### Stale Data TTL

- **30 minutes** (`STALE_TTL_MS = 30 * 60 * 1000`)
- On chain failure, if last success was < 30 min ago, stale data is shown with a warning.
- After 30 min, stale data expires — chain excluded from totals, shows "—".

### Partial Failure UX

When one or more chains fail:
1. **Banner**: Yellow warning box in PortfolioHeader listing affected chains.
   - With stale data: "X temporarily unavailable — showing last known data (stale)"
   - Without stale data: "X temporarily unavailable — excluding from totals"
2. **Chain chips**: Always show all 3 chains (ETH, BSC, Polygon).
   - Green dot = ok, yellow dot = degraded, red dot = down.
   - Tooltip shows latency, failure count, stale data age, redacted error.
3. **Totals**: Only include chains with valid data (live or stale within TTL).

### Formatting Rules

| Input             | Output        |
|-------------------|---------------|
| `null`/`undefined`/`NaN` | `—`   |
| `0`               | `$0.00`       |
| `0 < x < 0.01`   | `< $0.01`     |
| `42.5`            | `$42.50`      |
| `15000`           | `$15.00K`     |
| `1500000`         | `$1.50M`      |

- Always 2 decimal places.
- Privacy mode: all USD values show `****`.

### Timeouts

- Per-chain RPC fetch: **15 seconds** (`CHAIN_FETCH_TIMEOUT`)
- Per-chain price enrichment: **15 seconds**
- Auto-refresh interval: **30 seconds** (with concurrent guard)

## Failure Modes

### Single Chain RPC Failure
- Chain marked degraded, backoff timer starts.
- Stale data shown (if within 30-min TTL).
- Other chains unaffected — fetched concurrently via `Promise.all`.

### All Chains Down
- All chips turn red.
- Banner shows all chains unavailable.
- If any stale data exists, it's shown with warnings.
- Portfolio total reflects only stale data within TTL.

### Price Enrichment Failure
- Raw balances displayed (without USD values).
- Pricing diagnostics show error in debug panel.
- Chain itself is still marked as successful.

### Timeout
- 15s per-chain timeout via `Promise.race`.
- Timeout counts as a failure — triggers backoff.
- Stale data used as fallback.

## Debug Mode

### How to Enable

Add `?debug=1` to the URL:
```
http://localhost:3000/?debug=1
```

### What It Shows

The **Diagnostics Panel** (collapsible, bottom of portfolio page) displays:

**Global Section:**
- Wallet address (redacted: `0x509c…0196`)
- Privacy mode (ON/OFF)
- Loading state
- Snapshot validity + TTL remaining
- Refresh started/finished timestamps + duration

**Per-Chain Health:**
- Status (OK/DEGRADED/DOWN) with color coding
- Last latency (ms)
- Failure count
- Next retry countdown
- Last success time
- Last error (redacted — API keys stripped)

**Pricing (CoinGecko):**
- Last fetch timestamp
- Cache age
- Tokens priced / missing
- Last pricing error

### Security

- All wallet addresses are redacted (`0x509c…0196`).
- All error messages are redacted (API keys stripped via regex).
- Error messages truncated to 120 characters.
- Debug panel only renders when `?debug=1` is present.
- No secrets, private keys, or full addresses are ever displayed.

## Testing

### Run Tests

```bash
cd frontend
npx vitest run
```

### Test Coverage (47 new tests in `chainHealth.test.ts`)

| Category              | Tests | What's Covered                           |
|-----------------------|-------|------------------------------------------|
| Backoff delay         | 4     | 5s, 15s, 45s, 120s cap                  |
| Next retry            | 2     | Future timestamp, increases with failures |
| isInBackoff           | 4     | undefined, zero, future, past            |
| Health status         | 3     | ok, degraded, down thresholds            |
| Stale data validity   | 4     | Zero, 5min, 29min, 31min                 |
| Store health actions  | 5     | Success/failure recording, reset, stale  |
| formatUsdStrict       | 9     | null, NaN, zero, small, normal, K, M     |
| formatUsdStrictPrivate| 3     | Privacy mode on/off, null                |
| redactAddress         | 3     | Normal, null, short                      |
| redactError           | 3     | API keys, long strings, null             |
| formatMsAgo           | 4     | Never, just now, seconds, minutes        |
| formatUsdPrivate      | 3     | < $0.01, zero, privacy                   |

### VPS Verification

After deploy to `207.180.212.142`:

1. Open portfolio page — confirm all 3 chain chips visible.
2. Kill one chain's RPC (or disconnect network briefly) — confirm:
   - Yellow banner appears with chain name.
   - Chip turns yellow, then red after 3 failures.
   - Stale data shown with "(stale)" suffix.
3. Restore network — confirm chip turns green, banner disappears.
4. Open `?debug=1` — confirm diagnostics panel renders.
5. Toggle privacy mode — confirm all `****` in header, chips, tooltips.

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/utils/chainHealth.ts` | **NEW** — Backoff, health, formatting, redaction utilities |
| `frontend/src/stores/portfolioStore.ts` | Extended with chainHealth, pricing status, refresh timing |
| `frontend/src/hooks/usePortfolio.ts` | Per-chain fetch with backoff, timeout, health recording |
| `frontend/src/components/portfolio/PortfolioHeader.tsx` | Partial failure banner, health-aware chips |
| `frontend/src/components/portfolio/DiagnosticsPanel.tsx` | **NEW** — Debug diagnostics panel |
| `frontend/src/components/portfolio/PortfolioPage.tsx` | Wired DiagnosticsPanel with debug gate |
| `frontend/src/utils/__tests__/chainHealth.test.ts` | **NEW** — 47 regression tests |
