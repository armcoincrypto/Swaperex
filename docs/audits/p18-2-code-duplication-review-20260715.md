# P18.2 Code Duplication Review — 20260715

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Canonical modules (one source each)
| Concern | Module |
|---------|--------|
| Fallback gas reserve | `frontend/src/config/nativeGasReserve.ts` |
| Safe MAX / affordability | `frontend/src/utils/safeNativeMax.ts` |
| Quote readiness | `frontend/src/utils/quoteReadiness.ts` |
| Route presentation | `frontend/src/utils/routePresentation.ts` |
| Protocol statistics | `frontend/src/constants/protocolStatistics.ts` |
| Network fee helpers | `frontend/src/utils/networkFeeEstimate.ts` |
| Format label delegate | `frontend/src/utils/format.ts` → presentation |

## Duplication found
1. **`ROUTE_PROVIDER_LABEL` in `quoteAggregator.ts`** paralleled `getRouteDisplayName` strings (same text, two maps) — **risk of future drift**.
2. Comments containing internal word “canary” in config/aggregator (routing flags) — **not public UI**; retained intentionally.
3. No second safe-MAX calculator, no second stats registry, no conflicting fallback reserves for swap-enabled chains (1 / 56).

## Fix applied (repo only, not redeployed)
- `formatQuoteRoutePreferenceLabel` now delegates to `getRouteDisplayName`.
- Fixed-route selection reason uses `getRouteDisplayName(provider)`.
- Regression test asserts preference labels match presentation.

## Result
**One canonical public route label implementation.** Remaining “canary” hits are internal operator/config comments or observability event names, not public titles.
