/**
 * Radar Panel Component
 *
 * Main panel showing all radar signals.
 * Integrates: RadarFilterBar (monitoring status + view scope + filters),
 * live alerts (radarStore), Activity Timeline (signalHistoryStore),
 * watchlist, wallet scan, alerts, and debug.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRadarStore, type RadarSignal } from '@/stores/radarStore';
import { useUsageStore } from '@/stores/usageStore';
import { useDebugStore, useDebugMode } from '@/stores/debugStore';
import { useSignalHistoryStore } from '@/stores/signalHistoryStore';
import { useSignalFilterStore, shouldShowHistoryEntry } from '@/stores/signalFilterStore';
import { useMonitoringStore } from '@/stores/monitoringStore';
import { RadarItem } from './RadarItem';
import { TierBadge } from '@/components/common/TierBadge';
import { SignalsStatusBadge } from '@/components/signals/SignalsStatusBadge';
import { SignalDebugPanel } from '@/components/signals/SignalDebugPanel';
import { ActivityTimeline } from '@/components/signals/ActivityTimeline';
import { TokenCheckInput } from '@/components/signals/TokenCheckInput';
import { WatchlistPanel } from '@/components/signals/WatchlistPanel';
import { RadarIntroCard } from '@/components/radar/RadarIntroCard';
import { RadarUsageGuide } from '@/components/radar/RadarUsageGuide';
import { RadarFilterBar } from '@/components/radar/RadarFilterBar';
import { WhyRadar } from '@/components/radar/WhyRadar';
import { WalletScan } from '@/components/radar/WalletScan';
import { AlertsPanel } from '@/components/signals/AlertsPanel';
import { AlertToast } from '@/components/signals/AlertToast';
import { useSignalAlerts, triggerTestAlert } from '@/hooks/useSignalAlerts';
import { resetRadarIntro } from '@/utils/onboarding';
import { fetchSignalsWithHistory, type SignalDebugData, type SignalHistoryCapture } from '@/services/signalsHealth';

interface RadarPanelProps {
  onSignalClick: (signal: RadarSignal) => void;
}

export function RadarPanel({ onSignalClick }: RadarPanelProps) {
  const { signals, markAsRead, markAllAsRead, removeSignal, getUnreadCount } = useRadarStore();
  const { trackEvent } = useUsageStore();
  const debugEnabled = useDebugMode();
  const toggleDebug = useDebugStore((s) => s.toggle);
  const addHistoryEntry = useSignalHistoryStore((s) => s.addEntry);
  const historyEntries = useSignalHistoryStore((s) => s.entries);
  const signalFilters = useSignalFilterStore();
  const viewScope = signalFilters.viewScope;
  const monitoringEnabled = useMonitoringStore((s) => s.enabled);

  const [showTimeline, setShowTimeline] = useState(false);

  // Hook signal alerts system
  useSignalAlerts();

  // Debug state
  const [debugData, setDebugData] = useState<SignalDebugData | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  const unreadCount = getUnreadCount();

  // Capture signal to history
  const captureToHistory = useCallback((entry: SignalHistoryCapture) => {
    addHistoryEntry({
      ...entry,
      timestamp: Date.now(),
    });
  }, [addHistoryEntry]);

  // Fetch debug data when debug mode is enabled
  useEffect(() => {
    if (!debugEnabled) {
      setDebugData(null);
      return;
    }

    const fetchDebugData = async () => {
      setDebugLoading(true);
      setDebugError(null);
      try {
        const response = await fetchSignalsWithHistory(
          1,
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          'USDC',
          captureToHistory
        );
        if (response?.debug) {
          setDebugData(response.debug);
        } else {
          setDebugError('No debug data returned');
        }
      } catch (err) {
        setDebugError('Failed to fetch debug data');
      } finally {
        setDebugLoading(false);
      }
    };

    fetchDebugData();
  }, [debugEnabled, captureToHistory]);

  // Live signals (from radarStore) — apply chain + search filters
  const filteredLiveSignals = useMemo(() => {
    return signals.filter((s) => {
      // Chain filter
      if (signalFilters.chainFilter !== 0 && s.chainId !== signalFilters.chainFilter) return false;
      // Search filter
      if (signalFilters.searchQuery) {
        const q = signalFilters.searchQuery.toLowerCase();
        if (!s.tokenSymbol.toLowerCase().includes(q) && !s.tokenAddress.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [signals, signalFilters.chainFilter, signalFilters.searchQuery]);

  // Group live signals by time
  const groupedLiveSignals = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

    const today: RadarSignal[] = [];
    const yesterday: RadarSignal[] = [];
    const older: RadarSignal[] = [];

    filteredLiveSignals.forEach((signal) => {
      if (signal.timestamp >= todayStart) today.push(signal);
      else if (signal.timestamp >= yesterdayStart) yesterday.push(signal);
      else older.push(signal);
    });

    return { today, yesterday, older };
  }, [filteredLiveSignals]);

  // Filtered history count
  const filteredHistoryCount = useMemo(() => {
    return historyEntries.filter((entry) => shouldShowHistoryEntry(entry, signalFilters)).length;
  }, [historyEntries, signalFilters]);

  const handleSignalClick = (signal: RadarSignal) => {
    markAsRead(signal.id);
    onSignalClick(signal);
    trackEvent('signal_viewed');
  };

  // Determine what to show based on viewScope
  const showLiveSection = viewScope === 'live' || viewScope === 'both';
  const showTimelineSection = viewScope === 'timeline' || viewScope === 'both';

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Radar</h2>
          <span
            className="text-dark-500 hover:text-dark-300 cursor-help transition-colors"
            title="Radar monitors token safety. It alerts you to risk and liquidity issues — not price movements."
          >
            i
          </span>
          <TierBadge tier="early-access" />
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-primary-600 text-white text-sm font-medium rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* First-Visit Intro Card */}
      <RadarIntroCard className="mb-4" />

      {/* Why Radar Section */}
      <WhyRadar className="mb-4" />

      {/* Usage Guide */}
      <RadarUsageGuide className="mb-4" />

      {/* Token Intelligence */}
      <TokenCheckInput className="mb-4" />

      {/* Unified Filter Bar (monitoring status + view scope + filters) */}
      <RadarFilterBar className="mb-4" />

      {/* Signals Offline Warning */}
      <SignalsStatusBadge className="mb-4" />

      {/* ─── Live Alerts Section ─── */}
      {showLiveSection && (
        <div className="mb-6">
          {filteredLiveSignals.length === 0 ? (
            <LiveEmptyState
              monitoringEnabled={monitoringEnabled}
              hasHistory={historyEntries.length > 0}
              onShowTimeline={() => {
                signalFilters.setViewScope('timeline');
                setShowTimeline(true);
              }}
            />
          ) : (
            <div className="space-y-6">
              <SignalGroup label="Today" signals={groupedLiveSignals.today} onClick={handleSignalClick} onDismiss={removeSignal} />
              <SignalGroup label="Yesterday" signals={groupedLiveSignals.yesterday} onClick={handleSignalClick} onDismiss={removeSignal} />
              <SignalGroup label="Older" signals={groupedLiveSignals.older} onClick={handleSignalClick} onDismiss={removeSignal} />
            </div>
          )}
        </div>
      )}

      {/* ─── Activity Timeline Section ─── */}
      {showTimelineSection && (
        <div className="mb-6">
          {viewScope === 'both' ? (
            /* In "both" mode, timeline is collapsible */
            <>
              <button
                onClick={() => setShowTimeline(!showTimeline)}
                className="w-full flex items-center justify-between px-4 py-3 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors mb-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-dark-300">Activity Timeline</span>
                  {historyEntries.length > 0 && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-dark-600 text-dark-300">
                      {filteredHistoryCount !== historyEntries.length
                        ? `${filteredHistoryCount} of ${historyEntries.length}`
                        : historyEntries.length}
                    </span>
                  )}
                </div>
                <span className="text-dark-500 text-xs">
                  {showTimeline ? '▼' : '▶'}
                </span>
              </button>
              {showTimeline && <ActivityTimeline maxGroups={20} />}
            </>
          ) : (
            /* In "timeline" mode, show inline (always expanded) */
            <ActivityTimeline maxGroups={30} />
          )}
        </div>
      )}

      {/* Watchlist Section */}
      <WatchlistPanel className="mt-6" />

      {/* Wallet Scan Section */}
      <WalletScan className="mt-6" />

      {/* Alerts Section */}
      <AlertsPanel
        className="mt-6"
        onAlertClick={() => {
          setShowTimeline(true);
        }}
      />

      {/* Debug Panel */}
      {debugEnabled && (
        <SignalDebugPanel
          debug={debugData}
          loading={debugLoading}
          error={debugError}
        />
      )}

      {/* Info Footer */}
      <div className="mt-8 p-4 bg-dark-800 rounded-xl text-center">
        <p className="text-xs text-dark-400">
          Radar monitors tokens you interact with and alerts you to significant changes.
          <br />
          Signals are stored locally and cleared after 24 hours.
        </p>
        <p className="text-[10px] text-dark-500 mt-2">
          Radar is informational only, not financial advice. Always DYOR.
        </p>

        {/* Debug Toggle */}
        <button
          onClick={toggleDebug}
          className={`mt-3 text-[10px] font-mono transition-colors ${
            debugEnabled
              ? 'text-yellow-500'
              : 'text-dark-500 hover:text-dark-300'
          }`}
        >
          {debugEnabled ? '[ DEBUG MODE ON ]' : '[ debug ]'}
        </button>

        {debugEnabled && (
          <button
            onClick={() => {
              resetRadarIntro();
              window.location.reload();
            }}
            className="ml-3 text-[10px] font-mono text-dark-500 hover:text-dark-300 transition-colors"
          >
            [ reset onboarding ]
          </button>
        )}

        {debugEnabled && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="text-[10px] font-mono text-dark-600">Test alerts:</span>
            <button
              onClick={() => triggerTestAlert('risk', 'high')}
              className="text-[10px] font-mono text-red-500 hover:text-red-400 transition-colors"
            >
              [ High Risk ]
            </button>
            <button
              onClick={() => triggerTestAlert('liquidity', 'medium')}
              className="text-[10px] font-mono text-orange-500 hover:text-orange-400 transition-colors"
            >
              [ Med Liquidity ]
            </button>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <AlertToast />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function SignalGroup({
  label,
  signals,
  onClick,
  onDismiss,
}: {
  label: string;
  signals: RadarSignal[];
  onClick: (signal: RadarSignal) => void;
  onDismiss: (signalId: string) => void;
}) {
  if (signals.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-dark-400 mb-3 uppercase tracking-wide">
        {label}
      </h3>
      <div className="space-y-3">
        {signals.map((signal) => (
          <RadarItem
            key={signal.id}
            signal={signal}
            onClick={onClick}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

function LiveEmptyState({
  monitoringEnabled,
  hasHistory,
  onShowTimeline,
}: {
  monitoringEnabled: boolean;
  hasHistory: boolean;
  onShowTimeline: () => void;
}) {
  if (!monitoringEnabled) {
    return (
      <div className="text-center py-8">
        <div className="text-3xl mb-3">&#x23F8;</div>
        <h3 className="text-lg font-semibold mb-2 text-dark-300">
          Live monitoring is OFF
        </h3>
        <p className="text-dark-500 text-sm max-w-sm mx-auto">
          Enable monitoring in the status bar above to receive real-time alerts for your watchlist tokens.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <div className="text-3xl mb-3">&#x2705;</div>
      <h3 className="text-lg font-semibold mb-2 text-dark-300">
        No new alerts
      </h3>
      <p className="text-dark-500 text-sm max-w-sm mx-auto">
        Your monitored tokens are stable.
        {hasHistory && (
          <>
            {' '}Check{' '}
            <button onClick={onShowTimeline} className="text-primary-400 hover:underline">
              Activity Timeline
            </button>{' '}
            for past signals.
          </>
        )}
      </p>
    </div>
  );
}

export default RadarPanel;
