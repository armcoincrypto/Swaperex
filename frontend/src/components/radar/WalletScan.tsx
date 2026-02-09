/**
 * Wallet Scan Component (v2)
 *
 * Full-featured wallet scanning with:
 * - Per-chain progress indicators
 * - Live log feed
 * - Partial results as they arrive
 * - Error cards with retry
 * - Token cards with chain, balance, risk badge
 * - Sorting and filtering
 * - Quick add all / individual add to watchlist
 * - Cancellation support
 * - Copy debug info
 * - Saved scan history
 * - Mobile responsive
 */

import { useState, useMemo, useCallback } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import {
  useScanStore,
  getChainDisplayName,
  ALL_SCAN_CHAINS,
  type ScanChainName,
  type ScannedToken,
  type ChainScanProgress,
} from '@/services/walletScan';

// ─── Sub-components ──────────────────────────────────────────────────

/** Per-chain progress bar */
function ChainProgress({ progress }: { progress: ChainScanProgress }) {
  const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;
  const displayName = getChainDisplayName(progress.chainName);

  const statusIcon = {
    pending: '⏳',
    scanning: '🔄',
    completed: '✅',
    failed: '❌',
  }[progress.status];

  const statusColor = {
    pending: 'text-dark-500',
    scanning: 'text-primary-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
  }[progress.status];

  return (
    <div className="flex items-center gap-3" role="progressbar" aria-valuenow={pct} aria-valuemax={100} aria-label={`${displayName} scan progress`}>
      <span className="text-xs w-5 text-center">{statusIcon}</span>
      <span className="text-xs w-16 font-medium text-dark-300">{displayName}</span>
      <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            progress.status === 'failed' ? 'bg-red-500' :
            progress.status === 'completed' ? 'bg-green-500' : 'bg-primary-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] w-20 text-right ${statusColor}`}>
        {progress.status === 'scanning' && `${progress.checked}/${progress.total}`}
        {progress.status === 'completed' && `${progress.tokens.length} found`}
        {progress.status === 'failed' && 'Failed'}
        {progress.status === 'pending' && 'Waiting'}
      </span>
    </div>
  );
}

/** Error card for a failed chain */
function ChainErrorCard({
  progress,
  onRetry,
}: {
  progress: ChainScanProgress;
  onRetry: () => void;
}) {
  const hint = {
    rpc_timeout: 'The RPC endpoint timed out. Retrying will try a different provider.',
    rate_limited: 'Rate limited by the RPC. Wait a moment then retry.',
    checksum_error: 'Token address validation error. This is a data issue.',
    unknown: 'An unexpected error occurred.',
  }[progress.errorCode || 'unknown'];

  return (
    <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="text-red-400 font-medium">
          {getChainDisplayName(progress.chainName)} scan failed
        </span>
        <button
          onClick={onRetry}
          className="px-2 py-1 bg-red-800/30 hover:bg-red-800/50 text-red-300 rounded text-[10px] transition-colors"
          aria-label={`Retry ${getChainDisplayName(progress.chainName)} scan`}
        >
          Retry
        </button>
      </div>
      <p className="text-dark-500">{progress.error}</p>
      <p className="text-dark-600 mt-1">{hint}</p>
      {progress.rpcUsed && (
        <p className="text-dark-600 mt-1">Last RPC: {progress.rpcUsed}</p>
      )}
    </div>
  );
}

/** Individual token card */
function TokenCard({
  token,
  onAdd,
  watchlistFull,
}: {
  token: ScannedToken;
  onAdd: (token: ScannedToken) => void;
  watchlistFull: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = async () => {
    setAdding(true);
    onAdd(token);
    setAdding(false);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const chainLabel = getChainDisplayName(token.chainName);
  const shortAddr = token.isNative ? 'Native' : `${token.address.slice(0, 6)}...${token.address.slice(-4)}`;

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-dark-700/50 rounded-lg hover:bg-dark-700 transition-colors">
      {/* Token info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{token.symbol}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-dark-600 text-dark-400 rounded">{chainLabel}</span>
          {token.source === 'custom' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/30 text-yellow-500 rounded">Custom</span>
          )}
          {token.source === 'discovered' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/30 text-purple-400 rounded">Discovered</span>
          )}
          {token.riskLevel === 'high' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded">High Risk</span>
          )}
          {token.riskLevel === 'medium' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400 rounded">Med Risk</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-dark-400 truncate">{token.name}</span>
          <span className="text-[10px] text-dark-600 font-mono">{shortAddr}</span>
        </div>
      </div>

      {/* Balance */}
      <div className="text-right shrink-0">
        <div className="text-sm font-medium text-dark-200">
          {formatTokenBalance(token.balance)}
        </div>
        {token.usdValue !== undefined && token.usdValue > 0 && (
          <div className="text-[10px] text-dark-500">${token.usdValue.toFixed(2)}</div>
        )}
      </div>

      {/* Add button */}
      <div className="shrink-0 w-16">
        {token.isNative ? (
          <span className="text-[10px] text-dark-600 block text-center">Native</span>
        ) : token.isWatched || justAdded ? (
          <span className="text-[10px] text-green-500 block text-center">
            {justAdded ? 'Added!' : 'Watched'}
          </span>
        ) : (
          <button
            onClick={handleAdd}
            disabled={adding || watchlistFull}
            className={`w-full px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              watchlistFull
                ? 'bg-dark-700 text-dark-600 cursor-not-allowed'
                : 'bg-primary-600/20 text-primary-400 hover:bg-primary-600/30'
            }`}
            aria-label={`Add ${token.symbol} to watchlist`}
          >
            {watchlistFull ? 'Full' : '+ Watch'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Format token balance for display */
function formatTokenBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  if (num < 0.001) return '<0.001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}K`;
  return `${(num / 1_000_000).toFixed(1)}M`;
}

/** Live log feed */
function ScanLogFeed({ logs }: { logs: Array<{ timestamp: number; level: string; chain?: string; message: string }> }) {
  const recentLogs = logs.slice(-8);

  return (
    <div className="mt-2 max-h-24 overflow-y-auto text-[10px] font-mono space-y-0.5">
      {recentLogs.map((log, i) => (
        <div key={i} className={`flex gap-1 ${
          log.level === 'error' ? 'text-red-400' :
          log.level === 'warn' ? 'text-yellow-500' : 'text-dark-500'
        }`}>
          {log.chain && <span className="text-dark-600">[{log.chain.toUpperCase().slice(0, 3)}]</span>}
          <span>{log.message}</span>
        </div>
      ))}
    </div>
  );
}

/** Saved scan history */
function SavedScans(_props: { onClose: () => void }) {
  const savedSessions = useScanStore((s) => s.savedSessions);
  const clearSaved = useScanStore((s) => s.clearSavedSessions);

  if (savedSessions.length === 0) {
    return (
      <div className="text-xs text-dark-500 text-center py-2">No saved scans</div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-dark-400">Recent Scans</span>
        <button onClick={clearSaved} className="text-[10px] text-dark-600 hover:text-dark-400">clear</button>
      </div>
      {savedSessions.map((s) => (
        <div key={s.id} className="flex items-center justify-between text-[10px] py-1 px-2 bg-dark-700/30 rounded">
          <span className="text-dark-400">{new Date(s.timestamp).toLocaleDateString()}</span>
          <span className="text-dark-500">{s.chainsScanned.length} chains</span>
          <span className="text-dark-300">{s.totalFound} found</span>
          <span className="text-green-500">{s.totalAdded} added</span>
        </div>
      ))}
    </div>
  );
}

// ─── Filter types ────────────────────────────────────────────────────

type SortBy = 'balance' | 'chain' | 'symbol';
type FilterChain = 'all' | ScanChainName;

// ─── Main Component ──────────────────────────────────────────────────

interface WalletScanProps {
  className?: string;
}

export function WalletScan({ className = '' }: WalletScanProps) {
  const isConnected = useWalletStore((s) => s.isConnected);
  const walletAddress = useWalletStore((s) => s.address);
  const watchlistCount = useWatchlistStore((s) => s.tokens.length);

  const session = useScanStore((s) => s.session);
  const status = useScanStore((s) => s.status);
  const logs = useScanStore((s) => s.logs);
  const startScan = useScanStore((s) => s.startScan);
  const cancelScan = useScanStore((s) => s.cancelScan);
  const retryChain = useScanStore((s) => s.retryChain);
  const addToken = useScanStore((s) => s.addTokenToWatchlist);
  const addAll = useScanStore((s) => s.addAllToWatchlist);
  const resetSession = useScanStore((s) => s.resetSession);
  const getDebugInfo = useScanStore((s) => s.getDebugInfo);

  // UI state
  const [sortBy, setSortBy] = useState<SortBy>('balance');
  const [filterChain, setFilterChain] = useState<FilterChain>('all');
  const [hideZero] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddAllConfirm, setShowAddAllConfirm] = useState(false);
  const [copiedDebug, setCopiedDebug] = useState(false);

  // All tokens from all chains
  const allTokens: ScannedToken[] = useMemo(() => {
    if (!session) return [];
    return Object.values(session.chains).flatMap((c) => c.tokens);
  }, [session]);

  // Filtered + sorted tokens
  const displayTokens = useMemo(() => {
    let tokens = [...allTokens];

    // Filter by chain
    if (filterChain !== 'all') {
      tokens = tokens.filter((t) => t.chainName === filterChain);
    }

    // Filter zero balances
    if (hideZero) {
      tokens = tokens.filter((t) => parseFloat(t.balance) > 0);
    }

    // Sort
    tokens.sort((a, b) => {
      if (sortBy === 'balance') {
        return parseFloat(b.balance) - parseFloat(a.balance);
      }
      if (sortBy === 'chain') {
        return a.chainName.localeCompare(b.chainName) || a.symbol.localeCompare(b.symbol);
      }
      return a.symbol.localeCompare(b.symbol);
    });

    return tokens;
  }, [allTokens, filterChain, hideZero, sortBy]);

  // Addable tokens (non-native, not already watched)
  const addableTokens = useMemo(
    () => displayTokens.filter((t) => !t.isNative && !t.isWatched),
    [displayTokens],
  );

  const watchlistFull = watchlistCount >= 20;
  const isScanning = status === 'scanning';

  const handleStartScan = useCallback(() => {
    if (!walletAddress) return;
    startScan(walletAddress);
  }, [walletAddress, startScan]);

  const handleAddAll = useCallback(() => {
    addAll(addableTokens);
    setShowAddAllConfirm(false);
  }, [addAll, addableTokens]);

  const handleCopyDebug = useCallback(async () => {
    const info = getDebugInfo();
    if (info) {
      await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
      setCopiedDebug(true);
      setTimeout(() => setCopiedDebug(false), 2000);
    }
  }, [getDebugInfo]);

  // Failed chains
  const failedChains = session
    ? Object.values(session.chains).filter((c) => c.status === 'failed')
    : [];

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔎</span>
          <h3 className="text-sm font-medium text-dark-200">Wallet Scan</h3>
          {session && (
            <span className="text-[10px] text-dark-500">
              {session.totalFound} token{session.totalFound !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {session && (
            <>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-[10px] text-dark-500 hover:text-dark-300 transition-colors"
                aria-label="Show scan history"
              >
                History
              </button>
              <button
                onClick={handleCopyDebug}
                className="text-[10px] text-dark-500 hover:text-dark-300 transition-colors"
                aria-label="Copy debug info"
              >
                {copiedDebug ? 'Copied!' : 'Debug'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-dark-400 mb-4">
        Detect tokens across ETH, BSC, and Polygon. Add to watchlist for automatic signal monitoring.
      </p>

      {/* Saved scans history */}
      {showHistory && <SavedScans onClose={() => setShowHistory(false)} />}

      {/* ─── Idle State ───────────────────────────────────── */}
      {!isConnected ? (
        <div className="flex items-center justify-center py-6 text-dark-500 text-xs">
          Connect your wallet to scan
        </div>
      ) : status === 'idle' ? (
        <div>
          <button
            onClick={handleStartScan}
            disabled={watchlistFull}
            className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${
              watchlistFull
                ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                : 'bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 border border-primary-600/30'
            }`}
            aria-label="Start wallet scan"
          >
            {watchlistFull ? (
              'Watchlist full (20/20)'
            ) : (
              <>
                Scan My Wallet
                <span className="ml-2 text-dark-500 text-xs">
                  ({20 - watchlistCount} slots available)
                </span>
              </>
            )}
          </button>
        </div>
      ) : (
        /* ─── Scanning / Results State ─────────────────── */
        <div className="space-y-3">
          {/* Per-chain progress bars */}
          {session && (
            <div className="space-y-2 p-3 bg-dark-900/50 rounded-lg">
              {ALL_SCAN_CHAINS.map((chain) => (
                <ChainProgress key={chain} progress={session.chains[chain]} />
              ))}

              {/* Elapsed time */}
              {isScanning && (
                <div className="text-[10px] text-dark-600 text-right mt-1">
                  {((Date.now() - session.startedAt) / 1000).toFixed(0)}s elapsed
                </div>
              )}
            </div>
          )}

          {/* Cancel / New Scan buttons */}
          <div className="flex gap-2">
            {isScanning ? (
              <button
                onClick={cancelScan}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-900/20 text-red-400 hover:bg-red-900/30 border border-red-800/30 transition-colors"
                aria-label="Cancel scan"
              >
                Cancel Scan
              </button>
            ) : (
              <>
                <button
                  onClick={handleStartScan}
                  className="flex-1 py-2 rounded-lg text-xs font-medium bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 border border-primary-600/30 transition-colors"
                  aria-label="Scan again"
                >
                  Scan Again
                </button>
                <button
                  onClick={resetSession}
                  className="py-2 px-3 rounded-lg text-xs text-dark-500 hover:text-dark-300 hover:bg-dark-700 transition-colors"
                  aria-label="Clear results"
                >
                  Clear
                </button>
              </>
            )}
          </div>

          {/* Error cards for failed chains */}
          {failedChains.map((chain) => (
            <ChainErrorCard
              key={chain.chainName}
              progress={chain}
              onRetry={() => retryChain(chain.chainName)}
            />
          ))}

          {/* Filters + Sort (when results exist) */}
          {allTokens.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Chain filter */}
              <div className="flex gap-1">
                {(['all', ...ALL_SCAN_CHAINS] as const).map((chain) => (
                  <button
                    key={chain}
                    onClick={() => setFilterChain(chain)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                      filterChain === chain
                        ? 'bg-primary-600/30 text-primary-300'
                        : 'bg-dark-700 text-dark-500 hover:text-dark-300'
                    }`}
                  >
                    {chain === 'all' ? 'All' : getChainDisplayName(chain)}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="bg-dark-700 text-dark-300 text-[10px] rounded px-2 py-1 border-none outline-none"
                aria-label="Sort tokens by"
              >
                <option value="balance">Sort: Balance</option>
                <option value="symbol">Sort: Symbol</option>
                <option value="chain">Sort: Chain</option>
              </select>

              {/* Quick add all */}
              {addableTokens.length > 0 && !watchlistFull && (
                <button
                  onClick={() => setShowAddAllConfirm(true)}
                  className="ml-auto px-2 py-1 bg-green-900/20 text-green-400 hover:bg-green-900/30 rounded text-[10px] font-medium transition-colors"
                  aria-label="Add all tokens to watchlist"
                >
                  + Add all ({addableTokens.length})
                </button>
              )}
            </div>
          )}

          {/* Add all confirmation */}
          {showAddAllConfirm && (
            <div className="bg-dark-900/80 border border-primary-800/30 rounded-lg p-3 text-xs">
              <p className="text-dark-300 mb-2">
                Add {addableTokens.length} token{addableTokens.length !== 1 ? 's' : ''} to watchlist?
                {watchlistCount + addableTokens.length > 20 && (
                  <span className="text-yellow-500 ml-1">
                    (only {20 - watchlistCount} slots left)
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleAddAll}
                  className="px-3 py-1 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded text-[10px] font-medium"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowAddAllConfirm(false)}
                  className="px-3 py-1 bg-dark-700 text-dark-400 hover:text-dark-300 rounded text-[10px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Token list */}
          {displayTokens.length > 0 && (
            <div className="space-y-1 max-h-80 overflow-y-auto" role="list" aria-label="Scanned tokens">
              {displayTokens.map((token) => (
                <TokenCard
                  key={`${token.chainId}-${token.address}`}
                  token={token}
                  onAdd={addToken}
                  watchlistFull={watchlistFull}
                />
              ))}
            </div>
          )}

          {/* Empty state explanations */}
          {!isScanning && allTokens.length === 0 && (
            <div className="text-center py-4 text-xs">
              {failedChains.length === Object.keys(session?.chains || {}).length ? (
                <div className="text-red-400">
                  All chain scans failed. Check your internet connection and retry.
                </div>
              ) : (
                <div className="text-dark-400">
                  No ERC-20 tokens with non-zero balances found in your wallet.
                  <br />
                  <span className="text-dark-500">
                    We check {Object.values(ERC20_TOKEN_COUNTS).reduce((a, b) => a + b, 0)} popular tokens across 3 chains.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Live log toggle */}
          <div className="pt-2 border-t border-dark-700/50">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="text-[10px] text-dark-600 hover:text-dark-400 transition-colors"
            >
              {showLogs ? '▼ Hide logs' : '▶ Show scan logs'}
            </button>
            {showLogs && <ScanLogFeed logs={logs} />}
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="mt-4 pt-3 border-t border-dark-700/50 text-[10px] text-dark-500">
        <div className="flex items-center gap-1 mb-1">
          <span>ℹ️</span>
          <span>Scans ETH, BSC, and Polygon for known tokens</span>
        </div>
        <p>
          Non-custodial: only reads public balances. No keys or signatures required.
        </p>
      </div>

      {/* Connected Wallet Info */}
      {isConnected && walletAddress && (
        <div className="mt-3 flex items-center justify-between text-[10px]">
          <span className="text-dark-500">Connected:</span>
          <span className="text-dark-400 font-mono">
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </span>
        </div>
      )}
    </div>
  );
}

// Token counts for display
const ERC20_TOKEN_COUNTS = { ethereum: 10, bsc: 10, polygon: 3 };

/**
 * Compact inline scan button for header areas
 */
export function WalletScanButton({ onClick, className = '' }: { onClick?: () => void; className?: string }) {
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
