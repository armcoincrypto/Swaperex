# Kobbex P21.2 — Release Lineage & View-Only CTA Enforcement

## Verdict

`KOBBEX_P21_2_RELEASE_LINEAGE_AND_VIEW_ONLY_CTA_ENFORCEMENT_PASS`

## Lineage

| Item | Value |
|------|-------|
| Canonical repo | `/root/Swaperex` |
| Audit worktree | `/root/Swaperex-route-truth-20260718` |
| Source branch | `audit/kobbex-current-route-truth-20260718` |
| Release branch | `release/kobbex-dex-brand-unification` |
| Preserved certified commit | `dfee114` |
| Final commit | `a012304` |
| Merge strategy | Fast-forward (local release `9b817c3` → `a012304`); remote release branch created at `a012304` |
| Production before | `dfee114` |
| Production after | `a012304` |
| Rollback | `/var/www/backups/swaperex-dfee114-20260718T172721Z` |

## CTA enforcement

Availability API: `frontend/src/utils/swapAvailability.ts`

- `getCertifiedRoutesForToken`
- `hasAnyCertifiedSwapRoute`
- `getSwapAvailability`
- `buildCertifiedSwapNavigation` / `selectPreferredCertifiedCounterpart`

Wired into Markets (`TokenRow`, `TokenScreener`, `MarketDiscoverySections`), Portfolio (`PortfolioTokenTable`), TradeShell handlers (screener/portfolio/radar/repeat/trading-pair), and deep-link hydrate (`useSwapUrlSync`).

Alignment: `UNCERTIFIED_CTA_TARGETS=0`, `MISMATCHES=0`.
