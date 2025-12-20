/**
 * Swap Hook
 *
 * Combines quote fetching, approval, and swap execution.
 * ALL signing happens client-side via connected wallet.
 */

import { useCallback, useState } from 'react';
import { useWallet } from './useWallet';
import { useTransaction } from './useTransaction';
import { useSwapStore } from '@/stores/swapStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { swapsApi, transactionsApi } from '@/api';
import { toast } from '@/stores/toastStore';
import type { SwapQuoteResponse } from '@/types/api';

export type SwapStatus =
  | 'idle'
  | 'fetching_quote'
  | 'previewing'
  | 'approving'
  | 'swapping'
  | 'confirming'
  | 'success'
  | 'error';

interface SwapState {
  status: SwapStatus;
  quote: SwapQuoteResponse | null;
  txHash: string | null;
  error: string | null;
}

export function useSwap() {
  const { address, isWrongChain } = useWallet();
  const { executeTransaction } = useTransaction();
  const { fromAsset, toAsset, fromAmount, setQuote, clearQuote } = useSwapStore();
  const { fetchBalances } = useBalanceStore();

  const [state, setState] = useState<SwapState>({
    status: 'idle',
    quote: null,
    txHash: null,
    error: null,
  });

  // Reset state
  const reset = useCallback(() => {
    setState({ status: 'idle', quote: null, txHash: null, error: null });
    clearQuote();
  }, [clearQuote]);

  // Check if can swap
  const canSwap = address && fromAsset && toAsset && fromAmount && !isWrongChain;

  // Fetch swap quote with unsigned transaction
  const fetchSwapQuote = useCallback(async () => {
    if (!address || !fromAsset || !toAsset || !fromAmount) {
      return null;
    }

    setState((s) => ({ ...s, status: 'fetching_quote', error: null }));

    try {
      const fromSymbol = typeof fromAsset === 'string' ? fromAsset : fromAsset?.symbol || '';
      const toSymbol = typeof toAsset === 'string' ? toAsset : toAsset?.symbol || '';

      const quote = await swapsApi.getSwapQuote({
        from_asset: fromSymbol,
        to_asset: toSymbol,
        amount: fromAmount,
        from_address: address,
        slippage: 0.5,
      });

      if (!quote.success) {
        throw new Error(quote.error || 'Failed to get quote');
      }

      setState((s) => ({ ...s, status: 'previewing', quote }));
      setQuote(quote);
      return quote;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Quote failed';
      setState((s) => ({ ...s, status: 'error', error }));
      throw err;
    }
  }, [address, fromAsset, toAsset, fromAmount, setQuote]);

  // Execute the swap (with approval if needed)
  const executeSwap = useCallback(async () => {
    if (!state.quote || !state.quote.transaction) {
      throw new Error('No quote available');
    }

    try {
      const transaction = state.quote.transaction;
      const approval_needed = state.quote.approval_needed;

      // Step 1: Handle token approval if needed
      if (approval_needed) {
        setState((s) => ({ ...s, status: 'approving' }));
        toast.info('Approving token spending...');

        // Get approval transaction from backend
        const approvalTx = await transactionsApi.buildApproval(
          transaction.chain,
          getTokenAddress(state.quote.from_asset, transaction.chain),
          transaction.to,
          true
        );

        // User signs approval in wallet
        await executeTransaction(approvalTx);
        toast.success('Token approved!');
      }

      // Step 2: Execute the swap
      setState((s) => ({ ...s, status: 'swapping' }));
      toast.info('Confirm swap in your wallet...');

      // User signs swap in wallet
      const txHash = await executeTransaction(transaction);

      setState((s) => ({ ...s, status: 'confirming', txHash }));

      // Step 3: Wait for confirmation (already done in executeTransaction)
      setState((s) => ({ ...s, status: 'success', txHash }));
      toast.success('Swap completed!');

      // Refresh balances
      if (address) {
        await fetchBalances(address, [transaction.chain]);
      }

      return txHash;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Swap failed';
      setState((s) => ({ ...s, status: 'error', error }));

      // Parse specific error types
      if (error.includes('user rejected') || error.includes('User denied')) {
        toast.warning('Transaction cancelled');
      } else {
        toast.error(error);
      }

      throw err;
    }
  }, [state.quote, address, executeTransaction, fetchBalances]);

  // Full swap flow: fetch quote → preview → execute
  const swap = useCallback(async () => {
    // Validate
    if (!canSwap) {
      throw new Error('Cannot swap: check wallet connection and inputs');
    }

    if (isWrongChain) {
      throw new Error('Please switch to a supported network');
    }

    // Get fresh quote
    const quote = await fetchSwapQuote();
    if (!quote) {
      throw new Error('Failed to get quote');
    }

    // Return the quote for preview - actual execution happens when user confirms
    return quote;
  }, [canSwap, isWrongChain, fetchSwapQuote]);

  // Confirm and execute after preview
  const confirmSwap = useCallback(async () => {
    if (state.status !== 'previewing' || !state.quote) {
      throw new Error('No swap to confirm');
    }

    return executeSwap();
  }, [state.status, state.quote, executeSwap]);

  // Cancel preview
  const cancelPreview = useCallback(() => {
    if (state.status === 'previewing') {
      setState((s) => ({ ...s, status: 'idle', quote: null }));
    }
  }, [state.status]);

  return {
    // State
    ...state,
    canSwap,
    isWrongChain,

    // Actions
    swap,              // Initiate swap (gets quote, shows preview)
    confirmSwap,       // Execute after user confirms preview
    cancelPreview,     // Cancel the preview
    fetchSwapQuote,    // Just get quote without executing
    reset,
  };
}

// Helper to get token address (would use token registry in production)
function getTokenAddress(symbol: string, chain: string): string {
  // Native tokens don't need approval
  if (['ETH', 'BNB', 'MATIC', 'AVAX'].includes(symbol)) {
    return '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  }

  // Common stablecoins (mainnet addresses)
  const tokens: Record<string, Record<string, string>> = {
    ethereum: {
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      DAI: '0x6B175474E89094C44Da98b954EesNDC5cDo4aCb0',
    },
    bsc: {
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      USDT: '0x55d398326f99059fF775485246999027B3197955',
      BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    },
  };

  return tokens[chain]?.[symbol] || '0x0000000000000000000000000000000000000000';
}

export default useSwap;
