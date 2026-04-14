# Swaperex — Product truth (internal)

**Audience:** engineers, release owners, incident responders.  
**Purpose:** align mental model and repo navigation with **what the live product actually is**, not everything the repository contains.  
**Source:** internal architecture audit + repo inspection (FastAPI `create_app()`, `frontend/src`, deploy scripts).  
**Last updated:** 2026-04-14.

---

## What Swaperex really is today

Swaperex is a **browser-first, non-custodial web application** deployed as a **static SPA** (Vite build output). Users connect with **WalletConnect** (Reown AppKit) or use **read-only (view) mode** to inspect balances without signing. **Swap** and **Send** execute by **building and signing transactions in the browser**; the server does not sign on behalf of users.

The repository also contains **additional frontend surfaces** (Portfolio, Radar, Screener, activity-style flows) and **Python API code** that does not all map to the same “one backend behind `/api/v1`” story. **Code existence is not product guarantee.**

---

## Core product features

These are the **intended primary journeys** for the live product as described in audit and frontend shell (`frontend/src/App.tsx`):

| Area | Description |
|------|-------------|
| **Swap** | Main tab: token selection, client-side quotes and tx flow (`SwapInterface`, `useSwap`). |
| **Send** | Transfers built and signed client-side (`SendPage`). |
| **WalletConnect** | Connect via Reown AppKit modal; extension/injected connect intentionally not offered on the product surface. |
| **Read-only mode** | View balances for an address without wallet signing. |
| **Static / legal** | About, Terms, Privacy, Disclaimer (lazy-loaded static pages). |
| **Chain awareness** | Wrong-chain banner and network switching where the wallet provider allows it. |

---

## Optional / infra-dependent features

These **ship in the SPA** and may be **fully usable**, **partially usable**, or **degraded** depending on **same-origin proxies**, **signals services**, and **external APIs** — not on “Python repo contains code” alone.

| Area | Dependency (high level) |
|------|-------------------------|
| **Portfolio** | Multi-chain reads, pricing; uses paths such as RPC proxy and CoinGecko proxy derived from `frontend/src/config/api.ts` (`RPC_PROXY_BASE`, `COINGECKO_PROXY_BASE`). |
| **Radar** | Signals HTTP (`joinSignalsUrl` → e.g. `/api/v1/signals` in default prod-relative config); health checks for “signals online.” |
| **Screener** | CoinGecko / DexScreener and related fetches; proxy availability matters. |
| **Activity / tx history** | RPC and explorer-style proxies where used. |
| **Footer / system status** | Fetches health JSON from signals base URL; response shape must match what `systemStatusStore` expects **or** UI shows unavailable/degraded. |

**Uncertain (must be confirmed per environment):** exact nginx (or gateway) routing for `/api`, `/api/v1`, `/rpc`, `/coingecko`, `/explorer` on the live host. The repo’s deploy script does not define nginx; only scripts assert certain URLs.

---

## Legacy / cleanup-candidate areas

These are **not “broken”** by default; they are **scope drift risks** — engineers may assume they are part of the live monolith.

| Area | Why it is a candidate |
|------|------------------------|
| **Frontend `apiClient` modules** | `frontend/src/api/quotes.ts`, `chains.ts`, `balances.ts`, `swaps.ts`, `transactions.ts`, `withdrawals.ts` — audit found **limited or no** runtime imports from app shell for some; verify before removal (Phase 2). |
| **`swapStore.fetchQuote` / `swapsApi`** | Parallel path vs main `useSwap` quote flow; `useQuote` hook appears unused by UI — verify. |
| **Withdrawal UI** | `WithdrawalInterface` exists under `frontend/src/components/withdrawal/` but is **not** wired into `App.tsx` navigation — verify product intent. |
| **Python `swaperex.web.controllers`** | Routers exist under `src/swaperex/web/controllers/` but are **not** registered in `src/swaperex/api/app.py` `create_app()`. Either another process mounts them in some deployments, or they are legacy — **uncertain without ops map.** |

---

## Wallet architecture truth

| Topic | Truth |
|-------|--------|
| **Supported connect modes** | **WalletConnect** (Reown AppKit) and **read-only** (address entry). |
| **Injected / MetaMask** | **Intentionally removed** from the custom picker and **disabled in the Reown modal** (`enableInjected: false` in `frontend/src/services/wallet/appkit.ts`). Legacy hook entry `connectInjected` fails fast with a clear message if called. |
| **Auto-reconnect** | Injected auto-reconnect on mount is not applied; WalletConnect / AppKit persistence is the live restore path (see `useWallet` + `AppKitBridge`). |
| **Wallet session API** | **Optional.** `POST` to `/wallet/connect` and `/wallet/disconnect` are **gated** — only sent when `VITE_ENABLE_WALLET_SESSION_API === 'true'` at build time (`frontend/src/api/wallet.ts`). Default build: **no** those POSTs. |
| **switchChain store → backend** | `walletStore.switchChain` may still call backend `walletApi.switchChain` when used; product-critical chain switching for signing is via the **wallet provider**. Do not conflate the two without reading `walletStore.ts`. |

---

## What the live deploy actually proves

From **`scripts/prod-deploy.sh`** (inspected in audit):

- **Proven:** `npm ci` + `npm run build` in `frontend/`, `dist/` exists, **rsync** of `frontend/dist/` to the configured web root, **nginx** test + reload.
- **Proven (post-deploy checks):** `scripts/audit/verify-live.sh` against `https://dex.kobbex.com`:
  - HTML loads (200).
  - Bundled `index-*.js` asset loads (200).
  - **`GET /api/health`** returns **200**.
  - **`GET /api/v1/health`**: only required to return **200** when the script observes a non-empty HTTP code other than `000` (otherwise the check is skipped — see `scripts/audit/verify-live.sh`).

**Not proven by that script alone:**

- That **`/api/v1/*`** matches the Python `create_app()` surface or any specific JSON schema for “system health.”
- That **`/rpc/*`, `/coingecko/*`, `/explorer/*`** exist or match `frontend/src/config/api.ts` defaults.
- That **all** nav tabs (Portfolio, Radar, Screener) have full backend/proxy support on that host.

Treat **verify-live** as **static + minimal health**, not “full stack contract test.”

---

## How to use this doc

- Before adding a feature: decide if it is **core** or **optional**, and document **infra** requirements if optional.
- Before deleting code: use **`docs/SERVICE_MAP.md`** and **`docs/FEATURE_MATRIX.md`** plus Phase 2 verification — do not delete based on this file alone.

---

## Related internal docs

- `docs/SERVICE_MAP.md` — deploy flow and endpoint expectations.  
- `docs/FEATURE_MATRIX.md` — feature-by-feature classification.  
- Existing specs under `docs/specs/` may describe **aspirational** or **historical** scope; when they conflict with this file, **this file wins for “live product truth”** until specs are explicitly updated.
