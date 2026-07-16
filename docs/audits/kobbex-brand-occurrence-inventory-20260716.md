# Kobbex Brand — Classified Occurrence Inventory (2026-07-16)

Every `Swaperex` occurrence was classified before editing. Categories:

```
A. Public-facing brand           F. Historical audit evidence
B. Accessibility label           G. Release/tag/branch name
C. Metadata / SEO                H. External route/API/protocol identifier
D. Runtime storage key           I. Legal / historical reference
E. Internal code identifier      J. Dead / unused code
```

## A/B/C — Replaced now (public brand, a11y, metadata)

| Location | Was | Now | Cat |
|---|---|---|---|
| `constants/brand.ts` | productName/displayName/lockupShort `Swaperex`, byline `by Kobbex` | `Kobbex`, byline `''` | A/C |
| `components/brand/BrandLogo.tsx` | aria-label `Swaperex home`, byline render, `SwaperexMark` | `Kobbex home`, byline suppressed, `BrandMark` | A/B |
| `index.html` | title/description/OG/twitter/application-name `Swaperex[ by Kobbex]` | `Kobbex` | C |
| `utils/structuredData.ts` | Org/WebSite `name: 'Swaperex'` | `name: 'Kobbex'`, alternateName `Kobbex DEX` | C |
| `utils/routeSeo.ts` | "alerts on Swaperex", about byline | Kobbex | C |
| `components/layout/DexSiteFooter.tsx` | `© … {displayName} {byline}` | `© … Kobbex` | A |
| `homepage/HomepageWhySwaperex.tsx` | title "Why Swaperex" | "Why Kobbex" | A |
| `homepage/HomepageTrustStrip.tsx` | aria-label | Kobbex | B |
| `seo/DexLearnMoreSection.tsx` | aria-label + "Why Swaperex" | Kobbex | A/B |
| `history/SwapHistory.tsx` | "Recent Swaperex activity" (heading + aria) | Kobbex | A/B |
| `portfolio/ActivityPanel.tsx` | 3× activity copy | Kobbex | A |
| `types/unifiedActivity.ts` | `ACTIVITY_HISTORY_DISCLAIMER` | Kobbex | A |
| `utils/activityPresentation.ts` | journal source label `Swaperex` | `Kobbex` | A |
| `pages/TrustCenterPage.tsx` | 13× product refs | Kobbex | A |
| `pages/StaticPages.tsx` | About/Terms/Privacy/Disclaimer 9× product refs | Kobbex | A/I |
| `constants/kobbexDexLandingFaq.ts` | "Swaperex (Kobbex DEX)…" | "Kobbex…" | A |
| `constants/swapSurfaceCopy.ts` | fee label + 9× wrapper/route/trust copy | Kobbex | A |
| `config/networkCapabilities.ts` | "Swaperex wallet interface" | Kobbex | A |
| `utils/routeSupport.ts`, `utils/errors.ts` | route-support / unsupported-pair copy | Kobbex | A |
| `utils/routePresentation.ts` | route display names "via Swaperex Wrapper*" | "via Kobbex Wrapper*" | A |
| `utils/swaperexErrorClassification.ts` | 8× user-facing `userMessage` strings | Kobbex | A |
| `utils/swaperexErrorPresentation.ts` | "shown in Swaperex" suggestion | Kobbex | A |
| `services/transactionDetailService.ts` | explorer limitation note | Kobbex | A |
| `services/supportDiagnosticService.ts` | "Swaperex transaction diagnostic" | Kobbex | A |
| `components/swap/SwapInterface.tsx` | 4× tooltip/disclaimer | Kobbex | A |
| `components/swap/SwapPreviewModal.tsx` | "Swaperex fee:" | "Kobbex fee:" | A |
| `components/swap/NetworkFeeEstimateRow.tsx` | "not the Swaperex commission" | Kobbex | A |
| `components/chain/ChainWarning.tsx` | "not supported in Swaperex" | Kobbex | A |
| `components/common/TermsGateModal.tsx` | "Swaperex is a non-custodial…" | Kobbex | A |
| `components/signals/ActivityTimeline.tsx` | download filename `swaperex-activity-` | `kobbex-activity-` | A |
| `services/wallet/appkit.ts` | WalletConnect metadata name/description | Kobbex | C |
| `components/admin/AdminApp.tsx` | heading "Swaperex Admin" | "Kobbex Admin" | A(internal op) |
| `tokens/*.json` | token-list `name` | Kobbex … Token List | C |

## D — Runtime storage keys (PRESERVED, not renamed)

`swaperex-custom-tokens`, `swaperex-dismissed-hints`, and all Zustand persist keys
(`swaperex_*`) in `stores/*`, plus custom-event names `swaperex:section`,
`swaperex:navigate`. Renaming would erase existing local activity, terms
acceptance, watchlists, and preferences. Kept for backward compatibility.

## E — Internal code identifiers (PRESERVED)

`SwaperexError*` types + `normalizeSwaperexError*` functions
(`types/swaperexErrors.ts`, `utils/swaperexErrorClassification.ts`,
`utils/errors.ts`, `utils/swaperexErrorPresentation.ts`), `isSwaperexWrapper`
(`utils/commission.ts`), wrapper env typings (`vite-env.d.ts`), and internal
route-selection `selectionReason`/`reason` diagnostic strings in `hooks/useSwap.ts`
and `services/quoteAggregator.ts`. These are never rendered on a public surface
(confirmed: no `selectionReason` usage in any `.tsx`). Comments retained.

## F/G/I — Historical audits, releases, legal entity (PRESERVED)

No P19/P20/P20.1/P20.2 audit docs, git tags, release identifiers, or backup
paths were altered. No legal entity was invented; legal pages reference the
product name only.
