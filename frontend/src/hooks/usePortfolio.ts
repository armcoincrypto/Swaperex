/**
 * Portfolio Hook
 *
 * PHASE 13: Fetches and manages multi-chain portfolio balances.
 * Supports EVM chains (ETH, BSC, Polygon, Arbitrum) and Solana.
 *
 * Lifecycle: idle → fetching → success/error
 *
 * Error Handling:
 * - Validates wallet address before fetching
 * - Validates chain support
 * - Retry logic with exponential backoff for network errors
 * - Clear error categorization and user-friendly messages
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
  fetchMultiEvmBalances,
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
  validateChain,
  withRetry,
  categorizeError,
  formatErrorForDisplay,
  type PortfolioError,
} from '@/services/portfolioErrorHandler';

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
 * Portfolio hook
 *
 * Fetches multi-chain balances for a wallet address.
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
   * Fetch portfolio for EVM address
   */
  const fetchEvmPortfolio = useCallback(
    async (addr: string): Promise<Portfolio> => {
      // Filter to only supported chains
      const supportedChains = evmChains.filter((chain) => {
        const chainError = validateChain(chain, 'portfolio');
        if (chainError) {
          logPortfolioLifecycle('Skipping unsupported chain', { chain });
          return false;
        }
        return true;
      });

      logPortfolioLifecycle('Fetching EVM portfolio', {
        address: addr.slice(0, 10) + '...',
        chains: supportedChains,
        skippedChains: evmChains.filter((c) => !supportedChains.includes(c)),
      });

      const chains: Record<PortfolioChain, ChainBalance | null> = {
        ethereum: null,
        bsc: null,
        polygon: null,
        arbitrum: null,
        solana: null,
      };

      // Fetch all EVM chains with retry logic
      const evmBalances = await withRetry(
        () => fetchMultiEvmBalances(addr, supportedChains as string[]),
        { maxRetries: 2 },
        { operation: 'fetchMultiEvmBalances', chain: 'multi' }
      );

      // Enrich with USD prices if enabled (with retry)
      for (const [chain, balance] of Object.entries(evmBalances)) {
        try {
          if (includeUsdPrices) {
            chains[chain as PortfolioChain] = await withRetry(
              () => enrichEvmChainBalance(balance),
              { maxRetries: 1 },
              { operation: 'enrichEvmChainBalance', chain }
            );
          } else {
            chains[chain as PortfolioChain] = balance;
          }
        } catch (priceError) {
          // If price enrichment fails, use balance without prices
          logPortfolioLifecycle('Price enrichment failed, using raw balance', { chain });
          chains[chain as PortfolioChain] = balance;
        }
      }

      // Calculate total USD value
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
    [evmChains, includeUsdPrices]
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

      // Fetch Solana balance with retry
      let solanaBalance = await withRetry(
        () => fetchSolanaBalance(addr),
        { maxRetries: 2 },
        { operation: 'fetchSolanaBalance', chain: 'solana' }
      );

      // Enrich with USD prices if enabled (with retry)
      if (includeUsdPrices) {
        try {
          solanaBalance = await withRetry(
            () => enrichSolanaChainBalance(solanaBalance),
            { maxRetries: 1 },
            { operation: 'enrichSolanaChainBalance', chain: 'solana' }
          );
        } catch (priceError) {
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

    // Address is guaranteed non-null after validation
    const addr = address as string;
    const addressType = getAddressType(addr);

    if (!addressType) {
      const invalidError = categorizeError(new Error('Invalid wallet address'));
      logPortfolioLifecycle('Invalid address', { address: addr.slice(0, 10) + '...' });
      setState({
        status: 'error',
        portfolio: null,
        error: formatErrorForDisplay(invalidError),
        errorDetails: invalidError,
        lastUpdated: null,
      });
      return;
    }

    logPortfolioLifecycle('Fetching portfolio', {
      address: addr.slice(0, 10) + '...',
      addressType,
    });

    setState((s) => ({ ...s, status: 'fetching', error: null, errorDetails: null }));

    try {
      let portfolio: Portfolio;

      if (addressType === 'solana') {
        portfolio = await fetchSolanaPortfolio(addr);
      } else {
        portfolio = await fetchEvmPortfolio(addr);

        // Also fetch Solana if we have a Solana address in options
        if (includeSolana) {
          // Note: EVM address can't be used for Solana, would need separate address
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
      // Categorize the error for better handling
      const portfolioError = categorizeError(error);
      const displayMessage = formatErrorForDisplay(portfolioError);

      logPortfolioLifecycle('Portfolio error', {
        error: portfolioError.message,
        category: portfolioError.category,
        retryable: portfolioError.retryable,
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

          // Recalculate total
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

        logPortfolioLifecycle('Chain refreshed', {
          chain,
          usdValue: balance.totalUsdValue,
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
    // State
    status: state.status,
    portfolio: state.portfolio,
    error: state.error,
    errorDetails: state.errorDetails,
    lastUpdated: state.lastUpdated,
    isLoading: state.status === 'fetching',

    // Actions
    fetchPortfolio,
    refreshChain,

    // Helpers
    getChainBalance,
    getAllBalances,
    totalUsdValue: state.portfolio?.totalUsdValue || '0',
    totalUsdFormatted: formatUsdValue(state.portfolio?.totalUsdValue || '0'),
  };
}

export default usePortfolio;
