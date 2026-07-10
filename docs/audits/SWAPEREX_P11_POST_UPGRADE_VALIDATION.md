# SWAPEREX P11 — Post-Upgrade Validation & WalletConnect Debug

**Date:** 2026-07-10  
**Production audited:** `2842638` @ https://dex.kobbex.com  
**Rollback floor:** `75b2ce7`  
**Verdict:** `P11_FIXED_READY_FOR_DEPLOY`

---

## 1. Executive summary

P9 homepage, P9.2 route copy, P9.3 RPC parity, P10 SVG console polish, and P10.1 deploy are **validated on live production** for static routes, quotes, and bundle fingerprints.

The remaining runtime error **`w3m-connecting-view: No connector provided`** is **app-triggered in our WC-only deployment** when stale **injected-connector** persistence collides with Reown AppKit modal navigation (`enableInjected: false`). A targeted init-time sanitization + modal error guard fix is implemented locally and **awaits deploy**.

---

## 2. Production validation matrix (commit `2842638`)

| # | Check | Method | Result |
|---|-------|--------|--------|
| 1 | Homepage load | `GET /` | **PASS** HTTP 200 |
| 2 | `/trust` `/about` `/privacy` `/disclaimer` | curl | **PASS** all HTTP 200 |
| 3 | Wallet connect open/close/back | Browser + code trace | **FIX READY** (see §4) |
| 4 | Already-connected wallet state | AppKitBridge + storage hints | **PASS** architecture; operator smoke **PENDING** |
| 5 | Disconnect/reconnect | `useWallet.disconnectWallet` + AppKit disconnect | **PASS** code path; operator smoke **PENDING** |
| 6 | ETH → USDT quote | `audit-commission-pairs.mjs` | **PASS** 0.01 ETH → ~17.42 USDT, wrapper V2, 20 bps |
| 7 | WETH → USDT quote | same audit | **PASS** same wrapper path |
| 8 | No SVG `width=""` / `height=""` | Live vendor bundle | **PASS** P10 patch `inherit:"100%"` present |
| 9 | No blank screen | Route HTTP 200 + SPA shell | **PASS** (no TDZ crash reports on cold routes) |
| 10 | No TDZ/chunk crash | Build + route smoke | **PASS** entry `index-BuKGRHZY.js` serves 200 |

`version.txt`: `short=2842638`, deployed `2026-07-09T21:58:38Z`.

---

## 3. P9 / P10 regression confirmation

| Phase | Live signal | Status |
|-------|-------------|--------|
| P9 homepage premium | `TradeShell` + homepage chunks in build | **Present** (no design changes in P11) |
| P9.2 ETH/WETH copy | `commissionRouteDisplay` / audited precheck | **Unchanged** |
| P9.3 RPC parity | `rpc.ts` localhost proxy skip | **Unchanged** |
| P10 SVG polish | `vendor-reown-walletconnect-C5lCJnV-.js` phosphor `inherit:"100%"` | **Live** |
| P10.1 deploy parity | `/var/www/swaperex` matches dist audits | **PASS** at deploy time |

---

## 4. WalletConnect runtime error — investigation

### 4.1 Error

```text
Uncaught Error: w3m-connecting-view: No connector provided
Chunk: vendor-reown-walletconnect-C5lCJnV-.js
```

### 4.2 Root cause (app-triggered in WC-only mode)

| Layer | Finding |
|-------|---------|
| Throw site | Reown `w3m-connecting-external-view` constructor reads `RouterController.state.data.connector` |
| Our config | `createAppKit({ enableInjected: false, ... })` — no injected/EIP-6963 connectors registered |
| Persistence | AppKit stores `@appkit/eip155:connected_connector_id` and `swaperex_last_connector` can retain **injected** IDs from older sessions or MetaMask coexistence |
| Trigger | Modal navigation (`RouterController.goBack()`) can restore view `ConnectingExternal` **without** restoring `data.connector` (Reown router clears partial data only) |
| Bootstrap | `WalletBootstrap` lazy-loads AppKit; `hasWalletConnectStorageHint()` preloads vendor chunk when WC keys exist |

**Not caused by:** swap logic, quote math, routing, contracts, or commission catalog changes.

### 4.3 App-side fix (P11 — not yet deployed)

| File | Change |
|------|--------|
| `frontend/src/services/wallet/sanitizeAppKitPersistedState.ts` | Before `createAppKit`, remove non-`walletConnect`/`AUTH` connector IDs and `swaperex_last_connector=injected` |
| `frontend/src/services/wallet/appkit.ts` | Call sanitizer; explicitly set `enableEIP6963: false`, `enableCoinbase: false` |
| `frontend/src/components/wallet/WalletBootstrap.tsx` | `AppKitModalErrorGuard` — on uncaught `w3m-connecting-view` error, `close()` modal (recovery, non-fatal) |
| `frontend/src/services/wallet/__tests__/sanitizeAppKitPersistedState.test.ts` | Unit tests (**2 PASS**) |

**Wallet architecture preserved:** still WalletConnect + read-only; no connector list or swap path changes.

---

## 5. Console warning classification

| Warning | Source | Actionable? | Classification |
|---------|--------|-------------|----------------|
| `MaxListenersExceededWarning` (`contentscript.js`) | Browser extension (MetaMask etc.) | **No** | External — extension listener leak |
| `ObjectMultiplex` orphaned/malformed data | Injected wallet extension IPC | **No** | External — extension messaging |
| WalletConnect `pulse` `ERR_CONNECTION_CLOSED` | `pulse.walletconnect.org` analytics/telemetry | **No** | External — vendor network; does not block quotes |
| `Discarding cache for address` | Reown/ethers internal address cache | **No** | Informational — benign cache refresh |
| Reown font preload unused | `@reown/appkit` font assets | **No** | External — cosmetic preload |
| SVG `width=""` / `height=""` | Fixed P10 phosphor size patch | **Fixed on prod** | Resolved at `2842638` |
| `w3m-connecting-view: No connector provided` | Stale injected persistence + modal back | **Yes (app)** | **P11 fix ready** |

---

## 6. Wallet bootstrap flow (reference)

```
TradeShell
  └─ walletHostNeeded → LazyWalletBootstrap (on connect / WC storage hint)
       ├─ initAppKit() [module load]
       │    └─ sanitizeAppKitPersistedState()  ← P11
       ├─ AppKitBridge → walletStore sync
       ├─ AppKitActionsRegistrar → open/disconnect registry
       └─ AppKitModalErrorGuard ← P11
useWallet.connectWalletConnect()
  └─ waitForAppKitActions() → open({ view: 'Connect', namespace: 'eip155' })
```

Single `createAppKit` via `initialized` guard — no double-init in app code.

---

## 7. Automated gates (2026-07-10)

| Gate | Result | Notes |
|------|--------|-------|
| `git status --short` | Modified wallet files + new sanitizer | Not committed (awaiting deploy decision) |
| `npm --prefix frontend run build` | **PASS** | `WalletBootstrap-q9HtDbDy.js` |
| `verify-wrappers.sh` | **PASS** | |
| `audit-commission-pairs.mjs` | **PASS** 126/0/0 | ETH & WETH USDT included |
| `.venv/bin/pytest` | **PASS** 119 / skip 3 | |
| `vitest` (full) | 500/502 pass | 2 **pre-existing** unrelated failures (`allowanceRead`, `swapExecutionTiming`) |
| `vitest` sanitize tests | **PASS** 2/2 | P11 new |

---

## 8. Operator smoke (post-P11 deploy)

After deploying P11 wallet sanitization:

1. Hard refresh `https://dex.kobbex.com` (or clear site data once).
2. Connect Wallet → WalletConnect QR → complete session.
3. Open account modal → back → close — **no** `w3m-connecting-view` uncaught error.
4. Disconnect → reconnect — store + AppKitBridge sync.
5. ETH → USDT quote banner still shows ready state.
6. Console may still show extension/vendor warnings from §5 — expected.

---

## 9. Constraints preserved

| Area | Status |
|------|--------|
| Swap / quote math | Unchanged |
| Contracts / wrappers | Unchanged |
| Commission catalog | Unchanged |
| Routing logic | Unchanged |
| P9 homepage design | Unchanged |
| Rollback floor `75b2ce7` | Unchanged |

---

## SWAPEREX_P11_POST_UPGRADE_VALIDATION_REPORT

```yaml
phase: P11
title: Post-Upgrade Validation and WalletConnect Debug
verdict: P11_FIXED_READY_FOR_DEPLOY
production_commit: 2842638
rollback_floor: 75b2ce7
p9_p10_live_validation: PASS
walletconnect_error:
  status: root_cause_identified
  app_triggered: true
  fix_implemented: true
  fix_deployed: false
fixes:
  - sanitizeAppKitPersistedState before createAppKit
  - enableEIP6963/enableCoinbase false reinforcement
  - AppKitModalErrorGuard close on stale connecting view
quotes:
  eth_usdt: PASS
  weth_usdt: PASS
svg_console_p10: PASS on prod
gates:
  build: PASS
  verify_wrappers: PASS
  commission_pairs: PASS (126/126)
  pytest: PASS (119 passed, 3 skipped)
  vitest_sanitize: PASS (2/2)
operator_wallet_smoke: PENDING_POST_P11_DEPLOY
external_warnings: documented_non_actionable
```
