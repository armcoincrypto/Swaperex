# SWAPEREX P14.10 — Performance and Web Quality Audit

**Program:** P14 | **Date:** 2026-07-10

---

## Verdict

**P14_10_PERFORMANCE_ACCEPTABLE_WITH_GAPS**

---

## Build output (2026-07-10, HEAD build)

| Asset | Size (min) | gzip |
|-------|------------|------|
| vendor-reown-walletconnect | 2,597 KB | 685 KB |
| TradeShell | 418 KB | 115 KB |
| vendor-ethers | 395 KB | 146 KB |
| index (main) | 330 KB | 119 KB |
| RadarPanel | 141 KB | 38 KB |
| PortfolioPage | 102 KB | 28 KB |

Vite warns chunks >500 KB — **Reown chunk dominates**.

---

## Lazy loading (CONFIRMED — good)

- `TradeShell` lazy from App
- Wallet bootstrap/connect lazy
- Send, Portfolio, Radar, Screener lazy
- SwapInterface **static** inside TradeShell (intentional for LCP)
- Below-fold SEO deferred via IntersectionObserver

---

## Production latency (smoke evidence)

| Route | Median latency |
|-------|----------------|
| ETH→USDT quote | ~106ms |
| WETH→USDT | ~48ms |
| UI quote widget | ~8ms |
| HTTP `/` | ~30ms |

**CONFIRMED competitive** for quote path.

---

## Gaps

| Issue | Impact |
|-------|--------|
| 2.6MB WC vendor chunk | Slow first wallet open on mobile | **HIGH** |
| No public Core Web Vitals baseline in P14 | Unknown FCP/LCP/CLS | MEDIUM |
| Solana bundle 182KB loaded on demand | LOW |
| Repeated quote calls on rapid input | Debounced in useSwap — OK |

---

## Hydration / blocking

- SPA — no SSR
- `index.html` minimal — good first paint shell
- Font preload investigated in P12.3

---

## Recommendations

1. **P19** — RUM / Lighthouse CI on production
2. **P19** — Further WC chunk deferral (already lazy — limited upside)
3. Keep swap path static import (do not lazy SwapInterface)

---

## Not optimized during P14

Per audit rules — findings only.
