import type { AssetAllocation } from './portfolioIntelligenceModel';
import { formatPercent } from './portfolioIntelligenceModel';

interface Props {
  assets: AssetAllocation[];
  privacyMode: boolean;
}

const SEGMENT_COLORS = [
  'bg-accent/80',
  'bg-cyan/70',
  'bg-emerald-500/60',
  'bg-purple-500/50',
  'bg-dark-400/70',
];

export function PortfolioAllocationBar({ assets, privacyMode }: Props) {
  if (assets.length === 0) {
    return (
      <p className="text-xs text-dark-500 py-2">No allocation data yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-black/30 border border-white/[0.06]">
        {assets.map((a, i) =>
          a.percent > 0 ? (
            <div
              key={a.symbol}
              className={`${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} transition-all`}
              style={{ width: `${Math.max(a.percent, privacyMode ? 0 : 0.5)}%` }}
              title={`${a.symbol} ${formatPercent(a.percent, privacyMode)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="space-y-1.5">
        {assets.map((a, i) => (
          <li key={a.symbol} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 min-w-0 text-dark-200">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
              />
              <span className="truncate font-medium">{a.symbol}</span>
              {a.isStablecoin && (
                <span className="text-[9px] text-dark-500 shrink-0">stable</span>
              )}
            </span>
            <span className="text-dark-400 tabular-nums shrink-0">
              {formatPercent(a.percent, privacyMode)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
