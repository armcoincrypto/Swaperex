# SWAPEREX P13.8 — Operations Baseline Commit and Observation Start

**Verdict:** `P13_8_OPERATIONS_BASELINE_COMMITTED_AND_OBSERVATION_STARTED`
**Date:** 2026-07-10 UTC

---

## Executive verdict

P11/P12/P13 operational artifacts are committed in four logical commits on `main`. Volatile runtime reports remain untracked per updated `.gitignore`. The six-hour smoke timer remains active and passed post-commit verification. A seven-day observation period has started. Service-user migration is deferred pending relocation out of `/root`.

---

## Production baseline

| Item | Value |
|------|-------|
| URL | https://dex.kobbex.com |
| Production commit | `eee0264` |
| Rollback floor | `75b2ce7` |
| Application deployment | None |
| Application source changes | None |

---

## Git inventory (pre-commit classification)

### Durable source artifacts (committed)

- P11/P12 audit scripts under `scripts/audit/`
- P13 ops scripts under `scripts/ops/`
- Release scripts under `scripts/release/`
- Systemd unit definitions under `ops/systemd/`
- Runtime warning baseline `scripts/audit/config/p12-runtime-warning-baseline.json`
- Synthetic fixtures `tests/fixtures/p13/`

### Audit documentation (committed)

- P11 audits (3), P12 audits (7), P13 audits (9)
- P13.8 hardening assessment, P13 final certification

### Runbooks (committed)

- `docs/runbooks/SWAPEREX_PRODUCTION_OPERATIONS_RUNBOOK.md`
- `docs/runbooks/SWAPEREX_INCIDENT_RESPONSE_RUNBOOK.md`

### Test fixtures (committed)

- `tests/fixtures/p13/` (5 synthetic failure fixtures)

### Generated reports (excluded)

- `reports/p11-*.json`, `reports/p12-*.json`, `reports/p13/`
- `reports/commission-pair-audit-*.json`

### Temporary evidence (excluded)

- `docs/audits/raw/p12/`, `docs/audits/raw/p12_*/`
- Volatile P13 baseline captures (logs, journals, git snapshots, validation log)

### Potentially sensitive files (excluded / reviewed)

- No secrets found in scripts; grep matches reviewed (RPC URLs, test seed functions, documentation references only)
- `.env.production` already gitignored
- WalletConnect session data: not present in artifact tree

---

## Repository hygiene decisions

Updated `.gitignore` (commit 1) to exclude:

| Pattern | Reason |
|---------|--------|
| `reports/p11-*.json`, `reports/p12-*.json`, `reports/p13/` | High-churn runtime output |
| `reports/commission-pair-audit-*.json` | Regenerated audit output |
| `docs/audits/raw/p12/`, `docs/audits/raw/p12_*/` | Raw capture replay |
| Selected `docs/audits/raw/p13/baseline/*` volatile files | Logs, journals, git snapshots |

**Committed durable baseline:** `docs/audits/raw/p13/baseline/OBSERVATION_START.json`

**Not ignored:** scripts, systemd units, audit Markdown, runbooks, fixtures, baseline config.

---

## Secret scan

Command: `grep -RInE 'seed|mnemonic|private[_-]?key|...' scripts ops docs tests/fixtures`

| Match class | Disposition |
|-------------|-------------|
| `seedStaleInjectedState` (P11 test helper) | Safe — clears stale localStorage, no keys |
| `bsc-dataseed.binance.org` | Public RPC default |
| Documentation references to seed phrases | Policy text, not credentials |
| Contract README deploy examples | Pre-existing, not in P13 commits |

**No hard-coded secrets committed.**

---

## Validation gates (pre-commit)

| Gate | Result |
|------|--------|
| frontend build | PASS |
| verify-wrappers | PASS |
| commission audit | PASS (126/126) |
| backend pytest | PASS (119 passed, 3 skipped) |
| Vitest sanitizeAppKitPersistedState | PASS (2/2) |
| Node syntax (5 scripts) | PASS |
| Shell syntax (3 scripts) | PASS |
| systemd verify (4 units) | PASS |
| Synthetic failure tests | PASS (5/5) |
| Production status `--check` | HEALTHY (exit 0) |

---

## Commit list

| # | Hash | Message |
|---|------|---------|
| 1 | `7be8887` | chore(ops): add P11 and P12 production validation baseline |
| 2 | `9abb01b` | feat(ops): add production smoke trends and health status tooling |
| 3 | `16b9c75` | feat(release): add deterministic Swaperex certification gates |
| 4 | `25f8085` | docs(ops): certify P13 observability and incident response |

**HEAD after commits:** `25f8085` (4 commits ahead of production app commit `eee0264`)

---

## Files intentionally excluded from Git

- All `reports/p13/` timestamped smoke JSON, trend output, status HTML
- All `reports/p12-*.json`, `reports/p11-*.json`
- Raw P12 capture directories under `docs/audits/raw/p12*`
- Volatile P13 baseline logs/journals (`git-*.txt`, `systemd-*.txt`, validation log)
- Pre-existing untracked reports (`browser-wallet-qa-*`, etc.) — pre-dated P13, remain local

---

## Systemd status (post-commit)

| Unit | State |
|------|-------|
| `swaperex-route-quote-smoke.timer` | active (waiting), enabled |
| `swaperex-route-quote-smoke.service` | oneshot, last run SUCCESS |
| Next trigger | ~6h from last activation |

Post-commit manual run: **PASS** (19/19, classification `success`)

---

## Latest smoke result

```json
{
  "timestamp": "2026-07-10T11:35:51.542Z",
  "finalExitCode": 0,
  "finalClassification": "success",
  "finalVerdict": "P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_PASS",
  "summary": { "total": 19, "pass": 19, "fail": 0 }
}
```

---

## Production health result

- Status: **HEALTHY**
- `--check` exit code: **0**
- Production commit from version.txt: **eee0264**

---

## Service-user hardening assessment

**Verdict:** `P13_8_SERVICE_USER_MIGRATION_REQUIRES_RELOCATION`

- Current user: **root** (interim accepted)
- Migration: **not performed**
- Blocker: repository under `/root/Swaperex`; dedicated user requires `/opt/swaperex-monitor` relocation
- Document: `docs/audits/SWAPEREX_P13_8_SERVICE_USER_HARDENING_ASSESSMENT.md`

---

## Seven-day observation start

| Field | Value |
|-------|-------|
| Start (UTC) | 2026-07-10T11:32:00Z |
| End (UTC) | 2026-07-17T11:32:00Z |
| Expected runs | ~28 |
| Valid samples at start | 3 scheduled systemd runs |
| Plan | `docs/operations/SWAPEREX_P13_7_DAY_OBSERVATION_PLAN.md` |

Observation is **started**, not complete.

---

## Optional timer recommendations

| Timer | Ready | Recommendation |
|-------|-------|----------------|
| Daily quote trend | Yes (units in repo) | **Defer** until observation data accumulates |
| Weekly runtime warning | Manual script ready | **Manual/on-demand** during observation |
| Weekly retention | Script ready | **Dry-run only** during observation |

### Daily quote trend (prepared)

- Purpose: Aggregate smoke JSON into 7d trends
- Cost: Low (~seconds, no browser)
- Privileges: Read reports dir, write trends dir
- Install: `systemctl enable --now swaperex-quote-trend-report.timer`
- Rollback: `systemctl disable --now swaperex-quote-trend-report.timer`

### Weekly runtime warning

- Purpose: Browser capture for APP_FATAL detection
- Cost: High (Playwright session)
- Privileges: Same as smoke (currently root)
- Recommendation: Run manually once mid-observation

### Weekly retention

- Purpose: Prune old JSON (30d/180d policy)
- Install: Create timer wrapping `p13-report-retention.sh --apply`
- Recommendation: Dry-run weekly first; apply after observation review

---

## Application source confirmation

No frontend or backend application source files modified. Commits contain ops/scripts/docs/tests only.

---

## Production deployment confirmation

No production application deployment performed. Live commit remains `eee0264`.

---

## Open risks

1. Smoke service runs as root (interim)
2. Latency SLOs provisional until 20+ scheduled runs
3. Four ops commits on `main` not pushed to remote
4. HEAD (`25f8085`) ahead of production app commit — ops-only divergence

---

## Next review criteria

At **2026-07-17 UTC** (or after 20 valid scheduled runs):

- Produce `P13_9_SEVEN_DAY_OBSERVATION_*` verdict
- Evaluate latency thresholds with sufficient sample size
- Decide on daily trend timer installation
- Reassess service-user relocation plan

---

## Final verdict

```text
P13_8_OPERATIONS_BASELINE_COMMITTED_AND_OBSERVATION_STARTED
```
