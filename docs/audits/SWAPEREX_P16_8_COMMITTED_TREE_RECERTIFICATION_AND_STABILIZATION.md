# SWAPEREX P16.8 — Committed-Tree Recertification and Stabilization

**Program:** P16.8_COMMITTED_TREE_RECERTIFICATION_AND_STABILIZATION  
**Date:** 2026-07-11  
**Repository path:** `/root/Swaperex`  
**Production baseline:** `eee0264` — https://dex.kobbex.com  
**Starting HEAD:** `7765fd5bffce2aa8d4c1769618f7309cfedb3097`  
**Deployed:** No

---

## Verdict

**P16_8_COMMITTED_TREE_RECERTIFICATION_AND_STABILIZATION_PASS**

---

## Initial failure

```text
P16_RELEASE_CERTIFICATION_FAIL
fail=1 warn=0

P16_ROUTE_SMOKE_FAIL
TypeError: fetch failed
Base URL: http://127.0.0.1:4173
12/12 routes failed identically

P16_MOBILE_WC_SKIPPED (--skip-browser in release runner)
```

---

## Root cause

**Category A — Release-runner lifecycle defect (confirmed)**

| Question | Answer |
|----------|--------|
| Does `p16-release-certify.sh` start preview? | **No** (before P16.8) |
| Wait until ready? | **No** |
| Detect startup failure? | **No** |
| Clean up preview? | **No** |
| Preserve logs on failure? | Partial (certify log only) |
| Route smoke distinguish connection vs route? | **No** (before P16.8) |
| Mobile cert runs browser by default? | Yes, but runner passed `--skip-browser` |
| `--skip-browser` treated as pass? | **Yes** (WARN only, exit 0) |
| JSON evidence deterministic? | Timestamps change each run |

**Reproduction:**

```bash
# Port free — curl fails
curl -fsS -I http://127.0.0.1:4173
# curl: (7) Failed to connect

node scripts/audit/p16-route-navigation-smoke.mjs --base-url http://127.0.0.1:4173
# P16_ROUTE_SMOKE_FAIL failCount=12 TypeError: fetch failed (all routes)
```

**Not an application routing defect** — manual preview + smoke passes after fix.

---

## Reproduction steps (post-fix validation)

```bash
bash scripts/release/p16-release-certify.sh
# Starts preview → waits → smoke → browser cert → P13 dry-run → cleanup

bash scripts/release/p16-release-certify.sh  # repeatability run 2 — PASS
ss -ltnp | grep ':4173'  # empty after each run
```

---

## Fixes

1. **`p16-release-certify.sh`** — Self-contained preview lifecycle: port check, `setsid` start, bounded readiness poll (30s), route + browser gates, `trap` cleanup, no `--skip-browser`.
2. **`p16-route-navigation-smoke.mjs`** — Connection vs HTTP vs content failure kinds; 14 routes including BSC deep link and portfolio hash; `P16_ROUTE_SMOKE_CONNECTION_FAILURE` when all routes refuse connection.
3. **`p16-mobile-walletconnect-cert.mjs`** — `--require-browser` fails on skip; Playwright dependency check; `automatedVerdict` / `physicalHandsetVerdict` separation.

---

## Preview lifecycle design

```text
1. Check port 4173 free (fail if occupied by unknown process)
2. setsid npm --prefix frontend run preview -- --host 127.0.0.1 --port 4173
3. Poll curl http://127.0.0.1:4173/ up to 30s
4. Run route smoke + browser cert against live preview
5. trap EXIT/INT/TERM → kill preview process group → wait
```

Logs: `reports/p16/release-certification/preview-<stamp>.log`

---

## Route validation result

```text
P16_ROUTE_SMOKE_PASS
failCount=0
routeCount=14
```

---

## Mobile browser result

```text
automatedVerdict: AUTOMATED_BROWSER_PASS
physicalHandsetVerdict: PHYSICAL_HANDSET_DEFERRED
verdict: P16_MOBILE_WC_CONNECTIVITY_ASSIST_PASS
```

WalletConnect QR, deep-link entry, Connect CTA, network selector: **PASS** at 360×800, 390×844, 430×932, 768×1024.

---

## Tests

| Gate | Result |
|------|--------|
| Vitest | 41 files, **525/525 PASS** |
| Frontend build | **PASS** |
| P13 release cert (dry-run) | **RELEASE_CERTIFICATION_PASS** |
| P16 release cert run 1 | **P16_RELEASE_CERTIFICATION_PASS** fail=0 |
| P16 release cert run 2 | **P16_RELEASE_CERTIFICATION_PASS** fail=0 |

---

## Repeatability

| Check | Run 1 | Run 2 |
|-------|-------|-------|
| Verdict | PASS | PASS |
| Port 4173 after cleanup | Free | Free |
| Orphan preview processes | None | None |

---

## Artifact policy

| Path | Policy |
|------|--------|
| `reports/p16-route-navigation-smoke.json` | Tracked — latest cert snapshot |
| `reports/p16-mobile-walletconnect-cert.json` | Tracked — latest cert snapshot |
| `reports/p16/release-certification/` | Untracked timestamped logs (like `reports/p13/`) |
| `docs/audits/raw/p14/`, `post-p14/` | Untracked historical — **not** in P16.8 commits |

No `.gitignore` changes in P16.8.

---

## Files changed (P16.8)

- `scripts/release/p16-release-certify.sh`
- `scripts/audit/p16-route-navigation-smoke.mjs`
- `scripts/audit/p16-mobile-walletconnect-cert.mjs`
- `reports/p16-route-navigation-smoke.json`
- `reports/p16-mobile-walletconnect-cert.json`
- `docs/audits/SWAPEREX_P16_8_COMMITTED_TREE_RECERTIFICATION_AND_STABILIZATION.md`

**No application source modified.**

---

## Open findings

| ID | Item |
|----|------|
| P16-WC-HANDSET | Physical MetaMask/Trust pairing |
| P14-F004 | Reown chunk size |
| P14-F006 | Public status page |
| P14-F007 | Persistent tx history |

---

## Rollback

Revert P16.8 commits. Production remains `eee0264`. No deploy performed.

---

## Deployment readiness

**READY for P16.9 controlled production deploy** (certification gates pass on committed tree; deploy not executed in P16.8).

**Recommended next phase:** `P16.9_P15_P16_CONTROLLED_PRODUCTION_DEPLOYMENT_AND_POST_DEPLOY_VALIDATION`

---

*Certification completed 2026-07-11 UTC. No production mutation.*
