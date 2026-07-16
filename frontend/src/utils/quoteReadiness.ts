/**
 * P18.3 — Canonical quote / execution readiness states (display + CTA gating).
 */

export type QuoteReadinessState =
  | 'QUOTE_READY'
  | 'QUOTE_READY_GAS_UNAVAILABLE'
  | 'INSUFFICIENT_GAS'
  | 'QUOTE_EXPIRED'
  | 'ROUTE_UNAVAILABLE'
  | 'APPROVAL_REQUIRED'
  | 'READY_TO_SIGN'
  | 'NO_QUOTE'
  | 'LOADING';

export type QuoteReadinessInput = {
  hasQuote: boolean;
  isQuoteLoading: boolean;
  isQuoteExpired: boolean;
  routeUnavailable: boolean;
  gasPriceAvailable: boolean;
  /** True when fee estimate completed (live or fallback attempt finished). */
  feeEstimateSettled: boolean;
  insufficientGas: boolean;
  needsApproval: boolean;
  /** Preview opened and user may proceed to wallet (post-preview path). */
  previewConfirmed?: boolean;
};

export type QuoteReadinessResult = {
  state: QuoteReadinessState;
  /** Short status chip / strip label */
  publicLabel: string;
  /** Supporting sentence for gas-unavailable or affordability */
  helperText: string | null;
  /** Whether primary CTA may open preview / continue toward signing */
  canProceedToPreview: boolean;
  /** Whether UI may present a fully "safe/ready to sign" affordance */
  fullyReady: boolean;
};

/**
 * Precedence: loading → no quote → route unavailable → expired → insufficient gas →
 * gas unavailable → approval → ready to sign / quote ready.
 */
export function resolveQuoteReadiness(input: QuoteReadinessInput): QuoteReadinessResult {
  if (input.isQuoteLoading && !input.hasQuote) {
    return {
      state: 'LOADING',
      publicLabel: 'Getting quote…',
      helperText: null,
      canProceedToPreview: false,
      fullyReady: false,
    };
  }

  if (input.routeUnavailable) {
    return {
      state: 'ROUTE_UNAVAILABLE',
      publicLabel: 'Route unavailable',
      helperText: 'A route is not currently guaranteed for this pair. Availability depends on current liquidity.',
      canProceedToPreview: false,
      fullyReady: false,
    };
  }

  if (!input.hasQuote) {
    return {
      state: 'NO_QUOTE',
      publicLabel: 'Enter amount',
      helperText: null,
      canProceedToPreview: false,
      fullyReady: false,
    };
  }

  if (input.isQuoteExpired) {
    return {
      state: 'QUOTE_EXPIRED',
      publicLabel: 'Quote expired',
      helperText: 'Refresh the quote before continuing.',
      canProceedToPreview: false,
      fullyReady: false,
    };
  }

  if (input.insufficientGas) {
    return {
      state: 'INSUFFICIENT_GAS',
      publicLabel: 'Insufficient gas',
      helperText: null,
      canProceedToPreview: false,
      fullyReady: false,
    };
  }

  // Material network cost unknown — do not present full readiness.
  if (input.feeEstimateSettled && !input.gasPriceAvailable) {
    return {
      state: 'QUOTE_READY_GAS_UNAVAILABLE',
      publicLabel: 'Quote ready — network fee unavailable',
      helperText: 'Your wallet will show the final network fee before signing.',
      canProceedToPreview: true,
      fullyReady: false,
    };
  }

  if (input.needsApproval && !input.previewConfirmed) {
    return {
      state: 'APPROVAL_REQUIRED',
      publicLabel: 'Approval required',
      helperText: 'Token allowance must be approved before the swap.',
      canProceedToPreview: true,
      fullyReady: false,
    };
  }

  if (input.previewConfirmed && input.gasPriceAvailable) {
    return {
      state: 'READY_TO_SIGN',
      publicLabel: 'Ready to sign',
      helperText: null,
      canProceedToPreview: true,
      fullyReady: true,
    };
  }

  return {
    state: 'QUOTE_READY',
    publicLabel: 'Quote ready',
    helperText: null,
    canProceedToPreview: true,
    fullyReady: Boolean(input.gasPriceAvailable),
  };
}
