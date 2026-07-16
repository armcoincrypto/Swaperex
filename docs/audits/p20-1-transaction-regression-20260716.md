# P20.1 Transaction Regression

Verified unchanged:
- Quote eligibility, preview CTA, Safe MAX, gas reserve, insufficient-gas blocking, quote expiry, wallet signing, route selection, slippage, fees.

Changes limited to:
- `TokenSafetyPanel.tsx`, `TradePreparationPanel.tsx`, `BalanceCard.tsx`
- Pure presentation helpers in `swapTokenSafetyModel.ts`, `swapIntelCenterModel.ts`

No edits to `useSwap`, swap stores, wallet connect, commission, or scanner services.

Tests: 694/694 PASS. Commission audit: 126/126 PASS.
