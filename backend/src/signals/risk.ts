/**
 * Risk Status Change Signal Service
 *
 * Detects when a token's risk status changes (safe → warning/danger).
 * Uses GoPlus Security API for token security analysis.
 */

import axios from 'axios';
import cache, { CACHE_TTL } from '../cache/redis.js';
import type { RiskChangeSignal, GoPlusTokenSecurity } from './types.js';

// Chain ID to GoPlus chain ID mapping
const GOPLUS_CHAIN_IDS: Record<number, string> = {
  1: '1', // Ethereum
  56: '56', // BSC
  137: '137', // Polygon
  42161: '42161', // Arbitrum
  10: '10', // Optimism
  43114: '43114', // Avalanche
  250: '250', // Fantom
  8453: '8453', // Base
};

// Risk level thresholds
const RISK_THRESHOLDS = {
  DANGER: 50, // Score below 50 = danger
  WARNING: 75, // Score below 75 = warning
};

// Store previous risk levels for change detection
const previousRiskLevels = new Map<string, { level: 'safe' | 'warning' | 'danger'; score: number; timestamp: number }>();

/**
 * Calculate risk score from GoPlus security data
 * Returns a score from 0-100 (100 = safest)
 */
function calculateRiskScore(security: GoPlusTokenSecurity): number {
  let score = 100;
  const deductions: { reason: string; points: number }[] = [];

  // Critical issues (large deductions)
  if (security.is_honeypot === '1') {
    deductions.push({ reason: 'honeypot', points: 50 });
  }
  if (security.is_blacklisted === '1') {
    deductions.push({ reason: 'blacklisted', points: 40 });
  }
  if (security.is_proxy === '1' && security.is_open_source !== '1') {
    deductions.push({ reason: 'unverified proxy', points: 35 });
  }
  if (security.can_take_back_ownership === '1') {
    deductions.push({ reason: 'ownership recovery', points: 30 });
  }
  if (security.owner_change_balance === '1') {
    deductions.push({ reason: 'owner can change balance', points: 35 });
  }
  if (security.hidden_owner === '1') {
    deductions.push({ reason: 'hidden owner', points: 25 });
  }
  if (security.selfdestruct === '1') {
    deductions.push({ reason: 'self-destruct', points: 30 });
  }
  if (security.external_call === '1') {
    deductions.push({ reason: 'external calls', points: 15 });
  }

  // Moderate issues
  if (security.is_mintable === '1') {
    deductions.push({ reason: 'mintable', points: 10 });
  }
  if (security.transfer_pausable === '1') {
    deductions.push({ reason: 'transfers pausable', points: 15 });
  }
  if (security.trading_cooldown === '1') {
    deductions.push({ reason: 'trading cooldown', points: 10 });
  }
  if (security.cannot_sell_all === '1') {
    deductions.push({ reason: 'sell restrictions', points: 20 });
  }
  if (security.is_anti_whale === '1') {
    deductions.push({ reason: 'anti-whale', points: 5 });
  }

  // Tax issues
  const buyTax = parseFloat(security.buy_tax || '0');
  const sellTax = parseFloat(security.sell_tax || '0');
  if (buyTax > 10) {
    deductions.push({ reason: 'high buy tax', points: Math.min(20, buyTax) });
  }
  if (sellTax > 10) {
    deductions.push({ reason: 'high sell tax', points: Math.min(25, sellTax) });
  }

  // Open source bonus (restore some points if verified)
  if (security.is_open_source === '1') {
    score += 5;
  }

  // Apply deductions
  for (const d of deductions) {
    score -= d.points;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Get risk level from score
 */
function getRiskLevel(score: number): 'safe' | 'warning' | 'danger' {
  if (score < RISK_THRESHOLDS.DANGER) return 'danger';
  if (score < RISK_THRESHOLDS.WARNING) return 'warning';
  return 'safe';
}

/**
 * Fetch token security data from GoPlus
 */
async function fetchTokenSecurity(
  chainId: number,
  tokenAddress: string
): Promise<GoPlusTokenSecurity | null> {
  const goplusChainId = GOPLUS_CHAIN_IDS[chainId];
  if (!goplusChainId) {
    return null;
  }

  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${goplusChainId}`;
    const response = await axios.get<{
      code: number;
      message: string;
      result: Record<string, GoPlusTokenSecurity>;
    }>(url, {
      params: { contract_addresses: tokenAddress.toLowerCase() },
      timeout: 10000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (response.data.code !== 1) {
      console.warn(`[Risk] GoPlus API error: ${response.data.message}`);
      return null;
    }

    const tokenData = response.data.result[tokenAddress.toLowerCase()];
    return tokenData || null;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.warn(`[Risk] GoPlus API error: ${err.message}`);
    }
    return null;
  }
}

/**
 * Check for risk status change signal
 */
export async function checkRiskChange(
  chainId: number,
  tokenAddress: string
): Promise<RiskChangeSignal | null> {
  const cacheKey = `risk:${chainId}:${tokenAddress.toLowerCase()}`;
  const historyKey = `${chainId}:${tokenAddress.toLowerCase()}`;

  // Check cache first
  const cached = await cache.get<RiskChangeSignal>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Fetch current security data
    const security = await fetchTokenSecurity(chainId, tokenAddress);

    if (!security) {
      return null;
    }

    // Calculate current risk
    const currentScore = calculateRiskScore(security);
    const currentLevel = getRiskLevel(currentScore);

    // Get previous risk level
    const previous = previousRiskLevels.get(historyKey);
    let detected = false;
    let previousLevel: 'safe' | 'warning' | 'danger' | undefined;
    let changeDirection: 'improved' | 'worsened' | undefined;

    if (previous) {
      // Determine if risk changed
      const levelPriority = { safe: 0, warning: 1, danger: 2 };
      const currentPriority = levelPriority[currentLevel];
      const previousPriority = levelPriority[previous.level];

      if (currentPriority !== previousPriority) {
        detected = true;
        previousLevel = previous.level;
        changeDirection = currentPriority > previousPriority ? 'worsened' : 'improved';
      }
    }

    // Update stored risk level
    previousRiskLevels.set(historyKey, {
      level: currentLevel,
      score: currentScore,
      timestamp: Date.now(),
    });

    // Clean old entries (older than 1 hour)
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [key, value] of previousRiskLevels) {
      if (value.timestamp < cutoff) {
        previousRiskLevels.delete(key);
      }
    }

    const signal: RiskChangeSignal = {
      detected,
      currentLevel,
      previousLevel,
      changeDirection,
      score: currentScore,
      timestamp: Date.now(),
    };

    // Cache the result
    await cache.set(cacheKey, signal, CACHE_TTL.RISK);

    return signal;
  } catch (err) {
    console.error('[Risk] Check error:', err);
    return null;
  }
}

/**
 * Get raw security data for a token (for detailed display)
 */
export async function getTokenSecurity(
  chainId: number,
  tokenAddress: string
): Promise<GoPlusTokenSecurity | null> {
  const cacheKey = `security:${chainId}:${tokenAddress.toLowerCase()}`;

  // Check cache
  const cached = await cache.get<GoPlusTokenSecurity>(cacheKey);
  if (cached) {
    return cached;
  }

  const security = await fetchTokenSecurity(chainId, tokenAddress);
  if (security) {
    await cache.set(cacheKey, security, CACHE_TTL.RISK);
  }

  return security;
}

export default { checkRiskChange, getTokenSecurity };
