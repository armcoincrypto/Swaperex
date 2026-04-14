# Swaperex — Feature matrix (internal)

**Purpose:** single table for **product truth vs implementation vs dependencies**.  
**Rules:** “Live on site now?” reflects **what we can infer from repo + deploy scripts**, not a substitute for production monitoring. Mark **uncertain** where infra is unknown.  
**Source:** architecture audit, `frontend/src/App.tsx`, `frontend/src/config/api.ts`, `src/swaperex/api/app.py`, `frontend/src/api/*`, wallet/session gating.  
**Last updated:** 2026-04-14.

### Legend — Classification

| Value | Meaning |
|-------|---------|
| **core** | Primary product; intended always-on for the live SPA. |
| **optional** | Shipped in SPA; usefulness depends on proxies / signals / externals. |
| **legacy candidate** | Code or paths that may duplicate, confuse, or exceed live backend; verify before removal (Phase 2+). |

---

## Matrix

| Feature | Frontend status | Backend dependency | Live on site now? | Business importance | Classification | Recommendation |
|---------|------------------|--------------------|-------------------|----------------------|----------------|----------------|
| **Swap (main UI)** | Implemented: `SwapInterface`, `useSwap` — client quotes, local signing | Public RPCs + external DEX/aggregator APIs (e.g. 1inch where configured); **not** the Python `web` `swaps` controller for the primary UI path | **Yes** — SPA ships it | High | **core** | **Keep**; document env keys (e.g. API keys) in ops runbooks, not here unless standardized |
| **Send** | Implemented: `SendPage` — client-built txs | Wallet provider + RPC | **Yes** | High | **core** | **Keep** |
| **WalletConnect** | Implemented: AppKit + `WalletConnect` UI, `AppKitBridge` | WalletConnect Cloud project id; no custodial server for signing | **Yes** | High | **core** | **Keep** |
| **Read-only mode** | Implemented: address entry path | Optional balance/history fetches (RPC/proxy dependent for some views) | **Yes** | High | **core** | **Keep** |
| **Static / legal pages** | Lazy-loaded from `StaticPages` | None | **Yes** | Medium (compliance) | **core** | **Keep** |
| **Chain warning + switch** | Banner + `NetworkSelector` / `useWallet.switchNetwork` | Wallet provider RPC methods | **Yes** | High | **core** | **Keep** |
| **Wallet session API** (`/wallet/connect`, `/wallet/disconnect`) | Gated in `frontend/src/api/wallet.ts` | Python wallet routes **if** enabled at build time | **Off by default** (no POSTs unless env) | Low for WC-only product | **optional** | **Keep** gated; document `VITE_ENABLE_WALLET_SESSION_API` |
| **Portfolio** | `PortfolioPage`, `usePortfolio`, evm/solana services | RPC proxy, CoinGecko proxy, public RPCs | **Uncertain** — depends on live `/rpc`, `/coingecko`, etc. | Medium | **optional** | **Document infra**; treat partial failure as expected |
| **Radar** | `RadarPanel`, signals services, watchlist monitor | `joinSignalsUrl('signals')`, health | **Uncertain** — depends on signals upstream + schema | Medium | **optional** | **Document**; verify health JSON contract in staging |
| **Screener** | `TokenScreener`, `useScreener` | CoinGecko / DexScreener (+ proxies) | **Uncertain** — proxy-dependent | Medium | **optional** | **Document** |
| **Activity / tx history** (within portfolio flows) | Hooks such as `useTxHistory` | RPC + explorer proxy where used | **Uncertain** | Low–medium | **optional** | **Document** |
| **System status footer** | `SystemStatusIndicator`, `systemStatusStore` | `GET` health on signals base URL | **Uncertain** — response shape vs Python minimal health | Low | **optional** | **Document**; validate against prod response or adjust expectations in a later phase |
| **Signals health badge** | `signalsHealthStore`, `checkSignalsHealth` | Same health endpoint semantics | **Uncertain** | Low | **optional** | **Document** |
| **Frontend modules: `quotes`, `chains`, `balances` API** | Present under `frontend/src/api/` | Would call `/api/v1/...` if used | **Uncertain** if unused — audit: **limited app imports** | Low | **legacy candidate** | **Phase 2:** verify imports + runtime; then remove or document “reserved for future backend” |
| **`swapsApi` + `swapStore.fetchQuote` + `useQuote`** | Code exists | Would call `/swaps/quote` if invoked | **Uncertain** — main swap UI uses `useSwap` | Low | **legacy candidate** | **Phase 2:** prove unused → remove or wire intentionally |
| **`transactionsApi` / `withdrawalsApi` + `useWithdrawal`** | Code exists | Would call `/transactions/*`, `/withdrawals/*` if invoked | **Withdrawal UI not in `App.tsx` nav** — likely not user-visible | Low | **legacy candidate** | **Phase 2:** confirm product intent; remove UI or expose + document backend |
| **Python `swaperex.web.controllers`** | Present in repo | Would be a separate mount / app if used | **UNCERTAIN** — not in `create_app()` | N/A (platform) | **legacy candidate** | **Clarify with ops:** mount, delete, or move to `legacy/` with README |

---

## Notes on “Live on site now?”

- **“Yes”** for SPA-only features means: **the static deploy includes the assets and routes in the client shell**; it does not guarantee every RPC or third-party call succeeds for every user.
- **“Uncertain”** means: **depends on infrastructure outside this repo** or **not proven by `verify-live.sh`.**

---

## Related docs

- `docs/PRODUCT_TRUTH.md`  
- `docs/SERVICE_MAP.md`
