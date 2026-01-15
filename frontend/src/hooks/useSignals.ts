/**
 * Signals Hook
 *
 * Fetches real-time signals from the backend signals API.
 * Signals include: liquidity drops, whale transfers, risk changes.
 */

import { useState, useEffect, useCallback } from 'react';

// Types matching backend
export interface LiquidityDropSignal {
  detected: boolean;
  percentageChange: number;
  window: string;
  previousUsd: number;
  currentUsd: number;
  timestamp: number;
}

export interface WhaleTransferSignal {
  detected: boolean;
  amountUsd: number;
  direction: 'in' | 'out' | 'unknown';
  txHash?: string;
  timestamp: number;
}

export interface RiskChangeSignal {
  detected: boolean;
  currentLevel: 'safe' | 'warning' | 'danger';
  previousLevel?: 'safe' | 'warning' | 'danger';
  changeDirection?: 'improved' | 'worsened';
  score: number;
  timestamp: number;
}

export interface SignalsData {
  liquidityDrop: LiquidityDropSignal | null;
  whaleTransfer: WhaleTransferSignal | null;
  riskChange: RiskChangeSignal | null;
}

export interface UseSignalsResult {
  signals: SignalsData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: number | null;
}

// Backend API URL - configurable via env
const SIGNALS_API_URL = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';

/**
 * Hook to fetch token signals from the backend
 */
export function useSignals(
  chainId: number | undefined,
  tokenAddress: string | undefined,
  options: { enabled?: boolean; refreshInterval?: number } = {}
): UseSignalsResult {
  const { enabled = true, refreshInterval = 120000 } = options; // 2 minute default

  const [signals, setSignals] = useState<SignalsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchSignals = useCallback(async () => {
    if (!chainId || !tokenAddress || !enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = `${SIGNALS_API_URL}/api/signals?chainId=${chainId}&token=${tokenAddress}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Signals API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setSignals(data.signals);
        setLastUpdated(Date.now());
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      console.warn('[useSignals] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch signals');
      // Don't clear existing signals on error - show stale data
    } finally {
      setIsLoading(false);
    }
  }, [chainId, tokenAddress, enabled]);

  // Fetch on mount and when params change
  useEffect(() => {
    if (enabled && chainId && tokenAddress) {
      fetchSignals();
    }
  }, [fetchSignals, enabled, chainId, tokenAddress]);

  // Auto-refresh
  useEffect(() => {
    if (!enabled || !chainId || !tokenAddress || refreshInterval <= 0) {
      return;
    }

    const interval = setInterval(fetchSignals, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchSignals, enabled, chainId, tokenAddress, refreshInterval]);

  return {
    signals,
    isLoading,
    error,
    refetch: fetchSignals,
    lastUpdated,
  };
}

/**
 * Check if any signal is active (detected = true)
 */
export function hasActiveSignal(signals: SignalsData | null): boolean {
  if (!signals) return false;
  return (
    signals.liquidityDrop?.detected ||
    signals.whaleTransfer?.detected ||
    signals.riskChange?.detected ||
    false
  );
}

/**
 * Get the most critical signal for display
 */
export function getMostCriticalSignal(
  signals: SignalsData | null
): { type: 'liquidity' | 'whale' | 'risk'; message: string } | null {
  if (!signals) return null;

  // Priority: risk worsened > liquidity drop > whale out > whale in
  if (signals.riskChange?.detected && signals.riskChange.changeDirection === 'worsened') {
    return {
      type: 'risk',
      message: `Risk changed: ${signals.riskChange.previousLevel} → ${signals.riskChange.currentLevel}`,
    };
  }

  if (signals.liquidityDrop?.detected) {
    return {
      type: 'liquidity',
      message: `Liquidity dropped ${Math.abs(signals.liquidityDrop.percentageChange).toFixed(0)}% in ${signals.liquidityDrop.window}`,
    };
  }

  if (signals.whaleTransfer?.detected && signals.whaleTransfer.direction === 'out') {
    const amount = (signals.whaleTransfer.amountUsd / 1000).toFixed(0);
    return {
      type: 'whale',
      message: `Large sell activity detected (~$${amount}K)`,
    };
  }

  if (signals.whaleTransfer?.detected && signals.whaleTransfer.direction === 'in') {
    const amount = (signals.whaleTransfer.amountUsd / 1000).toFixed(0);
    return {
      type: 'whale',
      message: `Large buy activity detected (~$${amount}K)`,
    };
  }

  if (signals.riskChange?.detected && signals.riskChange.changeDirection === 'improved') {
    return {
      type: 'risk',
      message: `Risk improved: ${signals.riskChange.previousLevel} → ${signals.riskChange.currentLevel}`,
    };
  }

  return null;
}

export default useSignals;
