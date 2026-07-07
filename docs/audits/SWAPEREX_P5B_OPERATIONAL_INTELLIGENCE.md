# SWAPEREX P5B — Operational Intelligence & Daily Decision Support

**Production baseline:** `e145b22` @ https://dex.kobbex.com  
**Builds on:** P5A operator intelligence (`/admin/intelligence`)  
**Scope:** Read-only decision support — no swap/wrapper/commission/pair/chain changes.

---

## SWAPEREX_P5B_OPERATIONAL_INTELLIGENCE_REPORT

### Executive Verdict

**P5B COMPLETE — READY FOR OPERATOR MORNING BRIEFING (NO AUTO-DEPLOY)**

P5B extends the P5A intelligence layer with daily executive summary, traffic-light status (green/yellow/red), ranked operator recommendations, measured trend detection, data-driven featured-pair scoring, a 0–100 health score with deduction breakdown, and daily insight history stored in the existing `monitoring_ingest_batches` table (no schema migration).

**30-second success criteria:**

| Question | Answerable |
|----------|------------|
| Did revenue improve? | Yes — 7d commission change %, today vs yesterday, insight history |
| Is anything broken? | Yes — health score, red/yellow status, alerts, swap/quote failure deductions |
| What should I promote today? | Yes — recommendations + featured automation top scores |
| Which pairs deserve attention? | Yes — growing/declining pair trends, quote-failure investigations |
| Unsupported chains requested? | Yes — chain trends + recommendations |
| Expand anything yet? | Yes — explicit low-priority “do not expand” when evidence thin |
| One action for commission today? | Yes — `top_commission_action` recommendation when health ≥ 80 |

---

### Daily Summary Model

`decision_support.daily_executive_summary` includes:

| Field | Source |
|-------|--------|
| Commission today / yesterday / 7d change | `swap_success.feeToTreasuryWei` by UTC window |
| Swap & quote counts | `swap_success`, `quote_success` |
| Quote & swap success % | vs `quote_failure`, `swap_failure` |
| Largest swap / commission today | max `fromAmount` / `feeToTreasuryWei` |
| Top chain / pair | max counts in window |
| Biggest improvement / decline | pair quote delta today vs yesterday |

**Status thresholds:**

| Level | Label | Triggers (examples) |
|-------|-------|---------------------|
| Green | Normal | All metrics within thresholds |
| Yellow | Watch | 7d commission −15%, quote success <85%, unsupported spikes |
| Red | Needs attention | 7d commission −30%, quote success <70%, critical alerts |

---

### Recommendation Engine

Up to 12 prioritized recommendations with: `title`, `reason`, `evidence`, `confidence`, `action`, `priority`.

Types: promote pair, demote featured, investigate quote failures, unsupported chain trend, commission down, quote volume up, top commission action.

---

### Trend Detection

Measured comparisons only (no forecasting):

- **Pairs:** today vs yesterday; 7d vs prior 7d; 30d vs prior 30d — growing & declining lists
- **Chains:** quote counts by chain, same windows
- **Commission / quotes / swaps:** absolute counts + % change 7d and 30d

---

### Featured Pair Logic

7d scoring: quote volume, conversion, commission (log), failure rate, abandonment, growth.

Outputs:

- `recommended_featured` — top 6 by score (≥10)
- `recommended_removal` — static featured pairs with score <5 or quotes <2
- Compares against static P4A catalog keys (UI unchanged; recommendations only)

---

### Health Score

0–100 with deductions across:

1. Swap reliability (7d failure rate)
2. Revenue stability (7d commission drop)
3. Commission trend (negative 7d %)
4. Conversion (funnel pair→swap)
5. Unsupported demand (unsupported events / quotes)
6. Operational alerts (warning/critical)

---

### Insight History

Daily condensed snapshots persisted via `monitoring_ingest_batches`:

- `client_session_id`: `p5b-insight-store`
- `envelope.kind`: `operator_daily_snapshot`
- One row per UTC day (idempotent on repeat requests)

Compare: today, yesterday, 7d ago, 30d ago from stored snapshots.

---

### UI Changes

Extended `/admin/intelligence`:

1. Morning status banner (green/yellow/red) + health score
2. Daily executive summary cards
3. Operator recommendations list
4. Health score + deductions
5. Trend cards + growing/declining pairs
6. Recent alerts
7. Featured pair recommendations (promote/remove)
8. Insight history strip
9. P5A sections retained below

---

### Files Created

| Path | Purpose |
|------|---------|
| `src/swaperex/api/operator_decision_support.py` | P5B aggregation engine |
| `tests/test_operator_decision_support.py` | Unit tests |
| `docs/audits/SWAPEREX_P5B_OPERATIONAL_INTELLIGENCE.md` | This report |

### Files Modified

| Path | Change |
|------|--------|
| `src/swaperex/api/operator_intelligence.py` | Timed metrics scan, P5B merge, schema v2 |
| `src/swaperex/api/routes/admin_readonly.py` | Daily snapshot persistence |
| `frontend/src/admin/adminApi.ts` | `AdminDecisionSupport` types |
| `frontend/src/components/admin/OperatorIntelligencePage.tsx` | P5B UI sections |
| `frontend/src/lib/analytics/operatorIntelligenceFormat.ts` | Status/health helpers |
| `tests/test_operator_intelligence.py` | Schema v2 assertions |
| `tests/test_app_admin.py` | Integration test update |

---

### Validation

| Check | Result |
|-------|--------|
| `git diff --check` | PASS |
| `npm --prefix frontend run build` | PASS |
| `verify-wrappers.sh` | PASS |
| `audit-commission-pairs.mjs` | 126/126 PASS |
| `pytest` | 109 passed, 3 skipped |

---

### Risks

1. Low telemetry volume — recommendations need ≥3–5 events for confidence
2. Snapshot storage grows ~1 row/day (negligible)
3. Live window boundary — events at exact request time use inclusive end bound
4. Featured automation advises only — static UI catalog unchanged until operator acts
5. No USD normalization

---

### Deployment Recommendation

Deploy when approved — read-only admin analytics + one append-only snapshot row per day.

1. Commit P5B
2. `./scripts/safe-prod-deploy.sh --dry-run` then deploy
3. Open `/admin/intelligence` — verify morning status + recommendations
4. Confirm `p5b-insight-store` batch appears after first load

---

### Next Recommended Phase

**P5C — Operator actions & notifications:**

- Optional Slack/webhook for red status
- CSV export of recommendations
- Persist `quote_retry` / `wallet_connected` for fuller funnel (telemetry-only)
- Materialized weekly rollup if batch scan latency grows

---

*End of P5B report.*
