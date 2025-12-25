import fetch from "node-fetch";
import { getCache, setCache } from "../cache/memory.js";
import {
  isInCooldown,
  startCooldown,
  resetCooldown,
  getLastSeverity,
  isEscalation,
} from "../cache/signalCooldown.js";

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
  previous?: string;
  escalated?: boolean;
  suppressed?: boolean;
}

export async function checkLiquidityDrop(
  chainId: number,
  token: string
): Promise<LiquiditySignal | null> {
  const key = `liq:${chainId}:${token}`;
  const cached = getCache<LiquiditySignal>(key);
  if (cached) return cached;

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${token}`;
    const res = await fetch(url);
    const data = await res.json() as any;

    const pair = data.pairs?.[0];
    if (!pair?.liquidity?.usd) return null;

    const change = pair.liquidityChange?.m10 ?? 0;
    if (change <= -30) {
      const dropPct = Math.abs(change);
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
        return null; // Signal suppressed during cooldown
      }

      // Build result
      const result: LiquiditySignal = {
        dropPct,
        window: "10m",
        severity,
        confidence,
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

      setCache(key, result, 120_000);
      return result;
    }

    return null;
  } catch (err) {
    console.error("[liquidity] API error:", (err as Error).message);
    return null;
  }
}
