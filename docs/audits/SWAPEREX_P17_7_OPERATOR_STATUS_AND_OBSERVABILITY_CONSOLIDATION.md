# SWAPEREX P17.7 — OPERATOR STATUS AND OBSERVABILITY CONSOLIDATION

## Program

`P17_7_OPERATOR_STATUS_AND_OBSERVABILITY_CONSOLIDATION`

## Date

2026-07-12 (UTC)

## Repository

`/root/Swaperex`

## Production

- URL: https://dex.kobbex.com
- Artifact: `b6024e3` (unchanged)
- Starting HEAD: `b3f4478`
- Final HEAD: `ea65459`

## Verdict

`P17_7_OPERATOR_STATUS_AND_OBSERVABILITY_CONSOLIDATION_PASS`

## Scope

Correlation ownership unification, operator terminology matrix, reconciliation naming clarity, support diagnostic consistency. No new infrastructure, UI redesign, or execution changes.

## P17.6 baseline

`P17_6_ERROR_TAXONOMY_AND_UNCERTAIN_STATE_HARDENING_PASS_WITH_WARNING`

## Correlation ownership audit (before)

| System | ID field | Creator |
|--------|----------|---------|
| Journal | `flowId` | `createFlowId()` in useSwap at confirm |
| Telemetry | `swapFlowId` | `newSwapFlowId()` in SwapInterface at quote |
| Support bundle | `flowId` | From journal record |

**Gap:** Quote-phase telemetry and journal records used different identifiers.

## Correlation implementation (after)

- **Canonical field:** `flowId` (`transactionCorrelation.ts`)
- **Telemetry alias:** `swapFlowId` (same value, backward compatible)
- **Owner:** `useSwap.ensureActiveFlowId()` — created on quote fingerprint change and quote fetch; reused for journal writes and lifecycle telemetry
- **Wire format:** `emitSwapLifecycleStage` emits `{ flowId, swapFlowId, stage, ... }`
- **Admin reconstruction:** Python accepts `flowId` or `swapFlowId`

## Operator terminology matrix

See `frontend/src/utils/operatorObservabilityMapping.ts` — `OPERATOR_JOURNAL_STATUS_MATRIX` maps:

| Journal status | Telemetry stages (examples) | Admin lifecycle phases |
|----------------|----------------------------|------------------------|
| submitted | tx_broadcasted | tx_broadcast |
| pending | tx_broadcasted | tx_broadcast, wallet_prompt |
| confirmed | tx_mined, reconciliation_completed | tx_confirmed, swap_success |
| reverted | tx_mined, swap_failed | tx_confirmed, swap_failed |
| unknown | swap_failed | unknown_end_state |
| stale | — | unknown_end_state |

## Reconciliation terminology

| Term | Meaning | Owner |
|------|---------|-------|
| **Client receipt reconciliation** | On-chain receipt lookup for journal records | `transactionReconciliation.ts` |
| **Revenue / commission reconciliation** | Admin health domain from monitoring ingest | Admin System health API |

Operator-facing label updated in `OperationalHealthPanel` for the `reconciliation` domain.

## Support diagnostic fields

Added (schema v1 compatible optional fields):

- `correlationId` (same as `flowId`)
- `journalStatus`
- `reconciliationAttempts`, `reconciliationLastResult`, `reconciliationState`

P17.5 redaction and allowlist guarantees preserved.

## Observability ownership matrix

| Concern | Canonical owner |
|---------|-----------------|
| Device transaction truth | `transactionJournalStore` |
| Receipt reconciliation | `transactionReconciliationCoordinator` |
| Error semantics | P17.6 classifier (unchanged) |
| Session telemetry | `productionMonitoring` |
| Correlation ID | `transactionCorrelation` |
| Support handoff | `supportDiagnosticService` |
| Admin lifecycle view | `swap_lifecycle_reconstruction.py` |
| Environment health | `p13-production-status.mjs` |

## Files added

- `frontend/src/utils/transactionCorrelation.ts`
- `frontend/src/utils/operatorObservabilityMapping.ts`
- `frontend/src/utils/__tests__/transactionCorrelation.test.ts`
- `frontend/src/utils/__tests__/operatorObservabilityMapping.test.ts`

## Files modified

- `frontend/src/hooks/useSwap.ts`
- `frontend/src/components/swap/SwapInterface.tsx`
- `frontend/src/utils/swapLifecycleTelemetry.ts`
- `frontend/src/services/supportDiagnosticService.ts`
- `frontend/src/types/transactionDetails.ts`
- `frontend/src/components/admin/LifecycleObservabilityPanel.tsx`
- `frontend/src/components/admin/OperationalHealthPanel.tsx`
- `src/swaperex/api/swap_lifecycle_reconstruction.py`
- `tests/test_app_admin.py`

## Tests

- Frontend: **58 files, 630/630 PASS**
- Build: **PASS**
- Python: lifecycle `flowId` alias test added

## Non-scope preserved

No telemetry backend, dashboards, status pages, alerting, deployment, or P17.6 taxonomy changes.

## Evidence

`reports/p17-7/20260712T214928Z/` and `reports/p17-7/operator-status-and-observability.json`
