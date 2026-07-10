# SWAPEREX P13.2 — Quote Latency and Availability Trends

**Verdict:** `P13_2_QUOTE_TREND_REPORTING_PASS_WITH_LIMITED_BASELINE`  
**Date:** 2026-07-10 UTC

---

## Summary

Timestamped smoke reports are aggregated into deterministic JSON/Markdown trend reports without external databases or network access.

Limited baseline: initial sample count is low (seed + live runs); percentiles marked `INSUFFICIENT_SAMPLE_SIZE` where applicable.

---

## Generator

`scripts/ops/p13-quote-trend-report.mjs`

```bash
node scripts/ops/p13-quote-trend-report.mjs
node scripts/ops/p13-quote-trend-report.mjs --window 7d
node scripts/ops/p13-quote-trend-report.mjs --output reports/p13/quote-trends/p13-quote-trends.json
node scripts/ops/p13-quote-trend-report.mjs --markdown reports/p13/quote-trends/p13-quote-trends.md
node scripts/ops/p13-quote-trend-report.mjs --check
```

---

## Metrics tracked

Per run and route: timestamp, production version, success/failure, quote latency, provider, chain, tokens, retry count (via envelope), failure classification.

Windows: 24h, 7d, 30d.

Aggregations: availability %, median/P90/P95/max latency, consecutive failures, per-route breakdown.

---

## Provisional thresholds

| Level | Policy |
|-------|--------|
| WARN | Quote latency > recent P95 baseline by material margin (pending sufficient samples) |
| WARN | One required route fails after retries |
| CRITICAL | Two consecutive scheduled runs fail same required route |
| CRITICAL | Homepage/quote unavailable across retries |

Documented as provisional until ≥7 days of scheduled observations.

---

## Optional daily timer (prepared, not installed)

- `ops/systemd/swaperex-quote-trend-report.service`
- `ops/systemd/swaperex-quote-trend-report.timer`

Install only when operator authorizes.

---

## Output

- `reports/p13/quote-trends/p13-quote-trends.json`
- `reports/p13/quote-trends/p13-quote-trends.md`

Malformed individual files are skipped and listed in `skippedFiles`.
