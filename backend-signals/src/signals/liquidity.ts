import fetch from "node-fetch";
import { getCache, setCache } from "../cache/memory.js";
import {
  isInCooldown,
  startCooldown,
  resetCooldown,
  getLastSeverity,
  isEscalation,
  type CooldownEntry,
} from "../cache/signalCooldown.js";
import { isDuplicateSignal, getDedupStatus } from "../cache/signalDedup.js";
import { calculateLiquidityImpact, type ImpactScore } from "../scoring/impactScore.js";
import { getRecurrenceInfo, recordOccurrence, type RecurrenceInfo } from "../cache/recurrence.js";
import type { LiquidityCheck, CooldownStatus } from "../types/SignalDebug.js";

// Liquidity drop threshold (minimum to trigger signal)
const DROP_THRESHOLD = 30;

// Severity thresholds for liquidity drop
function getSeverity(dropPct: number): 'warning' | 'danger' | 'critical' {
  if (dropPct >= 65) return 'critical';
  if (dropPct >= 45) return 'danger';
  return 'warning';
}

// Confidence calculation for liquidity signals
function calculateConfidence(dropPct: number, hasVolume: boolean): number {
  let confidence = 0.5; // Base confidence

  // Higher drop = higher confidence it's real
  if (dropPct >= 50) confidence += 0.2;
  else if (dropPct >= 40) confidence += 0.15;
  else if (dropPct >= 30) confidence += 0.1;

  // Volume presence increases confidence
  if (hasVolume) confidence += 0.15;

  // Cap at 0.95
  return Math.min(0.95, Math.round(confidence * 100) / 100);
}

export interface LiquiditySignal {
  dropPct: number;
  window: string;
  severity: 'warning' | 'danger' | 'critical';
  confidence: number;
  impact: ImpactScore;
  recurrence: RecurrenceInfo;
  previous?: string;
  escalated?: boolean;
  suppressed?: boolean;
}

export interface LiquidityResult {
  signal: LiquiditySignal | null;
  debug: {
    check: LiquidityCheck;
    cooldown: CooldownStatus;
  };
}

// Build cooldown status for debug
function buildCooldownStatus(chainId: number, token: string): CooldownStatus {
  const entry = isInCooldown(chainId, token, 'liquidity');
  if (!entry) {
    return {
      active: false,
      remainingSeconds: 0,
      startedAt: null,
      expiresAt: null,
      lastSeverity: null,
    };
  }
  return {
    active: true,
    remainingSeconds: Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000)),
    startedAt: entry.startedAt,
    expiresAt: entry.expiresAt,
    lastSeverity: entry.lastSeverity,
  };
}

export async function checkLiquidityDrop(
  chainId: number,
  token: string,
  includeDebug: boolean = false
): Promise<LiquidityResult> {
  const key = `liq:${chainId}:${token}`;

  // Check cache first
  const cached = getCache<LiquiditySignal>(key);
  if (cached) {
    return {
      signal: cached,
      debug: {
        check: {
          passed: true,
          currentLiquidity: null,
          previousLiquidity: null,
          dropPct: cached.dropPct,
          threshold: DROP_THRESHOLD,
          reason: 'Returned from cache',
        },
        cooldown: buildCooldownStatus(chainId, token),
      },
    };
  }

  // Default debug state
  let debugCheck: LiquidityCheck = {
    passed: false,
    currentLiquidity: null,
    previousLiquidity: null,
    dropPct: null,
    threshold: DROP_THRESHOLD,
    reason: 'Not evaluated',
  };

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${token}`;
    const res = await fetch(url);
    const data = await res.json() as any;

    const pair = data.pairs?.[0];
    if (!pair?.liquidity?.usd) {
      debugCheck.reason = 'No liquidity data available';
      return {
        signal: null,
        debug: {
          check: debugCheck,
          cooldown: buildCooldownStatus(chainId, token),
        },
      };
    }

    const currentLiquidity = pair.liquidity.usd;
    const change = pair.liquidityChange?.m10 ?? 0;
    const dropPct = Math.abs(change);

    debugCheck.currentLiquidity = currentLiquidity;
    debugCheck.dropPct = change < 0 ? dropPct : 0;

    if (change > -DROP_THRESHOLD) {
      debugCheck.passed = false;
      debugCheck.reason = change >= 0
        ? `Liquidity increased (+${change.toFixed(1)}%)`
        : `Drop ${dropPct.toFixed(1)}% below threshold (${DROP_THRESHOLD}%)`;

      return {
        signal: null,
        debug: {
          check: debugCheck,
          cooldown: buildCooldownStatus(chainId, token),
        },
      };
    }

    // Signal condition met
    const severity = getSeverity(dropPct);
    const hasVolume = (pair.volume?.h24 ?? 0) > 0;
    const confidence = calculateConfidence(dropPct, hasVolume);

    // Check cooldown
    const cooldownEntry = isInCooldown(chainId, token, 'liquidity');
    const previousSeverity = getLastSeverity(chainId, token, 'liquidity');

    // Check if this is an escalation
    const escalated = isEscalation(previousSeverity, severity);

    // If in cooldown and NOT escalating, suppress the signal
    if (cooldownEntry && !escalated) {
      console.log(`[liquidity] Signal suppressed (cooldown): ${token}`);
      debugCheck.passed = true;
      debugCheck.reason = 'Signal suppressed (cooldown active, no escalation)';

      return {
        signal: null,
        debug: {
          check: debugCheck,
          cooldown: buildCooldownStatus(chainId, token),
        },
      };
    }

    // Calculate impact score
    const impact = calculateLiquidityImpact(dropPct, severity, confidence, currentLiquidity);

    // Get recurrence info BEFORE recording this occurrence
    const recurrence = getRecurrenceInfo(chainId, token, 'liquidity', impact.score);

    // Build result
    const result: LiquiditySignal = {
      dropPct,
      window: "10m",
      severity,
      confidence,
      impact,
      recurrence,
    };

    // Add escalation info if applicable
    if (escalated && previousSeverity) {
      result.previous = previousSeverity;
      result.escalated = true;
      // Reset cooldown on escalation
      resetCooldown(chainId, token, 'liquidity', severity);
    } else {
      // Start fresh cooldown
      startCooldown(chainId, token, 'liquidity', severity);
    }

    // Deduplication guard - prevent identical signals from firing
    const signalStateForDedup = { dropPct, severity, confidence };
    if (isDuplicateSignal(chainId, token, 'liquidity', signalStateForDedup)) {
      debugCheck.passed = true;
      debugCheck.reason = 'Signal suppressed (duplicate state detected)';
      return {
        signal: null,
        debug: {
          check: debugCheck,
          cooldown: buildCooldownStatus(chainId, token),
        },
      };
    }

    setCache(key, result, 120_000);

    // Record this occurrence for future recurrence tracking
    recordOccurrence(chainId, token, 'liquidity', severity, impact.score);

    debugCheck.passed = true;
    debugCheck.reason = escalated
      ? `Signal fired (escalation: ${previousSeverity} → ${severity})`
      : `Signal fired (drop ${dropPct.toFixed(1)}% >= ${DROP_THRESHOLD}%)`;

    return {
      signal: result,
      debug: {
        check: debugCheck,
        cooldown: buildCooldownStatus(chainId, token),
      },
    };
  } catch (err) {
    console.error("[liquidity] API error:", (err as Error).message);
    debugCheck.reason = `API error: ${(err as Error).message}`;

    return {
      signal: null,
      debug: {
        check: debugCheck,
        cooldown: buildCooldownStatus(chainId, token),
      },
    };
  }
}
