# SWAPEREX P5A — Revenue Intelligence & Operator Analytics

**Production baseline:** `e145b22` @ https://dex.kobbex.com  
**Audit date:** 2026-07-07  
**Scope:** Read-only operator intelligence layer; no swap/wrapper/commission/pair/chain/nginx changes.

---

## SWAPEREX_P5A_REVENUE_INTELLIGENCE_REPORT

### Executive Verdict

**P5A COMPLETE — READY FOR OPERATOR USE (NO AUTO-DEPLOY)**

The first operator intelligence layer is implemented using the existing monitoring ingest pipeline. A new read-only API (`GET /api/v1/admin/operator-intelligence`) aggregates persisted telemetry at request time, and a new admin UI tab (**Intelligence** at `/admin/intelligence`) surfaces executive summary, funnel, pair/chain rankings, quality metrics, alerts, and P4A before/after comparison.

**What operators can now answer from one dashboard:**

| Question | Answerable? | How |
|----------|-------------|-----|
| Which swaps make the most commission? | Yes | Top revenue pairs, commission by chain/provider, largest commission events |
| Which pairs should be featured? | Yes | Featured pair suggestions (promote/keep/demote/watch) from observed quotes, conversion, failure, commission |
| Where do users abandon? | Yes (partial) | Funnel stages + largest drop-off + preview/approve abandonment sessions |
| Which unsupported chains are users requesting? | Yes | `chain_selected` with `swapCapable: false` per chain |
| Evidence for pair/chain expansion? | Yes (with caveats) | Unsupported pair/chain counts; explicit **do not expand** when evidence is thin |
| Did revenue improve after P4A? | Yes (early) | Pre/post P4A deploy quote_success and swap_success counts (low sample until ingest accumulates) |

**Gaps that remain intentional (no new telemetry in P5A):**

- No landing or wallet-connected events — funnel starts at `pair_selected`
- No USD normalization — commission in raw token wei
- Full batch scan per request (acceptable at current volume)

---

### Telemetry Inventory

**Pipeline:**

```
Frontend (logProductionEvent / logRevenueTelemetry)
  → localStorage outbox (PERSISTED_MONITORING_EVENTS filter)
  → POST /api/v1/monitoring/events
  → monitoring_ingest_batches (JSON envelope, append-only)
  → Admin API scans batches (Python aggregation)
  → /admin/intelligence dashboard
```

| Event | Producer | Stored | Queryable | Displayed (pre-P5A) | Displayed (P5A) |
|-------|----------|--------|-----------|---------------------|-----------------|
| `swap_success` | `useSwap.ts` | Yes | Yes (Events, Swaps, Revenue, Lifecycle) | Yes | Yes + Intelligence aggregates |
| `swap_failure` | `useSwap.ts` | Yes | Yes (Failures) | Yes | Yes (Quality, Alerts) |
| `quote_failure` | `useSwap.ts` | Yes | Yes (Failures) | Yes | Yes (Quality, Alerts, funnel adjacency) |
| `quote_success` | `useSwap.ts` (P4A) | Yes | Yes (Events raw) | **No** | **Yes** (Funnel, pairs, P4A compare) |
| `pair_selected` | Featured/Popular/RouteDiscovery (P4A) | Yes | Yes (Events raw) | **No** | **Yes** (Funnel start, pair source) |
| `chain_selected` | `NetworkSelector.tsx` (P4A) | Yes | Yes (Events raw) | **No** | **Yes** (Chain intelligence) |
| `preview_opened` | `SwapInterface.tsx` (P4A) | Yes | Yes (Events raw) | **No** | **Yes** (Funnel, abandonment) |
| `approve_clicked` | `useSwap.ts` (P4A) | Yes | Yes (Events raw) | **No** | **Yes** (Funnel, abandonment) |
| `unsupported_commission_route` | `useSwap.ts` | Yes | Yes (Failures taxonomy) | Partial | Yes (Quality, pair unsupported rank) |
| `swap_lifecycle` | `SwapInterface`, `SwapPreviewModal` | Yes | Yes (Lifecycle tab) | Yes | Not duplicated in Intelligence (use Lifecycle tab) |
| `wallet_rejected` | `useSwap.ts` | Yes | Yes (Wallet tab) | Yes | Yes (Quality) |
| `wallet_request_pending` | `useSwap.ts` | Yes | Yes (Events) | Partial | Events only |
| `rpc_failure` | `useSwap.ts` | Yes | Yes (Failures) | Yes | Yes (Quality) |
| `commission_missing` | `useSwap.ts` | Yes | Yes (Revenue reconciliation) | Yes | Yes (Quality) |
| `route_precheck_visible` | `SwapInterface.tsx` | Yes | Yes (Events) | Partial | Events only |
| `wallet_autoreconnect_scan` | `connectors.ts` | Yes | Yes (Wallet reconnect) | Yes | Wallet tab |
| `legacy_wc_reconnect_attempt` | `connectors.ts` | Yes | Yes | Yes | Wallet tab |
| `legacy_wc_reconnect_success` | `connectors.ts` | Yes | Yes | Yes | Wallet tab |
| `legacy_wc_reconnect_failure` | `connectors.ts` | Yes | Yes | Yes | Wallet tab |
| `appkit_reconnect_success` | `AppKitBridge.tsx` | Yes | Yes | Yes | Wallet tab |

**Emitted but NOT persisted** (console/debug only; dropped by `isPersistedEventName`):

| Event | Producer | Notes |
|-------|----------|-------|
| `quote_retry` | `useSwap.ts` | Retry attempts invisible to operator analytics |
| `swap_execution_timing` | `swapExecutionTiming.ts` | Latency not in ingest |
| `allowance_read_failed` | `allowanceRead.ts` | Approval friction signal lost |

**Duplicate / overlap:**

- `quote_failure` and `unsupported_commission_route` often co-occur on commission pairs without wrapper path
- `swap_lifecycle` stages overlap semantically with P4A funnel events (`preview_opened`, `approve_clicked`, `swap_success`) — prefer P4A events for funnel; lifecycle for per-flow debugging

**Unused / underused:**

- `route_precheck_visible` — persisted but never ranked in admin before P5A; still not in Intelligence (low priority)
- `wallet_request_pending` — no funnel stage (could indicate slow wallets)

**Missing events (product gaps, not P5A scope):**

- `landing_page_view` / `wallet_connected` — cannot compute Landing→Wallet or Wallet→Quote
- `transaction_submitted` — funnel jumps Approve→Success; `swap_lifecycle` `tx_broadcasted` is partial substitute in Lifecycle tab only

**Never visualized before P5A:**

All five P4A revenue events: `quote_success`, `pair_selected`, `chain_selected`, `preview_opened`, `approve_clicked`.

---

### Revenue Model

Normalized operator metrics derived from existing envelopes (no schema migration).

| Metric | Source event(s) | Calculation | Confidence | Limitations |
|--------|-----------------|-------------|------------|-------------|
| Daily commission | `swap_success.feeToTreasuryWei` | Sum wei by `feeToken.symbol` for events in UTC day window | High when fee present | Missing if receipt decode fails (`commission_missing` counter) |
| Commission by chain | `swap_success` + `chainId` | Sum fee wei per chain | High | Same as above |
| Commission by pair | `swap_success` + `pairKey` | Sum fee wei per pair key | High | Pair key from symbols or explicit pairKey |
| Commission by provider | `swap_success.provider` | Sum fee wei per provider string | Medium | Provider naming must be consistent |
| Completed swaps | `swap_success` | Count events | High | — |
| Failed swaps | `swap_failure` | Count events | High | — |
| Quote success rate | `quote_success`, `quote_failure` | `success / (success + failure) × 100` | Medium | Retries not counted (`quote_retry` not persisted) |
| Quote failure rate | Same | `failure / (success + failure) × 100` | Medium | Same |
| Average swap size | `swap_success.fromAmount` | Arithmetic mean of parsed floats | Medium | Token-denominated; mixed units across pairs |
| Median swap size | Same | `statistics.median` | Medium | Same |
| Largest commission | `swap_success.feeToTreasuryWei` | Top-N by wei | High | — |
| Largest swap | `swap_success.fromAmount` | Top-N by amount | Medium | Not USD |
| Unsupported chain attempts | `chain_selected` where `swapCapable === false` | Count per `chainId` | High | User may be viewing balances, not attempting swap |
| Unsupported pair attempts | `unsupported_commission_route` | Count per pair key / symbols | High | — |
| Wallet rejection rate | `wallet_rejected` vs swap attempts | Count only in Quality (no denominator in Intelligence) | Low | Use Failures + funnel for context |
| Preview abandonment | `preview_opened` sessions without `swap_success` | Session heuristic via `client_session_id` | Medium | Multi-tab duplication |
| Approval abandonment | `approve_clicked` sessions without subsequent `swap_success` | Session heuristic | Medium | Same |
| Completion rate | Funnel terminal | `swap_success / pair_selected` (implicit in stage counts) | Medium | Funnel start is not true landing |

**P4A comparison:** Events with `ts` before/after `2026-07-07T16:27:32Z` split pre/post deploy counts for `quote_success` and `swap_success`.

---

### Conversion Funnel

**Implemented funnel (observable):**

```
pair_selected → quote_success → preview_opened → approve_clicked → swap_success
```

**Ideal funnel (not fully observable):**

```
Landing → Wallet connected → Pair selected → Quote success → Preview → Approve → Tx submitted → Swap success
```

| Stage transition | Formula | Notes |
|------------------|---------|-------|
| Pair → Quote | `quote_success / pair_selected` | Selection without quote = routing/amount issues |
| Quote → Preview | `preview_opened / quote_success` | Quote distrust or UX friction |
| Preview → Approve | `approve_clicked / preview_opened` | Preview abandonment |
| Approve → Success | `swap_success / approve_clicked` | Wallet reject, swap_failure, RPC |

**Largest drop-off:** Computed as max `(1 - to_count/from_count) × 100` between consecutive funnel stages.

**Wallet rejection:** Surfaced in Quality (`wallet_rejected` count); not a funnel stage (no `wallet_connected`).

---

### Pair Intelligence

Rankings (top 10 unless noted) from scanned batches:

| Ranking | Metric basis |
|---------|----------------|
| Top requested | `quote_success` count per pair |
| Top revenue | Sum `feeToTreasuryWei` per pair |
| Top conversion | `swap_success / quote_success` (min 2 quotes) |
| Top abandoned | `preview_opened - swap_success` estimate per pair |
| Top unsupported | `unsupported_commission_route` count |

**Featured suggestions (rules):**

| Recommendation | Criteria (observed) |
|----------------|---------------------|
| **promote** | ≥3 quotes, conversion ≥40%, fail rate <20%, commission > 0 |
| **keep** | ≥5 quotes, conversion ≥20% |
| **demote** | conversion <10% OR fail rate ≥40% |
| **watch** | otherwise |

Aligns with P4A static featured list (WETH/USDC, WETH/USDT, WETH/DAI, WBNB/USDT, WBNB/USDC, WBNB/CAKE) — operators should validate promote/demote against live rankings after 7d ingest.

---

### Chain Intelligence

| Chain | Signal | Recommendation logic |
|-------|--------|-------------------|
| 1 (Ethereum) | swap_ready | Active commission wrapper |
| 56 (BNB) | swap_ready | Active commission wrapper |
| 137 (Polygon) | `chain_selected` + `swapCapable: false` | balance_view_only; ≥5 selections → high_unsupported_swap_attempts |
| 42161 (Arbitrum) | Same | Same |
| Other | Quotes/swaps on non-1/56 | No swap_success expected |

**Expansion verdict (evidence-based):**

- **Polygon / Arbitrum:** Selection counts prove users *view* those networks in the wallet selector; they do **not** prove sufficient swap demand to justify a new commission wrapper unless `unsupported_chain_selections` is high *and* paired with quote attempts on majors.
- **Default recommendation:** **Do not expand** chains or wrappers until ≥30d of post-P4A data shows sustained unsupported demand and product sign-off. P5A surfaces the counts; it does not authorize execution changes.

---

### Operator Dashboard Design

**Route:** `/admin/intelligence` (nav: Intelligence)

| Section | Content |
|---------|---------|
| **Alerts** | Auto-generated from thresholds (quote failure, unsupported spikes, swap failure, commission drop, P4A baseline) |
| **Executive Summary** | 7d commission wei sum, 7d completed swaps, quote success rate, post-P4A quote count |
| **Conversion Funnel** | Stage counts, conversion %, largest drop-off, abandonment session counts |
| **Revenue** | Top requested / top revenue pairs (tables) |
| **Featured Pair Suggestions** | promote/keep/demote/watch table |
| **Chain Intelligence** | Per-chain quotes, unsupported selections, swaps, recommendation |
| **Quality** | quote_failures, swap_failures, unsupported routes, wallet_rejections, rpc_failures, commission_missing |
| **Limitations** | Meta footnotes |

Existing tabs (Overview, Events, Swaps, Revenue, Lifecycle, Failures, Wallet, System) remain unchanged for drill-down.

---

### Alert Design

| ID | Trigger | Severity | Operator action |
|----|---------|----------|-----------------|
| `quote_failure_elevated` | Failure rate ≥25% and ≥5 failures | warning | Inspect Failures tab; RPC/wrapper health |
| `unsupported_chain_spike` | ≥10 non-swap `chain_selected` | info | Review chain banner copy; **no wrapper expansion** without product decision |
| `unsupported_pair_spike` | ≥10 `unsupported_commission_route` | warning | Rank unsupported pairs; audit expansion for high-volume majors only |
| `swap_failure_elevated` | Failure rate ≥15% and ≥5 failures | critical | Wrapper pause, RPC, deploy regression check |
| `commission_drop_30pct` | 7d wei sum <70% of prior 7d | warning | Volume/mix check; fee telemetry coverage |
| `p4a_funnel_baseline` | Any pre/post P4A quote counts | info | Re-check after 7d for featured-pair lift |

---

### Files Created

| Path | Purpose |
|------|---------|
| `src/swaperex/api/operator_intelligence.py` | Aggregation engine |
| `frontend/src/components/admin/OperatorIntelligencePage.tsx` | Dashboard UI |
| `frontend/src/lib/analytics/operatorIntelligenceFormat.ts` | Display helpers |
| `tests/test_operator_intelligence.py` | Unit tests |
| `docs/audits/SWAPEREX_P5A_REVENUE_INTELLIGENCE.md` | This report |

### Files Modified

| Path | Change |
|------|--------|
| `src/swaperex/api/routes/admin_readonly.py` | `GET /operator-intelligence` |
| `frontend/src/admin/adminApi.ts` | Types + `fetchAdminOperatorIntelligence` |
| `frontend/src/components/admin/AdminApp.tsx` | Nav + route `/admin/intelligence` |
| `tests/test_app_admin.py` | Path whitelist + integration test |

**Not modified (hard rules):** swap execution, wrappers, commission, pairs, chains, contracts, nginx.

---

### Validation

| Check | Result |
|-------|--------|
| `git diff --check` | PASS |
| `npm --prefix frontend run build` | PASS |
| `bash scripts/audit/verify-wrappers.sh` | PASS |
| `node scripts/audit/audit-commission-pairs.mjs` | PASS (126/126) |
| `python3 -m py_compile` (scripts + operator_intelligence) | PASS |
| `pytest` P5A tests (7) | PASS |

---

### Risks

1. **Low P4A sample size** — Deployed 2026-07-07; pre/post comparison needs days of ingest.
2. **Session heuristics** — Abandonment counts can double-count multi-tab users.
3. **Scan cost** — O(batches × events) per request; raise `maxBatches` cautiously.
4. **Commission gaps** — `commission_missing` events mean revenue totals understate truth.
5. **No USD** — Operators must mentally map wei to economic impact per token.
6. **reports/*.json** — Audit scripts refresh timestamped reports (unrelated to P5A logic).

---

### Deployment Recommendation

**Deploy when approved** — P5A is read-only analytics (backend route + admin SPA). No production swap path changes.

Suggested steps:

1. Commit P5A changes on `main`
2. `./scripts/safe-prod-deploy.sh --dry-run` then deploy
3. Verify `GET /api/v1/admin/operator-intelligence` with admin token
4. Open https://dex.kobbex.com/admin/intelligence
5. Wait 7d post-deploy for meaningful P4A funnel comparison

**Do not deploy automatically** (per mission rules).

---

### Next Phase Recommendation

**P5B — Funnel completeness & metric hardening (optional):**

1. Persist `quote_retry` and `allowance_read_failed` (or add single `approval_friction` event) — still no PII
2. Add `wallet_connected` (boolean + chain only) for Wallet→Quote conversion
3. Materialized daily rollups table (optional) if batch scan latency grows
4. USD notional via off-chain price oracle for executive summary only
5. Wire `route_precheck_visible` into Quality if precheck volume correlates with quote_failure

**P5C — Operator actions:** Export CSV from Intelligence; Slack/webhook from alert IDs (read-only notifications).

---

*End of P5A report.*
