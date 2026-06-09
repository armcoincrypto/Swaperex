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
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { swapAggregatorProviderLabel } from '@/utils/format';
import { isCommissionRequiredMode } from '@/config';
import { isCommissionWrapperExecutionProvider } from '@/services/quoteAggregator';
import {
  ShellEmptyState,
  ShellLoadingRows,
} from '@/components/ui/ShellPrimitives';

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
    <div className={className} role="region" aria-label="Swaps, transfers, and approvals">
      {/* Toolbar — section title comes from portfolio tabs */}
      <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="shell-tab-track">
            {(['all', 'swap', 'transfer', 'approval'] as TabFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`shell-tab ${tab === t ? 'shell-tab-active' : ''}`}
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
                className="px-2 py-1 text-[10px] text-dark-400 hover:text-dark-200 bg-electro-panel/50 border border-white/[0.06] rounded transition-colors"
                title="Copy as JSON"
              >
                JSON
              </button>
              <button
                onClick={handleExportCsv}
                className="px-2 py-1 text-[10px] text-dark-400 hover:text-dark-200 bg-electro-panel/50 border border-white/[0.06] rounded transition-colors"
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
            className="text-xs text-accent/90 hover:text-accent disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && items.length === 0 && (
        <ShellLoadingRows count={3} rowClassName="h-11 rounded-lg" />
      )}

      {/* Error */}
      {error && items.length === 0 && (
        <ShellEmptyState
          title={error}
          action={
            <button
              onClick={fetchActivity}
              className="text-accent hover:brightness-110 text-xs font-medium"
            >
              Try again
            </button>
          }
        />
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <ShellEmptyState
          icon={
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
          title="No activity yet"
          description="Completed swaps and transfers appear here."
        />
      )}

      {/* Activity rows */}
      {filteredItems.length > 0 && (
        <div className="space-y-1 animate-fadeIn">
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

const CHAIN_LABELS: Record<number, string> = {
  1: 'ETH',
  56: 'BSC',
  137: 'Polygon',
  42161: 'Arbitrum',
};

function stripDetailMinSuffix(detail: string): string {
  return detail.replace(/\s*·\s*min\s+[\d.]+(?:e[+-]?\d+)?\s*$/i, '').trim();
}

function formatAmountLine(item: ActivityItem): string {
  if (item.tokenIn && item.tokenOut) {
    const outRaw = item.tokenOut.amount;
    const outDisplay = outRaw.startsWith('~') ? outRaw : `~${outRaw}`;
    return `${item.tokenIn.amount} ${item.tokenIn.symbol} → ${outDisplay} ${item.tokenOut.symbol}`;
  }
  return stripDetailMinSuffix(item.detail);
}

type RoutePill = { label: string; tone: 'commission' | 'historical' | 'neutral' };

function buildRoutePill(item: ActivityItem): RoutePill | null {
  if (item.type !== 'swap' || !item.provider || item.provider === 'transfer') return null;
  const providerLabel = swapAggregatorProviderLabel(item.provider);
  if (isCommissionWrapperExecutionProvider(item.provider)) {
    return { label: `Commission · ${providerLabel}`, tone: 'commission' };
  }
  if (isCommissionRequiredMode()) {
    return { label: `Historical · ${providerLabel}`, tone: 'historical' };
  }
  return { label: providerLabel, tone: 'neutral' };
}

function routePillClass(tone: RoutePill['tone']): string {
  switch (tone) {
    case 'commission':
      return 'border-primary-500/25 bg-primary-950/40 text-primary-300/90';
    case 'historical':
      return 'border-amber-700/30 bg-amber-950/25 text-amber-200/80';
    default:
      return 'border-white/[0.08] bg-white/[0.04] text-dark-300';
  }
}

function buildSettlementLine(item: ActivityItem): { text: string; tooltip: string } | null {
  if (item.type !== 'swap' || item.status !== 'success') return null;
  const min = item.localRecord?.minimumToAmount;
  if (!min) return null;
  const sym = item.tokenOut?.symbol ?? item.localRecord?.toAsset.symbol ?? '';
  return {
    text: `Min received: ${min} ${sym}`.trim(),
    tooltip: `Minimum received at send: ${min} ${sym}. ${SWAP_SURFACE_COPY.minimumReceivedExactFooter}`,
  };
}

function statusHint(item: ActivityItem): string | null {
  if (item.type !== 'swap') return null;
  if (item.status === 'pending') return 'Pending — verify on the explorer before retrying.';
  if (item.status === 'uncertain') return 'Outcome unclear — verify on the explorer before retrying.';
  if (item.status === 'failed' && item.txHash) {
    return 'Failed on-chain — verify on the explorer before retrying.';
  }
  return null;
}

// ─── Activity Row ──────────────────────────────────────────────────

function ActivityRow({
  item,
  onRepeat,
}: {
  item: ActivityItem;
  onRepeat?: (record: SwapRecord) => void;
}) {
  const amountLine = formatAmountLine(item);
  const routePill = buildRoutePill(item);
  const settlement = buildSettlementLine(item);
  const hint = statusHint(item);

  return (
    <div className="flex items-start justify-between gap-2 p-2.5 bg-dark-800/90 border border-white/[0.05] rounded-lg hover:bg-dark-700/45 transition-colors group">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <StatusIcon status={item.status} type={item.type} />

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-sm text-dark-100 truncate">{item.title}</span>
            <span className="shrink-0 px-1 py-0.5 bg-dark-700/80 text-dark-400 text-[9px] font-medium rounded">
              {CHAIN_LABELS[item.chainId] || 'Chain'}
            </span>
          </div>

          <p className="text-[11px] text-dark-300 tabular-nums truncate leading-snug">{amountLine}</p>

          {(routePill || settlement) && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {routePill && (
                <span
                  className={`inline-flex max-w-full truncate rounded px-1.5 py-0.5 text-[9px] font-medium leading-none border ${routePillClass(routePill.tone)}`}
                  title={routePill.label}
                >
                  {routePill.label}
                </span>
              )}
              {settlement && (
                <span
                  className="text-[10px] text-dark-500 truncate leading-none"
                  title={settlement.tooltip}
                >
                  {settlement.text}
                </span>
              )}
            </div>
          )}

          {hint && (
            <p className="text-[10px] text-amber-200/80 leading-snug pt-0.5">{hint}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
        <span className="text-[10px] text-dark-500 whitespace-nowrap">{formatActivityTime(item.ts)}</span>
        <div className="flex items-center gap-0.5">
          {item.canRepeat && item.localRecord && onRepeat && (
            <button
              type="button"
              onClick={() => onRepeat(item.localRecord!)}
              className="min-h-[32px] min-w-[32px] px-2 py-1 bg-primary-600/20 text-primary-400 rounded text-[10px] font-medium hover:bg-primary-600/30 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
              title="Repeat this swap"
            >
              Repeat
            </button>
          )}
          {item.explorerUrl && (
            <a
              href={item.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center p-1.5 text-dark-500 hover:text-dark-200 transition-colors"
              title="View on explorer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>
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
    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${bgColor}`}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icon()}
      </svg>
    </div>
  );
}

export default ActivityPanel;
