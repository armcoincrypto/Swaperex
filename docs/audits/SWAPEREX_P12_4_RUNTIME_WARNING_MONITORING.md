# SWAPEREX P12.4 — Production Runtime Warning Monitoring

**Date:** 2026-07-10  
**Production:** https://dex.kobbex.com · commit `eee0264`  
**Verdict:** `P12_4_RUNTIME_WARNING_MONITOR_PASS_WITH_EXTERNAL_NOISE`

---

## Executive verdict

Reproducible clean-Chromium runtime monitor deployed. **No APP_FATAL / APP_ERROR / P11 regression** on live production. One classified vendor font preload warning in clean profile. **No production deployment required.**

---

## Methodology

| Profile | Description |
|---------|-------------|
| Clean Chromium | Playwright headless, no extensions — **source of truth** |
| Operator-like | Extension noise documented as `OPERATOR_ENVIRONMENT_ONLY` in baseline |

Routes: `/`, `/trust`, `/about`, `/privacy`, `/disclaimer`. Interactions: wallet modal open → WC QR → back, read-only connect, disconnect, hard refresh.

---

## Clean-browser findings

| Check | Result |
|-------|--------|
| P11 `w3m-connecting-view` crash | **Absent** |
| Blank screen | **None** |
| APP_FATAL / APP_ERROR | **0** |
| Classified vendor warnings | **1** (Reown font preload) |

---

## Operator-environment findings

Not reproduced in automation. Baseline documents (expected when MetaMask/extension present):

- `MaxListenersExceededWarning` — `BROWSER_EXTENSION`
- `ObjectMultiplex` orphaned/malformed — `WALLET_EXTENSION`

Classification: **OPERATOR_ENVIRONMENT_ONLY**

---

## Warning inventory (clean profile)

| Fingerprint | Classification | Message (sample) | Action |
|-------------|----------------|------------------|--------|
| `d270e4bdd7084c57` | COSMETIC_RESOURCE_HINT | KHTeka-Medium.woff2 preloaded not used | allow |

---

## Monitoring implementation

| Artifact | Path |
|----------|------|
| Monitor script | `scripts/audit/p12-4-runtime-warning-monitor.mjs` |
| Baseline allowlist | `scripts/audit/config/p12-runtime-warning-baseline.json` |
| JSON report | `reports/p12-4-runtime-warnings.json` |

`--strict` fails on unclassified warnings. Normal mode fails only on APP_FATAL, APP_ERROR, P11 signal, blank screen, navigation failure.

---

## Failure rules

Fail when: fatal patterns match, blank screen, strict + unknown warning. Do **not** fail on baseline-allowed vendor/extension fingerprints.

---

## Files created/modified

**Created:** monitor script, baseline config, this audit. **Modified:** none (app source).

---

## Tests run

Monitor live run: **PASS_WITH_EXTERNAL_NOISE**. Gates unchanged (no app diff).

---

## Limitations

Cannot reproduce extension IPC in headless clean profile. Portfolio/Security/Markets deep navigation not fully exercised (static routes + wallet path covered).

---

## Deployment requirement

**None.**

---

## Final verdict

`P12_4_RUNTIME_WARNING_MONITOR_PASS_WITH_EXTERNAL_NOISE`
