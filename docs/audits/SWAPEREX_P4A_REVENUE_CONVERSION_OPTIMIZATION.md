# SWAPEREX P4A — REVENUE CONVERSION OPTIMIZATION

## Baseline

| Item | Value |
|------|-------|
| Starting commit | `b66c148` (production live) |
| Mode | Copy + UX + telemetry only |
| Deploy | **NOT DEPLOYED** — awaiting approval |
| Pair audit | 126/126 PASS |
| Wrapper verify | ALL CHECKS PASSED |

## Product truth fixes

- **Footer** (`DexSiteFooter.tsx`): Split into *Swap networks: Ethereum · BNB Chain* and *Balance view: Polygon · Arbitrum · Optimism · Avalanche*.
- **Learn More** (`DexLearnMoreSection.tsx`): Routing copy states commission swaps on ETH/BSC only; other chains for balance view.
- **FAQ** (`kobbexDexLandingFaq.ts`): First answer clarifies swap vs balance networks.
- **Title / meta** (`index.html`, `routeSeo.ts`, `structuredData.ts`): Primary brand **Swaperex**; Kobbex retained as `alternateName` on legal/About paths.
- **Route discovery tabs**: Renamed *Most Used / Trending* → *Featured / High-liquidity / Audited* (catalog-based, not live telemetry).

## Unsupported chain UX

- New `CommissionSwapChainBanner` on swap card when chain ∉ {1, 56} in commission mode.
- Copy: swaps available on Ethereum and BNB Chain only; current network for balance viewing.
- Switch-network CTAs to ETH/BSC; main CTA becomes *Switch to swap network*.
- Networks remain visible in selector (not hidden, no “coming soon”).

## Featured pair promotion

- New always-visible **Featured pairs** section on swap card (`FeaturedCommissionRoutes.tsx`).
- Promotes existing audited pairs only:
  - ETH: WETH ⇄ USDC, WETH ⇄ USDT, WETH ⇄ DAI
  - BSC: WBNB ⇄ USDT, WBNB ⇄ USDC, WBNB ⇄ CAKE
- Badges: Featured / Audited / High-liquidity (static catalog, not fake volume).
- On unsupported chains: shows cross-chain suggestions disabled with switch hint.
- Added WETH ⇄ DAI to `popularCommissionRoutes.ts` catalog (audit allowlist only; no new pairs).

## Fee transparency

- User-facing label **Protocol fee** → **Swaperex fee** on swap card and preview modal.
- Unified tooltip via `SWAP_SURFACE_COPY.swaperexFeeTooltip`.
- **No fee math, bps, wrapper, or min-received logic changed.**

## Telemetry additions

New persisted monitoring events (via existing `productionMonitoring` ingest):

| Event | Trigger |
|-------|---------|
| `quote_success` | Successful quote in `useSwap` |
| `pair_selected` | Featured chip, recovery chip, route discovery |
| `chain_selected` | Network selector switch |
| `preview_opened` | Preview modal open |
| `approve_clicked` | Approval flow start |

Safe fields only: `chainId`, symbols, `pairKey`, `source`, `provider`, `feeBps`, `notionalBucket`, `swapCapable`, `timestamp`. No wallet addresses or tx data.

## Files changed

| Area | Files |
|------|-------|
| Constants | `commissionChains.ts`, `featuredCommissionRoutes.ts`, `swapSurfaceCopy.ts`, `popularCommissionRoutes.ts`, `tradingIntelligence.ts`, `kobbexDexLandingFaq.ts` |
| Components | `DexSiteFooter.tsx`, `DexLearnMoreSection.tsx`, `CommissionSwapChainBanner.tsx`, `FeaturedCommissionRoutes.tsx`, `SwapInterface.tsx`, `SwapPreviewModal.tsx`, `PopularCommissionRoutes.tsx`, `RouteDiscoveryRail.tsx`, `NetworkSelector.tsx`, `swapIntelCenterModel.ts` |
| Hooks / utils | `useSwap.ts`, `revenueTelemetry.ts`, `productionMonitoring.ts`, `routeSeo.ts`, `structuredData.ts` |
| SEO | `index.html` |
| Tests | `constants/__tests__/commissionChains.test.ts` |
| Docs | This file |

## Validation

```bash
git diff --check                                    # PASS
npm --prefix frontend run build                     # PASS
bash scripts/audit/verify-wrappers.sh               # PASS
node scripts/audit/audit-commission-pairs.mjs       # 126/126 PASS
node scripts/audit/manual-qa-swap-surface.mjs         # PASS (incl. WETH/DAI, PEPE block, Polygon)
npx vitest run src/constants/__tests__/commissionChains.test.ts  # 3/3 PASS
python3 -m py_compile scripts/*.py                  # PASS
```

## Risks

| Risk | Mitigation |
|------|------------|
| Copy change confusion for balance-only users | Footer + banner explain balance vs swap |
| Featured chips on wrong chain | Disabled with explicit switch hint |
| Telemetry volume | Events use existing outbox; no third-party SDK |
| Brand rename (Kobbex → Swaperex in title) | Legal pages keep Kobbex; JSON-LD uses alternateName |

## Rollback

```bash
git revert HEAD   # after deploy, if needed
```

All changes are frontend copy/UX/telemetry only — no contracts, nginx, or pair allowlist expansion beyond catalog display for already-audited WETH/DAI.

## Deploy recommendation

**Ready for certification deploy** after:

1. Human spot-check on staging/preview: footer, banner on Polygon, featured chips, fee label in preview.
2. Confirm monitoring ingest accepts new event names (backend allowlist if applicable).
3. Explicit production deploy approval.

**Do not deploy** until sign-off — production remains on `b66c148` until `./scripts/safe-prod-deploy.sh` is run.
