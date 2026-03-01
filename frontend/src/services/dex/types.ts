/**
 * DEX Intelligence Types
 *
 * Shared types for DEX analysis services.
 */

export interface RouteQuote {
  provider: string;
  dexName?: string;
  amountOut: string;
  amountOutFormatted: string;
  outputAmount?: string;
  priceImpact?: number;
  gasEstimate?: number;
  estimatedGas?: number;
  feeTier?: number;
  path?: string[];
}

export interface LiquidityData {
  totalLiquidityUSD: number;
  token0Reserve: string;
  token1Reserve: string;
  poolAddress: string;
  dex: string;
  lastUpdated: number;
}

export interface PriceImpactLevel {
  level: 'low' | 'medium' | 'high' | 'extreme';
  percentage: number;
  color: string;
  warning?: string;
}

export interface SwapIntelligence {
  // Price Impact
  priceImpact: PriceImpactAnalysis;

  // Liquidity
  liquidity: LiquidityAnalysis;

  // Routes (for UI display)
  routes: RouteQuote[];

  // Route Comparison (internal analysis)
  routeComparison: {
    bestRoute: RouteQuote;
    alternativeRoute?: RouteQuote;
    savingsPercent?: number;
    savingsUSD?: number;
  };

  // Safety Score (0-100)
  safetyScore: {
    score: number;
    level: 'safe' | 'moderate' | 'risky' | 'dangerous';
    factors: SafetyFactor[];
  };

  // Metadata
  timestamp: number;
  chainId: number;
  isComplete: boolean;
}

// Re-export for UI components
export interface PriceImpactAnalysis extends PriceImpactLevel {}

export interface LiquidityAnalysis {
  totalUSD: number;
  isLow: boolean;
  warning?: string;
}

export interface SafetyFactor {
  name: string;
  score: number; // 0-25 each
  status: 'good' | 'warning' | 'danger';
  description: string;
}

// Thresholds for analysis
export const THRESHOLDS = {
  PRICE_IMPACT: {
    LOW: 1,      // < 1% = low
    MEDIUM: 3,   // 1-3% = medium
    HIGH: 5,     // 3-5% = high
    EXTREME: 10, // > 5% = extreme
  },
  LIQUIDITY: {
    LOW: 50000,      // < $50k = low liquidity warning
    MEDIUM: 100000,  // < $100k = medium
    HIGH: 500000,    // > $500k = high (good)
  },
  SAFETY_SCORE: {
    SAFE: 80,      // 80-100 = safe
    MODERATE: 60,  // 60-79 = moderate
    RISKY: 40,     // 40-59 = risky
    DANGEROUS: 0,  // 0-39 = dangerous
  },
};
