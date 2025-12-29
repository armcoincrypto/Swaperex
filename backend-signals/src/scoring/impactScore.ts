/**
 * Signal Impact Scoring
 *
 * Calculates an impact score (0-100) for signals based on:
 * - Severity level
 * - Confidence score
 * - Specific factors (drop %, risk count, honeypot)
 *
 * Priority 10.1 - Signal Intelligence
 */

export type ImpactLevel = 'high' | 'medium' | 'low';

export interface ImpactScore {
  /** Numeric score 0-100 */
  score: number;
  /** Categorized level */
  level: ImpactLevel;
  /** Human-readable explanation */
  reason: string;
}

/**
 * Calculate impact score for liquidity signals
 */
export function calculateLiquidityImpact(
  dropPct: number,
  severity: 'warning' | 'danger' | 'critical',
  confidence: number,
  liquidityUsd?: number
): ImpactScore {
  let score = 0;
  const factors: string[] = [];

  // Drop percentage contribution (max 40 points)
  if (dropPct >= 70) {
    score += 40;
    factors.push('massive drop');
  } else if (dropPct >= 50) {
    score += 30;
    factors.push('severe drop');
  } else if (dropPct >= 35) {
    score += 20;
    factors.push('significant drop');
  } else {
    score += 10;
    factors.push('moderate drop');
  }

  // Severity contribution (max 30 points)
  if (severity === 'critical') {
    score += 30;
  } else if (severity === 'danger') {
    score += 20;
  } else {
    score += 10;
  }

  // Confidence contribution (max 20 points)
  score += Math.round(confidence * 20);

  // Liquidity size factor (max 10 points)
  // Higher liquidity = more market impact
  if (liquidityUsd !== undefined) {
    if (liquidityUsd >= 1_000_000) {
      score += 10;
      factors.push('high liquidity');
    } else if (liquidityUsd >= 100_000) {
      score += 7;
    } else if (liquidityUsd >= 10_000) {
      score += 4;
    } else {
      score += 2;
    }
  }

  // Ensure score is within bounds
  score = Math.min(100, Math.max(0, score));

  return {
    score,
    level: getImpactLevel(score),
    reason: `${dropPct.toFixed(0)}% drop, ${factors.join(', ')}`,
  };
}

/**
 * Calculate impact score for risk signals
 */
export function calculateRiskImpact(
  riskFactorCount: number,
  isHoneypot: boolean,
  severity: 'warning' | 'danger' | 'critical',
  confidence: number,
  riskFactors: string[]
): ImpactScore {
  let score = 0;
  const factors: string[] = [];

  // Honeypot is maximum severity (instant 50 points)
  if (isHoneypot) {
    score += 50;
    factors.push('HONEYPOT');
  }

  // Risk factor count contribution (max 30 points)
  if (riskFactorCount >= 5) {
    score += 30;
    factors.push('many risks');
  } else if (riskFactorCount >= 3) {
    score += 20;
    factors.push('multiple risks');
  } else if (riskFactorCount >= 1) {
    score += 10;
  }

  // Severity contribution (max 20 points if not honeypot)
  if (!isHoneypot) {
    if (severity === 'critical') {
      score += 20;
    } else if (severity === 'danger') {
      score += 15;
    } else {
      score += 5;
    }
  }

  // Confidence contribution (max 15 points)
  score += Math.round(confidence * 15);

  // Critical risk factors add extra weight
  const criticalFactors = ['honeypot', 'blacklisted', 'can_selfdestruct', 'owner_can_modify_balance'];
  const hasCritical = riskFactors.some(f => criticalFactors.includes(f));
  if (hasCritical && !isHoneypot) {
    score += 10;
    factors.push('critical factor');
  }

  // Ensure score is within bounds
  score = Math.min(100, Math.max(0, score));

  return {
    score,
    level: getImpactLevel(score),
    reason: isHoneypot
      ? 'Honeypot detected - cannot sell'
      : `${riskFactorCount} risk factor${riskFactorCount !== 1 ? 's' : ''}: ${factors.join(', ')}`,
  };
}

/**
 * Convert numeric score to impact level
 */
export function getImpactLevel(score: number): ImpactLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Get display icon for impact level
 */
export function getImpactIcon(level: ImpactLevel): string {
  switch (level) {
    case 'high': return '🔥';
    case 'medium': return '⚠️';
    case 'low': return 'ℹ️';
  }
}

/**
 * Get display label for impact level
 */
export function getImpactLabel(level: ImpactLevel): string {
  switch (level) {
    case 'high': return 'High Impact';
    case 'medium': return 'Medium Impact';
    case 'low': return 'Low Impact';
  }
}
