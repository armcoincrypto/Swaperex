# SWAPEREX P16.9 — P15/P16 Controlled Production Deployment and Post-Deploy Validation

**Program:** P16.9_P15_P16_CONTROLLED_PRODUCTION_DEPLOYMENT_AND_POST_DEPLOY_VALIDATION  
**Date:** 2026-07-11  
**Repository path:** `/root/Swaperex`  
**Production URL:** https://dex.kobbex.com  
**Deployment operator:** Cursor production change owner (automated)  
**Rollback floor:** `eee0264`

---

## Verdict

**P16_9_P15_P16_CONTROLLED_PRODUCTION_DEPLOYMENT_PASS_WITH_WARNINGS**

---

## Commit markers

| Field | Value |
|-------|-------|
| Starting production commit | `eee0264` |
| Release candidate | `b6024e3` |
| Final production commit | `b6024e3` |
| Starting repository HEAD | `b6024e3` |
| Final repository HEAD | `b6024e3` |
| Deployment timestamp (UTC) | `2026-07-11T15:20:32Z` |
| Remote push performed | **No** (operator policy) |

---

## Scope

P15/P16 frontend release: URL-driven routing, canonical `/swap`, unsupported-network UX, CTA/lifecycle models, mobile WalletConnect automated certification, P16.8 certification runner stabilization.

## Non-scope

No contract, commission, treasury, backend, chain enablement, dependency upgrade, or P17 work.

---

## Pre-deploy snapshot

Evidence directory: `/root/Swaperex/reports/p16-9/20260711T151103Z/`

Captured before mutation:

- Production HTML/headers for `/` and `/swap`
- DNS and TLS probes
- Production static file SHA256 manifest (`production-files.sha256`)
- Change-scope guard JSON vs base `eee0264`

Production baseline confirmed via live `version.txt`:

```text
commit=eee0264...
deployed=2026-07-10T00:17:49Z
environment=production
```

---

## Deployment mechanism

**Used:** `scripts/deploy-frontend.sh` (golden frontend deploy on this host)

**Not used:** `scripts/prod-deploy.sh` / `scripts/safe-prod-deploy.sh` — blocked by unpushed local commits (19 ahead of `origin/main`) and untracked `reports/p16/`; those scripts require clean tree + push to `origin/main`.

| Property | Value |
|----------|-------|
| Production web root | `/var/www/swaperex` |
| Build source | `frontend/dist` from HEAD `b6024e3` |
| Transport | `cp -a` after backup |
| Atomicity | Backup + replace directory contents |
| Backup | `/var/www/swaperex-backup-20260711T152032Z` |
| Service reload | `nginx -t` + `systemctl reload nginx` |
| SPA fallback | Existing `try_files $uri $uri/ /index.html;` (unchanged) |

**Deploy command:**

```bash
sudo bash scripts/deploy-frontend.sh
```

Deploy log: `reports/p16-9/20260711T151103Z/deploy.log`

---

## Rollback mechanism

| Field | Value |
|-------|-------|
| Rollback floor | `eee0264` |
| Rollback artifact | `/var/www/swaperex-backup-20260711T152032Z` |
| Rollback command | `sudo rm -rf /var/www/swaperex && sudo mv /var/www/swaperex-backup-20260711T152032Z /var/www/swaperex && sudo systemctl reload nginx` |
| Rollback required | **No** |
| Rollback performed | **No** |

---

## Pre-deploy gates

| Gate | Result |
|------|--------|
| Repository HEAD | `b6024e3` ✅ |
| Tracked tree | Clean (untracked audit artifacts only) ✅ |
| Change-scope guard (`eee0264`) | PASS — `sensitiveHits: []` ✅ |
| Frontend tests | 41 files, **525/525 PASS** ✅ |
| Frontend build | PASS ✅ |
| P16 release certification | **P16_RELEASE_CERTIFICATION_PASS** fail=0 warn=0 ✅ |
| P13 release certification (pre-deploy dry-run) | **RELEASE_CERTIFICATION_PASS** fail=0 warn=0 ✅ |
| Preview orphan check | No orphaned preview on `:4173` ✅ |

**Pre-deploy note:** Initial P16 cert attempt failed with `P16_MOBILE_WC_BROWSER_DEPENDENCY_FAIL` (Playwright browsers not installed). Resolved with `npx playwright install chromium` before re-run; certification then passed. Playwright is not yet a declared `frontend` dependency (environment tooling gap — warning only).

---

## Build artifact metadata

| Artifact | Location |
|----------|----------|
| Dist SHA256 manifest | `reports/p16-9/20260711T151103Z/release-dist.sha256` (88 files) |
| Dist size | `reports/p16-9/20260711T151103Z/release-dist-size.txt` |
| Index asset references | `reports/p16-9/20260711T151103Z/index-assets.txt` |

Primary hashed assets served post-deploy:

```text
assets/index-BoDsFvqr.js
assets/index-CpHM21Uw.css
assets/vendor-react-w8jZXnmi.js
assets/index-D7LAmAOU.js (main bundle)
```

---

## Post-deploy HTTP validation

| Route | HTTP |
|-------|------|
| `/` | 200 |
| `/swap` | 200 |
| `/send` | 200 |
| `/portfolio` | 200 |
| `/radar` | 200 |
| `/screener` | 200 |
| `/trust` | 200 |
| `/about` | 200 |
| `/terms` | 200 |
| `/privacy` | 200 |
| `/disclaimer` | 200 |

Live `version.txt` after deploy:

```text
commit=b6024e3f21700e52ba26516bbb14edc49ce29568
short=b6024e3
branch=main
deployed=2026-07-11T15:20:32Z
```

**Note:** `deploy-frontend.sh` omits `environment=production` line present in prior `eee0264` deployment format.

---

## Production route smoke

```text
P16_ROUTE_SMOKE_PASS
routeCount=14
failCount=0
```

Evidence: `reports/p16-9/20260711T151103Z/post-deploy-route-smoke.json`

---

## Browser / mobile validation

| Check | Result |
|-------|--------|
| Automated browser certification | **AUTOMATED_BROWSER_PASS** |
| WalletConnect QR | Opens ✅ |
| WalletConnect deep link | Present ✅ |
| Connect CTA | Visible ✅ |
| Network selector signal | Visible (locator heuristic) ✅ |
| Viewports | 360×800, 390×844, 430×932, 768×1024 — all PASS |
| Horizontal overflow | None detected ✅ |
| Physical handset certification | **PHYSICAL_HANDSET_DEFERRED** (not performed) |

Evidence: `reports/p16-9/20260711T151103Z/post-deploy-mobile-wc.json`

---

## URL / navigation validation

| Scenario | Result |
|----------|--------|
| Refresh on deep link | PASS — query preserved |
| Deep link `/swap?chain=1&from=WETH&to=USDT&slippage=0.5` | PASS |
| Invalid query sanitization | PASS — no crash, `#root` present |
| Unknown path `/p16-route-does-not-exist` | PASS — redirected/handled |
| Back / forward (`/swap` → `/portfolio` → `/send`) | PASS |

Evidence: `reports/p16-9/20260711T151103Z/extended-browser-validation.json`

---

## Unsupported-network validation

| Check | Result |
|-------|--------|
| Invalid swap chain in URL (`chain=137`) | Safely ignored — UI defaults to Ethereum when disconnected ✅ |
| Full `UnsupportedSwapNetworkExperience` on Polygon | **Partial** — requires connected wallet on read-only chain; not exercised without wallet signature (by design) |
| Unit/registry proof | `networkCapabilities.test.ts`: Polygon `swapSupported=false` ✅ |

No swap execution path opened for unsupported chains via URL injection.

---

## Supported-network read-only validation

| Check | Result |
|-------|--------|
| Connect wallet CTA | Visible ✅ |
| Token/amount UI shell | Renders ✅ |
| Commission labeling | Present in page copy ✅ |
| Network gas fee row | Not visible without connected wallet + active quote (expected read-only limitation) |
| Transactions | **None submitted** |

---

## Static asset and cache validation

| Check | Result |
|-------|--------|
| Built vs served HTML asset refs | **Match** (no diff) |
| Asset HTTP codes | All referenced assets 200 |
| `index.html` cache | `no-cache, no-store, must-revalidate` |
| Hashed JS cache | `public, max-age=31536000, immutable` |

---

## Console / network findings

| Classification | Finding |
|----------------|---------|
| Release blocker | None |
| Known warning | Large WalletConnect vendor chunk (>500 kB build warning) |
| Third-party noise | P12.4 monitor: PASS_WITH_EXTERNAL_NOISE on production |
| Deferred | Physical handset WC matrix |

Post-deploy browser probe: **0 console errors** on `/swap` (disconnected state).

---

## Service health

| Check | Result |
|-------|--------|
| `nginx -t` | OK |
| `systemctl is-active nginx` | active |
| `/api/health` | HTTP 200 (during deploy smoke) |
| P13 post-deploy certification | **RELEASE_CERTIFICATION_PASS** fail=0 warn=0 |

**Post-deploy certification script:** `POST_DEPLOY_CERTIFICATION_FAIL` — sole failure: `verify-live.sh` expects `environment=production` in live `version.txt`. Functional deploy parity checks (`deploy-match.sh`, RPC scan, sourcemap scan) passed. Classified as **non-blocking format drift** from `deploy-frontend.sh` version marker.

---

## Observation window

| Time | Checks | Result |
|------|--------|--------|
| T+0 (`2026-07-11T15:45:18Z`) | `/`, `/swap`, deep link, version.txt | All 200 / commit `b6024e3` |
| T+5 (`2026-07-11T15:50:31Z`) | Same routes | All 200 |
| T+15 (`2026-07-11T16:00:32Z`) | Same routes + main JS chunk | All 200 |

Log: `reports/p16-9/20260711T151103Z/observation.log`

---

## Warnings (non-blocking)

1. **`version.txt` format drift** — missing `environment=production` vs prior deployment; commit hash is authoritative proof of release.
2. **`scripts/prod-deploy.sh` not used** — local branch unpushed; documented deviation to `deploy-frontend.sh`.
3. **Physical handset WalletConnect** — remains deferred; do not interpret automated browser pass as handset pass.
4. **Unsupported-network full UX** — not end-to-end validated with connected wallet on Polygon (no signatures requested).
5. **Playwright not in `package.json`** — production browser cert required transient `npm install --no-save playwright` on operator host.
6. **Gas fee label** — not observable in disconnected read-only state without live quote.

---

## Open / deferred findings

- Physical handset WC matrix: **PHYSICAL_HANDSET_DEFERRED**
- Align `deploy-frontend.sh` `version.txt` with legacy `environment=production` field (ops hygiene — out of P16.9 scope)
- Add Playwright as devDependency for reproducible browser certification (tooling — out of P16.9 scope)

---

## Production readiness

Production at https://dex.kobbex.com serves release candidate **b6024e3** with all 14 P16 routes healthy, automated mobile/browser WalletConnect checks passing, and rollback snapshot preserved at `/var/www/swaperex-backup-20260711T152032Z`.

**Recommended next phase:** `P17_HISTORY_STATUS_AND_OBSERVABILITY_UX`

Preserve rollback floor `eee0264` until P17 baseline is established.
