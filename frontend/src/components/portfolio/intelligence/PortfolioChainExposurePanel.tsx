import type { ChainAllocation } from './portfolioIntelligenceModel';
import { formatPercent } from './portfolioIntelligenceModel';
import { getPortfolioChainLabel } from '@/stores/portfolioStore';
import type { PortfolioChain } from '@/services/portfolioTypes';
import { ShellPanel } from '@/components/ui/ShellPrimitives';

interface Props {
  chainAllocations: ChainAllocation[];
  privacyMode: boolean;
}

const CHAIN_CHIP: Partial<Record<PortfolioChain, string>> = {
  ethereum: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/25',
  bsc: 'bg-amber-500/15 text-amber-100 border-amber-500/30',
  polygon: 'bg-purple-500/15 text-purple-200 border-purple-500/25',
};

export function PortfolioChainExposurePanel({ chainAllocations, privacyMode }: Props) {
  const allChains: PortfolioChain[] = ['ethereum', 'bsc', 'polygon'];
  const byChain = new Map(chainAllocations.map((c) => [c.chain, c]));

  return (
    <ShellPanel className="p-3 sm:p-4 h-full">
      <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Chain Exposure</p>
      <ul className="space-y-2.5">
        {allChains.map((chain) => {
          const row = byChain.get(chain);
          const pct = row?.percent ?? 0;
          const label = row?.label ?? getPortfolioChainLabel(chain);
          return (
            <li key={chain}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={`text-[10px] font-medium rounded-full border px-2 py-0.5 ${CHAIN_CHIP[chain] ?? 'bg-electro-panel/50 text-dark-300 border-white/[0.08]'}`}
                >
                  {label}
                </span>
                <span className="text-[11px] text-dark-400 tabular-nums">
                  {formatPercent(pct, privacyMode)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-black/30 border border-white/[0.04] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent/80 to-cyan/60 rounded-full transition-all"
                  style={{ width: privacyMode ? '0%' : `${Math.min(pct, 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ShellPanel>
  );
}
