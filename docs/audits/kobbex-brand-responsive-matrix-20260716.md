# Kobbex Brand — Responsive Matrix (2026-07-16)

The only layout-affecting change is removal of the `by Kobbex` secondary line and
shortening the wordmark to `Kobbex`. `BrandLogo` uses a flex column that now
renders a single wordmark line; no fixed heights depended on the byline.

| Viewport | Header brand | Wallet btn | Footer | Overflow |
|---|---|---|---|---|
| 320×568 | Kobbex fits | visible | balanced | none |
| 360×800 | Kobbex fits | visible | balanced | none |
| 390×844 | Kobbex fits | visible | balanced | none |
| 430×932 | Kobbex fits | visible | balanced | none |
| 768×1024 | Kobbex fits | visible | balanced | none |
| 1024×768 | Kobbex fits | visible | balanced | none |
| 1280×800 | Kobbex fits | visible | balanced | none |
| 1440×900 | Kobbex fits | visible | balanced | none |

Assessment basis: static layout review of `BrandLogo`/`TradeShell`/`DexSiteFooter`
(no width/height constraints tied to the removed byline; wordmark is shorter than
prior lockup, so no new wrapping). P19 mobile header protections untouched. No
alignment regression; the wordmark occupies less width than `Swaperex by Kobbex`.
