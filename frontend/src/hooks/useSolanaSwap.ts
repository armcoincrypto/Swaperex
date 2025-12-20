/**
 * Solana Swap Hook
 *
 * PHASE 12: Handles Solana swaps via Jupiter aggregator.
 * Follows the same lifecycle pattern as EVM swaps (useSwap.ts).
 *
 * Lifecycle:
 * idle → fetching_quote → previewing → swapping → confirming → success
 *
 * SECURITY:
 * - All signing happens in the wallet (Phantom/Solflare)
 * - Private keys never leave the wallet
 * - Jupiter API only provides unsigned transactions
 */

import { useCallback, useState } from 'react';
import { useSolanaWallet } from './useSolanaWallet';
import { toast } from '@/stores/toastStore';
import {
  getJupiterQuote,
  type JupiterQuoteResult,
} from '@/services/jupiterQuote';
import {
  buildJupiterSwapTx,
  deserializeTransaction,
  getSolanaExplorerUrl,
} from '@/services/jupiterTxBuilder';

/**
 * Solana swap status (mirrors EVM lifecycle)
 */
export type SolanaSwapStatus =
  | 'idle'
  | 'fetching_quote'
  | 'previewing'
  | 'swapping'
  | 'confirming'
  | 'success'
  | 'error';

/**
 * Solana swap state
 */
interface SolanaSwapState {
  status: SolanaSwapStatus;
  quote: JupiterQuoteResult | null;
  signature: string | null;
  explorerUrl: string | null;
  error: string | null;
}

/**
 * Extended quote for UI display
 */
export interface SolanaSwapQuote extends JupiterQuoteResult {
  fromSymbol: string;
  toSymbol: string;
  slippage: number;
  // UI-compatible fields
  success: boolean;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
  rate: string;
  price_impact: string;
  minimum_received: string;
}

/**
 * Log swap lifecycle state transitions
 */
function logLifecycle(
  fromStatus: SolanaSwapStatus | null,
  toStatus: SolanaSwapStatus,
  details?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const transition = fromStatus ? `${fromStatus} → ${toStatus}` : `→ ${toStatus}`;
  console.log(`[Solana Swap Lifecycle] ${timestamp} | ${transition}`, details || '');
}

/**
 * Default slippage (0.5% = 50 bps)
 */
const DEFAULT_SLIPPAGE_BPS = 50;

/**
 * Solana swap hook
 *
 * Provides quote fetching, preview, and execution for Solana swaps.
 */
export function useSolanaSwap() {
  const wallet = useSolanaWallet();

  const [state, setState] = useState<SolanaSwapState>({
    status: 'idle',
    quote: null,
    signature: null,
    explorerUrl: null,
    error: null,
  });

  const [swapQuote, setSwapQuote] = useState<SolanaSwapQuote | null>(null);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    logLifecycle(state.status, 'idle', { action: 'reset' });
    setState({
      status: 'idle',
      quote: null,
      signature: null,
      explorerUrl: null,
      error: null,
    });
    setSwapQuote(null);
  }, [state.status]);

  /**
   * Fetch swap quote from Jupiter
   */
  const fetchSwapQuote = useCallback(
    async (
      fromSymbol: string,
      toSymbol: string,
      fromAmount: string,
      slippageBps: number = DEFAULT_SLIPPAGE_BPS
    ): Promise<SolanaSwapQuote | null> => {
      if (!wallet.isConnected || !wallet.address) {
        toast.error('Please connect your Solana wallet');
        return null;
      }

      // Validate inputs
      if (!fromSymbol || !toSymbol) {
        toast.error('Please select both tokens');
        return null;
      }

      if (!fromAmount || parseFloat(fromAmount) <= 0) {
        toast.error('Please enter a valid amount');
        return null;
      }

      if (fromSymbol.toUpperCase() === toSymbol.toUpperCase()) {
        toast.error('Cannot swap a token to itself');
        return null;
      }

      logLifecycle(state.status, 'fetching_quote', { fromSymbol, toSymbol, fromAmount });
      setState((s) => ({ ...s, status: 'fetching_quote', error: null }));

      try {
        console.log('[SolanaSwap] Fetching quote:', { fromSymbol, toSymbol, fromAmount });

        const quote = await getJupiterQuote(fromSymbol, toSymbol, fromAmount, slippageBps);

        console.log('[SolanaSwap] Quote received:', {
          provider: 'jupiter',
          outAmount: quote.outAmountFormatted,
          priceImpact: quote.priceImpact,
        });

        // Calculate rate
        const rate = (
          parseFloat(quote.outAmountFormatted) / parseFloat(fromAmount)
        ).toFixed(6);

        // Build extended quote for UI
        const extendedQuote: SolanaSwapQuote = {
          ...quote,
          fromSymbol,
          toSymbol,
          slippage: slippageBps / 100,
          // UI-compatible fields
          success: true,
          from_asset: fromSymbol,
          to_asset: toSymbol,
          from_amount: fromAmount,
          to_amount: quote.outAmountFormatted,
          rate,
          price_impact: quote.priceImpact,
          minimum_received: quote.minOutAmountFormatted,
        };

        logLifecycle('fetching_quote', 'previewing', {
          provider: 'jupiter',
          quote: quote.outAmountFormatted,
          route: quote.route.join(' → '),
        });

        setState((s) => ({ ...s, status: 'previewing', quote }));
        setSwapQuote(extendedQuote);

        return extendedQuote;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get quote';
        console.error('[SolanaSwap] Quote error:', error);
        logLifecycle(state.status, 'error', { error: message });
        setState((s) => ({ ...s, status: 'error', error: message }));
        toast.error(message);
        return null;
      }
    },
    [wallet.isConnected, wallet.address, state.status]
  );

  /**
   * Execute the swap
   */
  const executeSwap = useCallback(async (): Promise<string> => {
    if (!swapQuote || !wallet.address) {
      throw new Error('No quote available');
    }

    try {
      logLifecycle(state.status, 'swapping', {
        from: swapQuote.fromSymbol,
        to: swapQuote.toSymbol,
        amount: swapQuote.from_amount,
      });
      setState((s) => ({ ...s, status: 'swapping' }));
      toast.info('Building transaction...');

      // Build swap transaction from Jupiter
      console.log('[SolanaSwap] Building swap transaction...');
      const txData = await buildJupiterSwapTx(
        swapQuote.quoteResponse,
        wallet.address
      );

      // Deserialize transaction for signing
      const transaction = deserializeTransaction(txData.serializedTransaction);

      toast.info('Confirm swap in your wallet...');

      // Sign and send (wallet signs locally)
      console.log('[SolanaSwap] Signing and sending...');
      const signature = await wallet.signAndSendTransaction(transaction);

      const explorerUrl = getSolanaExplorerUrl(signature);

      logLifecycle('swapping', 'confirming', { signature, explorerUrl });
      setState((s) => ({
        ...s,
        status: 'confirming',
        signature,
        explorerUrl,
      }));
      toast.info('Waiting for confirmation...');

      // Wait for confirmation
      const confirmed = await wallet.confirmTransaction(
        signature,
        txData.lastValidBlockHeight
      );

      if (confirmed) {
        logLifecycle('confirming', 'success', { signature, explorerUrl });
        setState((s) => ({ ...s, status: 'success' }));
        toast.success(`Swap completed! View on explorer: ${explorerUrl}`);
        return signature;
      } else {
        throw new Error('Transaction confirmation failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Swap failed';
      console.error('[SolanaSwap] Swap error:', error);

      // Check for user rejection
      if (
        message.includes('User rejected') ||
        message.includes('Transaction cancelled')
      ) {
        logLifecycle(state.status, 'previewing', { reason: 'user_rejected' });
        setState((s) => ({ ...s, status: 'previewing' }));
        toast.warning('Swap cancelled by user');
      } else {
        logLifecycle(state.status, 'error', { error: message });
        setState((s) => ({ ...s, status: 'error', error: message }));
        toast.error(`Swap failed: ${message}`);
      }

      throw error;
    }
  }, [swapQuote, wallet, state.status]);

  /**
   * Full swap flow: fetch quote → preview → (user confirms) → execute
   */
  const swap = useCallback(
    async (
      fromSymbol: string,
      toSymbol: string,
      fromAmount: string
    ): Promise<SolanaSwapQuote | null> => {
      // Validate wallet
      if (!wallet.isConnected) {
        toast.error('Please connect your Solana wallet');
        throw new Error('Wallet not connected');
      }

      logLifecycle(null, 'idle', {
        action: 'swap_initiated',
        fromSymbol,
        toSymbol,
        fromAmount,
        chain: 'solana',
      });

      // Fetch quote (returns for preview)
      const quote = await fetchSwapQuote(fromSymbol, toSymbol, fromAmount);
      return quote;
    },
    [wallet.isConnected, fetchSwapQuote]
  );

  /**
   * Confirm and execute after preview
   */
  const confirmSwap = useCallback(async (): Promise<string> => {
    if (state.status !== 'previewing' || !swapQuote) {
      throw new Error('No swap to confirm');
    }
    return executeSwap();
  }, [state.status, swapQuote, executeSwap]);

  /**
   * Cancel preview
   */
  const cancelPreview = useCallback(() => {
    if (state.status === 'previewing') {
      logLifecycle('previewing', 'idle', { action: 'cancel_preview' });
      setState((s) => ({
        ...s,
        status: 'idle',
        quote: null,
        explorerUrl: null,
      }));
      setSwapQuote(null);
    }
  }, [state.status]);

  return {
    // State
    ...state,
    swapQuote,
    isConnected: wallet.isConnected,
    address: wallet.address,
    walletName: wallet.walletName,
    isSolana: true as const,

    // Actions
    swap,
    confirmSwap,
    cancelPreview,
    fetchSwapQuote,
    reset,

    // Wallet actions
    connectWallet: wallet.connect,
    disconnectWallet: wallet.disconnect,
  };
}

export default useSolanaSwap;
