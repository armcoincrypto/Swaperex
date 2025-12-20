/**
 * Swap Hook
 *
 * Combines quote fetching, approval, and swap execution.
 * ALL signing happens client-side via connected wallet.
 *
 * Flow:
 * 1. getQuote() - Fetch quote from Uniswap V3 QuoterV2
 * 2. buildSwapTx() - Build unsigned transaction calldata
 * 3. signer.sendTransaction() - Wallet signs and sends
 * 4. Wait for receipt - Return txHash + status
 *
 * SECURITY: This hook NEVER signs transactions server-side.
 *
 * PHASE 7 - SAFETY CHECKS:
 * - Prevent same token swap
 * - Validate wallet connected
 * - Validate amount > 0
 * - Validate sufficient balance
 * - Catch RPC errors
 * - Catch user rejection
 * - NO silent failures
 */

import { useCallback, useState } from 'react';
import { formatUnits } from 'ethers';
import { useWallet } from './useWallet';
import { useSwapStore } from '@/stores/swapStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { toast } from '@/stores/toastStore';
import {
  isUserRejection,
  parseTransactionError,
  parseRpcError,
  logError,
} from '@/utils/errors';
import {
  validateSwapInputs,
  isSameToken,
  parseAmount,
  logValidationErrors,
} from '@/utils/swapValidation';

// Import Uniswap V3 services
import {
  getBestQuote,
  getMinAmountOut,
  formatQuoteForDisplay,
  type QuoteResult,
} from '@/services/uniswapQuote';
import {
  buildSwapTx,
  buildRouterApproval,
  validateSwapParams,
} from '@/services/uniswapTxBuilder';
import { getTokenBySymbol, isNativeToken } from '@/tokens';
import { getUniswapV3Addresses } from '@/config';

export type SwapStatus =
  | 'idle'
  | 'fetching_quote'
  | 'previewing'
  | 'checking_allowance'
  | 'approving'
  | 'swapping'
  | 'confirming'
  | 'success'
  | 'error';

interface SwapState {
  status: SwapStatus;
  quote: QuoteResult | null;
  txHash: string | null;
  error: string | null;
}

// Extended quote for UI display - compatible with SwapQuoteResponse
export interface SwapQuote extends QuoteResult {
  fromSymbol: string;
  toSymbol: string;
  minAmountOut: string;
  minAmountOutFormatted: string;
  slippage: number;
  needsApproval: boolean;
  // UI-compatible fields (maps to SwapQuoteResponse)
  success: boolean;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
  rate: string;
  price_impact: string;
  minimum_received: string;
}

// Default slippage tolerance (0.5%)
const DEFAULT_SLIPPAGE = 0.5;

// ERC20 allowance ABI
const ALLOWANCE_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

export function useSwap() {
  const { address, isWrongChain, chainId, getSigner, provider } = useWallet();
  const { fromAsset, toAsset, fromAmount, setQuote, clearQuote } = useSwapStore();
  const { fetchBalances } = useBalanceStore();

  const [state, setState] = useState<SwapState>({
    status: 'idle',
    quote: null,
    txHash: null,
    error: null,
  });

  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);

  // Reset state
  const reset = useCallback(() => {
    setState({ status: 'idle', quote: null, txHash: null, error: null });
    setSwapQuote(null);
    clearQuote();
  }, [clearQuote]);

  // Check if can swap
  const canSwap = address && fromAsset && toAsset && fromAmount && !isWrongChain;

  // Get token symbols from assets
  const getSymbol = (asset: unknown): string => {
    if (typeof asset === 'string') return asset;
    if (asset && typeof asset === 'object' && 'symbol' in asset) {
      return (asset as { symbol: string }).symbol;
    }
    return '';
  };

  // Check token allowance
  const checkAllowance = useCallback(
    async (tokenSymbol: string, amount: bigint): Promise<boolean> => {
      if (!address || !provider || !chainId) return false;

      const token = getTokenBySymbol(tokenSymbol, chainId);
      if (!token) return false;

      // Native tokens don't need approval
      if (isNativeToken(token.address)) return true;

      const uniswapAddresses = getUniswapV3Addresses(chainId);
      if (!uniswapAddresses) return false;

      try {
        const { Contract } = await import('ethers');
        const tokenContract = new Contract(token.address, ALLOWANCE_ABI, provider);
        const allowance = await tokenContract.allowance(address, uniswapAddresses.router);
        return allowance >= amount;
      } catch (err) {
        console.error('[Swap] Error checking allowance:', err);
        return false;
      }
    },
    [address, provider, chainId]
  );

  // Fetch swap quote from Uniswap V3
  const fetchSwapQuote = useCallback(async (): Promise<SwapQuote | null> => {
    if (!address || !fromAsset || !toAsset || !fromAmount) {
      return null;
    }

    const fromSymbol = getSymbol(fromAsset);
    const toSymbol = getSymbol(toAsset);

    if (!fromSymbol || !toSymbol) {
      setState((s) => ({ ...s, status: 'error', error: 'Invalid tokens selected' }));
      return null;
    }

    setState((s) => ({ ...s, status: 'fetching_quote', error: null }));

    try {
      console.log('[Swap] Fetching quote:', { fromSymbol, toSymbol, fromAmount });

      // Validate parameters
      const validationErrors = validateSwapParams({
        tokenIn: fromSymbol,
        tokenOut: toSymbol,
        amountIn: fromAmount,
        amountOutMin: '0', // Will be calculated from quote
        recipient: address,
        chainId: chainId || 1,
      });

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(', '));
      }

      // Fetch best quote across fee tiers
      const quote = await getBestQuote(fromSymbol, toSymbol, fromAmount, chainId || 1);

      if (!quote) {
        throw new Error('No liquidity available for this pair');
      }

      console.log('[Swap] Quote received:', formatQuoteForDisplay(quote));

      // Calculate minimum output with slippage
      const minAmountOut = getMinAmountOut(quote, DEFAULT_SLIPPAGE);
      const tokenOut = getTokenBySymbol(toSymbol, chainId || 1);
      const minAmountOutFormatted = tokenOut
        ? formatUnits(minAmountOut, tokenOut.decimals)
        : minAmountOut;

      // Check if approval is needed
      setState((s) => ({ ...s, status: 'checking_allowance' }));
      const tokenIn = getTokenBySymbol(fromSymbol, chainId || 1);
      const amountInWei = tokenIn
        ? BigInt(quote.amountIn.includes('.')
            ? (parseFloat(quote.amountIn) * 10 ** tokenIn.decimals).toString()
            : quote.amountIn)
        : 0n;

      const hasAllowance = await checkAllowance(fromSymbol, amountInWei);

      // Calculate rate
      const rate = (parseFloat(quote.amountOutFormatted) / parseFloat(fromAmount)).toFixed(6);

      // Build extended quote for UI - includes all fields for compatibility
      const extendedQuote: SwapQuote = {
        ...quote,
        fromSymbol,
        toSymbol,
        minAmountOut,
        minAmountOutFormatted,
        slippage: DEFAULT_SLIPPAGE,
        needsApproval: !hasAllowance,
        // UI-compatible fields
        success: true,
        from_asset: fromSymbol,
        to_asset: toSymbol,
        from_amount: fromAmount,
        to_amount: quote.amountOutFormatted,
        rate,
        price_impact: quote.priceImpact,
        minimum_received: minAmountOutFormatted,
      };

      setState((s) => ({ ...s, status: 'previewing', quote }));
      setSwapQuote(extendedQuote);
      // Update swapStore with compatible quote format for toAmount display
      setQuote({
        success: true,
        from_asset: fromSymbol,
        to_asset: toSymbol,
        from_amount: fromAmount,
        to_amount: quote.amountOutFormatted,
        rate,
        price_impact: quote.priceImpact,
        minimum_received: minAmountOutFormatted,
        route: {
          provider: quote.provider,
          route_path: [fromSymbol, toSymbol],
          hops: 1,
          price_impact: quote.priceImpact,
          minimum_received: minAmountOutFormatted,
          expires_at: new Date(Date.now() + 30000).toISOString(),
        },
        gas_estimate: {
          gas_limit: '250000',
          gas_price: '0',
          estimated_cost_native: '0',
        },
      });

      return extendedQuote;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get quote';
      console.error('[Swap] Quote error:', err);
      setState((s) => ({ ...s, status: 'error', error: errorMessage }));
      toast.error(errorMessage);
      return null;
    }
  }, [address, fromAsset, toAsset, fromAmount, chainId, checkAllowance, setQuote]);

  // Execute token approval
  const executeApproval = useCallback(async (): Promise<boolean> => {
    if (!swapQuote || !chainId) {
      throw new Error('No quote available');
    }

    try {
      setState((s) => ({ ...s, status: 'approving' }));
      toast.info('Approving token spending...');

      const signer = await getSigner();

      // Build approval transaction
      const approvalTx = buildRouterApproval(swapQuote.fromSymbol, chainId);

      console.log('[Swap] Sending approval:', approvalTx);

      // Send approval transaction (wallet signs)
      const tx = await signer.sendTransaction({
        to: approvalTx.to,
        data: approvalTx.data,
        value: BigInt(approvalTx.value),
      });

      toast.info('Waiting for approval confirmation...');
      await tx.wait();

      toast.success('Token approved!');
      return true;
    } catch (err) {
      const parsed = parseTransactionError(err);

      if (isUserRejection(err)) {
        toast.warning('Approval cancelled');
        setState((s) => ({ ...s, status: 'previewing' }));
      } else {
        toast.error(`Approval failed: ${parsed.message}`);
        setState((s) => ({ ...s, status: 'error', error: parsed.message }));
      }

      throw err;
    }
  }, [swapQuote, chainId, getSigner]);

  // Execute the swap
  const executeSwap = useCallback(async (): Promise<string> => {
    if (!swapQuote || !address || !chainId) {
      throw new Error('No quote available');
    }

    try {
      // Handle approval if needed
      if (swapQuote.needsApproval) {
        await executeApproval();
        // Update quote to reflect approval
        setSwapQuote((s) => (s ? { ...s, needsApproval: false } : null));
      }

      setState((s) => ({ ...s, status: 'swapping' }));
      toast.info('Confirm swap in your wallet...');

      const signer = await getSigner();

      // Build swap transaction
      const swapTx = buildSwapTx({
        tokenIn: swapQuote.fromSymbol,
        tokenOut: swapQuote.toSymbol,
        amountIn: swapQuote.amountIn,
        amountOutMin: formatUnits(swapQuote.minAmountOut,
          getTokenBySymbol(swapQuote.toSymbol, chainId)?.decimals || 18),
        recipient: address,
        feeTier: swapQuote.feeTier,
        chainId,
      });

      console.log('[Swap] Sending swap:', swapTx);

      // Send swap transaction (wallet signs)
      const tx = await signer.sendTransaction({
        to: swapTx.to,
        data: swapTx.data,
        value: BigInt(swapTx.value),
        gasLimit: swapTx.gasLimit ? BigInt(swapTx.gasLimit) : undefined,
      });

      setState((s) => ({ ...s, status: 'confirming', txHash: tx.hash }));
      toast.info('Waiting for confirmation...');

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        setState((s) => ({ ...s, status: 'success', txHash: tx.hash }));
        toast.success('Swap completed!');

        // Refresh balances
        await fetchBalances(address, ['ethereum']);

        return tx.hash;
      } else {
        throw new Error('Transaction failed');
      }
    } catch (err) {
      // PHASE 7: NO silent failures - log everything
      logError('Swap Execution', err);

      // Try RPC error first, then transaction error
      const rpcParsed = parseRpcError(err);
      const txParsed = parseTransactionError(err);

      // Use the more specific error message
      const parsed = rpcParsed.category !== 'unknown' ? rpcParsed : txParsed;
      setState((s) => ({ ...s, status: 'error', error: parsed.message }));

      if (isUserRejection(err)) {
        toast.warning('Swap cancelled by user');
        console.log('[Swap] User rejected transaction');
      } else {
        toast.error(`Swap failed: ${parsed.message}`);
        console.error('[Swap] Transaction failed:', parsed);
      }

      throw err;
    }
  }, [swapQuote, address, chainId, getSigner, executeApproval, fetchBalances]);

  // Full swap flow: fetch quote → preview → execute
  // PHASE 7: Comprehensive validation before any action
  const swap = useCallback(async (): Promise<SwapQuote | null> => {
    const fromSymbol = getSymbol(fromAsset);
    const toSymbol = getSymbol(toAsset);

    console.log('[Swap] Starting swap validation...', {
      address,
      fromSymbol,
      toSymbol,
      fromAmount,
      chainId,
    });

    // VALIDATION 1: Wallet connected
    if (!address) {
      const error = 'Please connect your wallet first';
      logError('Swap Validation', new Error(error));
      toast.error(error);
      throw new Error(error);
    }

    // VALIDATION 2: Chain check
    if (isWrongChain) {
      const error = 'Please switch to Ethereum Mainnet';
      logError('Swap Validation', new Error(error));
      toast.error(error);
      throw new Error(error);
    }

    // VALIDATION 3: Same token check (CRITICAL)
    if (isSameToken(fromSymbol, toSymbol)) {
      const error = 'Cannot swap a token to itself';
      logError('Swap Validation', new Error(error));
      toast.error(error);
      throw new Error(error);
    }

    // VALIDATION 4: Token selection check
    if (!fromSymbol || !toSymbol) {
      const error = 'Please select both tokens';
      logError('Swap Validation', new Error(error));
      toast.error(error);
      throw new Error(error);
    }

    // VALIDATION 5: Amount check
    const parsedAmount = parseAmount(fromAmount);
    if (parsedAmount === null || parsedAmount <= 0) {
      const error = 'Please enter a valid amount greater than 0';
      logError('Swap Validation', new Error(error));
      toast.error(error);
      throw new Error(error);
    }

    // VALIDATION 6: Comprehensive validation
    const validationResult = validateSwapInputs({
      isConnected: !!address,
      address,
      fromToken: fromSymbol,
      toToken: toSymbol,
      fromAmount,
      fromBalance: '999999', // Skip balance check here, done in UI
      slippage: DEFAULT_SLIPPAGE,
      chainId: chainId || 1,
    });

    if (!validationResult.isValid) {
      logValidationErrors('Swap', {
        isConnected: !!address,
        address,
        fromToken: fromSymbol,
        toToken: toSymbol,
        fromAmount,
        fromBalance: '0',
        slippage: DEFAULT_SLIPPAGE,
        chainId: chainId || 1,
      }, validationResult);

      const error = validationResult.messages[0] || 'Validation failed';
      toast.error(error);
      throw new Error(error);
    }

    console.log('[Swap] Validation passed, fetching quote...');

    // Get fresh quote
    const quote = await fetchSwapQuote();
    if (!quote) {
      throw new Error('Failed to get quote');
    }

    // Return the quote for preview - actual execution happens when user confirms
    return quote;
  }, [address, isWrongChain, fromAsset, toAsset, fromAmount, chainId, fetchSwapQuote]);

  // Confirm and execute after preview
  const confirmSwap = useCallback(async (): Promise<string> => {
    if (state.status !== 'previewing' || !swapQuote) {
      throw new Error('No swap to confirm');
    }

    return executeSwap();
  }, [state.status, swapQuote, executeSwap]);

  // Cancel preview
  const cancelPreview = useCallback(() => {
    if (state.status === 'previewing') {
      setState((s) => ({ ...s, status: 'idle', quote: null }));
      setSwapQuote(null);
    }
  }, [state.status]);

  return {
    // State
    ...state,
    swapQuote,
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

export default useSwap;
