# SWAPEREX P7D — Post-Deploy Browser / Artifact QA

**Date:** 2026-07-08  
**Live HEAD:** `3d2944c`  
**Related:** P7C `bac05c0` (lazy SwapInterface)

---

## Production verification

| Check | Result |
|-------|--------|
| `git rev-parse --short HEAD` | `3d2944c` |
| Live `version.txt` `short=` | `3d2944c` |
| `GET /` | HTTP 200 |
| `GET /trust` | HTTP 200 |
| Deployed at | `2026-07-08T00:53:41Z` |

---

## Artifact verification (PASS)

Live assets under `/var/www/swaperex/assets`:

| Asset | Size | Role |
|-------|------|------|
| `index-BikRjnJw.js` | 208K | Entry |
| `SwapInterface-CWsnvE9G.js` | 220K | **Separate lazy chunk** |
| `vendor-ethers-*.js` | 386K | Still initial modulepreload |
| `vendor-reown-walletconnect-*.js` | 2.5M | Lazy |
| `TrustCenterPage-*.js` | 9.0K | Lazy |

**Entry analysis:**

- `SwapInterface` appears in entry only as Vite dynamic import map / `import("./SwapInterface-*.js")` — not inlined.
- Swap quote symbols (`getBestWrapperQuote`, `feeToTreasuryWei`, etc.) **absent** from entry.
- `index.html` modulepreloads: `vendor-react`, `vendor-ethers` only (plus entry script).

**Codepath:** `LazySwapInterface` mounts only when `currentPage === 'swap'`. `/trust` uses `LazyTrustCenterPage` only.

---

## Browser QA status

### Automated (this environment)

- Chromium snap headless available, but AppArmor blocks full CDP/net-log; `--dump-dom` returns pre-hydration shell only.
- **Cannot hermetically assert Network-tab requests here.**

### Expected (operator / DevTools, cache disabled)

**/trust cold load**

- Request: `index-BikRjnJw.js`, react, ethers
- Request: `TrustCenterPage-*.js` after route resolve
- **Do not** request `SwapInterface-*.js`
- **Do not** request `vendor-reown-walletconnect` unless WC storage hint / connect path

**/ (swap tab)**

- Request: `SwapInterface-CWsnvE9G.js` when swap panel mounts
- Possible brief “Loading swap…”
- Quote UI + wallet header on trade shell

**Wallet smoke (manual)**

- Connect opens
- Returning session reconnects on trade route
- No swap broadcast required

---

## Remaining initial bundle issue

```text
vendor-ethers remains initial because DexMain eagerly imports useWallet + NetworkSelector.
```

Tracked in `SWAPEREX_P8A_PASSIVE_SHELL_SPLIT_PLAN.md`.

---

*End of P7D QA notes.*
