import type { PortfolioIntelligenceModel } from './portfolioIntelligenceModel';
import { formatPercent } from './portfolioIntelligenceModel';
import { ShellPanel } from '@/components/ui/ShellPrimitives';

interface Props {
  model: PortfolioIntelligenceModel;
  privacyMode: boolean;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-accent';
  if (score >= 60) return 'text-emerald-300';
  if (score >= 40) return 'text-yellow-400';
  return 'text-orange-400';
}

function ringColor(score: number): string {
  if (score >= 80) return 'border-accent/40 shadow-[0_0_20px_rgba(46,255,139,0.12)]';
  if (score >= 60) return 'border-emerald-500/30';
  if (score >= 40) return 'border-yellow-500/30';
  return 'border-orange-500/30';
}

export function PortfolioHealthScore({ model, privacyMode }: Props) {
  const { walletHealthScore, walletHealthLabel, riskLabel } = model;

  return (
    <ShellPanel className="p-4 flex flex-col items-center text-center sm:items-start sm:text-left">
      <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Wallet Health</p>
      <div
        className={`flex items-center justify-center w-16 h-16 rounded-full border-2 ${ringColor(walletHealthScore)} mb-2`}
      >
        <span className={`text-2xl font-bold tabular-nums ${scoreColor(walletHealthScore)}`}>
          {privacyMode ? '••' : walletHealthScore}
        </span>
      </div>
      <p className="text-sm font-semibold text-white">{walletHealthLabel}</p>
      <p className="text-[10px] text-dark-500 mt-1 leading-snug">
        Based on balance distribution only.
      </p>
      <p className="text-[11px] text-dark-400 mt-2">{riskLabel}</p>
      {!privacyMode && model.largestPosition && (
        <p className="text-[10px] text-dark-500 mt-1">
          Top asset {formatPercent(model.largestPositionPercent, false)} ·{' '}
          {formatPercent(model.stablecoinExposurePercent, false)} stables
        </p>
      )}
    </ShellPanel>
  );
}
