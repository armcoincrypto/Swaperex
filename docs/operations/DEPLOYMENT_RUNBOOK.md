# Swaperex Production Deployment Runbook

**Product scope:** Swaperex only  
**Production:** https://dex.kobbex.com  
**Deploy directory:** `/var/www/swaperex`  
**Branch:** `main` only

**Out of scope:** merchant.kobbex.com, pay.kobbex.com, appadmin.kobbex.com, api.kobbex.com, Kobbopay, Kobbex admin/merchant/pay, shared nginx reload/restart, payment backend infrastructure.

---

## Normal deploy flow

1. **Commit and push** all changes to `origin/main`.
2. **Dry-run first** (mandatory):

   ```bash
   cd /root/Swaperex
   ./scripts/safe-prod-deploy.sh --dry-run
   ```

3. **Real deploy** (operator only, after dry-run passes):

   ```bash
   ./scripts/safe-prod-deploy.sh
   ```

4. **Post-deploy certification:**

   ```bash
   bash scripts/audit/post-deploy-certification.sh
   ```

5. **Confirm outcome** in `scripts/logs/prod-deploy.*.log`:
   - `DEPLOY_SUCCESS` — assets synced, dex.kobbex.com validation pass
   - `DEPLOY_SUCCESS_WITH_WARNINGS` — assets synced, live checks pass, informational nginx note only
   - `DEPLOY_FAILED` — investigate before retry

---

## What Swaperex deploy does

| Step | Action |
|------|--------|
| Build | `frontend/dist` from repo |
| Sync | `rsync` → `/var/www/swaperex` |
| version.txt | Written to deploy dir |
| nginx | **Skipped** — no reload, no restart, no config edits |
| Validate | `deploy-match.sh`, `verify-live.sh` |

Static files are served directly from `/var/www/swaperex`. **No nginx reload is required** for frontend-only deploys.

---

## Post-deploy validation (dex.kobbex.com)

| Script | Purpose |
|--------|---------|
| `scripts/audit/deploy-match.sh` | Local dist matches `/var/www/swaperex` |
| `scripts/audit/verify-live.sh` | HTTPS 200 for dex.kobbex.com, health JSON, version.txt |
| `scripts/audit/verify-no-rpc-secrets-in-dist.sh` | No forbidden RPC patterns in dist |
| `scripts/audit/verify-no-sourcemaps-in-dist.sh` | No source maps in dist |
| `scripts/audit/post-deploy-certification.sh` | One-shot wrapper |

---

## DEPLOY_SUCCESS_WITH_WARNINGS

Means rsync + dex.kobbex.com live validation passed, with an informational note (e.g. shared nginx conf path unreadable).

**Do not redeploy** to clear this if `post-deploy-certification.sh` and `verify-live.sh` pass.

**Do not** run `systemctl reload nginx` or edit `/etc/nginx/*` from Swaperex deploy tooling — shared host serves other products.

If dex.kobbex.com itself fails live checks, use RECOVERY_RUNBOOK.md (static asset recovery only).

---

## What not to redeploy for

| Situation | Swaperex action |
|-----------|-----------------|
| Shared nginx issues on other hosts | Out of scope — do not touch from Swaperex |
| nginx `-t` fails but dex.kobbex.com OK | No redeploy; live validation is source of truth |
| Manual wallet/mobile QA pending | QA only |
| Backend API issue | Fix signals/backend — frontend redeploy won't help |

---

## Script reference

| Script | Role |
|--------|------|
| `scripts/safe-prod-deploy.sh` | Gated wrapper: preflight + prod-deploy + certification |
| `scripts/prod-deploy.sh` | Build, rsync, skip nginx reload, live checks |
| `scripts/lib/nginx-deploy.sh` | Informational only — never reloads shared nginx |

---

## version.txt

```bash
curl -sS https://dex.kobbex.com/version.txt
```
