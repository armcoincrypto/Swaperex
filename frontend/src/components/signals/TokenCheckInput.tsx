/**
 * Token Intelligence Panel
 *
 * Professional token analysis with risk assessment, liquidity monitoring,
 * signal history, and debug information. Supports graceful degradation
 * when individual data providers are unavailable.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSignalHistoryStore, formatRelativeTime, getSeverityColor, getSeverityIcon } from '@/stores/signalHistoryStore';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { useSignalFilterStore, shouldShowSignal } from '@/stores/signalFilterStore';
import {
  fetchSignalsWithHistory,
  clearSignalsCache,
  type SignalHistoryCapture,
  type SignalsResponse,
  type OverallSeverity,
  type ProviderInfo,
  SEVERITY_EXPLANATIONS,
  RISK_FACTOR_EXPLANATIONS,
  LIQUIDITY_EXPLANATIONS,
} from '@/services/signalsHealth';
import { TokenDisplay } from '@/components/common/TokenDisplay';
import { getTokenMeta } from '@/services/tokenMeta';
import { type TokenMeta } from '@/stores/tokenMetaStore';
import { QuickActions } from '@/components/signals/QuickActions';
import { RiskScoreBreakdown } from '@/components/signals/RiskScoreBreakdown';
import { useDebugMode } from '@/stores/debugStore';

// ── Constants ──────────────────────────────────────────────────────

const CHAINS = [
  { id: 1, name: 'ETH', label: 'Ethereum' },
  { id: 56, name: 'BSC', label: 'BNB Chain' },
  { id: 8453, name: 'Base', label: 'Base' },
  { id: 42161, name: 'ARB', label: 'Arbitrum' },
];

const DEBOUNCE_MS = 300;

type ActiveTab = 'summary' | 'risk' | 'liquidity' | 'history' | 'debug';

// ── Helpers ────────────────────────────────────────────────────────

function getChainName(id: number): string {
  return CHAINS.find((c) => c.id === id)?.label || `Chain ${id}`;
}

function isValidEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function detectInputType(input: string): 'address' | 'ens' | 'native' | 'invalid' {
  if (!input.trim()) return 'invalid';
  if (isValidEthAddress(input)) return 'address';
  if (input.endsWith('.eth') || input.endsWith('.bnb')) return 'ens';
  if (['ETH', 'BNB', 'MATIC', 'AVAX'].includes(input.toUpperCase())) return 'native';
  return 'invalid';
}

function getInputHelp(input: string): string | null {
  const type = detectInputType(input);
  if (type === 'ens') return 'ENS names are not supported yet. Please paste the token contract address.';
  if (type === 'native') return 'Native tokens (ETH, BNB) are not ERC-20 contracts. Enter a token contract address instead.';
  if (input.length > 0 && input.length < 42 && input.startsWith('0x')) return 'Address looks incomplete. Should be 42 characters (0x + 40 hex).';
  return null;
}

function getSeverityBadge(severity: OverallSeverity): { bg: string; text: string; label: string } {
  switch (severity) {
    case 'critical': return { bg: 'bg-red-900/40 border-red-700/50', text: 'text-red-400', label: 'CRITICAL' };
    case 'danger': return { bg: 'bg-orange-900/40 border-orange-700/50', text: 'text-orange-400', label: 'DANGER' };
    case 'warning': return { bg: 'bg-yellow-900/40 border-yellow-700/50', text: 'text-yellow-400', label: 'WARNING' };
    case 'safe': return { bg: 'bg-green-900/40 border-green-700/50', text: 'text-green-400', label: 'SAFE' };
    default: return { bg: 'bg-dark-700 border-dark-600', text: 'text-dark-400', label: 'UNKNOWN' };
  }
}

function getProviderBadge(info: ProviderInfo): { color: string; label: string } {
  switch (info.status) {
    case 'ok': return { color: 'text-green-400', label: `OK (${info.latencyMs}ms)` };
    case 'timeout': return { color: 'text-yellow-400', label: 'Timeout' };
    case 'error': return { color: 'text-red-400', label: 'Error' };
    default: return { color: 'text-dark-500', label: 'Unavailable' };
  }
}

// ── Component ──────────────────────────────────────────────────────

interface TokenCheckInputProps {
  className?: string;
}

export function TokenCheckInput({ className = '' }: TokenCheckInputProps) {
  // ── State ─────────────────────────────────────────
  const [tokenAddress, setTokenAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SignalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debug mode
  const debugEnabled = useDebugMode();

  // Wallet
  const walletChainId = useWalletStore((s) => s.chainId);
  const isConnected = useWalletStore((s) => s.isConnected);

  const [selectedChainId, setSelectedChainId] = useState(() => {
    const supported = CHAINS.find((c) => c.id === walletChainId);
    return supported ? walletChainId : 1;
  });

  useEffect(() => {
    if (isConnected) {
      const supported = CHAINS.find((c) => c.id === walletChainId);
      if (supported) setSelectedChainId(walletChainId);
    }
  }, [walletChainId, isConnected]);

  const chainMismatch = isConnected && selectedChainId !== walletChainId;

  // History
  const addHistoryEntry = useSignalHistoryStore((s) => s.addEntry);
  const historyEntries = useSignalHistoryStore((s) => s.entries);
  const clearHistory = useSignalHistoryStore((s) => s.clearHistory);

  // Watchlist
  const { addToken, hasToken, removeToken } = useWatchlistStore();
  const isValidAddr = isValidEthAddress(tokenAddress);
  const isWatching = isValidAddr && hasToken(selectedChainId, tokenAddress);

  // Filters
  const filters = useSignalFilterStore();

  // ── Handlers ──────────────────────────────────────

  const captureToHistory = useCallback((entry: SignalHistoryCapture) => {
    addHistoryEntry({ ...entry, timestamp: Date.now() });
  }, [addHistoryEntry]);

  const handleCheck = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!tokenAddress || !isValidEthAddress(tokenAddress)) {
      const help = getInputHelp(tokenAddress);
      setError(help || 'Enter a valid token address (0x followed by 40 hex characters)');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);
    setTokenMeta(null);
    setActiveTab('summary');

    try {
      const [meta, signalResponse] = await Promise.all([
        getTokenMeta(selectedChainId, tokenAddress.toLowerCase()),
        fetchSignalsWithHistory(
          selectedChainId,
          tokenAddress.toLowerCase(),
          undefined,
          captureToHistory
        ),
      ]);

      setTokenMeta(meta);

      if (!signalResponse) {
        setError('Failed to fetch signals. Backend may be offline.');
        return;
      }

      setResponse(signalResponse);

      // Auto-switch to risk tab if risk signals found
      if (signalResponse.risk && !signalResponse.liquidity) {
        setActiveTab('risk');
      } else if (signalResponse.liquidity && !signalResponse.risk) {
        setActiveTab('liquidity');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, selectedChainId, captureToHistory]);

  const handleRetry = useCallback(() => {
    clearSignalsCache();
    handleCheck();
  }, [handleCheck]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) handleCheck();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setTokenAddress(val);
    setError(null);

    // Clear debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Show input help after debounce
    if (val.length > 2) {
      debounceRef.current = setTimeout(() => {
        const help = getInputHelp(val);
        if (help && !isValidEthAddress(val)) setError(help);
      }, DEBOUNCE_MS);
    }
  };

  const handleToggleWatch = () => {
    if (!isValidAddr) return;
    if (isWatching) {
      removeToken(selectedChainId, tokenAddress);
    } else {
      const success = addToken({ chainId: selectedChainId, address: tokenAddress, symbol: tokenMeta?.symbol });
      if (!success) setError('Watchlist full (max 20 tokens)');
    }
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleExportHistory = () => {
    const data = JSON.stringify(historyEntries, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signal-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Cleanup debounce
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // ── Derived ───────────────────────────────────────

  const severity = response?.overallSeverity || 'unknown';
  const badge = getSeverityBadge(severity as OverallSeverity);
  const providers = response?.providers;

  // Filter history entries for current token
  const tokenHistory = isValidAddr
    ? historyEntries.filter(e => e.token.toLowerCase() === tokenAddress.toLowerCase())
    : historyEntries;

  const filteredHistory = tokenHistory.filter(e =>
    shouldShowSignal(
      { type: e.type, confidence: e.confidence, impact: e.impact },
      filters
    )
  );

  // ── Render ────────────────────────────────────────

  return (
    <div className={`bg-dark-800 rounded-xl ${className}`}>
      {/* ── Header ────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧠</span>
            <h3 className="text-sm font-medium text-dark-200">Token Intelligence</h3>
          </div>
          {response && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          )}
        </div>

        {/* Chain mismatch warning */}
        {chainMismatch && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-xs text-yellow-400">
            <span>!</span>
            <span>Checking {getChainName(selectedChainId)} while connected to {getChainName(walletChainId)}</span>
          </div>
        )}

        {/* ── Input Row ─────────────────────────────── */}
        <div className="flex gap-2">
          <select
            value={selectedChainId}
            onChange={(e) => { setSelectedChainId(Number(e.target.value)); setResponse(null); }}
            className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-dark-200 focus:outline-none focus:border-primary-500"
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input
            id="token-check-address"
            name="token-check-address"
            ref={inputRef}
            type="text"
            value={tokenAddress}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="0x... token contract address"
            className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-dark-200 placeholder-dark-500 focus:outline-none focus:border-primary-500 font-mono min-w-0"
          />

          <button
            onClick={handleCheck}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              loading
                ? 'bg-dark-600 text-dark-400 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-500'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 border-2 border-dark-400 border-t-transparent rounded-full animate-spin" />
                <span>Checking</span>
              </span>
            ) : 'Analyze'}
          </button>

          <button
            onClick={handleToggleWatch}
            disabled={!isValidAddr}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              !isValidAddr
                ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                : isWatching
                ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50'
                : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
            }`}
            title={isWatching ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {isWatching ? '★' : '☆'}
          </button>
        </div>

        {/* Error / input help */}
        {error && (
          <div className="mt-2 text-xs text-red-400 flex items-center justify-between">
            <span>{error}</span>
            {error.includes('Backend') && (
              <button onClick={handleRetry} className="text-primary-400 hover:text-primary-300 ml-2">
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Loading Skeleton ─────────────────────────── */}
      {loading && (
        <div className="px-4 pb-4 space-y-3">
          <div className="bg-dark-700/50 rounded-lg p-3 space-y-2 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-dark-600" />
              <div className="h-4 w-24 bg-dark-600 rounded" />
              <div className="h-3 w-16 bg-dark-600 rounded ml-auto" />
            </div>
            <div className="h-3 w-48 bg-dark-600 rounded" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 flex-1 bg-dark-700 rounded animate-pulse" />
            ))}
          </div>
          <div className="h-24 bg-dark-700/50 rounded animate-pulse" />
        </div>
      )}

      {/* ── Results ───────────────────────────────────── */}
      {response && !loading && (
        <div className="px-4 pb-4 space-y-3">
          {/* Token info header */}
          <div className="bg-dark-700/50 rounded-lg p-3">
            <div className="flex items-start justify-between">
              <TokenDisplay
                chainId={selectedChainId}
                address={tokenAddress}
                symbol={tokenMeta?.symbol}
                showPrice
                showChain
              />
              {/* Copy address */}
              <button
                onClick={handleCopyAddress}
                className="text-[10px] text-dark-500 hover:text-dark-300 transition-colors px-1"
                title="Copy address"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Quick action buttons */}
            <div className="mt-3 pt-2 border-t border-dark-600/50 flex items-center gap-2 flex-wrap">
              <QuickActions
                chainId={selectedChainId}
                address={tokenAddress}
                symbol={tokenMeta?.symbol}
                showSwap={false}
              />
            </div>

            {/* Provider status */}
            {providers && (
              <div className="mt-2 pt-2 border-t border-dark-600/50 flex items-center gap-4 text-[10px]">
                <span className="text-dark-500">Data sources:</span>
                {(['dexscreener', 'goplus'] as const).map(name => {
                  const info = providers[name];
                  const pBadge = getProviderBadge(info);
                  return (
                    <span key={name} className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${info.status === 'ok' ? 'bg-green-400' : info.status === 'timeout' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                      <span className="text-dark-400 capitalize">{name === 'dexscreener' ? 'DexScreener' : 'GoPlus'}</span>
                      <span className={pBadge.color}>{pBadge.label}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Overall severity explanation */}
          {severity !== 'unknown' && (
            <div className={`px-3 py-2 rounded-lg border text-xs ${badge.bg}`}>
              <div className="flex items-center gap-2">
                <span className={`font-medium ${badge.text}`}>
                  {severity === 'safe' ? 'No Signals Detected' : `${badge.label} Risk Level`}
                </span>
              </div>
              <p className="text-dark-400 mt-1 text-[11px] leading-relaxed">
                {SEVERITY_EXPLANATIONS[severity] || SEVERITY_EXPLANATIONS.safe}
              </p>
            </div>
          )}

          {/* ── Tabs ──────────────────────────────────── */}
          <div className="flex gap-1 bg-dark-900/50 rounded-lg p-1">
            {([
              { id: 'summary' as const, label: 'Summary' },
              { id: 'risk' as const, label: 'Risk', count: response.risk?.riskFactors?.length },
              { id: 'liquidity' as const, label: 'Liquidity', active: !!response.liquidity },
              { id: 'history' as const, label: 'History', count: filteredHistory.length },
              ...(debugEnabled ? [{ id: 'debug' as const, label: 'Debug' }] : []),
            ] as Array<{ id: ActiveTab; label: string; count?: number; active?: boolean }>).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-dark-700 text-dark-200'
                    : 'text-dark-500 hover:text-dark-300'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 px-1 py-0.5 rounded bg-dark-600 text-[9px]">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab Content ───────────────────────────── */}
          <div className="min-h-[120px]">
            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <SummaryTab response={response} />
            )}

            {/* Risk Tab */}
            {activeTab === 'risk' && (
              <RiskTab response={response} />
            )}

            {/* Liquidity Tab */}
            {activeTab === 'liquidity' && (
              <LiquidityTab response={response} />
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <HistoryTab
                entries={filteredHistory}
                onExport={handleExportHistory}
                onClear={clearHistory}
              />
            )}

            {/* Debug Tab */}
            {activeTab === 'debug' && debugEnabled && (
              <DebugTab response={response} chainId={selectedChainId} token={tokenAddress} />
            )}
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────── */}
      {!response && !error && !loading && (
        <div className="px-4 pb-4">
          <p className="text-[11px] text-dark-500 leading-relaxed">
            Enter any token contract address to analyze its risk profile and liquidity signals.
            Results include data from DexScreener (liquidity) and GoPlus (security audit).
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab Components ──────────────────────────────────────────────────

function SummaryTab({ response }: { response: SignalsResponse }) {
  const hasSignals = !!(response.liquidity || response.risk);

  if (!hasSignals) {
    return (
      <div className="text-center py-6">
        <div className="text-2xl mb-2">✓</div>
        <p className="text-green-400 text-sm font-medium">No Active Signals</p>
        <p className="text-dark-500 text-[11px] mt-1">
          No risk or liquidity warnings detected for this token.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Risk summary */}
      {response.risk && (
        <div className="bg-dark-700/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <span className="text-sm font-medium text-dark-200">Risk Analysis</span>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded ${getSeverityColor(response.risk.severity)}`}>
              {response.risk.severity.toUpperCase()}
            </span>
          </div>
          <div className="text-[11px] text-dark-400 space-y-1">
            <p>
              <span className="text-dark-300">Factors:</span>{' '}
              {response.risk.riskFactors.length} detected
              {response.risk.riskFactors.includes('honeypot') && (
                <span className="text-red-400 font-medium ml-1">HONEYPOT</span>
              )}
            </p>
            <p>
              <span className="text-dark-300">Confidence:</span>{' '}
              {Math.round(response.risk.confidence * 100)}%
            </p>
            <p>
              <span className="text-dark-300">Impact:</span>{' '}
              {response.risk.impact.score}/100 ({response.risk.impact.level})
            </p>
          </div>
        </div>
      )}

      {/* Liquidity summary */}
      {response.liquidity && (
        <div className="bg-dark-700/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">💧</span>
              <span className="text-sm font-medium text-dark-200">Liquidity Alert</span>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded ${getSeverityColor(response.liquidity.severity)}`}>
              {response.liquidity.severity.toUpperCase()}
            </span>
          </div>
          <div className="text-[11px] text-dark-400 space-y-1">
            <p>
              <span className="text-dark-300">Drop:</span>{' '}
              <span className="text-red-400 font-medium">{response.liquidity.dropPct.toFixed(1)}%</span>
              {' '}in {response.liquidity.window}
            </p>
            <p>
              <span className="text-dark-300">Confidence:</span>{' '}
              {Math.round(response.liquidity.confidence * 100)}%
            </p>
            <p>
              <span className="text-dark-300">Impact:</span>{' '}
              {response.liquidity.impact.score}/100 ({response.liquidity.impact.level})
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function RiskTab({ response }: { response: SignalsResponse }) {
  if (!response.risk) {
    const providerDown = response.providers?.goplus.status !== 'ok';
    return (
      <div className="text-center py-6">
        {providerDown ? (
          <>
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-yellow-400 text-sm font-medium">GoPlus Unavailable</p>
            <p className="text-dark-500 text-[11px] mt-1">
              Risk analysis provider is temporarily unavailable. Try again later.
            </p>
          </>
        ) : (
          <>
            <div className="text-2xl mb-2">✓</div>
            <p className="text-green-400 text-sm font-medium">No Risk Signals</p>
            <p className="text-dark-500 text-[11px] mt-1">
              GoPlus security audit found no risk factors.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RiskScoreBreakdown
        impact={response.risk.impact}
        type="risk"
        riskFactors={response.risk.riskFactors}
      />

      {/* Risk factor explanations */}
      <div className="space-y-2">
        <p className="text-[10px] text-dark-500 font-medium uppercase tracking-wide">What this means</p>
        {response.risk.riskFactors.map(factor => (
          <div key={factor} className="bg-dark-700/50 rounded-lg px-3 py-2">
            <p className="text-[11px] text-dark-300 font-medium">
              {factor.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
            </p>
            <p className="text-[10px] text-dark-500 mt-0.5">
              {RISK_FACTOR_EXPLANATIONS[factor] || 'This risk factor may affect token safety.'}
            </p>
          </div>
        ))}
      </div>

      {/* Recurrence info */}
      <div className="text-[10px] text-dark-500 flex items-center gap-2">
        {response.risk.recurrence.isRepeat ? (
          <span>↻ {response.risk.recurrence.occurrences24h}x in 24h ({response.risk.recurrence.trend})</span>
        ) : (
          <span>🆕 First occurrence</span>
        )}
        {response.risk.escalated && (
          <span className="text-red-400">Escalated from {response.risk.previous}</span>
        )}
      </div>
    </div>
  );
}

function LiquidityTab({ response }: { response: SignalsResponse }) {
  if (!response.liquidity) {
    const providerDown = response.providers?.dexscreener.status !== 'ok';
    return (
      <div className="text-center py-6">
        {providerDown ? (
          <>
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-yellow-400 text-sm font-medium">DexScreener Unavailable</p>
            <p className="text-dark-500 text-[11px] mt-1">
              Liquidity data provider is temporarily unavailable. Try again later.
            </p>
          </>
        ) : (
          <>
            <div className="text-2xl mb-2">✓</div>
            <p className="text-green-400 text-sm font-medium">Liquidity Stable</p>
            <p className="text-dark-500 text-[11px] mt-1">
              No significant liquidity changes detected.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RiskScoreBreakdown
        impact={response.liquidity.impact}
        type="liquidity"
        liquidityDropPct={response.liquidity.dropPct}
      />

      {/* Liquidity explanation */}
      <div className="bg-dark-700/50 rounded-lg px-3 py-2">
        <p className="text-[10px] text-dark-500 font-medium uppercase tracking-wide mb-1">What this means</p>
        <p className="text-[11px] text-dark-400 leading-relaxed">
          {LIQUIDITY_EXPLANATIONS[response.liquidity.severity] ||
            `Liquidity dropped ${response.liquidity.dropPct.toFixed(1)}% in the last ${response.liquidity.window}. This may indicate selling pressure or liquidity removal.`}
        </p>
      </div>

      {/* Recurrence */}
      <div className="text-[10px] text-dark-500 flex items-center gap-2">
        {response.liquidity.recurrence.isRepeat ? (
          <span>↻ {response.liquidity.recurrence.occurrences24h}x in 24h ({response.liquidity.recurrence.trend})</span>
        ) : (
          <span>🆕 First occurrence</span>
        )}
        {response.liquidity.escalated && (
          <span className="text-red-400">Escalated from {response.liquidity.previous}</span>
        )}
      </div>
    </div>
  );
}

function HistoryTab({
  entries,
  onExport,
  onClear,
}: {
  entries: ReturnType<typeof useSignalHistoryStore.getState>['entries'];
  onExport: () => void;
  onClear: () => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-dark-500 text-[11px]">No signal history yet. Check a token to start.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-dark-500">{entries.length} entries</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={onClear}
            className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {entries.slice(0, 20).map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-2 bg-dark-700/50 rounded px-3 py-2 text-[11px]"
          >
            <span>{getSeverityIcon(entry.severity)}</span>
            <span className="text-dark-300 font-medium truncate flex-1">
              {entry.tokenSymbol || entry.token.slice(0, 10)}
            </span>
            <span className="text-dark-500 capitalize">{entry.type}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${getSeverityColor(entry.severity)}`}>
              {entry.severity}
            </span>
            <span className="text-dark-600 text-[10px]">{formatRelativeTime(entry.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DebugTab({
  response,
  chainId,
  token,
}: {
  response: SignalsResponse;
  chainId: number;
  token: string;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="space-y-3 text-[10px]">
      {/* Meta */}
      <div className="bg-dark-700/50 rounded-lg p-3 font-mono space-y-1 text-dark-400">
        <p>chain: {chainId} | token: {token}</p>
        <p>timestamp: {new Date(response.timestamp).toISOString()}</p>
        <p>overallSeverity: {response.overallSeverity}</p>
        {response.debug && (
          <p>version: {response.debug.version} | evaluated: {new Date(response.debug.evaluatedAt).toISOString()}</p>
        )}
      </div>

      {/* Provider details */}
      {response.providers && (
        <div className="bg-dark-700/50 rounded-lg p-3 font-mono space-y-1 text-dark-400">
          <p className="text-dark-300 font-medium">Providers</p>
          {(['dexscreener', 'goplus'] as const).map(name => {
            const info = response.providers![name];
            return (
              <p key={name}>
                {name}: status={info.status} latency={info.latencyMs}ms
                {info.error && <span className="text-red-400"> error="{info.error}"</span>}
              </p>
            );
          })}
        </div>
      )}

      {/* Debug checks */}
      {response.debug && (
        <>
          {response.debug.liquidity && (
            <div className="bg-dark-700/50 rounded-lg p-3 font-mono space-y-1 text-dark-400">
              <p className="text-dark-300 font-medium">Liquidity Check</p>
              <p>passed: {String(response.debug.liquidity.check.passed)}</p>
              <p>reason: {response.debug.liquidity.check.reason}</p>
              <p>currentLiquidity: ${response.debug.liquidity.check.currentLiquidity?.toLocaleString() ?? 'n/a'}</p>
              <p>dropPct: {response.debug.liquidity.check.dropPct ?? 'n/a'}%</p>
              <p>threshold: {response.debug.liquidity.check.threshold}%</p>
              <p>cooldown: active={String(response.debug.liquidity.cooldown.active)} remaining={response.debug.liquidity.cooldown.remainingSeconds}s</p>
            </div>
          )}

          {response.debug.risk && (
            <div className="bg-dark-700/50 rounded-lg p-3 font-mono space-y-1 text-dark-400">
              <p className="text-dark-300 font-medium">Risk Check</p>
              <p>passed: {String(response.debug.risk.check.passed)}</p>
              <p>reason: {response.debug.risk.check.reason}</p>
              <p>honeypot: {String(response.debug.risk.check.isHoneypot)}</p>
              <p>factors ({response.debug.risk.check.riskFactorCount}): [{response.debug.risk.check.riskFactors.join(', ')}]</p>
              <p>cooldown: active={String(response.debug.risk.cooldown.active)} remaining={response.debug.risk.cooldown.remainingSeconds}s</p>
            </div>
          )}
        </>
      )}

      {/* Raw JSON toggle */}
      <div>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-primary-400 hover:text-primary-300 text-[10px]"
        >
          {showRaw ? 'Hide' : 'Show'} raw response
        </button>
        {showRaw && (
          <pre className="mt-2 bg-dark-900 rounded p-3 overflow-x-auto text-[9px] text-dark-500 max-h-[300px] overflow-y-auto">
            {JSON.stringify(response, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export default TokenCheckInput;
