/**
 * Guard Warning Panel
 *
 * Displays warnings or blocks when preset guards fail.
 */

import type { GuardEvaluation, GuardWarning } from '@/stores/presetStore';
import { WhyButton } from '@/components/common/ExplainerTooltip';

interface GuardWarningPanelProps {
  evaluation: GuardEvaluation;
  onDismiss?: () => void;
  onProceedAnyway?: () => void;
}

// Map warning types to explainer IDs
function getExplainerForWarning(warning: GuardWarning): string {
  switch (warning.type) {
    case 'safety':
      return 'guardSafetyFailed';
    case 'impact':
      return 'guardImpactFailed';
    case 'liquidity':
      return 'guardLiquidityFailed';
    default:
      return 'guardSafetyFailed';
  }
}

export function GuardWarningPanel({ evaluation, onDismiss, onProceedAnyway }: GuardWarningPanelProps) {
  if (evaluation.passed) {
    return null;
  }

  const isBlocked = evaluation.blocked;

  return (
    <div
      className={`rounded-xl border p-4 ${
        isBlocked
          ? 'bg-red-900/20 border-red-800'
          : 'bg-yellow-900/20 border-yellow-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isBlocked ? <BlockIcon /> : <WarningIcon />}
          <span className={`font-medium ${isBlocked ? 'text-red-400' : 'text-yellow-400'}`}>
            {isBlocked ? 'Preset Blocked' : 'Preset Warnings'}
          </span>
        </div>
        {onDismiss && !isBlocked && (
          <button
            onClick={onDismiss}
            className="text-dark-400 hover:text-white transition-colors"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Warning Messages */}
      <div className="space-y-2 mb-3">
        {evaluation.warnings.map((warning, index) => (
          <div
            key={index}
            className={`flex items-center justify-between text-sm ${
              isBlocked ? 'text-red-300' : 'text-yellow-300'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5">•</span>
              <span>{warning.message}</span>
            </div>
            <WhyButton explainerId={getExplainerForWarning(warning)} />
          </div>
        ))}
      </div>

      {/* Actions */}
      {isBlocked ? (
        <div className="text-xs text-red-400/80">
          This preset cannot execute because hard protection is enabled.
          Edit the preset to change conditions or switch to advise mode.
        </div>
      ) : (
        onProceedAnyway && (
          <div className="flex items-center justify-between pt-2 border-t border-yellow-800/50">
            <span className="text-xs text-yellow-400/70">
              You can still proceed despite warnings
            </span>
            <button
              onClick={onProceedAnyway}
              className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-500 rounded-lg transition-colors"
            >
              Proceed Anyway
            </button>
          </div>
        )
      )}
    </div>
  );
}

function WarningIcon() {
  return (
    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default GuardWarningPanel;
