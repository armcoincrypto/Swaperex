# SWAPEREX P16.10 — Release Metadata and Certification Hygiene

**Program:** P16_10_RELEASE_METADATA_AND_CERTIFICATION_HYGIENE  
**Date:** 2026-07-11  
**Repository path:** `/root/Swaperex`  
**Production URL:** https://dex.kobbex.com  
**Starting production artifact:** `b6024e3`  
**Starting repository HEAD:** `c6b8ed5`  
**Final repository HEAD:** _(recorded at commit time)_

---

## Verdict

**P16_10_RELEASE_METADATA_AND_CERTIFICATION_HYGIENE_PASS**

---

## Initial warnings (from P16.9)

| # | Warning | Root cause |
|---|---------|------------|
| 1 | `version.txt` missing `environment=production` | `scripts/deploy-frontend.sh` writer omitted legacy field used by `prod-deploy.sh` |
| 2 | `post-deploy-certification.sh` false failure | `verify-live.sh` used rigid grep; live file lacked `environment=` |
| 3 | Transient Playwright install required | `playwright` not declared in `frontend/package.json` |
| 4 | Full `UnsupportedSwapNetworkExperience` not browser-tested on production | Requires connected wallet on read-only chain; no safe production injection seam |

---

## Supported version schema

Key-value lines (`key=value`), one per line. Field order is not significant. Blank lines are ignored.

### Required keys

```text
commit=<git-hash>          # 7–40 hex chars
environment=production     # production certification
```

### Optional keys (backward compatible)

```text
short=<short-hash>
branch=<branch-name>
deployed=<ISO-8601 UTC>    # legacy timestamp field retained
deployed_at=<ISO-8601 UTC> # accepted when present; not required
```

### Parser verdicts

```text
VERSION_METADATA_PASS
VERSION_METADATA_MISSING_COMMIT
VERSION_METADATA_MISSING_ENVIRONMENT
VERSION_METADATA_WRONG_ENVIRONMENT
VERSION_METADATA_MALFORMED_COMMIT
VERSION_METADATA_MALFORMED_LINE
VERSION_METADATA_DUPLICATE_KEY
VERSION_METADATA_COMMIT_MISMATCH
```

Implementation: `scripts/audit/version-metadata.mjs`  
Tests: `scripts/audit/version-metadata.test.mjs`

---

## Metadata writer changes

**File:** `scripts/deploy-frontend.sh`

Now emits backward-compatible production metadata atomically:

```text
environment=production
commit=<full-hash>
short=<short>
branch=<branch>
deployed=<UTC timestamp>
```

Uses `mktemp` + `install -m 0644` for atomic replacement.

---

## Metadata parser / certification consumer changes

| File | Change |
|------|--------|
| `scripts/audit/verify-live.sh` | Uses `version-metadata.mjs validate` instead of grep |
| `scripts/audit/post-deploy-certification.sh` | Section 5 uses schema validator |

---

## Playwright dependency decision

| Field | Value |
|-------|-------|
| Package | `playwright` (standalone Node launch API) |
| Version | `1.61.1` |
| Scope | `frontend/devDependencies` |
| Browser | Chromium only |
| Install command | `npm --prefix frontend run playwright:install` |
| Mandatory gate | `--require-browser` fails closed; no silent skip |

Documented in `frontend/DEPLOY.md`.

---

## Unsupported-network test architecture

| Approach | Decision |
|----------|----------|
| Production query override (`?forceChain=137`) | **Rejected** — production backdoor risk |
| Production wallet connect | **Rejected** — requires signatures/session |
| Pure component test | **Selected** — `UnsupportedSwapNetworkExperience` with `chainId={137}` |

**Result:** `frontend/src/components/swap/__tests__/UnsupportedSwapNetworkExperience.test.tsx`

Proves Polygon unsupported copy, unavailable swap card, no Swap execution CTA, recovery links/buttons.

**Browser production scenario:** `UNSUPPORTED_NETWORK_BROWSER_DEFERRED_UNSAFE_TO_INJECT` — URL sanitization + component tests retained; no production wallet injection.

---

## Tests and build

| Gate | Result |
|------|--------|
| Parser fixture tests | 14/14 PASS |
| Frontend tests | **42 files, 527/527 PASS** (+2 component tests) |
| Frontend build | PASS |
| P16 release certification run 1 | P16_RELEASE_CERTIFICATION_PASS |
| P16 release certification run 2 | P16_RELEASE_CERTIFICATION_PASS |
| Preview orphan check | Port 4173 free after each run |

---

## Production metadata correction

**Application artifact:** unchanged (`b6024e3`)  
**Only metadata file updated:** `/var/www/swaperex/version.txt`

### Before

```text
commit=b6024e3f21700e52ba26516bbb14edc49ce29568
short=b6024e3
branch=main
deployed=2026-07-11T15:20:32Z
```

### After

```text
environment=production
commit=b6024e3f21700e52ba26516bbb14edc49ce29568
short=b6024e3
branch=main
deployed=2026-07-11T15:20:32Z
```

Backup: `/var/www/swaperex/version.txt.backup-<timestamp>`

---

## Post-deploy certification (live)

```text
POST_DEPLOY_CERTIFICATION_PASS
```

Includes: deploy parity, verify-live, RPC scan, sourcemap scan, version schema validation.

---

## Production non-regression

| Check | Result |
|-------|--------|
| Route smoke | P16_ROUTE_SMOKE_PASS, 14/14 |
| Automated browser cert | AUTOMATED_BROWSER_PASS |
| Asset references | Unchanged (`index-BoDsFvqr.js`, etc.) |
| `version.txt` cache | `no-cache, must-revalidate` |
| Wallet signatures | None |
| Transactions | None |

---

## Product behavior

No changes to swap execution, routing, commission, chain policy, or runtime React/Web3 product code. Only test-only component coverage added.

---

## Evidence

`/root/Swaperex/reports/p16-10/20260711T164056Z/`

---

## Deferred / open

- Physical handset WalletConnect matrix: **PHYSICAL_HANDSET_DEFERRED**
- Live browser unsupported-network with connected wallet: deferred (unsafe without test seam)

---

## Recommended next phase

**P17_HISTORY_STATUS_AND_OBSERVABILITY_UX_CURRENT_STATE_AUDIT**
