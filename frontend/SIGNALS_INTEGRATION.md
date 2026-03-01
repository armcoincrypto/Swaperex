# Backend-Signals Integration

## A) Backend Routes (Verified)

**Server:** `backend-signals` (port 4001, Fastify)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Simple health: `{ status, version, uptime, signalsEnabled }` |
| `/api/v1/health` | GET | Rich health: `{ status, signalsEngine, services, version, uptime }` |
| `/api/v1/signals` | GET | Signals: `?chainId=&token=&debug=1` → `{ liquidity?, risk?, timestamp, debug? }` |
| `/api/signals` | GET | Legacy redirect (301) to `/api/v1/signals` |

## B) Frontend Alignment

- **constants.ts**: `SIGNALS_API_URL` = `VITE_SIGNALS_API_URL` \|\| `http://localhost:4001`
- **joinSignalsUrl(path)**: Safe base + path join (no double slashes)
- **signalsHealth.ts**: Uses `joinSignalsUrl('health')`, `joinSignalsUrl('api/v1/signals')`
- **systemStatusStore.ts**: Uses `joinSignalsUrl('api/v1/health')`
- **useSignals.ts**: Uses `joinSignalsUrl('api/v1/signals')`

## C) Backend-Down Behavior

- All fetches: 5–10s timeout via AbortController
- Errors never propagate; stores set offline state
- **signalsHealthStore**: `online: false`, 2 min backoff before retry
- **systemStatusStore**: `status: 'unavailable'`, 2 min backoff before retry
- **SignalsStatusBadge**: Shows "Signals offline" when `!online` (Radar, SwapIntelligence)
- Swap, Portfolio, Screener continue to work (CoinGecko, token lists)

## D) Signals Diagnostics

In footer System Status: click **"| Signals"** to expand:
- API base URL
- Last successful check time
- Last error (sanitized, max 80 chars)
- Online/Offline status

## E) How to Test

1. **Backend up**
   - Start `backend-signals` (port 4001)
   - Open app, confirm footer shows "● Stable"
   - Click "| Signals" → see API URL, Last OK, Online

2. **Backend down**
   - Stop `backend-signals`
   - Refresh app
   - Confirm: "○ Backend unavailable" in footer
   - Confirm: Swap, Portfolio, Screener still work
   - On Radar: "Signals offline" badge
   - Click "| Signals" → see Err, Offline

3. **Build**
   ```bash
   cd frontend && npm ci && npm run build
   ```
