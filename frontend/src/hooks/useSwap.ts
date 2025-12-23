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
 *
 * PHASE 9 - SWAP LIFECYCLE (for debugging & UX):
 * idle → fetching_quote → checking_allowance → previewing
 *                                               ↓
 *       ← error ←    approving (if needed) → swapping → confirming → success
 *
 * Each state transition is logged with [Swap Lifecycle] prefix.
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { formatUnits } from 'ethers';
import { useWallet } from './useWallet';
import { useSwapStore } from '@/stores/swapStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { toast } from '@/stores/toastStore';
import { walletEvents, getWalletEventMessage } from '@/services/walletEvents';
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
  type QuoteResult,
} from '@/services/uniswapQuote';
import {
  buildSwapTx,
  buildRouterApproval,
  validateSwapParams,
} from '@/services/uniswapTxBuilder';
// PHASE 10: Import aggregator and 1inch services
import {
  getAggregatedQuote,
  type AggregatedQuote,
} from '@/services/quoteAggregator';
import {
  buildOneInchSwapTx,
  buildOneInchApproval,
  checkOneInchAllowance,
} from '@/services/oneInchTxBuilder';
// PHASE 11: Import PancakeSwap tx builder for BSC
import {
  buildPancakeSwapTx,
  buildPancakeApprovalTx,
} from '@/services/pancakeSwapTxBuilder';
import { getTokenBySymbol, isNativeToken } from '@/tokens';
import { getUniswapV3Addresses, getExplorerTxUrl } from '@/config';

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
  explorerUrl: string | null;  // PHASE 9: Explorer link for confirmed tx
  error: string | null;
}

// PHASE 10 + 11: Provider type for routing
export type SwapProvider = 'uniswap-v3' | 'pancakeswap-v3' | '1inch';

// Extended quote for UI display - compatible with SwapQuoteResponse
export interface SwapQuote extends QuoteResult {
  fromSymbol: string;
  toSymbol: string;
  minAmountOut: string;
  minAmountOutFormatted: string;
  slippage: number;
  needsApproval: boolean;
  // PHASE 10: Provider info
  provider: SwapProvider;
  aggregatedQuote?: AggregatedQuote;
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

// PHASE 11: Supported chain IDs (ETH = 1, BSC = 56)
const SUPPORTED_CHAIN_IDS = [1, 56] as const;

/**
 * Log swap lifecycle state transitions
 * PHASE 9: Clear logging for debugging and monitoring
 */
function logLifecycle(
  fromStatus: SwapStatus | null,
  toStatus: SwapStatus,
  details?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const transition = fromStatus ? `${fromStatus} → ${toStatus}` : `→ ${toStatus}`;
  console.log(`[Swap Lifecycle] ${timestamp} | ${transition}`, details || '');
}

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
  const { fromAsset, toAsset, fromAmount, slippage, setQuote, clearQuote } = useSwapStore();
  const { fetchBalances } = useBalanceStore();

  const [state, setState] = useState<SwapState>({
    status: 'idle',
    quote: null,
    txHash: null,
    explorerUrl: null,
    error: null,
  });

  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);

  // Track if operation was cancelled by wallet event
  const isCancelledRef = useRef(false);

  // Quote request ID counter - prevents stale responses from updating UI
  const quoteRequestIdRef = useRef(0);

  // PHASE 14: Handle wallet events (disconnect, chain change, account change)
  useEffect(() => {
    // Only listen when swap is in progress
    const isActive = state.status !== 'idle' && state.status !== 'success' && state.status !== 'error';
    if (!isActive) {
      isCancelledRef.current = false;
      return;
    }

    const unsubscribe = walletEvents.onAny((event) => {
      console.log(`[Swap] Wallet event during active swap: ${event.type}`);

      // Mark as cancelled
      isCancelledRef.current = true;

      // Get user-friendly message
      const message = getWalletEventMessage(event);

      // Log the cancellation
      logLifecycle(state.status, 'idle', {
        reason: 'wallet_event',
        eventType: event.type,
      });

      // Reset state
      setState({ status: 'idle', quote: null, txHash: null, explorerUrl: null, error: null });
      setSwapQuote(null);
      clearQuote();

      // Show toast
      toast.warning(message);
    });

    return () => {
      unsubscribe();
    };
  }, [state.status, clearQuote]);

  // Reset state and invalidate any pending quote requests
  const reset = useCallback(() => {
    // Increment request ID to invalidate any in-flight requests
    quoteRequestIdRef.current += 1;
    console.log('[Swap] Reset - invalidating pending requests, new ID:', quoteRequestIdRef.current);

    logLifecycle(state.status, 'idle', { action: 'reset' });
    setState({ status: 'idle', quote: null, txHash: null, explorerUrl: null, error: null });
    setSwapQuote(null);
    clearQuote();
  }, [clearQuote, state.status]);

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

  // PHASE 10: Fetch swap quote using aggregator (1inch primary, Uniswap fallback)
  // Uses request ID to prevent stale responses from updating UI
  const fetchSwapQuote = useCallback(async (): Promise<SwapQuote | null> => {
    if (!address || !fromAsset || !toAsset || !fromAmount) {
      return null;
    }

    const fromSymbol = getSymbol(fromAsset);
    const toSymbol = getSymbol(toAsset);

    if (!fromSymbol || !toSymbol) {
      setState((s) => ({ ...s, status: 'error', error: 'Please select both tokens to swap. Choose a token from each dropdown.' }));
      return null;
    }

    // Increment request ID and capture it for this request
    quoteRequestIdRef.current += 1;
    const thisRequestId = quoteRequestIdRef.current;
    console.log('[Swap] Quote request started, ID:', thisRequestId);

    // PHASE 9: Log lifecycle transition
    logLifecycle(state.status, 'fetching_quote', { fromSymbol, toSymbol, fromAmount });
    setState((s) => ({ ...s, status: 'fetching_quote', error: null }));

    try {
      console.log('[Swap] Fetching quote via aggregator:', { fromSymbol, toSymbol, fromAmount });

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

      // PHASE 10: Fetch best quote via aggregator (compares 1inch vs Uniswap)
      // Use slippage from store (user-selected) with fallback to default
      const aggregatedQuote = await getAggregatedQuote(
        fromSymbol,
        toSymbol,
        fromAmount,
        chainId || 1,
        slippage || DEFAULT_SLIPPAGE
      );

      console.log('[Swap] Aggregator selected:', aggregatedQuote.provider, '|', aggregatedQuote.amountOutFormatted, toSymbol);

      // Extract quote data for compatibility
      const quote: QuoteResult = aggregatedQuote.provider === 'uniswap-v3'
        ? (aggregatedQuote.originalQuote as QuoteResult)
        : {
            // Map 1inch quote to QuoteResult format
            amountIn: aggregatedQuote.amountIn,
            amountOut: aggregatedQuote.amountOut,
            amountOutFormatted: aggregatedQuote.amountOutFormatted,
            feeTier: 3000, // Default fee tier for compatibility (1inch doesn't use this)
            gasEstimate: aggregatedQuote.providerDetails.gas.toString(),
            priceImpact: aggregatedQuote.priceImpact,
            provider: aggregatedQuote.provider,
            // Fields not used by 1inch but required for type compatibility
            sqrtPriceX96After: '0',
            initializedTicksCrossed: 0,
            route: '1inch-aggregator',
          };

      // Check if approval is needed (provider-specific)
      logLifecycle('fetching_quote', 'checking_allowance', { tokenIn: fromSymbol, provider: aggregatedQuote.provider });
      setState((s) => ({ ...s, status: 'checking_allowance' }));

      const tokenIn = getTokenBySymbol(fromSymbol, chainId || 1);
      let hasAllowance = true;

      // Native tokens don't need approval
      if (tokenIn && !isNativeToken(tokenIn.address)) {
        if (aggregatedQuote.provider === '1inch') {
          // Check 1inch router allowance
          const allowance = await checkOneInchAllowance(fromSymbol, address, chainId || 1);
          const amountInWei = BigInt(aggregatedQuote.amountIn);
          hasAllowance = allowance === 'unlimited' || BigInt(allowance) >= amountInWei;
        } else {
          // Check Uniswap router allowance
          const amountInWei = tokenIn
            ? BigInt(quote.amountIn.includes('.')
                ? (parseFloat(quote.amountIn) * 10 ** tokenIn.decimals).toString()
                : quote.amountIn)
            : 0n;
          hasAllowance = await checkAllowance(fromSymbol, amountInWei);
        }
      }

      // Calculate rate
      const rate = (parseFloat(aggregatedQuote.amountOutFormatted) / parseFloat(fromAmount)).toFixed(6);

      // Build extended quote for UI - includes all fields for compatibility
      const extendedQuote: SwapQuote = {
        ...quote,
        fromSymbol,
        toSymbol,
        minAmountOut: aggregatedQuote.minAmountOut,
        minAmountOutFormatted: aggregatedQuote.minAmountOutFormatted,
        slippage: slippage || DEFAULT_SLIPPAGE,
        needsApproval: !hasAllowance,
        // PHASE 10: Provider info
        provider: aggregatedQuote.provider,
        aggregatedQuote,
        // UI-compatible fields
        success: true,
        from_asset: fromSymbol,
        to_asset: toSymbol,
        from_amount: fromAmount,
        to_amount: aggregatedQuote.amountOutFormatted,
        rate,
        price_impact: aggregatedQuote.priceImpact,
        minimum_received: aggregatedQuote.minAmountOutFormatted,
      };

      // Check if this request is still valid (inputs haven't changed)
      if (thisRequestId !== quoteRequestIdRef.current) {
        console.log('[Swap] Quote response ignored - stale request ID:', thisRequestId, 'current:', quoteRequestIdRef.current);
        return null;
      }

      logLifecycle('checking_allowance', 'previewing', {
        provider: aggregatedQuote.provider,
        quote: aggregatedQuote.amountOutFormatted,
        needsApproval: !hasAllowance,
      });
      setState((s) => ({ ...s, status: 'previewing', quote }));
      setSwapQuote(extendedQuote);
      // Update swapStore with compatible quote format for toAmount display
      setQuote({
        success: true,
        from_asset: fromSymbol,
        to_asset: toSymbol,
        from_amount: fromAmount,
        to_amount: aggregatedQuote.amountOutFormatted,
        rate,
        price_impact: aggregatedQuote.priceImpact,
        minimum_received: aggregatedQuote.minAmountOutFormatted,
        route: {
          provider: aggregatedQuote.provider,
          route_path: [fromSymbol, toSymbol],
          hops: 1,
          price_impact: aggregatedQuote.priceImpact,
          minimum_received: aggregatedQuote.minAmountOutFormatted,
          expires_at: new Date(Date.now() + 30000).toISOString(),
        },
        gas_estimate: {
          gas_limit: aggregatedQuote.providerDetails.gas.toString(),
          gas_price: '0',
          estimated_cost_native: '0',
        },
      });

      return extendedQuote;
    } catch (err) {
      // Check if this request is still valid before showing error
      if (thisRequestId !== quoteRequestIdRef.current) {
        console.log('[Swap] Error ignored - stale request ID:', thisRequestId, 'current:', quoteRequestIdRef.current);
        return null;
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to get quote';
      console.error('[Swap] Quote error:', err);
      logLifecycle(state.status, 'error', { error: errorMessage });
      setState((s) => ({ ...s, status: 'error', error: errorMessage }));
      toast.error(errorMessage);
      return null;
    }
  // Note: state.status removed from deps to prevent infinite loop - it's only used for logging
  }, [address, fromAsset, toAsset, fromAmount, chainId, checkAllowance, setQuote]);

  // Execute token approval
  const executeApproval = useCallback(async (): Promise<boolean> => {
    if (!swapQuote || !chainId) {
      throw new Error('No quote available. Please enter an amount and wait for a quote before proceeding.');
    }

    try {
      logLifecycle(state.status, 'approving', { token: swapQuote.fromSymbol, provider: swapQuote.provider });
      setState((s) => ({ ...s, status: 'approving' }));
      toast.info('Approving token spending...');

      const signer = await getSigner();

      // PHASE 10 + 11: Build approval transaction based on provider
      let approvalTx: { to: string; data: string; value: string };

      if (swapQuote.provider === '1inch') {
        // Use 1inch approval API
        console.log('[Swap] Building 1inch approval...');
        approvalTx = await buildOneInchApproval(swapQuote.fromSymbol, chainId);
      } else if (swapQuote.provider === 'pancakeswap-v3') {
        // PHASE 11: Use PancakeSwap router approval (BSC)
        console.log('[Swap] Building PancakeSwap approval...');
        const pancakeApproval = buildPancakeApprovalTx(swapQuote.fromSymbol);
        approvalTx = {
          to: pancakeApproval.to,
          data: pancakeApproval.data,
          value: pancakeApproval.value,
        };
      } else {
        // Use Uniswap router approval (ETH)
        console.log('[Swap] Building Uniswap approval...');
        approvalTx = buildRouterApproval(swapQuote.fromSymbol, chainId);
      }

      console.log('[Swap] Sending approval:', { provider: swapQuote.provider, ...approvalTx });

      // Send approval transaction (wallet signs)
      const tx = await signer.sendTransaction({
        to: approvalTx.to,
        data: approvalTx.data,
        value: BigInt(approvalTx.value),
      });

      toast.info('Waiting for approval confirmation...');
      await tx.wait();

      console.log('[Swap Lifecycle] Approval confirmed:', tx.hash, '| Provider:', swapQuote.provider);
      toast.success('Token approved!');
      return true;
    } catch (err) {
      const parsed = parseTransactionError(err);

      if (isUserRejection(err)) {
        logLifecycle('approving', 'previewing', { reason: 'user_rejected' });
        toast.warning('Approval cancelled');
        setState((s) => ({ ...s, status: 'previewing' }));
      } else {
        logLifecycle('approving', 'error', { error: parsed.message });
        toast.error(`Approval failed: ${parsed.message}`);
        setState((s) => ({ ...s, status: 'error', error: parsed.message }));
      }

      throw err;
    }
  }, [swapQuote, chainId, getSigner, state.status]);

  // Execute the swap
  const executeSwap = useCallback(async (): Promise<string> => {
    if (!swapQuote || !address || !chainId) {
      throw new Error('No quote available. Please enter an amount and wait for a quote before proceeding.');
    }

    try {
      // Handle approval if needed
      if (swapQuote.needsApproval) {
        await executeApproval();
        // Update quote to reflect approval
        setSwapQuote((s) => (s ? { ...s, needsApproval: false } : null));
      }

      logLifecycle(state.status, 'swapping', {
        from: swapQuote.fromSymbol,
        to: swapQuote.toSymbol,
        amount: swapQuote.amountIn,
        provider: swapQuote.provider,
      });
      setState((s) => ({ ...s, status: 'swapping' }));
      toast.info('Confirm swap in your wallet...');

      const signer = await getSigner();

      // PHASE 10 + 11: Build swap transaction based on provider
      let swapTx: { to: string; data: string; value: string; gas?: string; gasLimit?: string };

      if (swapQuote.provider === '1inch') {
        // Build 1inch swap transaction
        console.log('[Swap] Building 1inch swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const oneInchTx = await buildOneInchSwapTx({
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: tokenIn ? formatUnits(swapQuote.amountIn, tokenIn.decimals) : swapQuote.amountIn,
          fromAddress: address,
          slippage: swapQuote.slippage,
          chainId,
        });
        swapTx = {
          to: oneInchTx.to,
          data: oneInchTx.data,
          value: oneInchTx.value,
          gasLimit: oneInchTx.gas,
        };
      } else if (swapQuote.provider === 'pancakeswap-v3') {
        // PHASE 11: Build PancakeSwap swap transaction (BSC)
        console.log('[Swap] Building PancakeSwap swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tokenOut = getTokenBySymbol(swapQuote.toSymbol, chainId);
        // Get PancakeSwap fee tier from original quote (default: 2500 = medium)
        const pancakeFeeTier = (swapQuote.aggregatedQuote?.providerDetails?.feeTier as 100 | 500 | 2500 | 10000) || 2500;
        const pancakeTx = buildPancakeSwapTx({
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: tokenIn ? formatUnits(swapQuote.amountIn, tokenIn.decimals) : swapQuote.amountIn,
          amountOutMin: tokenOut ? formatUnits(swapQuote.minAmountOut, tokenOut.decimals) : swapQuote.minAmountOutFormatted,
          recipient: address,
          feeTier: pancakeFeeTier,
        });
        swapTx = {
          to: pancakeTx.to,
          data: pancakeTx.data,
          value: pancakeTx.value,
          gasLimit: pancakeTx.gasLimit,
        };
      } else {
        // Build Uniswap swap transaction (ETH)
        console.log('[Swap] Building Uniswap swap...');
        const uniswapTx = buildSwapTx({
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: swapQuote.amountIn,
          amountOutMin: formatUnits(swapQuote.minAmountOut,
            getTokenBySymbol(swapQuote.toSymbol, chainId)?.decimals || 18),
          recipient: address,
          feeTier: swapQuote.feeTier,
          chainId,
        });
        swapTx = uniswapTx;
      }

      console.log('[Swap] Sending swap:', { provider: swapQuote.provider, ...swapTx });

      // Send swap transaction (wallet signs)
      const tx = await signer.sendTransaction({
        to: swapTx.to,
        data: swapTx.data,
        value: BigInt(swapTx.value),
        gasLimit: swapTx.gasLimit ? BigInt(swapTx.gasLimit) : undefined,
      });

      // PHASE 9: Generate explorer URL for this transaction
      const explorerUrl = getExplorerTxUrl(chainId, tx.hash);

      logLifecycle('swapping', 'confirming', { txHash: tx.hash, explorerUrl });
      setState((s) => ({ ...s, status: 'confirming', txHash: tx.hash, explorerUrl }));
      toast.info('Waiting for confirmation...');

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        logLifecycle('confirming', 'success', {
          txHash: tx.hash,
          explorerUrl,
          gasUsed: receipt.gasUsed?.toString()
        });
        setState((s) => ({ ...s, status: 'success', txHash: tx.hash, explorerUrl }));
        toast.success(`Swap completed! View on explorer: ${explorerUrl}`);

        // Refresh balances for the current chain
        const chainNetwork = chainId === 56 ? 'bsc' : 'ethereum';
        await fetchBalances(address, [chainNetwork]);

        return tx.hash;
      } else {
        throw new Error('Transaction was not successful. The blockchain rejected the swap. Check your transaction on the explorer for details.');
      }
    } catch (err) {
      // PHASE 7: NO silent failures - log everything
      logError('Swap Execution', err);

      // Try RPC error first, then transaction error
      const rpcParsed = parseRpcError(err);
      const txParsed = parseTransactionError(err);

      // Use the more specific error message
      const parsed = rpcParsed.category !== 'unknown' ? rpcParsed : txParsed;

      if (isUserRejection(err)) {
        logLifecycle(state.status, 'previewing', { reason: 'user_rejected' });
        setState((s) => ({ ...s, status: 'previewing' }));
        toast.warning('Swap cancelled. No funds were moved.');
        console.log('[Swap] User rejected transaction');
      } else {
        logLifecycle(state.status, 'error', {
          error: parsed.message,
          category: parsed.category,
        });
        setState((s) => ({ ...s, status: 'error', error: parsed.message }));
        toast.error(parsed.message);
        console.error('[Swap] Transaction failed:', parsed);
      }

      throw err;
    }
  }, [swapQuote, address, chainId, getSigner, executeApproval, fetchBalances, state.status]);

  // Full swap flow: fetch quote → preview → execute
  // PHASE 7: Comprehensive validation before any action
  const swap = useCallback(async (): Promise<SwapQuote | null> => {
    const fromSymbol = getSymbol(fromAsset);
    const toSymbol = getSymbol(toAsset);

    // PHASE 9: Log swap initiation
    logLifecycle(null, 'idle', {
      action: 'swap_initiated',
      fromSymbol,
      toSymbol,
      fromAmount,
      chainId,
    });

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

    // VALIDATION 2: Network guard - Block swap on wrong chain
    // PHASE 11: Allow ETH (1) and BSC (56)
    if (!SUPPORTED_CHAIN_IDS.includes(chainId as typeof SUPPORTED_CHAIN_IDS[number])) {
      const error = `Network mismatch: Please switch to Ethereum or BSC. Supported: ${SUPPORTED_CHAIN_IDS.join(', ')}. Current: ${chainId}`;
      logLifecycle(null, 'error', { reason: 'wrong_chain', currentChainId: chainId, supportedChains: [...SUPPORTED_CHAIN_IDS] });
      logError('Swap Validation - NETWORK GUARD', new Error(error));
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
      slippage: slippage || DEFAULT_SLIPPAGE,
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
        slippage: slippage || DEFAULT_SLIPPAGE,
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
      throw new Error('Quote request failed. The pricing service may be temporarily unavailable. Please try again.');
    }

    // Return the quote for preview - actual execution happens when user confirms
    return quote;
  }, [address, isWrongChain, fromAsset, toAsset, fromAmount, chainId, fetchSwapQuote]);

  // Confirm and execute after preview
  const confirmSwap = useCallback(async (): Promise<string> => {
    if (state.status !== 'previewing' || !swapQuote) {
      throw new Error('No active swap to confirm. Please get a new quote and try again.');
    }

    return executeSwap();
  }, [state.status, swapQuote, executeSwap]);

  // Cancel preview
  const cancelPreview = useCallback(() => {
    if (state.status === 'previewing') {
      logLifecycle('previewing', 'idle', { action: 'cancel_preview' });
      setState((s) => ({ ...s, status: 'idle', quote: null, explorerUrl: null }));
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
