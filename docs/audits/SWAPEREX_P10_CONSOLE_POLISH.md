# SWAPEREX P10 — Production Console SVG Polish

**Date:** 2026-07-09  
**Verdict:** `P10_CONSOLE_POLISH_PASS`  
**Scope:** Console hygiene only — no swap, wallet, contract, routing, or P9 homepage design changes.

---

## 1. Problem statement

Production `https://dex.kobbex.com` (commit `75b2ce7`) showed console errors while quotes worked:

```text
Error: <svg> attribute width: Unexpected end of attribute. Expected length, "".
Error: <svg> attribute height: Unexpected end of attribute. Expected length, "".
```

Stack trace referenced chunk **`property-C9JG5tag.js`**.

---

## 2. Root cause

### 2.1 `property-C9JG5tag.js` is not an app component

That chunk is **Lit Element reactive-property / lit-html** shared runtime (Google `@lit/reactive-element` + `lit-html`). It appears in the stack because Lit’s attribute binder executes:

```javascript
setAttribute(name, value ?? "")  // undefined → ""
```

The **faulty SVG attributes** originate upstream in the Reown AppKit UI graph, bundled into `vendor-reown-walletconnect-*.js`.

### 2.2 Culprit: `@reown/appkit-ui` → `wui-icon` → Phosphor web components

| Layer | Component | Issue |
|-------|-----------|-------|
| Reown UI | `wui-icon` (`@reown/appkit-ui/dist/esm/src/components/wui-icon/index.js`) | Uses `size="inherit"` in many templates (connect button, network placeholder, QR code, tooltips, etc.) |
| Icon bridge | Phosphor map (`networkPlaceholder` → `ph-globe`, `copy` → `ph-copy`, …) | For Phosphor-backed icons, renders `` `<ph-* size=${getPhosphorSize[this.size]}>` `` |
| Missing key | `getPhosphorSize` map | **No `inherit` entry** → `getPhosphorSize['inherit'] === undefined` |
| Lit binding | `property-C9JG5tag.js` | `undefined` coerced to `size=""` on `<ph-*>` |
| SVG render | `@phosphor-icons/webcomponents` | `` `<svg width="${this.size}" height="${this.size}">` `` → **`width=""` / `height=""`** |

**Not app-owned:** Grep of `frontend/src` found no `width=""`, `height=""`, or optional prop defaulting to empty string on SVG. Dynamic SVG usage (`SwapTokenAvatar`, `PortfolioAllocationDonut`, `TransferHistory`) uses numeric literals or defaulted `size = 120`.

### 2.3 Related non-SVG note (informational)

`wui-shimmer` defaults `width=""` / `height=""` for **CSS** sizing on the custom element host — not SVG. Not the reported error source.

---

## 3. Fix applied

**File:** `frontend/vite/plugins/patchReownWuiIconPhosphorSize.ts`  
**Wiring:** `frontend/vite.config.ts` (pre-transform plugin)

Build-time patch of Reown `wui-icon` only (presentation / icon sizing):

1. Add `inherit: '100%'` to the Phosphor size map (matches `wui-icon` CSS `--local-width: inherit`).
2. Bind Phosphor `size` only when a defined map value exists; otherwise omit the attribute so Phosphor keeps its default `1em`.

**Post-build verification** (`vendor-reown-walletconnect-C5lCJnV-.js`):

```javascript
inherit:"100%"}[this.size];return o?g6`<${s} size=${o} ...>`:g6`<${s} weight="..."></${s}>`
```

**Unchanged:** swap/quote logic, wallet connectors, contracts, routing, commission pairs, P9 homepage.

---

## 4. External non-actionable warnings (document only)

| Warning | Source | Action |
|---------|--------|--------|
| `ObjectMultiplex - orphaned data for stream "provider"` | MetaMask (or other injected wallet) extension messaging | **None** — extension-side; not Swaperex bundle |
| `MaxListenersExceededWarning` (`contentscript.js`, EventEmitter) | Browser extension content script | **None** — extension-side listener leak pattern |
| Reown / WalletConnect **font preload** warnings (`woff2` unused preloaded) | `@reown/appkit` vendor font loading | **None** — vendor asset strategy; cosmetic only |

These may appear alongside the SVG errors in operator consoles; they are outside Swaperex application control.

---

## 5. Validation gates

| Gate | Command | Result |
|------|---------|--------|
| Git status | `git status --short` | `M frontend/vite.config.ts`, `?? frontend/vite/` |
| Frontend build | `npm --prefix frontend run build` | **PASS** |
| Wrapper audit | `bash scripts/audit/verify-wrappers.sh` | **ALL CHECKS PASSED** |
| Commission pairs | `node scripts/audit/audit-commission-pairs.mjs` | **PASS: 126 / FAIL: 0** |
| Backend tests | `.venv/bin/pytest` | **119 passed, 3 skipped** |

---

## 6. App SVG audit (no changes required)

| Component | SVG width/height | Status |
|-----------|------------------|--------|
| `SwapTokenAvatar.tsx` | `width={48}` `height={48}` on `<img>` | OK |
| `PortfolioAllocationDonut.tsx` | `width={size}` `height={size}`, default `size=120` | OK |
| `TransferHistory.tsx` | `width={28}` `height={28}` on `<img>` | OK |
| Inline swap/radar/security icons | Tailwind `className` sizing, no empty attrs | OK |

---

## 7. Deployment note

Production at `dex.kobbex.com` still serves pre-P10 assets until the next safe deploy. Post-deploy: confirm console no longer shows SVG width/height parse errors on cold load + wallet connect affordance render.

---

## SWAPEREX_P10_CONSOLE_POLISH_REPORT

```yaml
phase: P10
title: Production Console SVG Polish
verdict: P10_CONSOLE_POLISH_PASS
production_at_audit: 75b2ce7
fix_type: build-time Reown wui-icon phosphor size patch
error_chunk_property_js: Lit runtime (not app component)
root_cause_component: @reown/appkit-ui wui-icon → @phosphor-icons/webcomponents
app_svg_issues: none
gates:
  build: PASS
  verify_wrappers: PASS
  commission_pairs: PASS (126/126)
  pytest: PASS (119 passed, 3 skipped)
external_warnings_documented:
  - ObjectMultiplex orphaned data (MetaMask extension)
  - MaxListenersExceededWarning contentscript.js (extension)
  - Reown font preload unused (vendor)
constraints_preserved:
  swap_logic: true
  wallet_logic: true
  contracts: true
  routing: true
  p9_homepage_design: true
deploy_required_for_prod_console_fix: true
```
