/**
 * Radar Service - Signal Detection Logic
 *
 * Detects actionable signals from:
 * - Quote data (price moves, liquidity)
 * - GoPlus risk data (safety changes)
 * - Price deltas over time
 *
 * No backend required - all frontend-only.
 */

import { useRadarStore, type SignalSeverity } from '@/stores/radarStore';

// Price history for detecting moves
interface PricePoint {
  tokenAddress: string;
  chainId: number;
  price: number;
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
const priceHistory: Map<string, PricePoint[]> = new Map();
const riskHistory: Map<string, RiskSnapshot> = new Map();

// Thresholds for signal detection
const PRICE_MOVE_THRESHOLD = 5; // 5% price change triggers signal
const LIQUIDITY_THRESHOLD = 10000; // $10k+ liquidity is significant
const TAX_CHANGE_THRESHOLD = 2; // 2% tax change triggers signal

// Generate cache key
function getCacheKey(tokenAddress: string, chainId: number): string {
  return `${tokenAddress.toLowerCase()}-${chainId}`;
}

/**
 * Check for price movement signals
 * Called when a new quote is received
 */
export function checkPriceMove(
  tokenAddress: string,
  tokenSymbol: string,
  chainId: number,
  currentPrice: number
): void {
  const key = getCacheKey(tokenAddress, chainId);
  const history = priceHistory.get(key) || [];
  const now = Date.now();

  // Add current price to history
  history.push({
    tokenAddress,
    chainId,
    price: currentPrice,
    timestamp: now,
  });

  // Keep only last 10 minutes of data
  const tenMinutesAgo = now - 10 * 60 * 1000;
  const recentHistory = history.filter((p) => p.timestamp > tenMinutesAgo);
  priceHistory.set(key, recentHistory);

  // Need at least 2 data points
  if (recentHistory.length < 2) return;

  // Calculate price change from oldest to newest
  const oldest = recentHistory[0];
  const newest = recentHistory[recentHistory.length - 1];
  const percentChange = ((newest.price - oldest.price) / oldest.price) * 100;

  // Check if significant move
  if (Math.abs(percentChange) >= PRICE_MOVE_THRESHOLD) {
    const isUp = percentChange > 0;
    const severity: SignalSeverity = Math.abs(percentChange) > 10 ? 'alert' : 'warning';

    useRadarStore.getState().addSignal({
      type: 'price_move',
      severity,
      tokenSymbol,
      tokenAddress,
      chainId,
      title: `${isUp ? 'Price Up' : 'Price Down'} ${Math.abs(percentChange).toFixed(1)}%`,
      description: `${tokenSymbol} ${isUp ? 'gained' : 'dropped'} ${Math.abs(percentChange).toFixed(1)}% in the last 10 minutes`,
      metadata: {
        oldValue: oldest.price,
        newValue: newest.price,
        percentChange,
        source: 'quote',
      },
    });

    // Clear history after signal to avoid repeated signals
    priceHistory.set(key, [newest]);
  }
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

  const key = getCacheKey(tokenAddress, chainId);
  const existingHistory = priceHistory.get(key);

  // Only signal if this is a "new" token for us (no price history)
  if (existingHistory && existingHistory.length > 0) return;

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
  _fromToken: { address: string; symbol: string },
  toToken: { address: string; symbol: string },
  chainId: number,
  quote: {
    rate: number;
    amountOut: number;
    provider: string;
    liquidityUSD?: number;
  }
): void {
  // Check price moves for both tokens
  if (quote.rate > 0) {
    // Rate is "1 fromToken = X toToken", so we track toToken price relative to fromToken
    checkPriceMove(toToken.address, toToken.symbol, chainId, quote.rate);
  }

  // Check liquidity if available
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
  priceHistory.clear();
  riskHistory.clear();
}
