# P20.1 Production Truth

## Starting production
- URL: https://dex.kobbex.com
- Artifact: `2d2ad08297a77f07a36fccb813570a5c4da6b942` (`2d2ad08`)
- Release: `swaperex-p20-prod-20260715T151612Z-2d2ad08`

## Repository (pre-P20.1 product commit)
- Branch: `release/swaperex-p20-1-compact-intelligence`
- HEAD (docs baseline): `d37cc12`
- Tests baseline: 68 files / 684 tests / 126/126 commission audit

## Canonical ownership map
| Surface | Source | Notes |
|---------|--------|-------|
| Token Safety | `TokenSafetyPanel.tsx` + `swapTokenSafetyModel.ts` | Single fetch via `fetchSwapTokenSafetySignals` |
| Trade Preparation | `TradePreparationPanel.tsx` + `swapIntelCenterModel.ts` | `buildTradePreparationItems` + `getTradePreparationSummary` |
| Your Tokens | `TokenList.tsx` + `BalanceCard.tsx` | `useBalances(false)` shared store; `formatBalance` |

## Scope
Presentation-only compact summaries for Token Safety, Trade Preparation, and token row hierarchy. No transaction, scanner, wallet, or commission logic changes.
