# SWAPEREX P17.5 — TRANSACTION DETAILS AND SUPPORT DIAGNOSTICS

## Program

`P17_5_TRANSACTION_DETAILS_AND_SUPPORT_DIAGNOSTICS`

## Date

2026-07-12 (UTC)

## Repository

`/root/Swaperex`

## Production

- URL: https://dex.kobbex.com
- Artifact: `b6024e3` (unchanged)
- Starting HEAD: `b58aea6`
- Final HEAD: `193c6fa`

## Scope

Shared transaction details dialog and local redacted support diagnostics for journal, explorer, and legacy transfer activity.

## Non-scope

No support backend, automatic upload, error taxonomy redesign (P17.6), operator dashboards, deployment, or push.

## P17.4 baseline

`P17_4_TRANSACTION_HISTORY_UX_CONSOLIDATION_PASS_WITH_WARNING` at `b58aea6`.

## Previous detail surfaces

- `RecoveredTransactionCard` — inline summary; View details opened SwapPreviewModal recovery view
- `ActivityPanel` rows — explorer link only
- `SwapPreviewModal` — hash copy for active swap

## Canonical detail model

`TransactionDetailModel` in `frontend/src/types/transactionDetails.ts` — derived at read time.

## Detail-builder ownership

`frontend/src/services/transactionDetailService.ts`

## Source-specific rules

- **Journal:** full Swaperex context, receipt, reconciliation, errors, flow linkage
- **Explorer:** chain-observed fields only; no invented provider/swap context
- **Legacy transfer:** device-local transfer fields with ownership limitation

## Linked-flow details

`buildFlowDetailModels()` renders approval-before-swap in dialog when flow has multiple journal records.

## Entry points

- ActivityPanel — Details button per row
- RecoveredTransactionCard — View details → shared dialog (distinct from Check status again)
- DeviceSwapActivityStrip — Details button
- Modal route: **shared dialog only** (no new detail route)

## Diagnostic schema

`SupportDiagnosticBundle` schema version 1 via `supportDiagnosticService.ts`

## Wallet masking

Masked in bundle (`0x1234...abcd`); full wallet via separate Copy wallet action in dialog

## Privacy disclosure

Shown in dialog footer; diagnostics generated locally on user copy action only

## Files added

- `frontend/src/types/transactionDetails.ts`
- `frontend/src/services/transactionDetailService.ts`
- `frontend/src/services/supportDiagnosticService.ts`
- `frontend/src/utils/transactionDetailFormatting.ts`
- `frontend/src/utils/clipboard.ts`
- `frontend/src/utils/appVersion.ts`
- `frontend/src/components/transactions/TransactionDetailsDialog.tsx`
- `frontend/src/components/transactions/TransactionDetailSection.tsx`
- `frontend/src/hooks/useTransactionDetailsDialog.tsx`
- Tests under `services/__tests__` and `components/transactions/__tests__`

## Files modified

- `frontend/src/components/portfolio/ActivityPanel.tsx`
- `frontend/src/components/swap/SwapInterface.tsx`
- `frontend/src/components/history/SwapHistory.tsx`

## Tests

- Frontend: **55 files, 601/601 PASS**
- Build: **PASS**

## Release certification

- Pipeline: `P16_RELEASE_CERTIFICATION_FAIL` (WC assist in certify pipeline)
- Independent reruns (×2): **PASS**

## Production validation

`P16_ROUTE_SMOKE_PASS` — artifact unchanged `b6024e3`

## Deferred P17.6 items

Full error taxonomy hardening and uncertain-state copy consolidation

## Warnings

Same environmental P16 mobile WalletConnect browser-assist flake in combined certification pipeline

## Final verdict

**`P17_5_TRANSACTION_DETAILS_AND_SUPPORT_DIAGNOSTICS_PASS_WITH_WARNING`**
