# Kobbex Brand — Route & Shell Matrix (2026-07-16)

Live validation via `curl --resolve dex.kobbex.com:443:127.0.0.1` after deploy of
`78c0aaf`.

| Route | HTTP | Shell | Brand | Notes |
|---|---|---|---|---|
| `/` (Trade/home) | 200 | SPA | Kobbex | canonical home |
| `/portfolio` | 200 | SPA | Kobbex | |
| `/radar` (Security) | 200 | SPA | Kobbex | |
| `/screener` (Markets) | 200 | SPA | Kobbex | |
| `/about` | 200 | SPA | Kobbex | "What is Kobbex?" |
| `/trust` (Trust Center) | 200 | SPA | Kobbex | product refs → Kobbex |
| `/terms` | 200 | SPA | Kobbex | |
| `/privacy` | 200 | SPA | Kobbex | |
| `/disclaimer` | 200 | SPA | Kobbex | |
| `/nonexistent-xyz` (404 route) | 200 | SPA | Kobbex | client 404 boundary via SPA fallback |

- Live `index.html`: 7× Kobbex, **0× Swaperex, 0× "by Kobbex"**.
- Live HTML asset references: 3 assets, **all present in deployed `dist` (0 missing)** — no stale/mixed chunks.
- Header/footer brand rendered from single `BrandLogo` (one header, one main, one footer landmark per page — unchanged from P20.2).
- Direct route reload: server returns SPA `index.html` (200) for all paths.
