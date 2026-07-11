/**
 * P16.3 — Full-page swap unavailable experience when swapSupported = false.
 * Reduces noise: no quote UI, route warnings, or swap workflow.
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { BRAND } from '@/constants/brand';
import { COMMISSION_SWAP_CHAIN_IDS } from '@/constants/commissionChains';
import {
  formatSwapEnabledNetworkList,
  getNetworkCapability,
  getSwapEnabledNetworkCapabilities,
  getWalletNetworkCapabilities,
} from '@/config/networkCapabilities';
import { APP_ROUTE_PATHS } from '@/config/appRoutes';
import { getChainName } from '@/utils/format';

type Props = {
  chainId: number;
  onSwitchToSwapChain?: (chainId: number) => void;
  isSwitching?: boolean;
};

export function UnsupportedSwapNetworkExperience({
  chainId,
  onSwitchToSwapChain,
  isSwitching = false,
}: Props) {
  const cap = getNetworkCapability(chainId);
  const chainName = getChainName(chainId) || cap?.name || `Chain ${chainId}`;
  const swapNetworks = formatSwapEnabledNetworkList();
  const readOnlyNetworks = getWalletNetworkCapabilities()
    .filter((n) => !n.swapSupported)
    .map((n) => n.name);

  return (
    <div
      className="relative z-10 rounded-2xl border border-amber-700/35 bg-gradient-to-b from-amber-950/40 to-electro-panel/80 p-5 sm:p-6"
      role="region"
      aria-labelledby="unsupported-swap-heading"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/90">
        Swap unavailable on this network
      </p>
      <h2 id="unsupported-swap-heading" className="mt-1 text-lg font-bold text-white">
        {chainName} — balances, send &amp; portfolio only
      </h2>
      <p className="mt-2 text-sm text-amber-50/90 leading-relaxed">
        {cap?.statusReason ??
          `Swaps with ${BRAND.productName} commission run on ${swapNetworks} only.`}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <CapabilityCard
          title="Portfolio"
          status="Available"
          detail="View holdings and activity on this network."
          href={APP_ROUTE_PATHS.portfolio}
          tone="positive"
        />
        <CapabilityCard
          title="Send"
          status="Available"
          detail="Transfer tokens on this network."
          href={APP_ROUTE_PATHS.send}
          tone="positive"
        />
        <CapabilityCard
          title="Swap"
          status="Unavailable"
          detail={`Switch to ${swapNetworks} to swap.`}
          tone="muted"
        />
      </div>

      {onSwitchToSwapChain ? (
        <div className="mt-5">
          <p className="text-xs text-dark-300 mb-2">Switch to a swap-enabled network:</p>
          <div className="flex flex-wrap gap-2">
            {COMMISSION_SWAP_CHAIN_IDS.map((swapChainId) => (
              <Button
                key={swapChainId}
                variant="secondary"
                size="sm"
                loading={isSwitching}
                onClick={() => onSwitchToSwapChain(swapChainId)}
              >
                {getChainName(swapChainId)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 pt-4 border-t border-white/[0.06] space-y-2 text-xs text-dark-400">
        <p>
          <span className="text-dark-300">Swap networks:</span>{' '}
          {getSwapEnabledNetworkCapabilities().map((n) => n.name).join(', ')}
        </p>
        <p>
          <span className="text-dark-300">Balance-view networks:</span>{' '}
          {readOnlyNetworks.join(', ')}
        </p>
        <Link
          to={APP_ROUTE_PATHS.trust}
          className="inline-block text-accent hover:underline underline-offset-2"
        >
          Why only some networks support swaps →
        </Link>
      </div>
    </div>
  );
}

function CapabilityCard({
  title,
  status,
  detail,
  href,
  tone,
}: {
  title: string;
  status: string;
  detail: string;
  href?: string;
  tone: 'positive' | 'muted';
}) {
  const inner = (
    <>
      <p className="text-xs font-semibold text-dark-200">{title}</p>
      <p
        className={`mt-0.5 text-sm font-medium ${
          tone === 'positive' ? 'text-emerald-400' : 'text-amber-300/90'
        }`}
      >
        {status}
      </p>
      <p className="mt-1 text-[11px] text-dark-400 leading-snug">{detail}</p>
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="block rounded-xl border border-white/[0.08] bg-black/20 p-3 hover:border-white/[0.14] hover:bg-black/30 transition-colors no-underline"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3 opacity-90">{inner}</div>
  );
}

export default UnsupportedSwapNetworkExperience;
