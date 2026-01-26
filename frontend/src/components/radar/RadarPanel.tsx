/**
 * Radar Panel Component
 *
 * Main panel showing all radar signals.
 * Includes filtering, mark all as read, and empty state.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRadarStore, type RadarSignal } from '@/stores/radarStore';
import { useUsageStore } from '@/stores/usageStore';
import { useDebugStore, useDebugMode } from '@/stores/debugStore';
import { useSignalHistoryStore } from '@/stores/signalHistoryStore';
import { useSignalFilterStore, shouldShowSignal } from '@/stores/signalFilterStore';
import { RadarItem } from './RadarItem';
import { TierBadge } from '@/components/common/TierBadge';
import { SignalsStatusBadge } from '@/components/signals/SignalsStatusBadge';
import { SignalDebugPanel } from '@/components/signals/SignalDebugPanel';
import { SignalHistoryPanel } from '@/components/signals/SignalHistoryPanel';
import { SignalFilters } from '@/components/signals/SignalFilters';
import { TokenCheckInput } from '@/components/signals/TokenCheckInput';
import { WatchlistPanel } from '@/components/signals/WatchlistPanel';
import { RadarIntroCard } from '@/components/radar/RadarIntroCard';
import { RadarUsageGuide } from '@/components/radar/RadarUsageGuide';
import { WhyRadar } from '@/components/radar/WhyRadar';
import { HowRadarWorks } from '@/components/radar/HowRadarWorks';
import { WalletScan } from '@/components/radar/WalletScan';
import { MonitoringStatus } from '@/components/radar/MonitoringStatus';
import { RadarStatusSummary } from '@/components/radar/RadarStatusSummary';
import { AlertsPanel } from '@/components/signals/AlertsPanel';
import { AlertToast } from '@/components/signals/AlertToast';
import { SmartFilterEmptyState } from '@/components/signals/SmartFilterEmptyState';
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
  const [showHistory, setShowHistory] = useState(false);

  // Calculate filtered history count for header display
  const filteredHistoryCount = useMemo(() => {
    return historyEntries.filter((entry) =>
      shouldShowSignal(
        {
          type: entry.type,
          confidence: entry.confidence,
          impact: entry.impact,
        },
        signalFilters
      )
    ).length;
  }, [historyEntries, signalFilters]);

  const hiddenByFilters = historyEntries.length - filteredHistoryCount;

  // Hook signal alerts system (fires alerts on new history entries)
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

    // Use a test token to fetch debug data
    const fetchDebugData = async () => {
      setDebugLoading(true);
      setDebugError(null);
      try {
        // Use USDC on Ethereum as a test token - also captures to history
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

  // Group signals by time (Today, Yesterday, Older)
  // Note: radarStore.signals is legacy and typically empty - real signals go through signalHistoryStore
  const groupedSignals = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

    const today: RadarSignal[] = [];
    const yesterday: RadarSignal[] = [];
    const older: RadarSignal[] = [];

    signals.forEach((signal) => {
      if (signal.timestamp >= todayStart) {
        today.push(signal);
      } else if (signal.timestamp >= yesterdayStart) {
        yesterday.push(signal);
      } else {
        older.push(signal);
      }
    });

    return { today, yesterday, older };
  }, [signals]);

  const handleSignalClick = (signal: RadarSignal) => {
    markAsRead(signal.id);
    onSignalClick(signal);
    trackEvent('signal_viewed');
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Radar</h2>
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

      {/* Explanation Banner - Clear statement about what Radar does */}
      <div className="mb-4 px-3 py-2 bg-dark-800/60 border border-dark-700/50 rounded-lg">
        <p className="text-sm text-dark-300">
          <span className="font-medium text-dark-200">Radar monitors token safety</span>
          {' '}— risk signals and liquidity warnings, not price predictions.
          <span className="text-dark-500 ml-1">No alert = no high-impact signals detected yet.</span>
        </p>
      </div>

      {/* Status Summary - "Am I safe right now?" */}
      <RadarStatusSummary className="mb-4" />

      {/* First-Visit Intro Card */}
      <RadarIntroCard className="mb-4" />

      {/* Why Radar Section (Step 4) */}
      <WhyRadar className="mb-4" />

      {/* Usage Guide (always visible) */}
      <RadarUsageGuide className="mb-4" />

      {/* How Radar Works (collapsible) */}
      <HowRadarWorks className="mb-4" />

      {/* Token Check Input */}
      <TokenCheckInput className="mb-4" />

      {/* Signal Filters */}
      <SignalFilters className="mb-4" />

      {/* Signals Offline Warning */}
      <SignalsStatusBadge className="mb-4" />

      {/* Empty State - Context-aware messaging */}
      {signals.length === 0 && (
        <>
          {/* If filters are hiding history signals, show SmartFilterEmptyState */}
          {hiddenByFilters > 0 ? (
            <SmartFilterEmptyState
              allEntries={historyEntries}
              isMainPanel={true}
            />
          ) : historyEntries.length > 0 ? (
            /* History has signals but no live alerts - simple message */
            <div className="text-center py-8">
              <div className="text-3xl mb-3">✅</div>
              <h3 className="text-lg font-semibold mb-2 text-dark-300">
                No new alerts right now
              </h3>
              <p className="text-dark-500 text-sm max-w-sm mx-auto">
                Your monitored tokens are stable. Check{' '}
                <button
                  onClick={() => setShowHistory(true)}
                  className="text-primary-400 hover:underline"
                >
                  Signal History
                </button>{' '}
                for past signals.
              </p>
            </div>
          ) : (
            /* No signals at all - onboarding message */
            <SmartFilterEmptyState
              allEntries={historyEntries}
              isMainPanel={true}
            />
          )}
        </>
      )}

      {/* Signal Groups */}
      {signals.length > 0 && (
        <div className="space-y-6">
          {/* Today */}
          {groupedSignals.today.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-dark-400 mb-3 uppercase tracking-wide">
                Today
              </h3>
              <div className="space-y-3">
                {groupedSignals.today.map((signal) => (
                  <RadarItem
                    key={signal.id}
                    signal={signal}
                    onClick={handleSignalClick}
                    onDismiss={removeSignal}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Yesterday */}
          {groupedSignals.yesterday.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-dark-400 mb-3 uppercase tracking-wide">
                Yesterday
              </h3>
              <div className="space-y-3">
                {groupedSignals.yesterday.map((signal) => (
                  <RadarItem
                    key={signal.id}
                    signal={signal}
                    onClick={handleSignalClick}
                    onDismiss={removeSignal}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Older */}
          {groupedSignals.older.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-dark-400 mb-3 uppercase tracking-wide">
                Older
              </h3>
              <div className="space-y-3">
                {groupedSignals.older.map((signal) => (
                  <RadarItem
                    key={signal.id}
                    signal={signal}
                    onClick={handleSignalClick}
                    onDismiss={removeSignal}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Watchlist Section (Priority 11.1) */}
      <WatchlistPanel className="mt-6" />

      {/* Wallet Scan Section (Step 5) */}
      <WalletScan className="mt-6" />

      {/* Alerts Section (Priority 12.1-12.2) */}
      <AlertsPanel
        className="mt-6"
        onAlertClick={() => {
          // Open history when clicking alert
          setShowHistory(true);
        }}
      />

      {/* Signal History Section */}
      <div className="mt-6">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between px-4 py-3 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors mb-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-dark-300">Signal History</span>
            <span className="px-1.5 py-0.5 bg-dark-700 text-dark-400 text-xs rounded font-mono">
              Last 24h
            </span>
            {historyEntries.length > 0 && (
              <span className={`px-1.5 py-0.5 text-xs rounded ${
                hiddenByFilters > 0
                  ? 'bg-yellow-600/20 text-yellow-400'
                  : 'bg-dark-600 text-dark-300'
              }`}>
                {hiddenByFilters > 0
                  ? `${filteredHistoryCount} of ${historyEntries.length}`
                  : historyEntries.length}
              </span>
            )}
            {hiddenByFilters > 0 && (
              <span className="text-[10px] text-dark-500 font-mono">
                (filtered)
              </span>
            )}
          </div>
          <span className="text-dark-500 text-xs">
            {showHistory ? '▼' : '▶'}
          </span>
        </button>

        {showHistory && (
          <SignalHistoryPanel maxEntries={10} />
        )}
      </div>

      {/* Debug Panel (only visible in debug mode) */}
      {debugEnabled && (
        <SignalDebugPanel
          debug={debugData}
          loading={debugLoading}
          error={debugError}
        />
      )}

      {/* Info Footer */}
      <div className="mt-8 p-4 bg-dark-800 rounded-xl text-center">
        {/* Monitoring Status */}
        <MonitoringStatus className="mb-3" />

        <p className="text-xs text-dark-400">
          Radar monitors tokens you interact with and alerts you to significant changes.
          <br />
          Signals are stored locally and cleared after 24 hours.
        </p>
        <p className="text-[10px] text-dark-500 mt-2">
          Radar is informational only, not financial advice. Always DYOR.
        </p>

        {/* Debug Toggle - only visible when already in debug mode */}
        {debugEnabled && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <span className="text-[10px] font-mono text-yellow-500">
              [ DEBUG MODE ON ]
            </span>
            <button
              onClick={() => {
                toggleDebug();
                window.location.reload();
              }}
              className="text-[10px] font-mono text-dark-500 hover:text-red-400 transition-colors"
              title="Exit debug mode and reload"
            >
              [ exit debug ]
            </button>
          </div>
        )}

        {/* Reset Onboarding (only visible in debug mode) */}
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

        {/* Debug Test Alerts (only visible in debug mode) */}
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

export default RadarPanel;
