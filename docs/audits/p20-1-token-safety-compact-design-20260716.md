# P20.1 Token Safety Compact Design

## Structure
`TokenSafetyPanel` → four-line `buildTokenSafetySummaryLines` + optional critical banner + expand for full `signals` list.

## Four stable categories
1. Contract
2. Ownership
3. Supply controls
4. Liquidity scan

## States
`ok`, `warn`, `risk`, `unknown`, `loading`, `na` — never conflated.

## Critical visibility
`getTokenSafetyCriticalAlerts` + `hasTokenSafetyHighRisk` render alert banner when collapsed.

## Expansion
Button toggles full analysis; same `signals` array, no duplicate fetch.
