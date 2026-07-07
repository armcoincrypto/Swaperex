/**
 * P3.1 — Popular commission routes (display-only presets).
 * Every entry must pass `isCommissionPairAuditSupported`; regenerate audit via
 * `node scripts/audit/audit-commission-pairs.mjs`.
 */

import {
  commissionPairKey,
  isCommissionPairAuditSupported,
} from '@/constants/commissionCoverage';

export type PopularCommissionRoute = {
  chainId: number;
  chainLabel: string;
  fromSymbol: string;
  toSymbol: string;
  /** User-facing label, e.g. "WETH ⇄ USDC" or "CAKE → USDT" */
  label: string;
  bidirectional: boolean;
};

/** Curated display order — must stay in sync with P3 audit promotions. */
const ROUTE_CATALOG: PopularCommissionRoute[] = [
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'USDC', label: 'WETH ⇄ USDC', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'USDT', label: 'WETH ⇄ USDT', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'DAI', label: 'WETH ⇄ DAI', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'ETH', toSymbol: 'USDC', label: 'ETH ⇄ USDC', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'ETH', toSymbol: 'USDT', label: 'ETH ⇄ USDT', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'WBTC', label: 'WETH ⇄ WBTC', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'LINK', label: 'WETH ⇄ LINK', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'UNI', label: 'WETH ⇄ UNI', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'AAVE', label: 'WETH ⇄ AAVE', bidirectional: true },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'LDO', label: 'WETH ⇄ LDO', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'BNB', toSymbol: 'USDT', label: 'BNB ⇄ USDT', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'BNB', toSymbol: 'USDC', label: 'BNB ⇄ USDC', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'WBNB', toSymbol: 'USDT', label: 'WBNB ⇄ USDT', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'WBNB', toSymbol: 'BTCB', label: 'WBNB ⇄ BTCB', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'CAKE', toSymbol: 'USDT', label: 'CAKE ⇄ USDT', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'WBNB', toSymbol: 'CAKE', label: 'WBNB ⇄ CAKE', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'WBNB', toSymbol: 'USDC', label: 'WBNB ⇄ USDC', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'WBNB', toSymbol: 'ETH', label: 'WBNB ⇄ ETH', bidirectional: true },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'WBNB', toSymbol: 'FDUSD', label: 'WBNB ⇄ FDUSD', bidirectional: true },
];

const NATIVE_WRAP_KEYS = new Set([
  '1|ETH|WETH',
  '1|WETH|ETH',
  '56|BNB|WBNB',
  '56|WBNB|BNB',
]);

function routeIsAuditVerified(route: PopularCommissionRoute): boolean {
  const { chainId, fromSymbol, toSymbol, bidirectional } = route;
  const forwardKey = commissionPairKey(chainId, fromSymbol, toSymbol);
  if (NATIVE_WRAP_KEYS.has(forwardKey)) return false;
  if (!isCommissionPairAuditSupported(chainId, fromSymbol, toSymbol)) return false;
  if (bidirectional) {
    return isCommissionPairAuditSupported(chainId, toSymbol, fromSymbol);
  }
  return true;
}

/** Audited routes only — filtered against live commission audit allowlist. */
export function getVerifiedPopularCommissionRoutes(): PopularCommissionRoute[] {
  return ROUTE_CATALOG.filter(routeIsAuditVerified);
}

export function groupPopularCommissionRoutes(
  routes: PopularCommissionRoute[],
  activeChainId: number,
): { chainId: number; chainLabel: string; routes: PopularCommissionRoute[] }[] {
  const byChain = new Map<number, PopularCommissionRoute[]>();
  for (const r of routes) {
    const list = byChain.get(r.chainId) ?? [];
    list.push(r);
    byChain.set(r.chainId, list);
  }

  const order =
    activeChainId === 56 ? [56, 1] : activeChainId === 1 ? [1, 56] : [1, 56];

  const groups: { chainId: number; chainLabel: string; routes: PopularCommissionRoute[] }[] = [];
  for (const cid of order) {
    const list = byChain.get(cid);
    if (list?.length) {
      groups.push({ chainId: cid, chainLabel: list[0].chainLabel, routes: list });
    }
  }
  return groups;
}
