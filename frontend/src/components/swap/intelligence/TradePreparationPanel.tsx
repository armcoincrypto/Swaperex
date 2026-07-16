import { useId, useMemo, useState } from 'react';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import {
  buildTradePreparationItems,
  getTradePreparationSummary,
  type PrepItemStatus,
  type TradePrepItem,
  type TradePreparationTone,
} from './swapIntelCenterModel';
import type { AssetInfo } from '@/types/api';

interface Props {
  isConnected: boolean;
  isWrongChain: boolean;
  walletChainId: number | null;
  activeChainId: number;
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  slippage: number;
  hasActiveQuote: boolean;
  isQuoting: boolean;
}

function prepIcon(status: PrepItemStatus): string {
  switch (status) {
    case 'ok':
      return '✓';
    case 'warn':
      return '!';
    case 'pending':
      return '…';
    default:
      return '○';
  }
}

function prepRowClass(status: PrepItemStatus): string {
  switch (status) {
    case 'ok':
      return 'border-emerald-800/30 bg-emerald-950/20';
    case 'warn':
      return 'border-amber-800/30 bg-amber-950/15';
    case 'pending':
      return 'border-cyan/25 bg-cyan/5';
    default:
      return 'border-white/[0.06] bg-black/15';
  }
}

function toneIcon(tone: TradePreparationTone): string {
  switch (tone) {
    case 'ok':
      return '✓';
    case 'warn':
      return '!';
    case 'pending':
      return '…';
    default:
      return '○';
  }
}

function PrepRow({ item }: { item: TradePrepItem }) {
  return (
    <li
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${prepRowClass(item.status)}`}
    >
      <span className="text-[10px] font-mono text-dark-400 mt-0.5 shrink-0 w-3 text-center">
        {prepIcon(item.status)}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-dark-200">{item.label}</p>
        <p className="text-[10px] text-dark-500 mt-0.5 leading-snug">{item.detail}</p>
      </div>
    </li>
  );
}

export function TradePreparationPanel({
  isConnected,
  isWrongChain,
  walletChainId,
  activeChainId,
  fromAsset,
  toAsset,
  slippage,
  hasActiveQuote,
  isQuoting,
}: Props) {
  const checklistId = useId();
  const items = useMemo(
    () =>
      buildTradePreparationItems({
        isConnected,
        isWrongChain,
        walletChainId,
        activeChainId,
        fromAsset,
        toAsset,
        slippage,
        hasActiveQuote,
        isQuoting,
      }),
    [
      isConnected,
      isWrongChain,
      walletChainId,
      activeChainId,
      fromAsset,
      toAsset,
      slippage,
      hasActiveQuote,
      isQuoting,
    ],
  );

  const summary = useMemo(
    () => getTradePreparationSummary(items, isConnected),
    [items, isConnected],
  );

  const [expanded, setExpanded] = useState(summary.expandByDefault);

  const groupedItems = useMemo(() => {
    const ready = items.filter((item) => item.status === 'ok');
    const pending = items.filter((item) => item.status === 'pending' || item.status === 'idle');
    const attention = items.filter((item) => item.status === 'warn');
    return { ready, pending, attention };
  }, [items]);

  return (
    <ShellPanel className="p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-mono text-dark-400 mt-0.5 shrink-0 w-3 text-center">
          {toneIcon(summary.tone)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-dark-500">Trade Preparation</p>
          <p className="text-xs font-medium text-dark-100 leading-snug mt-0.5">{summary.label}</p>
          <p className="text-[10px] text-dark-500 mt-0.5 leading-snug">{summary.supportingText}</p>
        </div>
        <button
          type="button"
          className="shrink-0 min-h-[44px] min-w-[44px] px-2 text-xs text-primary-300 hover:text-primary-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 rounded-lg"
          aria-expanded={expanded}
          aria-controls={checklistId}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Hide' : 'View checklist'}
        </button>
      </div>

      {expanded && (
        <div id={checklistId} className="mt-2.5 space-y-2.5">
          {groupedItems.attention.length > 0 && (
            <section>
              <p className="text-[10px] uppercase tracking-wider text-amber-400/90 mb-1.5">
                Needs attention
              </p>
              <ul className="space-y-1.5">
                {groupedItems.attention.map((item) => (
                  <PrepRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}

          {groupedItems.pending.length > 0 && (
            <section>
              <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-1.5">Pending</p>
              <ul className="space-y-1.5">
                {groupedItems.pending.map((item) => (
                  <PrepRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}

          {groupedItems.ready.length > 0 && (
            <section>
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/90 mb-1.5">Ready</p>
              <ul className="space-y-1.5">
                {groupedItems.ready.map((item) => (
                  <PrepRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </ShellPanel>
  );
}
