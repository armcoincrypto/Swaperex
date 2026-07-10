# SWAPEREX P13 — Seven-Day Observation Plan

**Status:** ACTIVE  
**Start (UTC):** 2026-07-10T11:32:00Z  
**End (UTC):** 2026-07-17T11:32:00Z  
**Duration:** 7 full days

---

## Purpose

Collect sufficient scheduled smoke observations to establish evidence-based latency thresholds and confirm monitoring reliability before finalizing operational SLOs.

Do **not** finalize latency SLOs before enough samples exist.

---

## Monitoring cadence

| Monitor | Schedule | Expected in 7 days |
|---------|----------|-------------------|
| Route/quote smoke | Every 6h (systemd) | ~28 runs |
| Quote trend aggregation | Manual or daily (optional timer) | 7 summaries |
| Runtime warning capture | Weekly / on-demand | 1 capture recommended |
| Production status | On-demand or post-smoke | As needed |

---

## Metrics to track

Per run and aggregated (24h / 7d windows):

- Smoke success rate
- Per-route success rate
- Median quote latency
- P90 quote latency
- P95 quote latency (mark `INSUFFICIENT_SAMPLE_SIZE` when n < 20)
- Maximum latency
- Retry frequency and classification
- Provider/RPC transient failures
- Consecutive required-route failures
- Production version changes (`version.txt`)
- Runtime APP_FATAL / APP_ERROR count
- New unclassified warning fingerprints
- Monitoring evidence freshness
- Timer/service failures

---

## Data sources

| Source | Path |
|--------|------|
| Smoke envelopes | `reports/p13/route-smoke/latest.json` (local, not in Git) |
| Timestamped smoke | `reports/p13/route-smoke/*.json` |
| Quote trends | `reports/p13/quote-trends/p13-quote-trends.json` |
| Warning trends | `reports/p13/runtime-warnings/p13-runtime-warning-trends.json` |
| Production status | `reports/p13/status/p13-production-status.json` |
| Service journal | `journalctl -u swaperex-route-quote-smoke.service` |
| Start manifest | `docs/audits/raw/p13/baseline/OBSERVATION_START.json` |

---

## Operator check commands

```bash
# Daily or after any alert
systemctl status swaperex-route-quote-smoke.timer --no-pager
journalctl -u swaperex-route-quote-smoke.service -n 50 --no-pager
node scripts/ops/p13-quote-trend-report.mjs --window 7d
node scripts/ops/p13-production-status.mjs --check
curl -fsS https://dex.kobbex.com/version.txt
```

---

## Provisional review conditions (day 7)

Observation **PASS** requires:

- [ ] At least **20 valid scheduled runs** collected
- [ ] No confirmed application regression
- [ ] No two consecutive required-route failures
- [ ] No APP_FATAL in production warning evidence
- [ ] No stale monitoring interval (> 6.5h without fresh smoke while timer active)
- [ ] No unexplained production version change from `eee0264`

---

## Day-7 outcomes (future — not complete now)

| Verdict | Meaning |
|---------|---------|
| `P13_9_SEVEN_DAY_OBSERVATION_PASS` | All conditions met; thresholds may be finalized |
| `P13_9_OBSERVATION_PASS_WITH_THRESHOLD_ADJUSTMENTS` | Pass with provisional SLO updates |
| `P13_9_RUNTIME_DEGRADATION_FOUND` | App-owned regression detected |
| `P13_9_MONITORING_RELIABILITY_BLOCKED` | Timer/report pipeline unreliable |

---

## Current baseline at start

| Metric | Value |
|--------|-------|
| Valid scheduled samples | 2 (systemd runs) + manual runs |
| Production commit | `eee0264` |
| Production status | HEALTHY |
| Service user | root (interim) |

---

## Actions during observation

**Do:**

- Hold production at `eee0264` unless incident requires deploy
- Preserve incident evidence under `docs/audits/raw/p13/incidents/` if needed
- Run retention dry-run weekly: `bash scripts/ops/p13-report-retention.sh --dry-run`

**Do not:**

- Deploy application changes without release certification
- Finalize aggressive latency SLOs before 20+ scheduled runs
- Commit volatile `reports/p13/` output to Git

---

## Next review

**Scheduled:** 2026-07-17 UTC (or after 20+ valid scheduled runs, whichever is later)

Produce: `docs/audits/SWAPEREX_P13_9_SEVEN_DAY_OBSERVATION.md`
