/**
 * P8-B — Display-only swap execution step rail.
 * Maps existing SwapStatus / quote fields to visual steps; no execution side effects.
 */

import type { SwapStatus } from '@/hooks/useSwap';

export type SwapExecutionRailStepId = 'quote' | 'approve' | 'sign' | 'confirm';

const STEP_ORDER: SwapExecutionRailStepId[] = ['quote', 'approve', 'sign', 'confirm'];

const STEP_LABELS: Record<SwapExecutionRailStepId, string> = {
  quote: 'Quote',
  approve: 'Approve',
  sign: 'Sign',
  confirm: 'Confirm',
};

export interface SwapExecutionRailProps {
  status: SwapStatus;
  isConnected: boolean;
  hasQuote: boolean;
  needsApproval?: boolean;
  quoteSecondsRemaining: number | null;
  providerLabel?: string | null;
  error?: string | null;
}

function resolveActiveStep(status: SwapStatus, hasQuote: boolean): SwapExecutionRailStepId {
  if (status === 'success') return 'confirm';
  if (status === 'confirming') return 'confirm';
  if (status === 'swapping') return 'sign';
  if (status === 'approving') return 'approve';
  if (status === 'previewing') return 'quote';
  if (status === 'fetching_quote' || status === 'checking_allowance') return 'quote';
  if (status === 'error') return hasQuote ? 'sign' : 'quote';
  return 'quote';
}

type StepVisual = 'pending' | 'current' | 'done' | 'skipped' | 'error';

function stepVisual(
  stepId: SwapExecutionRailStepId,
  activeStep: SwapExecutionRailStepId,
  status: SwapStatus,
  needsApproval: boolean,
): StepVisual {
  if (stepId === 'approve' && !needsApproval) return 'skipped';

  const activeIndex = STEP_ORDER.indexOf(activeStep);
  const stepIndex = STEP_ORDER.indexOf(stepId);

  if (status === 'error' && stepId === activeStep) return 'error';
  if (status === 'success') return 'done';
  if (stepIndex < activeIndex) return 'done';
  if (stepIndex === activeIndex) {
    if (status === 'error') return 'error';
    return 'current';
  }
  return 'pending';
}

function stepCircleClass(visual: StepVisual): string {
  switch (visual) {
    case 'done':
      return 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200/90';
    case 'current':
      return 'border-accent/50 bg-accent/10 text-accent';
    case 'error':
      return 'border-amber-600/45 bg-amber-950/30 text-amber-200/90';
    case 'skipped':
      return 'border-white/[0.06] bg-white/[0.02] text-dark-600';
    default:
      return 'border-white/[0.08] bg-white/[0.02] text-dark-500';
  }
}

function stepLabelClass(visual: StepVisual): string {
  switch (visual) {
    case 'done':
      return 'text-emerald-200/80';
    case 'current':
      return 'text-dark-100 font-medium';
    case 'error':
      return 'text-amber-200/90 font-medium';
    case 'skipped':
      return 'text-dark-600';
    default:
      return 'text-dark-500';
  }
}

function connectorClass(leftVisual: StepVisual, rightVisual: StepVisual): string {
  if (leftVisual === 'done' && (rightVisual === 'done' || rightVisual === 'current')) {
    return 'bg-emerald-600/35';
  }
  if (leftVisual === 'done') return 'bg-white/[0.12]';
  return 'bg-white/[0.06]';
}

function resolveSubtitle(props: SwapExecutionRailProps): string | null {
  const {
    status,
    isConnected,
    hasQuote,
    quoteSecondsRemaining,
    providerLabel,
    error,
  } = props;

  if (!isConnected) {
    return 'Connect your wallet to begin';
  }

  if (status === 'error' && error?.trim()) {
    return error.trim();
  }

  if (status === 'idle' && !hasQuote) {
    return 'Enter an amount for a live quote';
  }

  if (
    status === 'fetching_quote' ||
    status === 'checking_allowance'
  ) {
    return 'Requesting quote…';
  }

  const parts: string[] = [];

  if (providerLabel) {
    parts.push(`Route via ${providerLabel}`);
  }

  if (hasQuote) {
    if (quoteSecondsRemaining !== null && quoteSecondsRemaining <= 0) {
      parts.push('Quote expired — request a new quote');
    } else if (quoteSecondsRemaining !== null) {
      parts.push(`Route ready · Quote expires in ${quoteSecondsRemaining}s`);
    } else {
      parts.push('Route ready');
    }
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function SwapExecutionRail({
  status,
  isConnected,
  hasQuote,
  needsApproval = false,
  quoteSecondsRemaining,
  providerLabel,
  error,
}: SwapExecutionRailProps) {
  const activeStep = resolveActiveStep(status, hasQuote);
  const hasError = status === 'error';
  const subtitle = resolveSubtitle({
    status,
    isConnected,
    hasQuote,
    needsApproval,
    quoteSecondsRemaining,
    providerLabel,
    error,
  });

  return (
    <div
      className={`relative z-10 mb-3 rounded-xl border px-3 py-2.5 transition-colors duration-150 ${
        hasError
          ? 'border-amber-800/35 bg-amber-950/15'
          : 'border-white/[0.08] bg-black/20'
      } ${!isConnected ? 'opacity-75' : ''}`}
      aria-label="Swap execution progress"
    >
      <div className="flex items-center min-w-0">
        {STEP_ORDER.map((stepId, index) => {
          const visual = stepVisual(stepId, activeStep, status, needsApproval);
          const nextStep = STEP_ORDER[index + 1];
          const nextVisual = nextStep
            ? stepVisual(nextStep, activeStep, status, needsApproval)
            : null;

          return (
            <div key={stepId} className="flex items-center min-w-0 flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 min-w-0 flex-shrink-0">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums ${stepCircleClass(visual)}`}
                  aria-current={visual === 'current' ? 'step' : undefined}
                  title={visual === 'skipped' ? 'Approval not required' : undefined}
                >
                  {visual === 'done' ? '✓' : index + 1}
                </div>
                <span
                  className={`text-[10px] leading-none whitespace-nowrap ${stepLabelClass(visual)}`}
                >
                  {STEP_LABELS[stepId]}
                  {visual === 'skipped' ? (
                    <span className="block text-[9px] text-dark-600 mt-0.5 normal-case tracking-normal">
                      Not required
                    </span>
                  ) : null}
                </span>
              </div>
              {index < STEP_ORDER.length - 1 && (
                <div
                  className={`mx-1 h-px flex-1 min-w-[0.5rem] ${connectorClass(visual, nextVisual ?? 'pending')}`}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
      {subtitle && (
        <p
          className={`mt-2 text-[10px] leading-snug truncate ${
            hasError ? 'text-amber-200/80' : 'text-dark-400'
          }`}
          title={subtitle}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default SwapExecutionRail;
