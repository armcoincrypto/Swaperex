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

import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { formatUnits, parseUnits, type Provider } from 'ethers';
import { useWallet } from './useWallet';
import { useSwapStore } from '@/stores/swapStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { toast } from '@/stores/toastStore';
import { walletEvents, getWalletEventMessage } from '@/services/walletEvents';
import { processQuoteForSignals } from '@/services/radarService';
import { useSwapHistoryStore } from '@/stores/swapHistoryStore';
import { useUsageStore } from '@/stores/usageStore';
import {
  isUserRejection,
  parseTransactionError,
  parseSwapExecutionError,
  parseQuoteError,
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
  getBestWrapperQuote,
} from '@/services/uniswapQuote';
import {
  buildSwapTx,
  buildRouterApproval,
  buildWrapperSwapTx,
  buildWrapperApprovalTx,
  validateSwapParams,
} from '@/services/uniswapTxBuilder';
// PHASE 10: Import aggregator and 1inch services
import {
  getAggregatedQuote,
  normalizeUniswapWrapperAggregatedQuote,
  type AggregatedQuote,
  type QuoteRouteMode,
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
import { PANCAKESWAP_V3_ADDRESSES } from '@/services/pancakeSwapQuote';
import { getTokenBySymbol, isNativeToken, isNativeSwapInput } from '@/tokens';
import {
  ensureUniswapWrapperChainFeeBps,
  getUniswapV3Addresses,
  getExplorerTxUrl,
  getUniswapWrapperSpenderAddress,
  shouldUseUniswapWrapperForSymbols,
} from '@/config';
import {
  clearPendingSwap,
  getPendingSwapForAccount,
  markPendingSwapOutcomeUncertain,
  readPendingSwap,
  writePendingSwap,
} from '@/utils/pendingSwapStorage';

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
export type SwapProvider = 'uniswap-v3' | 'uniswap-v3-wrapper' | 'pancakeswap-v3' | '1inch';

/** Runner-up from aggregator compare (display output; not full calldata quote). */
export interface RunnerUpQuoteSnippet {
  provider: string;
  /** Human-readable quoted output amount (same basis as amountOutFormatted). */
  amountOut: string;
}

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
  /** Aggregator selection rationale (multi-source chains) */
  quoteSelectionReason?: string;
  /** Runner-up when two execution quotes were compared */
  runnerUpAggregatedQuote?: RunnerUpQuoteSnippet | null;
  /** User-selected routing: best price vs fixed venue */
  routeMode: QuoteRouteMode;
  // Quote expiry tracking (timestamp when quote was received)
  quoteTimestamp: number;
  // UI-compatible fields (maps to SwapQuoteResponse)
  success: boolean;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
  rate: string;
  price_impact: string;
  minimum_received: string;
  /**
   * True when an on-chain ERC20 allowance read failed (RPC) for Uniswap router or fee-wrapper paths.
   * Execution is blocked until the user refreshes the quote; not the same as "approval required".
   */
  allowanceCheckUncertain?: boolean;
}

// Default slippage tolerance (0.5%)
const DEFAULT_SLIPPAGE = 0.5;

// Quote expires after 30 seconds
const QUOTE_EXPIRY_MS = 30000;

// Supported chain IDs for swap (all chains with 1inch support)
const SUPPORTED_CHAIN_IDS = [1, 56, 137, 42161, 10, 43114, 100, 250, 8453] as const;

// Chain ID to balance store network name mapping
const CHAIN_ID_TO_NETWORK: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism',
  43114: 'avalanche',
  100: 'gnosis',
  250: 'fantom',
  8453: 'base',
};

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

/** Result of a single ERC20 `allowance(owner,spender)` read against a required amount. */
type Erc20AllowanceRead = 'sufficient' | 'insufficient' | 'unknown';

async function readErc20AllowanceVsRequired(
  tokenAddress: string,
  spender: string,
  owner: string,
  required: bigint,
  provider: Provider
): Promise<Erc20AllowanceRead> {
  try {
    const { Contract } = await import('ethers');
    const tokenContract = new Contract(tokenAddress, ALLOWANCE_ABI, provider);
    const allowance = await tokenContract.allowance(owner, spender);
    return allowance >= required ? 'sufficient' : 'insufficient';
  } catch (err) {
    console.error('[Swap] ERC20 allowance read failed:', err);
    return 'unknown';
  }
}

export function useSwap() {
  const { address, isWrongChain, chainId, getSigner, provider } = useWallet();
  const { fromAsset, toAsset, fromAmount, slippage, approvalMode, routeMode, setQuote, clearQuote } = useSwapStore();
  const { fetchBalances } = useBalanceStore();
  const { addRecord: addSwapRecord, updateRecordStatus } = useSwapHistoryStore();
  const { trackEvent } = useUsageStore();

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

  /** Prevents double confirm / overlapping executeSwap when state updates lag one frame. */
  const swapExecutionLockRef = useRef(false);

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
  // Note: state.status removed from deps to prevent reset identity from changing
  // when status changes, which would cause infinite loops in consuming components
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // PHASE 10: Fetch swap quote using aggregator (1inch primary, Uniswap fallback)
  // Uses request ID to prevent stale responses from updating UI
  const fetchSwapQuote = useCallback(async (): Promise<SwapQuote | null> => {
    if (!address || !fromAsset || !toAsset || !fromAmount) {
      setSwapQuote(null);
      clearQuote();
      setState((s) => ({ ...s, status: 'idle', error: null }));
      return null;
    }

    const fromSymbol = getSymbol(fromAsset);
    const toSymbol = getSymbol(toAsset);

    if (!fromSymbol || !toSymbol) {
      setSwapQuote(null);
      clearQuote();
      setState((s) => ({
        ...s,
        status: 'error',
        error: 'Please select both tokens to swap. Choose a token from each dropdown.',
      }));
      return null;
    }

    // Increment request ID and capture it for this request
    quoteRequestIdRef.current += 1;
    const thisRequestId = quoteRequestIdRef.current;
    console.log('[Swap] Quote request started, ID:', thisRequestId);

    // Invalidate any previous receive-line quote immediately for this new request (avoid stale output)
    setSwapQuote(null);
    clearQuote();

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

      // PHASE 10: Fetch best quote via aggregator (compares 1inch vs Uniswap / Pancake on ETH & BSC)
      // Use slippage from store (user-selected) with fallback to default.
      // In parallel on mainnet: one lightweight `FEE_BPS` read for wrapper fee display (session-cached).
      const [aggregationInitial] = await Promise.all([
        getAggregatedQuote(
          fromSymbol,
          toSymbol,
          fromAmount,
          chainId || 1,
          slippage || DEFAULT_SLIPPAGE,
          routeMode,
        ),
        ensureUniswapWrapperChainFeeBps(provider, chainId || 1),
      ]);
      let aggregation = aggregationInitial;

      if (
        aggregation.best.provider === 'uniswap-v3' &&
        shouldUseUniswapWrapperForSymbols(chainId || 1, fromSymbol, toSymbol)
      ) {
        const wq = await getBestWrapperQuote(fromSymbol, toSymbol, fromAmount, chainId || 1);
        const tokenOutMeta = getTokenBySymbol(toSymbol, chainId || 1);
        if (wq && tokenOutMeta) {
          const wrappedBest = normalizeUniswapWrapperAggregatedQuote(
            wq,
            slippage || DEFAULT_SLIPPAGE,
            tokenOutMeta.decimals,
            chainId || 1,
          );
          // Best-price integrity: wrapper takes net fee on output — it can be worse than 1inch even when
          // Uniswap direct (gross) beat 1inch. Never downgrade below the aggregated runner-up 1inch quote.
          const oneInchAlt =
            routeMode === 'best' && aggregation.alternative?.provider === '1inch'
              ? aggregation.alternative
              : null;
          if (oneInchAlt && wrappedBest.amountOutRaw < oneInchAlt.amountOutRaw) {
            console.warn(
              '[Swap] Wrapper net below 1inch runner-up — keeping direct Uniswap V3 execution quote.',
              {
                wrapperNet: wrappedBest.amountOutRaw.toString(),
                oneInch: oneInchAlt.amountOutRaw.toString(),
              },
            );
          } else {
            aggregation = {
              ...aggregation,
              best: wrappedBest,
              selectionReason: `${aggregation.selectionReason} · Executing via Swaperex Uniswap wrapper (ERC20→ERC20, net output).`,
            };
          }
        } else {
          console.warn('[Swap] Uniswap wrapper quote unavailable — keeping direct Uniswap V3 execution quote.');
        }
      }

      const aggregatedQuote = aggregation.best;

      console.log(
        '[Swap] Aggregator selected:',
        aggregatedQuote.provider,
        '|',
        aggregatedQuote.amountOutFormatted,
        toSymbol,
        '|',
        aggregation.selectionReason
      );

      // Extract quote data for compatibility
      const quote: QuoteResult =
        aggregatedQuote.provider === 'uniswap-v3' || aggregatedQuote.provider === 'uniswap-v3-wrapper'
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
      let allowanceCheckUncertain = false;

      const inputIsNative = isNativeSwapInput(fromAsset, fromSymbol, chainId || 1);

      // Native tokens don't need approval (no ERC20 allowance / spender flow)
      if (tokenIn && !isNativeToken(tokenIn.address)) {
        if (aggregatedQuote.provider === '1inch') {
          // Check 1inch router allowance
          const allowance = await checkOneInchAllowance(fromSymbol, address, chainId || 1);
          const amountInWei = BigInt(aggregatedQuote.amountIn);
          hasAllowance = allowance === 'unlimited' || BigInt(allowance) >= amountInWei;
        } else if (aggregatedQuote.provider === 'pancakeswap-v3') {
          // Check PancakeSwap router allowance (BSC)
          try {
            const { Contract } = await import('ethers');
            const tokenContract = new Contract(tokenIn.address, ALLOWANCE_ABI, provider);
            const allowance = await tokenContract.allowance(address, PANCAKESWAP_V3_ADDRESSES.router);
            const amountInWei = BigInt(aggregatedQuote.amountIn);
            hasAllowance = allowance >= amountInWei;
          } catch {
            hasAllowance = false;
          }
        } else if (aggregatedQuote.provider === 'uniswap-v3-wrapper') {
          const wrapperAddr = getUniswapWrapperSpenderAddress();
          const amountInWei = BigInt(aggregatedQuote.amountIn);
          if (!wrapperAddr) {
            hasAllowance = false;
          } else if (!provider || !address) {
            allowanceCheckUncertain = true;
            hasAllowance = true;
          } else {
            const read = await readErc20AllowanceVsRequired(
              tokenIn.address,
              wrapperAddr,
              address,
              amountInWei,
              provider
            );
            if (read === 'unknown') {
              allowanceCheckUncertain = true;
              hasAllowance = true;
            } else {
              hasAllowance = read === 'sufficient';
            }
          }
        } else {
          // Check Uniswap router allowance (direct SwapRouter02 on Ethereum)
          const amountInWei = BigInt(aggregatedQuote.amountIn);
          const uni = getUniswapV3Addresses(chainId || 1);
          if (!uni) {
            hasAllowance = false;
          } else if (!provider || !address) {
            allowanceCheckUncertain = true;
            hasAllowance = true;
          } else {
            const read = await readErc20AllowanceVsRequired(
              tokenIn.address,
              uni.router,
              address,
              amountInWei,
              provider
            );
            if (read === 'unknown') {
              allowanceCheckUncertain = true;
              hasAllowance = true;
            } else {
              hasAllowance = read === 'sufficient';
            }
          }
        }
      }

      // Calculate rate
      const rate = (parseFloat(aggregatedQuote.amountOutFormatted) / parseFloat(fromAmount)).toFixed(6);

      const needsApproval = !inputIsNative && !hasAllowance;

      const uniswapForLog = getUniswapV3Addresses(chainId || 1);
      const spenderForLog =
        aggregatedQuote.provider === 'uniswap-v3-wrapper'
          ? getUniswapWrapperSpenderAddress()
          : aggregatedQuote.provider === 'uniswap-v3'
            ? uniswapForLog?.router ?? null
            : aggregatedQuote.provider === 'pancakeswap-v3'
              ? '(pancake router)'
              : aggregatedQuote.provider === '1inch'
                ? '(1inch spender)'
                : null;

      console.log('[Swap] Approval gate', {
        fromSymbol,
        tokenInAddress: tokenIn?.address,
        tokenInIsNativeByList: tokenIn ? isNativeToken(tokenIn.address) : null,
        inputIsNative,
        provider: aggregatedQuote.provider,
        spenderForAllowance: spenderForLog,
        hasAllowance,
        needsApproval,
        allowanceCheckUncertain,
      });

      // Build extended quote for UI - includes all fields for compatibility
      const extendedQuote: SwapQuote = {
        ...quote,
        fromSymbol,
        toSymbol,
        minAmountOut: aggregatedQuote.minAmountOut,
        minAmountOutFormatted: aggregatedQuote.minAmountOutFormatted,
        slippage: slippage || DEFAULT_SLIPPAGE,
        needsApproval,
        // PHASE 10: Provider info
        provider: aggregatedQuote.provider,
        aggregatedQuote,
        quoteSelectionReason: aggregation.selectionReason,
        runnerUpAggregatedQuote: aggregation.alternative
          ? {
              provider: aggregation.alternative.provider,
              amountOut: aggregation.alternative.amountOutFormatted,
            }
          : null,
        routeMode,
        // Quote expiry: timestamp when this quote was received
        quoteTimestamp: Date.now(),
        // UI-compatible fields
        success: true,
        from_asset: fromSymbol,
        to_asset: toSymbol,
        from_amount: fromAmount,
        to_amount: aggregatedQuote.amountOutFormatted,
        rate,
        price_impact: aggregatedQuote.priceImpact,
        minimum_received: aggregatedQuote.minAmountOutFormatted,
        allowanceCheckUncertain: allowanceCheckUncertain || undefined,
      };

      // Check if this request is still valid (inputs haven't changed)
      if (thisRequestId !== quoteRequestIdRef.current) {
        console.log('[Swap] Quote response ignored - stale request ID:', thisRequestId, 'current:', quoteRequestIdRef.current);
        return null;
      }

      logLifecycle('checking_allowance', 'previewing', {
        provider: aggregatedQuote.provider,
        quote: aggregatedQuote.amountOutFormatted,
        needsApproval,
        allowanceCheckUncertain,
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
          aggregator_selection_reason: aggregation.selectionReason,
          runner_up_provider: aggregation.alternative?.provider,
          runner_up_to_amount: aggregation.alternative?.amountOutFormatted,
        },
        gas_estimate: {
          gas_limit: aggregatedQuote.providerDetails.gas.toString(),
          gas_price: '0',
          estimated_cost_native: '0',
        },
      });

      // RADAR: Process quote for price movement signals
      try {
        const toToken = getTokenBySymbol(toSymbol, chainId || 1);
        processQuoteForSignals(
          {
            address: tokenIn?.address || '',
            symbol: fromSymbol,
          },
          {
            address: toToken?.address || '',
            symbol: toSymbol,
          },
          chainId || 1,
          {
            rate: parseFloat(rate),
            amountOut: parseFloat(aggregatedQuote.amountOutFormatted),
            provider: aggregatedQuote.provider,
          }
        );
      } catch (radarErr) {
        // Radar errors should never block swaps
        console.warn('[Radar] Signal processing failed:', radarErr);
      }

      return extendedQuote;
    } catch (err) {
      // Check if this request is still valid before showing error
      if (thisRequestId !== quoteRequestIdRef.current) {
        console.log('[Swap] Error ignored - stale request ID:', thisRequestId, 'current:', quoteRequestIdRef.current);
        return null;
      }

      const parsed = parseQuoteError(err);
      console.error('[Swap] Quote error:', err);
      logLifecycle(state.status, 'error', { error: parsed.message });
      setSwapQuote(null);
      clearQuote();
      setState((s) => ({ ...s, status: 'error', error: parsed.message }));
      toast.error(parsed.message);
      return null;
    }
  // Note: state.status removed from deps to prevent infinite loop - it's only used for logging
  }, [address, fromAsset, toAsset, fromAmount, chainId, slippage, routeMode, provider, setQuote, clearQuote]);

  // Execute token approval
  const executeApproval = useCallback(async (): Promise<boolean> => {
    if (!swapQuote || !chainId) {
      throw new Error('No quote available. Please enter an amount and wait for a quote before proceeding.');
    }

    if (isNativeSwapInput(fromAsset, swapQuote.fromSymbol, chainId)) {
      console.warn('[Swap] executeApproval skipped — native gas token input does not use ERC20 allowance', {
        fromSymbol: swapQuote.fromSymbol,
        provider: swapQuote.provider,
      });
      return true;
    }

    try {
      logLifecycle(state.status, 'approving', { token: swapQuote.fromSymbol, provider: swapQuote.provider });
      setState((s) => ({ ...s, status: 'approving' }));
      toast.info('Approving token spending...');

      const signer = await getSigner();

      // Compute exact approval amount from quote (for exact approval mode)
      const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
      const exactAmount = tokenIn
        ? parseUnits(
            formatUnits(swapQuote.amountIn, tokenIn.decimals),
            tokenIn.decimals,
          )
        : undefined;
      const useExact = approvalMode === 'exact' && exactAmount !== undefined;

      console.log('[Swap] Approval mode:', approvalMode, useExact ? `(${exactAmount})` : '(unlimited)');

      // Build approval transaction based on provider + approval mode
      let approvalTx: { to: string; data: string; value: string };

      if (swapQuote.provider === '1inch') {
        // Use 1inch approval API — pass amount string for exact mode
        console.log('[Swap] Building 1inch approval...');
        const amountStr = useExact && tokenIn
          ? formatUnits(swapQuote.amountIn, tokenIn.decimals)
          : undefined;
        approvalTx = await buildOneInchApproval(swapQuote.fromSymbol, chainId, amountStr);
      } else if (swapQuote.provider === 'pancakeswap-v3') {
        // PancakeSwap router approval (BSC)
        console.log('[Swap] Building PancakeSwap approval...');
        const pancakeApproval = buildPancakeApprovalTx(
          swapQuote.fromSymbol,
          useExact ? exactAmount : undefined,
        );
        approvalTx = {
          to: pancakeApproval.to,
          data: pancakeApproval.data,
          value: pancakeApproval.value,
        };
      } else if (swapQuote.provider === 'uniswap-v3-wrapper') {
        const wrapperAddr = getUniswapWrapperSpenderAddress();
        if (!wrapperAddr) {
          throw new Error('Uniswap fee wrapper is enabled in the environment but the wrapper address is not configured.');
        }
        console.log('[Swap] Building Uniswap wrapper approval...');
        const wrapAppr = buildWrapperApprovalTx(
          swapQuote.fromSymbol,
          wrapperAddr,
          chainId,
          useExact ? exactAmount : undefined,
        );
        approvalTx = {
          to: wrapAppr.to,
          data: wrapAppr.data,
          value: wrapAppr.value,
        };
      } else {
        // Uniswap router approval (ETH)
        console.log('[Swap] Building Uniswap approval...');
        approvalTx = buildRouterApproval(
          swapQuote.fromSymbol,
          chainId,
          useExact ? exactAmount : undefined,
        );
      }

      console.log('[Swap] Sending approval:', { provider: swapQuote.provider, ...approvalTx });

      // Send approval transaction (wallet signs)
      const tx = await signer.sendTransaction({
        to: approvalTx.to,
        data: approvalTx.data,
        value: BigInt(approvalTx.value),
      });

      toast.info('Approval sent — waiting for on-chain confirmation…');
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
  }, [swapQuote, chainId, approvalMode, getSigner, state.status, fromAsset]);

  // Execute the swap
  const executeSwap = useCallback(async (): Promise<string> => {
    if (!swapQuote || !address || !chainId) {
      throw new Error('No quote available. Please enter an amount and wait for a quote before proceeding.');
    }

    if (swapQuote.allowanceCheckUncertain) {
      const msg =
        'Could not verify token allowance (network). Refresh the quote and try again before swapping.';
      toast.warning(msg);
      throw new Error(msg);
    }

    let broadcastTx: { hash: string } | null = null;

    try {
      // Handle approval if needed
      if (swapQuote.needsApproval) {
        await executeApproval();
        // Update quote to reflect approval
        setSwapQuote((s) => (s ? { ...s, needsApproval: false } : null));
      }

      // Resolve signer before flipping to `swapping` so we do not show "Sign swap in your wallet" while
      // WalletConnect / injected provider is still connecting (common source of perceived hangs).
      const signer = await getSigner();

      logLifecycle(state.status, 'swapping', {
        from: swapQuote.fromSymbol,
        to: swapQuote.toSymbol,
        amount: swapQuote.amountIn,
        provider: swapQuote.provider,
      });
      setState((s) => ({ ...s, status: 'swapping' }));
      toast.info('Confirm the swap in your wallet…');

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
      } else if (swapQuote.provider === 'uniswap-v3-wrapper') {
        const wrapperAddr = getUniswapWrapperSpenderAddress();
        if (!wrapperAddr) {
          throw new Error('Uniswap fee wrapper is enabled in the environment but the wrapper address is not configured.');
        }
        console.log('[Swap] Building Uniswap wrapper swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tokenOut = getTokenBySymbol(swapQuote.toSymbol, chainId);
        // Use the same wei→decimal path as allowance / 1inch so calldata matches the quoted trade exactly.
        const amountInHuman = tokenIn
          ? formatUnits(swapQuote.amountIn, tokenIn.decimals)
          : swapQuote.from_amount;
        const wrapperTx = buildWrapperSwapTx(wrapperAddr, {
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: amountInHuman,
          amountOutMin: formatUnits(
            swapQuote.minAmountOut,
            tokenOut?.decimals ?? 18,
          ),
          recipient: address,
          feeTier: swapQuote.feeTier,
          chainId,
        });
        swapTx = wrapperTx;
      } else {
        // Build Uniswap swap transaction (direct SwapRouter02)
        // `swapQuote.amountIn` is wei (QuoteResult); buildSwapTx expects human decimal strings + parseUnits.
        console.log('[Swap] Building Uniswap swap...');
        const tokenInMeta = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tokenOutMeta = getTokenBySymbol(swapQuote.toSymbol, chainId);
        const amountInHuman = tokenInMeta
          ? formatUnits(swapQuote.amountIn, tokenInMeta.decimals)
          : swapQuote.from_amount;
        const uniswapTx = buildSwapTx({
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: amountInHuman,
          amountOutMin: formatUnits(
            swapQuote.minAmountOut,
            tokenOutMeta?.decimals ?? 18,
          ),
          recipient: address,
          feeTier: swapQuote.feeTier,
          chainId,
        });
        console.log('[Swap] Direct Uniswap tx preview', {
          provider: swapQuote.provider,
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          nativeEthInput: tokenInMeta ? isNativeToken(tokenInMeta.address) : false,
          amountInSource: 'wei→human via formatUnits(swapQuote.amountIn)',
          amountInHumanPreview: amountInHuman,
          to: uniswapTx.to,
          value: uniswapTx.value,
          dataLen: uniswapTx.data?.length ?? 0,
        });
        swapTx = uniswapTx;
      }

      console.log('[Swap] Sending swap:', {
        provider: swapQuote.provider,
        to: swapTx.to,
        dataLen: swapTx.data?.length ?? 0,
        value: swapTx.value,
        gasLimit: swapTx.gasLimit,
      });

      // Omit gasLimit when missing/zero — '0' is truthy in JS and would pass BigInt('0') => 0n (bad for wallets)
      let resolvedGasLimit: bigint | undefined;
      if (swapTx.gasLimit !== undefined && swapTx.gasLimit !== null && swapTx.gasLimit !== '') {
        try {
          const g = BigInt(swapTx.gasLimit);
          if (g > 0n) resolvedGasLimit = g;
        } catch {
          resolvedGasLimit = undefined;
        }
      }

      // Send swap transaction (wallet signs)
      const tx = await signer.sendTransaction({
        to: swapTx.to,
        data: swapTx.data,
        value: BigInt(swapTx.value),
        ...(resolvedGasLimit !== undefined ? { gasLimit: resolvedGasLimit } : {}),
      });

      broadcastTx = tx;

      // PHASE 9: Generate explorer URL for this transaction
      const explorerUrl = getExplorerTxUrl(chainId, tx.hash);

      logLifecycle('swapping', 'confirming', { txHash: tx.hash, explorerUrl });
      setState((s) => ({ ...s, status: 'confirming', txHash: tx.hash, explorerUrl }));

      writePendingSwap({
        chainId,
        fromAddress: address.toLowerCase(),
        txHash: tx.hash,
        explorerUrl,
        submittedAt: Date.now(),
        fromSymbol: swapQuote.fromSymbol,
        toSymbol: swapQuote.toSymbol,
        fromAmount,
        toAmount: swapQuote.amountOutFormatted,
      });

      if (fromAsset && toAsset && swapQuote) {
        addSwapRecord({
          timestamp: Date.now(),
          chainId: chainId || 1,
          fromAsset,
          toAsset,
          fromAmount,
          toAmount: swapQuote.amountOutFormatted,
          minimumToAmount: swapQuote.minimum_received,
          txHash: tx.hash,
          explorerUrl,
          status: 'pending',
          provider: swapQuote.provider,
          slippage,
        });
      }

      toast.info('Swap submitted — waiting for on-chain confirmation…');

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        clearPendingSwap();
        logLifecycle('confirming', 'success', {
          txHash: tx.hash,
          explorerUrl,
          gasUsed: receipt.gasUsed?.toString()
        });
        setState((s) => ({ ...s, status: 'success', txHash: tx.hash, explorerUrl }));
        toast.success('Swap confirmed');

        // Record swap to local history for Quick Repeat
        if (fromAsset && toAsset && swapQuote) {
          addSwapRecord({
            timestamp: Date.now(),
            chainId: chainId || 1,
            fromAsset,
            toAsset,
            fromAmount,
            toAmount: swapQuote.amountOutFormatted,
            minimumToAmount: swapQuote.minimum_received,
            txHash: tx.hash,
            explorerUrl,
            status: 'success',
            provider: swapQuote.provider,
            slippage,
          });
        }

        // Track usage for analytics (local only, no personal data)
        trackEvent('swap_completed');

        // Refresh balances for the current chain
        const chainNetwork = CHAIN_ID_TO_NETWORK[chainId] || 'ethereum';
        await fetchBalances(address, [chainNetwork]);

        return tx.hash;
      } else {
        updateRecordStatus(tx.hash, 'failed');
        throw new Error('Transaction was not successful. The blockchain rejected the swap. Check your transaction on the explorer for details.');
      }
    } catch (err) {
      // PHASE 7: NO silent failures - log everything
      logError('Swap Execution', err);

      // Distinguish 1inch /swap build, wallet/RPC, and broadcast without mislabeling
      const parsed = parseSwapExecutionError(err);

      if (isUserRejection(err)) {
        logLifecycle(state.status, 'previewing', { reason: 'user_rejected' });
        setState((s) => ({ ...s, status: 'previewing' }));
        toast.warning('Swap cancelled. No funds were moved.');
        console.log('[Swap] User rejected transaction');
      } else {
        if (broadcastTx) {
          markPendingSwapOutcomeUncertain();
          updateRecordStatus(broadcastTx.hash, 'uncertain');
        }
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
  }, [swapQuote, address, chainId, getSigner, executeApproval, fetchBalances, state.status, fromAmount, fromAsset, toAsset, addSwapRecord, updateRecordStatus, slippage, trackEvent]);

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
      const error = `Network mismatch: Please switch to a supported chain. Supported chain IDs: ${SUPPORTED_CHAIN_IDS.join(', ')}. Current: ${chainId}`;
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
    if (!swapQuote) {
      throw new Error('No active swap to confirm. Please get a new quote and try again.');
    }

    if (state.status === 'approving' || state.status === 'swapping' || state.status === 'confirming') {
      console.warn('[Swap] confirmSwap ignored — execution already in progress');
      return '';
    }

    if (state.status !== 'previewing') {
      throw new Error('No active swap to confirm. Please get a new quote and try again.');
    }

    // QUOTE EXPIRY CHECK: Block execution if quote is stale (>30 seconds old)
    // Stay in 'previewing' state so user can click "Refresh" instead of seeing error screen
    const quoteAge = Date.now() - swapQuote.quoteTimestamp;
    if (quoteAge > QUOTE_EXPIRY_MS) {
      const expiredSeconds = Math.floor(quoteAge / 1000);
      logLifecycle('previewing', 'previewing', { reason: 'quote_expired', quoteAge: expiredSeconds });
      toast.warning('Quote expired. Refresh for a current price.');
      throw new Error('QUOTE_EXPIRED');
    }

    if (swapExecutionLockRef.current) {
      console.warn('[Swap] confirmSwap ignored — execution lock held');
      return '';
    }

    swapExecutionLockRef.current = true;
    try {
      return await executeSwap();
    } finally {
      swapExecutionLockRef.current = false;
    }
  }, [state.status, swapQuote, executeSwap]);

  // Quote TTL for UX / refresh CTA only while we are still in "quote + preview" — not during wallet/on-chain execution.
  // Otherwise the wall-clock age keeps growing and leaks "expired" / refresh messaging behind an in-flight swap.
  const isQuoteExpired =
    !!swapQuote &&
    (Date.now() - swapQuote.quoteTimestamp) > QUOTE_EXPIRY_MS &&
    (state.status === 'previewing' ||
      state.status === 'fetching_quote' ||
      state.status === 'checking_allowance');

  const pendingSubmittedSwap = useMemo(() => {
    if (!chainId || !address) return null;
    return getPendingSwapForAccount(chainId, address);
  }, [chainId, address, state.status, state.txHash, state.error]);

  const dismissPendingSubmitted = useCallback(() => {
    const p =
      chainId && address
        ? getPendingSwapForAccount(chainId, address)
        : readPendingSwap();
    clearPendingSwap();
    if (p?.txHash) {
      updateRecordStatus(p.txHash, 'uncertain');
    }
    quoteRequestIdRef.current += 1;
    setState({
      status: 'idle',
      quote: null,
      txHash: null,
      explorerUrl: null,
      error: null,
    });
    setSwapQuote(null);
    clearQuote();
  }, [chainId, address, clearQuote, updateRecordStatus]);

  /** After refresh: reconcile stored pending tx with chain; resume confirming if still pending. */
  useEffect(() => {
    if (!provider || !chainId || !address) return;

    const pending = getPendingSwapForAccount(chainId, address);
    if (!pending) return;

    let cancelled = false;

    (async () => {
      try {
        const receipt = await provider.getTransactionReceipt(pending.txHash);
        if (cancelled) return;

        if (receipt !== null) {
          clearPendingSwap();
          updateRecordStatus(pending.txHash, receipt.status === 1 ? 'success' : 'failed');
          const chainNetwork = CHAIN_ID_TO_NETWORK[chainId] || 'ethereum';
          if (receipt.status === 1) {
            toast.success(
              'An earlier swap completed on-chain. Verify balances in your wallet; refresh the quote if needed.'
            );
            await fetchBalances(address, [chainNetwork]);
          } else {
            toast.warning('An earlier swap transaction reverted on-chain.');
          }
          setState((s) => {
            if (s.txHash === pending.txHash && (s.status === 'confirming' || s.status === 'error')) {
              return { ...s, status: 'idle', quote: null, txHash: null, explorerUrl: null, error: null };
            }
            return s;
          });
          return;
        }

        setState((s) => {
          if (s.txHash === pending.txHash && s.status === 'confirming') return s;
          return {
            ...s,
            status: 'confirming',
            txHash: pending.txHash,
            explorerUrl: pending.explorerUrl,
            error: null,
          };
        });
      } catch {
        if (cancelled) return;
        setState((s) => {
          if (s.txHash === pending.txHash && s.status === 'confirming') return s;
          return {
            ...s,
            status: 'confirming',
            txHash: pending.txHash,
            explorerUrl: pending.explorerUrl,
            error: null,
          };
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provider, chainId, address, fetchBalances, updateRecordStatus]);

  /**
   * Refresh recovery: no in-memory quote but swap tx was already broadcast — wait for receipt here
   * (executeSwap already awaits when swapQuote is still present).
   */
  useEffect(() => {
    const hash = state.txHash;
    if (state.status !== 'confirming' || !hash || !provider || !chainId || !address) return;
    if (swapQuote) return;

    let cancelled = false;

    (async () => {
      try {
        const receipt = await provider.waitForTransaction(hash);
        if (cancelled) return;

        clearPendingSwap();
        const chainNetwork = CHAIN_ID_TO_NETWORK[chainId] || 'ethereum';
        const explorerUrlResolved = getExplorerTxUrl(chainId, hash);

        if (receipt?.status === 1) {
          updateRecordStatus(hash, 'success');
          toast.success('Swap confirmed on-chain. Balances may take a moment to update.');
          await fetchBalances(address, [chainNetwork]);
          setState((s) => ({
            ...s,
            status: 'idle',
            quote: null,
            txHash: null,
            explorerUrl: null,
            error: null,
          }));
          setSwapQuote(null);
          clearQuote();
          return;
        }

        toast.warning('This swap reverted on-chain.');
        updateRecordStatus(hash, 'failed');
        setState((s) => ({
          ...s,
          status: 'error',
          error: 'Transaction reverted on-chain. Check the explorer for details.',
          txHash: hash,
          explorerUrl: explorerUrlResolved,
        }));
      } catch {
        if (cancelled) return;
        markPendingSwapOutcomeUncertain();
        updateRecordStatus(hash, 'uncertain');
        const explorerUrlResolved = getExplorerTxUrl(chainId, hash);
        setState((s) => ({
          ...s,
          status: 'error',
          error:
            'Could not confirm this transaction from this session. Check the explorer — it may still be pending or may have succeeded.',
          txHash: hash,
          explorerUrl: explorerUrlResolved,
        }));
        toast.warning('Connection dropped while waiting. Verify the explorer before retrying a new swap.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.status, state.txHash, swapQuote, provider, chainId, address, fetchBalances, clearQuote, updateRecordStatus]);

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
    isQuoteExpired,
    pendingSubmittedSwap,
    dismissPendingSubmitted,

    // Actions
    swap,              // Initiate swap (gets quote, shows preview)
    confirmSwap,       // Execute after user confirms preview
    cancelPreview,     // Cancel the preview
    fetchSwapQuote,    // Just get quote without executing
    reset,
  };
}

export default useSwap;
