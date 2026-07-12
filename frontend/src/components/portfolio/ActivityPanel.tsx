/**
 * Activity Panel — consolidated wallet-scoped transaction history (P17.4).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useSwapHistoryStore, type SwapRecord } from '@/stores/swapHistoryStore';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import {
  ACTIVITY_CHAIN_IDS,
  buildUnifiedWalletActivity,
  exportActivityCsv,
  exportActivityJson,
  fetchUnifiedWalletActivity,
  filterUnifiedActivityGroups,
  formatActivityTime,
} from '@/services/activityService';
import { transactionReconciliationCoordinator } from '@/services/transactionReconciliationCoordinator';
import {
  ACTIVITY_HISTORY_DISCLAIMER,
  CHAIN_ACTIVITY_LABELS,
  type UnifiedActivityGroup,
  type UnifiedActivityItem,
  type UnifiedActivityResult,
} from '@/types/unifiedActivity';
import {
  presentActivityKind,
  presentActivitySource,
  presentActivityStatus,
  statusPresentationClass,
} from '@/utils/activityPresentation';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { swapAggregatorProviderLabel } from '@/utils/format';
import { getJournalStatusPresentation } from '@/utils/swaperexErrorPresentation';
import { isCommissionRequiredMode } from '@/config';
import { isCommissionWrapperExecutionProvider } from '@/services/quoteAggregator';
import { useTransactionDetailsDialog } from '@/hooks/useTransactionDetailsDialog';
import {
  ShellEmptyState,
  ShellLoadingRows,
} from '@/components/ui/ShellPrimitives';

interface ActivityPanelProps {
  onRepeatSwap?: (record: SwapRecord) => void;
  className?: string;
}

type TabFilter = 'all' | 'swap' | 'transfer' | 'approval' | 'pending';

export function ActivityPanel({ onRepeatSwap, className = '' }: ActivityPanelProps) {
  const address = useWalletStore((s) => s.address);
  const isConnected = useWalletStore((s) => s.isConnected);
  const journalRecords = useTransactionJournalStore((s) => s.records);
  const transferRecords = useSwapHistoryStore((s) => s.transferRecords);

  const [result, setResult] = useState<UnifiedActivityResult | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [tab, setTab] = useState<TabFilter>('all');
  const fetchGeneration = useRef(0);
  const { openFromActivityItem, dialog: detailsDialog } = useTransactionDetailsDialog();

  const localResult = useMemo(() => {
    if (!address || !isConnected) return null;
    return buildUnifiedWalletActivity({
      walletAddress: address,
      journalRecords,
      transferRecords,
      explorerTxs: [],
      explorerStatus: 'skipped',
    });
  }, [address, isConnected, journalRecords, transferRecords]);

  const refreshActivity = useCallback(async () => {
    if (!address || !isConnected) return;

    const generation = ++fetchGeneration.current;
    setExplorerLoading(true);

    void transactionReconciliationCoordinator.reconcileWallet(address, 'manual');

    try {
      const merged = await fetchUnifiedWalletActivity(
        address,
        journalRecords,
        transferRecords,
        ACTIVITY_CHAIN_IDS,
        10,
      );
      if (generation !== fetchGeneration.current) return;
      setResult(merged);
    } finally {
      if (generation === fetchGeneration.current) {
        setExplorerLoading(false);
      }
    }
  }, [address, isConnected, journalRecords, transferRecords]);

  useEffect(() => {
    setResult(null);
    fetchGeneration.current += 1;
  }, [address]);

  useEffect(() => {
    if (!address || !isConnected) {
      setResult(null);
      return;
    }
    void refreshActivity();
  }, [address, isConnected, refreshActivity]);

  const displayResult = result ?? localResult;
  const items = displayResult?.items ?? [];
  const filteredGroups = useMemo(() => {
    const groups = displayResult?.groups ?? [];
    const filtered = filterUnifiedActivityGroups(groups, tab);
    if (tab !== 'all' || (displayResult?.attentionItems.length ?? 0) === 0) {
      return filtered;
    }
    const attentionIds = new Set(displayResult!.attentionItems.map((item) => item.id));
    return filtered
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !attentionIds.has(item.id)),
        isFlow: group.isFlow && group.items.filter((item) => !attentionIds.has(item.id)).length > 1,
      }))
      .filter((group) => group.items.length > 0);
  }, [displayResult?.groups, displayResult?.attentionItems, tab]);

  const flatFilteredItems = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  );

  const explorerError = displayResult?.sources.explorer.status === 'error'
    ? displayResult.sources.explorer.message ?? 'Explorer activity is temporarily unavailable.'
    : null;

  if (!isConnected) {
    return (
      <div className={className} role="region" aria-label="Wallet activity">
        <ShellEmptyState
          title="Connect a wallet to view activity for that wallet."
          description="Swaperex activity is stored on this device."
        />
      </div>
    );
  }

  const handleExportCsv = () => {
    const csv = exportActivityCsv(flatFilteredItems);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swaperex-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    const json = exportActivityJson(flatFilteredItems);
    void navigator.clipboard.writeText(json);
  };

  const hasJournalOnly = items.length > 0 && displayResult?.sources.explorer.status !== 'ok';

  return (
    <div className={className} role="region" aria-label="Swaps, transfers, and approvals">
      {detailsDialog}
      <p className="text-[11px] text-dark-500 leading-snug mb-3" data-testid="activity-disclaimer">
        {ACTIVITY_HISTORY_DISCLAIMER}
      </p>

      <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="shell-tab-track" role="tablist" aria-label="Activity filters">
            {(['all', 'swap', 'approval', 'transfer', 'pending'] as TabFilter[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`shell-tab ${tab === t ? 'shell-tab-active' : ''}`}
              >
                {t === 'all'
                  ? 'All'
                  : t === 'swap'
                    ? 'Swaps'
                    : t === 'transfer'
                      ? 'Transfers'
                      : t === 'approval'
                        ? 'Approvals'
                        : 'Pending'}
              </button>
            ))}
          </div>

          {flatFilteredItems.length > 0 && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleCopyJson}
                className="px-2 py-1 text-[10px] text-dark-400 hover:text-dark-200 bg-electro-panel/50 border border-white/[0.06] rounded transition-colors"
                title="Copy as JSON"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-2 py-1 text-[10px] text-dark-400 hover:text-dark-200 bg-electro-panel/50 border border-white/[0.06] rounded transition-colors"
                title="Download CSV"
              >
                CSV
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void refreshActivity()}
            disabled={explorerLoading}
            className="text-xs text-accent/90 hover:text-accent disabled:opacity-50"
            aria-busy={explorerLoading}
          >
            {explorerLoading ? 'Refreshing…' : 'Refresh activity'}
          </button>
        </div>
      </div>

      {explorerLoading && items.length === 0 && (
        <ShellLoadingRows count={3} rowClassName="h-11 rounded-lg" />
      )}

      {explorerError && (
        <p
          className="text-[11px] text-amber-200/85 mb-2"
          role="status"
          data-testid="explorer-error"
        >
          Explorer activity is temporarily unavailable. Your saved Swaperex activity is still shown.
        </p>
      )}

      {explorerLoading && items.length > 0 && (
        <p className="text-[10px] text-dark-500 mb-2" aria-live="polite">
          Loading explorer activity…
        </p>
      )}

      {!explorerLoading && items.length === 0 && !explorerError && (
        <ShellEmptyState
          icon={
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
          title="No Swaperex transactions have been saved on this device yet."
          description={hasJournalOnly ? undefined : 'Explorer activity will appear when available.'}
        />
      )}

      {filteredGroups.length === 0 && items.length > 0 && (
        <ShellEmptyState title="No activity matches this filter." />
      )}

      {(displayResult?.attentionItems.length ?? 0) > 0 && tab === 'all' && (
        <section className="mb-3" aria-label="Needs attention">
          <h3 className="text-xs font-medium text-amber-200/90 mb-1.5">Needs attention</h3>
          <ul className="space-y-1 list-none p-0 m-0">
            {displayResult!.attentionItems.slice(0, 5).map((item) => (
              <li key={`attention-${item.id}`}>
                <ActivityRow
                  item={item}
                  onRepeat={onRepeatSwap}
                  onViewDetails={openFromActivityItem}
                  compact
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {filteredGroups.length > 0 && (
        <ul className="space-y-1 animate-fadeIn list-none p-0 m-0" aria-label="Activity history">
          {filteredGroups.map((group) => (
            <li key={group.key}>
              {group.isFlow ? (
                <FlowGroupCard
                  group={group}
                  onRepeat={onRepeatSwap}
                  onViewDetails={openFromActivityItem}
                />
              ) : (
                <ActivityRow
                  item={group.items[0]}
                  onRepeat={onRepeatSwap}
                  onViewDetails={openFromActivityItem}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {flatFilteredItems.length > 0 && (
        <div className="text-center text-[11px] text-dark-500 mt-3">
          Showing {flatFilteredItems.length} activit{flatFilteredItems.length !== 1 ? 'ies' : 'y'}
        </div>
      )}
    </div>
  );
}

function FlowGroupCard({
  group,
  onRepeat,
  onViewDetails,
}: {
  group: UnifiedActivityGroup;
  onRepeat?: (record: SwapRecord) => void;
  onViewDetails?: (item: UnifiedActivityItem) => void;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-dark-800/60 p-2 space-y-1">
      <div className="text-[10px] font-medium text-dark-400 px-1">Swap flow</div>
      {group.items.map((item) => (
        <ActivityRow
          key={item.id}
          item={item}
          onRepeat={onRepeat}
          onViewDetails={onViewDetails}
          nested
        />
      ))}
    </div>
  );
}

function ActivityRow({
  item,
  onRepeat,
  onViewDetails,
  compact = false,
  nested = false,
}: {
  item: UnifiedActivityItem;
  onRepeat?: (record: SwapRecord) => void;
  onViewDetails?: (item: UnifiedActivityItem) => void;
  compact?: boolean;
  nested?: boolean;
}) {
  const routePill = buildRoutePill(item);
  const settlement = buildSettlementLine(item);
  const hint = statusHint(item);
  const kindLabel = presentActivityKind(item.kind);
  const statusLabel = presentActivityStatus(item.status);
  const sourceLabel = presentActivitySource(item.source);

  const amountLine =
    item.fromAsset && item.toAsset
      ? `${item.fromAsset.amount ?? item.amountIn ?? '—'} ${item.fromAsset.symbol} → ${item.toAsset.amount ?? item.amountOut ?? '—'} ${item.toAsset.symbol}`
      : item.subtitle ?? item.title;

  return (
    <div
      className={`flex items-start justify-between gap-2 ${
        nested ? 'p-2' : 'p-2.5'
      } bg-dark-800/90 border border-white/[0.05] rounded-lg hover:bg-dark-700/45 transition-colors group`}
      data-testid="activity-row"
      data-kind={item.kind}
      data-source={item.source}
      data-status={item.status}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <StatusBadge status={item.status} kind={item.kind} label={statusLabel} />

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="font-medium text-sm text-dark-100 truncate">{item.title}</span>
            <span className="shrink-0 px-1 py-0.5 bg-dark-700/80 text-dark-400 text-[9px] font-medium rounded">
              {CHAIN_ACTIVITY_LABELS[item.chainId] || 'Chain'}
            </span>
            <span
              className="shrink-0 px-1 py-0.5 bg-dark-700/50 text-dark-500 text-[9px] rounded"
              title={sourceLabel}
            >
              {sourceLabel}
            </span>
            {!compact && (
              <span className="shrink-0 text-[9px] text-dark-500">{kindLabel}</span>
            )}
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
                <span className="text-[10px] text-dark-500 truncate leading-none" title={settlement.tooltip}>
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
          {onViewDetails && (
            <button
              type="button"
              onClick={() => onViewDetails(item)}
              className="min-h-[32px] px-2 py-1 text-[10px] text-dark-400 hover:text-dark-200"
            >
              Details
            </button>
          )}
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
              aria-label={`View ${kindLabel} on explorer`}
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

function StatusBadge({
  status,
  kind,
  label,
}: {
  status: UnifiedActivityItem['status'];
  kind: UnifiedActivityItem['kind'];
  label: string;
}) {
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${statusPresentationClass(status)}`}
      title={label}
      aria-label={`${presentActivityKind(kind)}: ${label}`}
    >
      <span className="text-[9px] font-semibold leading-none" aria-hidden>
        {label.slice(0, 1)}
      </span>
    </div>
  );
}

type RoutePill = { label: string; tone: 'commission' | 'historical' | 'neutral' };

function buildRoutePill(item: UnifiedActivityItem): RoutePill | null {
  if (item.kind !== 'swap' || !item.provider || item.provider === 'transfer') return null;
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

function buildSettlementLine(item: UnifiedActivityItem): { text: string; tooltip: string } | null {
  if (item.kind !== 'swap' || item.status !== 'confirmed') return null;
  const min = item.localRecord?.minimumToAmount;
  if (!min) return null;
  const sym = item.toAsset?.symbol ?? item.localRecord?.toAsset.symbol ?? '';
  return {
    text: `Min received: ${min} ${sym}`.trim(),
    tooltip: `Minimum received at send: ${min} ${sym}. ${SWAP_SURFACE_COPY.minimumReceivedExactFooter}`,
  };
}

function statusHint(item: UnifiedActivityItem): string | null {
  if (item.kind !== 'swap') return null;
  if (
    item.status === 'pending' ||
    item.status === 'submitted' ||
    item.status === 'unknown' ||
    item.status === 'stale' ||
    item.status === 'reverted'
  ) {
    return getJournalStatusPresentation(item.status, {
      transactionHash: item.transactionHash,
    }).description;
  }
  return null;
}

export default ActivityPanel;
