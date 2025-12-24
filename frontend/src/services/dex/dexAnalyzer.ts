/**
 * DEX Analyzer Service
 *
 * Computes swap intelligence metrics:
 * - Price impact analysis
 * - Safety score calculation
 * - Risk assessment
 */

import {
  type PriceImpactLevel,
  type SafetyFactor,
  type SwapIntelligence,
  type RouteQuote,
  THRESHOLDS,
} from './types';

/**
 * Analyze price impact and return level/color
 */
export function analyzePriceImpact(impactPercent: number): PriceImpactLevel {
  const percentage = Math.abs(impactPercent);

  if (percentage < THRESHOLDS.PRICE_IMPACT.LOW) {
    return {
      level: 'low',
      percentage,
      color: 'text-green-400',
    };
  }

  if (percentage < THRESHOLDS.PRICE_IMPACT.MEDIUM) {
    return {
      level: 'medium',
      percentage,
      color: 'text-yellow-400',
      warning: 'Moderate price impact',
    };
  }

  if (percentage < THRESHOLDS.PRICE_IMPACT.HIGH) {
    return {
      level: 'high',
      percentage,
      color: 'text-orange-400',
      warning: 'High price impact - consider smaller trade',
    };
  }

  return {
    level: 'extreme',
    percentage,
    color: 'text-red-400',
    warning: 'Extreme price impact - you may lose significant value',
  };
}

/**
 * Analyze liquidity depth
 */
export function analyzeLiquidity(liquidityUSD: number): {
  totalUSD: number;
  isLow: boolean;
  warning?: string;
} {
  if (liquidityUSD < THRESHOLDS.LIQUIDITY.LOW) {
    return {
      totalUSD: liquidityUSD,
      isLow: true,
      warning: 'Low liquidity - high slippage risk',
    };
  }

  if (liquidityUSD < THRESHOLDS.LIQUIDITY.MEDIUM) {
    return {
      totalUSD: liquidityUSD,
      isLow: false,
      warning: 'Moderate liquidity',
    };
  }

  return {
    totalUSD: liquidityUSD,
    isLow: false,
  };
}

/**
 * Calculate route comparison
 */
export function compareRoutes(
  bestRoute: RouteQuote,
  alternativeRoute?: RouteQuote
): {
  bestRoute: RouteQuote;
  alternativeRoute?: RouteQuote;
  savingsPercent?: number;
  savingsUSD?: number;
} {
  if (!alternativeRoute) {
    return { bestRoute };
  }

  const bestAmount = parseFloat(bestRoute.amountOutFormatted);
  const altAmount = parseFloat(alternativeRoute.amountOutFormatted);

  if (bestAmount <= 0 || altAmount <= 0) {
    return { bestRoute, alternativeRoute };
  }

  const savingsPercent = ((bestAmount - altAmount) / altAmount) * 100;

  return {
    bestRoute,
    alternativeRoute,
    savingsPercent: Math.max(0, savingsPercent),
  };
}

/**
 * Calculate individual safety factors
 */
function calculateSafetyFactors(
  priceImpact: PriceImpactLevel,
  liquidityUSD: number,
  slippage: number,
  routeSavings?: number
): SafetyFactor[] {
  const factors: SafetyFactor[] = [];

  // Factor 1: Price Impact (0-25 points)
  let priceImpactScore = 25;
  if (priceImpact.level === 'medium') priceImpactScore = 18;
  else if (priceImpact.level === 'high') priceImpactScore = 10;
  else if (priceImpact.level === 'extreme') priceImpactScore = 0;

  factors.push({
    name: 'Price Impact',
    score: priceImpactScore,
    status: priceImpactScore >= 18 ? 'good' : priceImpactScore >= 10 ? 'warning' : 'danger',
    description: `${priceImpact.percentage.toFixed(2)}% impact`,
  });

  // Factor 2: Liquidity Depth (0-25 points)
  let liquidityScore = 25;
  if (liquidityUSD < THRESHOLDS.LIQUIDITY.LOW) liquidityScore = 5;
  else if (liquidityUSD < THRESHOLDS.LIQUIDITY.MEDIUM) liquidityScore = 15;
  else if (liquidityUSD < THRESHOLDS.LIQUIDITY.HIGH) liquidityScore = 20;

  factors.push({
    name: 'Liquidity',
    score: liquidityScore,
    status: liquidityScore >= 20 ? 'good' : liquidityScore >= 15 ? 'warning' : 'danger',
    description: liquidityUSD >= 1000
      ? `$${(liquidityUSD / 1000).toFixed(0)}k available`
      : `$${liquidityUSD.toFixed(0)} available`,
  });

  // Factor 3: Slippage Tolerance (0-25 points)
  let slippageScore = 25;
  if (slippage > 5) slippageScore = 10;
  else if (slippage > 3) slippageScore = 15;
  else if (slippage > 1) slippageScore = 20;

  factors.push({
    name: 'Slippage',
    score: slippageScore,
    status: slippageScore >= 20 ? 'good' : slippageScore >= 15 ? 'warning' : 'danger',
    description: `${slippage}% tolerance`,
  });

  // Factor 4: Route Quality (0-25 points)
  let routeScore = 20; // Base score
  if (routeSavings !== undefined && routeSavings > 0) {
    routeScore = 25; // Best route selected
  }

  factors.push({
    name: 'Route',
    score: routeScore,
    status: routeScore >= 20 ? 'good' : 'warning',
    description: routeSavings ? `${routeSavings.toFixed(2)}% better` : 'Best available',
  });

  return factors;
}

/**
 * Calculate overall safety score (0-100)
 */
export function calculateSafetyScore(factors: SafetyFactor[]): {
  score: number;
  level: 'safe' | 'moderate' | 'risky' | 'dangerous';
} {
  const score = factors.reduce((sum, f) => sum + f.score, 0);

  let level: 'safe' | 'moderate' | 'risky' | 'dangerous';
  if (score >= THRESHOLDS.SAFETY_SCORE.SAFE) level = 'safe';
  else if (score >= THRESHOLDS.SAFETY_SCORE.MODERATE) level = 'moderate';
  else if (score >= THRESHOLDS.SAFETY_SCORE.RISKY) level = 'risky';
  else level = 'dangerous';

  return { score, level };
}

/**
 * Generate complete swap intelligence analysis
 */
export function analyzeSwap(
  priceImpactPercent: number,
  liquidityUSD: number,
  slippage: number,
  bestRoute: RouteQuote,
  alternativeRoute?: RouteQuote,
  chainId: number = 1
): SwapIntelligence {
  // Analyze price impact
  const priceImpact = analyzePriceImpact(priceImpactPercent);

  // Analyze liquidity
  const liquidity = analyzeLiquidity(liquidityUSD);

  // Compare routes
  const routeComparison = compareRoutes(bestRoute, alternativeRoute);

  // Calculate safety factors
  const factors = calculateSafetyFactors(
    priceImpact,
    liquidityUSD,
    slippage,
    routeComparison.savingsPercent
  );

  // Calculate overall safety score
  const safetyScore = {
    ...calculateSafetyScore(factors),
    factors,
  };

  // Build routes array for UI display
  const routes: RouteQuote[] = [bestRoute];
  if (alternativeRoute) {
    routes.push(alternativeRoute);
  }

  return {
    priceImpact,
    liquidity,
    routes,
    routeComparison,
    safetyScore,
    timestamp: Date.now(),
    chainId,
    isComplete: true,
  };
}

/**
 * Create empty/loading intelligence state
 */
export function createEmptyIntelligence(chainId: number = 1): SwapIntelligence {
  const emptyRoute: RouteQuote = {
    provider: '',
    amountOut: '0',
    amountOutFormatted: '0',
    priceImpact: 0,
    gasEstimate: 0,
    feeTier: 0,
    path: [],
  };

  return {
    priceImpact: {
      level: 'low',
      percentage: 0,
      color: 'text-dark-400',
    },
    liquidity: {
      totalUSD: 0,
      isLow: false,
    },
    routes: [],
    routeComparison: {
      bestRoute: emptyRoute,
    },
    safetyScore: {
      score: 0,
      level: 'moderate',
      factors: [],
    },
    timestamp: Date.now(),
    chainId,
    isComplete: false,
  };
}

/**
 * High-level swap analysis from swap context
 * This is the main entry point called from SwapInterface
 */
export async function analyzeSwapFromContext(
  fromAsset: { symbol: string; contract_address?: string; is_native?: boolean },
  toAsset: { symbol: string; contract_address?: string },
  _fromAmount: string, // Reserved for future volume-based analysis
  toAmount: string,
  priceImpactPercent: number,
  chainId: number,
  slippage: number = 0.5
): Promise<SwapIntelligence> {
  // Import liquidity service dynamically to avoid circular deps
  const { getSwapPairLiquidity, estimateLiquidityFromQuote } = await import('./dexLiquidityService');

  // Try to get actual liquidity data
  let liquidityUSD = 0;
  try {
    const liquidityData = await getSwapPairLiquidity(
      fromAsset.contract_address || '',
      toAsset.contract_address || '',
      chainId
    );
    liquidityUSD = liquidityData.totalUSD;
  } catch (err) {
    // Fallback: estimate from quote amount
    liquidityUSD = estimateLiquidityFromQuote(parseFloat(toAmount));
  }

  // Build route quote from current swap
  const bestRoute: RouteQuote = {
    provider: 'best-route',
    dexName: 'Best Route',
    amountOut: toAmount,
    amountOutFormatted: toAmount,
    outputAmount: toAmount,
    priceImpact: priceImpactPercent,
    gasEstimate: 250000,
    estimatedGas: 2.5, // ~$2.50 in gas
    feeTier: 3000,
    path: [fromAsset.symbol, toAsset.symbol],
  };

  return analyzeSwap(
    priceImpactPercent,
    liquidityUSD,
    slippage,
    bestRoute,
    undefined,
    chainId
  );
}

export default analyzeSwap;
