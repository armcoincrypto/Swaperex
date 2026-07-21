import type {
  QuoteEconomics,
  QuoteQualityStatus,
  QuoteQualityWarning,
} from '@/utils/quoteEconomics';

export const PRICE_IMPACT_ELEVATED_BPS = 100;
export const PRICE_IMPACT_HIGH_BPS = 300;
export const PRICE_IMPACT_BLOCK_BPS = 500;
export const QUOTE_EXPIRING_WINDOW_MS = 5_000;
export const HIGH_GAS_SHARE_BPS = 200;
export const LOW_LIQUIDITY_USD_MICROS = 100_000_000_000n;

export function classifyPriceImpactBps(
  priceImpactBps: number | undefined,
): QuoteQualityStatus {
  if (priceImpactBps == null || !Number.isInteger(priceImpactBps) || priceImpactBps < 0) {
    return 'UNKNOWN';
  }
  if (priceImpactBps > PRICE_IMPACT_BLOCK_BPS) return 'BLOCKED';
  if (priceImpactBps > PRICE_IMPACT_HIGH_BPS) return 'HIGH';
  if (priceImpactBps > PRICE_IMPACT_ELEVATED_BPS) return 'ELEVATED';
  return 'NORMAL';
}

function strongestStatus(
  current: QuoteQualityStatus,
  next: QuoteQualityStatus,
): QuoteQualityStatus {
  const order: QuoteQualityStatus[] = ['NORMAL', 'UNKNOWN', 'ELEVATED', 'HIGH', 'BLOCKED'];
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

export function classifyQuoteQuality(
  quote: QuoteEconomics,
  now = Date.now(),
): Pick<QuoteEconomics, 'qualityStatus' | 'warnings'> {
  const warnings = new Set<QuoteQualityWarning>();
  let qualityStatus: QuoteQualityStatus = 'NORMAL';

  const impactStatus = classifyPriceImpactBps(quote.priceImpactBps);
  qualityStatus = strongestStatus(qualityStatus, impactStatus);
  if (impactStatus === 'UNKNOWN') warnings.add('NO_PRICE_IMPACT_DATA');
  if (impactStatus === 'HIGH' || impactStatus === 'BLOCKED') {
    warnings.add('HIGH_PRICE_IMPACT');
  }

  if (quote.expiresAt != null) {
    if (quote.expiresAt <= now) {
      warnings.add('STALE_QUOTE');
      qualityStatus = 'BLOCKED';
    } else if (quote.expiresAt - now <= QUOTE_EXPIRING_WINDOW_MS) {
      warnings.add('QUOTE_EXPIRING');
      qualityStatus = strongestStatus(qualityStatus, 'ELEVATED');
    }
  }

  if (quote.estimatedGasUnits == null || quote.estimatedGasUnits <= 0n) {
    warnings.add('NO_GAS_ESTIMATE');
    qualityStatus = strongestStatus(qualityStatus, 'UNKNOWN');
  }

  if (
    quote.netValueUsdMicros != null &&
    quote.netValueUsdMicros > 0n &&
    quote.estimatedGasUsdMicros != null &&
    quote.estimatedGasUsdMicros * 10_000n >
      quote.netValueUsdMicros * BigInt(HIGH_GAS_SHARE_BPS)
  ) {
    warnings.add('HIGH_GAS');
    qualityStatus = strongestStatus(qualityStatus, 'ELEVATED');
  }

  if (
    quote.liquidityUsdMicros != null &&
    quote.liquidityUsdMicros < LOW_LIQUIDITY_USD_MICROS
  ) {
    warnings.add('LOW_LIQUIDITY');
    qualityStatus = strongestStatus(qualityStatus, 'ELEVATED');
  }

  if (quote.hopCount > 1) warnings.add('MULTI_HOP');
  if (/degraded/i.test(quote.routeType)) {
    warnings.add('WRAPPER_DEGRADED');
    qualityStatus = strongestStatus(qualityStatus, 'HIGH');
  }

  return { qualityStatus, warnings: [...warnings].sort() };
}

export function isQuoteQualityExecutable(quote: QuoteEconomics, now = Date.now()): boolean {
  if (!quote.certified || quote.directRouter || !quote.wrapperAddress) return false;
  if (quote.qualityStatus === 'BLOCKED') return false;
  if (quote.expiresAt != null && quote.expiresAt <= now) return false;
  return true;
}
