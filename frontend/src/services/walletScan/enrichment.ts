/**
 * Scan Enrichment Service
 *
 * Optional backend call to enrich scan results with risk data.
 * Gracefully degrades — if the backend is unreachable, the scan
 * still works with frontend-only data.
 */

import type { ScannedToken, ScanChainName } from './types';
import { SCAN_CHAIN_IDS } from './types';

const BACKEND_URL = import.meta.env.VITE_SIGNALS_URL || 'http://localhost:4001';
const ENRICHMENT_TIMEOUT = 8000;

export interface EnrichmentResult {
  tokens: Array<{
    address: string;
    chainId: number;
    symbol: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'unknown';
  }>;
  timestamp: number;
  cached: boolean;
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

    const res = await fetch(`${BACKEND_URL}/api/v1/wallet/scan-summary`, {
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
    return (await res.json()) as EnrichmentResult;
  } catch {
    // Backend unavailable — graceful degradation
    return null;
  }
}

/**
 * Apply enrichment data to scanned tokens (merge risk levels).
 */
export function applyEnrichment(
  tokens: ScannedToken[],
  enrichment: EnrichmentResult,
): ScannedToken[] {
  const riskMap = new Map<string, 'low' | 'medium' | 'high' | 'unknown'>();
  for (const t of enrichment.tokens) {
    riskMap.set(`${t.chainId}:${t.address.toLowerCase()}`, t.riskLevel || 'unknown');
  }

  return tokens.map((token) => {
    const key = `${token.chainId}:${token.address.toLowerCase()}`;
    const riskLevel = riskMap.get(key);
    if (riskLevel) {
      return { ...token, riskLevel };
    }
    return token;
  });
}
