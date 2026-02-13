# Screener v2 (Advanced)

Token Screener with Basic/Advanced mode, filters, trending scores, watchlist integration, and expandable token details.

## Architecture

```
frontend/src/
├── services/screener/
│   ├── types.ts              # Shared types & constants
│   ├── cache.ts              # Two-layer cache (memory + localStorage)
│   ├── coingeckoService.ts   # CoinGecko markets endpoint
│   ├── dexScreenerService.ts # On-demand DexScreener enrichment
│   ├── filterSort.ts         # Pure filter/sort/trending logic
│   ├── index.ts              # Barrel export
│   └── __tests__/            # Vitest tests
├── stores/screenerStore.ts   # Zustand store (mode, chain, filters, sort)
├── hooks/useScreener.ts      # Orchestrating hook
└── components/screener/
    ├── TokenScreener.tsx      # Main page (replaces v1)
    ├── ScreenerFilters.tsx    # Collapsible filter panel
    ├── ScreenerTable.tsx      # Sortable table
    ├── TokenRow.tsx           # Row with actions
    └── TokenDetailsPanel.tsx  # Expandable DexScreener + GoPlus
```

## Endpoints Used

| Source | Endpoint | When Called | Auth |
|--------|----------|-------------|------|
| CoinGecko | `GET /coins/markets?category=...` | Every 60s (auto-refresh) | None (free) |
| DexScreener | `GET /latest/dex/tokens/{addr}` | On row expand (on-demand) | None (free) |
| GoPlus | `GET /api/v1/token_security/{chain}` | On row expand (on-demand) | None (free) |

## Caching Strategy

| Data | Layer | TTL | Fallback |
|------|-------|-----|----------|
| CoinGecko markets | Memory + localStorage | 60s | Return cached on 429/error |
| DexScreener pairs | Memory + localStorage | 2 min | Return null |
| GoPlus security | Memory (via tokenSecurity.ts) | Per-call | Return null |
| Filters per chain | localStorage (Zustand persist) | Permanent | DEFAULT_FILTERS |
| Mode/sort prefs | localStorage (Zustand persist) | Permanent | basic / volume desc |

## Trending Score

Composite 0-100 score from normalised ranks:

- **Volume 24h** (40% weight) — higher volume = higher rank
- **|24h Change|** (35% weight) — absolute momentum, not direction
- **Market Cap** (25% weight) — established tokens rank higher

Formula: `score = round(volumeRank * 40 + momentumRank * 35 + mcapRank * 25)`

Tokens with score >= 70 show a "HOT" badge.

## Modes

- **Basic**: Same as v1 — top 50 tokens, simple table, no filters
- **Advanced**: 100 tokens, filters panel, trending scores, watchlist toggle, expandable details, copy address, explorer link

## Filters (Advanced)

- Search (symbol / name / contract address)
- Min 24h Volume (dropdown: Any → $100M+)
- 24h Change range (min% / max%)
- Price range (min / max)
- Hide Stablecoins toggle
- Hide Wrapped tokens toggle
- Only Safe toggle (excludes `riskLevel === 'risk'`)
- Filters persist per chain in localStorage

## Running Tests

```bash
cd frontend
npx vitest run                  # All tests
npx vitest run src/services/screener  # Screener tests only
```

## Building

```bash
cd frontend
npx tsc --noEmit   # Type check
npm run build       # Production build
```
