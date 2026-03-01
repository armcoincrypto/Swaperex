/**
 * Radar Filter Bar
 *
 * Professional unified filter bar for the Radar panel.
 * Combines:
 *  - Monitoring status row (watchlist count, chains, interval, backend, last check)
 *  - View scope toggle (Live / Timeline / Both)
 *  - Filter controls (severity, confidence, type, chain, search, recurrence)
 *
 * Replaces the old SignalFilters + filter pills.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  useSignalFilterStore,
  type ViewScope,
  type SeverityFilter,
  type RecurrenceFilter,
} from '@/stores/signalFilterStore';
import {
  useMonitoringStore,
  getChainLabel,
  SUPPORTED_CHAINS,
} from '@/stores/monitoringStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { useSystemStatusStore, type SystemStatus } from '@/stores/systemStatusStore';
import { getLastPollTime, isMonitorRunning } from '@/services/watchlistMonitor';

interface RadarFilterBarProps {
  className?: string;
}

// ─── Monitoring Status Row ─────────────────────────────────────────

function MonitoringStatusRow() {
  const tokens = useWatchlistStore((s) => s.tokens);
  const systemStatus = useSystemStatusStore((s) => s.status);
  const services = useSystemStatusStore((s) => s.services);
  const monitoring = useMonitoringStore();
  const [, tick] = useState(0);

  // Sync monitoring state from service every 10s
  useEffect(() => {
    monitoring.syncFromService();
    const chains = [...new Set(tokens.map((t) => t.chainId))].sort();
    monitoring.updateWatchInfo(tokens.length, chains);

    const interval = setInterval(() => {
      monitoring.syncFromService();
      tick((n) => n + 1);
    }, 10_000);
    return () => clearInterval(interval);
  }, [tokens]);

  const lastPoll = getLastPollTime();
  const running = isMonitorRunning() && monitoring.enabled;

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {/* Watchlist count */}
      <StatusPill
        label={`Watchlist ${tokens.length}/20`}
        variant={tokens.length > 0 ? 'ok' : 'muted'}
      />

      {/* Active chains */}
      {monitoring.activeChains.length > 0 && (
        <StatusPill
          label={monitoring.activeChains.map(getChainLabel).join('/')}
          variant="ok"
        />
      )}

      {/* Refresh interval */}
      <StatusPill
        label={running ? `Every ${monitoring.intervalSeconds}s` : 'Paused'}
        variant={running ? 'ok' : 'warn'}
      />

      {/* Last check */}
      <StatusPill
        label={lastPoll ? `Last: ${formatTimeAgo(lastPoll)}` : 'No scans yet'}
        variant={lastPoll ? 'muted' : 'warn'}
      />

      {/* Backend status */}
      <BackendStatusPill status={systemStatus} services={services} />

      {/* Monitor toggle */}
      <button
        onClick={() => monitoring.setEnabled(!monitoring.enabled)}
        className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
          monitoring.enabled
            ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
            : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
        }`}
        title={monitoring.enabled ? 'Stop live monitoring' : 'Start live monitoring'}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${monitoring.enabled ? 'bg-green-400' : 'bg-dark-500'}`} />
        {monitoring.enabled ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

function StatusPill({ label, variant }: { label: string; variant: 'ok' | 'warn' | 'muted' }) {
  const colors = {
    ok: 'bg-dark-700/60 text-dark-300',
    warn: 'bg-yellow-900/20 text-yellow-400',
    muted: 'bg-dark-800 text-dark-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded ${colors[variant]}`}>
      {label}
    </span>
  );
}

function BackendStatusPill({
  status,
  services,
}: {
  status: SystemStatus;
  services: { dexscreener: 'up' | 'down'; goplus: 'up' | 'down' } | null;
}) {
  const config: Record<SystemStatus, { label: string; dot: string; bg: string; text: string }> = {
    stable: { label: 'Online', dot: 'bg-green-400', bg: 'bg-green-900/20', text: 'text-green-400' },
    degraded: { label: 'Degraded', dot: 'bg-yellow-400', bg: 'bg-yellow-900/20', text: 'text-yellow-400' },
    unavailable: { label: 'Offline', dot: 'bg-red-400', bg: 'bg-red-900/20', text: 'text-red-400' },
  };
  const c = config[status];

  const title = services
    ? `DexScreener: ${services.dexscreener} | GoPlus: ${services.goplus}`
    : 'Backend status';

  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded ${c.bg} ${c.text}`} title={title}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── View Scope Toggle ─────────────────────────────────────────────

function ViewScopeToggle() {
  const viewScope = useSignalFilterStore((s) => s.viewScope);
  const setViewScope = useSignalFilterStore((s) => s.setViewScope);
  const monitoring = useMonitoringStore();

  const scopes: Array<{ value: ViewScope; label: string; desc: string }> = [
    { value: 'live', label: 'Live', desc: 'Real-time alerts from monitoring' },
    { value: 'timeline', label: 'Timeline', desc: 'Signal history (last 24h)' },
    { value: 'both', label: 'Both', desc: 'Live alerts + timeline combined' },
  ];

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-dark-500 uppercase tracking-wider mr-1">View</span>
      {scopes.map((scope) => (
        <button
          key={scope.value}
          onClick={() => setViewScope(scope.value)}
          title={scope.desc}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            viewScope === scope.value
              ? 'bg-primary-600 text-white'
              : 'bg-dark-800 text-dark-400 hover:bg-dark-700 hover:text-dark-200'
          }`}
        >
          {scope.label}
          {scope.value === 'live' && !monitoring.enabled && (
            <span className="ml-1 text-[9px] text-dark-500">OFF</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Filter Controls ───────────────────────────────────────────────

function FilterControls({ isOpen }: { isOpen: boolean }) {
  const filters = useSignalFilterStore();
  const watchlistTokens = useWatchlistStore((s) => s.tokens);

  // Get chains that appear in watchlist for the chain dropdown
  const watchlistChains = useMemo(() => {
    const chainIds = [...new Set(watchlistTokens.map((t) => t.chainId))];
    return SUPPORTED_CHAINS.filter((c) => chainIds.includes(c.id));
  }, [watchlistTokens]);

  if (!isOpen) return null;

  return (
    <div className="mt-3 space-y-3">
      {/* Row 1: Severity + Confidence */}
      <div className="flex flex-wrap gap-3">
        {/* Severity */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-1.5">
            Severity
          </label>
          <div className="flex gap-1">
            {(['all', 'warning', 'danger', 'critical'] as SeverityFilter[]).map((sev) => (
              <button
                key={sev}
                onClick={() => filters.setSeverityFilter(sev)}
                className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  filters.severityFilter === sev
                    ? getSeverityActiveStyle(sev)
                    : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                {getSeverityLabel(sev)}
              </button>
            ))}
          </div>
        </div>

        {/* Confidence */}
        <div className="min-w-[120px]">
          <label className="block text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-1.5">
            Min Confidence
          </label>
          <div className="flex items-center gap-2">
            <input
              id="radar-confidence"
              name="radar-confidence"
              type="range"
              min={40}
              max={90}
              step={10}
              value={filters.minConfidence}
              onChange={(e) => filters.setMinConfidence(Number(e.target.value))}
              className="flex-1 h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
            <span className="text-xs font-mono text-dark-300 w-10 text-right">
              {filters.minConfidence}%
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Type + Chain + Search */}
      <div className="flex flex-wrap gap-3">
        {/* Type */}
        <div>
          <label className="block text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-1.5">
            Type
          </label>
          <div className="flex gap-1">
            <TypePill
              label="Liquidity Drops"
              active={filters.showLiquidity}
              onClick={() => filters.setShowLiquidity(!filters.showLiquidity)}
              color="blue"
            />
            <TypePill
              label="Scam/Honeypot"
              active={filters.showRisk}
              onClick={() => filters.setShowRisk(!filters.showRisk)}
              color="orange"
            />
          </div>
        </div>

        {/* Chain */}
        <div className="min-w-[100px]">
          <label className="block text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-1.5">
            Chain
          </label>
          <select
            id="radar-chain"
            name="radar-chain"
            value={filters.chainFilter}
            onChange={(e) => filters.setChainFilter(Number(e.target.value))}
            className="w-full px-2 py-1.5 bg-dark-800 border border-dark-700 rounded text-xs text-dark-200 focus:outline-none focus:border-primary-500"
          >
            <option value={0}>All Chains</option>
            {watchlistChains.length > 0
              ? watchlistChains.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))
              : SUPPORTED_CHAINS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))
            }
          </select>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-1.5">
            Search
          </label>
          <input
            id="radar-search"
            name="radar-search"
            type="text"
            value={filters.searchQuery}
            onChange={(e) => filters.setSearchQuery(e.target.value)}
            placeholder="Symbol or address..."
            className="w-full px-2 py-1.5 bg-dark-800 border border-dark-700 rounded text-xs text-dark-200 placeholder-dark-500 focus:outline-none focus:border-primary-500"
          />
        </div>
      </div>

      {/* Row 3: Recurrence + Impact + Reset */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Recurrence */}
        <div>
          <label className="block text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-1.5">
            Recurrence
          </label>
          <div className="flex gap-1">
            {(['all', 'repeated', 'new'] as RecurrenceFilter[]).map((rec) => (
              <button
                key={rec}
                onClick={() => filters.setRecurrenceFilter(rec)}
                className={`px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  filters.recurrenceFilter === rec
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                {getRecurrenceLabel(rec)}
              </button>
            ))}
          </div>
        </div>

        {/* Group repeats toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer py-1.5">
          <div
            onClick={() => filters.setGroupRepeats(!filters.groupRepeats)}
            className={`w-7 h-4 rounded-full flex items-center transition-colors cursor-pointer ${
              filters.groupRepeats ? 'bg-primary-600' : 'bg-dark-700'
            }`}
          >
            <div
              className={`w-3 h-3 bg-white rounded-full transition-transform mx-0.5 ${
                filters.groupRepeats ? 'translate-x-3' : ''
              }`}
            />
          </div>
          <span className="text-[11px] text-dark-400">Group repeats</span>
        </label>

        {/* Impact */}
        <div>
          <label className="block text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-1.5">
            Impact
          </label>
          <div className="flex gap-1">
            {(['all', 'high+medium', 'high'] as const).map((imp) => (
              <button
                key={imp}
                onClick={() => filters.setImpactFilter(imp)}
                className={`px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  filters.impactFilter === imp
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                {imp === 'all' ? 'All' : imp === 'high+medium' ? 'Med+' : 'High'}
              </button>
            ))}
          </div>
        </div>

        {/* Reset */}
        {!filters.isDefaultFilters() && (
          <button
            onClick={filters.resetFilters}
            className="px-2.5 py-1.5 text-[11px] text-dark-400 hover:text-white hover:bg-dark-700 rounded transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function TypePill({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: 'blue' | 'orange';
}) {
  const styles = {
    blue: active
      ? 'bg-blue-900/30 text-blue-400 border-blue-700/50'
      : 'bg-dark-800 text-dark-400 border-dark-700',
    orange: active
      ? 'bg-orange-900/30 text-orange-400 border-orange-700/50'
      : 'bg-dark-800 text-dark-400 border-dark-700',
  };

  return (
    <button
      onClick={onClick}
      className={`px-2 py-1.5 rounded border text-[11px] font-medium transition-colors ${styles[color]}`}
    >
      {label}
    </button>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function getSeverityLabel(sev: SeverityFilter): string {
  switch (sev) {
    case 'all': return 'All';
    case 'warning': return 'Low';
    case 'danger': return 'Medium';
    case 'critical': return 'High';
  }
}

function getSeverityActiveStyle(sev: SeverityFilter): string {
  switch (sev) {
    case 'all': return 'bg-primary-600 text-white';
    case 'warning': return 'bg-yellow-900/40 text-yellow-300';
    case 'danger': return 'bg-orange-900/40 text-orange-300';
    case 'critical': return 'bg-red-900/40 text-red-300';
  }
}

function getRecurrenceLabel(rec: RecurrenceFilter): string {
  switch (rec) {
    case 'all': return 'All';
    case 'repeated': return 'Repeated';
    case 'new': return 'New only';
  }
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1m ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// ─── Main Component ────────────────────────────────────────────────

export function RadarFilterBar({ className = '' }: RadarFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeCount = useSignalFilterStore((s) => s.getActiveFilterCount());

  return (
    <div className={`bg-dark-800/50 rounded-xl border border-dark-700/50 p-3 ${className}`}>
      {/* Monitoring Status */}
      <MonitoringStatusRow />

      {/* Divider */}
      <div className="border-t border-dark-700/50 my-2.5" />

      {/* View Scope + Filter Toggle */}
      <div className="flex items-center justify-between">
        <ViewScopeToggle />

        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            filtersOpen || activeCount > 0
              ? 'bg-primary-600/20 text-primary-400'
              : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="px-1 py-0.5 bg-primary-600 text-white text-[9px] rounded-full min-w-[16px] text-center">
              {activeCount}
            </span>
          )}
          <span className="text-dark-500 text-[10px] ml-0.5">
            {filtersOpen ? '▲' : '▼'}
          </span>
        </button>
      </div>

      {/* Expandable Filter Controls */}
      <FilterControls isOpen={filtersOpen} />
    </div>
  );
}

export default RadarFilterBar;
