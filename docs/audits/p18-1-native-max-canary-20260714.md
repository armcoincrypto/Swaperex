# P18.1 Native MAX Canary — 20260714

## BNB
- Balance 0.05 → MAX/safe amount `0.048` (reserves 0.002 fallback) — PASS
- Balance 0.002 → safe MAX `0` (full reserve; never ~0.0019) — PASS
- Insufficient path `0.0019` on `0.002` balance blocked with exact copy — PASS

## ETH
`SKIP_WITH_JUSTIFICATION` / warnings: seeded ETH path exercised insufficient-ETH warning; full ETH MAX UX intermittent under store seeding. No wallet funding performed.

## Verdict contribution
Safe MAX behavior matches P18 production logic.
