# Swaperex — Service map (internal)

**Audience:** engineers, SRE, anyone changing nginx, APIs, or env-driven URLs.  
**Purpose:** separate **what deploy scripts guarantee** from **what the repo contains** and **what may exist only in live infrastructure**.  
**Source:** `scripts/prod-deploy.sh`, `scripts/audit/verify-live.sh`, `frontend/src/config/api.ts`, `src/swaperex/api/app.py`, audit conclusions.  
**Last updated:** 2026-04-14.

---

## Static frontend deploy flow

| Step | Script / location | What happens |
|------|-------------------|----------------|
| Clean tree | `scripts/prod-deploy.sh` | Fails if git working tree dirty. |
| Sync to `main` | same | `git fetch`, checkout `main`, `git pull --ff-only`. |
| Build | `frontend/` | `npm ci`, `npm run build` → `frontend/dist/`. |
| Publish | same | `rsync -a --delete` of `dist/` to configured **`DEPLOY_DIR`** (e.g. `/var/www/swaperex`). |
| Web server | same | `nginx -t`, `systemctl reload nginx`. |
| Audit | `scripts/audit/deploy-match.sh`, `scripts/audit/verify-live.sh` | Post-deploy checks (see below). |

**Truth:** This flow deploys **static assets only**. It does **not** (in script) deploy or restart the Python FastAPI application.

---

## Routes / endpoints guaranteed by current deploy scripts

### `scripts/audit/verify-live.sh` (against `https://dex.kobbex.com`)

| Check | Requirement |
|-------|----------------|
| `GET /` | HTTP **200**; HTML must reference `/assets/index-*.js`. |
| `GET /assets/index-*.js` | **200** (resolved from HTML). |
| Local file | Corresponding file exists under **`/var/www/swaperex/assets/`** on the deploy host. |
| `GET /api/health` | HTTP **200** (hard requirement). |
| `GET /api/v1/health` | **Conditional:** if `curl` prints an HTTP code that is **non-empty and not `000`**, the script **requires 200**; otherwise this check is skipped (so missing or unreachable endpoint may not fail the script — see `scripts/audit/verify-live.sh` lines 44–47). |

**Note:** `curl`’s `%{http_code}` can be `000` on some failures; the script uses `|| true` when capturing `code_v1`. Re-read `scripts/audit/verify-live.sh` when changing acceptance criteria.

### `scripts/audit/deploy-match.sh`

Referenced from `prod-deploy.sh`; used for consistency checks between built assets and live. **Does not** by itself define full API coverage — read that script before relying on it for API contracts.

---

## Frontend-configured surfaces (optional / external relative to static deploy)

Defaults from **`frontend/src/config/api.ts`** (unless overridden by `VITE_*` at build time):

| Surface | Default prod-relative base | Typical use in frontend |
|---------|----------------------------|-------------------------|
| Main API (axios) | `API_BASE_URL` → **`/api/v1`** | Legacy/monolith-style REST modules under `frontend/src/api/`. |
| Signals base | `SIGNALS_API_URL` → **`/api/v1`** | `joinSignalsUrl('health')`, `joinSignalsUrl('signals')`, system status fetch. |
| RPC proxy | **`/rpc`** (when signals base is same-origin relative) | Portfolio / tx history / balance paths that use `RPC_PROXY_BASE`. |
| CoinGecko proxy | **`/coingecko`** | Screener / pricing paths using `COINGECKO_PROXY_BASE`. |
| Explorer proxy | **`/explorer`** | Explorer-style links or fetches where used. |

**These are not guaranteed by `prod-deploy.sh`.** They are **assumptions** encoded in the frontend build. Whether they exist on the live host is an **infrastructure** question.

---

## Backend scope in this repo vs “guaranteed live”

### What `src/swaperex/api/app.py` actually mounts (`create_app()`)

Routers included in the inspected app factory (audit):

- Health routes from `swaperex.api.routes.health` (e.g. **`/health`**, **`/health/detailed`** — paths relative to app root, not automatically prefixed with `/api/v1` unless mounted that way elsewhere).
- **`/api/v1`**-prefixed deposits router.
- Admin, HD wallet, withdrawal (`/api/v1/withdraw/...`), webhooks modules as wired in `app.py`.

**Not mounted in `create_app()`:** the **`swaperex.web.controllers`** stack (`quotes`, `swaps`, `chains`, `balances`, `wallet`, `transactions`, `withdrawals` web-style routes under `src/swaperex/web/controllers/`).

### Clear statement (non-speculative)

- The **repository** contains **more** Python HTTP surface (`web/controllers`) than is **registered** on the FastAPI app built by **`create_app()`** in `src/swaperex/api/app.py`.
- **Whether** any live environment mounts those controllers behind the same host (e.g. another process or gateway) is **unknown from this repo alone** — mark **UNCERTAIN: requires ops / nginx map.**

---

## Wallet session API (build-time gate)

| Endpoint | Called when |
|----------|-------------|
| `POST /wallet/connect` | Only if `VITE_ENABLE_WALLET_SESSION_API === 'true'` at build time. |
| `POST /wallet/disconnect` | Same. |

Other wallet API functions (`getSession`, `switchChain` via API, etc.) remain in code; **whether they are used in production** depends on product paths — see `docs/FEATURE_MATRIX.md`.

---

## Uncertainties (explicit)

1. **Nginx (or CDN) routing** for `dex.kobbex.com`: which upstream serves `/api`, `/api/v1`, `/rpc`, `/coingecko`, `/explorer` — **not defined in `prod-deploy.sh`.**
2. **Whether** `swaperex.web.controllers` are served anywhere in production — **UNCERTAIN.**
3. **Exact JSON** returned by live `/api/v1/health` vs what `systemStatusStore` expects — **UNCERTAIN** without a captured response from prod.
4. **`deploy-match.sh`** full contract — **read script** before assuming it validates APIs beyond static alignment.

---

## Related docs

- `docs/PRODUCT_TRUTH.md` — product scope vs repo scope.  
- `docs/FEATURE_MATRIX.md` — per-feature classification.
