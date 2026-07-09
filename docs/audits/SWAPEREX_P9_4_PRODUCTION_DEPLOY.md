# SWAPEREX P9.4 — Production Deploy Certification

**Date:** 2026-07-09T14:49:13Z  
**Deployed commit:** `75b2ce7acc996b769e816985eee2565c1edf0c85`  
**Previous production:** `ff6460d` (P8D rollback floor)  
**Live URL:** https://dex.kobbex.com  
**Verdict:** `P9_4_PRODUCTION_DEPLOY_PASS`

---

## 1. Deploy scope

| Commit | Description |
|--------|-------------|
| `c67521f` | P9 homepage trust layer |
| `aebca66` | P9.1 preview QA certification doc |
| `ddeb67f` | P9.2 route copy consistency |
| `75b2ce7` | P9.3 localhost RPC proxy skip + audit |

**Included:** P9 homepage UX, P9.2 audited-route copy, P9.3 RPC config (production hostname unchanged).

**Excluded:** No swap logic, contract, or wrapper changes.

---

## 2. Pre-deploy gates

| Gate | Result |
|------|--------|
| `git status` | Clean (reports cleaned pre-push) |
| `git push origin main` | `7c0532b..75b2ce7` |
| `npm --prefix frontend run build` | PASS |
| `verify-wrappers.sh` | PASS |
| `audit-commission-pairs.mjs` | PASS 126 / 0 / 0 |
| `.venv/bin/pytest` | PASS 119 / skip 3 |
| `safe-prod-deploy.sh` | **DEPLOY_SUCCESS** |

---

## 3. Deploy artifacts

| Field | Value |
|-------|-------|
| Entry bundle | `/assets/index-CWm0pkZv.js` |
| CSS | `/assets/index-YnMWk6U9.css` |
| TradeShell | `/assets/TradeShell-CLtPU4Vn.js` |
| Deploy dir | `/var/www/swaperex` |
| `version.txt` | `commit=75b2ce7`, `deployed=2026-07-09T14:49:13Z` |
| Method | `./scripts/safe-prod-deploy.sh` → `prod-deploy.sh` (rsync) |

---

## 4. Post-deploy verification

### HTTP / routes

| Route | HTTP | Notes |
|-------|------|-------|
| `/` | 200 | Entry `index-CWm0pkZv.js` |
| `/trust` | 200 | Passive route |
| `/about` | 200 | Passive route |
| `/privacy` | 200 | Passive route |
| `/disclaimer` | 200 | Passive route |
| `/api/v1/health` | 200 | `status: ok` |
| `/rpc/eth` POST | 200 | `eth_chainId → 0x1` |

### P9 homepage (live bundle)

Confirmed in `TradeShell-CLtPU4Vn.js`:

- `homepage-trust-strip`
- `homepage-protocol-stats`
- `homepage-why-swaperex`
- `homepage-popular-routes`
- `Self-Custody`, `Why Swaperex`

### Quote routing (read-only, no approve/sign)

Via production `/rpc/eth` proxy + wrapper V2 `0x660B2E98…`:

| Pair | Result |
|------|--------|
| ETH → USDT (0.01) | PASS — ~17.38 USDT out |
| WETH → USDT (0.01) | PASS — ~17.38 USDT out |
| Pair audit ETH/USDT | PASS — `uniswap-v3-wrapper-v2`, 20 bps |
| Pair audit WETH/USDT | PASS — `uniswap-v3-wrapper-v2`, 20 bps |

### Automated limitations

| Check | Result |
|-------|--------|
| Real wallet connect in browser | **Not automated** (requires operator extension/WalletConnect) |
| UI “Quote ready” banner | Inferred from RPC + pair audit PASS; operator pre-deploy confirmed on production |
| TDZ / blank `#root` | No errors in deploy certification; routes return 200 + assets load |

---

## 5. Rollback plan

| Trigger | Action |
|---------|--------|
| P9 regression | Redeploy `ff6460d` via `./scripts/safe-prod-deploy.sh` after checkout |
| Severe incident | Rollback floor `ff6460d`; never P7C lazy SwapInterface rollback |

---

## 6. Known warnings (unchanged)

- WalletConnect/Reown SDK console noise (external)
- Large `vendor-reown-walletconnect` chunk advisory
- Nginx shared-host note (Swaperex static deploy only — no reload)

---

## 7. Final verdict

```text
P9_4_PRODUCTION_DEPLOY_PASS
```

Production live at `75b2ce7`. All automated gates and read-only quote checks pass. Operator should confirm wallet connect + UI quote banner on next session (no swap execution required).
