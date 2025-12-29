import fetch from "node-fetch";
import { getCache, setCache } from "../cache/memory.js";
import {
  isInCooldown,
  startCooldown,
  resetCooldown,
  getLastSeverity,
  isEscalation,
} from "../cache/signalCooldown.js";
import { isDuplicateSignal } from "../cache/signalDedup.js";
import { calculateRiskImpact, type ImpactScore } from "../scoring/impactScore.js";
import type { RiskCheck, CooldownStatus } from "../types/SignalDebug.js";

// Risk factors to check from GoPlus API
interface GoPlusResult {
  is_honeypot?: string;
  is_blacklisted?: string;
  is_proxy?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  selfdestruct?: string;
  external_call?: string;
  is_mintable?: string;
  transfer_pausable?: string;
  trading_cooldown?: string;
  cannot_sell_all?: string;
  is_anti_whale?: string;
  slippage_modifiable?: string;
  personal_slippage_modifiable?: string;
}

// Severity based on risk factor count and severity
function getSeverity(riskCount: number, isHoneypot: boolean): 'warning' | 'danger' | 'critical' {
  if (isHoneypot) return 'critical';
  if (riskCount >= 5) return 'critical';
  if (riskCount >= 3) return 'danger';
  if (riskCount >= 1) return 'warning';
  return 'warning';
}

// Confidence calculation for risk signals
function calculateConfidence(riskCount: number, isHoneypot: boolean, hasOwnershipIssues: boolean): number {
  let confidence = 0.5; // Base confidence

  // Honeypot = very high confidence it's dangerous
  if (isHoneypot) confidence += 0.4;

  // More risk factors = higher confidence
  if (riskCount >= 5) confidence += 0.25;
  else if (riskCount >= 3) confidence += 0.2;
  else if (riskCount >= 1) confidence += 0.1;

  // Ownership issues increase confidence
  if (hasOwnershipIssues) confidence += 0.1;

  // Cap at 0.95
  return Math.min(0.95, Math.round(confidence * 100) / 100);
}

export interface RiskSignal {
  status: 'safe' | 'warning' | 'danger' | 'critical';
  severity: 'warning' | 'danger' | 'critical';
  confidence: number;
  riskFactors: string[];
  impact: ImpactScore;
  previous?: string;
  escalated?: boolean;
  suppressed?: boolean;
}

export interface RiskResult {
  signal: RiskSignal | null;
  debug: {
    check: RiskCheck;
    cooldown: CooldownStatus;
  };
}

// Build cooldown status for debug
function buildCooldownStatus(chainId: number, token: string): CooldownStatus {
  const entry = isInCooldown(chainId, token, 'risk');
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

export async function checkRiskChange(
  chainId: number,
  token: string,
  includeDebug: boolean = false
): Promise<RiskResult> {
  const key = `risk:${chainId}:${token}`;

  // Check cache first
  const cached = getCache<RiskSignal>(key);
  if (cached) {
    return {
      signal: cached,
      debug: {
        check: {
          passed: true,
          riskFactorCount: cached.riskFactors.length,
          riskFactors: cached.riskFactors,
          isHoneypot: cached.riskFactors.includes('honeypot'),
          reason: 'Returned from cache',
        },
        cooldown: buildCooldownStatus(chainId, token),
      },
    };
  }

  // Default debug state
  let debugCheck: RiskCheck = {
    passed: false,
    riskFactorCount: 0,
    riskFactors: [],
    isHoneypot: false,
    reason: 'Not evaluated',
  };

  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${token}`;
    const res = await fetch(url);
    const json = await res.json() as any;

    const info: GoPlusResult = json.result?.[token.toLowerCase()];
    if (!info) {
      debugCheck.reason = 'No security data available from GoPlus';
      return {
        signal: null,
        debug: {
          check: debugCheck,
          cooldown: buildCooldownStatus(chainId, token),
        },
      };
    }

    // Collect risk factors
    const riskFactors: string[] = [];

    if (info.is_honeypot === "1") riskFactors.push("honeypot");
    if (info.is_blacklisted === "1") riskFactors.push("blacklisted");
    if (info.is_proxy === "1") riskFactors.push("proxy_contract");
    if (info.can_take_back_ownership === "1") riskFactors.push("ownership_takeback");
    if (info.owner_change_balance === "1") riskFactors.push("owner_can_modify_balance");
    if (info.hidden_owner === "1") riskFactors.push("hidden_owner");
    if (info.selfdestruct === "1") riskFactors.push("can_selfdestruct");
    if (info.external_call === "1") riskFactors.push("external_calls");
    if (info.is_mintable === "1") riskFactors.push("mintable");
    if (info.transfer_pausable === "1") riskFactors.push("transfer_pausable");
    if (info.trading_cooldown === "1") riskFactors.push("trading_cooldown");
    if (info.cannot_sell_all === "1") riskFactors.push("cannot_sell_all");
    if (info.slippage_modifiable === "1") riskFactors.push("slippage_modifiable");

    const isHoneypot = info.is_honeypot === "1";
    debugCheck.riskFactorCount = riskFactors.length;
    debugCheck.riskFactors = riskFactors;
    debugCheck.isHoneypot = isHoneypot;

    // If no risk factors, token is safe - no signal needed
    if (riskFactors.length === 0) {
      debugCheck.passed = false;
      debugCheck.reason = 'Token is safe (no risk factors detected)';
      // Cache the safe status to avoid repeated API calls
      setCache(key, null, 300_000);
      return {
        signal: null,
        debug: {
          check: debugCheck,
          cooldown: buildCooldownStatus(chainId, token),
        },
      };
    }

    // Calculate risk severity
    const hasOwnershipIssues =
      info.can_take_back_ownership === "1" ||
      info.owner_change_balance === "1" ||
      info.hidden_owner === "1";

    const severity = getSeverity(riskFactors.length, isHoneypot);
    const confidence = calculateConfidence(riskFactors.length, isHoneypot, hasOwnershipIssues);

    // Determine status
    const status = isHoneypot ? 'critical' : riskFactors.length >= 3 ? 'danger' : 'warning';

    // Check cooldown
    const cooldownEntry = isInCooldown(chainId, token, 'risk');
    const previousSeverity = getLastSeverity(chainId, token, 'risk');

    // Check if this is an escalation
    const escalated = isEscalation(previousSeverity, severity);

    // If in cooldown and NOT escalating, suppress the signal
    if (cooldownEntry && !escalated) {
      console.log(`[risk] Signal suppressed (cooldown): ${token}`);
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
    const impact = calculateRiskImpact(riskFactors.length, isHoneypot, severity, confidence, riskFactors);

    // Build result
    const result: RiskSignal = {
      status,
      severity,
      confidence,
      riskFactors,
      impact,
    };

    // Add escalation info if applicable
    if (escalated && previousSeverity) {
      result.previous = previousSeverity;
      result.escalated = true;
      // Reset cooldown on escalation
      resetCooldown(chainId, token, 'risk', severity);
    } else {
      // Start fresh cooldown
      startCooldown(chainId, token, 'risk', severity);
    }

    // Deduplication guard - prevent identical signals from firing
    const signalStateForDedup = { riskFactors: riskFactors.sort(), severity, confidence };
    if (isDuplicateSignal(chainId, token, 'risk', signalStateForDedup)) {
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

    setCache(key, result, 300_000);

    debugCheck.passed = true;
    debugCheck.reason = isHoneypot
      ? 'CRITICAL: Honeypot detected!'
      : escalated
      ? `Signal fired (escalation: ${previousSeverity} → ${severity})`
      : `Signal fired (${riskFactors.length} risk factors detected)`;

    return {
      signal: result,
      debug: {
        check: debugCheck,
        cooldown: buildCooldownStatus(chainId, token),
      },
    };
  } catch (err) {
    console.error("[risk] API error:", (err as Error).message);
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
