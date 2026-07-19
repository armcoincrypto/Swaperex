/**
 * P4A — Minimal revenue-oriented monitoring helpers.
 * Safe fields only; never logs wallet addresses, keys, or raw tx data.
 */

import { commissionPairKey } from '@/constants/commissionCoverage';
import { logProductionEvent } from '@/utils/productionMonitoring';

export type RevenueTelemetrySource =
  | 'featured_chip'
  | 'homepage_chip'
  | 'recovery_chip'
  | 'route_discovery'
  | 'network_selector'
  | 'quick_preset'
  | 'screener'
  | 'swap_card'
  | 'unknown';

export type RevenueTelemetryEvent =
  | 'quote_success'
  | 'pair_selected'
  | 'chain_selected'
  | 'preview_opened'
  | 'approve_clicked';

export type RevenueTelemetryFields = {
  chainId: number;
  fromSymbol?: string;
  toSymbol?: string;
  pairKey?: string;
  source?: RevenueTelemetrySource;
  provider?: string;
  feeBps?: number;
  notionalBucket?: string;
  swapCapable?: boolean;
};

/** Coarse notional bucket from human-readable amount string (no balances logged). */
export function notionalBucketFromAmount(amountStr: string | undefined): string {
  const n = parseFloat(amountStr ?? '');
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  if (n < 0.01) return 'micro';
  if (n < 0.1) return 'small';
  if (n < 1) return 'medium';
  if (n < 10) return 'large';
  return 'xlarge';
}

export function buildRevenuePairKey(
  chainId: number,
  fromSymbol: string,
  toSymbol: string,
): string {
  return commissionPairKey(chainId, fromSymbol, toSymbol);
}

export function logRevenueTelemetry(
  event: RevenueTelemetryEvent,
  fields: RevenueTelemetryFields,
): void {
  try {
    logProductionEvent(event, {
      ...fields,
      timestamp: Date.now(),
    });
  } catch {
    // never block UX
  }
}
