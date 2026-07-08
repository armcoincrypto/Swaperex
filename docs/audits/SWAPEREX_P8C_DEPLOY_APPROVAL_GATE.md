# SWAPEREX P8C — Deploy Approval Gate

**Date:** 2026-07-08  
**Code under test:** `3971ba8` (includes P8A.0 / P8A.2 / P8A.3 / P8B docs)  
**Production live:** Still `14cbf64`  
**Decision:** **NOT approved for static deploy** — manual wallet smoke incomplete in agent environment

---

## 1. Deploy decision (binding)

```text
P8C_BLOCKED — do not static-deploy P8A stack yet.
Reason: Real browser wallet connect + reconnect + quote-only could not be completed here
(no DISPLAY, no window.ethereum, no operator WalletConnect session).
No product defect found in automatable steps; gate remains closed until operator signs checklist.
```

---

## 2. Automated / partial smoke (agent)

Preview: `serve dist` @ `127.0.0.1:4173`, Chromium headless, cache disabled for nav proof.

| Step | Result | Evidence |
|------|--------|----------|
| 1. Open `/trust` | **PASS** | `#root` mounts; Trust Center text; no TradeShell/ethers; no forced `[role=dialog]` |
| 2. `/trust` → Open swap → `/` | **PASS** | Fetches `TradeShell-*.js` + `vendor-ethers-*.js`; Swap UI; Connect Wallet visible |
| 3. Click Connect Wallet | **PARTIAL PASS** | Opens “CONNECT OR VIEW” panel (WalletConnect / Coinbase / View address); **no** `window.ethereum`; **no** completed session |
| 4. Connect wallet | **NOT RUN** | Requires operator wallet approval |
| 5. Refresh `/` after connect | **NOT RUN** | Depends on (4) |
| 6. `/` → `/trust` while connected | **PARTIAL** | Disconnected cold path: trust has no forced modal; connected path not proven |
| 7. `/trust` → `/` after connect | **PARTIAL** | Nav works disconnected; reconnect state not proven |
| 8. Quote only | **NOT RUN** | Needs connected (or at least pair-ready) wallet / amounts |
| Console / pageerror | **PASS** | Empty errors on all agent steps |

Network proof (trust cold):

```text
index-*.js, vendor-react, TrustCenterPage, commissionChains, rpc — YES
TradeShell, vendor-ethers, vendor-reown-walletconnect — NO
```

After Open swap:

```text
TradeShell, vendor-ethers, WalletConnect UI chunk — YES
```

---

## 3. Operator checklist (must all PASS before deploy)

Complete on preview of `>= b3c60d3` / `3971ba8`:

- [ ] Connect Wallet → WalletConnect or injected → address shown
- [ ] Hard refresh `/` → session restores (same as pre-P8A production expectation)
- [ ] Connected → open `/trust` → no crash, no forced modal
- [ ] `/trust` → Open swap → still connected / restores cleanly
- [ ] Request **quote only** (no sign / broadcast)
- [ ] Console: zero fatal / TDZ

When all checked, amend this doc to `P8C_READY_FOR_STATIC_DEPLOY` and proceed with approved static deploy of P8A stack.

---

## 4. Final gates (repo)

| Gate | Result |
|------|--------|
| `git rev-parse --short HEAD` | `3971ba8` |
| Frontend build | Pass |
| `verify-wrappers.sh` | ALL CHECKS PASSED |
| Pair audit | PASS 126 / 0 / 0 |
| pytest | 119 passed, 3 skipped |

No code changes in this phase.

---

## 5. Reconnect / quote-only result

| Item | Status |
|------|--------|
| Code path still present in TradeShell (`useWallet`, WC storage hint, bootstrap subscribe) | Unchanged |
| Live reconnect across Passive↔Trade | **Unverified** (operator) |
| Quote-only | **Unverified** (operator) |

---

## 6. Rollback plan (when deploy eventually happens)

```text
Redeploy static artifact for 14cbf64 (or last known-good pre-P8A frontend).
Do not “fix” regressions with bare lazy(SwapInterface) (P7C).
```

---

## 7. Next phase

```text
Operator completes Section 3 checklist on preview → update this gate to READY
→ P8D / approved static production deploy of P8A.0+P8A.2+P8A.3 (≥ b3c60d3).
```

*End of P8C gate — blocked pending operator wallet smoke.*
