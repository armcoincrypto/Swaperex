# SWAPEREX P12.2 — Reown/AppKit Dependency Monitoring

**Date:** 2026-07-10  
**Verdict:** `P12_2_DEPENDENCY_MONITOR_PASS`

---

## Executive verdict

Read-only inventory of Reown/AppKit/WalletConnect stack complete. Local P10/P11 mitigations verified wired. **No dependency upgrades performed.** Upstream drift noted for monitoring. **No production deployment required.**

---

## Current dependency inventory (lockfile truth)

| Package | Declared | Installed | Action |
|---------|----------|-----------|--------|
| `@reown/appkit` | ^1.8.18 | **1.8.19** | MONITOR |
| `@reown/appkit-adapter-ethers` | ^1.8.18 | 1.8.19 | HOLD |
| `@walletconnect/ethereum-provider` | ^2.23.5 | **2.23.9** | MONITOR |
| `@walletconnect/sign-client` | 2.23.5 (override) | 2.23.5 | MONITOR |
| `@walletconnect/universal-provider` | 2.23.5 (override) | 2.23.5 | MONITOR |
| `ethers` | ^6.9.0 | 6.16.0 | HOLD |
| `react` / `react-dom` | ^18.2.0 | 18.3.1 | HOLD |
| `vite` | ^5.0.0 | 5.4.21 | MONITOR |

npm registry latest (2026-07-10): `@reown/appkit` and `@walletconnect/ethereum-provider` checked — minor drift vs installed; **HOLD** until isolated upgrade branch.

---

## Local mitigation inventory

| ID | File | Status |
|----|------|--------|
| p11-sanitizer | `sanitizeAppKitPersistedState.ts` | **PASS** |
| p11-modal-error-guard | `WalletBootstrap.tsx` | **PASS** |
| p10-svg-phosphor-patch | `patchReownWuiIconPhosphorSize.ts` | **PASS** |
| vite-patch-wiring | `vite.config.ts` | **PASS** |
| appkit-init | `appkit.ts` (`enableInjected: false`) | **PASS** |

---

## Upgrade-sensitive areas

- `w3m-connecting-view` / modal router persistence
- `wui-icon` Phosphor sizing (P10 patch)
- KHTeka font preload injection
- WC-only connector config (`enableEIP6963: false`, `enableCoinbase: false`)

---

## Automated monitor

```bash
node scripts/audit/p12-2-reown-dependency-monitor.mjs
node scripts/audit/p12-2-reown-dependency-monitor.mjs --check
```

Policy violations: missing packages, unwired local patches. **Does not** run `npm install`.

---

## Future isolated upgrade plan

1. Dedicated branch from `eee0264`
2. Upgrade **one family** at a time
3. Gates: build, wrappers, commission 126/0, pytest, P12.5, P12.4, P11.2
4. Confirm P10 SVG + P11 sanitizer/guard
5. Operator approval before prod deploy

**Not executed in P12.2.**

---

## Files created/modified

**Created:** `scripts/audit/p12-2-reown-dependency-monitor.mjs`, this audit. **Modified:** none.

---

## Tests run

`--check`: **PASS** (0 policy violations). No upgrades applied.

---

## Limitations

Full transitive `@reown/*` tree documented in JSON report; Lit/Phosphor are nested vendor deps (not direct).

---

## Production change

**None.**

---

## Final verdict

`P12_2_DEPENDENCY_MONITOR_PASS`
