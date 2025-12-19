/**
 * Swap State Store
 *
 * Manages swap form state and quote fetching.
 */

import { create } from 'zustand';
import type { SwapQuoteResponse, AssetInfo } from '@/types/api';
import { swapsApi, quotesApi } from '@/api';

interface SwapState {
  // Form state
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  fromAmount: string;
  toAmount: string;
  slippage: number;

  // Quote state
  quote: SwapQuoteResponse | null;
  isQuoting: boolean;
  quoteError: string | null;

  // Transaction state
  isSwapping: boolean;
  txHash: string | null;

  // Actions
  setFromAsset: (asset: AssetInfo | null) => void;
  setToAsset: (asset: AssetInfo | null) => void;
  setFromAmount: (amount: string) => void;
  setSlippage: (slippage: number) => void;
  swapAssets: () => void;
  fetchQuote: (fromAddress: string) => Promise<void>;
  clearQuote: () => void;
  setSwapping: (swapping: boolean) => void;
  setTxHash: (hash: string | null) => void;
  reset: () => void;
}

export const useSwapStore = create<SwapState>((set, get) => ({
  // Initial state
  fromAsset: null,
  toAsset: null,
  fromAmount: '',
  toAmount: '',
  slippage: 0.5, // 0.5% default slippage
  quote: null,
  isQuoting: false,
  quoteError: null,
  isSwapping: false,
  txHash: null,

  // Set from asset
  setFromAsset: (asset) => {
    set({ fromAsset: asset, quote: null });
  },

  // Set to asset
  setToAsset: (asset) => {
    set({ toAsset: asset, quote: null });
  },

  // Set from amount
  setFromAmount: (amount) => {
    set({ fromAmount: amount, quote: null });
  },

  // Set slippage
  setSlippage: (slippage) => {
    set({ slippage });
  },

  // Swap from/to assets
  swapAssets: () => {
    const { fromAsset, toAsset, fromAmount, toAmount } = get();
    set({
      fromAsset: toAsset,
      toAsset: fromAsset,
      fromAmount: toAmount,
      toAmount: fromAmount,
      quote: null,
    });
  },

  // Fetch quote from backend
  fetchQuote: async (fromAddress: string) => {
    const { fromAsset, toAsset, fromAmount, slippage } = get();

    if (!fromAsset || !toAsset || !fromAmount || parseFloat(fromAmount) <= 0) {
      return;
    }

    set({ isQuoting: true, quoteError: null });

    try {
      const response = await swapsApi.getSwapQuote({
        from_asset: fromAsset.symbol,
        to_asset: toAsset.symbol,
        amount: fromAmount,
        from_address: fromAddress,
        slippage,
      });

      if (response.success) {
        set({
          quote: response,
          toAmount: response.to_amount,
          isQuoting: false,
        });
      } else {
        set({
          quote: null,
          quoteError: response.error || 'Failed to get quote',
          isQuoting: false,
        });
      }
    } catch (error) {
      set({
        quote: null,
        quoteError: error instanceof Error ? error.message : 'Quote failed',
        isQuoting: false,
      });
    }
  },

  // Clear quote
  clearQuote: () => {
    set({ quote: null, quoteError: null, toAmount: '' });
  },

  // Set swapping state
  setSwapping: (swapping) => {
    set({ isSwapping: swapping });
  },

  // Set transaction hash
  setTxHash: (hash) => {
    set({ txHash: hash });
  },

  // Reset all state
  reset: () => {
    set({
      fromAsset: null,
      toAsset: null,
      fromAmount: '',
      toAmount: '',
      quote: null,
      isQuoting: false,
      quoteError: null,
      isSwapping: false,
      txHash: null,
    });
  },
}));

export default useSwapStore;
