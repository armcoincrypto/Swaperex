/**
 * Radar Service - Signal Detection Logic
 *
 * Detects actionable signals from:
 * - Quote data (pair quote-rate moves, liquidity)
 * - GoPlus risk data (safety changes)
 *
 * No backend required — all frontend-only.
 *
 * Quote `rate` is pair-specific (e.g. 1 unit from → X units to), not USD price.
 */

import { useRadarStore, type SignalSeverity } from '@/stores/radarStore';

/** Samples for quote-rate drift (same chain + same from/to identity). */
interface QuoteRatePoint {
  chainId: number;
  fromAddress: string;
  fromSymbol: string;
  toAddress: string;
  toSymbol: string;
  rate: number;
  timestamp: number;
}

// Risk history for detecting changes
interface RiskSnapshot {
  tokenAddress: string;
  chainId: number;
  buyTax: number;
  sellTax: number;
  isHoneypot: boolean;
  timestamp: number;
}

// In-memory caches (cleared on page refresh)
const pairQuoteRateHistory: Map<string, QuoteRatePoint[]> = new Map();
/** To-token keys that have received at least one pair quote sample (for liquidity gating). */
const toTokensWithPairQuoteSamples: Set<string> = new Set();
const riskHistory: Map<string, RiskSnapshot> = new Map();

// Thresholds for signal detection
const PRICE_MOVE_THRESHOLD = 5; // % change in quote rate triggers consideration
const LARGE_MOVE_PCT = 30; // above this requires longer same-pair history
const MIN_SAMPLES_FOR_SIGNAL = 3; // current + at least 2 prior samples
const MIN_SAMPLES_FOR_LARGE_MOVE = 5; // "verified" same-pair window for |move| > LARGE_MOVE_PCT
const LIQUIDITY_THRESHOLD = 10000; // $10k+ liquidity is significant
const TAX_CHANGE_THRESHOLD = 2; // 2% tax change triggers signal

function tokenKeyPart(address: string, symbol: string): string {
  const a = address?.trim().toLowerCase() ?? '';
  if (a.startsWith('0x') && a.length >= 42) return a;
  return `sym:${symbol.trim().toUpperCase()}`;
}

/** Stable key: same chain, from, to (direction matters). */
function getPairQuoteCacheKey(
  chainId: number,
  fromAddress: string,
  fromSymbol: string,
  toAddress: string,
  toSymbol: string,
): string {
  return [
    chainId,
    tokenKeyPart(fromAddress, fromSymbol),
    tokenKeyPart(toAddress, toSymbol),
  ].join('|');
}

// Generate cache key (risk / liquidity by single token)
function getCacheKey(tokenAddress: string, chainId: number): string {
  return `${tokenAddress.toLowerCase()}-${chainId}`;
}

function toTokenQuoteSampleKey(chainId: number, toAddress: string, toSymbol: string): string {
  return `${chainId}|${tokenKeyPart(toAddress, toSymbol)}`;
}

/**
 * Quote-rate movement (not USD price): compares oldest vs newest sample in the window
 * for the same chain + fromToken + toToken + direction.
 */
function checkQuoteRateMove(
  fromToken: { address: string; symbol: string },
  toToken: { address: string; symbol: string },
  chainId: number,
  currentRate: number,
): void {
  if (!Number.isFinite(currentRate) || currentRate <= 0) return;

  const key = getPairQuoteCacheKey(
    chainId,
    fromToken.address,
    fromToken.symbol,
    toToken.address,
    toToken.symbol,
  );

  const history = pairQuoteRateHistory.get(key) || [];
  const now = Date.now();

  history.push({
    chainId,
    fromAddress: fromToken.address,
    fromSymbol: fromToken.symbol,
    toAddress: toToken.address,
    toSymbol: toToken.symbol,
    rate: currentRate,
    timestamp: now,
  });

  const tenMinutesAgo = now - 10 * 60 * 1000;
  const recentHistory = history.filter((p) => p.timestamp > tenMinutesAgo);
  pairQuoteRateHistory.set(key, recentHistory);

  toTokensWithPairQuoteSamples.add(toTokenQuoteSampleKey(chainId, toToken.address, toToken.symbol));

  if (recentHistory.length < MIN_SAMPLES_FOR_SIGNAL) return;

  const oldest = recentHistory[0];
  const newest = recentHistory[recentHistory.length - 1];

  if (!Number.isFinite(oldest.rate) || oldest.rate <= 0) return;
  if (!Number.isFinite(newest.rate) || newest.rate <= 0) return;

  const percentChange = ((newest.rate - oldest.rate) / oldest.rate) * 100;
  if (!Number.isFinite(percentChange)) return;

  if (Math.abs(percentChange) < PRICE_MOVE_THRESHOLD) return;

  if (Math.abs(percentChange) > LARGE_MOVE_PCT && recentHistory.length < MIN_SAMPLES_FOR_LARGE_MOVE) {
    return;
  }

  const isUp = percentChange > 0;
  const severity: SignalSeverity = Math.abs(percentChange) > 10 ? 'alert' : 'warning';
  const pairLabel = `${fromToken.symbol} → ${toToken.symbol}`;

  useRadarStore.getState().addSignal({
    type: 'price_move',
    severity,
    tokenSymbol: toToken.symbol,
    tokenAddress: toToken.address,
    chainId,
    title: `${pairLabel} quote rate ${isUp ? 'up' : 'down'} ${Math.abs(percentChange).toFixed(1)}%`,
    description: `Swap quote rate for ${pairLabel} ${isUp ? 'rose' : 'fell'} ${Math.abs(percentChange).toFixed(1)}% over recent quotes (not USD market price).`,
    metadata: {
      oldValue: oldest.rate,
      newValue: newest.rate,
      percentChange,
      source: 'quote_pair_rate',
      fromSymbol: fromToken.symbol,
      toSymbol: toToken.symbol,
    },
  });

  pairQuoteRateHistory.set(key, [newest]);
}

/**
 * Check for risk/safety changes
 * Called when GoPlus data is received
 */
export function checkRiskChange(
  tokenAddress: string,
  tokenSymbol: string,
  chainId: number,
  buyTax: number,
  sellTax: number,
  isHoneypot: boolean
): void {
  const key = getCacheKey(tokenAddress, chainId);
  const previousRisk = riskHistory.get(key);

  const currentRisk: RiskSnapshot = {
    tokenAddress,
    chainId,
    buyTax,
    sellTax,
    isHoneypot,
    timestamp: Date.now(),
  };

  // Store current state
  riskHistory.set(key, currentRisk);

  // No previous data to compare
  if (!previousRisk) return;

  // Check for honeypot status change (most critical)
  if (!previousRisk.isHoneypot && isHoneypot) {
    useRadarStore.getState().addSignal({
      type: 'risk_changed',
      severity: 'alert',
      tokenSymbol,
      tokenAddress,
      chainId,
      title: 'HONEYPOT DETECTED',
      description: `${tokenSymbol} is now flagged as a honeypot - selling may be blocked`,
      metadata: {
        oldValue: 'Safe',
        newValue: 'Honeypot',
        source: 'goplus',
      },
    });
    return;
  }

  // Check for tax increases
  const buyTaxChange = buyTax - previousRisk.buyTax;
  const sellTaxChange = sellTax - previousRisk.sellTax;

  if (sellTaxChange >= TAX_CHANGE_THRESHOLD) {
    useRadarStore.getState().addSignal({
      type: 'risk_changed',
      severity: sellTaxChange >= 5 ? 'alert' : 'warning',
      tokenSymbol,
      tokenAddress,
      chainId,
      title: 'Sell Tax Increased',
      description: `${tokenSymbol} sell tax changed from ${previousRisk.sellTax}% to ${sellTax}%`,
      metadata: {
        oldValue: previousRisk.sellTax,
        newValue: sellTax,
        percentChange: sellTaxChange,
        source: 'goplus',
      },
    });
  }

  if (buyTaxChange >= TAX_CHANGE_THRESHOLD) {
    useRadarStore.getState().addSignal({
      type: 'risk_changed',
      severity: buyTaxChange >= 5 ? 'alert' : 'warning',
      tokenSymbol,
      tokenAddress,
      chainId,
      title: 'Buy Tax Increased',
      description: `${tokenSymbol} buy tax changed from ${previousRisk.buyTax}% to ${buyTax}%`,
      metadata: {
        oldValue: previousRisk.buyTax,
        newValue: buyTax,
        percentChange: buyTaxChange,
        source: 'goplus',
      },
    });
  }

  // Check for tax decreases (positive signal)
  if (sellTaxChange <= -TAX_CHANGE_THRESHOLD) {
    useRadarStore.getState().addSignal({
      type: 'risk_changed',
      severity: 'info',
      tokenSymbol,
      tokenAddress,
      chainId,
      title: 'Sell Tax Decreased',
      description: `${tokenSymbol} sell tax reduced from ${previousRisk.sellTax}% to ${sellTax}%`,
      metadata: {
        oldValue: previousRisk.sellTax,
        newValue: sellTax,
        percentChange: sellTaxChange,
        source: 'goplus',
      },
    });
  }
}

/**
 * Check for new liquidity signals
 * Called when quote shows significant liquidity
 */
export function checkLiquiditySignal(
  tokenAddress: string,
  tokenSymbol: string,
  chainId: number,
  liquidityUSD: number,
  provider: string
): void {
  // Only signal for significant new liquidity
  if (liquidityUSD < LIQUIDITY_THRESHOLD) return;

  const toKey = toTokenQuoteSampleKey(chainId, tokenAddress, tokenSymbol);
  if (toTokensWithPairQuoteSamples.has(toKey)) return;

  const severity: SignalSeverity =
    liquidityUSD > 100000 ? 'alert' : liquidityUSD > 50000 ? 'warning' : 'info';

  useRadarStore.getState().addSignal({
    type: 'liquidity_added',
    severity,
    tokenSymbol,
    tokenAddress,
    chainId,
    title: 'Liquidity Detected',
    description: `${tokenSymbol} has $${(liquidityUSD / 1000).toFixed(0)}k+ liquidity on ${provider}`,
    metadata: {
      newValue: liquidityUSD,
      source: provider,
    },
  });
}

/**
 * Process quote data to detect signals
 * Called after each successful quote
 */
export function processQuoteForSignals(
  fromToken: { address: string; symbol: string },
  toToken: { address: string; symbol: string },
  chainId: number,
  quote: {
    rate: number;
    amountOut: number;
    provider: string;
    liquidityUSD?: number;
  }
): void {
  checkQuoteRateMove(fromToken, toToken, chainId, quote.rate);

  if (quote.liquidityUSD && quote.liquidityUSD > 0) {
    checkLiquiditySignal(
      toToken.address,
      toToken.symbol,
      chainId,
      quote.liquidityUSD,
      quote.provider
    );
  }
}

/**
 * Process GoPlus security data
 * Called when security check completes
 */
export function processSecurityForSignals(
  tokenAddress: string,
  tokenSymbol: string,
  chainId: number,
  security: {
    buyTax?: number;
    sellTax?: number;
    isHoneypot?: boolean;
  }
): void {
  checkRiskChange(
    tokenAddress,
    tokenSymbol,
    chainId,
    security.buyTax || 0,
    security.sellTax || 0,
    security.isHoneypot || false
  );
}

/**
 * Clear all cached data
 * Useful for testing or when switching chains
 */
export function clearRadarCache(): void {
  pairQuoteRateHistory.clear();
  toTokensWithPairQuoteSamples.clear();
  riskHistory.clear();
}
