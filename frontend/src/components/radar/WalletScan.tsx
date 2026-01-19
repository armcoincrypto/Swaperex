/**
 * Wallet Scan V3 Component
 *
 * Scans connected wallet OR any public wallet for tokens and provides insights.
 * Features:
 * - Real-time progress states
 * - Instant payoff insights cards
 * - One-click "Add Top 5" to watchlist
 * - Clear explanations for empty states
 * - External wallet scanning (whale watching, research)
 */

import { useState, useCallback, useMemo } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import {
  scanWallet,
  trackAddSelected,
  trackExternalWalletScanned,
  type WalletScanResponse,
  type DiscoveredToken,
  type ScanInsights,
  type ScanDiff,
  type TokenDelta,
  CHAIN_INFO,
  formatUsd,
  formatPercent,
  getPercentColor,
  shortAddress,
} from '@/services/walletScanService';

// Wallet scan mode
type WalletMode = 'connected' | 'external';

// Preset wallets for quick selection
const PRESET_WALLETS: { name: string; address: string; description: string }[] = [
  {
    name: 'Binance Hot Wallet',
    address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
    description: 'Major CEX wallet',
  },
  {
    name: 'Wintermute',
    address: '0x0000000000007F150Bd6f54c40A34d7C3d5e9f56',
    description: 'Market maker',
  },
  {
    name: 'Jump Trading',
    address: '0xf584F8728B874a6a5c7A8d4d387C9aae9172D621',
    description: 'Trading firm',
  },
  {
    name: 'BSC Whale',
    address: '0xe2fc31F816A9b94326492132018C3aEcC4a93aE1',
    description: 'Known BNB holder',
  },
];

// Validate Ethereum address format
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

interface WalletScanProps {
  className?: string;
}

// Scan progress stages
type ScanStage = 'idle' | 'connecting' | 'fetching' | 'pricing' | 'filtering' | 'complete' | 'error';

const STAGE_LABELS: Record<ScanStage, string> = {
  idle: 'Ready to scan',
  connecting: 'Connecting to provider...',
  fetching: 'Fetching token balances...',
  pricing: 'Getting prices...',
  filtering: 'Filtering spam tokens...',
  complete: 'Scan complete',
  error: 'Scan failed',
};

// Skeleton loader for tokens
function TokenSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 bg-dark-700/50 rounded-lg animate-pulse">
      <div className="w-8 h-8 bg-dark-600 rounded-full" />
      <div className="flex-1">
        <div className="h-3 bg-dark-600 rounded w-20 mb-1" />
        <div className="h-2 bg-dark-600 rounded w-16" />
      </div>
      <div className="text-right">
        <div className="h-3 bg-dark-600 rounded w-14 mb-1" />
        <div className="h-2 bg-dark-600 rounded w-10" />
      </div>
    </div>
  );
}

// Insight card component
function InsightCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-dark-700/50 rounded-lg p-3 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-dark-400 mb-2">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

// Token row component
function TokenRow({
  token,
  selected,
  onToggle,
  showCheckbox = true,
}: {
  token: DiscoveredToken;
  selected: boolean;
  onToggle: () => void;
  showCheckbox?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer ${
        selected ? 'bg-primary-600/20 border border-primary-600/30' : 'bg-dark-700/30 hover:bg-dark-700/50'
      }`}
      onClick={onToggle}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-4 h-4 rounded border-dark-500 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {token.logo ? (
        <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center text-xs font-medium">
          {token.symbol.slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-dark-100 truncate">{token.symbol}</div>
        <div className="text-[10px] text-dark-500 truncate">{token.name}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium text-dark-200">
          {token.valueUsd ? formatUsd(token.valueUsd) : '-'}
        </div>
        {token.percentChange24h !== undefined && (
          <div className={`text-[10px] ${getPercentColor(token.percentChange24h)}`}>
            {formatPercent(token.percentChange24h)}
          </div>
        )}
      </div>
    </div>
  );
}

// Empty state component
function EmptyState({
  reason,
  chainSuggestion,
  onSwitchChain,
}: {
  reason: string;
  chainSuggestion?: string;
  onSwitchChain?: () => void;
}) {
  return (
    <div className="text-center py-6">
      <div className="text-4xl mb-3">📭</div>
      <div className="text-sm text-dark-300 mb-2">{reason}</div>
      {chainSuggestion && (
        <div className="text-xs text-dark-500 mb-3">{chainSuggestion}</div>
      )}
      {onSwitchChain && (
        <button
          onClick={onSwitchChain}
          className="text-xs text-primary-400 hover:text-primary-300"
        >
          Try another chain
        </button>
      )}
    </div>
  );
}

// Insights panel component
function InsightsPanel({ insights }: { insights: ScanInsights }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {/* Biggest Position */}
      {insights.biggestPosition && (
        <InsightCard title="Biggest Position" icon="👑">
          <div className="flex items-center gap-2">
            {insights.biggestPosition.token.logo ? (
              <img
                src={insights.biggestPosition.token.logo}
                alt={insights.biggestPosition.token.symbol}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center text-[10px]">
                {insights.biggestPosition.token.symbol.slice(0, 2)}
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-dark-100">
                {insights.biggestPosition.token.symbol}
              </div>
              <div className="text-[10px] text-dark-500">
                {insights.biggestPosition.reason}
              </div>
            </div>
          </div>
        </InsightCard>
      )}

      {/* Most Volatile */}
      {insights.mostVolatile && (
        <InsightCard title="Most Active" icon="📈">
          <div className="flex items-center gap-2">
            {insights.mostVolatile.token.logo ? (
              <img
                src={insights.mostVolatile.token.logo}
                alt={insights.mostVolatile.token.symbol}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center text-[10px]">
                {insights.mostVolatile.token.symbol.slice(0, 2)}
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-dark-100">
                {insights.mostVolatile.token.symbol}
              </div>
              <div className={`text-[10px] ${getPercentColor(insights.mostVolatile.token.percentChange24h)}`}>
                {insights.mostVolatile.reason}
              </div>
            </div>
          </div>
        </InsightCard>
      )}

      {/* New Tokens */}
      {insights.newTokens && insights.newTokens.count > 0 && (
        <InsightCard title="New Tokens" icon="✨">
          <div className="text-sm font-medium text-dark-100">
            {insights.newTokens.count} token{insights.newTokens.count > 1 ? 's' : ''}
          </div>
          <div className="text-[10px] text-dark-500">
            Recently acquired
          </div>
        </InsightCard>
      )}

      {/* Unpriced Tokens */}
      {insights.unpricedTokens && insights.unpricedTokens.count > 0 && (
        <InsightCard title="Unpriced" icon="❓">
          <div className="text-sm font-medium text-dark-100">
            {insights.unpricedTokens.count} token{insights.unpricedTokens.count > 1 ? 's' : ''}
          </div>
          <div className="text-[10px] text-dark-500">
            {insights.unpricedTokens.reason}
          </div>
        </InsightCard>
      )}
    </div>
  );
}

// Format time ago string
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Diff change row component
function DiffChangeRow({
  type,
  token,
}: {
  type: 'added' | 'removed' | 'increased' | 'decreased';
  token: TokenDelta;
}) {
  const icons: Record<string, string> = {
    added: '🟢',
    removed: '🔴',
    increased: '🔼',
    decreased: '🔽',
  };

  const labels: Record<string, string> = {
    added: 'New',
    removed: 'Gone',
    increased: 'More',
    decreased: 'Less',
  };

  const valueDisplay = type === 'removed'
    ? token.prevValueUsd ? formatUsd(token.prevValueUsd) : '-'
    : token.valueUsd ? formatUsd(token.valueUsd) : '-';

  const changeDisplay = token.valueChange
    ? `${token.valueChange > 0 ? '+' : ''}${formatUsd(Math.abs(token.valueChange))}`
    : null;

  return (
    <div className="flex items-center gap-2 py-1.5 text-xs">
      <span className="w-4 text-center">{icons[type]}</span>
      <span className="text-dark-400 w-10">{labels[type]}</span>
      <span className="flex-1 text-dark-200 font-medium truncate">{token.symbol}</span>
      <span className="text-dark-400">{valueDisplay}</span>
      {changeDisplay && type !== 'added' && type !== 'removed' && (
        <span className={`text-[10px] ${token.valueChange && token.valueChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
          ({changeDisplay})
        </span>
      )}
    </div>
  );
}

// Diff panel component
function DiffPanel({ diff }: { diff: ScanDiff }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalChanges =
    diff.added.length + diff.removed.length + diff.increased.length + diff.decreased.length;

  if (totalChanges === 0) {
    return (
      <div className="mb-3 p-2 bg-dark-700/30 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-dark-500">
          <span>📊</span>
          <span>No changes since last scan</span>
          {diff.previousScanTime && (
            <span className="ml-auto">{formatTimeAgo(diff.previousScanTime)}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 bg-dark-700/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2 hover:bg-dark-700/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs">
          <span>📊</span>
          <span className="text-dark-300">Changes since last scan</span>
          <span className="text-primary-400">({totalChanges})</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-dark-500">
          {diff.previousScanTime && <span>{formatTimeAgo(diff.previousScanTime)}</span>}
          <span>{isExpanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-2 pb-2 border-t border-dark-600/50">
          {/* Added tokens */}
          {diff.added.length > 0 && (
            <div className="mt-2">
              {diff.added.slice(0, 5).map((token) => (
                <DiffChangeRow key={`added-${token.address}`} type="added" token={token} />
              ))}
              {diff.added.length > 5 && (
                <div className="text-[10px] text-dark-500 pl-6">
                  +{diff.added.length - 5} more added
                </div>
              )}
            </div>
          )}

          {/* Removed tokens */}
          {diff.removed.length > 0 && (
            <div className="mt-2">
              {diff.removed.slice(0, 5).map((token) => (
                <DiffChangeRow key={`removed-${token.address}`} type="removed" token={token} />
              ))}
              {diff.removed.length > 5 && (
                <div className="text-[10px] text-dark-500 pl-6">
                  +{diff.removed.length - 5} more removed
                </div>
              )}
            </div>
          )}

          {/* Increased tokens */}
          {diff.increased.length > 0 && (
            <div className="mt-2">
              {diff.increased.slice(0, 5).map((token) => (
                <DiffChangeRow key={`increased-${token.address}`} type="increased" token={token} />
              ))}
              {diff.increased.length > 5 && (
                <div className="text-[10px] text-dark-500 pl-6">
                  +{diff.increased.length - 5} more increased
                </div>
              )}
            </div>
          )}

          {/* Decreased tokens */}
          {diff.decreased.length > 0 && (
            <div className="mt-2">
              {diff.decreased.slice(0, 5).map((token) => (
                <DiffChangeRow key={`decreased-${token.address}`} type="decreased" token={token} />
              ))}
              {diff.decreased.length > 5 && (
                <div className="text-[10px] text-dark-500 pl-6">
                  +{diff.decreased.length - 5} more decreased
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WalletScan({ className = '' }: WalletScanProps) {
  const isConnected = useWalletStore((s) => s.isConnected);
  const walletAddress = useWalletStore((s) => s.address);
  const currentChainId = useWalletStore((s) => s.chainId);

  const watchlistTokens = useWatchlistStore((s) => s.tokens);
  const addToken = useWatchlistStore((s) => s.addToken);
  const hasToken = useWatchlistStore((s) => s.hasToken);

  // Wallet mode state
  const [walletMode, setWalletMode] = useState<WalletMode>('connected');
  const [externalAddress, setExternalAddress] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  // Scan state
  const [stage, setStage] = useState<ScanStage>('idle');
  const [scanResult, setScanResult] = useState<WalletScanResponse | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI state - filtering and pagination
  const [hideNoLogo, setHideNoLogo] = useState(true);
  const [visibleCount, setVisibleCount] = useState(20);
  const PAGE_SIZE = 20;

  // Chain info
  const chainInfo = CHAIN_INFO[currentChainId] || { name: `Chain ${currentChainId}`, symbol: 'ETH', color: '#888' };
  const watchlistFull = watchlistTokens.length >= 20;
  const availableSlots = 20 - watchlistTokens.length;

  // Determine which wallet to scan
  const targetWallet = useMemo(() => {
    if (walletMode === 'connected') {
      return walletAddress || '';
    }
    return externalAddress.trim();
  }, [walletMode, walletAddress, externalAddress]);

  // Check if scan is ready
  const canScan = useMemo(() => {
    if (walletMode === 'connected') {
      return isConnected && !!walletAddress;
    }
    return isValidAddress(externalAddress.trim());
  }, [walletMode, isConnected, walletAddress, externalAddress]);

  // Is this an external wallet scan?
  const isExternalScan = walletMode === 'external';

  // Filter tokens that are already in watchlist
  const getFilteredTokens = useCallback(
    (tokens: DiscoveredToken[]): DiscoveredToken[] => {
      return tokens.filter((t) => !hasToken(t.chainId, t.address));
    },
    [hasToken],
  );

  // Handle scan
  const handleScan = useCallback(async () => {
    if (!canScan || !targetWallet) return;

    setStage('connecting');
    setErrorMessage(null);
    setScanResult(null);
    setSelectedTokens(new Set());
    setVisibleCount(PAGE_SIZE); // Reset pagination on new scan

    // Set up progress timers (will be overridden when scan completes)
    const timer1 = setTimeout(() => setStage((s) => s === 'connecting' ? 'fetching' : s), 300);
    const timer2 = setTimeout(() => setStage((s) => s === 'fetching' ? 'pricing' : s), 800);
    const timer3 = setTimeout(() => setStage((s) => s === 'pricing' ? 'filtering' : s), 1500);

    try {
      const result = await scanWallet({
        chainId: currentChainId,
        wallet: targetWallet,
        minUsd: 1,
        strict: false,
        provider: 'auto',
      });

      // Clear fake progress timers
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      setScanResult(result);
      setLastScanTime(Date.now());

      // Track external wallet scan for metrics
      if (isExternalScan) {
        await trackExternalWalletScanned(currentChainId, targetWallet);
      }

      if (result.error) {
        setStage('error');
        setErrorMessage(result.error);
      } else {
        setStage('complete');

        // Auto-select top 5 tokens that aren't in watchlist
        const filtered = getFilteredTokens(result.tokens);
        const topFive = filtered.slice(0, Math.min(5, availableSlots));
        setSelectedTokens(new Set(topFive.map((t) => t.address)));
      }
    } catch (err) {
      // Clear fake progress timers
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      setStage('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  }, [canScan, targetWallet, currentChainId, isExternalScan, getFilteredTokens, availableSlots]);

  // Handle add selected tokens
  const handleAddSelected = useCallback(async () => {
    if (!scanResult) return;

    const tokensToAdd = scanResult.tokens.filter((t) => selectedTokens.has(t.address));
    let addedCount = 0;

    for (const token of tokensToAdd) {
      const success = addToken({
        chainId: token.chainId,
        address: token.address,
        symbol: token.symbol,
      });
      if (success) addedCount++;
    }

    // Track the addition for metrics (including source: connected vs external)
    await trackAddSelected(selectedTokens.size, addedCount, {
      minUsd: 1,
      provider: scanResult.provider,
      strict: false,
      chainId: currentChainId,
      filteredSpam: scanResult.stats.spamFiltered,
      source: isExternalScan ? 'external' : 'connected',
    });

    // Clear selection and update state
    setSelectedTokens(new Set());

    // Show success feedback
    if (addedCount > 0) {
      // Force re-render to update "already watching" state
      setScanResult({ ...scanResult });
    }
  }, [scanResult, selectedTokens, addToken, currentChainId, isExternalScan]);

  // Toggle token selection
  const toggleToken = useCallback((address: string) => {
    setSelectedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else if (next.size < availableSlots) {
        next.add(address);
      }
      return next;
    });
  }, [availableSlots]);

  // Select/deselect all
  const toggleSelectAll = useCallback(() => {
    if (!scanResult) return;

    const filtered = getFilteredTokens(scanResult.tokens);
    const allSelected = filtered.every((t) => selectedTokens.has(t.address));

    if (allSelected) {
      setSelectedTokens(new Set());
    } else {
      const toSelect = filtered.slice(0, availableSlots);
      setSelectedTokens(new Set(toSelect.map((t) => t.address)));
    }
  }, [scanResult, selectedTokens, getFilteredTokens, availableSlots]);

  // Get filtered and categorized tokens
  const { displayTokens, unpricedCount } = useMemo(() => {
    if (!scanResult) {
      return { displayTokens: [], unpricedCount: 0 };
    }

    // Start with tokens not already in watchlist
    const notInWatchlist = getFilteredTokens(scanResult.tokens);

    // Separate priced vs unpriced
    const priced = notInWatchlist.filter((t) => t.hasPricing && t.valueUsd && t.valueUsd > 0);
    const unpriced = notInWatchlist.filter((t) => !t.hasPricing || !t.valueUsd || t.valueUsd === 0);

    // Sort priced by value (highest first)
    priced.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

    // Apply filters for display
    let filtered = priced;
    if (hideNoLogo) {
      filtered = filtered.filter((t) => !!t.logo);
    }

    return {
      displayTokens: filtered,
      unpricedCount: unpriced.length,
    };
  }, [scanResult, getFilteredTokens, hideNoLogo]);

  // Paginated tokens for display
  const visibleTokens = displayTokens.slice(0, visibleCount);
  const hasMoreTokens = displayTokens.length > visibleCount;
  const hiddenByLogoFilter = useMemo(() => {
    if (!scanResult) return 0;
    const notInWatchlist = getFilteredTokens(scanResult.tokens);
    const priced = notInWatchlist.filter((t) => t.hasPricing && t.valueUsd && t.valueUsd > 0);
    return priced.filter((t) => !t.logo).length;
  }, [scanResult, getFilteredTokens]);

  // Get empty state reason
  const getEmptyReason = (): string => {
    if (!scanResult) return '';

    if (scanResult.error) {
      if (scanResult.error.includes('rate')) return 'Provider rate-limited. Try again in a moment.';
      if (scanResult.error.includes('API')) return 'Provider API error. Please try again.';
      return scanResult.error;
    }

    if (scanResult.stats.tokensDiscovered === 0) {
      return 'No token transfers found on this chain.';
    }

    if (scanResult.stats.spamFiltered === scanResult.stats.tokensDiscovered) {
      return 'All tokens were filtered as spam.';
    }

    if (displayTokens.length === 0 && scanResult.tokens.length > 0) {
      return 'All discovered tokens are already in your watchlist.';
    }

    if (scanResult.stats.tokensFiltered === 0) {
      return 'No tokens above minimum value threshold ($1).';
    }

    return 'No tokens found.';
  };

  // Handle preset wallet selection
  const handlePresetSelect = useCallback((address: string) => {
    setExternalAddress(address);
    setShowPresets(false);
  }, []);

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔎</span>
          <h3 className="text-sm font-medium text-dark-200">Wallet Scan</h3>
        </div>
        {lastScanTime && stage === 'complete' && (
          <div className="flex items-center gap-1.5 text-[10px] text-dark-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>{scanResult?.cached ? 'Cached' : 'Fresh'}</span>
          </div>
        )}
      </div>

      {/* Wallet Mode Selector */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => { setWalletMode('connected'); setStage('idle'); setScanResult(null); }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            walletMode === 'connected'
              ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
              : 'bg-dark-700/50 text-dark-400 hover:bg-dark-700'
          }`}
        >
          My Wallet
        </button>
        <button
          onClick={() => { setWalletMode('external'); setStage('idle'); setScanResult(null); }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            walletMode === 'external'
              ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
              : 'bg-dark-700/50 text-dark-400 hover:bg-dark-700'
          }`}
        >
          Any Wallet
        </button>
      </div>

      {/* External wallet input (only show in external mode) */}
      {walletMode === 'external' && (
        <div className="mb-3">
          <div className="relative">
            <input
              type="text"
              value={externalAddress}
              onChange={(e) => setExternalAddress(e.target.value)}
              placeholder="0x... (paste any wallet address)"
              className={`w-full px-3 py-2.5 bg-dark-700/50 border rounded-lg text-sm text-dark-200 placeholder-dark-500 focus:outline-none focus:ring-1 ${
                externalAddress && !isValidAddress(externalAddress)
                  ? 'border-red-500/50 focus:ring-red-500/50'
                  : 'border-dark-600 focus:ring-primary-500/50'
              }`}
            />
            {externalAddress && (
              <button
                onClick={() => setExternalAddress('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 p-1"
              >
                ✕
              </button>
            )}
          </div>
          {externalAddress && !isValidAddress(externalAddress) && (
            <div className="text-[10px] text-red-400 mt-1">
              Invalid address (must be 42 chars: 0x + 40 hex)
            </div>
          )}

          {/* Preset wallets toggle */}
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="mt-2 text-[10px] text-dark-500 hover:text-dark-300 flex items-center gap-1"
          >
            <span>📋</span>
            <span>{showPresets ? 'Hide presets' : 'Quick picks (whale wallets)'}</span>
          </button>

          {/* Preset wallet list */}
          {showPresets && (
            <div className="mt-2 space-y-1">
              {PRESET_WALLETS.map((preset) => (
                <button
                  key={preset.address}
                  onClick={() => handlePresetSelect(preset.address)}
                  className="w-full flex items-center justify-between p-2 bg-dark-700/30 hover:bg-dark-700/50 rounded-lg transition-colors text-left"
                >
                  <div>
                    <div className="text-xs text-dark-200">{preset.name}</div>
                    <div className="text-[10px] text-dark-500">{preset.description}</div>
                  </div>
                  <div className="text-[10px] text-dark-600 font-mono">
                    {shortAddress(preset.address)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Read-only notice */}
          <div className="mt-2 text-[10px] text-dark-600 flex items-center gap-1">
            <span>🔒</span>
            <span>Read-only. No private key access.</span>
          </div>
        </div>
      )}

      {/* Chain indicator */}
      <div className="flex items-center gap-2 mb-4 p-2 bg-dark-700/50 rounded-lg">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: chainInfo.color }}
        />
        <span className="text-xs text-dark-300">Scanning on {chainInfo.name}</span>
        {scanResult && scanResult.stats.tokensFiltered > 0 && (
          <span className="ml-auto text-xs text-dark-500">
            {formatUsd(scanResult.insights?.totalValueUsd || 0)} total
          </span>
        )}
      </div>

      {/* Not ready to scan state */}
      {!canScan ? (
        <div className="flex items-center justify-center py-8 text-dark-500 text-xs">
          <span>
            {walletMode === 'connected'
              ? 'Connect your wallet to scan for tokens'
              : 'Enter a valid wallet address to scan'}
          </span>
        </div>
      ) : stage === 'idle' || stage === 'error' ? (
        /* Idle / Error state - show scan button */
        <>
          {errorMessage && (
            <div className="mb-3 p-2 bg-red-900/20 border border-red-900/30 rounded-lg text-xs text-red-400">
              {errorMessage}
            </div>
          )}
          <button
            onClick={handleScan}
            disabled={watchlistFull}
            className={`w-full py-3 rounded-lg text-sm font-medium transition-all ${
              watchlistFull
                ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                : 'bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 border border-primary-600/30 hover:scale-[1.01]'
            }`}
          >
            {watchlistFull ? (
              'Watchlist full (20/20)'
            ) : (
              <>
                <span>{isExternalScan ? 'Scan Wallet' : 'Scan My Wallet'}</span>
                <span className="ml-2 text-dark-500 text-xs">
                  ({availableSlots} slots available)
                </span>
              </>
            )}
          </button>
        </>
      ) : stage !== 'complete' ? (
        /* Scanning state - show progress */
        <div className="py-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-dark-300 text-sm">{STAGE_LABELS[stage]}</span>
          </div>
          {/* Skeleton loaders */}
          <div className="space-y-2">
            <TokenSkeleton />
            <TokenSkeleton />
            <TokenSkeleton />
          </div>
        </div>
      ) : displayTokens.length === 0 ? (
        /* Empty state */
        <EmptyState
          reason={getEmptyReason()}
          chainSuggestion={scanResult?.insights?.chainSuggestion}
          onSwitchChain={() => setStage('idle')}
        />
      ) : (
        /* Results state */
        <>
          {/* Insights */}
          {scanResult?.insights && (
            <InsightsPanel insights={scanResult.insights} />
          )}

          {/* Changes since last scan (V4 Diff) */}
          {scanResult?.diff && (
            <DiffPanel diff={scanResult.diff} />
          )}

          {/* Filter controls */}
          <div className="flex items-center gap-3 mb-3 p-2 bg-dark-700/30 rounded-lg">
            <span className="text-[10px] text-dark-500">Filters:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hideNoLogo}
                onChange={(e) => setHideNoLogo(e.target.checked)}
                className="w-3 h-3 rounded border-dark-500 bg-dark-700 text-primary-500"
              />
              <span className="text-[10px] text-dark-400">Hide no logo</span>
            </label>
            {hiddenByLogoFilter > 0 && hideNoLogo && (
              <span className="text-[10px] text-dark-600">({hiddenByLogoFilter} hidden)</span>
            )}
          </div>

          {/* Token list header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-dark-300 font-medium">
                Top Holdings
              </span>
              <span className="text-[10px] text-dark-500">
                {displayTokens.length} tokens
              </span>
              {selectedTokens.size > 0 && (
                <span className="text-[10px] text-primary-400">
                  ({selectedTokens.size} selected)
                </span>
              )}
            </div>
            <button
              onClick={toggleSelectAll}
              className="text-[10px] text-dark-500 hover:text-dark-300"
            >
              {displayTokens.length > 0 && displayTokens.every((t) => selectedTokens.has(t.address))
                ? 'Deselect all'
                : 'Select all'}
            </button>
          </div>

          {/* Token list */}
          <div className="space-y-1.5 mb-3">
            {visibleTokens.map((token) => (
              <TokenRow
                key={token.address}
                token={token}
                selected={selectedTokens.has(token.address)}
                onToggle={() => toggleToken(token.address)}
              />
            ))}
          </div>

          {/* Show more / pagination button */}
          {hasMoreTokens && (
            <button
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="w-full py-2 text-xs text-dark-400 hover:text-dark-300 bg-dark-700/30 hover:bg-dark-700/50 rounded-lg transition-colors"
            >
              Show {Math.min(PAGE_SIZE, displayTokens.length - visibleCount)} more ({displayTokens.length - visibleCount} remaining)
            </button>
          )}

          {/* Unpriced tokens summary (collapsed) */}
          {unpricedCount > 0 && (
            <div className="mt-3 p-2 bg-dark-700/20 rounded-lg">
              <div className="flex items-center gap-2 text-[10px] text-dark-500">
                <span>❓</span>
                <span>{unpricedCount} tokens have no price data and are hidden</span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAddSelected}
              disabled={selectedTokens.size === 0}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                selectedTokens.size === 0
                  ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-500'
              }`}
            >
              Add {selectedTokens.size > 0 ? selectedTokens.size : ''} to Watchlist
            </button>
            <button
              onClick={handleScan}
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors"
            >
              Rescan
            </button>
          </div>
        </>
      )}

      {/* Scanned wallet info */}
      {targetWallet && (
        <div className="mt-3 pt-3 border-t border-dark-700/50 flex items-center justify-between text-[10px]">
          <span className="text-dark-500">
            {isExternalScan ? 'Viewing:' : 'Connected:'}
          </span>
          <span className="text-dark-400 font-mono">{shortAddress(targetWallet)}</span>
        </div>
      )}

      {/* Stats footer (only show after scan) */}
      {scanResult && stage === 'complete' && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-dark-600">
          <span>Provider: {scanResult.provider}</span>
          <span>{scanResult.stats.durationMs}ms</span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline scan button for header areas
 */
interface WalletScanButtonProps {
  onClick?: () => void;
  className?: string;
}

export function WalletScanButton({ onClick, className = '' }: WalletScanButtonProps) {
  const isConnected = useWalletStore((s) => s.isConnected);

  if (!isConnected) return null;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-300 rounded-lg text-xs transition-colors ${className}`}
    >
      <span>🔎</span>
      <span>Scan Wallet</span>
    </button>
  );
}

export default WalletScan;
