# Swaperex Production Operations Runbook

**Production:** https://dex.kobbex.com  
**Certified commit:** `eee0264`  
**Rollback floor:** `75b2ce7`  
**Repository:** `/root/Swaperex`

---

## Quick health check

```bash
curl -fsS https://dex.kobbex.com/version.txt
node /root/Swaperex/scripts/ops/p13-production-status.mjs --check
node /root/Swaperex/scripts/ops/p13-production-status.mjs --markdown reports/p13/status/p13-production-status.md
```

Exit codes for `--check`: `0=HEALTHY`, `1=DEGRADED`, `2=INCIDENT`, `3=STALE/UNKNOWN`.

---

## Inspect production version

```bash
curl -fsS https://dex.kobbex.com/version.txt
cd /root/Swaperex && git rev-parse --short HEAD
```

Expected production short commit: `eee0264`.

---

## Inspect systemd timers

```bash
systemctl status swaperex-route-quote-smoke.timer --no-pager
systemctl status swaperex-route-quote-smoke.service --no-pager
systemctl list-timers --all | grep swaperex
journalctl -u swaperex-route-quote-smoke.service -n 100 --no-pager
```

Optional daily quote trends (not enabled by default):

```bash
systemctl status swaperex-quote-trend-report.timer --no-pager
```

---

## Run route/quote smoke manually

Read-only. No wallet. No transactions.

```bash
cd /root/Swaperex
node scripts/ops/p13-run-route-quote-smoke.mjs
# or certified P12.5 directly:
node scripts/audit/p12-5-route-quote-regression-smoke.mjs \
  --base-url https://dex.kobbex.com \
  --output reports/p12-5-route-quote-smoke.json
```

Latest envelope: `reports/p13/route-smoke/latest.json`  
Timestamped reports: `reports/p13/route-smoke/*.json`

---

## Run runtime warning monitor manually

Resource-heavy (browser). Run weekly or on demand.

```bash
cd /root/Swaperex
node scripts/audit/p12-4-runtime-warning-monitor.mjs --base-url https://dex.kobbex.com
node scripts/ops/p13-runtime-warning-trends.mjs --check
```

Baseline: `scripts/audit/config/p12-runtime-warning-baseline.json`

---

## Generate trend and status reports

```bash
cd /root/Swaperex
node scripts/ops/p13-quote-trend-report.mjs --window 7d \
  --output reports/p13/quote-trends/p13-quote-trends.json \
  --markdown reports/p13/quote-trends/p13-quote-trends.md

node scripts/ops/p13-runtime-warning-trends.mjs --window 7d

node scripts/ops/p13-production-status.mjs \
  --json reports/p13/status/p13-production-status.json \
  --markdown reports/p13/status/p13-production-status.md \
  --html reports/p13/status/p13-production-status.html
```

---

## Inspect latest reports

| Report | Path |
|--------|------|
| Latest smoke envelope | `reports/p13/route-smoke/latest.json` |
| Quote trends | `reports/p13/quote-trends/p13-quote-trends.json` |
| Runtime warnings | `reports/p13/runtime-warnings/p13-runtime-warning-trends.json` |
| Production status | `reports/p13/status/p13-production-status.json` |

---

## Validate report freshness

Smoke schedule: every **6 hours** (+ 30 min grace).

```bash
node -e "
const j=require('./reports/p13/route-smoke/latest.json');
const age=(Date.now()-new Date(j.timestamp))/3600000;
console.log('Age hours:', age.toFixed(2), 'Exit:', j.finalExitCode);
"
```

If age > 6.5h and timer is active, inspect journal and timer state.

---

## Transient provider failure vs app regression

| Signal | Likely cause | Action |
|--------|--------------|--------|
| Single run fail, HTTP-only errors | Production/RPC transient | Retry manually; do not rollback |
| Fail after 2 retries, required on-chain route | Quote regression | Preserve JSON, escalate SEV-2 |
| Browser route fail, on-chain pass | UI regression | Preserve JSON, escalate SEV-2 |
| `w3m-connecting-view: No connector provided` | P11 regression | SEV-2, incident runbook |
| Blank homepage | SEV-1 | Incident runbook |

Classification field in smoke envelope: `finalClassification`.

---

## Disable noisy timer safely

```bash
sudo systemctl stop swaperex-route-quote-smoke.timer
sudo systemctl disable swaperex-route-quote-smoke.timer
```

Document reason and timestamp. Re-enable when resolved:

```bash
sudo systemctl enable --now swaperex-route-quote-smoke.timer
```

---

## Report retention

Dry-run (default):

```bash
bash scripts/ops/p13-report-retention.sh --dry-run
```

Apply cleanup (30d raw JSON, 180d summaries; never deletes audit Markdown):

```bash
bash scripts/ops/p13-report-retention.sh --apply
```

---

## Release certification (no deploy)

```bash
bash scripts/release/p13-release-certify.sh --dry-run --pre-deploy
bash scripts/release/p13-release-certify.sh --pre-deploy
bash scripts/release/p13-release-certify.sh --post-deploy --base-url https://dex.kobbex.com
bash scripts/release/p13-change-scope-guard.sh --base eee0264
```

---

## Install / reinstall smoke timer

```bash
sudo cp ops/systemd/swaperex-route-quote-smoke.service /etc/systemd/system/
sudo cp ops/systemd/swaperex-route-quote-smoke.timer /etc/systemd/system/
sudo systemd-analyze verify ops/systemd/swaperex-route-quote-smoke.service
sudo systemctl daemon-reload
sudo systemctl enable --now swaperex-route-quote-smoke.timer
sudo systemctl start swaperex-route-quote-smoke.service
```

---

## Related documents

- Incident response: `docs/runbooks/SWAPEREX_INCIDENT_RESPONSE_RUNBOOK.md`
- P13 audits: `docs/audits/SWAPEREX_P13_*.md`
