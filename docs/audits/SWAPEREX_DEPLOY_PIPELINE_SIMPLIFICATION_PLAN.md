# SWAPEREX — Deploy Pipeline Simplification Plan

**Status:** Plan only — not implemented in P7A  
**Date:** 2026-07-08  
**Context:** P5 deploy required static frontend rsync **plus** manual `swaperex-admin` restart

---

## Executive Summary

Swaperex deploy safety is strong; ergonomics are weak. Operators must know that `safe-prod-deploy.sh` ships **frontend only**, while admin API changes need a **separate backend restart**. This plan unifies the workflow without weakening gates.

---

## Current Pain Points

| Issue | Impact |
|-------|--------|
| Frontend-only deploy script | P5 UI live but API 404 until manual restart |
| No release-type detection | Operator must read `git diff` manually |
| Three frontend scripts | `safe-prod-deploy`, `prod-deploy`, `deploy-frontend` (legacy nginx reload) |
| Audits not in deploy gate | wrapper/pair/pytest run manually |
| Dry-run doc-stash gap | Untracked `docs/audits/` blocks dry-run without commit |
| Double `npm build` | Preflight + prod-deploy both build |
| Post-deploy ignores admin API | `verify-live` checks public health only |
| venv path split | `.venv` (dev) vs `venv` (systemd unit) |

---

## Why P5 Deploy Felt Hard

1. Release touched `src/swaperex/api/*` **and** `frontend/*`
2. `safe-prod-deploy.sh` succeeded for static assets
3. Intelligence API required `systemctl restart swaperex-admin`
4. Git gates blocked until push + clean tree (reports json, audit doc)
5. No single command expressed “deploy full P5”

---

## Frontend-Only vs Full-Stack

| Release type | Files | Actions |
|--------------|-------|---------|
| **Frontend-only** | `frontend/**`, static assets | rsync dist → `/var/www/swaperex` |
| **Admin API** | `src/swaperex/api/**`, Python deps | `git pull` on server + restart `swaperex-admin` |
| **Full-stack** | Both | Frontend deploy + admin restart |
| **Nginx** | `scripts/nginx/**` | Explicit approval; platform ops |
| **Swap-critical** | `useSwap`, wrappers, pairs, contracts | Block + extra certification |

---

## Proposed Script Structure

```
scripts/
  safe-prod-deploy.sh          # Orchestrator (single entry point)
  prod-deploy-frontend.sh      # Extracted from prod-deploy.sh
  prod-deploy-admin-api.sh     # NEW: pip install + systemctl restart + health
  lib/deploy-preflight.sh      # NEW: git gates, classify, audits
  audit/post-deploy-certification.sh  # Extended: admin API canary
```

### `safe-prod-deploy.sh` flags

```bash
./scripts/safe-prod-deploy.sh --dry-run           # Plan only
./scripts/safe-prod-deploy.sh                     # Auto-detect release type
./scripts/safe-prod-deploy.sh --frontend-only       # Force static only
./scripts/safe-prod-deploy.sh --with-admin-api      # Force full-stack
./scripts/safe-prod-deploy.sh --validate-only       # Audits, no deploy
```

### Release-type detection

Compare `git diff --name-only $(live_version_commit)..HEAD`:

- Frontend patterns → `frontend-only`
- `src/swaperex/api/` → `admin-api` or `full-stack`
- nginx patterns → require `--approve-nginx`
- swap-critical patterns → require `--approve-swap-certification` + forced audits

### Admin API restart automation (`prod-deploy-admin-api.sh`)

1. `cd /root/Swaperex && git pull --ff-only origin main`
2. `/root/Swaperex/venv/bin/pip install -e ".[dev]" --quiet`
3. `systemctl restart swaperex-admin.service`
4. Probe `http://127.0.0.1:8001/api/v1/health`
5. Write `admin-api-version.txt` alongside `version.txt`

### Post-deploy admin health checks

- Local: `127.0.0.1:8001/api/v1/health`
- Via nginx: `https://dex.kobbex.com/api/v1/admin/health` (401 without token = route exists)
- Canary (full-stack): `operator-intelligence` schema v3 with admin token from env

---

## Rollback Flow

```bash
git checkout <known-good-sha>
./scripts/safe-prod-deploy.sh --with-admin-api
```

Frontend-only rollback: redeploy prior `version.txt` commit static assets.  
Admin rollback: restart service at prior git SHA.  
No swap contract changes in intelligence releases — rollback is redeploy only.

---

## Scripts to Refactor Later (Priority)

| Priority | Task |
|----------|------|
| P0 | `prod-deploy-admin-api.sh` + orchestrator flags |
| P0 | Release-type detection in `deploy-preflight.sh` |
| P1 | Integrate wrapper/pair/pytest into preflight |
| P1 | Extend `post-deploy-certification.sh` for admin API |
| P1 | Fix dry-run doc-stash (stash in dry-run or allow untracked docs) |
| P2 | Remove double build |
| P2 | Deprecate `deploy-frontend.sh` nginx reload path |
| P2 | Document `venv` vs `.venv` in `docs/operations/DEPLOY_POLICY.md` |

---

## Recommended Deploy Policy

1. Always `git push origin main` before deploy  
2. Always `./scripts/safe-prod-deploy.sh --dry-run` first  
3. Auto-detect release type; use `--with-admin-api` when in doubt  
4. Never auto-reload shared nginx from Swaperex scripts  
5. Swap-critical changes require wrapper + pair audits + explicit approval  
6. Record deploy SHA in operations log  

**Canonical command (future):**

```bash
cd /root/Swaperex
./scripts/safe-prod-deploy.sh --dry-run && ./scripts/safe-prod-deploy.sh
```

---

*Plan only — implementation deferred to dedicated DevOps phase.*
