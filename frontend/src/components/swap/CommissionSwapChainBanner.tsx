/**
 * P4A — Swap-page banner when commission swaps are unavailable on the selected network.
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import {
  COMMISSION_SWAP_CHAIN_IDS,
  isCommissionSwapUnavailableOnChain,
} from '@/constants/commissionChains';
import { getChainName } from '@/utils/format';

type Props = {
  chainId: number;
  onSwitchToSwapChain?: (chainId: number) => void;
  isSwitching?: boolean;
};

export function CommissionSwapChainBanner({
  chainId,
  onSwitchToSwapChain,
  isSwitching = false,
}: Props) {
  if (!isCommissionSwapUnavailableOnChain(chainId)) return null;

  const chainName = getChainName(chainId) || `Chain ${chainId}`;

  return (
    <div
      className="relative z-10 mb-3 rounded-xl border border-amber-700/40 bg-amber-950/35 px-3 py-2.5 text-sm text-amber-50"
      role="alert"
      aria-live="polite"
    >
      <p className="font-medium text-amber-100">{SWAP_SURFACE_COPY.commissionSwapUnavailableTitle}</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
        {SWAP_SURFACE_COPY.commissionSwapUnavailableBody.replace('{network}', chainName)}
      </p>
      {onSwitchToSwapChain ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {COMMISSION_SWAP_CHAIN_IDS.map((swapChainId) => (
            <Button
              key={swapChainId}
              variant="secondary"
              size="sm"
              loading={isSwitching}
              onClick={() => onSwitchToSwapChain(swapChainId)}
            >
              Switch to {getChainName(swapChainId)}
            </Button>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-amber-100/70">
        <Link to="/trust" className="underline underline-offset-2 hover:text-amber-50">
          Why only some networks support swaps
        </Link>
      </p>
    </div>
  );
}

export default CommissionSwapChainBanner;
