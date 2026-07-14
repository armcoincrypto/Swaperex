# P18 Protocol Statistics

## Canonical source
`frontend/src/constants/protocolStatistics.ts` derives:
- certifiedDirectionalRoutes from COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS
- swapEnabledNetworks = 2
- catalog pair counts from verified popular routes

## Homepage
`HOMEPAGE_PROTOCOL_STATS` uses the same module — no hardcoded 42 marketing drift

## Glossary
pair entry · directional route · chain-specific route · wrapper route · catalog route

## Tests
`protocolStatistics.test.ts` — PASS
