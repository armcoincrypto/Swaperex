/**
 * P16.2 — Bidirectional sync between swap store and URL search params.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSwapStore } from '@/stores/swapStore';
import { useWallet } from '@/hooks/useWallet';
import {
  buildSwapSearchParams,
  parseSwapSearchParams,
  swapSearchStringsEqual,
  tokenToAssetInfo,
} from '@/utils/swapUrlState';
import { isSwapEnabledNetwork } from '@/config/networkCapabilities';

export function useSwapUrlSync(enabled: boolean): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const { chainId, switchNetwork } = useWallet();
  const fromAsset = useSwapStore((s) => s.fromAsset);
  const toAsset = useSwapStore((s) => s.toAsset);
  const slippage = useSwapStore((s) => s.slippage);
  const setFromAsset = useSwapStore((s) => s.setFromAsset);
  const setToAsset = useSwapStore((s) => s.setToAsset);
  const setSlippage = useSwapStore((s) => s.setSlippage);

  const hydratedRef = useRef(false);
  const applyingUrlRef = useRef(false);

  // Hydrate store from URL once when swap URL sync is enabled
  useEffect(() => {
    if (!enabled || hydratedRef.current) return;
    hydratedRef.current = true;

    const { params } = parseSwapSearchParams(`?${searchParams.toString()}`);
    applyingUrlRef.current = true;

    if (params.slippage !== undefined) {
      setSlippage(params.slippage);
    }

    const effectiveChain = params.chain ?? chainId ?? 1;
    if (params.chain !== undefined && params.chain !== chainId && isSwapEnabledNetwork(params.chain)) {
      void switchNetwork(params.chain).catch(() => {
        /* wallet may reject */
      });
    }

    if (params.from) {
      const asset = tokenToAssetInfo(params.from, effectiveChain);
      if (asset) setFromAsset(asset);
    }
    if (params.to) {
      const asset = tokenToAssetInfo(params.to, effectiveChain);
      if (asset) setToAsset(asset);
    }

    requestAnimationFrame(() => {
      applyingUrlRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per mount
  }, [enabled]);

  // Push store → URL when swap state changes (swap-enabled chains only)
  useEffect(() => {
    if (!enabled || applyingUrlRef.current) return;
    const cid = chainId ?? 1;
    if (!isSwapEnabledNetwork(cid)) return;

    const next = buildSwapSearchParams({
      chainId: cid,
      fromSymbol: fromAsset?.symbol,
      toSymbol: toAsset?.symbol,
      slippage,
    });
    const current = searchParams.toString();
    if (swapSearchStringsEqual(current, next)) return;

    setSearchParams(new URLSearchParams(next), { replace: true });
  }, [enabled, chainId, fromAsset?.symbol, toAsset?.symbol, slippage, searchParams, setSearchParams]);
}
