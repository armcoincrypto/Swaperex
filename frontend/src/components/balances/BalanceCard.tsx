/**
 * Balance Card Component
 *
 * Displays token balance with logo, USD value, and swap button.
 */

import { formatBalance, formatUsd } from '@/utils/format';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import type { TokenBalance } from '@/types/api';

interface BalanceCardProps {
  balance: TokenBalance;
  onClick?: () => void;
  onSwap?: (symbol: string) => void;
  showSwapButton?: boolean;
}

export function BalanceCard({ balance, onClick, onSwap, showSwapButton = false }: BalanceCardProps) {
  const handleSwapClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSwap?.(balance.symbol);
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border border-white/[0.08] bg-electro-panel/55 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
        onClick
          ? 'cursor-pointer hover:bg-electro-panel/75 hover:border-white/[0.12] transition-colors'
          : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <SwapTokenAvatar symbol={balance.symbol} logoUrl={balance.logo_url} size="lg" />

        <div className="min-w-0">
          <div className="font-semibold text-[15px] leading-tight tracking-tight truncate">
            {balance.symbol}
          </div>
          <div className="text-sm text-dark-400 truncate max-w-[10rem] sm:max-w-[12rem]">
            {balance.name || balance.symbol}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <div className="text-right min-w-[4.5rem]">
          <div className="font-semibold tabular-nums text-[15px] leading-tight">
            {formatBalance(balance.balance)}
          </div>
          {balance.usd_value ? (
            <div className="text-xs text-dark-400 tabular-nums mt-0.5">{formatUsd(balance.usd_value)}</div>
          ) : null}
        </div>

        {showSwapButton && parseFloat(balance.balance) > 0 ? (
          <button
            type="button"
            onClick={handleSwapClick}
            className="min-h-[2.25rem] px-3 py-1.5 bg-primary-500/20 hover:bg-primary-500/30 text-primary-200 text-sm font-semibold rounded-lg border border-primary-500/35 transition-colors"
            title={`Swap ${balance.symbol}`}
          >
            Swap
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default BalanceCard;
