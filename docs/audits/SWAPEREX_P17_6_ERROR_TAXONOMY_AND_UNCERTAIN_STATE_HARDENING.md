# SWAPEREX P17.6 — ERROR TAXONOMY AND UNCERTAIN-STATE HARDENING

## Program

`P17_6_ERROR_TAXONOMY_AND_UNCERTAIN_STATE_HARDENING`

## Date

2026-07-12 (UTC)

## Repository

`/root/Swaperex`

## Production

- URL: https://dex.kobbex.com
- Artifact: `b6024e3` (unchanged)
- Starting HEAD: `751f538`
- Final HEAD: `6407636`

## Scope

One canonical normalized error model, classifier, presentation mapping, and action-safety matrix for the Swaperex transaction lifecycle. Integration across swap modal, recovery card, activity history hints, transaction details, and legacy `errors.ts` bridge. No journal status machine changes.

## Non-scope

Operator observability (P17.7), public status, deployment, push, new chains, replacement/dropped statuses, backend/indexer.

## P17.5 baseline

`P17_5_TRANSACTION_DETAILS_AND_SUPPORT_DIAGNOSTICS_PASS_WITH_WARNING` at `751f538`.

## Previous classifiers

- `frontend/src/utils/errors.ts` — fragmented `parseTransactionError`, `parseQuoteError`, `parseRpcError`, `parseSwapExecutionError`
- `SwapPreviewModal.categorizeError` — duplicate string parsing and unsafe "Try Again"
- `TransactionError.parseTransactionError` — duplicate raw-string classifier
- Bounded retained: `transactionReconciliation.classifyProviderError`, `wrapperQuoteDiagnostics.classifyWrapperQuoteFailure`, `portfolioErrorHandler.categorizeError` (non-swap)

## Canonical error model

`NormalizedSwaperexError` in `frontend/src/types/swaperexErrors.ts` with `category`, `stage`, `finality`, `broadcastKnown`, `retryability`, `recommendedAction`, `userTitle`, `userMessage`, bounded `technicalSummary`.

## Canonical classifier

`normalizeSwaperexError(error, context)` in `frontend/src/utils/swaperexErrorClassification.ts`

Precedence: receipt status → journal terminal/uncertain status → structured wallet codes → application fields → bounded message patterns → broadcast-aware unknown fallback.

## Canonical presentation

`getErrorPresentation`, `getJournalStatusPresentation`, `getPermittedErrorActions` in `frontend/src/utils/swaperexErrorPresentation.ts` with `ACTION_MATRIX` enforcing resubmit only when `finality === pre_broadcast`.

## Duplicate logic removed

- `SwapPreviewModal.categorizeError` (~115 lines)
- Inline RPC/swap parsing in `errors.ts` replaced with classifier delegation
- `TransactionError.parseTransactionError` now delegates to canonical classifier

## Integrations

| Surface | Change |
|---------|--------|
| `errors.ts` | Bridge to canonical model; re-exports |
| `useSwap.ts` | Stage/broadcast context on approval and swap errors |
| `SwapPreviewModal` | Canonical presentation; safe retry labels |
| `RecoveredTransactionCard` / `recoveredSwapTrace` | Unknown/stale/reverted copy via journal presentation |
| `ActivityPanel` | Status hints from `getJournalStatusPresentation` |
| `transactionDetailService` | Error section derives message from canonical presentation when needed |
| `transactionDetailFormatting` | `presentStatusExplanation` delegates to journal presentation |

## Journal integration

`JournalError` schema unchanged. Legacy `ErrorCategory` preserved via `toLegacyErrorCategory()`.

## Tests

- `frontend/src/utils/__tests__/swaperexErrorClassification.test.ts` — taxonomy matrix, receipt precedence, retry safety, copy safety
- Full suite: **56 files, 624/624 PASS** (was 601 at P17.5 baseline)
- Build: **PASS**

## Release certification

- Combined `p16-release-certify.sh`: **P16_RELEASE_CERTIFICATION_FAIL** (mobile WC assist step in pipeline)
- Independent `p16-mobile-walletconnect-cert.mjs` reruns: **2/2 PASS**
- Verdict: **PASS_WITH_WARNING** (environmental flakiness preserved from P16/P17 baseline)

## Production validation

- `p16-route-navigation-smoke.mjs` against https://dex.kobbex.com: **P16_ROUTE_SMOKE_PASS**
- Production artifact unchanged; no deployment

## Evidence

`reports/p17-6/20260712T213206Z/` and `reports/p17-6/error-taxonomy-and-uncertain-state.json`

## Warnings

1. Combined release pipeline mobile WalletConnect assist intermittently fails; independent reruns pass 2/2.
2. Do not deploy until full certification passes in a stable environment.

## Deferred P17.7 items

Operator status consolidation, telemetry pipelines, public status readiness.

## Final verdict

`P17_6_ERROR_TAXONOMY_AND_UNCERTAIN_STATE_HARDENING_PASS_WITH_WARNING`
