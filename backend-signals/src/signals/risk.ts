import fetch from "node-fetch";
import { getCache, setCache } from "../cache/memory.js";
import {
  isInCooldown,
  startCooldown,
  resetCooldown,
  getLastSeverity,
  isEscalation,
} from "../cache/signalCooldown.js";

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
  previous?: string;
  escalated?: boolean;
  suppressed?: boolean;
}

export async function checkRiskChange(
  chainId: number,
  token: string
): Promise<RiskSignal | null> {
  const key = `risk:${chainId}:${token}`;
  const cached = getCache<RiskSignal>(key);
  if (cached) return cached;

  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${token}`;
    const res = await fetch(url);
    const json = await res.json() as any;

    const info: GoPlusResult = json.result?.[token.toLowerCase()];
    if (!info) return null;

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

    // If no risk factors, token is safe - no signal needed
    if (riskFactors.length === 0) {
      // Cache the safe status to avoid repeated API calls
      setCache(key, null, 300_000);
      return null;
    }

    // Calculate risk severity
    const isHoneypot = info.is_honeypot === "1";
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
      return null;
    }

    // Build result
    const result: RiskSignal = {
      status,
      severity,
      confidence,
      riskFactors,
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

    setCache(key, result, 300_000);
    return result;
  } catch (err) {
    console.error("[risk] API error:", (err as Error).message);
    return null;
  }
}
