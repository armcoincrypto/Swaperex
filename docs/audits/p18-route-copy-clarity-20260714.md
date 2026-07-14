# P18 Route Copy Clarity

## Canonical presentation
`frontend/src/utils/routePresentation.ts`:
- `getRouteDisplayName` / `getRouteShortName` / `getRouteSupportIdentifier`

## Public examples
- PancakeSwap V3 via Swaperex Wrapper V2 (no canary)
- Aggregator labels and ProviderBadge/RouteTooltip use the same helpers

## Removed public canary
- `quoteAggregator` ROUTE_PROVIDER_LABEL
- SwapInterface ProviderBadge "wrap V2" shorthand
- Homepage / trust strip audited → certified language

## Tests
`routePresentation.test.ts` — PASS
