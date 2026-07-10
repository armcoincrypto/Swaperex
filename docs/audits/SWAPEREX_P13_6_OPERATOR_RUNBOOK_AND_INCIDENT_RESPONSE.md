# SWAPEREX P13.6 — Operator Runbook and Incident Response

**Verdict:** `P13_6_RUNBOOKS_PASS`  
**Date:** 2026-07-10 UTC

---

## Deliverables

| Document | Path |
|----------|------|
| Production operations | `docs/runbooks/SWAPEREX_PRODUCTION_OPERATIONS_RUNBOOK.md` |
| Incident response | `docs/runbooks/SWAPEREX_INCIDENT_RESPONSE_RUNBOOK.md` |

---

## Coverage

Operations runbook includes:

- Production version check
- Timer/service inspection
- Manual smoke and warning monitor
- Health status generation
- Report paths and freshness validation
- Transient vs regression distinction
- Timer disable/re-enable
- Retention dry-run/apply
- Release certification commands
- Systemd install commands

Incident runbook includes:

- SEV-1 through SEV-4 definitions
- Detection → closure workflow
- Rollback rules (`75b2ce7` floor, no auto-rollback on single RPC fail)
- Evidence checklist with redaction notes
- Known regression fingerprints

All commands verified against actual script paths in repository.

---

## Rollback policy

Hold production at `eee0264` unless evidence proves app-owned regression or failed deployment. Rollback to floor `75b2ce7` is manual operator action only.
