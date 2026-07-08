# SWAPEREX P8D — Production Deploy Certification

**Date:** 2026-07-08  
**Previous production:** `14cbf64`  
**Deployed commit:** `ff6460d`  
**Deployed at:** `2026-07-08T22:12:45Z` (UTC)  
**Verdict:** **P8D_DEPLOYMENT_PASS_WITH_WARNINGS**

---

## 1. Stack deployed (P8A)

| Phase | Commit area | Description |
|-------|-------------|-------------|
| P8A.0 | `e97d752` | Wallet constants cycle fix (`@/wallet/chains` leaf import) |
| P8A.2 | `22c6709` | PassiveShell route branch |
| P8A.3 | `b3c60d3` | Lazy TradeShell boundary (static SwapInterface inside) |
| P8B/P8C | docs | QA matrix + deploy gate |
| P8D | this deploy | Production release |

**Not deployed:** P7C lazy SwapInterface (reverted; must not reapply).

---

## 2. Pre-deploy validation

| Gate | Result |
|------|--------|
| `git diff --check` | Pass |
| `npm --prefix frontend run build` | Pass |
| `verify-wrappers.sh` | ALL CHECKS PASSED |
| Pair audit | PASS 126 / FAIL 0 / BLOCKED 0 |
| pytest | 119 passed, 3 skipped |
| `safe-prod-deploy.sh --dry-run` | Pass |

---

## 3. Deployment

```bash
./scripts/safe-prod-deploy.sh
```

| Field | Value |
|-------|--------|
| Method | `scripts/safe-prod-deploy.sh` → `scripts/prod-deploy.sh` |
| Live entry | `/assets/index-hFn7D74P.js` (~54 KB) |
| Trade chunk | `TradeShell-ByTLXYOT.js` (~412 KB) |
| `version.txt` | `short=ff6460d`, `deployed=2026-07-08T22:12:45Z` |
| Post-deploy cert | `POST_DEPLOY_CERTIFICATION_PASS_WITH_WARNINGS` (shared nginx conf note only) |

---

## 4. Production HTTP verification

| URL | Status |
|-----|--------|
| `https://dex.kobbex.com/` | 200 |
| `/trust` | 200 |
| `/about` | 200 |
| `/privacy` | 200 |

`index.html` modulepreload: `vendor-react` only — **no ethers modulepreload** on cold HTML.

---

## 5. Runtime verification (Playwright, live)

| Path | `#root > *` | pageerror | TradeShell | ethers |
|------|-------------|-----------|------------|--------|
| `/` | 1 | none | yes | yes |
| `/trust` | 1 | none | no | no |
| `/about` | 1 | none | no | no |
| `/privacy` | 1 | none | no | no |
| `/disclaimer` | 1 | none | no | no |
| `/trust` → Open swap | 1 | none | loads after nav | loads after nav |

No blank screen. No TDZ. No fatal console errors on automated paths.

---

## 6. Operator wallet verification (manual)

Per operator sign-off before deploy:

| Check | Result |
|-------|--------|
| Connect wallet | PASS |
| Refresh `/` | PASS |
| `/trust` | PASS |
| `/trust` → trade | PASS |
| Trade → `/trust` | PASS |
| Quote only (no swap) | PASS |
| Reconnect regression | None observed |

---

## 7. Observation window

| Time | Check | Result |
|------|-------|--------|
| T+0 | Deploy + verify-live | LIVE OK |
| T+30s | version.txt + verify-live | Unchanged `ff6460d`, LIVE OK |

No 404 assets, chunk failures, or blank screens observed in observation sample.

---

## 8. Rollback readiness

**Trigger:** blank page, TDZ, chunk load failure, wallet connect/reconnect broken.

**Method:** Redeploy previous static artifact for commit `14cbf64` via `safe-prod-deploy.sh` from that tree (or restore `/var/www/swaperex` backup if available).

**Do not:** rollback via P7C lazy SwapInterface.

---

## 9. Warnings

- Post-deploy nginx conf path note (informational; out of Swaperex static deploy scope).
- Full 15–30 min operator monitoring recommended for first hour; automated sample was 30s.

---

## 10. Final recommendation

```text
P8A stack LIVE at ff6460d — deployment certified with warnings.
Monitor wallet/reconnect in first production hour.
No further deploy action required unless regression reported.
```

*End of P8D certification.*
