# Kobbex Brand — SEO & Metadata Audit (2026-07-16)

## `index.html` (static first paint)

| Tag | Value |
|---|---|
| `<title>` | `Kobbex — Self-Custody Token Swaps` |
| `meta description` | `Kobbex — self-custody token swaps … No registration.` |
| `application-name` | `Kobbex` |
| `apple-mobile-web-app-title` | `Kobbex` (added) |
| `og:title` | `Kobbex — Self-Custody Token Swaps` |
| `og:site_name` | `Kobbex` |
| `og:description` | `Self-custody token swaps … you sign every transaction.` |
| `twitter:title` / `twitter:description` | Kobbex |

Built `dist/index.html`: **0× Swaperex, 0× "by Kobbex", 7× Kobbex**.

## Client route SEO (`utils/routeSeo.ts`)

`brandPageTitle(section)` → `"{Section} — Kobbex"` (was `… — Swaperex by Kobbex`).
Per-route titles/descriptions carry Kobbex; no byline concatenation.

## Structured data (`utils/structuredData.ts`)

`Organization` and `WebSite` `name: 'Kobbex'`, `alternateName: 'Kobbex DEX'`.
FAQPage entities unchanged.

No prohibited superlative/guarantee claims added.
