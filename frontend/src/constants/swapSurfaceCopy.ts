/**
 * Glossary parity: shared user-facing strings for swap card, preview, history, activity, and errors.
 * Copy only — no runtime behavior.
 */
export const SWAP_SURFACE_COPY = {
  /** One line under the Swap title — first-screen trust without duplicating the footer verbatim */
  firstVisitTrustLine:
    'Non-custodial: Swaperex never holds your funds. You review every swap and sign in your wallet — on-chain settlement is final.',

  trustLineQuoteEstimate:
    'Amounts reflect this quote (estimate). Final tokens received are confirmed on-chain.',

  /** Primary CTA when a quote must be re-fetched */
  refreshQuoteCta: 'Refresh quote',

  /** Primary CTA when allowance RPC failed (Uniswap / wrapper paths only) */
  allowanceCheckUncertainCta: 'Refresh quote',

  /** Short inline hint on the swap card when allowance read failed */
  allowanceCheckUncertainHint:
    'Could not verify token allowance from the network. Tap refresh to try again — do not approve unless the next quote still asks for approval.',

  /** Toast when auto-refreshing quote due to uncertain allowance */
  allowanceCheckUncertainToast: 'Fetching a new quote to verify your allowance…',

  /** Shown under wrapper fee % when on-chain FEE_BPS could not be read (RPC / contract) */
  wrapperFeeUnverifiedNote:
    'Could not confirm wrapper fee on-chain; showing the configured app value. Refresh or retry if this persists.',

  /** Quote fetch in progress (card output + primary button) */
  gettingQuote: 'Getting quote...',

  /** ETH native Phase 2: quote shown, wrapper execution flag off */
  quoteOnlyNoExecutionCta: 'Quote only — execution disabled',

  /** Primary CTA when the last quote request failed (no executable quote) */
  quoteFailedCta: 'Quote failed — try again',

  /** Primary CTA when the last on-chain swap attempt failed (quote may still be present) */
  swapFailedCta: 'Swap failed — try again',

  /** In-flight quote refresh (countdown chip / modal) */
  refreshing: 'Refreshing…',

  /** Background re-quote while the last good quote stays visible (Phase 2 — secondary, not primary chip) */
  refreshingQuoteSubtle: 'Refreshing quote…',

  quoteExpiredTitle: 'Quote expired',

  /** Single action label when TTL elapsed (swap card chip) */
  quoteExpiredChip: 'Quote expired · Refresh quote',

  /** Row label for aggregator / execution source */
  routeViaLabel: 'Route via',

  /** Quote API / store messaging */
  quoteExpiredDetail:
    'Quote expired (over 30 seconds old). Refresh quote to update the price.',

  /** Modal suggestion when execution failed due to stale quote */
  quoteExpiredSuggestion: 'Refresh quote, then confirm again.',

  /** Countdown tooltip (swap card) */
  quoteTtlTooltip: 'Quote TTL is 30s — refresh quote if you waited',

  /** Local history / activity success footers */
  minimumReceivedExactFooter:
    'Exact received: confirm in your wallet or on the explorer.',

  confirmedOnChainNoExact:
    'Confirmed on-chain. Exact received is not shown here — confirm in your wallet or on the explorer.',

  /** Success modal — single line under from/to summary */
  successQuoteBasisLine: 'Amounts are from the quote you signed (not decoded from the chain).',

  /** Success modal — compact on-chain disclaimer */
  successSettlementHint:
    'Settlement is final on-chain — verify exact balances in your wallet or the explorer.',

  /** Pre-sign confidence block (preview modal) */
  reviewBeforeSignTitle: 'Review before you sign',
  networkLabel: 'Network',
  quoteFreshnessLabel: 'Quote freshness',
  /** User setting: Best price vs fixed 1inch / Uniswap / Pancake */
  routePreferenceLabel: 'Route preference',
  routeExecutionLabel: 'Executes via',
  minimumReceivedLabel: 'Minimum received',
  slippageToleranceLabel: 'Slippage tolerance',
  gasLimitEstimateLabel: 'Est. gas (units)',
  /** We do not show a native-token fee estimate unless the wallet provides it at signing */
  networkFeeWalletFallback: 'Network fee is shown in your wallet before confirmation.',
  quoteFreshnessStale: 'Stale — refresh quote',

  /** Global footer — short trust detail (below primary tagline) */
  footerTrustNonCustodial:
    'Non-custodial: tokens stay in your wallet until you approve a transaction.',
  footerTrustLocalSigning: 'Transactions are signed locally in your wallet — Swaperex never receives your keys.',
  footerTrustWrapperFee:
    'Wrapper routes may include a small protocol fee taken from output on-chain; quoted receive amounts are already net where applicable.',

  /** Calmer title when risk is routing/liquidity only (not unverified contract) */
  tokenSafetyTitleInfo: 'Route & liquidity',
  tokenSafetyTitleCaution: 'Verify before you swap',

  /** Micro copy under swap card security row */
  swapCardTrustMicroLine:
    'Quotes refresh often — confirm the final amounts in your wallet before signing.',

  /** Muted footnote under grouped rate & fee rows on the swap card */
  quoteFeesFootnote:
    'Pool and route costs are reflected in the path; wrapper protocol fees (when shown) are taken from gross output on-chain — your quoted receive is already net.',
} as const;
