import type { AssetInfo } from '@/types/api';
import type { QuoteRouteMode } from '@/services/quoteAggregator';

/**
 * Fingerprint of everything that defines the current swap quote (Phase 3: stale quote safety).
 * Must stay in sync between `useSwap` and `SwapInterface`.
 */
export function getSwapQuoteInputFingerprint(params: {
  chainId: number;
  slippage: number;
  fromAmount: string;
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  routeMode: QuoteRouteMode;
}): string {
  const { chainId, slippage, fromAmount, fromAsset, toAsset, routeMode } = params;

  const part = (asset: AssetInfo | null) => {
    if (!asset) return '';
    const addr = asset.contract_address?.trim().toLowerCase();
    if (addr) return `${asset.symbol}|${asset.chain}|${addr}`;
    return `${asset.symbol}|${asset.chain}|native:${asset.is_native ? 1 : 0}`;
  };

  return [chainId, slippage, fromAmount ?? '', part(fromAsset), part(toAsset), routeMode].join('::');
}
