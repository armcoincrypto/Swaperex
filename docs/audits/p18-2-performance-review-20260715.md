# P18.2 Performance Review — 20260715

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Baseline (live)
| Asset | ~Size |
|-------|------|
| index.html | 1.5 KB |
| vendor-reown-walletconnect | ~2.6 MB |
| TradeShell | ~521 KB |
| vendor-ethers | ~395 KB |
| Homepage TTFB | ~60–80 ms (local resolve) |

## Findings
- Largest cost is Reown/WalletConnect vendor chunk (known; not introduced by P18).
- No evidence of duplicate P18 polling loops or reserve recalculation storms requiring change.
- **No speculative optimizations applied** (measure-only).

## Improvements shipped
None (no measured P18 local hotspot justifying risk).
