# SWAPEREX P13.5 — Release Certification Pipeline

**Verdict:** `P13_5_RELEASE_CERTIFICATION_PIPELINE_PASS`  
**Date:** 2026-07-10 UTC

---

## Summary

Deterministic pre-deploy and post-deploy certification workflow using existing validated gates. **No production deployment performed during P13.**

---

## Change scope guard

`scripts/release/p13-change-scope-guard.sh`

```bash
bash scripts/release/p13-change-scope-guard.sh
bash scripts/release/p13-change-scope-guard.sh --base eee0264
bash scripts/release/p13-change-scope-guard.sh --json reports/p13/release-certification/p13-change-scope.json
```

Sensitive paths (contracts, quote/swap/commission logic, wallet, deploy config) trigger `EXPLICIT_HIGH_RISK_REVIEW` (exit 3).

Current diff vs `eee0264`: ops/scripts/docs only — **guard PASS**.

---

## Certification runner

`scripts/release/p13-release-certify.sh`

```bash
bash scripts/release/p13-release-certify.sh --dry-run --pre-deploy
bash scripts/release/p13-release-certify.sh --pre-deploy
bash scripts/release/p13-release-certify.sh --post-deploy --base-url https://dex.kobbex.com
```

Pre-deploy gates: git state, frontend build, wrapper verification, commission audit, pytest, Vitest (sanitizeAppKitPersistedState), dependency monitor, change scope guard.

Post-deploy gates: version.txt, route/quote smoke, runtime warning monitor (warn-only).

---

## Verdicts

| Verdict | Meaning |
|---------|---------|
| RELEASE_CERTIFICATION_PASS | All required gates pass |
| RELEASE_CERTIFICATION_PASS_WITH_WARNINGS | Non-blocking warnings |
| RELEASE_CERTIFICATION_REQUIRES_HIGH_RISK_REVIEW | Sensitive path changes |
| RELEASE_CERTIFICATION_FAIL | Required gate failed |

Dry-run validation: **RELEASE_CERTIFICATION_PASS**

---

## Reports

`reports/p13/release-certification/certify-*.log`
