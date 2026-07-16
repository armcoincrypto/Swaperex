# Kobbex Brand — Manifest & PWA Audit (2026-07-16)

## Finding

No `manifest.webmanifest` / `manifest.json` is shipped, and `index.html` contains
no `<link rel="manifest">`. This app is not an installable PWA; there is no
manifest to migrate.

## PWA-adjacent labels updated

- `<meta name="application-name" content="Kobbex">`
- `<meta name="apple-mobile-web-app-title" content="Kobbex">` (added)
- WalletConnect / AppKit dApp metadata (`services/wallet/appkit.ts`):
  `name: 'Kobbex'`, `description: 'Kobbex - Web3 Token Swap Platform'`.
  This is the name shown to users inside their wallet at connection time
  (presentation metadata only — no AppKit architecture change: adapters,
  networks, projectId, and feature flags unchanged).

Existing icons, theme color, start URL, and display behavior preserved.
No duplicate manifest created.
