/**
 * Glossary parity: shared user-facing strings for swap card, preview, history, activity, and errors.
 * Copy only — no runtime behavior.
 */
export const SWAP_SURFACE_COPY = {
  /** One line under the Swap title — first-screen trust without duplicating the footer verbatim */
  firstVisitTrustLine:
    'Non-custodial swap. Review and sign locally in your wallet — quotes are estimates until confirmed on-chain.',

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

  /** Primary CTA when the last quote request failed (no executable quote) */
  quoteFailedCta: 'Quote failed — try again',

  /** Primary CTA when the last on-chain swap attempt failed (quote may still be present) */
  swapFailedCta: 'Swap failed — try again',

  /** In-flight quote refresh (countdown chip / modal) */
  refreshing: 'Refreshing…',

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
} as const;
