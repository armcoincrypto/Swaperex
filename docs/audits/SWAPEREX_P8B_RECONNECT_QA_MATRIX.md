# SWAPEREX P8B — Reconnect QA Matrix

**Date:** 2026-07-08  
**Code under test:** `b3c60d3` (P8A.0 + P8A.2 + P8A.3 on `main`)  
**Production live:** Still `14cbf64` (P8A not deployed)  
**Mode:** QA certification only — no behavior changes in this commit

---

## 1. What was tested

| # | Scenario | Method | Result |
|---|----------|--------|--------|
| 1 | Open `/` | Playwright + network | TradeShell + ethers load; Connect Wallet + Swap UI present |
| 2 | Open `/trust` | Playwright + network | Trust Center; **no** TradeShell / ethers / reown vendor |
| 3 | `/trust` → Open swap → `/` | Playwright click + network | TradeShell + ethers fetch **after** nav; swap UI renders |
| 4 | Connect wallet on `/` | Manual (operator) | **Pending operator** — headless cannot approve wallet |
| 5 | Refresh `/` | Playwright reload | Hydrates; wallet chrome present; no pageerror |
| 6 | Open `/trust` after prior connect | Manual (operator) | **Pending operator** — no forced wallet UI expected |
| 7 | Navigate back to `/` after (6) | Manual (operator) | **Pending operator** |
| 8 | Console / pageerror | Playwright | **Zero** fatal / TDZ on all automated paths |
| 9 | Passive network | Playwright requestfinished | Passive paths do not fetch TradeShell or ethers |

Code continuity check (no edits): `TradeShell` still mounts `useWallet`, `hasWalletConnectStorageHint`, `subscribeWalletBootstrapRequest` when the trade chunk loads (unchanged from former DexMain).

---

## 2. Automated smoke results

Environment: `serve dist` on `127.0.0.1:4173`, Chromium snap + `--no-sandbox`.

### Cold loads

| Path | `#root > *` | pageerror | TradeShell | ethers | Notes |
|------|-------------|-----------|------------|--------|-------|
| `/` | 1 | none | yes | yes | Connect Wallet visible; Swap UI |
| `/trust` | 1 | none | no | no | Trust Center copy |
| `/about` | 1 | none | no | no | About page |
| `/terms` | 1 | none | no | no | Terms |
| `/privacy` | 1 | none | no | no | Privacy |
| `/disclaimer` | 1 | none | no | no | Disclaimer |

On `/`, `WalletConnect-*.js` (~11 KB UI chunk) may load with TradeShell when header wallet gating applies — this is **not** the ~2.5 MB `vendor-reown-walletconnect` until AppKit connect/bootstrap runs.

### `/trust` → Open swap

| Stage | TradeShell | ethers |
|-------|------------|--------|
| On `/trust` | false | false |
| After Open swap → `/` | true | true |

URL became `http://127.0.0.1:4173/`; swap chrome + Connect Wallet rendered; errors: `[]`.

### `/` reload

`rootChildren: 1`, wallet chrome present, errors: `[]`.  
Full session restore with a live wallet was **not** exercised in headless.

---

## 3. Manual wallet smoke checklist (operator)

Complete on preview/`main` build **before** production deploy approval:

- [ ] Connect injected / WalletConnect on `/` — modal opens, terms gate if applicable
- [ ] Complete a **read-only** connect (or full connect) and confirm address shows in header
- [ ] Hard refresh `/` — session restores or reconnect path matches pre-P8A behavior
- [ ] With active session, open `/trust` — page loads, **no** crash, no forced wallet modal
- [ ] From `/trust`, Open swap — returns to trade UI still connected / restores cleanly
- [ ] Stale `swaperex_last_connector=walletconnect` localStorage (if available) — TradeShell mount still restores without blank `#root`
- [ ] Disconnect then reconnect once — no toast loops / blank shell

---

## 4. Passive route network result

```text
Cold /trust|/about|/terms|/privacy|/disclaimer:
  fetch TradeShell-*.js → NO
  fetch vendor-ethers-*.js → NO
  modulepreload on index.html → vendor-react only (no ethers)
```

---

## 5. Reconnect result

| Layer | Status |
|-------|--------|
| Automated hydrate / no TDZ | **PASS** |
| Passive → Trade chunk load then wallet path available | **PASS** |
| Live WC / injected reconnect across refresh & Passive↔Trade | **OPERATOR PENDING** |

No code blockers found that would change connectors, AppKit, or `autoReconnect`.

---

## 6. Console / pageerror result

All automated scenarios: **empty `errors` arrays**.  
No `Cannot access … before initialization` / TDZ regressions observed.

---

## 7. Validation gates

| Gate | Result |
|------|--------|
| `git diff --check` | Pass (docs-only) |
| `npm --prefix frontend run build` | Pass |
| `verify-wrappers.sh` | ALL CHECKS PASSED |
| `audit-commission-pairs.mjs` | PASS 126 / FAIL 0 / BLOCKED 0 |
| `.venv/bin/pytest` | 119 passed, 3 skipped |

---

## 8. Known limitations

1. Headless Chromium **cannot** approve MetaMask / WalletConnect user gestures.
2. Body-text heuristics on `/about`/`/privacy` may match the word “wallet” in legal copy — not a Connect Wallet control.
3. Production still on `14cbf64`; this certifies **undeployed** `b3c60d3` artifacts.
4. Full `vendor-reown-walletconnect` load is deferred until connect/bootstrap — pass network assertions distinguish UI chunk vs vendor chunk.

---

## 9. Deployment recommendation

```text
AUTOMATED GATES: GREEN
MANUAL WALLET CHECKLIST: REQUIRED BEFORE FINAL APPROVAL
```

Recommend:

1. Operator completes the manual checklist on a preview of `b3c60d3` (or later).
2. Then explicit approval to static-deploy **P8A.0 + P8A.2 + P8A.3** together (commit ≥ `b3c60d3`).
3. Do **not** deploy until manual reconnect rows are checked.

---

## 10. Rollback plan

```text
If post-deploy wallet/reconnect regresses:
1. Redeploy prior static artifact (e.g. 14cbf64 frontend).
2. Do not “fix” with bare lazy(SwapInterface) (P7C).
3. Keep git history; revert deploy only unless a hotfix is approved.
```

---

## 11. Next phase

```text
P8C — Deploy approval request / static production deploy of P8A stack
(after operator signs manual wallet checklist)
```

*End of P8B QA matrix.*
