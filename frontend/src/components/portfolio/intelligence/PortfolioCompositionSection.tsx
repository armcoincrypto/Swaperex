import type { CompositionBucket } from './portfolioIntelligenceModel';
import { formatPercent } from './portfolioIntelligenceModel';
import { formatUsdPrivate } from '@/stores/portfolioStore';
import { ShellPanel } from '@/components/ui/ShellPrimitives';

interface Props {
  buckets: CompositionBucket[];
  privacyMode: boolean;
  totalValueUsd: number;
}

const BUCKET_BAR_CLASS: Record<CompositionBucket['id'], string> = {
  stablecoins: 'bg-emerald-500/65',
  major: 'bg-accent/75',
  longtail: 'bg-purple-500/50',
  zero: 'bg-dark-500/60',
};

export function PortfolioCompositionSection({
  buckets,
  privacyMode,
  totalValueUsd,
}: Props) {
  const visibleBuckets = buckets.filter((b) => b.count > 0 || b.id === 'zero');

  if (visibleBuckets.length === 0) {
    return (
      <ShellPanel className="p-3 sm:p-4">
        <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">
          Portfolio Composition
        </p>
        <p className="text-xs text-dark-500">No composition data yet.</p>
      </ShellPanel>
    );
  }

  return (
    <ShellPanel className="p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-[10px] uppercase tracking-wider text-dark-500">
          Portfolio Composition
        </p>
        {!privacyMode && totalValueUsd > 0 && (
          <span className="text-[10px] text-dark-600 tabular-nums">
            {formatUsdPrivate(totalValueUsd, false)} total
          </span>
        )}
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/30 border border-white/[0.06] mb-3">
        {visibleBuckets
          .filter((b) => b.id !== 'zero' && b.percent > 0)
          .map((b) => (
            <div
              key={b.id}
              className={`${BUCKET_BAR_CLASS[b.id]} transition-all`}
              style={{ width: privacyMode ? '0%' : `${Math.max(b.percent, 0.5)}%` }}
              title={`${b.label} ${formatPercent(b.percent, privacyMode)}`}
            />
          ))}
      </div>

      <ul className="space-y-2">
        {visibleBuckets.map((bucket) => (
          <li key={bucket.id} className="rounded-lg border border-white/[0.05] bg-black/10 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${BUCKET_BAR_CLASS[bucket.id]}`}
                />
                <span className="text-[11px] font-medium text-dark-200">{bucket.label}</span>
              </span>
              <span className="text-[10px] text-dark-500 tabular-nums shrink-0">
                {bucket.id === 'zero'
                  ? `${bucket.count} balance${bucket.count !== 1 ? 's' : ''}`
                  : `${bucket.count} · ${formatPercent(bucket.percent, privacyMode)}`}
              </span>
            </div>
            {bucket.id !== 'zero' && !privacyMode && bucket.usdValue > 0 && (
              <p className="text-[10px] text-dark-500 pl-4">
                {formatUsdPrivate(bucket.usdValue, false)}
                {bucket.previewSymbols.length > 0 && (
                  <span className="text-dark-600">
                    {' '}
                    · {bucket.previewSymbols.join(', ')}
                    {bucket.count > bucket.previewSymbols.length ? '…' : ''}
                  </span>
                )}
              </p>
            )}
            {bucket.id === 'zero' && (
              <p className="text-[10px] text-dark-500 pl-4 leading-snug">
                Tokens with balance but no USD price on record.
              </p>
            )}
          </li>
        ))}
      </ul>
    </ShellPanel>
  );
}
