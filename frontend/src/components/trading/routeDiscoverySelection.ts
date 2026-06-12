/**
 * Shared route pre-fill helpers for RouteDiscoveryRail and recovery chips.
 * Display-only — no routing or quote logic.
 */

import type { AssetInfo } from '@/types/api';
import { getTokenBySymbol, isNativeToken } from '@/tokens';
import type { PopularCommissionRoute } from '@/constants/popularCommissionRoutes';

const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
};

export function symbolToAsset(symbol: string, chainId: number): AssetInfo | null {
  const token = getTokenBySymbol(symbol, chainId);
  if (!token) return null;
  return {
    symbol: token.symbol,
    name: token.name,
    chain: CHAIN_NAMES[chainId] || 'ethereum',
    decimals: token.decimals,
    is_native: isNativeToken(token.address),
    contract_address: token.address,
    logo_url: token.logoURI,
  };
}

export function resolveRouteAssets(
  route: PopularCommissionRoute,
): { from: AssetInfo; to: AssetInfo } | null {
  const from = symbolToAsset(route.fromSymbol, route.chainId);
  const to = symbolToAsset(route.toSymbol, route.chainId);
  if (!from || !to) return null;
  return { from, to };
}

export function isActiveCommissionRoute(
  route: PopularCommissionRoute,
  fromAsset: AssetInfo | null,
  toAsset: AssetInfo | null,
): boolean {
  if (!fromAsset || !toAsset) return false;
  const f = fromAsset.symbol.trim().toUpperCase();
  const t = toAsset.symbol.trim().toUpperCase();
  const a = route.fromSymbol.toUpperCase();
  const b = route.toSymbol.toUpperCase();
  return (f === a && t === b) || (route.bidirectional && f === b && t === a);
}

export function selectCommissionRoute(
  route: PopularCommissionRoute,
  fromAsset: AssetInfo | null,
  toAsset: AssetInfo | null,
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void,
): void {
  const resolved = resolveRouteAssets(route);
  if (!resolved) return;

  if (isActiveCommissionRoute(route, fromAsset, toAsset) && route.bidirectional) {
    onSelectPair(resolved.to, resolved.from);
    return;
  }
  onSelectPair(resolved.from, resolved.to);
}
