/**
 * Signal Debug Panel
 *
 * Shows detailed debug information for signals.
 * Only visible when debug mode is enabled (?debug=1 or localStorage).
 *
 * Features:
 * - Liquidity check status
 * - Risk check status
 * - Cooldown status
 * - Confidence breakdown
 */

import { useState } from 'react';
import { useDebugMode } from '@/stores/debugStore';

interface LiquidityDebug {
  check: {
    passed: boolean;
    currentLiquidity: number | null;
    previousLiquidity: number | null;
    dropPct: number | null;
    threshold: number;
    reason: string;
  };
  cooldown: {
    active: boolean;
    remainingSeconds: number;
    lastSeverity: string | null;
  };
}

interface RiskDebug {
  check: {
    passed: boolean;
    riskFactorCount: number;
    riskFactors: string[];
    isHoneypot: boolean;
    reason: string;
  };
  cooldown: {
    active: boolean;
    remainingSeconds: number;
    lastSeverity: string | null;
  };
}

interface SignalDebugData {
  liquidity: LiquidityDebug;
  risk: RiskDebug;
  evaluatedAt: number;
  version: string;
}

interface SignalDebugPanelProps {
  debug: SignalDebugData | null;
  loading?: boolean;
  error?: string | null;
}

function formatTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function StatusIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="text-green-400">✓</span>
  ) : (
    <span className="text-dark-500">○</span>
  );
}

function CooldownBadge({ active, remainingSeconds }: { active: boolean; remainingSeconds: number }) {
  if (!active) {
    return <span className="text-dark-500 text-xs">inactive</span>;
  }
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return (
    <span className="text-yellow-400 text-xs font-mono">
      {minutes}:{seconds.toString().padStart(2, '0')} remaining
    </span>
  );
}

export function SignalDebugPanel({ debug, loading, error }: SignalDebugPanelProps) {
  const debugEnabled = useDebugMode();
  const [expanded, setExpanded] = useState(false);

  // Don't render if debug mode is not enabled
  if (!debugEnabled) {
    return null;
  }

  return (
    <div className="mt-4 border border-dark-700 rounded-lg bg-dark-900/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-dark-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-dark-400">DEBUG</span>
          {loading && (
            <span className="text-xs text-yellow-400 animate-pulse">loading...</span>
          )}
          {error && (
            <span className="text-xs text-red-400">{error}</span>
          )}
        </div>
        <span className="text-dark-500 text-xs">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Content */}
      {expanded && debug && (
        <div className="px-4 pb-4 space-y-4 font-mono text-xs">
          {/* Liquidity Check */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-dark-300">
              <StatusIcon passed={debug.liquidity.check.passed} />
              <span>Liquidity</span>
            </div>
            <div className="pl-5 space-y-0.5 text-dark-500">
              <div>
                {debug.liquidity.check.currentLiquidity !== null && (
                  <span>Current: ${debug.liquidity.check.currentLiquidity.toLocaleString()}</span>
                )}
              </div>
              {debug.liquidity.check.dropPct !== null && debug.liquidity.check.dropPct > 0 && (
                <div>
                  Drop: <span className="text-red-400">{debug.liquidity.check.dropPct.toFixed(1)}%</span>
                  <span className="text-dark-600"> (threshold: {debug.liquidity.check.threshold}%)</span>
                </div>
              )}
              <div className="text-dark-400">{debug.liquidity.check.reason}</div>
              <div className="flex items-center gap-2">
                <span className="text-dark-600">Cooldown:</span>
                <CooldownBadge
                  active={debug.liquidity.cooldown.active}
                  remainingSeconds={debug.liquidity.cooldown.remainingSeconds}
                />
              </div>
            </div>
          </div>

          {/* Risk Check */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-dark-300">
              <StatusIcon passed={debug.risk.check.passed} />
              <span>Risk</span>
              {debug.risk.check.isHoneypot && (
                <span className="px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded text-[10px]">
                  HONEYPOT
                </span>
              )}
            </div>
            <div className="pl-5 space-y-0.5 text-dark-500">
              <div>
                Factors: <span className="text-dark-300">{debug.risk.check.riskFactorCount}</span>
              </div>
              {debug.risk.check.riskFactors.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {debug.risk.check.riskFactors.map((factor, i) => (
                    <span
                      key={i}
                      className="px-1 py-0.5 bg-red-900/20 text-red-400/80 rounded text-[10px]"
                    >
                      {factor.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-dark-400">{debug.risk.check.reason}</div>
              <div className="flex items-center gap-2">
                <span className="text-dark-600">Cooldown:</span>
                <CooldownBadge
                  active={debug.risk.cooldown.active}
                  remainingSeconds={debug.risk.cooldown.remainingSeconds}
                />
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="pt-2 border-t border-dark-800 text-dark-600 flex items-center justify-between">
            <span>v{debug.version}</span>
            <span>Evaluated {formatTime(debug.evaluatedAt)}</span>
          </div>
        </div>
      )}

      {/* Loading state */}
      {expanded && loading && !debug && (
        <div className="px-4 pb-4 text-xs text-dark-500 font-mono">
          Fetching debug data...
        </div>
      )}

      {/* No data state */}
      {expanded && !loading && !debug && !error && (
        <div className="px-4 pb-4 text-xs text-dark-500 font-mono">
          No debug data available. Make a signal request first.
        </div>
      )}
    </div>
  );
}

export default SignalDebugPanel;
