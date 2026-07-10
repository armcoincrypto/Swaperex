# SWAPEREX P13.3 — Runtime Warning Trends

**Verdict:** `P13_3_RUNTIME_WARNING_TRENDS_PASS_WITH_VENDOR_NOISE`  
**Date:** 2026-07-10 UTC

---

## Summary

P12.4 runtime warning reports are aggregated against the certified baseline to detect new app-owned regressions while tolerating known vendor cosmetic noise.

---

## Generator

`scripts/ops/p13-runtime-warning-trends.mjs`

```bash
node scripts/ops/p13-runtime-warning-trends.mjs --window 7d
node scripts/ops/p13-runtime-warning-trends.mjs --check
```

`--check` fails on: APP_FATAL, APP_ERROR, new unclassified high-severity fingerprints, expired baseline entries.

Does **not** fail on known Reown font preload / cosmetic vendor warnings.

---

## Frequency policy

WARN when known warning count increases ≥3× against meaningful prior sample (min 5 reports). Not applied with tiny samples.

---

## Scheduling recommendation

| Job | Cadence |
|-----|---------|
| P12.4 browser capture | Weekly |
| Trend aggregation | Daily or weekly |

Browser sessions are resource-heavy; do not run more frequently without cause.

---

## Baseline

`scripts/audit/config/p12-runtime-warning-baseline.json` — exact fingerprints, classification, owner, review/expiration dates.

---

## Output

`reports/p13/runtime-warnings/p13-runtime-warning-trends.json`

Current sample: 2 P12.4 reports; vendor cosmetic noise present; no APP_FATAL in production evidence.
