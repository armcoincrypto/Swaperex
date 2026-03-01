/**
 * Balance Card Component
 *
 * Displays token balance with logo, USD value, and swap button.
 */

import { useState } from 'react';
import { formatBalance, formatUsd } from '@/utils/format';
import type { TokenBalance } from '@/types/api';

interface BalanceCardProps {
  balance: TokenBalance;
  onClick?: () => void;
  onSwap?: (symbol: string) => void;
  showSwapButton?: boolean;
}

function TokenLogo({ logoUrl, symbol }: { logoUrl?: string; symbol: string }) {
  const [imgError, setImgError] = useState(false);

  if (logoUrl && !imgError) {
    return (
      <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center overflow-hidden">
        <img
          src={logoUrl}
          alt={symbol}
          width={36}
          height={36}
          className="rounded-full"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center">
      <span className="text-sm font-bold">{symbol.slice(0, 3)}</span>
    </div>
  );
}

export function BalanceCard({ balance, onClick, onSwap, showSwapButton = false }: BalanceCardProps) {
  const handleSwapClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger onClick
    onSwap?.(balance.symbol);
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-3 bg-dark-800 rounded-xl ${
        onClick ? 'cursor-pointer hover:bg-dark-700 transition-colors' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <TokenLogo logoUrl={balance.logo_url} symbol={balance.symbol} />

        {/* Token Info */}
        <div>
          <div className="font-medium">{balance.symbol}</div>
          <div className="text-sm text-dark-400 truncate max-w-[120px]">{balance.name || balance.symbol}</div>
        </div>
      </div>

      {/* Balance Info + Swap Button */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-medium">{formatBalance(balance.balance)}</div>
          {balance.usd_value && (
            <div className="text-sm text-dark-400">{formatUsd(balance.usd_value)}</div>
          )}
        </div>

        {/* Swap Button */}
        {showSwapButton && parseFloat(balance.balance) > 0 && (
          <button
            onClick={handleSwapClick}
            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
            title={`Swap ${balance.symbol}`}
          >
            Swap
          </button>
        )}
      </div>
    </div>
  );
}

export default BalanceCard;
