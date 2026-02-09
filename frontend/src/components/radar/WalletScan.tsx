/**
 * Wallet Scan Component (v3)
 *
 * Professional wallet scanning with:
 * - Per-chain status: pending/scanning/completed/degraded/failed/skipped
 * - Portfolio summary with top holdings
 * - Risk badges + "Why?" detail drawer
 * - Dust/spam filtering with toggles
 * - Degraded mode with retry/skip/switch RPC
 * - Trust & safety messaging
 * - Explorer links per token
 * - Grouped logs with copy
 * - Saved scan history
 * - Non-custodial, read-only
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import {
  useScanStore,
  getChainDisplayName,
  getChainNativeSymbol,
  ALL_SCAN_CHAINS,
  getRpcEndpoints,
  getExplorerTokenUrl,
  getExplorerAddressUrl,
  getDexScreenerUrl,
  type ScanChainName,
  type ScannedToken,
  type ChainScanProgress,
  type RiskFactor,
  type ScanLogEntry,
} from '@/services/walletScan';

// ─── Utility ──────────────────────────────────────────────────────────

/** Format token balance for display */
export function formatTokenBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  if (num < 0.001) return '<0.001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}K`;
  return `${(num / 1_000_000).toFixed(1)}M`;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatElapsed(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ─── Trust Banner ─────────────────────────────────────────────────────

function TrustBanner() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2.5 bg-green-950/20 border border-green-900/20 rounded-lg text-[10px] text-green-400/80 mb-3">
      <span>Reads public balances only</span>
      <span>No private keys / seed phrases</span>
      <span>No transactions created</span>
      <span>Verify via explorer links</span>
    </div>
  );
}

// ─── Portfolio Summary ────────────────────────────────────────────────

function PortfolioSummary({
  tokens,
  session,
  watchlistCount,
  onScrollToToken,
}: {
  tokens: ScannedToken[];
  session: { totalFound: number; totalAdded: number; walletAddress: string };
  watchlistCount: number;
  onScrollToToken: (token: ScannedToken) => void;
}) {
  // Per-chain counts
  const chainCounts = useMemo(() => {
    const counts: Record<ScanChainName, number> = { ethereum: 0, bsc: 0, polygon: 0 };
    for (const t of tokens) counts[t.chainName]++;
    return counts;
  }, [tokens]);

  // Top 3 by balance
  const topHoldings = useMemo(() => {
    return [...tokens]
      .sort((a, b) => {
        if (a.usdValue !== undefined && b.usdValue !== undefined) return b.usdValue - a.usdValue;
        return parseFloat(b.balance) - parseFloat(a.balance);
      })
      .slice(0, 3);
  }, [tokens]);

  return (
    <div className="bg-dark-900/50 rounded-lg p-3 mb-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-dark-300 font-medium">Portfolio Summary</span>
        <span className="text-dark-500 font-mono text-[10px]">{shortAddress(session.walletAddress)}</span>
      </div>

      {/* Counts row */}
      <div className="flex gap-3 text-[10px]">
        <div>
          <span className="text-dark-500">Found: </span>
          <span className="text-dark-200 font-medium">{session.totalFound}</span>
        </div>
        <div>
          <span className="text-dark-500">Watched: </span>
          <span className="text-green-400 font-medium">{watchlistCount}/20</span>
        </div>
        <div className="flex gap-2 ml-auto">
          {ALL_SCAN_CHAINS.map((c) => (
            <span key={c} className="text-dark-500">
              {getChainDisplayName(c)}: <span className="text-dark-300">{chainCounts[c]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Top holdings */}
      {topHoldings.length > 0 && (
        <div className="pt-1.5 border-t border-dark-700/30">
          <span className="text-[10px] text-dark-500 block mb-1">Top holdings</span>
          <div className="flex gap-2">
            {topHoldings.map((t) => (
              <button
                key={`${t.chainId}-${t.address}`}
                onClick={() => onScrollToToken(t)}
                className="flex items-center gap-1 px-2 py-1 bg-dark-700/50 hover:bg-dark-700 rounded text-[10px] transition-colors"
              >
                <span className="text-white font-medium">{t.symbol}</span>
                <span className="text-dark-400">{formatTokenBalance(t.balance)}</span>
                {t.usdValue !== undefined && t.usdValue > 0 && (
                  <span className="text-dark-500">${t.usdValue.toFixed(2)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chain Progress ───────────────────────────────────────────────────

function ChainProgressBar({
  progress,
  onRetry,
  onSkip,
  onSwitchRpc,
}: {
  progress: ChainScanProgress;
  onRetry: (rpcIndex?: number) => void;
  onSkip: () => void;
  onSwitchRpc: (rpcIndex: number) => void;
}) {
  const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;
  const displayName = getChainDisplayName(progress.chainName);
  const [showRpcSelect, setShowRpcSelect] = useState(false);

  const statusIcon: Record<string, string> = {
    pending: '',
    scanning: '',
    completed: '',
    degraded: '',
    failed: '',
    skipped: '',
  };

  const statusColors: Record<string, string> = {
    pending: 'text-dark-500',
    scanning: 'text-primary-400',
    completed: 'text-green-400',
    degraded: 'text-yellow-400',
    failed: 'text-red-400',
    skipped: 'text-dark-600',
  };

  const barColor: Record<string, string> = {
    pending: 'bg-dark-600',
    scanning: 'bg-primary-500',
    completed: 'bg-green-500',
    degraded: 'bg-yellow-500',
    failed: 'bg-red-500',
    skipped: 'bg-dark-600',
  };

  const rpcs = getRpcEndpoints(progress.chainName);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2" role="progressbar" aria-valuenow={pct} aria-valuemax={100} aria-label={`${displayName} scan progress`}>
        <span className="text-xs w-5 text-center">{statusIcon[progress.status]}</span>
        <span className="text-xs w-16 font-medium text-dark-300">{displayName}</span>
        <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor[progress.status] || 'bg-dark-600'}`}
            style={{ width: `${progress.status === 'pending' ? 0 : pct}%` }}
          />
        </div>
        <span className={`text-[10px] w-24 text-right ${statusColors[progress.status] || 'text-dark-500'}`}>
          {progress.status === 'scanning' && `${progress.checked}/${progress.total}`}
          {progress.status === 'completed' && `${progress.tokens.length} found`}
          {progress.status === 'failed' && 'Failed'}
          {progress.status === 'degraded' && 'Slow'}
          {progress.status === 'pending' && 'Waiting'}
          {progress.status === 'skipped' && 'Skipped'}
          {progress.elapsedMs > 0 && progress.status !== 'pending' && ` ${formatElapsed(progress.elapsedMs)}`}
        </span>
      </div>

      {/* Degraded mode actions */}
      {progress.status === 'degraded' && (
        <div className="ml-7 bg-yellow-950/20 border border-yellow-900/20 rounded p-2 text-[10px] space-y-1.5">
          <p className="text-yellow-400/80">{progress.error || `${displayName} is responding slowly.`}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onRetry()}
              className="px-2 py-0.5 bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-300 rounded transition-colors"
            >
              Retry
            </button>
            <button
              onClick={onSkip}
              className="px-2 py-0.5 bg-dark-700 hover:bg-dark-600 text-dark-400 rounded transition-colors"
            >
              Skip
            </button>
            <button
              onClick={() => setShowRpcSelect(!showRpcSelect)}
              className="px-2 py-0.5 bg-dark-700 hover:bg-dark-600 text-dark-400 rounded transition-colors"
            >
              Switch RPC
            </button>
          </div>
          {showRpcSelect && (
            <div className="flex flex-wrap gap-1 mt-1">
              {rpcs.map((rpc, i) => (
                <button
                  key={i}
                  onClick={() => { onSwitchRpc(i); setShowRpcSelect(false); }}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    progress.rpcIndex === i
                      ? 'bg-primary-600/30 text-primary-300'
                      : 'bg-dark-700 text-dark-400 hover:text-dark-200'
                  }`}
                >
                  {rpc.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Failed state actions */}
      {progress.status === 'failed' && progress.error && (
        <div className="ml-7 bg-red-950/20 border border-red-900/20 rounded p-2 text-[10px] space-y-1.5">
          <p className="text-red-400/80">{progress.error}</p>
          {progress.rpcUsed && <p className="text-dark-600">Last RPC: {progress.rpcUsed}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => onRetry()}
              className="px-2 py-0.5 bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded transition-colors"
            >
              Retry
            </button>
            <button
              onClick={onSkip}
              className="px-2 py-0.5 bg-dark-700 hover:bg-dark-600 text-dark-400 rounded transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Risk Drawer ──────────────────────────────────────────────────────

function RiskDrawer({
  token,
  onClose,
}: {
  token: ScannedToken;
  onClose: () => void;
}) {
  const factors = token.riskFactors || [];
  const hasFactors = factors.length > 0;

  const severityColors: Record<string, string> = {
    danger: 'text-red-400 bg-red-900/20',
    warn: 'text-yellow-400 bg-yellow-900/20',
    info: 'text-blue-400 bg-blue-900/20',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-dark-800 rounded-t-xl sm:rounded-xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto border border-dark-600/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-medium text-white">{token.symbol} Risk Analysis</h4>
              <p className="text-[10px] text-dark-400 font-mono">{shortAddress(token.address)}</p>
            </div>
            <button onClick={onClose} className="text-dark-400 hover:text-white p-1" aria-label="Close risk drawer">
              x
            </button>
          </div>

          {/* Risk badge */}
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium mb-3 ${
            token.riskLevel === 'high' ? 'bg-red-900/30 text-red-400' :
            token.riskLevel === 'medium' ? 'bg-yellow-900/30 text-yellow-400' :
            token.riskLevel === 'low' ? 'bg-green-900/30 text-green-400' :
            'bg-dark-700 text-dark-400'
          }`}>
            {token.riskLevel === 'high' ? 'High Risk' :
             token.riskLevel === 'medium' ? 'Medium Risk' :
             token.riskLevel === 'low' ? 'Low Risk' : 'Unknown Risk'}
          </div>

          {/* Factors */}
          {hasFactors ? (
            <div className="space-y-1.5">
              {factors.map((f: RiskFactor) => (
                <div key={f.key} className={`flex items-center justify-between p-2 rounded text-[11px] ${severityColors[f.severity] || 'bg-dark-700 text-dark-300'}`}>
                  <span className="font-medium">{f.label}</span>
                  <span className="text-[10px] opacity-80">{f.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-dark-400 py-4 text-center">
              {token.riskLevel === 'unknown'
                ? 'Risk data unavailable. The signals API may be offline or this token was not found in GoPlus security database.'
                : 'No specific risk factors detected.'}
            </div>
          )}

          {/* Explorer links */}
          {!token.isNative && (
            <div className="mt-3 pt-3 border-t border-dark-700/50 flex gap-2">
              <a
                href={getExplorerTokenUrl(token.chainName, token.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
              >
                View on {getChainDisplayName(token.chainName) === 'BSC' ? 'BscScan' : getChainDisplayName(token.chainName) === 'Polygon' ? 'PolygonScan' : 'Etherscan'}
              </a>
              <a
                href={getDexScreenerUrl(token.chainName, token.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
              >
                DexScreener
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Token Card ───────────────────────────────────────────────────────

function TokenCard({
  token,
  onAdd,
  watchlistFull,
  onShowRisk,
  tokenRef,
}: {
  token: ScannedToken;
  onAdd: (token: ScannedToken) => void;
  watchlistFull: boolean;
  onShowRisk: (token: ScannedToken) => void;
  tokenRef?: React.Ref<HTMLDivElement>;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleAdd = () => {
    onAdd(token);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const handleCopyAddress = async () => {
    await navigator.clipboard.writeText(token.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const chainLabel = getChainDisplayName(token.chainName);
  const shortAddr = token.isNative ? 'Native' : shortAddress(token.address);

  const riskBadge = token.riskLevel && token.riskLevel !== 'unknown' && !token.isNative ? (
    <button
      onClick={() => onShowRisk(token)}
      className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
        token.riskLevel === 'high' ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' :
        token.riskLevel === 'medium' ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50' :
        'bg-green-900/30 text-green-400 hover:bg-green-900/50'
      }`}
    >
      {token.riskLevel === 'high' ? 'High' : token.riskLevel === 'medium' ? 'Med' : 'Low'}
    </button>
  ) : !token.isNative ? (
    <button
      onClick={() => onShowRisk(token)}
      className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer bg-dark-700/50 text-dark-500 hover:text-dark-300 transition-colors"
    >
      Why?
    </button>
  ) : null;

  return (
    <div ref={tokenRef} className="flex items-center gap-2 py-2 px-3 bg-dark-700/50 rounded-lg hover:bg-dark-700 transition-colors">
      {/* Token info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-white">{token.symbol}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-dark-600 text-dark-400 rounded">{chainLabel}</span>
          {token.source === 'custom' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/30 text-yellow-500 rounded">Custom</span>
          )}
          {riskBadge}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-dark-400 truncate">{token.name}</span>
          {!token.isNative ? (
            <button
              onClick={handleCopyAddress}
              className="text-[10px] text-dark-600 font-mono hover:text-dark-400 transition-colors"
              title="Copy address"
            >
              {copied ? 'Copied!' : shortAddr}
            </button>
          ) : (
            <span className="text-[10px] text-dark-600 font-mono">{shortAddr}</span>
          )}
          {!token.isNative && (
            <a
              href={getExplorerTokenUrl(token.chainName, token.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-dark-600 hover:text-primary-400 transition-colors"
              title={`View on ${getChainDisplayName(token.chainName)} explorer`}
            >
              &#8599;
            </a>
          )}
        </div>
      </div>

      {/* Balance */}
      <div className="text-right shrink-0">
        <div className="text-sm font-medium text-dark-200">{formatTokenBalance(token.balance)}</div>
        {token.usdValue !== undefined && token.usdValue > 0 && (
          <div className="text-[10px] text-dark-500">${token.usdValue.toFixed(2)}</div>
        )}
      </div>

      {/* Add button */}
      <div className="shrink-0 w-16">
        {token.isNative ? (
          <span className="text-[10px] text-dark-600 block text-center">{getChainNativeSymbol(token.chainName)}</span>
        ) : token.isWatched || justAdded ? (
          <span className="text-[10px] text-green-500 block text-center">
            {justAdded ? 'Added!' : 'Watched'}
          </span>
        ) : (
          <button
            onClick={handleAdd}
            disabled={watchlistFull}
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

// ─── Dust/Spam Filter Controls ────────────────────────────────────────

function DustFilterControls({
  hiddenCount,
}: {
  hiddenCount: number;
}) {
  const dustSettings = useScanStore((s) => s.dustSettings);
  const updateDustSettings = useScanStore((s) => s.updateDustSettings);

  return (
    <div className="flex items-center gap-3 text-[10px]">
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={dustSettings.hideDust}
          onChange={(e) => updateDustSettings({ hideDust: e.target.checked })}
          className="w-3 h-3 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500/30"
        />
        <span className="text-dark-400">Hide dust</span>
      </label>
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={dustSettings.hideSpam}
          onChange={(e) => updateDustSettings({ hideSpam: e.target.checked })}
          className="w-3 h-3 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500/30"
        />
        <span className="text-dark-400">Hide spam</span>
      </label>
      {hiddenCount > 0 && (
        <span className="text-dark-600 ml-auto">{hiddenCount} hidden</span>
      )}
    </div>
  );
}

// ─── Scan Log Feed (grouped by chain) ─────────────────────────────────

function ScanLogFeed({ logs }: { logs: ScanLogEntry[] }) {
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  // Group by chain
  const grouped = useMemo(() => {
    const groups: Record<string, ScanLogEntry[]> = { general: [] };
    for (const log of logs) {
      const key = log.chain || 'general';
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    }
    return groups;
  }, [logs]);

  const handleCopyLogs = async () => {
    const text = logs.map((l) => {
      const ts = new Date(l.timestamp).toISOString().slice(11, 23);
      const chain = l.chain ? `[${l.chain.toUpperCase().slice(0, 3)}]` : '     ';
      return `${ts} ${chain} [${l.level.toUpperCase()}] ${l.message}`;
    }).join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-dark-500">Scan Logs</span>
        <button
          onClick={handleCopyLogs}
          className="text-[10px] text-dark-600 hover:text-dark-400 transition-colors"
        >
          {copiedLogs ? 'Copied!' : 'Copy logs'}
        </button>
      </div>
      <div className="max-h-32 overflow-y-auto text-[10px] font-mono space-y-0.5 bg-dark-900/30 rounded p-2">
        {Object.entries(grouped).map(([chain, chainLogs]) => (
          <div key={chain}>
            {chain !== 'general' && (
              <div className="text-dark-600 mt-1 first:mt-0">-- {chain} --</div>
            )}
            {chainLogs.map((log, i) => {
              const ts = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div key={i} className={`flex gap-1 ${
                  log.level === 'error' ? 'text-red-400' :
                  log.level === 'warn' ? 'text-yellow-500' : 'text-dark-500'
                }`}>
                  <span className="text-dark-700 shrink-0">{ts}</span>
                  <span>{log.message}</span>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

// ─── Saved Scans ──────────────────────────────────────────────────────

function SavedScans() {
  const savedSessions = useScanStore((s) => s.savedSessions);
  const clearSaved = useScanStore((s) => s.clearSavedSessions);

  if (savedSessions.length === 0) {
    return <div className="text-xs text-dark-500 text-center py-2">No saved scans</div>;
  }

  return (
    <div className="space-y-1 mb-3">
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

// ─── Filter types ─────────────────────────────────────────────────────

type SortBy = 'balance' | 'chain' | 'symbol' | 'risk';
type FilterChain = 'all' | ScanChainName;

// ─── Main Component ───────────────────────────────────────────────────

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
  const dustSettings = useScanStore((s) => s.dustSettings);
  const startScan = useScanStore((s) => s.startScan);
  const cancelScan = useScanStore((s) => s.cancelScan);
  const retryChain = useScanStore((s) => s.retryChain);
  const skipChain = useScanStore((s) => s.skipChain);
  const addToken = useScanStore((s) => s.addTokenToWatchlist);
  const addAll = useScanStore((s) => s.addAllToWatchlist);
  const resetSession = useScanStore((s) => s.resetSession);
  const getDebugInfo = useScanStore((s) => s.getDebugInfo);

  // UI state
  const [sortBy, setSortBy] = useState<SortBy>('balance');
  const [filterChain, setFilterChain] = useState<FilterChain>('all');
  const [showLogs, setShowLogs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddAllConfirm, setShowAddAllConfirm] = useState(false);
  const [copiedDebug, setCopiedDebug] = useState(false);
  const [riskDrawerToken, setRiskDrawerToken] = useState<ScannedToken | null>(null);
  const [customAddress, setCustomAddress] = useState('');
  const [addressError, setAddressError] = useState('');

  // Token refs for scroll-to
  const tokenRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== 'scanning' || !session) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - session.startedAt);
    }, 500);
    return () => clearInterval(interval);
  }, [status, session]);

  // All tokens from all chains
  const allTokens: ScannedToken[] = useMemo(() => {
    if (!session) return [];
    return Object.values(session.chains).flatMap((c) => c.tokens);
  }, [session]);

  // Apply dust/spam classification
  const classifiedTokens = useMemo(() => {
    return allTokens.map((t) => {
      const bal = parseFloat(t.balance);
      const isDust = t.usdValue !== undefined
        ? t.usdValue < dustSettings.dustUsdThreshold
        : bal < dustSettings.dustBalanceThreshold;
      const isSpam = t.riskLevel === 'high' && !t.isNative;
      return { ...t, isDust: isDust && !t.isNative, isSpam };
    });
  }, [allTokens, dustSettings]);

  // Count hidden
  const hiddenCount = useMemo(() => {
    let count = 0;
    for (const t of classifiedTokens) {
      if (dustSettings.hideDust && t.isDust) count++;
      else if (dustSettings.hideSpam && t.isSpam) count++;
    }
    return count;
  }, [classifiedTokens, dustSettings]);

  // Filtered + sorted tokens
  const displayTokens = useMemo(() => {
    let tokens = [...classifiedTokens];

    // Filter by chain
    if (filterChain !== 'all') {
      tokens = tokens.filter((t) => t.chainName === filterChain);
    }

    // Filter dust
    if (dustSettings.hideDust) {
      tokens = tokens.filter((t) => !t.isDust);
    }

    // Filter spam
    if (dustSettings.hideSpam) {
      tokens = tokens.filter((t) => !t.isSpam);
    }

    // Sort
    const riskOrder: Record<string, number> = { high: 0, medium: 1, unknown: 2, low: 3 };
    tokens.sort((a, b) => {
      if (sortBy === 'balance') {
        return parseFloat(b.balance) - parseFloat(a.balance);
      }
      if (sortBy === 'chain') {
        return a.chainName.localeCompare(b.chainName) || a.symbol.localeCompare(b.symbol);
      }
      if (sortBy === 'risk') {
        return (riskOrder[a.riskLevel || 'unknown'] ?? 2) - (riskOrder[b.riskLevel || 'unknown'] ?? 2);
      }
      return a.symbol.localeCompare(b.symbol);
    });

    return tokens;
  }, [classifiedTokens, filterChain, dustSettings, sortBy]);

  // Addable tokens (non-native, not already watched)
  const addableTokens = useMemo(
    () => displayTokens.filter((t) => !t.isNative && !t.isWatched),
    [displayTokens],
  );

  const watchlistFull = watchlistCount >= 20;
  const isScanning = status === 'scanning';

  const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

  const handleStartScan = useCallback(() => {
    const targetAddress = customAddress.trim() || walletAddress;
    if (!targetAddress) return;
    if (!isValidAddress(targetAddress)) {
      setAddressError('Invalid address. Must be 0x followed by 40 hex characters.');
      return;
    }
    setAddressError('');
    startScan(targetAddress);
  }, [customAddress, walletAddress, startScan]);

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

  const handleScrollToToken = useCallback((token: ScannedToken) => {
    const key = `${token.chainId}-${token.address}`;
    const el = tokenRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-1', 'ring-primary-500/50');
      setTimeout(() => el.classList.remove('ring-1', 'ring-primary-500/50'), 2000);
    }
  }, []);

  // Chains needing attention (failed or degraded)
  const problemChains = session
    ? Object.values(session.chains).filter((c) => c.status === 'failed' || c.status === 'degraded')
    : [];

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
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

      {/* Trust banner */}
      <TrustBanner />

      {/* Saved scans history */}
      {showHistory && <SavedScans />}

      {/* ─── Idle State ───────────────────────────────────── */}
      {status === 'idle' ? (
        <div>
          <p className="text-xs text-dark-400 mb-3">
            Detect tokens across ETH, BSC, and Polygon. Add to watchlist for automatic signal monitoring.
          </p>

          {/* Address input */}
          <div className="mb-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={customAddress}
                onChange={(e) => { setCustomAddress(e.target.value); setAddressError(''); }}
                placeholder={walletAddress ? `${shortAddress(walletAddress)} (connected)` : 'Enter wallet address (0x...)'}
                className="flex-1 bg-dark-900/50 border border-dark-600/50 rounded-lg px-3 py-2 text-xs text-dark-200 placeholder-dark-600 outline-none focus:border-primary-600/50 font-mono"
                aria-label="Wallet address to scan"
                spellCheck={false}
              />
              {customAddress && (
                <button
                  onClick={() => { setCustomAddress(''); setAddressError(''); }}
                  className="px-2 text-dark-500 hover:text-dark-300 text-xs transition-colors"
                  aria-label="Clear address"
                >
                  Clear
                </button>
              )}
            </div>
            {addressError && (
              <p className="text-[10px] text-red-400 mt-1">{addressError}</p>
            )}
            {isConnected && !customAddress && (
              <p className="text-[10px] text-dark-600 mt-1">Leave empty to scan your connected wallet</p>
            )}
          </div>

          <button
            onClick={handleStartScan}
            disabled={!customAddress.trim() && !walletAddress}
            className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${
              !customAddress.trim() && !walletAddress
                ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                : 'bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 border border-primary-600/30'
            }`}
            aria-label="Start wallet scan"
          >
            {customAddress.trim() ? (
              <>
                Scan {shortAddress(customAddress.trim())}
              </>
            ) : walletAddress ? (
              <>
                Scan My Wallet
                <span className="ml-2 text-dark-500 text-xs">
                  ({20 - watchlistCount} slots available)
                </span>
              </>
            ) : (
              'Enter an address to scan'
            )}
          </button>
        </div>
      ) : (
        /* ─── Scanning / Results State ─────────────────── */
        <div className="space-y-3">
          {/* Per-chain progress */}
          {session && (
            <div className="space-y-2 p-3 bg-dark-900/50 rounded-lg">
              {ALL_SCAN_CHAINS.map((chain) => (
                <ChainProgressBar
                  key={chain}
                  progress={session.chains[chain]}
                  onRetry={(rpcIndex) => retryChain(chain, rpcIndex)}
                  onSkip={() => skipChain(chain)}
                  onSwitchRpc={(rpcIndex) => retryChain(chain, rpcIndex)}
                />
              ))}

              {/* Elapsed time */}
              {isScanning && (
                <div className="text-[10px] text-dark-600 text-right mt-1">
                  {formatElapsed(elapsed)} elapsed
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

          {/* Portfolio Summary */}
          {allTokens.length > 0 && session && (
            <PortfolioSummary
              tokens={allTokens}
              session={session}
              watchlistCount={watchlistCount}
              onScrollToToken={handleScrollToToken}
            />
          )}

          {/* Dust/spam filters + Sort + Chain filters */}
          {allTokens.length > 0 && (
            <div className="space-y-2">
              <DustFilterControls hiddenCount={hiddenCount} />

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
                  <option value="risk">Sort: Risk</option>
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
            <div className="space-y-1 max-h-96 overflow-y-auto" role="list" aria-label="Scanned tokens">
              {displayTokens.map((token) => {
                const key = `${token.chainId}-${token.address}`;
                return (
                  <TokenCard
                    key={key}
                    token={token}
                    onAdd={addToken}
                    watchlistFull={watchlistFull}
                    onShowRisk={setRiskDrawerToken}
                    tokenRef={(el: HTMLDivElement | null) => {
                      if (el) tokenRefs.current.set(key, el);
                      else tokenRefs.current.delete(key);
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!isScanning && allTokens.length === 0 && (
            <div className="text-center py-4 text-xs">
              {problemChains.length === Object.keys(session?.chains || {}).length ? (
                <div className="text-red-400">
                  All chain scans failed. Check your internet connection and retry.
                </div>
              ) : (
                <div className="text-dark-400">
                  No ERC-20 tokens with non-zero balances found in your wallet.
                  <br />
                  <span className="text-dark-500">
                    We check popular tokens across 3 chains.
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
              {showLogs ? 'Hide logs' : 'Show scan logs'}
            </button>
            {showLogs && <ScanLogFeed logs={logs} />}
          </div>
        </div>
      )}

      {/* Connected Wallet Info */}
      {isConnected && walletAddress && (
        <div className="mt-3 flex items-center justify-between text-[10px]">
          <span className="text-dark-500">Connected:</span>
          <a
            href={getExplorerAddressUrl('ethereum', walletAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dark-400 font-mono hover:text-primary-400 transition-colors"
          >
            {shortAddress(walletAddress)}
          </a>
        </div>
      )}

      {/* Risk drawer */}
      {riskDrawerToken && (
        <RiskDrawer token={riskDrawerToken} onClose={() => setRiskDrawerToken(null)} />
      )}
    </div>
  );
}

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
