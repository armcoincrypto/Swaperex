import { useMemo } from 'react';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import { buildMarketContext } from './swapIntelCenterModel';

interface Props {
  activeChainId: number;
}

export function MarketContextPanel({ activeChainId }: Props) {
  const rows = useMemo(() => buildMarketContext(activeChainId), [activeChainId]);

  return (
    <ShellPanel className="p-3 sm:p-4">
      <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-0.5">Market Context</p>
      <p className="text-[10px] text-dark-500 mb-2.5 leading-snug">
        Catalog and routing facts only — no live volume or trader counts
      </p>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-2 text-[11px]">
            <dt className="text-dark-400 shrink-0">{row.label}</dt>
            <dd className="text-dark-200 text-right font-medium leading-snug">{row.value}</dd>
          </div>
        ))}
      </dl>
    </ShellPanel>
  );
}
