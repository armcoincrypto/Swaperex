# SWAPEREX P11.1 — Production Deploy Certification

**Date:** 2026-07-10T00:17:49Z  
**Deployed commit:** `eee0264170875fd7c92bf5a92f4420603d526e3d`  
**Previous production:** `2842638` (P10 console SVG polish)  
**Live URL:** https://dex.kobbex.com  
**Verdict:** `P11_1_PRODUCTION_DEPLOY_PASS`

---

## 1. Deploy scope

| Commit | Description |
|--------|-------------|
| `eee0264` | P11 WalletConnect sanitization — AppKit persisted-state cleanup + modal error guard |

**Included files:**

| File | Change |
|------|--------|
| `frontend/src/services/wallet/sanitizeAppKitPersistedState.ts` | Clears stale injected connector IDs before `createAppKit` |
| `frontend/src/services/wallet/appkit.ts` | Calls sanitizer; `enableEIP6963: false`, `enableCoinbase: false` |
| `frontend/src/components/wallet/WalletBootstrap.tsx` | `AppKitModalErrorGuard` closes modal on stale connecting-view error |
| `frontend/src/services/wallet/__tests__/sanitizeAppKitPersistedState.test.ts` | Unit tests (2 PASS) |
| `docs/audits/SWAPEREX_P11_POST_UPGRADE_VALIDATION.md` | P11 investigation + pre-deploy verdict |

**Excluded:** No swap logic, quote math, routing, contracts/wrappers, commission catalog, or P9 homepage design changes.

**Rollback floor:** `75b2ce7` (unchanged per operator policy).

---

## 2. Pre-deploy gates

| Gate | Result |
|------|--------|
| `git status --short` | Clean after commit `eee0264` |
| `git log --oneline -3` | `eee0264` HEAD; prior `2842638` |
| `git push origin main` | Success |
| `npm --prefix frontend run build` | PASS |
| `scripts/audit/verify-wrappers.sh` | ALL CHECKS PASSED |
| `node scripts/audit/audit-commission-pairs.mjs` | PASS 126 / FAIL 0 / SKIP 0 |
| `.venv/bin/pytest` | PASS 119 / skip 3 |
| `sanitizeAppKitPersistedState.test.ts` | 2 passed |
| `./scripts/safe-prod-deploy.sh` | **DEPLOY_SUCCESS** |

---

## 3. Deploy artifacts

| Field | Value |
|-------|-------|
| Entry bundle | `/assets/index-CAuc3Fe-.js` |
| CSS | `/assets/index-YnMWk6U9.css` |
| TradeShell | `/assets/TradeShell-Dq6-AV6S.js` |
| WalletBootstrap | `/assets/WalletBootstrap-q9HtDbDy.js` |
| Reown vendor | `/assets/vendor-reown-walletconnect-C5lCJnV-.js` |
| Deploy dir | `/var/www/swaperex` |
| `version.txt` | `commit=eee0264`, `deployed=2026-07-10T00:17:49Z` |
| Method | `./scripts/safe-prod-deploy.sh` → rsync |
| Log | `scripts/logs/prod-deploy.2026-07-10_021557.log` |

Post-deploy certification: **POST_DEPLOY_CERTIFICATION_PASS**

---

## 4. Production verification

| Check | Result |
|-------|--------|
| `https://dex.kobbex.com/` | HTTP **200** |
| `/version.txt` | `short=eee0264`, `branch=main` |
| `POST /rpc/eth` `eth_chainId` | **200** → `0x1` |
| `/api/health` | HTTP **200** |
| `/api/v1/health` | HTTP **200** |
| deploy-match (local dist vs live) | PASS |
| Headless browser smoke (Chromium) | **PASS** — full SPA shell, `Connect Wallet` CTA, no fatal runtime text |
| ETH → USDT quote (audit script) | **PASS** — 0.01 ETH → ~17.41 USDT, `uniswap-v3-wrapper-v2`, 20 bps |
| WETH → USDT quote (audit script) | **PASS** — same wrapper path |
| P10 SVG patch retained | **PASS** — `inherit:"100%"` in live Reown vendor bundle |
| P11 sanitizer in live bundle | **PASS** — `swaperex_last_connector`, `enableEIP6963`, `enableCoinbase` in `WalletBootstrap` |
| P11 modal error guard in live bundle | **PASS** — `w3m-connecting-view: No connector provided` handler string present |
| No blank screen | **PASS** — `#root` hydrated with homepage content |
| No TDZ / chunk crash | **PASS** — entry + WalletBootstrap chunks HTTP 200; no `Uncaught Error` in headless smoke |

### Wallet connect (interactive)

| Check | Result |
|-------|--------|
| Modal opens | **PENDING_OPERATOR** (requires WalletConnect QR / mobile wallet) |
| Back from connecting view | **PENDING_OPERATOR** (fix deployed; operator session with stale injected state recommended) |
| Disconnect | **PENDING_OPERATOR** |
| Reconnect | **PENDING_OPERATOR** |

Code-path and bundle fingerprints confirm P11 fix is live. Interactive wallet flows cannot be fully automated in the agent environment (no signing wallet / WC pairing).

### External warnings (may remain — non-actionable)

- `ObjectMultiplex - orphaned data` (MetaMask extension)
- `MaxListenersExceededWarning` from `contentscript.js` (extension)
- WalletConnect pulse `ERR_CONNECTION_CLOSED` (vendor network)
- Reown font preload unused warnings (vendor)

---

## 5. Constraints preserved

| Area | Status |
|------|--------|
| Swap / quote logic | Unchanged |
| Routing | Unchanged |
| Contracts / wrappers | Unchanged |
| Commission catalog | Unchanged |
| P9 homepage design | Unchanged |
| P10 SVG console polish | Retained on live vendor bundle |
| Rollback floor `75b2ce7` | Retained |

---

## 6. Rollback status

**No rollback performed.**

If P11.1 must be reverted:

1. `git revert eee0264` (or checkout `2842638` for P10-only state)
2. Rebuild + `./scripts/safe-prod-deploy.sh`
3. Confirm `version.txt` shows target commit

---

## SWAPEREX_P11_1_PRODUCTION_DEPLOY_REPORT

```yaml
phase: P11.1
title: Safe Production Deploy — WalletConnect Sanitization
verdict: P11_1_PRODUCTION_DEPLOY_PASS
deployed_commit: eee0264
previous_production: 2842638
rollback_floor: 75b2ce7
deployed_at: 2026-07-10T00:17:49Z
deploy_outcome: DEPLOY_SUCCESS
post_deploy_cert: POST_DEPLOY_CERTIFICATION_PASS
rollback_status: NONE
live_checks:
  site_load: PASS
  version_txt: PASS
  rpc_eth: PASS
  health_endpoints: PASS
  headless_browser_smoke: PASS
  eth_usdt_quote_audit: PASS
  weth_usdt_quote_audit: PASS
  p10_svg_patch_live: PASS
  p11_sanitizer_live: PASS
  p11_modal_error_guard_live: PASS
  no_blank_screen: PASS
  no_tdz_crash: PASS
  wallet_connect_modal_open: PENDING_OPERATOR
  wallet_back_from_connecting: PENDING_OPERATOR
  wallet_disconnect: PENDING_OPERATOR
  wallet_reconnect: PENDING_OPERATOR
gates:
  build: PASS
  verify_wrappers: PASS
  commission_pairs: PASS (126/126)
  pytest: PASS (119 passed, 3 skipped)
  sanitize_unit_tests: PASS (2/2)
external_warnings_may_remain: true
```
