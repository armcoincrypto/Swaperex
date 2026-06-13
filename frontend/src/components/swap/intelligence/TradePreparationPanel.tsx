import { useMemo } from 'react';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import {
  buildTradePreparationItems,
  type PrepItemStatus,
  type TradePrepItem,
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

  return (
    <ShellPanel className="p-3 sm:p-4">
      <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-0.5">
        Trade Preparation
      </p>
      <p className="text-xs text-dark-400 mb-2.5">Pre-sign checklist — calm review before you swap</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <PrepRow key={item.id} item={item} />
        ))}
      </ul>
    </ShellPanel>
  );
}
