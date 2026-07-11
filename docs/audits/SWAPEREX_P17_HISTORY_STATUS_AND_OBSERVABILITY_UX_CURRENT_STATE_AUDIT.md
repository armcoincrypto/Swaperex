# SWAPEREX P17 — History, Status and Observability UX Current-State Audit

**Program:** P17_HISTORY_STATUS_AND_OBSERVABILITY_UX_CURRENT_STATE_AUDIT  
**Date:** 2026-07-11  
**Repository path:** `/root/Swaperex`  
**Production URL:** https://dex.kobbex.com  
**Production artifact:** `b6024e3`  
**Starting repository HEAD:** `11b4afa`  
**Final repository HEAD:** _(recorded at commit time)_  
**Rollback floor:** `eee0264`

---

## Verdict

**P17_HISTORY_STATUS_AND_OBSERVABILITY_UX_CURRENT_STATE_AUDIT_PASS**

Architecture is sufficiently proven to recommend a phased P17 built on existing browser-local persistence, receipt reconciliation hooks, explorer proxy, and operator tooling. Material gaps are documented; no blocker prevented audit completion.

---

## Scope

Read-only audit of transaction history, lifecycle/status UX, on-chain reconciliation, observability tooling, logging/privacy, and status-page feasibility.

## Non-scope

No history UI, status page, indexer, database, backend additions, product refactors, deployment, or wallet-connected production actions.

---

## Method

1. Git baseline and repository map  
2. Grep-driven discovery + implementation reads  
3. End-to-end swap lifecycle trace through `useSwap.ts`  
4. Persistence and API inventories  
5. Operator script and health-endpoint review  
6. Read-only production HTTP checks  
7. Baseline test/build validation (527/527, build PASS)

**Machine-readable inventory:** `reports/p17/current-state-inventory.json`

---

## Repository map (high level)

| Layer | Location | Role |
|-------|----------|------|
| Frontend SPA | `frontend/src/` | React/Vite, Zustand stores, ethers v6 |
| Swap orchestration | `frontend/src/hooks/useSwap.ts` | Quote → approval → broadcast → receipt |
| Lifecycle models | `frontend/src/constants/transactionLifecycle.ts`, `swapCtaStates.ts` | P16 presentational state |
| History | `frontend/src/stores/swapHistoryStore.ts`, `utils/pendingSwapStorage.ts`, `services/activityService.ts` | Browser-local + explorer merge |
| Signals/health backend | `backend-signals/` (:4001) | Health, RPC/explorer/1inch proxies |
| Python admin | `src/swaperex/api/app_admin.py` (:8001) | Monitoring ingest, admin read APIs |
| Ops scripts | `scripts/audit/`, `scripts/ops/`, `scripts/release/` | Certification, smoke, status aggregation |
| Systemd | `ops/systemd/swaperex-route-quote-smoke.timer` | Scheduled quote smoke (6h) |

**State management:** Zustand (+ `persist` middleware for history, portfolio, radar, etc.)  
**Web3:** ethers v6, Reown AppKit, WalletConnect  
**Testing:** Vitest 42 files / 527 tests; Playwright for release browser gates

---

## Executive summary — what Swaperex already has vs lacks

### Already has (reuse)

- **Browser-local swap journal** — `swaperex-swap-history` (max 100 records, Quick Repeat)  
- **In-flight pending swap persistence** — `swaperex-pending-swap-v1` (48h TTL, wallet+chain scoped)  
- **Post-refresh receipt reconciliation** — `useSwap` effects call `getTransactionReceipt` / `waitForTransaction`  
- **Wallet activity discovery (limited)** — explorer proxy for ETH/BSC/Polygon via `transactionHistory.ts`  
- **Merged activity feed** — `ActivityPanel` on `/portfolio`  
- **Canonical explorer URLs** — `getExplorerTxUrl()` in `config/chains.ts`  
- **Structured error taxonomy** — `utils/errors.ts`  
- **Signals health UX** — `SystemStatusIndicator` (footer/radar), not swap-specific  
- **Operator observability** — P13 production status, scheduled route-quote smoke, runtime warning monitor, release/post-deploy certification

### Lacks or incomplete

- **No dedicated transaction history route** — history embedded in `/portfolio` and compact swap strip  
- **Approvals not journaled** — only swap txs enter `swapHistoryStore`  
- **Recovery UI gap** — `pendingSubmittedSwap` / modal recovery props exist but not fully wired in `SwapInterface`  
- **No replacement/dropped tx handling** — ambiguous failures → `uncertain` status  
- **History not wallet-scoped** — shared-browser cross-wallet leakage risk  
- **No public `/status` page** — operator reports only  
- **Status durability** — many critical states are transient toasts  
- **No centralized execution ledger** — by design (non-custodial)

---

## Transaction history — detailed answers

| Question | Finding | Evidence |
|----------|---------|----------|
| Where are submitted txs stored? | **Browser localStorage** (swap history + pending) + **explorer proxy** (wallet txs) | `swapHistoryStore.ts`, `pendingSwapStorage.ts`, `transactionHistory.ts` |
| React memory only? | **No** — persisted layers exist | `writePendingSwap` on broadcast; Zustand persist |
| Persist layer | localStorage keys above; no IndexedDB for txs | grep + store implementations |
| Approvals stored separately? | **No** | `executeApproval` confirms via `tx.wait()` but does not `addRecord` |
| Failed/rejected retained? | **Partial** — wallet reject before broadcast: no hash; post-broadcast fail → `failed` or `uncertain` | `useSwap` catch paths, `markPendingSwapOutcomeUncertain` |
| Survives refresh? | **Pending swap yes** (if same wallet+chain); in-session `SwapStatus` resets | `pendingSwapStorage`, recovery `useEffect` |
| Survives browser restart? | **Same as refresh** (localStorage) | — |
| Reconstruct from wallet+chain? | **Partial** — explorer lists recent txs; not full indexer | `getRecentSwaps`, `fetchMergedActivity` |
| Explorer abstraction? | **Yes** — `getExplorerTxUrl` | `config/chains.ts:309` |
| Hash associated with metadata? | **Yes for swaps** — chain, tokens, amounts, provider, slippage, status, timestamp | `SwapRecord` interface |

**Important distinction:** Swaperex already has *device-local swap history* and *wallet-scoped explorer activity*, but not a unified cross-device transaction ledger.

---

## Transaction lifecycle trace (supported-chain swap)

```
1. Route load          → TradeShell / SwapInterface (URL sync via useSwapUrlSync)
2. Wallet state        → useWallet / walletStore
3. Network selection   → NetworkSelector → switchNetwork (EIP-1193)
4. Token/amount        → SwapInterface local state + validation
5. Quote request       → useSwap.fetchSwapQuote → quoteAggregator / 1inch / wrappers
6. Allowance check     → status: checking_allowance
7. Preview             → status: previewing; SwapPreviewModal step: preview
8. Approval (if needed)→ executeApproval → status: approving → tx.wait()
9. Swap confirm        → confirmSwap → executeSwap
10. Broadcast          → signer.sendTransaction → status: confirming
                       → writePendingSwap + addSwapRecord(pending)
11. Receipt (in-tab)   → tx.wait() → success/failed
12. Success UI         → SwapPreviewModal success; toast; history update
13. Reset              → status idle; pending cleared
```

### Failure paths (code-supported)

| Scenario | Behavior |
|----------|----------|
| Wallet rejects approval | `previewing`; toast "Approval cancelled" | `useSwap` ~1890 |
| Approval reverts | `parseTransactionError`; error state | catch in `executeApproval` |
| Wallet rejects swap | `previewing` if pre-broadcast | `parseSwapExecutionError` |
| Swap reverts on-chain | `failed` history; error in modal | receipt.status !== 1 |
| RPC fails during wait | `uncertain` pending flag; warning toast | ~3303 |
| Quote expires | `isQuoteExpired`; lifecycle `quote_expired` | `transactionLifecycle.ts` |
| Wrong network | CTA `switch_network`; banners | `swapCtaStates.ts` |
| Unsupported network | `UnsupportedSwapNetworkExperience`; no execution | `SwapInterface.tsx` |

### Post-refresh pending behavior

On mount, if `getPendingSwapForAccount` matches:

1. Single `getTransactionReceipt` — if mined, update history + toast + clear pending  
2. Else set UI to `confirming` with stored hash  
3. If confirming without quote, `waitForTransaction` resumes monitoring  

**Gap:** Recovery banner in `SwapPreviewModal` (`recoveredTrace`, `onClearPendingSwap`) is supported by modal but **not passed from `SwapInterface`** per code inspection.

---

## State-machine audit

### Runtime model (`SwapStatus` in `useSwap.ts`)

`idle` → `fetching_quote` → `checking_allowance` → `previewing` → `approving` | `swapping` → `confirming` → `success` | `error`

### P16 presentational model (`transactionLifecycle.ts`)

Maps runtime status to user-facing titles (12 lifecycle ids). **Not a separate persisted state machine.**

### Identified issues

| Issue | Severity |
|-------|----------|
| `approval_rejected` only when `userRejected` flag on error object | Medium |
| `unknown` lifecycle catch-all for unmapped combos | Low |
| Terminal on-chain truth not stored as first-class lifecycle id in runtime model | Medium |
| Duplicate conceptual models (SwapStatus vs TransactionLifecycleId vs SwapStep) | Informational |

---

## Client-side persistence audit

| Key / store | Data | Wallet scoped? | TTL / limit |
|-------------|------|----------------|-------------|
| `swaperex-pending-swap-v1` | In-flight swap hash + pair snapshot | Yes (fromAddress) | 48h |
| `swaperex-swap-history` | SwapRecord[] | **No** | 100 records |
| `swaperex-commission-monitor` | Confirmed commission evidence | Partial | persist middleware |
| `swaperex-recent-successful-pairs` | Pair + txHash hints | No | routePrecheck |
| `swaperex-monitoring-outbox` | Telemetry events | Session id | trimmed outbox |
| AppKit/wallet keys | WC session | Yes | vendor-managed |
| Terms, radar, portfolio, etc. | Non-tx UX state | varies | — |

**Privacy:** Local history can show another wallet's swaps on a shared browser (F04).

---

## API and backend capabilities

### Frontend-consumed endpoints (production)

| Path | Purpose | Tx history? |
|------|---------|-------------|
| `GET /api/v1/health` | Signals engine liveness | No |
| `GET /rpc/eth`, `/rpc/bsc` | Read-only JSON-RPC | Receipt lookup only |
| `GET /explorer/{eth\|bsc\|polygon}` | Etherscan-class tx lists | **Yes** (recent txs) |
| `GET /oneinch/...` | Quotes/build | No |
| `POST /api/v1/monitoring/events` | Optional telemetry | Events may include txHash |

### Backend transaction records

**No centralized swap execution database** exposed to users. Python custodial API routes exist for legacy stack but are not the non-custodial swap path.

**Conclusion:** Backend already supports **health**, **explorer proxy**, and **optional monitoring ingest** — sufficient for operator observability; **not** a user history service.

---

## On-chain reconciliation capability

| Capability | Supported? | Notes |
|------------|------------|-------|
| Receipt by hash | **Yes** | ethers provider |
| RPC fallback | **Yes** | `config/rpc.ts` candidate lists |
| Confirmation count policy | **Implicit** | `tx.wait()` default (1 conf) |
| Replacement detection | **No** | — |
| Dropped tx detection | **No** | — |
| Reorg handling | **No** | — |
| Wallet-wide discovery | **Partial** | Explorer API, rate-limited, 3 chains |
| Approval↔swap linkage | **No** | Separate txs, approval not stored |

**Chain parity:** Swap execution certified on Ethereum (1) and BNB Chain (56). Explorer activity also fetches Polygon (137) for portfolio display.

---

## Explorer linking

**Canonical:** `getExplorerTxUrl(chainId, txHash)` → `${explorerUrl}${explorerTxPath}${txHash}`

**Duplication:** `utils/format.getExplorerUrl`, `transactionHistory.getExplorerUrl`, `useTxHistory` local helper — minor duplication, all chain-keyed.

**Unknown chain:** `getExplorerTxUrl` returns `''` if chain not in config — fail-closed.

---

## User-facing status surfaces

| Surface | Location | Durable? |
|---------|----------|----------|
| Swap card + modal | `/swap` | Modal session; success/error steps |
| Toasts | global (react-hot-toast) | **Transient** |
| Lifecycle live region | SwapInterface | Session |
| Activity feed | `/portfolio` | Reload on connect |
| Device recent strip | `/swap` (`DeviceSwapActivityStrip`) | Local store |
| System status pill | footer / radar | 60s polled signals health |
| Trust/static pages | `/trust`, etc. | Static copy |

**No** `/history` or `/status` route in `appRoutes.ts`.

---

## Error taxonomy (actual)

Central parser: `frontend/src/utils/errors.ts`

Categories: `user_rejected`, `insufficient_balance`, `invalid_input`, `network_error`, `rpc_error`, `quote_error`, `transaction_error`, `wallet_error`, `wallet_sign_pending`, `contract_error`, `unknown`

**SwapPreviewModal.categorizeError()** adds UI-layer `{ type, title, suggestion, canRetry }`.

**Gaps:** Post-broadcast ambiguous state → generic warning + `uncertain`; no distinct `transaction_replaced` or `transaction_dropped` classes.

---

## Observability tooling inventory

| Tool | Checks | Schedule | Output |
|------|--------|----------|--------|
| `verify-live.sh` | SPA, assets, `/api/health`, version schema | Deploy/manual | stdout |
| `post-deploy-certification.sh` | Parity + verify-live + scans | Post-deploy | stdout |
| `p16-route-navigation-smoke.mjs` | 14 routes HTTP | Release/manual | JSON report |
| `p16-mobile-walletconnect-cert.mjs` | WC modal/viewports | Release/manual | JSON report |
| `p12-5-route-quote-regression-smoke.mjs` | Quote matrix | Manual / via P13 | JSON |
| `p13-run-route-quote-smoke.mjs` | Wrapper + retries | **systemd 6h** | `reports/p13/route-smoke/` |
| `p13-production-status.mjs` | Aggregates smoke/trends/version | Manual | HTML/JSON/MD |
| `p12-4-runtime-warning-monitor.mjs` | Browser console | Manual/release | JSON |
| `systemStatusStore` | `/api/v1/health` | In-app 60s | in-memory |

Release certification ≠ continuous monitoring. Scheduled smoke covers **quotes**, not swap execution success rate.

---

## Logging and privacy

| Channel | Content | Risk |
|---------|---------|------|
| `productionMonitoring.ts` | swap_success with txHash, amounts (optional ingest) | Medium — opt-in POST |
| `swapObsLog` / dev traces | tx hashes, provider | Dev/flag gated |
| `ActivityPanel` console.log | wallet address | Production console noise |
| RPC URLs in bundle | Public/proxy only | Low — no secret keys in Vite env per `rpc.ts` comments |

**Redaction needs:** Support diagnostics should avoid full quote payloads and session topics; txHash + chain + app version sufficient.

---

## Health endpoints (production read-only, 2026-07-11)

| Endpoint | Result |
|----------|--------|
| `GET /` | HTTP 200 |
| `GET /version.txt` | `environment=production`, `commit=b6024e3` |
| `GET /api/health` | `{"status":"ok","signalsEngine":"running",...}` |
| `GET /api/v1/health` | Same signals payload |

**Liveness:** frontend static + nginx OK  
**Readiness (partial):** signals engine up; dexscreener/goplus up  
**Not measured:** swap router on-chain health, RPC latency SLOs, WC project validity in prod UI, user swap success rate

---

## Status-page feasibility

| Candidate signal | Measurable today? |
|------------------|-------------------|
| Frontend up | Yes (verify-live, route smoke) |
| Release version | Yes (`version.txt`) |
| Signals engine | Yes (`/api/v1/health`) |
| Quote service | Partial (scheduled smoke, stale after 6h30m) |
| ETH/BSC RPC | Partial (read probes in rpc config, not continuous public metric) |
| WalletConnect | Partial (release browser cert only) |
| Swap routing | Partial (quote smoke, not execution) |
| Incident banner | No stored incident model |

**Recommendation:** **Operator-first status** via existing `p13-production-status.mjs` output. **No public status page yet** — publishing swap/RPC health without continuous probes would be misleading.

---

## History architecture options (scored)

| Option | User value | Complexity | Ops burden | Privacy | Chain truth | Cross-device | Fit |
|--------|------------|------------|------------|---------|-------------|--------------|-----|
| **A — Browser-local journal** | Medium | **Low** | Low | **High** | Via hash reconcile | No | **Excellent** (already exists) |
| **B — Hash reconciliation** | Medium | Low–Med | Low | High | **High** | No | **Excellent** (partial) |
| **C — Wallet event indexing** | High | **High** | **High** | Med | High | Possible | Poor fit now |
| **D — Centralized ledger** | High | **High** | **High** | Low | Med | Yes | **Not recommended** |

### Architecture decision

| Topic | Recommendation |
|-------|----------------|
| History source of truth | **On-chain receipt for known hashes**; local journal for context (pair, amounts, provider) |
| Persistence layer | **Extend** `pendingSwapStorage` + `swapHistoryStore` (wallet-scoped keys) |
| Reconciliation | **Formalize** existing `useSwap` recovery effects; add backoff/timeout policy |
| Transaction state model | **Unify** runtime `SwapStatus` with persisted journal status; keep P16 lifecycle as presentation |
| Cross-device | **Not now** — document limitation |
| Privacy | Wallet-scoped storage; no public hash lists |
| Status data source | Operator: P13 aggregates; User: in-app signals pill only initially |
| Public vs operator visibility | **Operator-first** |
| Indexer/DB | **Not recommended** for P17 initial delivery |

---

## Gap register (prioritized)

| ID | Severity | Area | Current behavior | Recommended phase |
|----|----------|------|------------------|-------------------|
| P17-F01 | **High** | History | Approvals not in journal | P17.2 |
| P17-F02 | **High** | Recovery UX | Pending recovery not in modal UI | P17.3 |
| P17-F03 | **Medium** | Reconciliation | No replace/drop detection | P17.3 |
| P17-F04 | **Medium** | Privacy | History not wallet-scoped | P17.2 |
| P17-F05 | **Medium** | Status UX | Toast-only critical states | P17.4 |
| P17-F06 | **Low** | Public status | No /status route | P17.7 (defer) |
| P17-F07 | **Info** | Discovery | Activity merge exists but underpromoted | P17.4 |
| P17-F08 | **Medium** | Lifecycle | Dual state models | P17.1 |
| P17-F09 | **Low** | Explorer | Minor URL helper duplication | Later cleanup |
| P17-F10 | **Medium** | Support | No copy diagnostic bundle | P17.5 |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Treating local history as chain truth | Label statuses; reconcile hashes; `uncertain` state |
| Cross-wallet localStorage leakage | Scope records by address |
| Public status overclaim | Operator-only until continuous probes |
| Telemetry PII | Hash-only support bundle; opt-in ingest |

---

## Recommended phased P17 roadmap

### P17.1 — Transaction journal and reconciliation design
**Goal:** Freeze data contracts for `PendingSwapV1`, `SwapRecord`, lifecycle mapping, wallet scoping.  
**Non-scope:** UI polish, public status.  
**Files:** `pendingSwapStorage.ts`, `swapHistoryStore.ts`, `transactionLifecycle.ts`, `useSwap.ts` (design only).

### P17.2 — Local known-transaction journal hardening
**Goal:** Wallet-scoped history; optional approval rows; migration for persist v3.  
**Tests:** store migration, wallet scope unit tests.

### P17.3 — Receipt reconciliation and pending recovery UX
**Goal:** Wire `SwapPreviewModal` recovery; backoff policy; replace/drop guidance → `uncertain`.  
**Safety:** No new production backdoors.

### P17.4 — Transaction history UX consolidation
**Goal:** Clear entry points on `/swap` and `/portfolio`; durable status cards vs toasts.  
**Reuse:** `ActivityPanel`, `DeviceSwapActivityStrip`, `SwapHistory`.

### P17.5 — Transaction details and support diagnostics
**Goal:** Copy-safe diagnostic block (version, chain, hash, provider, error class).  
**Non-scope:** Full support portal.

### P17.6 — Operator dependency-health surfacing
**Goal:** Repurpose `p13-production-status` output for operator dashboard/link; document runbook integration.

### P17.7 — Public status feasibility spike (optional)
**Goal:** Evaluate minimal static page fed by existing probes only if continuous quote smoke + health are stable.

### P17.8 — Production certification
**Goal:** Extend release gates for journal/reconciliation tests; no regression to P16 baseline.

---

## Highest-ROI improvements

1. **Wallet-scope `swapHistoryStore` and document device-only limitation** — fixes privacy/leakage with minimal infra  
2. **Wire pending recovery into SwapPreviewModal** — reuses existing storage + modal API  
3. **Journal approval txs (hash-only row)** — closes support blind spot for failed swap-after-approval flows  
4. **Durable transaction detail card post-broadcast** — reduces toast-only information loss  
5. **Operator status from P13 JSON** — reuses scheduled smoke + health; no new backend

---

## Tests and build (audit session)

| Gate | Result |
|------|--------|
| Frontend tests | 42 files, **527/527 PASS** |
| Frontend build | **PASS** |
| Production route smoke | **P16_ROUTE_SMOKE_PASS** (14/14, read-only) |

No production source changes in this phase.

---

## Production read-only validation

Routes inspected via smoke script (HTTP 200, SPA shell): `/`, `/swap`, `/send`, `/portfolio`, `/radar`, `/screener`, `/trust`, plus passive legal routes.

**Observed:** No dedicated history or status routes. `/portfolio` hosts activity when wallet connected (not exercised without wallet). System status indicator present in shell (signals health).

---

## Open questions

1. Should approval journal rows link to subsequent swap hash when both known?  
2. Is cross-device history a product requirement or support-only nice-to-have?  
3. Should public status ever include quote-smoke staleness explicitly?

## Deferred items

- Full wallet-wide indexer (Option C)  
- Centralized execution ledger (Option D)  
- Public status page  
- Physical handset transaction UX validation

---

## Commands run

```text
git status / log / diff (read-only)
grep discovery across frontend/src and scripts
curl -fsSI https://dex.kobbex.com/
curl -fsS https://dex.kobbex.com/version.txt
curl -fsS https://dex.kobbex.com/api/health
curl -fsS https://dex.kobbex.com/api/v1/health
npm --prefix frontend test -- --run
npm --prefix frontend run build
node scripts/audit/p16-route-navigation-smoke.mjs --base-url https://dex.kobbex.com
```

---

## Files inspected (representative)

`frontend/src/hooks/useSwap.ts`, `constants/transactionLifecycle.ts`, `constants/swapCtaStates.ts`, `stores/swapHistoryStore.ts`, `utils/pendingSwapStorage.ts`, `services/activityService.ts`, `services/transactionHistory.ts`, `components/portfolio/ActivityPanel.tsx`, `components/history/SwapHistory.tsx`, `components/swap/SwapPreviewModal.tsx`, `stores/systemStatusStore.ts`, `utils/errors.ts`, `utils/productionMonitoring.ts`, `config/chains.ts`, `config/rpc.ts`, `scripts/audit/verify-live.sh`, `scripts/audit/post-deploy-certification.sh`, `scripts/ops/p13-production-status.mjs`, `backend-signals/src/index.ts`

---

## Implementation readiness

**Ready for design phase** — P17.1 should finalize data contracts before UI work.  
**Not ready** for indexer/database/public status page without further ops investment.

**Recommended next phase:** `P17.1_TRANSACTION_JOURNAL_AND_RECONCILIATION_DESIGN`
