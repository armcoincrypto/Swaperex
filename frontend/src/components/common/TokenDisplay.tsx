/**
 * Token Display Component
 *
 * Shows token identity with logo, name, symbol, price, and chain badge.
 * Fetches metadata from DexScreener with caching.
 *
 * Step 1 - Token Metadata Layer
 */

import { useState, useEffect } from 'react';
import {
  getTokenMeta,
  getTokenMetaSync,
  shortenAddress,
  formatPrice,
  formatPriceChange,
  getChainShortName,
} from '@/services/tokenMeta';
import { type TokenMeta } from '@/stores/tokenMetaStore';

interface TokenDisplayProps {
  chainId: number;
  address: string;
  /** Known symbol (used as fallback) */
  symbol?: string;
  /** Show price info */
  showPrice?: boolean;
  /** Show chain badge */
  showChain?: boolean;
  /** Show copy button */
  showCopy?: boolean;
  /** Compact mode (smaller text) */
  compact?: boolean;
  /** Extra small mode (even smaller) */
  tiny?: boolean;
  /** Custom className */
  className?: string;
  /** Called when copy is successful */
  onCopy?: () => void;
}

export function TokenDisplay({
  chainId,
  address,
  symbol,
  showPrice = false,
  showChain = false,
  showCopy = false,
  compact = false,
  tiny = false,
  className = '',
  onCopy,
}: TokenDisplayProps) {
  // Try sync cache first, then fetch async
  const [meta, setMeta] = useState<TokenMeta | null>(() =>
    getTokenMetaSync(chainId, address)
  );
  const [loading, setLoading] = useState(!meta);
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch metadata if not cached
  useEffect(() => {
    if (meta) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getTokenMeta(chainId, address, symbol).then((result) => {
      if (!cancelled) {
        setMeta(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chainId, address, symbol, meta]);

  // Reset image error when address changes
  useEffect(() => {
    setImageError(false);
  }, [address]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn('Failed to copy address');
    }
  };

  // Determine sizes based on mode
  const logoSize = tiny ? 'w-4 h-4' : compact ? 'w-5 h-5' : 'w-6 h-6';
  const textSize = tiny ? 'text-[10px]' : compact ? 'text-xs' : 'text-sm';
  const smallTextSize = tiny ? 'text-[8px]' : compact ? 'text-[10px]' : 'text-xs';

  // Fallback logo with gradient background
  const fallbackLogo = (
    <div
      className={`${logoSize} rounded-full bg-gradient-to-br from-dark-600 to-dark-700 flex items-center justify-center`}
    >
      <span className={`${smallTextSize} text-dark-400 font-bold`}>
        {(meta?.symbol || symbol || '?').slice(0, 2).toUpperCase()}
      </span>
    </div>
  );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Logo */}
      <div className={`${logoSize} flex-shrink-0`}>
        {loading ? (
          <div className={`${logoSize} rounded-full bg-dark-700 animate-pulse`} />
        ) : meta?.logoUrl && !imageError ? (
          <img
            src={meta.logoUrl}
            alt={meta.symbol || 'Token'}
            className={`${logoSize} rounded-full object-cover bg-dark-700`}
            onError={() => setImageError(true)}
          />
        ) : (
          fallbackLogo
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Symbol/Name */}
          {loading ? (
            <div className="h-4 w-16 bg-dark-700 rounded animate-pulse" />
          ) : (
            <>
              <span className={`${textSize} font-medium text-dark-200 truncate`}>
                {meta?.symbol || symbol || shortenAddress(address)}
              </span>
              {meta?.name && meta.name !== meta.symbol && (
                <span className={`${smallTextSize} text-dark-500 truncate hidden sm:inline`}>
                  {meta.name}
                </span>
              )}
            </>
          )}

          {/* Chain Badge */}
          {showChain && (
            <span
              className={`px-1 py-0.5 bg-dark-700 text-dark-400 ${smallTextSize} rounded font-medium flex-shrink-0`}
            >
              {getChainShortName(chainId)}
            </span>
          )}
        </div>

        {/* Address + Price Row */}
        <div className="flex items-center gap-2">
          {/* Address */}
          <span className={`${smallTextSize} text-dark-500 font-mono`}>
            {shortenAddress(address)}
          </span>

          {/* Copy Button */}
          {showCopy && (
            <button
              onClick={handleCopy}
              className={`${smallTextSize} text-dark-600 hover:text-dark-400 transition-colors`}
              title="Copy address"
            >
              {copied ? '✓' : '⎘'}
            </button>
          )}

          {/* Price */}
          {showPrice && meta && (
            <div className="flex items-center gap-1 ml-auto">
              <span className={`${smallTextSize} text-dark-300`}>
                {formatPrice(meta.priceUsd)}
              </span>
              {meta.priceChange24h !== null && (
                <span
                  className={`${smallTextSize} ${
                    meta.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {formatPriceChange(meta.priceChange24h)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline Token Badge - Compact token display for lists
 */
interface TokenBadgeProps {
  chainId: number;
  address: string;
  symbol?: string;
  showChain?: boolean;
  className?: string;
}

export function TokenBadge({
  chainId,
  address,
  symbol,
  showChain = false,
  className = '',
}: TokenBadgeProps) {
  const [meta, setMeta] = useState<TokenMeta | null>(() =>
    getTokenMetaSync(chainId, address)
  );
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (meta) return;
    getTokenMeta(chainId, address, symbol).then(setMeta);
  }, [chainId, address, symbol, meta]);

  useEffect(() => {
    setImageError(false);
  }, [address]);

  const displaySymbol = meta?.symbol || symbol || shortenAddress(address);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {/* Mini Logo */}
      {meta?.logoUrl && !imageError ? (
        <img
          src={meta.logoUrl}
          alt={displaySymbol}
          className="w-3.5 h-3.5 rounded-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full bg-dark-600 flex items-center justify-center text-[8px] text-dark-400 font-bold">
          {displaySymbol.slice(0, 1)}
        </span>
      )}

      {/* Symbol */}
      <span className="text-dark-200 font-medium">{displaySymbol}</span>

      {/* Chain */}
      {showChain && (
        <span className="text-dark-500 text-[10px]">
          ({getChainShortName(chainId)})
        </span>
      )}
    </span>
  );
}

/**
 * Token Logo Only - Just the logo with fallback
 */
interface TokenLogoProps {
  chainId: number;
  address: string;
  symbol?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function TokenLogo({
  chainId,
  address,
  symbol,
  size = 'md',
  className = '',
}: TokenLogoProps) {
  const [meta, setMeta] = useState<TokenMeta | null>(() =>
    getTokenMetaSync(chainId, address)
  );
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (meta) return;
    getTokenMeta(chainId, address, symbol).then(setMeta);
  }, [chainId, address, symbol, meta]);

  useEffect(() => {
    setImageError(false);
  }, [address]);

  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const sizeClass = sizeClasses[size];
  const displaySymbol = meta?.symbol || symbol || '?';

  if (meta?.logoUrl && !imageError) {
    return (
      <img
        src={meta.logoUrl}
        alt={displaySymbol}
        className={`${sizeClass} rounded-full object-cover bg-dark-700 ${className}`}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br from-dark-600 to-dark-700 flex items-center justify-center ${className}`}
    >
      <span className="text-[10px] text-dark-400 font-bold">
        {displaySymbol.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

export default TokenDisplay;
