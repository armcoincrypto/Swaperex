# SWAPEREX P5B.1 — Intelligence Hardening & Deploy-Safety

**Production baseline:** `e145b22`  
**Prior certification:** `P5_READY_WITH_WARNINGS`  
**Date:** 2026-07-07  
**Scope:** Admin intelligence layer only — no swap/wrapper/commission changes.

---

## Executive Verdict

P5B.1 addresses all four certification warnings (W1–W4) from the P5 production certification. The intelligence layer is now **deploy-safer**: plain GET is read-only, scans are DB-limited, empty telemetry shows `INSUFFICIENT_DATA`, and recommendations are gated by 7-day quote sample thresholds.

**Recommended verdict:** `P5B1_READY_TO_COMMIT` (deploy still requires explicit operator approval).

---

## Warnings Fixed

| ID | Issue | Fix |
|----|-------|-----|
| W1 | GET wrote snapshots by default | `persistDaily=false` default; explicit `?persistDaily=true` for opt-in append-only snapshot |
| W2 | Full-table monitoring load | SQL `LIMIT` (default 500, hard max 2000) + `window.scan` metadata |
| W3 | Empty data → Green / health 100 | `INSUFFICIENT_DATA` status, health `score: null`, no promote/demote |
| W4 | Weak-sample recommendations | Thresholds: &lt;10 insufficient, 10–49 low, 50–199 medium, 200+ high |

---

## Data Confidence Model

```json
{
  "data_confidence": {
    "level": "insufficient | low | medium | high",
    "quotes_7d": 4,
    "minimum_required": 10,
    "medium_threshold": 50,
    "high_threshold": 200,
    "message": "...",
    "ui_hint": "..."
  }
}
```

---

## Scan Metadata

```json
{
  "window": {
    "scan": {
      "batches_scanned": 500,
      "events_scanned": 25000,
      "max_batches": 500,
      "scan_limited": true,
      "scan_duration_ms": 243,
      "total_batches_in_db": 10000
    }
  }
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/swaperex/api/operator_decision_support.py` | Confidence model, gating, thresholds, schema v3 |
| `src/swaperex/api/operator_intelligence.py` | Schema v3, scan metadata in response |
| `src/swaperex/api/routes/admin_readonly.py` | `persistDaily=false`, DB LIMIT, timing |
| `frontend/src/components/admin/OperatorIntelligencePage.tsx` | Insufficient banner, scan info, sample sizes |
| `frontend/src/admin/adminApi.ts` | Updated types |
| `frontend/src/lib/analytics/operatorIntelligenceFormat.ts` | insufficient/confidence styles |
| `tests/test_operator_decision_support.py` | Sample threshold tests (0/5/20/75/250) |
| `tests/test_operator_intelligence.py` | Empty-data assertions |
| `tests/test_app_admin.py` | persistDaily behavior tests |

**Not modified:** swap execution, wrappers, commission, pair allowlist, nginx.

---

## Tests Added

- Plain GET does not write snapshot rows
- `persistDaily=true` idempotent (one row per UTC day)
- Empty → `INSUFFICIENT_DATA`, health null, no promote/demote
- 5 / 20 / 75 / 250 quote gating scenarios
- Scan metadata present on API response

---

## Remaining Limitations

- No event deduplication (duplicate client events still inflate metrics)
- No `wallet_connected` funnel event
- Commission in wei only (no USD)
- Snapshot persistence still uses monitoring table (append-only, opt-in)
- Hard max 2000 batches — very large installs may need rollup phase (P5C)

---

## Deployment Recommendation

1. Commit P5A + P5B + P5B.1 together
2. `./scripts/safe-prod-deploy.sh --dry-run` then deploy when approved
3. First week: open `/admin/intelligence` daily; use `?persistDaily=true` once per day if history desired
4. Re-run P5 certification — expect upgrade from `P5_READY_WITH_WARNINGS`

---

## Rollback Plan

- Redeploy prior static artifact (`e145b22`) — intelligence is admin-only; swap path unaffected
- Or revert intelligence commit only; no DB migration required

---

*End of P5B.1 audit.*
