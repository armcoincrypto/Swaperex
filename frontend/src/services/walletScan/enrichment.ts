/**
 * Scan Enrichment Service (v3)
 *
 * Optional backend call to enrich scan results with risk data.
 * Gracefully degrades — if the backend is unreachable, the scan
 * still works with frontend-only data.
 *
 * Also provides client-side risk factor parsing from GoPlus data.
 */

import type { ScannedToken, ScanChainName, RiskLevel, RiskFactor } from './types';
import { SCAN_CHAIN_IDS } from './types';

import { joinSignalsUrl } from '@/config/api';
const ENRICHMENT_TIMEOUT = 8000;

/** In-memory risk cache with TTL */
const riskCache = new Map<string, { data: TokenRiskData; expiresAt: number }>();
const RISK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface TokenRiskData {
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
}

export interface EnrichmentResult {
  tokens: Array<{
    address: string;
    chainId: number;
    symbol: string;
    riskLevel?: RiskLevel;
    riskFactors?: RiskFactor[];
  }>;
  timestamp: number;
  cached: boolean;
}

/**
 * Get cached risk data for a token. Returns null if not cached or expired.
 */
export function getCachedRisk(chainId: number, address: string): TokenRiskData | null {
  const key = `${chainId}:${address.toLowerCase()}`;
  const entry = riskCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    riskCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Store risk data in the cache.
 */
function cacheRisk(chainId: number, address: string, data: TokenRiskData): void {
  const key = `${chainId}:${address.toLowerCase()}`;
  riskCache.set(key, { data, expiresAt: Date.now() + RISK_CACHE_TTL });
}

/**
 * Parse GoPlus-style risk data into structured RiskFactor array.
 */
export function parseRiskFactors(tokenData: Record<string, unknown>): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (tokenData.is_honeypot === '1') {
    factors.push({ key: 'honeypot', label: 'Honeypot detected', severity: 'danger', value: 'Cannot sell this token' });
  }
  if (tokenData.cannot_sell_all === '1') {
    factors.push({ key: 'cannot_sell', label: 'Cannot sell all', severity: 'danger', value: 'Selling restrictions detected' });
  }
  if (tokenData.is_blacklisted === '1') {
    factors.push({ key: 'blacklist', label: 'Has blacklist function', severity: 'warn', value: 'Owner can blacklist addresses' });
  }
  if (tokenData.is_proxy === '1') {
    factors.push({ key: 'proxy', label: 'Proxy contract', severity: 'warn', value: 'Contract logic can be changed' });
  }
  if (tokenData.can_take_back_ownership === '1') {
    factors.push({ key: 'ownership', label: 'Ownership recovery', severity: 'warn', value: 'Ownership can be reclaimed' });
  }
  if (tokenData.owner_change_balance === '1') {
    factors.push({ key: 'balance_change', label: 'Owner can change balance', severity: 'danger', value: 'Owner can modify token balances' });
  }
  if (tokenData.hidden_owner === '1') {
    factors.push({ key: 'hidden_owner', label: 'Hidden owner', severity: 'warn', value: 'Contract has a hidden owner function' });
  }
  if (tokenData.selfdestruct === '1') {
    factors.push({ key: 'selfdestruct', label: 'Self-destruct', severity: 'danger', value: 'Contract can be destroyed' });
  }
  if (tokenData.external_call === '1') {
    factors.push({ key: 'external_call', label: 'External calls', severity: 'info', value: 'Contract makes external calls' });
  }

  const buyTax = Number(tokenData.buy_tax || 0);
  if (buyTax > 0.05) {
    factors.push({
      key: 'buy_tax',
      label: 'Buy tax',
      severity: buyTax > 0.1 ? 'danger' : 'warn',
      value: `${(buyTax * 100).toFixed(1)}%`,
    });
  }
  const sellTax = Number(tokenData.sell_tax || 0);
  if (sellTax > 0.05) {
    factors.push({
      key: 'sell_tax',
      label: 'Sell tax',
      severity: sellTax > 0.1 ? 'danger' : 'warn',
      value: `${(sellTax * 100).toFixed(1)}%`,
    });
  }

  if (tokenData.trading_cooldown === '1') {
    factors.push({ key: 'cooldown', label: 'Trading cooldown', severity: 'info', value: 'Cooldown between trades' });
  }
  if (tokenData.is_mintable === '1') {
    factors.push({ key: 'mintable', label: 'Mintable', severity: 'info', value: 'New tokens can be minted' });
  }

  // Positive signals
  if (tokenData.is_open_source === '1') {
    factors.push({ key: 'open_source', label: 'Open source', severity: 'info', value: 'Contract is verified' });
  }

  return factors;
}

/**
 * Determine risk level from factors.
 */
export function computeRiskLevel(factors: RiskFactor[]): RiskLevel {
  if (factors.some((f) => f.severity === 'danger')) return 'high';
  if (factors.some((f) => f.severity === 'warn')) return 'medium';
  if (factors.length > 0) return 'low';
  return 'unknown';
}

/**
 * Fetch risk enrichment data from backend for discovered tokens.
 * Returns null if backend is unavailable (graceful degradation).
 */
export async function fetchEnrichment(
  walletAddress: string,
  tokens: ScannedToken[],
  chains: ScanChainName[],
): Promise<EnrichmentResult | null> {
  // Only enrich non-native ERC20 tokens
  const erc20Tokens = tokens.filter((t) => !t.isNative);
  if (erc20Tokens.length === 0) return null;

  const chainIds = chains.map((c) => SCAN_CHAIN_IDS[c]);
  const tokenAddresses = [...new Set(erc20Tokens.map((t) => t.address.toLowerCase()))];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENRICHMENT_TIMEOUT);

    const res = await fetch(joinSignalsUrl('wallet/scan-summary'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: walletAddress,
        chainIds,
        tokenAddresses,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    const result = (await res.json()) as EnrichmentResult;

    // Cache individual token risk data
    for (const t of result.tokens) {
      if (t.riskLevel) {
        cacheRisk(t.chainId, t.address, {
          riskLevel: t.riskLevel,
          riskFactors: t.riskFactors || [],
        });
      }
    }

    return result;
  } catch {
    // Backend unavailable — graceful degradation
    return null;
  }
}

/**
 * Apply enrichment data to scanned tokens (merge risk levels + factors).
 */
export function applyEnrichment(
  tokens: ScannedToken[],
  enrichment: EnrichmentResult,
): ScannedToken[] {
  const riskMap = new Map<string, { riskLevel: RiskLevel; riskFactors: RiskFactor[] }>();
  for (const t of enrichment.tokens) {
    riskMap.set(`${t.chainId}:${t.address.toLowerCase()}`, {
      riskLevel: t.riskLevel || 'unknown',
      riskFactors: t.riskFactors || [],
    });
  }

  return tokens.map((token) => {
    const key = `${token.chainId}:${token.address.toLowerCase()}`;
    const risk = riskMap.get(key);
    if (risk) {
      return { ...token, riskLevel: risk.riskLevel, riskFactors: risk.riskFactors };
    }
    return token;
  });
}
