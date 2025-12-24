/**
 * Pair Item Component
 *
 * Displays a single trending pair with price, liquidity, volume, and safety signals.
 * Click to navigate to swap.
 */

import { useState } from 'react';
import {
  type TrendingPair,
  formatPrice,
  formatLargeNumber,
  getChainDisplayName,
  getChainColor,
} from '@/services/pairDiscovery';
import { OverallRiskBadge } from '@/components/common/TokenSafetyBadges';

interface PairItemProps {
  pair: TrendingPair;
  isNew?: boolean;
  onClick: (pair: TrendingPair) => void;
}

export function PairItem({ pair, isNew = false, onClick }: PairItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const priceChange1h = pair.priceChange.h1;
  const priceChange24h = pair.priceChange.h24;

  // Determine card styling based on pair state
  const getCardStyles = () => {
    if (pair.isHot) {
      return 'border-yellow-700 bg-yellow-900/10';
    }
    if (pair.volumeSpike1h) {
      return 'border-green-700 bg-green-900/10';
    }
    return 'border-dark-700 bg-dark-800';
  };

  return (
    <div
      className={`relative p-4 rounded-xl border transition-all cursor-pointer hover:scale-[1.01] ${getCardStyles()}`}
      onClick={() => onClick(pair)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* New badge */}
      {isNew && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-primary-500 text-white text-xs font-bold rounded-full">
          NEW
        </div>
      )}

      {/* Hot/Spike indicators */}
      {pair.isHot && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-yellow-900/50 text-yellow-400 text-xs rounded">
          <span>🔥</span>
          <span>Hot</span>
        </div>
      )}
      {!pair.isHot && pair.volumeSpike1h && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded">
          <span>📈</span>
          <span>Volume Spike</span>
        </div>
      )}

      {/* Header: Token symbols + Chain */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold">{pair.baseToken.symbol}</span>
            <span className="text-dark-400">/</span>
            <span className="text-sm text-dark-300">{pair.quoteToken.symbol}</span>
          </div>
          <span className={`text-xs px-1.5 py-0.5 rounded ${getChainColor(pair.chainId)} bg-dark-700`}>
            {getChainDisplayName(pair.chainId)}
          </span>
        </div>
        <span className="text-xs text-dark-400">{pair.dexId}</span>
      </div>

      {/* Price + Changes */}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xl font-medium">{formatPrice(pair.priceUsd)}</span>
        <div className="flex items-center gap-2">
          <PriceChangeBadge value={priceChange1h} label="1h" />
          <PriceChangeBadge value={priceChange24h} label="24h" />
        </div>
      </div>

      {/* Stats: Liquidity + Volume */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatBox label="Liquidity" value={formatLargeNumber(pair.liquidity.usd)} />
        <StatBox
          label="Vol 1h"
          value={formatLargeNumber(pair.volume.h1)}
          highlight={pair.volumeSpike1h}
        />
        <StatBox label="Vol 24h" value={formatLargeNumber(pair.volume.h24)} />
      </div>

      {/* Transaction counts */}
      <div className="flex items-center justify-between text-xs text-dark-400 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-green-400">
            {pair.txns.h24.buys} buys
          </span>
          <span className="text-red-400">
            {pair.txns.h24.sells} sells
          </span>
        </div>
        <span>24h txns</span>
      </div>

      {/* Safety Badge (only show on hover to reduce API calls) */}
      {isHovered && pair.baseToken.address && (
        <div className="mt-2 pt-2 border-t border-dark-700">
          <OverallRiskBadge
            contractAddress={pair.baseToken.address}
            chainId={pair.chainId}
          />
        </div>
      )}

      {/* Token name */}
      <div className="text-xs text-dark-400 truncate">
        {pair.baseToken.name}
      </div>
    </div>
  );
}

/**
 * Price change badge with color coding
 */
function PriceChangeBadge({ value, label }: { value: number; label: string }) {
  const isPositive = value > 0;
  const isNeutral = value === 0;

  const colorClass = isNeutral
    ? 'text-dark-400 bg-dark-700'
    : isPositive
    ? 'text-green-400 bg-green-900/30'
    : 'text-red-400 bg-red-900/30';

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colorClass}`}>
      {isPositive ? '+' : ''}
      {value.toFixed(1)}% {label}
    </span>
  );
}

/**
 * Stat box for displaying metrics
 */
function StatBox({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`text-center p-2 rounded-lg ${
        highlight ? 'bg-green-900/20 border border-green-800' : 'bg-dark-700'
      }`}
    >
      <div className="text-xs text-dark-400 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-green-400' : ''}`}>
        {value}
      </div>
    </div>
  );
}

export default PairItem;
