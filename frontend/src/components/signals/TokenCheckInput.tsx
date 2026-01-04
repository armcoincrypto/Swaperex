/**
 * Token Check Input Component
 *
 * Allows users to manually enter a token address to check signals.
 * Shows impact + recurrence info for any token.
 *
 * Priority 10.3 - Manual Token Check
 * Priority 10.4 - Chain correctness fix
 * Priority 11.1 - Watchlist integration
 */

import { useState, useCallback, useEffect } from 'react';
import { useSignalHistoryStore } from '@/stores/signalHistoryStore';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { fetchSignalsWithHistory, type SignalHistoryCapture } from '@/services/signalsHealth';

// Supported chains
const CHAINS = [
  { id: 1, name: 'ETH', label: 'Ethereum' },
  { id: 56, name: 'BSC', label: 'BNB Chain' },
  { id: 8453, name: 'Base', label: 'Base' },
  { id: 42161, name: 'ARB', label: 'Arbitrum' },
];

// Get chain name by ID
function getChainName(id: number): string {
  const chain = CHAINS.find((c) => c.id === id);
  return chain?.label || `Chain ${id}`;
}

interface TokenCheckResult {
  hasSignals: boolean;
  liquidity?: {
    severity: string;
    confidence: number;
    dropPct: number;
    impact: { score: number; level: string };
    recurrence: { occurrences24h: number; trend: string; isRepeat: boolean };
  };
  risk?: {
    severity: string;
    confidence: number;
    riskFactors: string[];
    impact: { score: number; level: string };
    recurrence: { occurrences24h: number; trend: string; isRepeat: boolean };
  };
}

interface TokenCheckInputProps {
  className?: string;
}

export function TokenCheckInput({ className = '' }: TokenCheckInputProps) {
  const [tokenAddress, setTokenAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TokenCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get wallet chain info
  const walletChainId = useWalletStore((s) => s.chainId);
  const isConnected = useWalletStore((s) => s.isConnected);

  // Selected chain for checking (defaults to wallet chain)
  const [selectedChainId, setSelectedChainId] = useState(() => {
    // Default to wallet chain if supported, otherwise ETH
    const supported = CHAINS.find((c) => c.id === walletChainId);
    return supported ? walletChainId : 1;
  });

  // Sync with wallet chain when it changes
  useEffect(() => {
    if (isConnected) {
      const supported = CHAINS.find((c) => c.id === walletChainId);
      if (supported) {
        setSelectedChainId(walletChainId);
      }
    }
  }, [walletChainId, isConnected]);

  // Check if selected chain differs from wallet chain
  const chainMismatch = isConnected && selectedChainId !== walletChainId;

  const addHistoryEntry = useSignalHistoryStore((s) => s.addEntry);

  // Watchlist integration
  const { addToken, hasToken, removeToken } = useWatchlistStore();
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

  // Check if current token is valid and in watchlist
  const isValidAddress = tokenAddress?.startsWith('0x') && tokenAddress.length === 42;
  const isWatching = isValidAddress && hasToken(selectedChainId, tokenAddress);

  // Handle watch/unwatch
  const handleToggleWatch = () => {
    if (!isValidAddress) return;

    setWatchlistError(null);

    if (isWatching) {
      removeToken(selectedChainId, tokenAddress);
    } else {
      const success = addToken({
        chainId: selectedChainId,
        address: tokenAddress,
      });
      if (!success) {
        setWatchlistError('Watchlist full (max 20 tokens)');
      }
    }
  };

  const captureToHistory = useCallback((entry: SignalHistoryCapture) => {
    addHistoryEntry({
      ...entry,
      timestamp: Date.now(),
    });
  }, [addHistoryEntry]);

  const handleCheck = async () => {
    // Validate address
    if (!tokenAddress || !tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
      setError('Enter a valid token address (0x...)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetchSignalsWithHistory(
        selectedChainId,
        tokenAddress.toLowerCase(),
        undefined,
        captureToHistory
      );

      if (!response) {
        setError('Failed to fetch signals. Backend may be offline.');
        return;
      }

      const checkResult: TokenCheckResult = {
        hasSignals: !!(response.liquidity || response.risk),
      };

      if (response.liquidity) {
        checkResult.liquidity = {
          severity: response.liquidity.severity,
          confidence: response.liquidity.confidence,
          dropPct: response.liquidity.dropPct,
          impact: response.liquidity.impact,
          recurrence: response.liquidity.recurrence,
        };
      }

      if (response.risk) {
        checkResult.risk = {
          severity: response.risk.severity,
          confidence: response.risk.confidence,
          riskFactors: response.risk.riskFactors,
          impact: response.risk.impact,
          recurrence: response.risk.recurrence,
        };
      }

      setResult(checkResult);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleCheck();
    }
  };

  const getImpactColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return '⬆';
      case 'decreasing': return '⬇';
      case 'stable': return '➖';
      default: return '🆕';
    }
  };

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔍</span>
        <h3 className="text-sm font-medium text-dark-200">Check Token Signals</h3>
      </div>

      {/* Chain Mismatch Warning */}
      {chainMismatch && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-xs text-yellow-400">
          <span>⚠️</span>
          <span>
            Checking {getChainName(selectedChainId)} while connected to {getChainName(walletChainId)}
          </span>
        </div>
      )}

      {/* Input Row */}
      <div className="flex gap-2 mb-3">
        {/* Chain Selector */}
        <select
          value={selectedChainId}
          onChange={(e) => setSelectedChainId(Number(e.target.value))}
          className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-dark-200 focus:outline-none focus:border-primary-500"
        >
          {CHAINS.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>

        {/* Token Address Input */}
        <input
          type="text"
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0x... token address"
          className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-dark-200 placeholder-dark-500 focus:outline-none focus:border-primary-500 font-mono"
        />

        {/* Check Button */}
        <button
          onClick={handleCheck}
          disabled={loading}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            loading
              ? 'bg-dark-600 text-dark-400 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-500'
          }`}
        >
          {loading ? '...' : 'Check'}
        </button>

        {/* Watch Button */}
        <button
          onClick={handleToggleWatch}
          disabled={!isValidAddress}
          className={`px-3 py-2 rounded-lg text-sm transition-colors ${
            !isValidAddress
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

      {/* Error */}
      {error && (
        <div className="text-red-400 text-xs mb-3">
          {error}
        </div>
      )}

      {/* Watchlist Error */}
      {watchlistError && (
        <div className="text-orange-400 text-xs mb-3">
          {watchlistError}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-2">
          {!result.hasSignals && (
            <div className="text-green-400 text-sm flex items-center gap-2">
              <span>✓</span>
              <span>No active signals for this token</span>
            </div>
          )}

          {/* Risk Signal */}
          {result.risk && (
            <div className="bg-dark-700/50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-yellow-400 text-sm font-medium">
                  ⚠️ Risk Signal
                </span>
                <span className={`text-xs ${getImpactColor(result.risk.impact.level)}`}>
                  Impact: {result.risk.impact.score}/100
                </span>
              </div>
              <div className="text-xs text-dark-400">
                {result.risk.riskFactors.join(', ')}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-dark-500">
                <span>Confidence: {Math.round(result.risk.confidence * 100)}%</span>
                <span>
                  {result.risk.recurrence.isRepeat
                    ? `↻ ${result.risk.recurrence.occurrences24h}× ${getTrendIcon(result.risk.recurrence.trend)}`
                    : '🆕 First occurrence'}
                </span>
              </div>
            </div>
          )}

          {/* Liquidity Signal */}
          {result.liquidity && (
            <div className="bg-dark-700/50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-green-400 text-sm font-medium">
                  💧 Liquidity Signal
                </span>
                <span className={`text-xs ${getImpactColor(result.liquidity.impact.level)}`}>
                  Impact: {result.liquidity.impact.score}/100
                </span>
              </div>
              <div className="text-xs text-dark-400">
                Dropped {result.liquidity.dropPct}%
              </div>
              <div className="flex items-center gap-3 text-[10px] text-dark-500">
                <span>Confidence: {Math.round(result.liquidity.confidence * 100)}%</span>
                <span>
                  {result.liquidity.recurrence.isRepeat
                    ? `↻ ${result.liquidity.recurrence.occurrences24h}× ${getTrendIcon(result.liquidity.recurrence.trend)}`
                    : '🆕 First occurrence'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hint */}
      {!result && !error && (
        <p className="text-[10px] text-dark-500">
          Enter any token address to check for risk and liquidity signals.
        </p>
      )}
    </div>
  );
}

export default TokenCheckInput;
