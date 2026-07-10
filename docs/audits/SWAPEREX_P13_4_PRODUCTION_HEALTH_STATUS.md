# SWAPEREX P13.4 — Production Health Status

**Verdict:** `P13_4_PRODUCTION_HEALTH_STATUS_PASS`  
**Date:** 2026-07-10 UTC

---

## Summary

Static operator-readable production status snapshot generated from local reports and optional systemctl state. No Grafana/Prometheus/hosted vendor added.

---

## Generator

`scripts/ops/p13-production-status.mjs`

```bash
node scripts/ops/p13-production-status.mjs
node scripts/ops/p13-production-status.mjs --json reports/p13/status/p13-production-status.json
node scripts/ops/p13-production-status.mjs --markdown reports/p13/status/p13-production-status.md
node scripts/ops/p13-production-status.mjs --html reports/p13/status/p13-production-status.html
node scripts/ops/p13-production-status.mjs --check
```

---

## Status states

| State | Condition |
|-------|-----------|
| HEALTHY | Latest required smoke passed, evidence fresh |
| DEGRADED | Transient failures, elevated latency, non-blocking warnings |
| INCIDENT | Repeated required-route failure, unavailable, APP_FATAL, blank screen |
| STALE | Evidence older than 6h schedule + 30m grace |
| UNKNOWN | Missing/malformed required evidence |

---

## `--check` exit codes

| Code | Status |
|------|--------|
| 0 | HEALTHY |
| 1 | DEGRADED |
| 2 | INCIDENT |
| 3 | STALE / UNKNOWN |

---

## Current snapshot

- Overall: **HEALTHY**
- Production commit: `eee0264`
- Latest smoke: 19/19 PASS
- HTML: `reports/p13/status/p13-production-status.html` (local only, not deployed to DEX domain)

---

## Synthetic failure-injection validation

Verified via `scripts/ops/p13-failure-injection-test.mjs`:

- STALE transition ✓
- INCIDENT on smoke fail ✓
- Malformed report tolerance ✓

Fixtures: `tests/fixtures/p13/`
