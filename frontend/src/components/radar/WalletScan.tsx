/**
 * Wallet Scan V6 Component
 *
 * Features:
 * - Search by symbol/name
 * - Quick filters: Top 20, $1k+, $10k+, Stablecoins only
 * - Trust tags per token row
 * - Lazy risk score fetching for visible tokens only (cached)
 * - Real-time progress states
 * - Instant payoff insights cards
 * - One-click "Add Top 5" to watchlist
 * - External wallet scanning (whale watching, research)
 * - Change detection (V4 diff)
 * - V6: Diff panel actions: Add NEW, Add TOP INCREASED
 * - V6: Diff filters: Hide stablecoin changes, Min delta filter
 * - V6: Ignore token per row (persisted per wallet+chain)
 *
 * Trust & Safety (P0/P1):
 * - P0: Stablecoin price sanity guard - shows "Price unreliable" if outside 0.90-1.10 range
 * - P1: Diff actions confirmation panel with exclude stablecoins/high-risk options
 * - P1: Risk label shows "loading" -> value -> "Unknown" with 5s timeout
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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

// Backend API base URL for risk fetching - use centralized config
import { getSignalsApiUrl } from '@/utils/apiConfig';
import { isStablecoin, isStablecoinPriceUnreliable } from '@/utils/stablecoin';
import { formatTimeAgo } from '@/utils/time';
import { debugLog } from '@/utils/debug';
const API_BASE = getSignalsApiUrl();

// Wallet scan mode
type WalletMode = 'connected' | 'external';

// Quick filter type
type QuickFilter = 'none' | 'top20' | 'usd1k' | 'usd10k';

// Risk label type
type RiskLabel = 'Low' | 'Medium' | 'High' | 'Unknown' | 'Loading';

// Preset wallets for quick selection with their primary chain
const PRESET_WALLETS: { name: string; address: string; description: string; chainId: number }[] = [
  {
    name: 'Binance Hot Wallet',
    address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
    description: 'Major CEX wallet',
    chainId: 56, // BNB Chain
  },
  {
    name: 'Wintermute',
    address: '0x0000000000007F150Bd6f54c40A34d7C3d5e9f56',
    description: 'Market maker',
    chainId: 1, // Ethereum
  },
  {
    name: 'Jump Trading',
    address: '0xf584F8728B874a6a5c7A8d4d387C9aae9172D621',
    description: 'Trading firm',
    chainId: 1, // Ethereum
  },
  {
    name: 'BSC Whale',
    address: '0xe2fc31F816A9b94326492132018C3aEcC4a93aE1',
    description: 'Known BNB holder',
    chainId: 56, // BNB Chain
  },
];

// Supported chains for dropdown
const SUPPORTED_CHAINS = [1, 56, 8453, 42161] as const;

// Validate Ethereum address format
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Validate logo URL (must be http/https and valid URL structure)
function hasValidLogo(logo: string | undefined): boolean {
  if (!logo || typeof logo !== 'string') return false;
  try {
    const url = new URL(logo);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Get display price for a token (applies stablecoin sanity guard)
// Uses balanceFormatted (human-readable) for correct calculation
function getDisplayPrice(valueUsd: number | undefined, balanceFormatted: string | undefined, symbol?: string, name?: string): {
  displayValue: number | undefined;
  isUnreliable: boolean;
} {
  if (!valueUsd) {
    return { displayValue: valueUsd, isUnreliable: false };
  }

  // Parse formatted balance (human-readable number of tokens)
  const balance = balanceFormatted ? parseFloat(balanceFormatted.replace(/,/g, '')) : 0;
  if (!balance || balance === 0) {
    return { displayValue: valueUsd, isUnreliable: false };
  }

  const pricePerToken = valueUsd / balance;
  const unreliable = isStablecoinPriceUnreliable(pricePerToken, symbol, name);

  if (unreliable) {
    // Use ~$1.00 per token for display (balance is already in human-readable format)
    return { displayValue: balance * 1.0, isUnreliable: true };
  }

  return { displayValue: valueUsd, isUnreliable: false };
}

// LocalStorage keys
const FILTER_STORAGE_KEY = 'walletScan.hideNoLogo';
const EXTERNAL_CHAIN_STORAGE_KEY = 'walletScan.externalChainId';

// Explorer URLs by chain
const CHAIN_EXPLORERS: Record<number, { name: string; url: string }> = {
  1: { name: 'Etherscan', url: 'https://etherscan.io' },
  56: { name: 'BscScan', url: 'https://bscscan.com' },
  8453: { name: 'BaseScan', url: 'https://basescan.org' },
  42161: { name: 'Arbiscan', url: 'https://arbiscan.io' },
};

// Get explorer URL for a wallet address
function getExplorerUrl(chainId: number, address: string): string | null {
  const explorer = CHAIN_EXPLORERS[chainId];
  if (!explorer) return null;
  return `${explorer.url}/address/${address}`;
}

// Load persisted external chain ID
function loadExternalChainId(): number {
  try {
    const stored = localStorage.getItem(EXTERNAL_CHAIN_STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      // Validate it's a supported chain
      if ([1, 56, 8453, 42161].includes(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return 56; // Default to BNB Chain
}

// Save external chain ID
function saveExternalChainId(chainId: number): void {
  try {
    localStorage.setItem(EXTERNAL_CHAIN_STORAGE_KEY, String(chainId));
  } catch {
    // Ignore localStorage errors
  }
}

// V6: Diff panel persistence helpers
function getDiffIgnoreKey(chainId: number, wallet: string): string {
  return `walletScan.diff.ignore::${chainId}::${wallet.toLowerCase()}`;
}

function getDiffFiltersKey(chainId: number, wallet: string): string {
  return `walletScan.diff.filters::${chainId}::${wallet.toLowerCase()}`;
}

interface DiffFilters {
  hideStablecoin: boolean;
  minDeltaUsd: number;
}

const DEFAULT_DIFF_FILTERS: DiffFilters = {
  hideStablecoin: false,
  minDeltaUsd: 1000,
};

function loadIgnoredTokens(chainId: number, wallet: string): Set<string> {
  try {
    const key = getDiffIgnoreKey(chainId, wallet);
    const stored = localStorage.getItem(key);
    if (!stored) return new Set();
    const arr = JSON.parse(stored);
    return new Set(Array.isArray(arr) ? arr.map((a: string) => a.toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

function saveIgnoredTokens(chainId: number, wallet: string, ignored: Set<string>): void {
  try {
    const key = getDiffIgnoreKey(chainId, wallet);
    localStorage.setItem(key, JSON.stringify([...ignored]));
  } catch {
    // Ignore localStorage errors
  }
}

function loadDiffFilters(chainId: number, wallet: string): DiffFilters {
  try {
    const key = getDiffFiltersKey(chainId, wallet);
    const stored = localStorage.getItem(key);
    if (!stored) return DEFAULT_DIFF_FILTERS;
    const parsed = JSON.parse(stored);
    return {
      hideStablecoin: typeof parsed.hideStablecoin === 'boolean' ? parsed.hideStablecoin : DEFAULT_DIFF_FILTERS.hideStablecoin,
      minDeltaUsd: typeof parsed.minDeltaUsd === 'number' ? parsed.minDeltaUsd : DEFAULT_DIFF_FILTERS.minDeltaUsd,
    };
  } catch {
    return DEFAULT_DIFF_FILTERS;
  }
}

function saveDiffFilters(chainId: number, wallet: string, filters: DiffFilters): void {
  try {
    const key = getDiffFiltersKey(chainId, wallet);
    localStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // Ignore localStorage errors
  }
}

// Risk cache for lazy loading
interface RiskCacheEntry {
  label: RiskLabel;
  fetchedAt: number;
}

const RISK_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RISK_CONCURRENCY = 3;
const RISK_FETCH_TIMEOUT_MS = 5000; // P1: 5 second timeout for risk fetch

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

// Trust tag component
function TrustTag({ children, variant = 'default', title }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger'; title?: string }) {
  const colors = {
    default: 'bg-dark-600/50 text-dark-300',
    success: 'bg-green-900/30 text-green-400',
    warning: 'bg-yellow-900/30 text-yellow-400',
    danger: 'bg-red-900/30 text-red-400',
  };

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] ${colors[variant]}`} title={title}>
      {children}
    </span>
  );
}

// Token row component with trust tags
function TokenRow({
  token,
  selected,
  onToggle,
  showCheckbox = true,
  provider,
  riskLabel,
}: {
  token: DiscoveredToken;
  selected: boolean;
  onToggle: () => void;
  showCheckbox?: boolean;
  provider: string;
  riskLabel: RiskLabel;
}) {
  const verifiedLogo = hasValidLogo(token.logo);
  const stable = isStablecoin(token.symbol, token.name);

  // P0: Stablecoin price sanity guard - use balanceFormatted (human-readable)
  const { displayValue, isUnreliable } = useMemo(() => {
    return getDisplayPrice(token.valueUsd, token.balanceFormatted, token.symbol, token.name);
  }, [token.valueUsd, token.balanceFormatted, token.symbol, token.name]);

  // P1: Risk label UX - map Loading to "loading" text
  const riskDisplayText = riskLabel === 'Loading' ? 'loading' : riskLabel;
  const riskVariant = riskLabel === 'High' ? 'danger'
    : riskLabel === 'Medium' ? 'warning'
    : riskLabel === 'Low' ? 'success'
    : 'default';

  return (
    <div
      className={`flex flex-col gap-2 p-2.5 rounded-lg transition-colors cursor-pointer ${
        selected ? 'bg-primary-600/20 border border-primary-600/30' : 'bg-dark-700/30 hover:bg-dark-700/50'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-3">
        {showCheckbox && (
          <input
            type="checkbox"
            id={`token-select-${token.address}`}
            name={`token-select-${token.address}`}
            checked={selected}
            onChange={onToggle}
            className="w-4 h-4 rounded border-dark-500 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${token.symbol}`}
          />
        )}
        {hasValidLogo(token.logo) ? (
          <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center text-xs font-medium">
            {token.symbol.slice(0, 2)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-dark-100 truncate">{token.symbol}</span>
            <span className="text-[10px] text-dark-500 truncate">{token.name}</span>
          </div>
          {/* Trust tags row */}
          <div className="flex flex-wrap gap-1 mt-1">
            <TrustTag>Wallet scan</TrustTag>
            <TrustTag>Priced: {provider}</TrustTag>
            {verifiedLogo && <TrustTag variant="success">Verified logo</TrustTag>}
            {stable && <TrustTag>Stablecoin</TrustTag>}
            {isUnreliable && (
              <TrustTag variant="warning" title="DEX price deviates from peg. Fallback applied.">
                Price unreliable
              </TrustTag>
            )}
            <TrustTag variant={riskVariant} title={riskLabel === 'Unknown' ? 'Risk data unavailable (API slow)' : undefined}>
              Risk: {riskDisplayText}
            </TrustTag>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-dark-200">
            {displayValue ? formatUsd(displayValue) : '-'}
            {isUnreliable && <span className="text-[9px] text-yellow-500 ml-1">~</span>}
          </div>
          {token.percentChange24h !== undefined && !isUnreliable && (
            <div className={`text-[10px] ${getPercentColor(token.percentChange24h)}`}>
              {formatPercent(token.percentChange24h)}
            </div>
          )}
          {isUnreliable && (
            <div className="text-[9px] text-dark-500">peg assumed</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Empty state component with mode-appropriate CTAs
function EmptyState({
  reason,
  chainSuggestion,
  walletMode,
  onChangeChain,
}: {
  reason: string;
  chainSuggestion?: string;
  walletMode: WalletMode;
  onChangeChain?: () => void;
}) {
  return (
    <div className="text-center py-6">
      <div className="text-4xl mb-3">📭</div>
      <div className="text-sm text-dark-300 mb-2">{reason}</div>
      {chainSuggestion && (
        <div className="text-xs text-dark-500 mb-3">{chainSuggestion}</div>
      )}
      {onChangeChain && (
        <button
          onClick={onChangeChain}
          className="text-xs text-primary-400 hover:text-primary-300"
        >
          {walletMode === 'external' ? 'Change chain' : 'Switch your wallet network to scan another chain'}
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
            {hasValidLogo(insights.biggestPosition.token.logo) ? (
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
            {hasValidLogo(insights.mostVolatile.token.logo) ? (
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

// Diff change row component
function DiffChangeRow({
  type,
  token,
  onIgnore,
}: {
  type: 'added' | 'removed' | 'increased' | 'decreased';
  token: TokenDelta;
  onIgnore?: () => void;
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
    <div className="flex items-center gap-2 py-1.5 text-xs group">
      <span className="w-4 text-center">{icons[type]}</span>
      <span className="text-dark-400 w-10">{labels[type]}</span>
      <span className="flex-1 text-dark-200 font-medium truncate">{token.symbol}</span>
      <span className="text-dark-400">{valueDisplay}</span>
      {changeDisplay && type !== 'added' && type !== 'removed' && (
        <span className={`text-[10px] ${token.valueChange && token.valueChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
          ({changeDisplay})
        </span>
      )}
      {onIgnore && (
        <button
          onClick={(e) => { e.stopPropagation(); onIgnore(); }}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-dark-500 hover:text-dark-300 transition-opacity px-1"
          title="Ignore this token"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// V6: Diff panel component with filters and actions
interface DiffPanelProps {
  diff: ScanDiff;
  hideNoLogo: boolean;
  chainId: number;
  targetWallet: string;
  addToken: (token: { chainId: number; address: string; symbol: string }) => boolean;
  hasToken: (chainId: number, address: string) => boolean;
  availableSlots: number;
}

// P1: Confirmation panel state type
interface ConfirmationState {
  type: 'addNew' | 'addTopIncreased';
  tokens: TokenDelta[];
  excludeStablecoins: boolean;
  excludeHighRisk: boolean;
}

function DiffPanel({ diff, hideNoLogo, chainId, targetWallet, addToken, hasToken, availableSlots }: DiffPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // V6: Ignored tokens state (persisted per wallet+chain)
  const [ignoredTokens, setIgnoredTokens] = useState<Set<string>>(() =>
    loadIgnoredTokens(chainId, targetWallet)
  );

  // V6: Diff filter state (persisted per wallet+chain)
  const [diffFilters, setDiffFilters] = useState<DiffFilters>(() =>
    loadDiffFilters(chainId, targetWallet)
  );

  // P1: Confirmation panel state
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);

  // Reload when wallet/chain changes
  useEffect(() => {
    setIgnoredTokens(loadIgnoredTokens(chainId, targetWallet));
    setDiffFilters(loadDiffFilters(chainId, targetWallet));
  }, [chainId, targetWallet]);

  // Helper to ignore a token
  const handleIgnore = useCallback((address: string) => {
    setIgnoredTokens((prev) => {
      const next = new Set(prev);
      next.add(address.toLowerCase());
      saveIgnoredTokens(chainId, targetWallet, next);
      return next;
    });
  }, [chainId, targetWallet]);

  // Helper to clear all ignored tokens
  const handleClearIgnored = useCallback(() => {
    setIgnoredTokens(new Set());
    saveIgnoredTokens(chainId, targetWallet, new Set());
  }, [chainId, targetWallet]);

  // Helper to update filters
  const updateFilter = useCallback((updates: Partial<DiffFilters>) => {
    setDiffFilters((prev) => {
      const next = { ...prev, ...updates };
      saveDiffFilters(chainId, targetWallet, next);
      return next;
    });
  }, [chainId, targetWallet]);

  // Filter diff items by all criteria
  const filteredDiff = useMemo(() => {
    const filterToken = (t: TokenDelta): boolean => {
      // Logo filter
      if (hideNoLogo && !hasValidLogo(t.logo)) return false;
      // Ignored filter
      if (ignoredTokens.has(t.address.toLowerCase())) return false;
      // Stablecoin filter
      if (diffFilters.hideStablecoin && isStablecoin(t.symbol, t.name)) return false;
      // Min delta filter (only for increased/decreased)
      return true;
    };

    const filterWithDelta = (t: TokenDelta): boolean => {
      if (!filterToken(t)) return false;
      // Apply minDelta filter for value changes
      const change = Math.abs(t.valueChange || 0);
      if (diffFilters.minDeltaUsd > 0 && change < diffFilters.minDeltaUsd) return false;
      return true;
    };

    return {
      added: diff.added.filter(filterToken),
      removed: diff.removed.filter(filterToken),
      increased: diff.increased.filter(filterWithDelta),
      decreased: diff.decreased.filter(filterWithDelta),
      previousScanTime: diff.previousScanTime,
    };
  }, [diff, hideNoLogo, ignoredTokens, diffFilters]);

  const totalChanges =
    diff.added.length + diff.removed.length + diff.increased.length + diff.decreased.length;
  const visibleChanges =
    filteredDiff.added.length + filteredDiff.removed.length + filteredDiff.increased.length + filteredDiff.decreased.length;
  const hiddenChanges = totalChanges - visibleChanges;

  // P1: Show confirmation for Add NEW tokens
  const handleAddNewClick = useCallback(() => {
    const toAdd = filteredDiff.added
      .filter((t) => !hasToken(chainId, t.address))
      .slice(0, Math.min(10, availableSlots));
    if (toAdd.length > 0) {
      setConfirmation({
        type: 'addNew',
        tokens: toAdd,
        excludeStablecoins: true,
        excludeHighRisk: true,
      });
    }
  }, [filteredDiff.added, hasToken, chainId, availableSlots]);

  // P1: Show confirmation for Add TOP INCREASED tokens
  const handleAddTopIncreasedClick = useCallback(() => {
    const sorted = [...filteredDiff.increased]
      .filter((t) => !hasToken(chainId, t.address))
      .sort((a, b) => Math.abs(b.valueChange || 0) - Math.abs(a.valueChange || 0));
    const toAdd = sorted.slice(0, Math.min(10, availableSlots));
    if (toAdd.length > 0) {
      setConfirmation({
        type: 'addTopIncreased',
        tokens: toAdd,
        excludeStablecoins: true,
        excludeHighRisk: true,
      });
    }
  }, [filteredDiff.increased, hasToken, chainId, availableSlots]);

  // P1: Execute confirmed add action
  const handleConfirmAdd = useCallback(() => {
    if (!confirmation) return;

    let tokensToAdd = confirmation.tokens;

    // Apply exclusion filters
    if (confirmation.excludeStablecoins) {
      tokensToAdd = tokensToAdd.filter((t) => !isStablecoin(t.symbol, t.name));
    }
    // Note: excludeHighRisk would require risk data in TokenDelta, skip for now
    // as risk is fetched lazily for DiscoveredTokens only

    let addedCount = 0;
    for (const token of tokensToAdd) {
      if (addToken({ chainId, address: token.address, symbol: token.symbol })) {
        addedCount++;
      }
    }

    setConfirmation(null);
    return addedCount;
  }, [confirmation, addToken, chainId]);

  // P1: Cancel confirmation
  const handleCancelConfirm = useCallback(() => {
    setConfirmation(null);
  }, []);

  // Count actionable tokens
  const newTokensNotInWatchlist = filteredDiff.added.filter((t) => !hasToken(chainId, t.address)).length;
  const increasedNotInWatchlist = filteredDiff.increased.filter((t) => !hasToken(chainId, t.address)).length;

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
          <span className="text-primary-400">
            ({visibleChanges}{hiddenChanges > 0 ? ` of ${totalChanges}` : ''})
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-dark-500">
          {diff.previousScanTime && <span>{formatTimeAgo(diff.previousScanTime)}</span>}
          <span>{isExpanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-2 pb-2 border-t border-dark-600/50">
          {/* V6: Diff filters row */}
          <div className="mt-2 flex flex-wrap items-center gap-2 pb-2 border-b border-dark-600/30">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                id="diff-filter-hide-stables"
                name="diff-filter-hide-stables"
                checked={diffFilters.hideStablecoin}
                onChange={(e) => updateFilter({ hideStablecoin: e.target.checked })}
                className="w-3 h-3 rounded border-dark-500 bg-dark-700 text-primary-500"
              />
              <span className="text-[10px] text-dark-400">Hide stables</span>
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-dark-500">Min Δ:</span>
              <select
                value={diffFilters.minDeltaUsd}
                onChange={(e) => updateFilter({ minDeltaUsd: Number(e.target.value) })}
                className="text-[10px] bg-dark-700 border border-dark-600 rounded px-1.5 py-0.5 text-dark-300"
              >
                <option value={0}>$0</option>
                <option value={100}>$100</option>
                <option value={500}>$500</option>
                <option value={1000}>$1k</option>
                <option value={5000}>$5k</option>
                <option value={10000}>$10k</option>
              </select>
            </div>
            {ignoredTokens.size > 0 && (
              <button
                onClick={handleClearIgnored}
                className="text-[10px] text-dark-500 hover:text-dark-300 ml-auto"
              >
                Clear ignored ({ignoredTokens.size})
              </button>
            )}
          </div>

          {/* P1: Confirmation panel */}
          {confirmation && (
            <div className="mt-2 p-2 bg-dark-800/80 border border-dark-600 rounded-lg">
              <div className="text-[10px] text-dark-300 font-medium mb-2">
                {confirmation.type === 'addNew' ? 'Add NEW tokens' : 'Add TOP increased'}
              </div>
              <div className="max-h-24 overflow-y-auto mb-2">
                {confirmation.tokens.map((t) => (
                  <div key={t.address} className="flex items-center justify-between py-0.5 text-[10px]">
                    <span className="text-dark-300">{t.symbol}</span>
                    <span className="text-dark-500">{t.valueUsd ? formatUsd(t.valueUsd) : '-'}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1.5 mb-2 pt-2 border-t border-dark-600/50">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="confirm-exclude-stablecoins"
                    name="confirm-exclude-stablecoins"
                    checked={confirmation.excludeStablecoins}
                    onChange={(e) => setConfirmation({ ...confirmation, excludeStablecoins: e.target.checked })}
                    className="w-3 h-3 rounded border-dark-500 bg-dark-700 text-primary-500"
                  />
                  <span className="text-[10px] text-dark-400">Exclude stablecoins</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="confirm-exclude-high-risk"
                    name="confirm-exclude-high-risk"
                    checked={confirmation.excludeHighRisk}
                    onChange={(e) => setConfirmation({ ...confirmation, excludeHighRisk: e.target.checked })}
                    className="w-3 h-3 rounded border-dark-500 bg-dark-700 text-primary-500"
                  />
                  <span className="text-[10px] text-dark-400">Exclude Risk = High</span>
                  <span className="text-[9px] text-dark-600">(if known)</span>
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmAdd}
                  className="flex-1 py-1.5 px-2 bg-primary-600/20 hover:bg-primary-600/30 border border-primary-600/30 rounded text-[10px] text-primary-400 font-medium transition-colors"
                >
                  Confirm add ({confirmation.tokens.filter((t) =>
                    (!confirmation.excludeStablecoins || !isStablecoin(t.symbol, t.name))
                  ).length})
                </button>
                <button
                  onClick={handleCancelConfirm}
                  className="py-1.5 px-3 bg-dark-700 hover:bg-dark-600 rounded text-[10px] text-dark-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* V6: Action buttons */}
          {!confirmation && (newTokensNotInWatchlist > 0 || increasedNotInWatchlist > 0) && availableSlots > 0 && (
            <div className="mt-2 flex gap-2 pb-2 border-b border-dark-600/30">
              {newTokensNotInWatchlist > 0 && (
                <button
                  onClick={handleAddNewClick}
                  className="flex-1 py-1.5 px-2 bg-green-900/20 hover:bg-green-900/30 border border-green-800/30 rounded text-[10px] text-green-400 font-medium transition-colors"
                >
                  + Add NEW ({Math.min(newTokensNotInWatchlist, 10, availableSlots)})
                </button>
              )}
              {increasedNotInWatchlist > 0 && (
                <button
                  onClick={handleAddTopIncreasedClick}
                  className="flex-1 py-1.5 px-2 bg-blue-900/20 hover:bg-blue-900/30 border border-blue-800/30 rounded text-[10px] text-blue-400 font-medium transition-colors"
                >
                  + Add TOP ↑ ({Math.min(increasedNotInWatchlist, 10, availableSlots)})
                </button>
              )}
            </div>
          )}

          {/* Show message if all changes are filtered */}
          {visibleChanges === 0 && hiddenChanges > 0 && (
            <div className="mt-2 text-[10px] text-dark-500 text-center py-2">
              {hiddenChanges} change{hiddenChanges > 1 ? 's' : ''} hidden by filters
            </div>
          )}

          {/* Added tokens */}
          {filteredDiff.added.length > 0 && (
            <div className="mt-2">
              {filteredDiff.added.slice(0, 5).map((token) => (
                <DiffChangeRow
                  key={`added-${token.address}`}
                  type="added"
                  token={token}
                  onIgnore={() => handleIgnore(token.address)}
                />
              ))}
              {filteredDiff.added.length > 5 && (
                <div className="text-[10px] text-dark-500 pl-6">
                  +{filteredDiff.added.length - 5} more added
                </div>
              )}
            </div>
          )}

          {/* Removed tokens */}
          {filteredDiff.removed.length > 0 && (
            <div className="mt-2">
              {filteredDiff.removed.slice(0, 5).map((token) => (
                <DiffChangeRow
                  key={`removed-${token.address}`}
                  type="removed"
                  token={token}
                  onIgnore={() => handleIgnore(token.address)}
                />
              ))}
              {filteredDiff.removed.length > 5 && (
                <div className="text-[10px] text-dark-500 pl-6">
                  +{filteredDiff.removed.length - 5} more removed
                </div>
              )}
            </div>
          )}

          {/* Increased tokens */}
          {filteredDiff.increased.length > 0 && (
            <div className="mt-2">
              {filteredDiff.increased.slice(0, 5).map((token) => (
                <DiffChangeRow
                  key={`increased-${token.address}`}
                  type="increased"
                  token={token}
                  onIgnore={() => handleIgnore(token.address)}
                />
              ))}
              {filteredDiff.increased.length > 5 && (
                <div className="text-[10px] text-dark-500 pl-6">
                  +{filteredDiff.increased.length - 5} more increased
                </div>
              )}
            </div>
          )}

          {/* Decreased tokens */}
          {filteredDiff.decreased.length > 0 && (
            <div className="mt-2">
              {filteredDiff.decreased.slice(0, 5).map((token) => (
                <DiffChangeRow
                  key={`decreased-${token.address}`}
                  type="decreased"
                  token={token}
                  onIgnore={() => handleIgnore(token.address)}
                />
              ))}
              {filteredDiff.decreased.length > 5 && (
                <div className="text-[10px] text-dark-500 pl-6">
                  +{filteredDiff.decreased.length - 5} more decreased
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

  // Chain selection for Any Wallet mode (persisted to localStorage)
  const [externalChainId, setExternalChainId] = useState<number>(loadExternalChainId);

  // Ref for chain dropdown (used for focus on empty state CTA)
  const chainDropdownRef = useRef<HTMLSelectElement>(null);

  // Scan state
  const [stage, setStage] = useState<ScanStage>('idle');
  const [scanResult, setScanResult] = useState<WalletScanResponse | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI state - filtering and pagination
  const [hideNoLogo, setHideNoLogo] = useState(() => {
    try {
      const stored = localStorage.getItem(FILTER_STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });
  const [visibleCount, setVisibleCount] = useState(20);
  const PAGE_SIZE = 20;

  // V5: Search and quick filters
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('none');
  const [stableOnly, setStableOnly] = useState(false);

  // Risk cache for lazy loading
  const riskCacheRef = useRef<Map<string, RiskCacheEntry>>(new Map());
  const riskInflightRef = useRef<Set<string>>(new Set());
  const [riskVersion, setRiskVersion] = useState(0); // Force re-render when risks load

  // Persist hideNoLogo to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, String(hideNoLogo));
    } catch {
      // Ignore localStorage errors
    }
  }, [hideNoLogo]);

  // Persist externalChainId to localStorage (remembers last selected chain for Any Wallet mode)
  useEffect(() => {
    saveExternalChainId(externalChainId);
  }, [externalChainId]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, quickFilter, stableOnly, hideNoLogo]);

  // Effective chain ID depends on mode
  // My Wallet: use connected wallet's chain
  // Any Wallet: use selected chain from dropdown
  const effectiveChainId = walletMode === 'external' ? externalChainId : currentChainId;

  // Chain info for display
  const chainInfo = CHAIN_INFO[effectiveChainId] || { name: `Chain ${effectiveChainId}`, symbol: 'ETH', color: '#888' };
  const watchlistFull = watchlistTokens.length >= 20;
  const availableSlots = 20 - watchlistTokens.length;

  // Chain label suffix based on mode
  const chainLabelSuffix = walletMode === 'external' ? '(selected)' : '(your wallet network)';

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
    setVisibleCount(PAGE_SIZE);
    setSearchQuery('');
    setQuickFilter('none');
    setStableOnly(false);

    // Debug logging (only when localStorage.debug=true)
    const requestUrl = `${API_BASE}/api/v1/wallet/scan?chainId=${effectiveChainId}&wallet=${targetWallet}&provider=auto`;
    debugLog('[WalletScan] Starting scan', {
      walletMode,
      effectiveChainId,
      targetWallet: `${targetWallet.slice(0, 6)}...${targetWallet.slice(-4)}`,
      provider: 'auto',
      requestUrl,
    });

    // Set up progress timers
    const timer1 = setTimeout(() => setStage((s) => s === 'connecting' ? 'fetching' : s), 300);
    const timer2 = setTimeout(() => setStage((s) => s === 'fetching' ? 'pricing' : s), 800);
    const timer3 = setTimeout(() => setStage((s) => s === 'pricing' ? 'filtering' : s), 1500);

    try {
      const result = await scanWallet({
        chainId: effectiveChainId,
        wallet: targetWallet,
        minUsd: 1,
        strict: false,
        provider: 'auto',
      });

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      setScanResult(result);
      setLastScanTime(Date.now());

      if (isExternalScan) {
        await trackExternalWalletScanned(effectiveChainId, targetWallet);
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
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      setStage('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  }, [canScan, targetWallet, effectiveChainId, walletMode, isExternalScan, getFilteredTokens, availableSlots]);

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

    await trackAddSelected(selectedTokens.size, addedCount, {
      minUsd: 1,
      provider: scanResult.provider,
      strict: false,
      chainId: effectiveChainId,
      filteredSpam: scanResult.stats.spamFiltered,
      source: isExternalScan ? 'external' : 'connected',
    });

    setSelectedTokens(new Set());

    if (addedCount > 0) {
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

  // Select/deselect all visible
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

  // Get filtered and categorized tokens with search + quick filters
  const { displayTokens, unpricedCount, totalAfterFilters } = useMemo(() => {
    if (!scanResult) {
      return { displayTokens: [], unpricedCount: 0, totalAfterFilters: 0 };
    }

    const notInWatchlist = getFilteredTokens(scanResult.tokens);
    const priced = notInWatchlist.filter((t) => t.hasPricing && t.valueUsd && t.valueUsd > 0);
    const unpriced = notInWatchlist.filter((t) => !t.hasPricing || !t.valueUsd || t.valueUsd === 0);

    // Sort priced by value (highest first)
    priced.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

    let filtered = priced;

    // Apply logo filter
    if (hideNoLogo) {
      filtered = filtered.filter((t) => hasValidLogo(t.logo));
    }

    // Apply stablecoin filter
    if (stableOnly) {
      filtered = filtered.filter((t) => isStablecoin(t.symbol, t.name));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((t) => {
        const sym = (t.symbol || '').toLowerCase();
        const nm = (t.name || '').toLowerCase();
        return sym.includes(q) || nm.includes(q);
      });
    }

    // Apply quick filter
    if (quickFilter === 'top20') {
      filtered = filtered.slice(0, 20);
    } else if (quickFilter === 'usd1k') {
      filtered = filtered.filter((t) => (t.valueUsd || 0) >= 1000);
    } else if (quickFilter === 'usd10k') {
      filtered = filtered.filter((t) => (t.valueUsd || 0) >= 10000);
    }

    return {
      displayTokens: filtered,
      unpricedCount: unpriced.length,
      totalAfterFilters: filtered.length,
    };
  }, [scanResult, getFilteredTokens, hideNoLogo, stableOnly, searchQuery, quickFilter]);

  // Paginated tokens for display
  const visibleTokens = displayTokens.slice(0, visibleCount);
  const hasMoreTokens = displayTokens.length > visibleCount;

  const hiddenByLogoFilter = useMemo(() => {
    if (!scanResult) return 0;
    const notInWatchlist = getFilteredTokens(scanResult.tokens);
    const priced = notInWatchlist.filter((t) => t.hasPricing && t.valueUsd && t.valueUsd > 0);
    return priced.filter((t) => !hasValidLogo(t.logo)).length;
  }, [scanResult, getFilteredTokens]);

  // Lazy risk loading for visible tokens only
  useEffect(() => {
    if (!visibleTokens.length) return;

    let cancelled = false;
    const cache = riskCacheRef.current;
    const now = Date.now();

    // Find tokens that need risk fetching
    const needFetch = visibleTokens.filter((t) => {
      const key = `${effectiveChainId}:${t.address.toLowerCase()}`;
      const entry = cache.get(key);
      if (!entry) return true;
      return now - entry.fetchedAt > RISK_CACHE_TTL_MS;
    });

    if (needFetch.length === 0) return;

    const queue = [...needFetch];

    const fetchRisk = async (token: DiscoveredToken) => {
      const key = `${effectiveChainId}:${token.address.toLowerCase()}`;
      if (riskInflightRef.current.has(key)) return;

      riskInflightRef.current.add(key);

      try {
        const url = `${API_BASE}/api/v1/signals?chainId=${effectiveChainId}&token=${token.address}`;

        // P1: Add timeout to risk fetch (5 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), RISK_FETCH_TIMEOUT_MS);

        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);

        let label: RiskLabel = 'Unknown';

        if (res.ok) {
          const data = await res.json();
          const riskSignal = data?.risk?.signal;

          if (riskSignal) {
            const status = riskSignal.status || '';
            if (status === 'critical' || status === 'danger') {
              label = 'High';
            } else if (status === 'warning') {
              label = 'Medium';
            } else if (status === 'safe') {
              label = 'Low';
            }
          } else {
            // No risk signal means likely safe
            label = 'Low';
          }
        }

        if (!cancelled) {
          cache.set(key, { label, fetchedAt: Date.now() });
          setRiskVersion((v) => v + 1);
        }
      } catch {
        // P1: Timeout or network error -> Unknown with tooltip
        if (!cancelled) {
          cache.set(key, { label: 'Unknown', fetchedAt: Date.now() });
          setRiskVersion((v) => v + 1);
        }
      } finally {
        riskInflightRef.current.delete(key);
      }
    };

    // Process queue with limited concurrency
    const processQueue = async () => {
      const workers = [];
      for (let i = 0; i < MAX_RISK_CONCURRENCY && queue.length > 0; i++) {
        workers.push(
          (async () => {
            while (queue.length > 0 && !cancelled) {
              const token = queue.shift();
              if (token) await fetchRisk(token);
            }
          })()
        );
      }
      await Promise.all(workers);
    };

    processQueue();

    return () => {
      cancelled = true;
    };
  }, [visibleTokens, effectiveChainId, riskVersion]);

  // Get risk label for a token
  const getRiskLabel = useCallback((token: DiscoveredToken): RiskLabel => {
    const key = `${effectiveChainId}:${token.address.toLowerCase()}`;
    const entry = riskCacheRef.current.get(key);
    if (!entry) return 'Loading';
    return entry.label;
  }, [effectiveChainId, riskVersion]); // riskVersion dependency triggers re-render

  // Get empty state reason - uses chainInfo.name for specific messaging
  const getEmptyReason = (): string => {
    if (!scanResult) return '';

    if (scanResult.error) {
      if (scanResult.error.includes('rate')) return 'Provider rate-limited. Try again in a moment.';
      if (scanResult.error.includes('API')) return 'Provider API error. Please try again.';
      return scanResult.error;
    }

    // Check total value - if very low, wallet is essentially empty
    const totalValue = scanResult.insights?.totalValueUsd || 0;
    if (totalValue < 1) {
      return `This wallet has no significant token holdings on ${chainInfo.name}.`;
    }

    if (scanResult.stats.tokensDiscovered === 0) {
      return `No tokens found on ${chainInfo.name} for this wallet.`;
    }

    if (scanResult.stats.spamFiltered === scanResult.stats.tokensDiscovered) {
      return 'All tokens were filtered as spam.';
    }

    if (scanResult.stats.tokensFiltered === 0) {
      return `No tokens above minimum value threshold ($1) on ${chainInfo.name}.`;
    }

    // Check why displayTokens is empty
    if (displayTokens.length === 0 && scanResult.tokens.length > 0) {
      if (searchQuery) return `No tokens match "${searchQuery}". Try clearing search.`;
      if (stableOnly) return 'No stablecoins found. Try disabling stablecoin filter.';
      if (quickFilter !== 'none') return 'No tokens match the value filter. Try a different filter.';

      // Check if all tokens are already in watchlist
      const notInWatchlist = scanResult.tokens.filter((t) => !hasToken(t.chainId, t.address));
      if (notInWatchlist.length === 0) {
        return 'All discovered tokens are already in your watchlist.';
      }

      // Check if hideNoLogo filter is hiding tokens
      if (hideNoLogo) {
        const withLogos = notInWatchlist.filter((t) => hasValidLogo(t.logo));
        if (withLogos.length === 0) {
          return 'Tokens found but hidden (no verified logos). Try unchecking "Hide no logo" filter.';
        }
      }

      return 'All discovered tokens are already in your watchlist.';
    }

    return `No tokens found on ${chainInfo.name} for this wallet.`;
  };

  // Handle empty state chain change CTA
  const handleEmptyStateChainChange = useCallback(() => {
    if (walletMode === 'external') {
      // Focus the chain dropdown for external wallet mode
      chainDropdownRef.current?.focus();
    }
    // For connected wallet mode, just reset to idle (user needs to switch wallet network manually)
    setStage('idle');
  }, [walletMode]);

  // Handle preset wallet selection - sets both address and chain
  const handlePresetSelect = useCallback((address: string, chainId: number) => {
    setWalletMode('external'); // Ensure we're in external mode
    setExternalAddress(address);
    setExternalChainId(chainId); // Set the preset's preferred chain
    setShowPresets(false);
    setStage('idle');
    setScanResult(null);
  }, []);

  // Provider name for trust tags
  const providerName = scanResult?.provider || 'unknown';

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

      {/* External wallet input */}
      {walletMode === 'external' && (
        <div className="mb-3">
          <div className="relative">
            <input
              type="text"
              id="external-wallet-address"
              name="external-wallet-address"
              autoComplete="off"
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

          <button
            onClick={() => setShowPresets(!showPresets)}
            className="mt-2 text-[10px] text-dark-500 hover:text-dark-300 flex items-center gap-1"
          >
            <span>📋</span>
            <span>{showPresets ? 'Hide presets' : 'Quick picks (whale wallets)'}</span>
          </button>

          {showPresets && (
            <div className="mt-2 space-y-1">
              {PRESET_WALLETS.map((preset) => (
                <button
                  key={preset.address}
                  onClick={() => handlePresetSelect(preset.address, preset.chainId)}
                  className="w-full flex items-center justify-between p-2 bg-dark-700/30 hover:bg-dark-700/50 rounded-lg transition-colors text-left"
                >
                  <div>
                    <div className="text-xs text-dark-200">{preset.name}</div>
                    <div className="text-[10px] text-dark-500">{preset.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-600/50 text-dark-400">
                      {CHAIN_INFO[preset.chainId]?.name || `Chain ${preset.chainId}`}
                    </span>
                    <span className="text-[10px] text-dark-600 font-mono">
                      {shortAddress(preset.address)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 text-[10px] text-dark-600 flex items-center gap-1">
            <span>🔒</span>
            <span>Read-only. No private key access.</span>
          </div>
        </div>
      )}

      {/* Chain indicator - dropdown for Any Wallet mode, static for My Wallet */}
      <div className="flex items-center gap-2 mb-4 p-2 bg-dark-700/50 rounded-lg">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: chainInfo.color }}
        />
        {walletMode === 'external' ? (
          // Chain dropdown for Any Wallet mode
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs text-dark-400">Scan on</span>
            <select
              ref={chainDropdownRef}
              value={externalChainId}
              onChange={(e) => {
                setExternalChainId(Number(e.target.value));
                // Reset scan results when chain changes
                if (stage === 'complete' || stage === 'error') {
                  setStage('idle');
                  setScanResult(null);
                }
              }}
              className="text-xs bg-dark-700 border border-dark-600 rounded px-2 py-1 text-dark-200 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            >
              {SUPPORTED_CHAINS.map((chainId) => (
                <option key={chainId} value={chainId}>
                  {CHAIN_INFO[chainId]?.name || `Chain ${chainId}`}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-dark-500">(selected)</span>
          </div>
        ) : (
          // Static display for My Wallet mode
          <span className="text-xs text-dark-300">
            Scanning on {chainInfo.name}{' '}
            <span className="text-dark-500">{chainLabelSuffix}</span>
          </span>
        )}
        {scanResult && scanResult.stats.tokensFiltered > 0 && (
          <span className="ml-auto text-xs text-dark-500 flex-shrink-0">
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
        <div className="py-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-dark-300 text-sm">{STAGE_LABELS[stage]}</span>
          </div>
          <div className="space-y-2">
            <TokenSkeleton />
            <TokenSkeleton />
            <TokenSkeleton />
          </div>
        </div>
      ) : displayTokens.length === 0 && !searchQuery && quickFilter === 'none' && !stableOnly ? (
        <EmptyState
          reason={getEmptyReason()}
          chainSuggestion={scanResult?.insights?.chainSuggestion}
          walletMode={walletMode}
          onChangeChain={handleEmptyStateChainChange}
        />
      ) : (
        <>
          {/* Insights */}
          {scanResult?.insights && (
            <InsightsPanel insights={scanResult.insights} />
          )}

          {/* Changes since last scan (V4 Diff + V6 Actions) */}
          {scanResult?.diff && (
            <DiffPanel
              diff={scanResult.diff}
              hideNoLogo={hideNoLogo}
              chainId={effectiveChainId}
              targetWallet={targetWallet}
              addToken={addToken}
              hasToken={hasToken}
              availableSlots={availableSlots}
            />
          )}

          {/* V5: Search input */}
          <div className="mb-3">
            <input
              type="text"
              id="wallet-scan-search"
              name="wallet-scan-search"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by symbol or name (e.g., USDT, BTCB...)"
              className="w-full px-3 py-2 bg-dark-700/50 border border-dark-600 rounded-lg text-sm text-dark-200 placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            />
          </div>

          {/* V5: Quick filters */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              onClick={() => setQuickFilter(quickFilter === 'top20' ? 'none' : 'top20')}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                quickFilter === 'top20'
                  ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
                  : 'bg-dark-700/50 text-dark-400 hover:bg-dark-700'
              }`}
            >
              Top 20
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'usd1k' ? 'none' : 'usd1k')}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                quickFilter === 'usd1k'
                  ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
                  : 'bg-dark-700/50 text-dark-400 hover:bg-dark-700'
              }`}
            >
              $1k+
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'usd10k' ? 'none' : 'usd10k')}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                quickFilter === 'usd10k'
                  ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
                  : 'bg-dark-700/50 text-dark-400 hover:bg-dark-700'
              }`}
            >
              $10k+
            </button>
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-700/50 cursor-pointer">
              <input
                type="checkbox"
                id="filter-stablecoins-only"
                name="filter-stablecoins-only"
                checked={stableOnly}
                onChange={(e) => setStableOnly(e.target.checked)}
                className="w-3 h-3 rounded border-dark-500 bg-dark-700 text-primary-500"
              />
              <span className="text-[10px] text-dark-400">Stablecoins only</span>
            </label>
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-700/50 cursor-pointer">
              <input
                type="checkbox"
                id="filter-hide-no-logo"
                name="filter-hide-no-logo"
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
                {totalAfterFilters} tokens
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

          {/* Empty filter result */}
          {displayTokens.length === 0 && (searchQuery || quickFilter !== 'none' || stableOnly) && (
            <div className="text-center py-6 text-dark-500 text-sm">
              <div>No tokens match your filters.</div>
              <div className="text-xs mt-2">
                Try: {searchQuery && 'clearing search, '}
                {stableOnly && 'disabling stablecoins filter, '}
                {quickFilter !== 'none' && 'removing value filter, '}
                {hideNoLogo && 'showing tokens without logos'}
              </div>
            </div>
          )}

          {/* Token list */}
          <div className="space-y-1.5 mb-3">
            {visibleTokens.map((token) => (
              <TokenRow
                key={token.address}
                token={token}
                selected={selectedTokens.has(token.address)}
                onToggle={() => toggleToken(token.address)}
                provider={providerName}
                riskLabel={getRiskLabel(token)}
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

          {/* Unpriced tokens summary */}
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

      {/* Scanned wallet info with explorer link */}
      {targetWallet && (
        <div className="mt-3 pt-3 border-t border-dark-700/50 flex items-center justify-between text-[10px]">
          <span className="text-dark-500">
            {isExternalScan ? 'Viewing:' : 'Connected:'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-dark-400 font-mono">{shortAddress(targetWallet)}</span>
            {getExplorerUrl(effectiveChainId, targetWallet) && (
              <a
                href={getExplorerUrl(effectiveChainId, targetWallet)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-dark-500 hover:text-primary-400 transition-colors"
                title={`View on ${CHAIN_EXPLORERS[effectiveChainId]?.name}`}
              >
                ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* Stats footer */}
      {scanResult && stage === 'complete' && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-dark-600">
          <span>Provider: {scanResult.provider}</span>
          <span>{scanResult.stats.durationMs}ms</span>
        </div>
      )}

      {/* Risk loading note */}
      {stage === 'complete' && visibleTokens.length > 0 && (
        <div className="mt-2 text-[9px] text-dark-600 text-center">
          Risk labels load for visible tokens only
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
