# SWAPEREX P12.3 — Vendor Font Preload Investigation

**Date:** 2026-07-10  
**Production:** https://dex.kobbex.com · commit `eee0264`  
**Verdict:** `P12_3_FONT_PRELOAD_VENDOR_COSMETIC_PASS`

---

## Executive verdict

Warning reproduced on live production when AppKit modal opens. **Root cause is Reown-controlled lazy font preload**, not Swaperex HTML. Fonts are requested and used after modal open. **No code change; no production deployment.**

---

## Warning reproduced

```text
The resource https://fonts.reown.com/KHTeka-Medium.woff2 was preloaded using link preload
but not used within a few seconds from the window's load event.
```

---

## Ownership / root cause

| Finding | Detail |
|---------|--------|
| Owner | **VENDOR_REOWN** (AppKit modal runtime) |
| Injector | Reown AppKit when wallet modal opens — not in Swaperex `index.html` |
| Cold load without modal | **No** preload tags, **no** warning |
| After modal open | 8 preload tags + 7 font GET requests; warning appears |
| Standards | `as="font"`, `type="font/woff2"`, `crossorigin="anonymous"` — correct |

**Conclusion:** Modal lazy-load timing vs document `load` event — browser resource-hint warning, not app misconfiguration.

---

## Performance impact

| Metric | Value |
|--------|-------|
| Cold homepage load | ~2143ms |
| LCP/CLS/INP regression | **None measured** |
| User-visible impact | **None** |

---

## Decision

`VENDOR_COSMETIC_NO_ACTION` — do not suppress globally; do not patch vendor bundles.

---

## Implementation

| Artifact | Path |
|----------|------|
| Investigation script | `scripts/audit/p12-3-reown-font-preload-investigation.mjs` |
| JSON report | `reports/p12-3-font-preload.json` |

---

## Files created/modified

**Created:** investigation script, this audit. **Modified:** none.

---

## Tests run

Live investigation: **PASS**. Application gates unchanged.

---

## Production deployment requirement

**None.**

---

## Final verdict

`P12_3_FONT_PRELOAD_VENDOR_COSMETIC_PASS`
