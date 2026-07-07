# SWAPEREX P5 — Pre-Deploy Certification

**Certification date:** 2026-07-07  
**Production baseline:** `e145b22`  
**Release commit:** `a9e47e9` (`feat(dex): add hardened operator intelligence dashboard`)  
**Mode:** Dry-run and certification only — **no deploy performed**

---

## Executive Verdict

**`P5_PRE_DEPLOY_READY_WITH_WARNINGS`**

The P5 intelligence release (`a9e47e9`) passes all technical validation gates (build, wrapper audit, pair audit, pytest, swap isolation). Deploy automation dry-run did **not** complete due to operational prerequisites (unpushed commit, dirty worktree). The release artifact itself is certified; deploy is blocked until preflight gates are cleared.

---

## Commit Being Certified

| Field | Value |
|-------|-------|
| Hash | `a9e47e9e93dcffcdc7d2d573bb9e96ab15f897ca` |
| Parent | `e145b22` (direct descendant) |
| Files changed | 14 (+3,985 lines) |
| Scope | Admin-only intelligence (P5A + P5B + P5B.1) |

---

## Release Scope

**In scope:**

- `GET /api/v1/admin/operator-intelligence` (read-only; `persistDaily=false` default)
- Admin UI `/admin/intelligence` dashboard
- Decision support: recommendations, health score, trends, data confidence gating
- DB-limited monitoring scan (default 500, hard max 2000)

**Out of scope (unchanged):**

- Swap execution, wrappers, commission bps, pair allowlist, token contracts, provider selection, treasury routing, public swap UX

---

## Swap Isolation Proof

```bash
git diff --name-only e145b22..a9e47e9 | grep -E 'useSwap|SwapInterface|commissionCoverage|wrappers|tokens|contracts'
# → (empty)
```

Intelligence modules (`operator_intelligence.py`, `operator_decision_support.py`) are imported only from `admin_readonly.py`. No swap-path frontend or backend files modified.

---

## Validation Results

| Gate | Result | Notes |
|------|--------|-------|
| `git diff --check e145b22..a9e47e9` | WARN | Trailing whitespace in audit markdown docs only (non-blocking) |
| `npm --prefix frontend run build` | **PASS** | `AdminApp-CQyB2D41.js` (101.67 kB) includes intelligence route |
| `verify-wrappers.sh` | **PASS** | ETH 20 bps, BSC 50 bps, treasury unchanged |
| `audit-commission-pairs.mjs` | **PASS** | 126/126 |
| `.venv/bin/pytest` | **PASS** | 119 passed, 3 skipped |

---

## Dry-Run Deploy Result

```bash
./scripts/safe-prod-deploy.sh --dry-run
```

**Outcome:** FAILED at git preflight (exit 1)

```
ERROR: main is ahead of origin/main by 1 commit(s). Push first: git push origin main
```

**Additional deploy blockers (would fail on next gate):**

- Modified untracked-allowed path: `reports/commission-pair-audit-20260707.json` (generated audit artifact; not part of release)

**Dry-run script intent (when gates pass):**

1. Preflight `npm ci && npm run build` + dist audits (no RPC secrets, no sourcemaps)
2. `prod-deploy.sh`: rsync `frontend/dist/` → `/var/www/swaperex/` with `--delete`
3. Write `version.txt` with `commit=a9e47e9...`
4. Optional nginx informational check (no reload required for static assets)
5. `post-deploy-certification.sh`

**Confirmed from build artifact:**

- Admin bundle present: `frontend/dist/assets/AdminApp-CQyB2D41.js`
- No nginx config changes in release delta
- Rollback: redeploy `e145b22` via same script

---

## Files in Release Delta

| Status | Path |
|--------|------|
| A | `src/swaperex/api/operator_intelligence.py` |
| A | `src/swaperex/api/operator_decision_support.py` |
| M | `src/swaperex/api/routes/admin_readonly.py` |
| A | `frontend/src/components/admin/OperatorIntelligencePage.tsx` |
| M | `frontend/src/components/admin/AdminApp.tsx` |
| M | `frontend/src/admin/adminApi.ts` |
| A | `frontend/src/lib/analytics/operatorIntelligenceFormat.ts` |
| A/M | `tests/test_*.py` (3 files) |
| A | `docs/audits/SWAPEREX_P5*.md` (4 files) |

No file deletions in delta.

---

## Risks

1. **Unpushed commit** — deploy script refuses to run until `git push origin main`
2. **Dirty worktree** — `reports/commission-pair-audit-20260707.json` must be reverted or committed before deploy
3. **Backend not in static deploy** — `prod-deploy.sh` rsyncs frontend only; admin API (`app_admin` :8001) must be restarted separately if backend intelligence endpoints are not yet live on server
4. **Low telemetry** — dashboard shows `INSUFFICIENT_DATA` until ≥10 quotes in 7d (by design)
5. **rsync --delete** — removes stale assets from `/var/www/swaperex`; expected behavior, not data loss

---

## Deployment Checklist (when approved)

- [ ] `git push origin main` (publish `a9e47e9`)
- [ ] Clean worktree: `git checkout -- reports/commission-pair-audit-20260707.json` or commit separately
- [ ] `./scripts/safe-prod-deploy.sh --dry-run` → must exit 0
- [ ] `./scripts/safe-prod-deploy.sh` → deploy static assets
- [ ] Verify `https://dex.kobbex.com/version.txt` shows `short=a9e47e9`
- [ ] Verify `https://dex.kobbex.com/admin/intelligence` loads (admin token)
- [ ] Restart `app_admin` on server if backend endpoints not yet serving P5 API
- [ ] Confirm plain GET does not write DB; optional `?persistDaily=true` once daily

---

## Rollback Checklist

- [ ] `git checkout e145b22 && git push origin main` (if needed)
- [ ] `./scripts/safe-prod-deploy.sh` from `e145b22`
- [ ] Verify `version.txt` shows `short=e145b22`
- [ ] Swap path unaffected — no contract or wrapper changes in P5 release

---

## Deployment Command (do not run until approved)

```bash
cd /root/Swaperex
git push origin main
git checkout -- reports/commission-pair-audit-20260707.json
./scripts/safe-prod-deploy.sh --dry-run
./scripts/safe-prod-deploy.sh
```

---

*End of P5 Pre-Deploy Certification.*
