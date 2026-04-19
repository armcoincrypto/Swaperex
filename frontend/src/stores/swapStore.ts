/**
 * Swap State Store
 *
 * Manages swap form state and quote fetching.
 */

import { create } from 'zustand';
import type { SwapQuoteResponse, AssetInfo } from '@/types/api';
import type { QuoteRouteMode } from '@/services/quoteAggregator';

export type ApprovalMode = 'exact' | 'unlimited';

interface SwapState {
  // Form state
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  fromAmount: string;
  toAmount: string;
  slippage: number;
  approvalMode: ApprovalMode;
  /** Compare all sources vs fix one execution venue */
  routeMode: QuoteRouteMode;

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
  setApprovalMode: (mode: ApprovalMode) => void;
  setRouteMode: (mode: QuoteRouteMode) => void;
  swapAssets: () => void;
  clearQuote: () => void;
  setQuote: (quote: SwapQuoteResponse | null) => void;
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
  approvalMode: 'exact', // 'exact' = approve only needed amount (safer default)
  routeMode: 'best',
  quote: null,
  isQuoting: false,
  quoteError: null,
  isSwapping: false,
  txHash: null,

  // Set from asset - RULE 1: Clear derived state (quote, toAmount)
  setFromAsset: (asset) => {
    set({ fromAsset: asset, quote: null, toAmount: '', quoteError: null });
  },

  // Set to asset - RULE 1: Clear derived state (quote, toAmount)
  setToAsset: (asset) => {
    set({ toAsset: asset, quote: null, toAmount: '', quoteError: null });
  },

  // Set from amount - RULE 1: Clear derived state (quote, toAmount)
  setFromAmount: (amount) => {
    set({ fromAmount: amount, quote: null, toAmount: '', quoteError: null });
  },

  // Set slippage - RULE 1: Clear quote since minAmountOut depends on slippage
  setSlippage: (slippage) => {
    set({ slippage, quote: null, toAmount: '', quoteError: null });
  },

  // Set approval mode (exact vs unlimited)
  setApprovalMode: (mode) => {
    set({ approvalMode: mode });
  },

  setRouteMode: (mode) => {
    set({ routeMode: mode, quote: null, toAmount: '', quoteError: null });
  },

  // Swap from/to assets - RULE 1: Clear derived state
  swapAssets: () => {
    const { fromAsset, toAsset, fromAmount, toAmount } = get();
    set({
      fromAsset: toAsset,
      toAsset: fromAsset,
      fromAmount: toAmount,
      toAmount: fromAmount,
      quote: null,
      quoteError: null,
    });
  },

  // Clear quote
  clearQuote: () => {
    set({ quote: null, quoteError: null, toAmount: '' });
  },

  // Set quote directly
  setQuote: (quote) => {
    set({ quote, toAmount: quote?.to_amount || '' });
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
      slippage: 0.5,
      approvalMode: 'exact',
      routeMode: 'best',
      quote: null,
      isQuoting: false,
      quoteError: null,
      isSwapping: false,
      txHash: null,
    });
  },
}));

export default useSwapStore;
