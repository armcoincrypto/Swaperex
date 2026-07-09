# SWAPEREX P10.1 — Production Deploy Certification

**Date:** 2026-07-09T21:58:38Z  
**Deployed commit:** `2842638d69d4c447a01406409e37906244ec3bc6`  
**Previous production:** `75b2ce7` (P9.3/P9.4 — **rollback floor retained**)  
**Live URL:** https://dex.kobbex.com  
**Verdict:** `P10_1_PRODUCTION_DEPLOY_PASS`

---

## 1. Deploy scope

| Commit | Description |
|--------|-------------|
| `2842638` | P10 console SVG polish — Reown `wui-icon` phosphor size build patch |

**Included:** `frontend/vite/plugins/patchReownWuiIconPhosphorSize.ts`, `frontend/vite.config.ts` wiring, P10 audit doc.

**Excluded:** No swap logic, wallet connectors, contracts, routing, commission logic, or P9 homepage design changes.

**Rollback floor:** `75b2ce7` (unchanged per operator policy).

---

## 2. Pre-deploy gates

| Gate | Result |
|------|--------|
| `git status --short` | Clean after commit `2842638` |
| `git log --oneline -8` | `2842638` HEAD; floor `75b2ce7` at `75b2ce7` |
| `git push origin main` | `de7b560..2842638` |
| `npm --prefix frontend run build` | PASS |
| `verify-wrappers.sh` | ALL CHECKS PASSED |
| `audit-commission-pairs.mjs` | PASS 126 / FAIL 0 |
| `.venv/bin/pytest` | PASS 119 / skip 3 |
| `safe-prod-deploy.sh` | **DEPLOY_SUCCESS** |

---

## 3. Deploy artifacts

| Field | Value |
|-------|-------|
| Entry bundle | `/assets/index-BuKGRHZY.js` |
| CSS | `/assets/index-YnMWk6U9.css` |
| TradeShell | `/assets/TradeShell-B3gZikKq.js` |
| Reown vendor | `/assets/vendor-reown-walletconnect-C5lCJnV-.js` |
| Lit property chunk | `/assets/property-C9JG5tag.js` (runtime only) |
| Deploy dir | `/var/www/swaperex` |
| `version.txt` | `commit=2842638`, `deployed=2026-07-09T21:58:38Z` |
| Method | `./scripts/safe-prod-deploy.sh` → `prod-deploy.sh` (rsync) |
| Log | `scripts/logs/prod-deploy.2026-07-09_235654.log` |

Post-deploy certification: **POST_DEPLOY_CERTIFICATION_PASS**

---

## 4. Production verification

| Check | Result |
|-------|--------|
| `https://dex.kobbex.com/` | HTTP **200** |
| `/version.txt` | `short=2842638`, `branch=main` |
| `POST /rpc/eth` `eth_chainId` | **200** → `0x1` |
| `/api/health` | HTTP **200** |
| `/api/v1/health` | HTTP **200** |
| deploy-match (local dist vs live) | PASS |
| Live Reown patch present | `inherit:"100%"` phosphor size map in vendor bundle |
| Old broken binding absent | No `getPhosphorSize[this.size]` in live vendor chunk |
| ETH → USDT quote (audit script) | **PASS** — 0.01 ETH → ~17.45 USDT, `uniswap-v3-wrapper-v2`, 20 bps |
| WETH → USDT quote (audit script) | **PASS** — same wrapper path |

### Console SVG fix (static + structural)

Pre-P10 live bundle bound `size=""` on Phosphor icons when `wui-icon` used `size="inherit"`, producing:

```text
Error: <svg> attribute width: Unexpected end of attribute. Expected length, "".
```

Post-P10 live bundle uses conditional phosphor sizing (`inherit → 100%` or omit attribute). **No `width=""` / `height=""` SVG binding path remains in the patched wui-icon render branch.**

Runtime browser console confirmation: **recommended on operator session** (connect affordance renders Reown icons). Automated Playwright unavailable after deploy `npm ci` (devDependency stripped).

### Wallet connect

| Check | Result |
|-------|--------|
| Real wallet connect in browser | **PENDING_OPERATOR** (extension / WalletConnect — not automated in agent environment) |

### External warnings (may remain — non-actionable)

- `ObjectMultiplex - orphaned data` (MetaMask extension)
- `MaxListenersExceededWarning` from `contentscript.js` (extension)
- Reown font preload unused warnings (vendor)

---

## 5. Constraints preserved

| Area | Status |
|------|--------|
| Swap / quote logic | Unchanged |
| Wallet logic | Unchanged |
| Contracts / wrappers | Unchanged |
| Routing | Unchanged |
| P9 homepage design | Unchanged |
| Rollback floor `75b2ce7` | Retained |

---

## 6. Rollback procedure

If P10 must be reverted:

1. `git checkout 75b2ce7 -- frontend/vite.config.ts` (remove plugin dir)
2. Rebuild + `./scripts/safe-prod-deploy.sh`
3. Confirm `version.txt` shows `75b2ce7`

---

## SWAPEREX_P10_1_PRODUCTION_DEPLOY_REPORT

```yaml
phase: P10.1
title: Safe Production Deploy — Console SVG Polish
verdict: P10_1_PRODUCTION_DEPLOY_PASS
deployed_commit: 2842638
previous_production: 75b2ce7
rollback_floor: 75b2ce7
deployed_at: 2026-07-09T21:58:38Z
deploy_outcome: DEPLOY_SUCCESS
post_deploy_cert: POST_DEPLOY_CERTIFICATION_PASS
live_checks:
  site_load: PASS
  version_txt: PASS
  rpc_eth: PASS
  health_endpoints: PASS
  eth_usdt_quote_audit: PASS
  svg_patch_in_live_bundle: PASS
  wallet_connect_browser: PENDING_OPERATOR
gates:
  build: PASS
  verify_wrappers: PASS
  commission_pairs: PASS (126/126)
  pytest: PASS (119 passed, 3 skipped)
external_warnings_may_remain: true
```
