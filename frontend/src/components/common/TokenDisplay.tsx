/**
 * Token Display Component
 *
 * Shows token identity with logo, name, symbol, price, and chain badge.
 * Fetches metadata from DexScreener with caching.
 *
 * Step 1 - Token Metadata Layer
 * P0: Stablecoin price sanity guard (same as WalletScan)
 * P0: Telemetry for stablecoin guard triggers (rate-limited)
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  getTokenMeta,
  getTokenMetaSync,
  shortenAddress,
  formatPrice,
  formatPriceChange,
  getChainShortName,
} from '@/services/tokenMeta';
import { type TokenMeta } from '@/stores/tokenMetaStore';

// Telemetry rate-limit: 10 minutes per token+chain
const METRIC_RATE_LIMIT_MS = 10 * 60 * 1000;
const metricsRateLimitCache = new Map<string, number>();

// Emit metric for stablecoin price guard trigger (rate-limited)
function emitStablecoinGuardMetric(data: {
  chainId: number;
  address: string;
  symbol: string;
  rawPriceUsd: number;
  source?: string;
}): void {
  try {
    const key = `${data.chainId}:${data.address.toLowerCase()}`;
    const now = Date.now();
    const lastEmit = metricsRateLimitCache.get(key);

    // Rate limit: once per 10 minutes per token+chain
    if (lastEmit && now - lastEmit < METRIC_RATE_LIMIT_MS) {
      return;
    }

    metricsRateLimitCache.set(key, now);

    const metric = {
      event: 'stablecoin_price_guard_triggered',
      chainId: data.chainId,
      address: data.address.toLowerCase(),
      symbol: data.symbol,
      rawPriceUsd: data.rawPriceUsd,
      displayedPriceUsd: 1.0,
      source: data.source || 'unknown',
      timestamp: now,
    };

    // Debug console log (only when localStorage.debug=true)
    try {
      if (localStorage.getItem('debug') === 'true') {
        console.log('[StablecoinGuard]', metric);
      }
    } catch {
      // Ignore localStorage errors
    }

    // Append to localStorage metrics
    try {
      const metricsKey = 'metrics.stablecoin_guard';
      const existing = localStorage.getItem(metricsKey);
      const entries = existing ? JSON.parse(existing) : [];

      // Keep last 100 entries to avoid localStorage bloat
      if (entries.length >= 100) {
        entries.shift();
      }
      entries.push(metric);

      localStorage.setItem(metricsKey, JSON.stringify(entries));
    } catch {
      // Ignore localStorage errors
    }
  } catch {
    // Silently fail - telemetry should never break the app
  }
}

// P0: Stablecoin detection (shared logic with WalletScan)
function isStablecoin(symbol?: string, name?: string): boolean {
  const s = (symbol || '').toUpperCase();
  const n = (name || '').toUpperCase();

  const KNOWN_STABLES = new Set([
    'USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDP', 'USDD', 'USDE',
    'FRAX', 'LUSD', 'BUSD', 'GUSD', 'USDJ', 'UST', 'CUSD', 'SUSD', 'XUSD'
  ]);

  if (KNOWN_STABLES.has(s)) return true;
  if (s.includes('USD') && !s.includes('DUSK')) return true;
  if (n.includes('USD') || n.includes('DOLLAR') || n.includes('STABLECOIN')) return true;

  return false;
}

// P0: Check if stablecoin price is unreliable (outside 0.90-1.10 range)
function isStablecoinPriceUnreliable(priceUsd: number | null | undefined, symbol?: string, name?: string): boolean {
  if (!isStablecoin(symbol, name)) return false;
  if (priceUsd === null || priceUsd === undefined || priceUsd === 0) return false;
  return priceUsd < 0.90 || priceUsd > 1.10;
}

// P0: Price display with stablecoin sanity guard + telemetry
function PriceDisplay({ meta, smallTextSize, chainId, address }: {
  meta: TokenMeta;
  smallTextSize: string;
  chainId: number;
  address: string;
}) {
  const priceUnreliable = useMemo(() =>
    isStablecoinPriceUnreliable(meta.priceUsd, meta.symbol, meta.name),
    [meta.priceUsd, meta.symbol, meta.name]
  );

  // Track if we've emitted metric for this render
  const emittedRef = useRef(false);

  // Emit telemetry when guard triggers (rate-limited)
  useEffect(() => {
    if (priceUnreliable && meta.priceUsd !== null && !emittedRef.current) {
      emittedRef.current = true;
      emitStablecoinGuardMetric({
        chainId,
        address,
        symbol: meta.symbol || 'UNKNOWN',
        rawPriceUsd: meta.priceUsd,
        source: 'dexscreener', // TokenDisplay uses DexScreener via tokenMeta
      });
    }
  }, [priceUnreliable, meta.priceUsd, meta.symbol, chainId, address]);

  // If stablecoin with unreliable price, show ~$1.00
  const displayPrice = priceUnreliable ? 1.0 : meta.priceUsd;

  return (
    <div className="flex items-center gap-1 ml-auto">
      <span className={`${smallTextSize} text-dark-300`}>
        {formatPrice(displayPrice)}
        {priceUnreliable && <span className="text-yellow-500 ml-0.5">~</span>}
      </span>
      {/* Hide % change for unreliable stablecoin prices */}
      {!priceUnreliable && meta.priceChange24h !== null && (
        <span
          className={`${smallTextSize} ${
            meta.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'
          }`}
        >
          {formatPriceChange(meta.priceChange24h)}
        </span>
      )}
      {/* Show warning for unreliable price */}
      {priceUnreliable && (
        <span
          className="text-[8px] text-yellow-500 px-1 py-0.5 bg-yellow-900/20 rounded"
          title="Source deviates from peg. Fallback applied."
        >
          !
        </span>
      )}
    </div>
  );
}

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

          {/* Price with P0 stablecoin sanity guard + telemetry */}
          {showPrice && meta && (
            <PriceDisplay
              meta={meta}
              smallTextSize={smallTextSize}
              chainId={chainId}
              address={address}
            />
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
