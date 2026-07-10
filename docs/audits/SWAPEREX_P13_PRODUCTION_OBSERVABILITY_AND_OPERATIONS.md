# SWAPEREX P13 — Production Observability and Operations

**Program verdict:** `P13_PRODUCTION_OBSERVABILITY_PASS`  
**Date:** 2026-07-10 UTC  
**Production:** https://dex.kobbex.com  
**Certified commit:** `eee0264`  
**Rollback floor:** `75b2ce7`

---

## Program objective

Transform P12 validation tools into a reliable production operations layer without changing DEX product behavior.

---

## Phase summary

| Phase | Verdict |
|-------|---------|
| P13.1 Scheduled smoke | `P13_1_SCHEDULED_SMOKE_PASS` |
| P13.2 Quote trends | `P13_2_QUOTE_TREND_REPORTING_PASS_WITH_LIMITED_BASELINE` |
| P13.3 Runtime warnings | `P13_3_RUNTIME_WARNING_TRENDS_PASS_WITH_VENDOR_NOISE` |
| P13.4 Health status | `P13_4_PRODUCTION_HEALTH_STATUS_PASS` |
| P13.5 Release certification | `P13_5_RELEASE_CERTIFICATION_PIPELINE_PASS` |
| P13.6 Runbooks | `P13_6_RUNBOOKS_PASS` |
| P13.7 Final certification | See `SWAPEREX_P13_FINAL_CERTIFICATION.md` |

---

## Monitoring cadence

| Monitor | Cadence | Status |
|---------|---------|--------|
| Route/quote smoke | Every 6h (systemd timer) | **Installed & enabled** |
| Quote trend report | Daily (optional timer) | Prepared, not installed |
| Runtime warning capture | Weekly (manual/on-demand) | On-demand |
| Runtime trend aggregation | Daily/weekly | On-demand |
| Report retention | Weekly (recommended) | Script ready |

---

## Architecture

```text
P12.5 smoke ──► P13.1 wrapper ──► reports/p13/route-smoke/
                                        │
                                        ▼
                              P13.2 quote trends ──► reports/p13/quote-trends/
P12.4 warnings ─────────────────► P13.3 warning trends
                                        │
                                        ▼
                              P13.4 production status ──► reports/p13/status/
```

All monitoring runs **outside** the frontend runtime. No application deploy required for P13.

---

## Application source

**No application source changes.** All P13 artifacts are ops/scripts/docs/systemd/tests.

---

## Operator recommendation

```text
HOLD_PRODUCTION_BASELINE_AT_eee0264
```

Continue scheduled smoke; review trend baselines after 7 days of observations; install daily quote-trend timer when convenient.

---

## Related documents

- P13.1–P13.6 phase audits
- Runbooks under `docs/runbooks/`
- Baseline evidence: `docs/audits/raw/p13/baseline/`
