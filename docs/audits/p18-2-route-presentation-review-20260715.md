# P18.2 Route Presentation Review — 20260715

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Public labels (live bundle)
- `PancakeSwap V3 via Swaperex Wrapper V2`
- `Uniswap V3 via Swaperex Wrapper V2`
- Browser body text: **no public “canary” / “Audited Routes” pill**

## Surfaces
Main quote, preview, activity/history via `swapAggregatorProviderLabel` → presentation.  
Internal IDs remain for advanced/diagnostics (`getRouteSupportIdentifier`).

## Consolidation
Aggregator preference labels now call `getRouteDisplayName` (repo); live already matched strings so **no redeploy required**.
