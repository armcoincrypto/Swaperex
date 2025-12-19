/**
 * Balance Card Component
 *
 * Displays token balance with USD value.
 */

import { formatBalance, formatUsd } from '@/utils/format';
import type { TokenBalance } from '@/types/api';

interface BalanceCardProps {
  balance: TokenBalance;
  onClick?: () => void;
}

export function BalanceCard({ balance, onClick }: BalanceCardProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-4 bg-dark-800 rounded-xl ${
        onClick ? 'cursor-pointer hover:bg-dark-700 transition-colors' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Token Logo */}
        <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center">
          {balance.logo_url ? (
            <img
              src={balance.logo_url}
              alt={balance.symbol}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <span className="text-sm font-bold">{balance.symbol.slice(0, 2)}</span>
          )}
        </div>

        {/* Token Info */}
        <div>
          <div className="font-medium">{balance.symbol}</div>
          <div className="text-sm text-dark-400">{balance.name || balance.symbol}</div>
        </div>
      </div>

      {/* Balance Info */}
      <div className="text-right">
        <div className="font-medium">{formatBalance(balance.balance)}</div>
        {balance.usd_value && (
          <div className="text-sm text-dark-400">{formatUsd(balance.usd_value)}</div>
        )}
      </div>
    </div>
  );
}

export default BalanceCard;
