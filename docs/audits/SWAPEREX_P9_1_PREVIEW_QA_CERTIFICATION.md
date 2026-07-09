# SWAPEREX P9.1 — Preview QA Certification

**Date:** 2026-07-09  
**P9 commit:** `c67521f` — `feat(frontend): add production-ready homepage trust layer`  
**Production live (unchanged):** `ff6460d`  
**Rollback point:** `14cbf64` (never P7C lazy SwapInterface rollback)  
**Preview URL:** `http://127.0.0.1:4175` (Vite preview, built from `c67521f`)  
**Preview timestamp:** 2026-07-09T12:01:32Z (server start)

---

## 1. Phase 1 — Commit safety

| Check | Result |
|-------|--------|
| Only intended P9 files in commit | PASS |
| No swap/wallet/quote logic files | PASS |
| Unexpected business files | None |
| Untracked audit report left uncommitted | `reports/commission-pair-audit-20260708.json` (ignored) |

**Commit:** `c67521f833729c47c86be4c901ab4fbaf8dbe9fa`

---

## 2. Phase 2 — Static validation

| Gate | Result |
|------|--------|
| `git diff --check` | PASS |
| `npm --prefix frontend run build` | PASS |
| `bash scripts/audit/verify-wrappers.sh` | PASS |
| `node scripts/audit/audit-commission-pairs.mjs` | PASS — 126 / 0 / 0 |
| `.venv/bin/pytest` | PASS — 119 passed, 3 skipped |

---

## 3. Phase 3 — Preview deploy

No dedicated preview deploy script for static dist beyond local preview.

```bash
npm --prefix frontend run build
npm --prefix frontend run preview -- --host 127.0.0.1 --port 4175
```

| Field | Value |
|-------|-------|
| Preview URL | `http://127.0.0.1:4175` |
| Preview commit | `c67521f` |
| Production deploy | **NOT performed** |

---

## 4. Phase 4 — Automated route QA

Playwright (Chromium, `--no-sandbox`) against preview dist:

| Route | HTTP | `#root > *` | pageerror | TradeShell | ethers | Verdict |
|-------|------|-------------|-----------|------------|--------|---------|
| `/` | 200 | 1 | none | yes | yes | PASS |
| `/trust` | 200 | 1 | none | no | no | PASS |
| `/about` | 200 | 1 | none | no | no | PASS |
| `/privacy` | 200 | 1 | none | no | no | PASS |
| `/disclaimer` | 200 | 1 | none | no | no | PASS |

**Passive route isolation:** PASS — cold passive loads do not fetch TradeShell or vendor-ethers.  
**TDZ / blank screen / ChunkLoadError:** None observed.

---

## 5. Phase 5 — Visual QA

Homepage `/` at all required widths:

| Viewport | Overflow-X | Wallet btn | Swap top (px) | Trust strip | Stats/Why/Popular | Footer |
|----------|------------|------------|---------------|-------------|-------------------|--------|
| 1440px | No | Yes | 218 | Yes | Yes | Yes |
| 1280px | No | Yes | 218 | Yes | Yes | Yes |
| 768px | No | Yes | 264 | Yes | Yes | Yes |
| 430px | No | Yes | 304 | Yes | Yes | Yes |
| 390px | No | Yes | 304 | Yes | Yes | Yes |
| 375px | No | Yes | 304 | Yes | Yes | Yes |

Swap form remains above fold on mobile (top ~304px). Trust strip wraps cleanly. No decorative overlay blocking clicks detected.

**Reduced motion (`prefers-reduced-motion: reduce`):** PASS — hero glow opacity reduced to `0.35`; swap UI functional.

---

## 6. Phase 6 — Manual wallet smoke

| Step | Automated result | Notes |
|------|------------------|-------|
| Open preview `/` | PASS | Homepage P9 sections render |
| Connect wallet | **PENDING_OPERATOR** | AppKit UI is WalletConnect-first; injected `window.ethereum` mock does not complete connect in headless (same constraint as P8C) |
| Address visible | **PENDING_OPERATOR** | Requires real browser wallet approval |
| Refresh `/` | **PENDING_OPERATOR** | Depends on completed connect session |
| `/` → `/trust` | PASS | Trust Center loads; no fatal error |
| `/trust` → `/` | PASS | Swap + P9 trust layer restore |
| Quote-only (no approve/sign) | **PENDING_OPERATOR** | Not run without live wallet session |

**Passive↔Trade navigation:** PASS (automated).  
**No TDZ, blank `#root`, reconnect loop, or fatal React errors** in automated paths.

Operator must complete real-wallet checklist on preview (or staging URL) before production approval — mirror P8B/P8D manual gate.

---

## 7. Phase 7 — Lighthouse

Local preview (`127.0.0.1:4175`, headless Chromium):

| Page | Perf | A11y | Best Prac | SEO | LCP | CLS | TBT |
|------|------|------|-----------|-----|-----|-----|-----|
| `/` | 74 | 92 | 73 | 100 | 4.7s | **0.035** | 280ms |
| `/trust` | 75 | 100 | 96 | 100 | 2.1s | 0.654 | 53ms |

**Assessment:**
- Homepage CLS **0.035** — below 0.1 threshold; **no P9 regression**.
- Trust CLS elevated — passive page; **not introduced by P9 homepage sections** (trust route unchanged structurally).
- Large TradeShell/vendor-reown chunks and preview-local 404s (`/api/v1/health`, `/rpc/eth`) depress perf scores on local preview; expected without nginx/backend proxy.

**Block criteria:** Not triggered.

---

## 8. Console warnings (classified)

### Acceptable / pre-existing
- `/api/v1/health`, `/rpc/eth`, `/api/v1/monitoring/events` 404 on local preview (no backend/nginx proxy)
- MetaMask / WalletConnect / Reown SDK noise (when extension present)
- Large vendor-reown chunk advisory at build time
- External token image ORB blocks (1inch CDN)

### Not observed (unacceptable)
- `Cannot access before initialization` (TDZ)
- `ChunkLoadError`
- Blank `#root`
- Fatal React render errors

---

## 9. Production risk assessment

| Risk area | Level | Rationale |
|-----------|-------|-----------|
| Wallet architecture | **Low** | P8A unchanged; no connector/AppKit/autoReconnect edits |
| Swap / quote logic | **None** | Presentational-only diff |
| Passive isolation | **Low** | Verified unchanged on cold passive routes |
| UX regression | **Low** | Visual QA pass; CLS on `/` acceptable |
| Wallet reconnect | **Medium (unverified)** | Requires operator manual smoke (same gate as P8C→P8D) |

**Overall:** Safe for **preview/staging** validation. Production deploy should wait for operator wallet confirmation.

---

## 10. Rollback plan

| Scenario | Action |
|----------|--------|
| Post-deploy UX issue | Redeploy production commit `ff6460d` via `scripts/safe-prod-deploy.sh` |
| Severe wallet/TDZ regression | Roll back to `ff6460d`; emergency floor `14cbf64` |
| P9-specific revert | `git revert c67521f` then rebuild/deploy |

---

## 11. Files in P9 commit

```
docs/audits/SWAPEREX_P9_HOMEPAGE_PRODUCTION_READINESS.md
frontend/src/constants/homepageProductCopy.ts
frontend/src/components/homepage/*
frontend/src/components/layout/TradeShell.tsx
frontend/src/components/layout/DexSiteFooter.tsx
frontend/src/index.css
frontend/src/utils/routingDisplayStatus.ts
frontend/src/utils/routePrecheck.ts
```

---

## 12. Final verdict

```text
P9_1_READY_WITH_WARNINGS_OPERATOR_CONFIRMATION_REQUIRED
```

All automated gates pass. P9 is presentational-only atop the stabilized P8D architecture. Real browser wallet connect / refresh / quote-only smoke **must be confirmed by operator** before production deploy approval.

**Do NOT deploy to production until explicit operator approval after manual wallet QA.**
