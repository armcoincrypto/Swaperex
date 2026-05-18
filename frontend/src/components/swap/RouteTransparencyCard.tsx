/**
 * P8-F — Display-only route transparency for the swap quote panel.
 * Surfaces provider, selection rationale, runner-up, and key quote metrics without Advanced.
 */

import type { PriceImpactSeverity } from '@/utils/format';

export interface RouteTransparencyCardProps {
  providerLabel: string;
  routeModeLabel: string;
  amountOutFormatted: string;
  minimumReceived: string;
  priceImpactLabel: string;
  priceImpactSeverity: PriceImpactSeverity;
  gasUnitsDisplay: string | null;
  quoteSelectionReason?: string | null;
  runnerUpProviderLabel?: string | null;
  runnerUpAmountOut?: string | null;
  needsApproval?: boolean;
  allowanceCheckUncertain?: boolean;
}

function impactTextClass(severity: PriceImpactSeverity): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'text-red-400';
    case 'medium':
      return 'text-amber-300';
    case 'low':
    case 'negligible':
      return 'text-emerald-300/90';
    default:
      return 'text-dark-400';
  }
}

export function RouteTransparencyCard({
  providerLabel,
  routeModeLabel,
  amountOutFormatted,
  minimumReceived,
  priceImpactLabel,
  priceImpactSeverity,
  gasUnitsDisplay,
  quoteSelectionReason,
  runnerUpProviderLabel,
  runnerUpAmountOut,
  needsApproval = false,
  allowanceCheckUncertain = false,
}: RouteTransparencyCardProps) {
  const hasRunnerUp = Boolean(runnerUpProviderLabel && runnerUpAmountOut);

  return (
    <div
      className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 space-y-2 min-w-0"
      aria-label="Route transparency"
    >
      {/* A) Header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-dark-500">Route</span>
            <span className="inline-flex items-center rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-dark-100">
              {providerLabel}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-dark-500 leading-snug">
            {routeModeLabel}
            <span className="text-dark-600"> · </span>
            <span className="text-dark-300 tabular-nums">~{amountOutFormatted}</span>
          </p>
        </div>
      </div>

      {/* B) Selection reason */}
      {quoteSelectionReason?.trim() && (
        <p
          className="text-[10px] text-dark-300 leading-snug"
          title={quoteSelectionReason.trim()}
        >
          <span className="text-dark-500">Selected:</span>{' '}
          <span className="text-dark-200">{quoteSelectionReason.trim()}</span>
        </p>
      )}

      {/* C) Runner-up */}
      {hasRunnerUp && (
        <p className="text-[10px] text-dark-400 leading-snug truncate" title={`${runnerUpProviderLabel} · ${runnerUpAmountOut}`}>
          <span className="text-dark-500">Runner-up:</span>{' '}
          {runnerUpProviderLabel} · <span className="tabular-nums">{runnerUpAmountOut}</span>
        </p>
      )}

      {/* D) Metrics row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 border-t border-white/[0.05] text-[10px] tabular-nums">
        <span className="text-dark-500">
          Min out <span className="text-dark-200">{minimumReceived}</span>
        </span>
        <span className="text-dark-600" aria-hidden>
          ·
        </span>
        <span className="text-dark-500">
          Impact{' '}
          <span className={impactTextClass(priceImpactSeverity)}>{priceImpactLabel}</span>
        </span>
        <span className="text-dark-600" aria-hidden>
          ·
        </span>
        <span className="text-dark-500">
          Gas <span className="text-dark-300 font-mono">{gasUnitsDisplay ?? '—'}</span>
        </span>
      </div>

      {/* E) Optional badges */}
      {(needsApproval || allowanceCheckUncertain) && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {needsApproval && (
            <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-medium border border-blue-700/35 bg-blue-950/30 text-blue-300/90">
              Approval needed
            </span>
          )}
          {allowanceCheckUncertain && (
            <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-medium border border-amber-700/35 bg-amber-950/25 text-amber-200/85">
              Allowance unverified
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default RouteTransparencyCard;
