# Swaperex Incident Response Runbook

**Production:** https://dex.kobbex.com  
**Certified commit:** `eee0264`  
**Rollback floor:** `75b2ce7`

---

## Severity definitions

| Level | Examples |
|-------|----------|
| **SEV-1** | Production unavailable, blank screen, widespread quote failure, unsafe transaction behavior |
| **SEV-2** | Required route repeatedly failing, wallet connection regression, major latency degradation |
| **SEV-3** | Single-route transient failure, monitoring degradation, unclassified repeated warning |
| **SEV-4** | Vendor cosmetic warning, stale optional report, non-impacting telemetry noise |

Do **not** classify a single transient RPC failure as SEV-1/2.

---

## Workflow

### 1. Detection

Sources: scheduled smoke timer, manual smoke, production status `--check`, operator reports.

```bash
node scripts/ops/p13-production-status.mjs --check
journalctl -u swaperex-route-quote-smoke.service -n 200 --no-pager
```

### 2. Initial validation

```bash
curl -fsS https://dex.kobbex.com/version.txt
node scripts/ops/p13-run-route-quote-smoke.mjs
```

Compare with prior `reports/p13/route-smoke/latest.json`.

### 3. Evidence preservation

Preserve immediately (redact secrets/sessions):

- `version.txt` output
- Current git commit / deploy log
- Latest smoke JSON (`reports/p13/route-smoke/latest.json`)
- Warning report if relevant
- Status report
- `journalctl -u swaperex-route-quote-smoke.service`
- Exact UTC timestamps

Store copies under `docs/audits/raw/p13/incidents/YYYYMMDD-HHMM/`.

### 4. Severity assignment

Use table above. When uncertain, start at SEV-3 and escalate if repeated.

### 5. Production freeze

For SEV-1/2: **hold production at `eee0264`** — no deploy until root cause understood.

```text
HOLD_PRODUCTION_BASELINE_AT_eee0264
```

### 6. Rollback decision

Rollback floor: `75b2ce7`. Rollback requires **evidence of app-owned regression** or failed deployment — not a single external RPC timeout.

Rollback is **manual** via existing deploy scripts; this runbook does not auto-rollback.

### 7. Communication notes

Document: detection time, severity, affected routes, production commit, monitoring evidence paths, operator actions taken.

### 8. Mitigation

- Transient external: retry smoke; monitor next scheduled run
- App regression: fix on branch, run pre-deploy certification, deploy via `./scripts/safe-prod-deploy.sh` (operator only)
- Monitoring failure: fix timer/journal, re-run smoke manually

### 9. Verification

```bash
node scripts/ops/p13-run-route-quote-smoke.mjs
node scripts/ops/p13-production-status.mjs --check
bash scripts/release/p13-release-certify.sh --post-deploy --base-url https://dex.kobbex.com
```

Must show `HEALTHY` or acceptable `DEGRADED` with documented reason.

### 10. Closure

Update incident folder with resolution, commit deployed (if any), and close open incident count in status report.

### 11. Post-incident review

- Was classification correct?
- Should baseline/thresholds be updated?
- New baseline entries for vendor noise?

---

## Evidence checklist

- [ ] `version.txt`
- [ ] Smoke JSON (all attempts)
- [ ] Warning inventory JSON
- [ ] Production status JSON
- [ ] Service journal excerpt
- [ ] UTC timeline
- [ ] Secrets redacted

---

## Known regressions

| Fingerprint / symptom | Classification | Notes |
|-----------------------|----------------|-------|
| `w3m-connecting-view: No connector provided` | P11 connecting-view | SEV-2 |
| Blank swap surface | APP_FATAL / route | SEV-1 |
| Reown font preload | COSMETIC_RESOURCE_HINT | SEV-4 |

Baseline: `scripts/audit/config/p12-runtime-warning-baseline.json`

---

## Operator commands reference

See `docs/runbooks/SWAPEREX_PRODUCTION_OPERATIONS_RUNBOOK.md`.

---

## Escalation

SEV-1/2: preserve evidence, freeze deploys, notify release owner.  
SEV-3/4: log in monitoring notes; address in next maintenance window unless trending worse.
