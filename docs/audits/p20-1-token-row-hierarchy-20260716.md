# P20.1 Token Row Hierarchy

## Component
`BalanceCard.tsx` — presentation only.

## Hierarchy
- Primary: token symbol
- Secondary: full name when distinct; native assets use chain name from `CHAINS`
- Balance: right-aligned tabular numerals + secondary unit label

## Formatter
Reuses `formatBalance` from `@/utils/format` — no new formatter.

## Duplicate ticker
Secondary hidden when name equals symbol (except native → chain name).
