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
import { useSignalFilterStore } from '@/stores/signalFilterStore';
import { useMonitoringStore } from '@/stores/monitoringStore';
import { RadarItem } from './RadarItem';
import { TierBadge } from '@/components/common/TierBadge';
import { SignalsStatusBadge } from '@/components/signals/SignalsStatusBadge';
import { SignalDebugPanel } from '@/components/signals/SignalDebugPanel';
import { ActivityTimeline } from '@/components/signals/ActivityTimeline';
import { TokenCheckInput } from '@/components/signals/TokenCheckInput';
import { WatchlistPanel } from '@/components/signals/WatchlistPanel';
import { RadarFilterBar } from '@/components/radar/RadarFilterBar';
import { WalletScan } from '@/components/radar/WalletScan';
import { AlertsPanel } from '@/components/signals/AlertsPanel';
import { AlertToast } from '@/components/signals/AlertToast';
import { useSignalAlerts } from '@/hooks/useSignalAlerts';
import { fetchSignalsWithHistory, type SignalDebugData, type SignalHistoryCapture } from '@/services/signalsHealth';
import { isMonitorRunning, startWatchlistMonitor } from '@/services/watchlistMonitor';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { ShellPanel } from '@/components/ui/ShellPrimitives';

interface RadarPanelProps {
  onSignalClick: (signal: RadarSignal) => void;
}

type RadarTab = 'overview' | 'watchlist' | 'scanner' | 'alerts';

const RADAR_TABS: { id: RadarTab; label: string }[] = [
  { id: 'overview', label: 'Security Overview' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'scanner', label: 'Threat Feed' },
  { id: 'alerts', label: 'Alerts' },
];

export function RadarPanel({ onSignalClick }: RadarPanelProps) {
  const { signals, markAsRead, markAllAsRead, removeSignal, getUnreadCount } = useRadarStore();
  const { trackEvent } = useUsageStore();
  const debugEnabled = useDebugMode();
  const toggleDebug = useDebugStore((s) => s.toggle);
  const watchlistCount = useWatchlistStore((s) => s.tokens.length);
  const addHistoryEntry = useSignalHistoryStore((s) => s.addEntry);
  const historyEntries = useSignalHistoryStore((s) => s.entries);
  const signalFilters = useSignalFilterStore();
  const viewScope = signalFilters.viewScope;
  const monitoringEnabled = useMonitoringStore((s) => s.enabled);
  const syncMonitoringFromService = useMonitoringStore((s) => s.syncFromService);

  const [showTimeline, setShowTimeline] = useState(false);
  const [activeTab, setActiveTab] = useState<RadarTab>('overview');

  // P5-C.1 — defer watchlist monitor until first Radar visit (singleton; no stop on unmount)
  useEffect(() => {
    if (!monitoringEnabled || isMonitorRunning()) return;
    startWatchlistMonitor();
    syncMonitoringFromService();
  }, [monitoringEnabled, syncMonitoringFromService]);

  useEffect(() => {
    const onSection = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: string; section?: string }>).detail;
      if (detail?.page !== 'radar' || !detail.section) return;
      const tabMap: Record<string, RadarTab> = {
        watchlist: 'watchlist',
        scanner: 'scanner',
        alerts: 'alerts',
      };
      const tab = tabMap[detail.section];
      if (tab) setActiveTab(tab);
    };
    window.addEventListener('swaperex:section', onSection as EventListener);
    return () => window.removeEventListener('swaperex:section', onSection as EventListener);
  }, []);

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

  const handleSignalClick = (signal: RadarSignal) => {
    markAsRead(signal.id);
    onSignalClick(signal);
    trackEvent('signal_viewed');
  };

  // Determine what to show based on viewScope
  const showLiveSection = viewScope === 'live' || viewScope === 'both';
  const showTimelineSection = viewScope === 'timeline' || viewScope === 'both';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <ShellPanel className="p-4 sm:p-5 mb-4 bg-gradient-to-br from-electro-panel/90 to-black/30">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-dark-500 mb-1">Security</p>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Security Command Center
              </h2>
              <TierBadge tier="early-access" />
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs font-semibold rounded-full border border-accent/30">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-xs text-dark-500 mt-1">
              Watchlist monitoring · token checks · local alert history
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-accent hover:brightness-110 transition-colors shrink-0 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-black/20"
            >
              Mark all read
            </button>
          )}
        </div>
      </ShellPanel>

      {/* Tab navigation */}
      <div className="shell-tab-track mb-4" role="tablist" aria-label="Security sections">
        {RADAR_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={`shell-tab flex-1 text-center ${activeTab === id ? 'shell-tab-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <RadarFilterBar className="mb-3" />
          <SignalsStatusBadge className="mb-3" />

          {showLiveSection && (
            <ShellPanel className="p-3 sm:p-4 mb-4">
              <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-3">Live Threat Feed</p>
              {filteredLiveSignals.length === 0 ? (
                <LiveEmptyState
                  monitoringEnabled={monitoringEnabled}
                  watchlistCount={watchlistCount}
                  hasHistory={historyEntries.length > 0}
                  onShowTimeline={() => {
                    signalFilters.setViewScope('timeline');
                    setActiveTab('alerts');
                    setShowTimeline(true);
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <SignalGroup label="Today" signals={groupedLiveSignals.today} onClick={handleSignalClick} onDismiss={removeSignal} />
                  <SignalGroup label="Yesterday" signals={groupedLiveSignals.yesterday} onClick={handleSignalClick} onDismiss={removeSignal} />
                  <SignalGroup label="Older" signals={groupedLiveSignals.older} onClick={handleSignalClick} onDismiss={removeSignal} />
                </div>
              )}
            </ShellPanel>
          )}

          {showTimelineSection && viewScope !== 'both' && (
            <div className="mb-4">
              <ActivityTimeline maxGroups={20} />
            </div>
          )}
        </>
      )}

      {activeTab === 'watchlist' && (
        <ShellPanel className="p-3 sm:p-4">
          <WatchlistPanel />
        </ShellPanel>
      )}

      {activeTab === 'scanner' && (
        <>
          <ShellPanel className="p-3 sm:p-4 mb-3">
            <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Token Scanner</p>
            <TokenCheckInput className="!mb-0" />
          </ShellPanel>
          <WalletScan />
        </>
      )}

      {activeTab === 'alerts' && (
        <>
          <AlertsPanel
            onAlertClick={() => {
              setShowTimeline(true);
            }}
          />
          <ShellPanel className="p-3 sm:p-4 mt-4">
            <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Activity Timeline</p>
            {viewScope === 'both' ? (
              <>
                <button
                  onClick={() => setShowTimeline(!showTimeline)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.06] bg-black/20 hover:bg-black/30 transition-colors mb-2 text-sm text-dark-300"
                >
                  <span>Show timeline</span>
                  <span className="text-dark-500 text-xs">{showTimeline ? '▼' : '▶'}</span>
                </button>
                {showTimeline && <ActivityTimeline maxGroups={20} />}
              </>
            ) : (
              <ActivityTimeline maxGroups={30} />
            )}
          </ShellPanel>
        </>
      )}

      {debugEnabled && (
        <SignalDebugPanel
          debug={debugData}
          loading={debugLoading}
          error={debugError}
        />
      )}

      <p className="mt-6 text-center text-[10px] text-dark-600 leading-relaxed">
        Informational only · signals stored locally (~24h)
        {debugEnabled && (
          <>
            {' '}
            <button onClick={toggleDebug} className="text-yellow-500 font-mono">[ debug ]</button>
          </>
        )}
      </p>

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
  watchlistCount,
  hasHistory,
  onShowTimeline,
}: {
  monitoringEnabled: boolean;
  watchlistCount: number;
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

  if (watchlistCount === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold mb-2 text-dark-300">No tokens monitored</h3>
        <p className="text-dark-500 text-sm max-w-sm mx-auto">
          Add tokens to your watchlist to begin local monitoring.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <h3 className="text-lg font-semibold mb-2 text-dark-300">
        No new alerts
      </h3>
      <p className="text-dark-500 text-sm max-w-sm mx-auto">
        No alerts detected for your watchlist since the last scan.
        {hasHistory && (
          <>
            {' '}Check{' '}
            <button type="button" onClick={onShowTimeline} className="text-primary-400 hover:underline">
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
