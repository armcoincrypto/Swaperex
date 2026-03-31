/**
 * Activity Panel
 *
 * Merged activity feed: local swap history + blockchain explorer.
 * Tabs: All / Swaps / Transfers
 * Features: dedup by txHash, Quick Repeat, export CSV/JSON, explorer links.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useSwapHistoryStore, type SwapRecord } from '@/stores/swapHistoryStore';
import {
  fetchMergedActivity,
  mergeLocalAndExplorer,
  exportActivityCsv,
  exportActivityJson,
  formatActivityTime,
  type ActivityItem,
  type ActivityType,
} from '@/services/activityService';
import { swapAggregatorProviderLabel } from '@/utils/format';

/** Explorer-supported chain IDs (FIX-6: added Polygon 137) */
const ACTIVITY_CHAIN_IDS = [1, 56, 137];

interface ActivityPanelProps {
  onRepeatSwap?: (record: SwapRecord) => void;
  className?: string;
}

type TabFilter = 'all' | 'swap' | 'transfer' | 'approval';

export function ActivityPanel({ onRepeatSwap, className = '' }: ActivityPanelProps) {
  // Individual selectors — only re-render on address/connection change, not chainId
  const address = useWalletStore((s) => s.address);
  const isConnected = useWalletStore((s) => s.isConnected);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>('all');

  // FIX-2: Read localRecords inside callback to avoid stale closure
  const fetchActivity = useCallback(async () => {
    if (!address || !isConnected) return;

    setLoading(true);
    setError(null);

    // Read fresh records directly from store (not from stale closure)
    const localRecords = useSwapHistoryStore.getState().records.slice(0, 100);

    try {
      console.log('[ActivityPanel] Fetching activity for', address, 'chains:', ACTIVITY_CHAIN_IDS);
      const merged = await fetchMergedActivity(address, ACTIVITY_CHAIN_IDS, localRecords, 10);
      console.log('[ActivityPanel] Got', merged.length, 'items:', merged.slice(0, 2));
      setItems(merged);
    } catch (err) {
      console.error('[ActivityPanel] Fetch failed:', err);
      setError('Failed to load activity');
      // Fall back to local-only
      if (localRecords.length > 0) {
        setItems(mergeLocalAndExplorer(localRecords, []));
      }
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Filter by tab
  const filteredItems = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter((item) => item.type === tab);
  }, [items, tab]);

  // Not connected
  if (!isConnected) return null;

  // Export handlers
  const handleExportCsv = () => {
    const csv = exportActivityCsv(filteredItems);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swaperex-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    const json = exportActivityJson(filteredItems);
    navigator.clipboard.writeText(json);
  };

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Activity</h2>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex gap-1 p-0.5 bg-dark-800 rounded-lg">
            {(['all', 'swap', 'transfer', 'approval'] as TabFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  tab === t
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {t === 'all' ? 'All' : t === 'swap' ? 'Swaps' : t === 'transfer' ? 'Transfers' : 'Approvals'}
              </button>
            ))}
          </div>

          {/* Export */}
          {filteredItems.length > 0 && (
            <div className="flex gap-1">
              <button
                onClick={handleCopyJson}
                className="px-2 py-1 text-[10px] text-dark-400 hover:text-dark-200 bg-dark-800 rounded transition-colors"
                title="Copy as JSON"
              >
                JSON
              </button>
              <button
                onClick={handleExportCsv}
                className="px-2 py-1 text-[10px] text-dark-400 hover:text-dark-200 bg-dark-800 rounded transition-colors"
                title="Download CSV"
              >
                CSV
              </button>
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={fetchActivity}
            disabled={loading}
            className="text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && items.length === 0 && (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-dark-800 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && items.length === 0 && (
        <div className="p-4 bg-dark-800 rounded-xl text-center">
          <p className="text-dark-400 text-sm">{error}</p>
          <button
            onClick={fetchActivity}
            className="mt-2 text-primary-400 hover:text-primary-300 text-xs"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <div className="bg-dark-800 rounded-xl p-6 text-center">
          <svg className="w-10 h-10 mx-auto text-dark-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-dark-400 text-sm">No activity yet</p>
          <p className="text-dark-500 text-xs mt-1">
            Your completed swaps will appear here for easy reference and quick repeat.
          </p>
        </div>
      )}

      {/* Activity rows */}
      {filteredItems.length > 0 && (
        <div className="space-y-1.5 animate-fadeIn">
          {filteredItems.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              onRepeat={onRepeatSwap}
            />
          ))}
          <div className="text-center text-[11px] text-dark-500 mt-3">
            Showing {filteredItems.length} activit{filteredItems.length !== 1 ? 'ies' : 'y'}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Activity Row ──────────────────────────────────────────────────

function ActivityRow({
  item,
  onRepeat,
}: {
  item: ActivityItem;
  onRepeat?: (record: SwapRecord) => void;
}) {
  const CHAIN_LABELS: Record<number, string> = {
    1: 'ETH',
    56: 'BSC',
    137: 'Polygon',
    42161: 'Arbitrum',
  };

  return (
    <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl hover:bg-dark-700/50 transition-colors group">
      {/* Left: status + details */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Status icon */}
        <StatusIcon status={item.status} type={item.type} />

        {/* Details */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{item.title}</span>
            <span className="px-1 py-0.5 bg-dark-700 text-dark-400 text-[9px] font-medium rounded">
              {CHAIN_LABELS[item.chainId] || 'Chain'}
            </span>
          </div>
          <div className="text-[11px] text-dark-500 truncate">
            {item.detail}
            {item.provider && (
              <span className="text-dark-600">
                {' '}
                via {swapAggregatorProviderLabel(item.provider)}
              </span>
            )}
          </div>
          {item.type === 'swap' && item.status === 'pending' && (
            <p className="text-[10px] text-amber-200/80 mt-0.5 leading-snug">
              Pending — verify on the explorer before retrying.
            </p>
          )}
          {item.type === 'swap' && item.status === 'uncertain' && (
            <p className="text-[10px] text-amber-200/80 mt-0.5 leading-snug">
              Outcome unclear — verify on the explorer before retrying.
            </p>
          )}
          {item.type === 'swap' && item.status === 'failed' && item.txHash && (
            <p className="text-[10px] text-amber-200/80 mt-0.5 leading-snug">
              Failed on-chain — confirm on the explorer before retrying.
            </p>
          )}
          {item.type === 'swap' && item.status === 'success' && (
            <p className="text-[10px] text-dark-500 mt-0.5 leading-snug">
              {item.localRecord?.minimumToAmount
                ? `Min protected at send: ${item.localRecord.minimumToAmount} ${item.tokenOut?.symbol ?? ''}. Exact received: explorer or wallet.`
                : 'Confirmed on-chain. Exact received not decoded here — explorer or wallet.'}
            </p>
          )}
        </div>
      </div>

      {/* Right: time + actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[11px] text-dark-500">{formatActivityTime(item.ts)}</span>

        {/* Repeat button */}
        {item.canRepeat && item.localRecord && onRepeat && (
          <button
            onClick={() => onRepeat(item.localRecord!)}
            className="px-2 py-1 bg-primary-600/20 text-primary-400 rounded text-[11px] font-medium hover:bg-primary-600/30 transition-colors opacity-0 group-hover:opacity-100"
            title="Repeat this swap"
          >
            Repeat
          </button>
        )}

        {/* Explorer link */}
        {item.explorerUrl && (
          <a
            href={item.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-dark-500 hover:text-dark-300 transition-colors"
            title="View on explorer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status, type }: { status: string; type: ActivityType }) {
  const bgColor =
    status === 'success'
      ? 'bg-green-900/30 text-green-400'
      : status === 'pending'
      ? 'bg-yellow-900/30 text-yellow-400'
      : status === 'uncertain'
      ? 'bg-amber-900/30 text-amber-400'
      : 'bg-red-900/30 text-red-400';

  // Type-based icons
  const icon = () => {
    if (status === 'failed') {
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />;
    }
    if (status === 'pending') {
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />;
    }
    if (status === 'uncertain') {
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
    }
    switch (type) {
      case 'swap':
        return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />;
      case 'approval':
        return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />;
      default:
        return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />;
    }
  };

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${bgColor}`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icon()}
      </svg>
    </div>
  );
}

export default ActivityPanel;
