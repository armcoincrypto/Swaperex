import { useEffect, useId, useMemo, useState } from 'react';
import type { AssetInfo } from '@/types/api';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import {
  buildTokenSafetySummaryLines,
  fetchSwapTokenSafetySignals,
  getTokenSafetyCriticalAlerts,
  hasTokenSafetyHighRisk,
  statusColorClasses,
  statusDotClass,
  type SwapTokenSafetySignal,
  type TokenSafetySummaryLine,
} from './swapTokenSafetyModel';

interface Props {
  token: AssetInfo | null;
  chainId: number;
}

function SummaryRow({ line }: { line: TokenSafetySummaryLine }) {
  const statusForStyle =
    line.status === 'loading' || line.status === 'na' ? 'unknown' : line.status;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-[11px] ${statusColorClasses(statusForStyle)}`}
    >
      <span className="text-dark-300 shrink-0">{line.categoryLabel}</span>
      <span className="font-medium text-right leading-snug min-w-0">{line.value}</span>
    </div>
  );
}

function SignalDetailRow({ signal }: { signal: SwapTokenSafetySignal }) {
  return (
    <li
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${statusColorClasses(signal.status)}`}
    >
      <span
        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(signal.status)}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <span className="font-medium">{signal.label}</span>
        <p className="text-dark-400 mt-0.5 leading-snug">{signal.detail}</p>
      </div>
    </li>
  );
}

export function TokenSafetyPanel({ token, chainId }: Props) {
  const detailsId = useId();
  const [signals, setSignals] = useState<SwapTokenSafetySignal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!token) {
      setSignals(null);
      return;
    }

    if (token.is_native) {
      setSignals(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchSwapTokenSafetySignals({
      chainId,
      contractAddress: token.contract_address,
      isNative: token.is_native,
    }).then((result) => {
      if (!cancelled) {
        setSignals(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token?.symbol, token?.contract_address, token?.is_native, chainId]);

  const summaryLines = useMemo(
    () =>
      buildTokenSafetySummaryLines({
        signals,
        loading,
        isNative: !!token?.is_native,
        hasToken: !!token,
      }),
    [signals, loading, token?.is_native, token],
  );

  const criticalAlerts = useMemo(() => getTokenSafetyCriticalAlerts(signals), [signals]);
  const showHighRiskBanner = hasTokenSafetyHighRisk(signals);
  const showFullAnalysis = !!token && !token.is_native && (!!signals || loading);

  return (
    <ShellPanel className="p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        {token ? (
          <SwapTokenAvatar symbol={token.symbol} logoUrl={token.logo_url} size="sm" />
        ) : null}
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-dark-500">Token Safety</p>
          <p className="text-xs font-medium text-white truncate">
            {token ? `${token.symbol} receive-side` : 'Select a receive token'}
          </p>
        </div>
      </div>

      {showHighRiskBanner && (
        <div
          role="alert"
          className="mb-2.5 rounded-lg border border-red-800/40 bg-red-950/35 px-2.5 py-2 text-[11px] text-red-300"
        >
          <p className="font-medium">High-risk signal detected</p>
          <p className="mt-0.5 text-red-200/90 leading-snug">
            {criticalAlerts.find((alert) => alert.status === 'risk')?.detail ??
              'Review full token analysis before continuing'}
          </p>
        </div>
      )}

      {!showHighRiskBanner && criticalAlerts.length > 0 && (
        <div
          role="status"
          className="mb-2.5 rounded-lg border border-amber-800/35 bg-amber-950/20 px-2.5 py-2 text-[11px] text-amber-200"
        >
          <p className="font-medium">Warning signal detected</p>
          <p className="mt-0.5 text-amber-100/90 leading-snug">{criticalAlerts[0].detail}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-1.5" aria-busy="true" aria-label="Loading token safety analysis">
          {summaryLines.map((line) => (
            <div
              key={line.id}
              className="h-8 rounded-lg bg-electro-panel/40 border border-white/[0.04] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5" aria-label="Token safety summary">
          {summaryLines.map((line) => (
            <SummaryRow key={line.id} line={line} />
          ))}
        </div>
      )}

      {!loading && !token && (
        <p className="text-xs text-dark-500 mt-2 leading-snug">
          Choose a receive token to review safety signals.
        </p>
      )}

      {showFullAnalysis && (
        <div className="mt-2.5">
          <button
            type="button"
            className="min-h-[44px] w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-left text-xs text-primary-300 hover:bg-black/30 hover:border-white/[0.12] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Hide full token analysis' : 'View full token analysis'}
          </button>

          {expanded && (
            <div id={detailsId} className="mt-2.5 space-y-2">
              <p className="text-[10px] text-dark-500 leading-snug">
                Radar-style checks via GoPlus when available · not financial advice
              </p>
              {signals && signals.length > 0 ? (
                <ul className="space-y-1.5">
                  {signals.map((signal) => (
                    <SignalDetailRow key={signal.id} signal={signal} />
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-dark-400 py-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5">
                  Safety data unavailable.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </ShellPanel>
  );
}
