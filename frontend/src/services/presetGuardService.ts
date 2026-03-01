/**
 * Preset Guard Evaluation Service
 *
 * Evaluates smart preset guards against current swap intelligence.
 * Returns warnings (soft mode) or blocks (hard mode) based on conditions.
 */

import type { PresetGuards, GuardEvaluation, GuardWarning } from '@/stores/presetStore';
import type { SwapIntelligence } from '@/services/dex/types';

/**
 * Evaluate preset guards against current intelligence
 */
export function evaluatePresetGuards(
  guards: PresetGuards | undefined,
  intelligence: SwapIntelligence | null
): GuardEvaluation {
  // Default: all passed, no warnings
  const result: GuardEvaluation = {
    passed: true,
    warnings: [],
    blocked: false,
  };

  // If guards not enabled or no intelligence, pass through
  if (!guards?.enabled || !intelligence) {
    return result;
  }

  const warnings: GuardWarning[] = [];

  // Check safety score
  if (guards.minSafetyScore !== undefined) {
    const actual = intelligence.safetyScore.score;
    if (actual < guards.minSafetyScore) {
      warnings.push({
        type: 'safety',
        message: `Safety score (${actual}) is below minimum (${guards.minSafetyScore})`,
        actual,
        threshold: guards.minSafetyScore,
      });
    }
  }

  // Check price impact
  if (guards.maxPriceImpact !== undefined) {
    const actual = intelligence.priceImpact.percentage;
    if (actual > guards.maxPriceImpact) {
      warnings.push({
        type: 'impact',
        message: `Price impact (${actual.toFixed(2)}%) exceeds maximum (${guards.maxPriceImpact}%)`,
        actual,
        threshold: guards.maxPriceImpact,
      });
    }
  }

  // Check liquidity
  if (guards.minLiquidityUsd !== undefined) {
    const actual = intelligence.liquidity.totalUSD;
    if (actual < guards.minLiquidityUsd) {
      const formatUSD = (v: number) =>
        v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`;
      warnings.push({
        type: 'liquidity',
        message: `Liquidity (${formatUSD(actual)}) is below minimum (${formatUSD(guards.minLiquidityUsd)})`,
        actual,
        threshold: guards.minLiquidityUsd,
      });
    }
  }

  // Determine result based on mode
  result.warnings = warnings;
  result.passed = warnings.length === 0;

  if (guards.mode === 'hard' && warnings.length > 0) {
    result.blocked = true;
    result.blockReason = warnings[0].message;
  }

  return result;
}

/**
 * Format guard evaluation for display
 */
export function formatGuardResult(evaluation: GuardEvaluation): {
  type: 'success' | 'warning' | 'blocked';
  title: string;
  messages: string[];
} {
  if (evaluation.blocked) {
    return {
      type: 'blocked',
      title: 'Preset Blocked',
      messages: evaluation.warnings.map((w) => w.message),
    };
  }

  if (evaluation.warnings.length > 0) {
    return {
      type: 'warning',
      title: 'Preset Warnings',
      messages: evaluation.warnings.map((w) => w.message),
    };
  }

  return {
    type: 'success',
    title: 'All Checks Passed',
    messages: [],
  };
}

/**
 * Get default guard values (for UI)
 */
export function getDefaultGuards(): PresetGuards {
  return {
    enabled: false,
    mode: 'soft',
    minSafetyScore: 70,
    maxPriceImpact: 2.5,
    minLiquidityUsd: 50000,
  };
}

/**
 * Create empty guards (disabled)
 */
export function createEmptyGuards(): PresetGuards {
  return {
    enabled: false,
    mode: 'soft',
  };
}

export default evaluatePresetGuards;
