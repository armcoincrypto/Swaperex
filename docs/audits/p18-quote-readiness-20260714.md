# P18 Quote Readiness States

## States
`QUOTE_READY`, `QUOTE_READY_GAS_UNAVAILABLE`, `INSUFFICIENT_GAS`, `QUOTE_EXPIRED`, `ROUTE_UNAVAILABLE`, `APPROVAL_REQUIRED`, `READY_TO_SIGN` (+ loading/no-quote)

## Public copy
- Gas unavailable: "Quote ready — network fee unavailable"
- Helper: "Your wallet will show the final network fee before signing."
- Expired quote takes precedence over gas issues

## Tests
`frontend/src/utils/__tests__/quoteReadiness.test.ts` — PASS
