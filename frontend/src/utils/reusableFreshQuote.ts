import type { AggregatedQuote, QuoteRouteMode } from '@/services/quoteAggregator';
import type { UniswapWrapperV3QuoteResult } from '@/services/uniswapWrapperQuoteV3';
import { QUOTE_FRESHNESS_TTL_MS } from '@/utils/quoteFreshness';

/** Minimal quote shape for preview reuse checks (avoids circular import with useSwap). */
export type PreviewReuseQuote = {
  success: boolean;
  quoteTimestamp: number;
  fromSymbol: string;
  toSymbol: string;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  provider: string;
  routeMode: QuoteRouteMode;
  allowanceCheckUncertain?: boolean;
  aggregatedQuote?: AggregatedQuote;
};

export type SwapStatusForReuse =
  | 'idle'
  | 'fetching_quote'
  | 'checking_allowance'
  | 'previewing'
  | 'approving'
  | 'swapping'
  | 'confirming'
  | 'success'
  | 'error';

/** Aligns with `useSwap` confirmSwap — quote valid through 30s inclusive. */
export const QUOTE_PREVIEW_REUSE_MAX_AGE_MS = QUOTE_FRESHNESS_TTL_MS;

export type ReusableFreshQuoteReason =
  | 'reusable'
  | 'no_quote'
  | 'quote_not_successful'
  | 'quote_expired'
  | 'wrong_status'
  | 'quote_fetch_in_progress'
  | 'allowance_check_uncertain'
  | 'chain_mismatch'
  | 'from_token_mismatch'
  | 'to_token_mismatch'
  | 'amount_mismatch'
  | 'provider_mismatch'
  | 'route_mode_mismatch'
  | 'route_path_fingerprint_mismatch'
  | 'input_fingerprint_mismatch'
  | 'wallet_mismatch'
  | 'commission_mode_mismatch'
  | 'missing_capture_context';

export type ReusableFreshQuoteResult = {
  reusable: boolean;
  reason: ReusableFreshQuoteReason;
  quoteAgeMs: number | null;
};

/** Deterministic route/path identity for the quoted execution path. */
export function getQuoteRoutePathFingerprint(quote: PreviewReuseQuote): string {
  const agg = quote.aggregatedQuote;
  if (!agg) {
    return `${quote.provider}|${quote.routeMode}`;
  }

  const pd = agg.providerDetails;
  if (pd.wrapperV3Path) {
    const oq = agg.originalQuote as UniswapWrapperV3QuoteResult | undefined;
    const tiers = oq?.v3FeeTiers?.join('-') ?? '';
    return `v3|${pd.wrapperV3Path}|${tiers}|${quote.routeMode}`;
  }

  if (pd.feeTier != null) {
    return `${quote.provider}|fee:${pd.feeTier}|${quote.routeMode}`;
  }

  return `${quote.provider}|${quote.routeMode}`;
}

export type ReusableFreshQuoteParams = {
  quote: PreviewReuseQuote | null;
  status: SwapStatusForReuse;
  chainId: number;
  address: string | undefined;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  routeMode: QuoteRouteMode;
  quoteInputFingerprint: string;
  quoteCapturedInputFingerprint: string | null;
  quoteCapturedWallet: string | null;
  quoteCapturedRouteFingerprint: string | null;
  quoteCapturedCommissionRequired: boolean | null;
  commissionRequired: boolean;
  now?: number;
};

/**
 * P4.4-K1 — True only when the on-screen quote is safe to reuse for preview open
 * without a second `fetchSwapQuote()` round trip.
 */
export function isReusableFreshQuote(params: ReusableFreshQuoteParams): ReusableFreshQuoteResult {
  const {
    quote,
    status,
    chainId,
    address,
    fromSymbol,
    toSymbol,
    fromAmount,
    routeMode,
    quoteInputFingerprint,
    quoteCapturedInputFingerprint,
    quoteCapturedWallet,
    quoteCapturedRouteFingerprint,
    quoteCapturedCommissionRequired,
    commissionRequired,
    now = Date.now(),
  } = params;

  const fail = (
    reason: Exclude<ReusableFreshQuoteReason, 'reusable'>,
    quoteAgeMs: number | null = quote?.quoteTimestamp != null ? now - quote.quoteTimestamp : null,
  ): ReusableFreshQuoteResult => ({ reusable: false, reason, quoteAgeMs });

  if (!quote) return fail('no_quote', null);
  if (!quote.success) return fail('quote_not_successful');

  const quoteAgeMs = quote.quoteTimestamp != null ? now - quote.quoteTimestamp : null;
  if (quoteAgeMs == null || quoteAgeMs >= QUOTE_PREVIEW_REUSE_MAX_AGE_MS) {
    return fail('quote_expired', quoteAgeMs);
  }

  if (status === 'fetching_quote' || status === 'checking_allowance') {
    return fail('quote_fetch_in_progress', quoteAgeMs);
  }
  if (status !== 'previewing') return fail('wrong_status', quoteAgeMs);
  if (quote.allowanceCheckUncertain) return fail('allowance_check_uncertain', quoteAgeMs);

  if (quoteCapturedInputFingerprint == null || quoteCapturedWallet == null || quoteCapturedRouteFingerprint == null) {
    return fail('missing_capture_context', quoteAgeMs);
  }

  if (quoteCapturedCommissionRequired != null && quoteCapturedCommissionRequired !== commissionRequired) {
    return fail('commission_mode_mismatch', quoteAgeMs);
  }

  const quoteChainId = quote.aggregatedQuote?.chainId ?? chainId;
  if (quoteChainId !== chainId) return fail('chain_mismatch', quoteAgeMs);

  if (quote.fromSymbol !== fromSymbol || quote.from_asset !== fromSymbol) {
    return fail('from_token_mismatch', quoteAgeMs);
  }
  if (quote.toSymbol !== toSymbol || quote.to_asset !== toSymbol) {
    return fail('to_token_mismatch', quoteAgeMs);
  }
  if (quote.from_amount !== fromAmount) return fail('amount_mismatch', quoteAgeMs);
  if (quote.routeMode !== routeMode) return fail('route_mode_mismatch', quoteAgeMs);

  const currentRouteFp = getQuoteRoutePathFingerprint(quote);
  if (currentRouteFp !== quoteCapturedRouteFingerprint) {
    return fail('route_path_fingerprint_mismatch', quoteAgeMs);
  }

  if (quoteInputFingerprint !== quoteCapturedInputFingerprint) {
    return fail('input_fingerprint_mismatch', quoteAgeMs);
  }

  const wallet = address?.toLowerCase();
  const capturedWallet = quoteCapturedWallet.toLowerCase();
  if (!wallet || wallet !== capturedWallet) return fail('wallet_mismatch', quoteAgeMs);

  return { reusable: true, reason: 'reusable', quoteAgeMs };
}
