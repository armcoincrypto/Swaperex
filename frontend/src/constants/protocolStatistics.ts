/**
 * P18.9 — Canonical protocol statistics derived from the commission route registry.
 * Prefer this module over hardcoded marketing totals in UI copy.
 */

import {
  COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS,
} from '@/constants/commissionCoverage';
import { COMMISSION_SWAP_CHAIN_IDS } from '@/constants/commissionChains';
import { getVerifiedPopularCommissionRoutes } from '@/constants/popularCommissionRoutes';

export type ProtocolStatistics = {
  /** Distinct directional keys in COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS */
  certifiedDirectionalRoutes: number;
  /** Undirected pair entries from verified popular catalog (bidirectional counted once) */
  supportedPairEntries: number;
  /** Swap-enabled commission networks */
  swapEnabledNetworks: number;
  /** Certified directional routes on a given chain */
  routesOnNetwork: (chainId: number) => number;
  /** Catalog (popular) pair count on a given chain */
  catalogPairsOnNetwork: (chainId: number) => number;
};

function countDirectionalOnChain(chainId: number): number {
  let n = 0;
  for (const key of COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS) {
    if (key.startsWith(`${chainId}|`)) n += 1;
  }
  return n;
}

/**
 * Metric glossary (for audits / Trust Center):
 * - pair entry: one undirected catalog pair (e.g. WETH⇄USDC) in popular routes
 * - directional route: one from→to key in the commission audit allowlist
 * - chain-specific route: directional routes filtered by chainId
 * - wrapper route: execution via Swaperex fee wrapper contracts
 * - catalog route: popular / featured UI shortcut derived from the allowlist
 */
export function getProtocolStatistics(): ProtocolStatistics {
  const catalog = getVerifiedPopularCommissionRoutes();
  return {
    certifiedDirectionalRoutes: COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size,
    supportedPairEntries: catalog.length,
    swapEnabledNetworks: COMMISSION_SWAP_CHAIN_IDS.length,
    routesOnNetwork: countDirectionalOnChain,
    catalogPairsOnNetwork: (chainId: number) => catalog.filter((r) => r.chainId === chainId).length,
  };
}
