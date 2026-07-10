# SWAPEREX P12 — Validation and Vendor Hygiene Closeout

**Date:** 2026-07-10  
**Production:** https://dex.kobbex.com · commit `eee0264`  
**Prior certification:** `P11_CLOSED_PRODUCTION_STABLE`  
**Verdict:** `P12_PASS_WITH_OPTIONAL_MOBILE_VALIDATION_DEFERRED`

---

## Executive summary

P12 validation and vendor hygiene program completed on production baseline `eee0264`. Automated route/quote regression smoke, runtime warning monitoring, dependency inventory, and font preload investigation **PASS**. Optional human mobile WalletConnect scan **DEFERRED**. **No application source changes; no production deployment.**

---

## Production baseline

| Field | Value |
|-------|-------|
| URL | https://dex.kobbex.com |
| Commit | `eee0264` |
| Deployed | 2026-07-10T00:17:49Z |
| Rollback floor | `75b2ce7` |

---

## Git commit inspected

```text
eee0264 fix(frontend): sanitize AppKit connector state for WC-only deploy
```

Working tree: untracked P12 scripts/docs/reports only — **no staged app modifications**.

---

## Phase verdicts

| Phase | Verdict | Deploy? |
|-------|---------|---------|
| P12.5 Route/quote smoke | `P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_PASS` | No |
| P12.4 Runtime warnings | `P12_4_RUNTIME_WARNING_MONITOR_PASS_WITH_EXTERNAL_NOISE` | No |
| P12.2 Dependencies | `P12_2_DEPENDENCY_MONITOR_PASS` | No |
| P12.3 Font preload | `P12_3_FONT_PRELOAD_VENDOR_COSMETIC_PASS` | No |
| P12.1 Mobile WC | `P12_1_HUMAN_MOBILE_WALLETCONNECT_DEFERRED` | No |

---

## Files created

```text
scripts/audit/p12-5-route-quote-regression-smoke.mjs
scripts/audit/p12-4-runtime-warning-monitor.mjs
scripts/audit/p12-2-reown-dependency-monitor.mjs
scripts/audit/p12-3-reown-font-preload-investigation.mjs
scripts/audit/p12-1-mobile-walletconnect-assist.mjs
scripts/audit/config/p12-runtime-warning-baseline.json
ops/systemd/swaperex-route-quote-smoke.service.example
ops/systemd/swaperex-route-quote-smoke.timer.example
docs/audits/SWAPEREX_P12_*.md (5 phase audits + this closeout)
docs/audits/raw/p12*/ (evidence JSON)
reports/p12-*.json
```

---

## Files modified

**None** — application swap/routing/contract/wallet/UI source unchanged.

---

## Tests and gates

| Gate | Result |
|------|--------|
| `npm --prefix frontend run build` | PASS |
| `bash scripts/audit/verify-wrappers.sh` | PASS |
| `node scripts/audit/audit-commission-pairs.mjs` | PASS 126/0/0 |
| `.venv/bin/pytest` | PASS 119 skip 3 |
| Vitest `sanitizeAppKitPersistedState` | 2/2 PASS |
| P12.5 smoke ×2 | 19/19 PASS each |
| P12.4 monitor | PASS_WITH_EXTERNAL_NOISE |
| P12.2 `--check` | PASS |
| P12.3 font investigation | VENDOR_COSMETIC_PASS |

---

## Production changes

**None deployed.** P12 deliverables are audit scripts, monitoring tooling, and documentation.

---

## Outstanding risks

| Risk | Mitigation |
|------|------------|
| Reown/AppKit minor lockfile drift | P12.2 monitor; isolated upgrade branch before bump |
| Vendor font preload console noise | Classified cosmetic; P12.4 baseline allowlist |
| Mobile WC not human-verified | P12.1 deferred; optional operator session |

---

## Deferred operator actions

1. **P12.1** — One human mobile WalletConnect QR scan on production (optional)  
2. Install systemd timer from `ops/systemd/*.example` if desired (not done by agent)  
3. Re-run P12.5 every 6h via scheduler

---

## Recommended monitoring cadence

| Monitor | Cadence |
|---------|---------|
| P12.5 route/quote smoke | Every **6 hours** |
| P12.4 runtime warnings | Weekly or post-deploy |
| P12.2 dependency `--check` | Weekly |
| P11.2 wallet smoke | On wallet-touch releases |

---

## Recommended next phase

Hold production at `eee0264`. Next work: **P12.1 operator session** (optional) or **isolated Reown upgrade branch** when security/release notes warrant (not before full P12 gate re-run).

---

## Confirmed unchanged

Swap logic · routing · contracts · quote math · commission catalog · product design

---

## Final program verdict

`P12_PASS_WITH_OPTIONAL_MOBILE_VALIDATION_DEFERRED`
