# Kobbex Brand — Transaction Regression (2026-07-16)

This phase changed **only** presentation strings, brand constant, metadata, and
wallet dApp display metadata. No transaction/logic files were altered.

## Proof

- Typecheck: PASS (`tsc --noEmit`).
- Unit tests: **713 passed / 75 files** (baseline 704/74 + brand tests; no reduction).
- Commission pair audit: **PASS 126 · FAIL 0 · BLOCKED 0** (live wrapper staticCall, no broadcast). Report: `reports/commission-pair-audit-20260716.json`.

## Unchanged behavior (verified by diff scope + passing suites)

Wallet connection/reconnection, session preservation, network selection, quote
request, Safe MAX, gas reserve/fallback, ERC-20 approval gas, quote expiry,
slippage, minimum received, route eligibility, commission calculation/recipients,
transaction preparation. AppKit adapters/networks/projectId/features unchanged
(only `metadata.name`/`description` display strings edited).

No funded swap, no approval broadcast, no swap broadcast performed.
