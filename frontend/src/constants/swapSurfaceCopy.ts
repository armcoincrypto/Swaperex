/**
 * Glossary parity: shared user-facing strings for swap card, preview, history, activity, and errors.
 * Copy only — no runtime behavior.
 */
export const SWAP_SURFACE_COPY = {
  trustLineQuoteEstimate:
    'Amounts reflect this quote (estimate). Final tokens received are confirmed on-chain.',

  /** Primary CTA when a quote must be re-fetched */
  refreshQuoteCta: 'Refresh quote',

  /** Quote fetch in progress (card output + primary button) */
  gettingQuote: 'Getting quote...',

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
} as const;
