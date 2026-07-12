# SWAPEREX P17.8 — PUBLIC STATUS READINESS, DEPLOYMENT, VALIDATION, AND CLEANUP

## Program

`P17_8_PUBLIC_STATUS_READINESS_DEPLOYMENT_VALIDATION_AND_CLEANUP`

## Date

2026-07-12 / 2026-07-13 (UTC)

## Repository

`/root/Swaperex`

## Production

- URL: https://dex.kobbex.com
- Starting artifact: `b6024e3` (deployed 2026-07-11T15:20:32Z)
- Final artifact: `d4484f0` (deployed 2026-07-12T23:51:51Z)

## Git

- Starting HEAD: `95340ea`
- Final HEAD: `d4484f0`
- Remote: `origin` (`git@github.com:armcoincrypto/Swaperex.git`)

## Verdict

`P17_8_PUBLIC_STATUS_READINESS_DEPLOYMENT_VALIDATION_AND_CLEANUP_PASS_WITH_WARNING`

## P17.7 baseline

`P17_7_OPERATOR_STATUS_AND_OBSERVABILITY_CONSOLIDATION_PASS`

## Scope

Public/operator status readiness audit, bounded status freshness fixes, production deployment of P17.1–P17.7 transaction-lifecycle stack, validation, rollback rehearsal, cleanup, remote push.

## Non-scope

New status page, telemetry backend, incident tooling, P17.9 physical-wallet validation, swap/routing/contract changes.

## Public status inventory (summary)

| Surface | Audience | Source of truth | Public |
|---------|----------|-----------------|--------|
| `systemStatusStore` + `SystemStatusIndicator` | Public footer | `/signals/health` | Yes |
| `DiagnosticsPanel` | Debug | `?debug=1` gated | No |
| Admin panels | Operator | Admin API, gated | No |
| Transaction journal surfaces | User | `transactionJournalStore` + reconciliation | Yes |
| `productionMonitoring` / `swapLifecycleTelemetry` | Ingest | Client outbox (observational) | No direct UI |
| `p13-production-status.mjs` | Operator CLI | Smoke/timers | No |

## Status ownership matrix

| Concern | Owner |
|---------|-------|
| Application availability | `systemStatusStore` (`/signals/health`) |
| Transaction submission state | `transactionJournalStore` |
| On-chain receipt state | `transactionReconciliation` |
| Error meaning | P17.6 `swaperexErrorClassification` |
| Operator correlation | Canonical `flowId` |
| Support handoff | `supportDiagnosticService` |
| Session telemetry | `productionMonitoring` + `swapLifecycleTelemetry` (not chain proof) |
| Admin lifecycle | Admin API (not on-chain finality) |

## Public claim audit

**Blockers found:**

1. Footer defaulted to `stable` / “Operational” before any health evidence.
2. No stale/unknown fallback when `lastCheck` absent or aged out.

**Corrections:**

- Initial store status `degraded`; display resolves to `unknown` until first successful check.
- `resolveSystemDisplayStatus` + 5-minute stale threshold.
- Footer copy: “Application responding”, “Checking status”, “Status delayed” — not “Operational” / “All systems operational”.

## Freshness model

| Evidence | Display |
|----------|---------|
| No `lastCheck`, no failures | `unknown` → “Checking status” |
| No `lastCheck`, failures | `unavailable` |
| Fresh healthy check | `stable` → “Application responding” |
| Fresh partial check | `degraded` |
| `lastCheck` older than 5 min | `stale` → “Status delayed” |
| Fresh failure | `unavailable` |

## Transaction truth consistency

Verified via existing P17.3–P17.7 tests and surfaces — no new contradictions introduced. Journal/reconciliation precedence unchanged.

## Readiness decision

`READY_WITH_BOUNDED_FIXES` — status freshness/copy only; no new status page.

## Fixes implemented

1. `systemStatusStore.ts` — unknown/stale display semantics, safer initial state.
2. `SystemStatusIndicator.tsx` — bounded copy, `aria-live="polite"`.
3. `RadarFilterBar.tsx` — display status alignment.
4. `scripts/deploy-frontend.sh` — `VITE_GIT_COMMIT` at build time.
5. **`transactionReconciliationCoordinator.ts`** — stable reconciling snapshot (production blocker).

## Production regression and rollback

- First deploy (`c565e21`) caused React error #185 on `/swap` (infinite `useSyncExternalStore` loop from uncached `getReconcilingRecordIds()` Set).
- **Rollback executed** to `b6024e3` via backup `/var/www/swaperex-backup-20260712T233501Z`.
- Root cause fixed in `d4484f0`; redeployed successfully.

## Files added

- `frontend/src/stores/systemStatusStore.test.ts`
- `docs/audits/SWAPEREX_P17_8_PUBLIC_STATUS_READINESS_DEPLOYMENT_VALIDATION_AND_CLEANUP.md`
- `reports/p17-8/public-status-readiness-deployment-validation.json`
- `reports/p17-8/*/evidence`

## Files modified

- `frontend/src/stores/systemStatusStore.ts`
- `frontend/src/components/common/SystemStatusIndicator.tsx`
- `frontend/src/components/radar/RadarFilterBar.tsx`
- `frontend/src/services/transactionReconciliationCoordinator.ts`
- `frontend/src/services/__tests__/transactionReconciliationCoordinator.test.ts`
- `scripts/deploy-frontend.sh`

## Tests

- Frontend: **59 files, 637/637 PASS**
- Build: **PASS**
- Lint: script present; no ESLint config in repo (N/A)
- Typecheck: via `tsc` in build — **PASS**

## Release certification

- Combined `p16-release-certify.sh`: **P16_RELEASE_CERTIFICATION_FAIL** (mobile WC assist on preview server)
- Independent production WC assist: **3/3 PASS** (pre-deploy, b6024e3)
- Post-fix production WC assist: **P16_MOBILE_WC_CONNECTIVITY_ASSIST_PASS**
- Assessment: historical environmental/intermittent preview failure; not a product regression after fix

## Deployment

- Method: `sudo bash scripts/deploy-frontend.sh`
- Final artifact: `d4484f0`
- Rollback artifact: `/var/www/swaperex-backup-20260712T235151Z` (`b6024e3` tree)
- Rollback command verified during first incident

## Post-deployment validation

- Route smoke: `P16_ROUTE_SMOKE_PASS`
- Swap page: loads, Connect Wallet visible (390×844)
- WalletConnect assist: `P16_MOBILE_WC_CONNECTIVITY_ASSIST_PASS`
- `/version.txt`: `short=d4484f0`

## Security / privacy / accessibility

- No new public debug leakage.
- Support diagnostics remain user-initiated and redacted.
- Status uses text labels; `aria-live="polite"` on footer indicator.

## Warnings

1. Combined release certification intermittently fails mobile WC on preview; independent production reruns pass.
2. First deployment without reconciliation snapshot fix caused production swap crash; rolled back and hotfixed.

## Recommended next phase

`P17_9_PHYSICAL_WALLET_TRANSACTION_UX_VALIDATION`
