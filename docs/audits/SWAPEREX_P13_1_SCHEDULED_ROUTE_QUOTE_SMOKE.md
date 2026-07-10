# SWAPEREX P13.1 — Scheduled Route/Quote Smoke

**Verdict:** `P13_1_SCHEDULED_SMOKE_PASS`  
**Date:** 2026-07-10 UTC  
**Production:** https://dex.kobbex.com (`eee0264`)

---

## Summary

P12.5 route/quote regression smoke is operationalized via a P13 wrapper with retries, timestamped JSON reports, flock overlap protection, and a 6-hour systemd timer.

---

## Components

| Artifact | Path |
|----------|------|
| Wrapper (retries + envelope) | `scripts/ops/p13-run-route-quote-smoke.mjs` |
| Certified smoke (unchanged) | `scripts/audit/p12-5-route-quote-regression-smoke.mjs` |
| Service unit | `ops/systemd/swaperex-route-quote-smoke.service` |
| Timer unit | `ops/systemd/swaperex-route-quote-smoke.timer` |
| Retention | `scripts/ops/p13-report-retention.sh` |
| Reports | `reports/p13/route-smoke/` |

---

## Unit review

| Check | Value |
|-------|-------|
| User | `root` (matches repo path `/root/Swaperex`) |
| WorkingDirectory | `/root/Swaperex` |
| Node | `/usr/bin/node` |
| Environment | `SWAPEREX_QA_URL=https://dex.kobbex.com` |
| Timeout | `TimeoutStartSec=900` |
| Overlap | `flock -n /var/lock/swaperex-route-quote-smoke.lock` |
| Restart | oneshot (no restart storm) |
| Timer cadence | `OnCalendar=*-*-* 00/6:00:00` equivalent every 6h |
| Persistent | `true` |
| RandomizedDelaySec | `300` |

`systemd-analyze verify` — **PASS**

---

## Installation status

Installed to:

- `/etc/systemd/system/swaperex-route-quote-smoke.service`
- `/etc/systemd/system/swaperex-route-quote-smoke.timer`

```bash
systemctl enable --now swaperex-route-quote-smoke.timer  # enabled
systemctl start swaperex-route-quote-smoke.service     # manual run PASS
```

Journal excerpt: `docs/audits/raw/p13/baseline/systemd-journal-last50.txt`

---

## Validation runs

| Run | Result | Duration |
|-----|--------|----------|
| Manual wrapper | 19/19 PASS | ~14s |
| systemd service | 19/19 PASS | ~13s |

Latest envelope: `reports/p13/route-smoke/latest.json`  
Classification on success: `success`

---

## Failure semantics

| Classification | Meaning |
|----------------|---------|
| `success` | All required checks passed |
| `production_unavailable` | HTTP-only failures (transient) |
| `rpc_provider_transient_failure` | Non-required failures only |
| `confirmed_quote_regression` | Required on-chain route fail |
| `confirmed_route_regression` | Required browser/UI fail |
| `browser_startup_failure` | Local browser env |
| `local_environment_failure` | Script/runtime env |

Retries: max 2, backoff 5s / 15s. Transient classes retried; regressions do not retry beyond policy.

---

## Retention policy

| Class | Retention |
|-------|-----------|
| Raw per-run JSON | 30 days |
| Daily/trend summaries | 180 days |
| Audit Markdown | never auto-deleted |

```bash
bash scripts/ops/p13-report-retention.sh --dry-run   # default
bash scripts/ops/p13-report-retention.sh --apply
```

---

## Safety confirmation

- Read-only against production URL
- No wallet, no signatures, no transactions
- No application source modified
- No secrets in units or scripts
