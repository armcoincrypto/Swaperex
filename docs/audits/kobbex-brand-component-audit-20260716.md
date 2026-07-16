# Kobbex Brand — BrandLogo Component Audit (2026-07-16)

Single reusable component updated in place; no `KobbexLogo`/`BrandLogoV2` created.

- `BrandLogo` renders the existing geometric mark + `Kobbex` wordmark.
- `SwaperexMark` → `BrandMark` (internal rename, single file).
- `by Kobbex` byline suppressed: `showByline = showParentBrand && BRAND.byline.length > 0`, and `BRAND.byline === ''`.
- Accessible name: **"Kobbex home"** (both `<Link>` and `onNavigateHome` button forms).
- Clickable → canonical Trade/home via `pageToPath('swap')`; SPA nav (`onNavigateHome`) preserves wallet state, no full reload.
- One component used in header (`TradeShell`) and footer (`DexSiteFooter`).
- `full` and `compact` variants retained (both used).

Tests: `BrandLogo.test.tsx` asserts renders `Kobbex`, accessible name `Kobbex home`, and absence of `Swaperex` / `by Kobbex`.
