# SWAPEREX P6 — Production Hardening Certification Report

**Date:** 2026-07-07  
**Production:** https://dex.kobbex.com  
**Scope:** Swaperex product only — deploy tooling + dex.kobbex.com validation

**Out of scope:** merchant/pay/appadmin/api.kobbex.com, Kobbopay, shared nginx reload/restart, payment backend infrastructure.

---

## Final Verdict

### SWAPEREX_P6_OPERATIONAL_READY_PASS_WITH_WARNINGS

---

## Executive Summary

| Item | Status |
|------|--------|
| P5 live on dex.kobbex.com | **YES** — commit `6aa5399` |
| Live validation (no redeploy) | **PASS** |
| Post-deploy certification | **PASS_WITH_WARNINGS** (informational nginx note) |
| Deploy script hardening | **COMMITTED** — no shared nginx reload |
| Infrastructure recovery | **NOT PERFORMED** (explicitly out of scope) |
| Redeploy performed | **NO** |

---

## P6 Deliverables

1. **`scripts/lib/nginx-deploy.sh`** — Informational nginx check only; **never** reloads shared nginx
2. **`scripts/prod-deploy.sh`** — Outcome classification; static rsync + dex.kobbex.com validation
3. **`scripts/safe-prod-deploy.sh`** — Post-deploy certification integration
4. **`scripts/audit/post-deploy-certification.sh`** — One-shot dex.kobbex.com certification
5. **`docs/operations/`** — Deployment, Recovery, Runtime Health runbooks (Swaperex-only scope)

---

## nginx Note (informational, not fixed by P6)

Historical P5 deploy log showed `nginx -t` failure when `/etc/nginx/nginx.conf` was missing on a shared host. **Swaperex P6 does not modify or reload shared nginx.** Static deploy to `/var/www/swaperex` does not require reload. Live truth: `verify-live.sh` on dex.kobbex.com.

---

## Live Validation (dex.kobbex.com)

| Check | Result |
|-------|--------|
| deploy-match.sh | PASS |
| verify-live.sh | PASS |
| verify-no-rpc-secrets-in-dist.sh | PASS |
| verify-no-sourcemaps-in-dist.sh | PASS |
| version.txt | `6aa5399` |

---

## Intentionally NOT Changed

- Swap/wallet/RPC/backend/contracts/signing logic
- Shared nginx configuration or reload
- Other Kobbex/Kobbopay products
- Production redeploy during P6

---

## Remaining Warnings

1. Manual wallet/mobile QA (P5 carry-forward)
2. Shared nginx state — out of Swaperex scope; dex.kobbex.com live checks are authoritative

---

## Next Step

Use hardened deploy tooling on next Swaperex frontend release:

```bash
./scripts/safe-prod-deploy.sh --dry-run
./scripts/safe-prod-deploy.sh
bash scripts/audit/post-deploy-certification.sh
```

*P6 — Swaperex operational readiness (deploy tooling only)*
