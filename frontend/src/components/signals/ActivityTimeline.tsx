/**
 * Activity Timeline
 *
 * Professional signal history with smart grouping, filtering,
 * expand/collapse, clear confirmation, export, and help.
 * Replaces the old SignalHistoryPanel.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  useSignalHistoryStore,
  type SignalGroup,
  type TimeRange,
  groupSignalEntries,
  getTimeRangeMs,
  getSeverityLabel,
  getSeverityColor,
  getChainLabel,
  formatRelativeTime,
  formatRecurrenceText,
  getTrendIcon,
  getTrendColorClass,
} from '@/stores/signalHistoryStore';
import { useSignalFilterStore, shouldShowSignal } from '@/stores/signalFilterStore';
import { TokenBadge } from '@/components/common/TokenDisplay';
import { QuickActions } from '@/components/signals/QuickActions';
import { RiskScoreBreakdown } from '@/components/signals/RiskScoreBreakdown';
import { SignalGuidance } from '@/components/signals/SignalGuidance';
import { prefetchTokenMeta } from '@/services/tokenMeta';

// ── Constants ──────────────────────────────────────────────────────

const CHAINS_ALL = [
  { id: 0, label: 'All Chains' },
  { id: 1, label: 'ETH' },
  { id: 56, label: 'BSC' },
  { id: 8453, label: 'Base' },
  { id: 42161, label: 'ARB' },
];

// ── Main Component ─────────────────────────────────────────────────

interface ActivityTimelineProps {
  maxGroups?: number;
  className?: string;
}

export function ActivityTimeline({ maxGroups = 20, className = '' }: ActivityTimelineProps) {
  const { entries, clearHistory } = useSignalHistoryStore();
  const signalFilters = useSignalFilterStore();

  // Local UI state
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [chainFilter, setChainFilter] = useState(0); // 0 = all
  const [typeFilter, setTypeFilter] = useState<'all' | 'risk' | 'liquidity'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'warning' | 'danger' | 'critical'>('all');
  const [copied, setCopied] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  // Prefetch token metadata
  useEffect(() => {
    if (entries.length > 0) {
      prefetchTokenMeta(entries.map(e => ({
        chainId: e.chainId,
        address: e.token,
        symbol: e.tokenSymbol,
      })));
    }
  }, [entries]);

  // Close help popover on outside click
  useEffect(() => {
    if (!showHelp) return;
    const handler = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHelp]);

  // ── Filtering pipeline (memoized) ────────────────

  const filteredAndGrouped = useMemo(() => {
    const now = Date.now();
    const cutoff = now - getTimeRangeMs(timeRange);

    // Step 1: Time range
    let filtered = entries.filter(e => e.timestamp > cutoff);

    // Step 2: Signal filters (impact/confidence/type from signalFilterStore)
    filtered = filtered.filter(e =>
      shouldShowSignal(
        { type: e.type, confidence: e.confidence, impact: e.impact },
        signalFilters
      )
    );

    // Step 3: Chain filter
    if (chainFilter > 0) {
      filtered = filtered.filter(e => e.chainId === chainFilter);
    }

    // Step 4: Type filter (local)
    if (typeFilter !== 'all') {
      filtered = filtered.filter(e => e.type === typeFilter);
    }

    // Step 5: Severity filter (local)
    if (severityFilter !== 'all') {
      filtered = filtered.filter(e => e.severity === severityFilter);
    }

    // Step 6: Search (symbol or address substring)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(e =>
        (e.tokenSymbol?.toLowerCase().includes(q)) ||
        e.token.toLowerCase().includes(q)
      );
    }

    // Step 7: Group
    return groupSignalEntries(filtered);
  }, [entries, timeRange, signalFilters, chainFilter, typeFilter, severityFilter, searchQuery]);

  const displayGroups = filteredAndGrouped.slice(0, maxGroups);
  const totalEntries = entries.length;
  const totalFiltered = filteredAndGrouped.reduce((sum, g) => sum + g.count, 0);

  // ── Handlers ──────────────────────────────────────

  const handleClear = useCallback(() => {
    clearHistory();
    setShowClearConfirm(false);
    setExpandedGroupKey(null);
  }, [clearHistory]);

  const handleExportClipboard = useCallback(async () => {
    try {
      const data = JSON.stringify(entries, null, 2);
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [entries]);

  const handleExportDownload = useCallback(() => {
    const data = JSON.stringify(entries, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swaperex-activity-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  // ── Render ────────────────────────────────────────

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ── Header ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 relative" ref={helpRef}>
          <h3 className="text-sm font-medium text-dark-200">Activity Timeline</h3>
          <span className="px-1.5 py-0.5 bg-dark-700 text-dark-400 text-[10px] rounded font-mono">
            Last {timeRange}
          </span>
          {totalFiltered > 0 && (
            <span className="px-1.5 py-0.5 bg-dark-600 text-dark-300 text-[10px] rounded">
              {totalFiltered}
            </span>
          )}
          {/* Help button */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="text-dark-500 hover:text-dark-300 text-[10px] transition-colors"
            title="What is this?"
          >
            ?
          </button>
          {/* Help popover */}
          {showHelp && (
            <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-dark-800 border border-dark-600 rounded-lg shadow-xl p-3 text-[11px] text-dark-400 space-y-2">
              <p className="text-dark-200 font-medium">About Activity Timeline</p>
              <p><strong>Signals</strong> are alerts detected when you check a token. They include risk factors (from GoPlus security audit) and liquidity drops (from DexScreener).</p>
              <p><strong>Repeats</strong> happen when the same issue is detected again after a 5-minute cooldown. Repeated signals are grouped together.</p>
              <p><strong>Confidence</strong> indicates how certain the detection is (0-100%). Higher is more reliable.</p>
              <p><strong>Data storage:</strong> All history is stored locally on your device only. Nothing is sent to any server. Clearing your browser data removes it.</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {totalEntries > 0 && (
            <>
              <button
                onClick={handleExportClipboard}
                className="text-[10px] text-dark-500 hover:text-dark-300 transition-colors"
                title="Copy all history as JSON"
              >
                {copied ? '✓ Copied' : 'Export'}
              </button>
              <button
                onClick={handleExportDownload}
                className="text-[10px] text-dark-500 hover:text-dark-300 transition-colors"
                title="Download history as .json file"
              >
                Download
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-[10px] text-dark-600 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Clear Confirmation Modal ─────────────── */}
      {showClearConfirm && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
          <p className="text-xs text-red-400 mb-2">
            Clear Activity Timeline? This removes all local signal history on this device.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="px-3 py-1 bg-red-600 text-white text-[11px] rounded hover:bg-red-500 transition-colors"
            >
              Clear All ({totalEntries})
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-3 py-1 bg-dark-700 text-dark-300 text-[11px] rounded hover:bg-dark-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Filter Bar ───────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Time range */}
        <div className="flex bg-dark-900/50 rounded p-0.5">
          {(['1h', '6h', '24h'] as TimeRange[]).map(t => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                timeRange === t
                  ? 'bg-dark-700 text-dark-200 font-medium'
                  : 'text-dark-500 hover:text-dark-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Severity filter */}
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="px-2 py-1 bg-dark-700 border border-dark-600 rounded text-[10px] text-dark-300 focus:outline-none"
        >
          <option value="all">All Severity</option>
          <option value="critical">Critical</option>
          <option value="danger">High Risk</option>
          <option value="warning">Caution</option>
        </select>

        {/* Type pills */}
        <div className="flex bg-dark-900/50 rounded p-0.5">
          {(['all', 'risk', 'liquidity'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                typeFilter === t
                  ? 'bg-dark-700 text-dark-200 font-medium'
                  : 'text-dark-500 hover:text-dark-300'
              }`}
            >
              {t === 'all' ? 'All' : t === 'risk' ? 'Risk' : 'Liquidity'}
            </button>
          ))}
        </div>

        {/* Chain filter */}
        <select
          value={chainFilter}
          onChange={e => setChainFilter(Number(e.target.value))}
          className="px-2 py-1 bg-dark-700 border border-dark-600 rounded text-[10px] text-dark-300 focus:outline-none"
        >
          {CHAINS_ALL.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search symbol or address..."
          className="flex-1 min-w-[120px] px-2 py-1 bg-dark-700 border border-dark-600 rounded text-[10px] text-dark-300 placeholder-dark-500 focus:outline-none focus:border-primary-500"
        />
      </div>

      {/* ── Entry List ───────────────────────────── */}
      {displayGroups.length === 0 ? (
        <EmptyState timeRange={timeRange} totalEntries={totalEntries} />
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {displayGroups.map(group => (
            <GroupRow
              key={group.key}
              group={group}
              expanded={expandedGroupKey === group.key}
              onToggle={() => setExpandedGroupKey(expandedGroupKey === group.key ? null : group.key)}
            />
          ))}
        </div>
      )}

      {/* More indicator */}
      {filteredAndGrouped.length > maxGroups && (
        <div className="text-center text-[10px] text-dark-600">
          +{filteredAndGrouped.length - maxGroups} more groups
        </div>
      )}
    </div>
  );
}

// ── Group Row ──────────────────────────────────────────────────────

function GroupRow({
  group,
  expanded,
  onToggle,
}: {
  group: SignalGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [copiedAddr, setCopiedAddr] = useState(false);

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(group.token);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    } catch { /* ignore */ }
  };

  const shortAddr = `${group.token.slice(0, 6)}...${group.token.slice(-4)}`;

  return (
    <div
      className={`rounded-lg border transition-all text-xs ${
        expanded ? 'ring-1 ring-dark-600 bg-dark-800/70 border-dark-600' : 'bg-dark-800/50 border-dark-700'
      }`}
    >
      {/* Main Row */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-dark-700/30 transition-colors rounded-lg"
        aria-expanded={expanded}
      >
        {/* Severity badge */}
        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${getSeverityColor(group.severity)}`}>
          {getSeverityLabel(group.severity)}
        </span>

        {/* Type badge */}
        <span
          className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
            group.type === 'liquidity'
              ? 'bg-blue-900/30 text-blue-400'
              : 'bg-orange-900/30 text-orange-400'
          }`}
        >
          {group.type === 'liquidity' ? 'LIQ' : 'RISK'}
        </span>

        {/* Token identity */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <TokenBadge
            chainId={group.chainId}
            address={group.token}
            symbol={group.tokenSymbol}
            className="truncate"
          />
          <span className="text-dark-600 text-[10px]">{getChainLabel(group.chainId)}</span>
        </div>

        {/* Short address + copy */}
        <button
          onClick={handleCopyAddress}
          className="text-[10px] text-dark-500 hover:text-dark-300 font-mono flex-shrink-0 transition-colors"
          title="Copy address"
        >
          {copiedAddr ? '✓' : shortAddr}
        </button>

        {/* Confidence */}
        <span className="text-dark-400 text-[10px] flex-shrink-0" title="Confidence">
          {Math.round(group.maxConfidence * 100)}%
        </span>

        {/* Time */}
        <span className="text-dark-500 text-[10px] flex-shrink-0">
          {formatRelativeTime(group.lastSeenAt)}
        </span>

        {/* Recurrence count */}
        {group.count > 1 && (
          <span className="px-1.5 py-0.5 bg-dark-600 text-dark-300 rounded text-[10px] flex-shrink-0" title={`Repeated ${group.count} times`}>
            {group.count}x
          </span>
        )}

        {/* Expand arrow */}
        <span className="text-dark-600 text-[10px] flex-shrink-0">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <ExpandedGroupDetails group={group} />
      )}
    </div>
  );
}

// ── Expanded Group Details ──────────────────────────────────────────

function ExpandedGroupDetails({ group }: { group: SignalGroup }) {
  const latest = group.latest;

  return (
    <div className="px-3 pb-3 pt-1 border-t border-dark-700/50 space-y-3">
      {/* Impact breakdown */}
      {latest.impact && (
        <RiskScoreBreakdown
          impact={latest.impact}
          type={latest.type}
          riskFactors={latest.debugSnapshot?.risk?.riskFactors}
          liquidityDropPct={latest.debugSnapshot?.liquidity?.dropPct ?? undefined}
        />
      )}

      {/* Reason */}
      <div className="text-[11px] text-dark-400">
        <span className="text-dark-500">Reason:</span> {latest.reason}
      </div>

      {/* Recurrence info */}
      {latest.recurrence && (
        <div className={`text-[11px] ${getTrendColorClass(latest.recurrence.trend)}`}>
          <span className="text-dark-500">Trend:</span>{' '}
          {getTrendIcon(latest.recurrence.trend)} {formatRecurrenceText(latest.recurrence)}
        </div>
      )}

      {/* Escalation */}
      {latest.escalated && (
        <div className="text-[11px] text-orange-400">
          <span className="text-dark-500">Escalated:</span> {latest.previousSeverity} → {latest.severity}
        </div>
      )}

      {/* Risk factors (for risk signals) */}
      {latest.debugSnapshot?.risk && latest.debugSnapshot.risk.riskFactors.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-dark-500">Risk factors:</span>
          <div className="flex flex-wrap gap-1">
            {latest.debugSnapshot.risk.riskFactors.map((factor, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 bg-red-900/20 text-red-400/80 rounded text-[10px]"
              >
                {factor.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          {latest.debugSnapshot.risk.isHoneypot && (
            <div className="text-red-400 text-[11px] font-medium">HONEYPOT DETECTED</div>
          )}
        </div>
      )}

      {/* Liquidity details */}
      {latest.debugSnapshot?.liquidity && latest.debugSnapshot.liquidity.dropPct !== null && (
        <div className="text-[11px] text-dark-400">
          <span className="text-dark-500">Liquidity drop:</span>{' '}
          <span className="text-red-400">{latest.debugSnapshot.liquidity.dropPct.toFixed(1)}%</span>
          {latest.debugSnapshot.liquidity.currentLiquidity !== null && (
            <span className="text-dark-500 ml-2">
              (Current: ${latest.debugSnapshot.liquidity.currentLiquidity.toLocaleString()})
            </span>
          )}
        </div>
      )}

      {/* Signal guidance */}
      <SignalGuidance
        type={latest.type}
        impactLevel={latest.impact?.level}
        recurrence={latest.recurrence}
        riskFactors={latest.debugSnapshot?.risk?.riskFactors}
        liquidityDropPct={latest.debugSnapshot?.liquidity?.dropPct ?? undefined}
      />

      {/* Occurrence timeline (if grouped) */}
      {group.count > 1 && (
        <div className="space-y-1">
          <span className="text-[10px] text-dark-500 font-medium">
            Occurred {group.count} times:
          </span>
          <div className="flex flex-wrap gap-1 text-[10px]">
            {group.entries.slice(0, 10).map((entry, i) => (
              <span key={entry.id} className="text-dark-500">
                {formatRelativeTime(entry.timestamp)}
                {i < Math.min(group.entries.length, 10) - 1 && ','}
              </span>
            ))}
            {group.entries.length > 10 && (
              <span className="text-dark-600">+{group.entries.length - 10} more</span>
            )}
          </div>
          <div className="text-[10px] text-dark-600">
            First seen: {formatRelativeTime(group.firstSeenAt)}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <QuickActions
          chainId={group.chainId}
          address={group.token}
          symbol={group.tokenSymbol}
          showSwap={false}
        />
      </div>
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────────────

function EmptyState({ timeRange, totalEntries }: { timeRange: TimeRange; totalEntries: number }) {
  const rangeLabel = timeRange === '1h' ? 'hour' : timeRange === '6h' ? '6 hours' : '24 hours';

  if (totalEntries === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-2xl mb-2">📡</div>
        <p className="text-dark-300 text-sm font-medium">No Activity Yet</p>
        <p className="text-dark-500 text-[11px] mt-1 max-w-xs mx-auto">
          Check a token using Token Intelligence or add tokens to your Watchlist to start receiving alerts.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-6">
      <div className="text-xl mb-2">🔍</div>
      <p className="text-dark-400 text-sm">No alerts in the last {rangeLabel}</p>
      <p className="text-dark-500 text-[11px] mt-1">
        {totalEntries} total signal{totalEntries !== 1 ? 's' : ''} in history.
        Try expanding the time range.
      </p>
    </div>
  );
}

export default ActivityTimeline;
