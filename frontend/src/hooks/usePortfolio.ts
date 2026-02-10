/**
 * Portfolio Hook
 *
 * Fetches and manages multi-chain portfolio balances.
 * Supports EVM chains (ETH, BSC, Polygon, Arbitrum) and Solana.
 *
 * Production Hardening:
 *  - Per-chain fetching with backoff (skip chains in cooldown)
 *  - Partial failure: keep stale data for failed chains, show others
 *  - Refresh timing and health tracking via portfolioStore
 *  - Pricing status diagnostics
 *
 * SECURITY: Read-only operations, no signing required.
 */

import { useCallback, useState, useEffect } from 'react';
import {
  type Portfolio,
  type PortfolioChain,
  type ChainBalance,
  type PortfolioStatus,
  logPortfolioLifecycle,
  formatUsdValue,
} from '@/services/portfolioTypes';
import {
  fetchEvmChainBalance,
  isValidEvmAddress,
} from '@/services/evmBalanceService';
import {
  fetchSolanaBalance,
  isValidSolanaAddress,
} from '@/services/solanaBalanceService';
import {
  enrichEvmChainBalance,
  enrichSolanaChainBalance,
} from '@/services/priceService';
import {
  validateWalletAddress,
  categorizeError,
  formatErrorForDisplay,
  type PortfolioError,
} from '@/services/portfolioErrorHandler';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { isInBackoff } from '@/utils/chainHealth';

/**
 * Portfolio state
 */
interface PortfolioState {
  status: PortfolioStatus;
  portfolio: Portfolio | null;
  error: string | null;
  errorDetails: PortfolioError | null;
  lastUpdated: number | null;
}

/**
 * Default EVM chains to fetch
 */
const DEFAULT_EVM_CHAINS: PortfolioChain[] = ['ethereum', 'bsc', 'polygon', 'arbitrum'];

/** RPC timeout per chain (ms) */
const CHAIN_FETCH_TIMEOUT = 15_000;

/**
 * Portfolio hook options
 */
interface UsePortfolioOptions {
  autoFetch?: boolean;
  includeSolana?: boolean;
  evmChains?: PortfolioChain[];
  includeUsdPrices?: boolean;
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Portfolio hook
 *
 * Fetches multi-chain balances for a wallet address.
 * Per-chain backoff, partial failure support, and health tracking.
 */
export function usePortfolio(
  address: string | null,
  options: UsePortfolioOptions = {}
) {
  const {
    autoFetch = true,
    includeSolana = false,
    evmChains = DEFAULT_EVM_CHAINS,
    includeUsdPrices = true,
  } = options;

  const [state, setState] = useState<PortfolioState>({
    status: 'idle',
    portfolio: null,
    error: null,
    errorDetails: null,
    lastUpdated: null,
  });

  /**
   * Determine address type
   */
  const getAddressType = useCallback(
    (addr: string): 'evm' | 'solana' | null => {
      if (isValidEvmAddress(addr)) return 'evm';
      if (isValidSolanaAddress(addr)) return 'solana';
      return null;
    },
    []
  );

  /**
   * Fetch result from a single chain (no store calls — results are batched later)
   */
  interface SingleChainResult {
    chain: PortfolioChain;
    balance: ChainBalance | null;
    error: string | null;
    success: boolean;
    latencyMs: number;
    priced: number;
    totalTokens: number;
    priceError: string | null;
    skippedBackoff: boolean;
  }

  /**
   * Fetch a single EVM chain (pure — no store side-effects)
   */
  const fetchSingleChain = useCallback(
    async (addr: string, chain: PortfolioChain): Promise<SingleChainResult> => {
      const store = usePortfolioStore.getState();
      const health = store.chainHealth[chain];

      // Skip if in backoff — use stale data
      if (isInBackoff(health)) {
        logPortfolioLifecycle('Chain in backoff, using stale data', {
          chain,
          nextRetryAt: health?.nextRetryAt,
        });
        return {
          chain, balance: health?.staleData || null, error: 'In backoff',
          success: false, latencyMs: 0, priced: 0, totalTokens: 0,
          priceError: null, skippedBackoff: true,
        };
      }

      const startMs = Date.now();
      try {
        const rawBalance = await withTimeout(
          fetchEvmChainBalance(addr, chain),
          CHAIN_FETCH_TIMEOUT,
          chain
        );

        // Check if the service-level fetch had an error
        if (rawBalance.error) {
          if (health?.staleData) {
            return {
              chain, balance: health.staleData, error: rawBalance.error,
              success: false, latencyMs: Date.now() - startMs, priced: 0,
              totalTokens: 0, priceError: null, skippedBackoff: false,
            };
          }
          return {
            chain, balance: rawBalance, error: rawBalance.error,
            success: false, latencyMs: Date.now() - startMs, priced: 0,
            totalTokens: 0, priceError: null, skippedBackoff: false,
          };
        }

        // Enrich with prices
        let enriched = rawBalance;
        let priced = 0;
        let totalTokens = 0;
        let priceError: string | null = null;

        if (includeUsdPrices) {
          try {
            enriched = await withTimeout(
              enrichEvmChainBalance(rawBalance),
              CHAIN_FETCH_TIMEOUT,
              `${chain}-prices`
            );

            priced = [enriched.nativeBalance, ...enriched.tokenBalances]
              .filter((t) => t.usdPrice !== null && t.usdPrice !== undefined).length;
            totalTokens = 1 + enriched.tokenBalances.length;
          } catch (err) {
            logPortfolioLifecycle('Price enrichment failed, using raw balance', { chain });
            priceError = err instanceof Error ? err.message : 'Price fetch failed';
          }
        }

        return {
          chain, balance: enriched, error: null,
          success: true, latencyMs: Date.now() - startMs,
          priced, totalTokens, priceError, skippedBackoff: false,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        if (health?.staleData) {
          return {
            chain, balance: health.staleData, error: msg,
            success: false, latencyMs: Date.now() - startMs, priced: 0,
            totalTokens: 0, priceError: null, skippedBackoff: false,
          };
        }
        return {
          chain, balance: null, error: msg,
          success: false, latencyMs: Date.now() - startMs, priced: 0,
          totalTokens: 0, priceError: null, skippedBackoff: false,
        };
      }
    },
    [includeUsdPrices]
  );

  /**
   * Fetch portfolio for EVM address — per-chain with health tracking.
   * All store updates are batched into ONE set() call after all chains resolve.
   */
  const fetchEvmPortfolio = useCallback(
    async (addr: string): Promise<Portfolio> => {
      logPortfolioLifecycle('Fetching EVM portfolio (per-chain)', {
        address: addr.slice(0, 10) + '...',
        chains: evmChains,
      });

      const chains: Record<PortfolioChain, ChainBalance | null> = {
        ethereum: null,
        bsc: null,
        polygon: null,
        arbitrum: null,
        solana: null,
      };

      // Fetch all chains concurrently (3 chains = natural concurrency limit)
      const results = await Promise.all(
        evmChains.map((chain) => fetchSingleChain(addr, chain))
      );

      // Collect batch data from results
      let totalPriced = 0;
      let totalMissing = 0;
      let lastPriceError: string | null = null;

      const chainResults: Array<{
        chain: PortfolioChain;
        success: boolean;
        balance: ChainBalance | null;
        latencyMs: number;
        error: string | null;
      }> = [];

      for (const result of results) {
        chains[result.chain] = result.balance;

        // Don't record skipped (backoff) chains — their health is unchanged
        if (!result.skippedBackoff) {
          chainResults.push({
            chain: result.chain,
            success: result.success,
            balance: result.balance,
            latencyMs: result.latencyMs,
            error: result.error,
          });
        }

        totalPriced += result.priced;
        totalMissing += result.totalTokens - result.priced;
        if (result.priceError) lastPriceError = result.priceError;
      }

      // ONE batch store update for all chain health + pricing
      if (chainResults.length > 0) {
        usePortfolioStore.getState().batchRecordChainResults({
          chainResults,
          pricing: {
            lastFetchAt: Date.now(),
            lastError: lastPriceError,
            tokensPriced: totalPriced,
            tokensMissing: totalMissing,
          },
        });
      }

      // Calculate total USD value (only from chains that succeeded or have stale data)
      let totalUsd = 0;
      for (const balance of Object.values(chains)) {
        if (balance?.totalUsdValue) {
          totalUsd += parseFloat(balance.totalUsdValue);
        }
      }

      return {
        address: addr,
        addressType: 'evm',
        chains,
        totalUsdValue: totalUsd.toFixed(2),
        lastUpdated: Date.now(),
      };
    },
    [evmChains, fetchSingleChain]
  );

  /**
   * Fetch portfolio for Solana address
   */
  const fetchSolanaPortfolio = useCallback(
    async (addr: string): Promise<Portfolio> => {
      logPortfolioLifecycle('Fetching Solana portfolio', {
        address: addr.slice(0, 10) + '...',
      });

      const chains: Record<PortfolioChain, ChainBalance | null> = {
        ethereum: null,
        bsc: null,
        polygon: null,
        arbitrum: null,
        solana: null,
      };

      let solanaBalance = await withTimeout(
        fetchSolanaBalance(addr),
        CHAIN_FETCH_TIMEOUT,
        'solana'
      );

      if (includeUsdPrices) {
        try {
          solanaBalance = await withTimeout(
            enrichSolanaChainBalance(solanaBalance),
            CHAIN_FETCH_TIMEOUT,
            'solana-prices'
          );
        } catch {
          logPortfolioLifecycle('Solana price enrichment failed, using raw balance');
        }
      }

      chains.solana = solanaBalance;

      return {
        address: addr,
        addressType: 'solana',
        chains,
        totalUsdValue: solanaBalance.totalUsdValue,
        lastUpdated: Date.now(),
      };
    },
    [includeUsdPrices]
  );

  /**
   * Fetch full portfolio (EVM + optionally Solana)
   */
  const fetchPortfolio = useCallback(async () => {
    // Validate wallet address first
    const walletError = validateWalletAddress(address, 'portfolio');
    if (walletError) {
      setState({
        status: 'error',
        portfolio: null,
        error: formatErrorForDisplay(walletError),
        errorDetails: walletError,
        lastUpdated: null,
      });
      return;
    }

    const addr = address as string;
    const addressType = getAddressType(addr);

    if (!addressType) {
      const invalidError = categorizeError(new Error('Invalid wallet address'));
      setState({
        status: 'error',
        portfolio: null,
        error: formatErrorForDisplay(invalidError),
        errorDetails: invalidError,
        lastUpdated: null,
      });
      return;
    }

    setState((s) => ({ ...s, status: 'fetching', error: null, errorDetails: null }));

    try {
      let portfolio: Portfolio;

      if (addressType === 'solana') {
        portfolio = await fetchSolanaPortfolio(addr);
      } else {
        portfolio = await fetchEvmPortfolio(addr);

        if (includeSolana) {
          logPortfolioLifecycle('Solana not available for EVM address');
        }
      }

      logPortfolioLifecycle('Portfolio fetched', {
        totalUsdValue: formatUsdValue(portfolio.totalUsdValue),
        chains: Object.entries(portfolio.chains)
          .filter(([, v]) => v !== null)
          .map(([k]) => k),
      });

      setState({
        status: 'success',
        portfolio,
        error: null,
        errorDetails: null,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      const portfolioError = categorizeError(error);
      const displayMessage = formatErrorForDisplay(portfolioError);

      logPortfolioLifecycle('Portfolio error', {
        error: portfolioError.message,
        category: portfolioError.category,
      });

      setState((s) => ({
        ...s,
        status: 'error',
        error: displayMessage,
        errorDetails: portfolioError,
      }));
    }
  }, [
    address,
    getAddressType,
    fetchEvmPortfolio,
    fetchSolanaPortfolio,
    includeSolana,
  ]);

  /**
   * Refresh single chain
   */
  const refreshChain = useCallback(
    async (chain: PortfolioChain) => {
      if (!address || !state.portfolio) return;

      logPortfolioLifecycle('Refreshing chain', { chain });

      try {
        let balance: ChainBalance;

        if (chain === 'solana') {
          balance = await fetchSolanaBalance(address);
          if (includeUsdPrices) {
            balance = await enrichSolanaChainBalance(balance);
          }
        } else {
          balance = await fetchEvmChainBalance(address, chain);
          if (includeUsdPrices) {
            balance = await enrichEvmChainBalance(balance);
          }
        }

        setState((s) => {
          if (!s.portfolio) return s;

          const newChains = { ...s.portfolio.chains, [chain]: balance };

          let totalUsd = 0;
          for (const b of Object.values(newChains)) {
            if (b?.totalUsdValue) {
              totalUsd += parseFloat(b.totalUsdValue);
            }
          }

          return {
            ...s,
            portfolio: {
              ...s.portfolio,
              chains: newChains,
              totalUsdValue: totalUsd.toFixed(2),
              lastUpdated: Date.now(),
            },
            lastUpdated: Date.now(),
          };
        });
      } catch (error) {
        console.error(`[Portfolio] Failed to refresh ${chain}:`, error);
      }
    },
    [address, state.portfolio, includeUsdPrices]
  );

  /**
   * Auto-fetch on address change
   */
  useEffect(() => {
    if (autoFetch && address) {
      fetchPortfolio();
    }
  }, [autoFetch, address, fetchPortfolio]);

  /**
   * Get balance for specific chain
   */
  const getChainBalance = useCallback(
    (chain: PortfolioChain): ChainBalance | null => {
      return state.portfolio?.chains[chain] || null;
    },
    [state.portfolio]
  );

  /**
   * Get all non-zero balances across chains
   */
  const getAllBalances = useCallback(() => {
    if (!state.portfolio) return [];

    const balances: Array<{ chain: PortfolioChain; balance: ChainBalance }> = [];

    for (const [chain, balance] of Object.entries(state.portfolio.chains)) {
      if (balance && parseFloat(balance.totalUsdValue) > 0) {
        balances.push({ chain: chain as PortfolioChain, balance });
      }
    }

    return balances.sort(
      (a, b) => parseFloat(b.balance.totalUsdValue) - parseFloat(a.balance.totalUsdValue)
    );
  }, [state.portfolio]);

  return {
    status: state.status,
    portfolio: state.portfolio,
    error: state.error,
    errorDetails: state.errorDetails,
    lastUpdated: state.lastUpdated,
    isLoading: state.status === 'fetching',

    fetchPortfolio,
    refreshChain,

    getChainBalance,
    getAllBalances,
    totalUsdValue: state.portfolio?.totalUsdValue || '0',
    totalUsdFormatted: formatUsdValue(state.portfolio?.totalUsdValue || '0'),
  };
}

export default usePortfolio;
