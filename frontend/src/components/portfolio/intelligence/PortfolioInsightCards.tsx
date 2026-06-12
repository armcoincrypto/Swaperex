import type { PortfolioIntelligenceModel } from './portfolioIntelligenceModel';
import { formatPercent } from './portfolioIntelligenceModel';
import { ShellPanel } from '@/components/ui/ShellPrimitives';

interface Props {
  model: PortfolioIntelligenceModel;
  privacyMode: boolean;
}

function InsightCard({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: string;
  secondary: string;
}) {
  return (
    <ShellPanel className="p-3 sm:p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-1">{title}</p>
      <p className="text-base font-semibold text-white truncate">{primary}</p>
      <p className="text-[11px] text-dark-400 mt-0.5 leading-snug">{secondary}</p>
    </ShellPanel>
  );
}

export function PortfolioInsightCards({ model, privacyMode }: Props) {
  const {
    largestPosition,
    stablecoinExposurePercent,
    diversificationLabel,
    assetCount,
    chainCount,
    largestChain,
    largestChainPercent,
  } = model;

  const stableSecondary =
    stablecoinExposurePercent >= 40
      ? 'Liquidity cushion'
      : stablecoinExposurePercent >= 15
        ? 'Some stable exposure'
        : 'Mostly volatile assets';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      <InsightCard
        title="Largest Position"
        primary={privacyMode ? '****' : largestPosition?.symbol ?? '—'}
        secondary={
          privacyMode
            ? 'Hidden'
            : largestPosition
              ? `${formatPercent(largestPosition.percent, false)} of wallet`
              : 'No positions'
        }
      />
      <InsightCard
        title="Stablecoin Exposure"
        primary={formatPercent(stablecoinExposurePercent, privacyMode)}
        secondary={stableSecondary}
      />
      <InsightCard
        title="Diversification"
        primary={diversificationLabel}
        secondary={`${assetCount} asset${assetCount !== 1 ? 's' : ''} across ${chainCount} chain${chainCount !== 1 ? 's' : ''}`}
      />
      <InsightCard
        title="Largest Chain"
        primary={privacyMode ? '****' : largestChain?.label ?? '—'}
        secondary={
          privacyMode
            ? 'Hidden'
            : largestChain
              ? `${formatPercent(largestChainPercent, false)} of wallet`
              : 'No chain data'
        }
      />
    </div>
  );
}
