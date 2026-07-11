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
import { formatBalance } from '@/utils/format';
import { useWallet } from './useWallet';
import { useSwapStore } from '@/stores/swapStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { toast } from '@/stores/toastStore';
import { walletEvents, getWalletEventMessage } from '@/services/walletEvents';
import { processQuoteForSignals } from '@/services/radarService';
import { getSwapQuoteInputFingerprint } from '@/utils/swapQuoteInputFingerprint';
import { useSwapHistoryStore } from '@/stores/swapHistoryStore';
import {
  applyJournalReceiptUpdate,
  getJournalRecordId,
  useTransactionJournalStore,
} from '@/stores/transactionJournalStore';
import { createFlowId } from '@/utils/transactionJournalIdentity';
import {
  buildApprovalJournalContext,
  buildSwapJournalContext,
  warnJournalWriteFailure,
} from '@/utils/swapJournalIntegration';
import { useUsageStore } from '@/stores/usageStore';
import { useCommissionMonitorStore } from '@/stores/commissionMonitorStore';
import {
  isUserRejection,
  isWalletSignRequestPending,
  parseTransactionError,
  parseSwapExecutionError,
  parseQuoteError,
  attachCommissionRouteFailure,
  logError,
  WALLET_SIGN_REQUEST_PENDING_MESSAGE,
  type ParsedError,
  type CommissionQuoteAttemptMeta,
} from '@/utils/errors';
import { classifyWrapperQuoteFailure } from '@/utils/wrapperQuoteDiagnostics';
import {
  validateSwapInputs,
  isSameToken,
  parseAmount,
  logValidationErrors,
} from '@/utils/swapValidation';
import { swapObsLog } from '@/utils/swapObservability';
import {
  getQuoteRoutePathFingerprint,
  isReusableFreshQuote,
} from '@/utils/reusableFreshQuote';
import {
  beginSwapExecutionTiming,
  clearSwapExecutionTiming,
  markSwapExecutionTiming,
  resolveUniswapWrapperV3GasLimitHint,
} from '@/utils/swapExecutionTiming';
import {
  CONFIRM_SWAP_IN_PROGRESS_MESSAGE,
  SWAP_EXECUTION_IN_PROGRESS,
  STALE_EXECUTION_LOCK_MS,
  getConfirmSwapBlockReason,
  shouldClearStaleExecutionLock,
  staleExecutionLockAgeMs,
  type ConfirmSwapBlockReason,
} from '@/utils/confirmSwapExecution';
import { classifyCommissionRoute } from '@/utils/commission';
import { isCommissionPairAuditBlocked } from '@/constants/commissionCoverage';
import { estimateWrapperFeeWeiFromNetOutput } from '@/utils/wrapperFee';
import {
  decodeNativeEthOutputAndFeeFromLogs,
  decodeSwapOutputAndFeeFromLogs,
  type DecodedOutputAndFee,
} from '@/utils/swapReceiptDecode';
import {
  logProductionEvent,
  type ProductionMonitoringPayload,
} from '@/utils/productionMonitoring';
import {
  buildRevenuePairKey,
  logRevenueTelemetry,
  notionalBucketFromAmount,
} from '@/utils/revenueTelemetry';
import { getTokenRouteSupport } from '@/utils/routeSupport';
import { recordSuccessfulSwapPair } from '@/utils/routePrecheck';

// Import Uniswap V3 services
import { type FeeTier, type QuoteResult, getBestWrapperQuote } from '@/services/uniswapQuote';
import type { UniswapWrapperV3QuoteResult } from '@/services/uniswapWrapperQuoteV3';
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
  getQuoteFromProvider,
  isCommissionWrapperExecutionProvider,
  normalizePancakeWrapperAggregatedQuote,
  normalizeUniswapWrapperAggregatedQuote,
  type AggregatedQuote,
  type QuoteRouteMode,
} from '@/services/quoteAggregator';
import { readCommissionWrapperAllowanceVsRequired } from '@/services/allowanceRead';
import { getBestPancakeWrapperQuote } from '@/services/pancakeWrapperQuote';
import {
  buildPancakeWrapperApprovalTx,
  buildPancakeWrapperSwapTx,
} from '@/services/pancakeWrapperTxBuilder';
import {
  buildPancakeWrapperV2ApprovalTx,
  buildPancakeWrapperV2SwapTx,
} from '@/services/pancakeWrapperTxBuilderV2';
import {
  buildUniswapWrapperV2ApprovalTx,
  buildUniswapWrapperV2SwapTx,
} from '@/services/uniswapWrapperTxBuilderV2';
import {
  buildUniswapWrapperV3ApprovalTx,
  buildUniswapWrapperV3SwapTx,
  getUniswapWrapperV3TxParamsFromQuote,
} from '@/services/uniswapWrapperTxBuilderV3';
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
import { getSwapAddress, getTokenByAddress, getTokenBySymbol, isNativeToken, isNativeSwapInput } from '@/tokens';
import {
  ensurePancakeWrapperChainFeeBps,
  ensurePancakeWrapperV2ChainFeeBps,
  ensureUniswapWrapperChainFeeBps,
  ensureUniswapWrapperV2ChainFeeBps,
  ensureUniswapWrapperV3ChainFeeBps,
  getExplorerTxUrl,
  getPancakeWrapperConfig,
  getPancakeWrapperFeeBpsForUi,
  getPancakeWrapperSessionOnChainFeeBps,
  getPancakeWrapperSpenderAddress,
  getPancakeWrapperV2Config,
  getPancakeWrapperV2FeeBpsForUi,
  getPancakeWrapperV2SessionOnChainFeeBps,
  getPancakeWrapperV2SpenderAddress,
  getUniswapV3Addresses,
  getUniswapWrapperConfig,
  getUniswapWrapperFeeBpsForUi,
  getUniswapWrapperSessionOnChainFeeBps,
  getUniswapWrapperSpenderAddress,
  getUniswapWrapperV2Config,
  getUniswapWrapperV2FeeBpsForUi,
  getUniswapWrapperV2SessionOnChainFeeBps,
  getUniswapWrapperV2SpenderAddress,
  getUniswapWrapperV3Config,
  getUniswapWrapperV3FeeBpsForUi,
  getUniswapWrapperV3SessionOnChainFeeBps,
  getUniswapWrapperV3SpenderAddress,
  shouldUsePancakeWrapperForSymbols,
  shouldUseUniswapWrapperForSymbols,
  isCommissionRequiredMode,
  isUniswapWrapperV3CommissionEligible,
} from '@/config';
import {
  clearPendingSwap,
  getPendingSwapForAccount,
  readPendingSwap,
} from '@/utils/pendingSwapStorage';
import type { AssetInfo } from '@/types/api';

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

/** On-chain or fallback settlement shown on the success receipt (display-only). */
export interface SwapReceiptSettlement {
  receivedHuman: string;
  receivedSymbol: string;
  feeHuman: string | null;
  feeSymbol: string | null;
  /** How the protocol fee number was derived — drives success-modal copy. */
  feeProvenance: 'treasury_transfer' | 'inferred_from_receipt_net' | 'inferred_from_quote' | 'none';
  userReceivedSource: 'receipt' | 'quote';
}

interface SwapState {
  status: SwapStatus;
  quote: QuoteResult | null;
  txHash: string | null;
  explorerUrl: string | null;  // PHASE 9: Explorer link for confirmed tx
  error: string | null;
  /** Structured quote error (P4.1-A); execution errors clear this to null. */
  quoteErrorParsed: ParsedError | null;
  receiptSettlement: SwapReceiptSettlement | null;
}

// PHASE 10 + 11: Provider type for routing
export type SwapProvider =
  | 'uniswap-v3'
  | 'uniswap-v3-wrapper'
  | 'uniswap-v3-wrapper-v2'
  | 'uniswap-v3-wrapper-v3'
  | 'pancakeswap-v3'
  | 'pancakeswap-v3-wrapper'
  | 'pancakeswap-v3-wrapper-v2'
  | '1inch';

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

/** Verbose swap fetch / route / lifecycle trace — dev or `VITE_DEBUG_SWAP=true` only. */
const SWAP_TRACE_LOG =
  import.meta.env.DEV ||
  (typeof import.meta.env.VITE_DEBUG_SWAP === 'string' &&
    ['1', 'true', 'yes', 'on'].includes(import.meta.env.VITE_DEBUG_SWAP.trim().toLowerCase()));

function swapTrace(...args: unknown[]): void {
  if (!SWAP_TRACE_LOG) return;
  console.log(...args);
}

/** If the wallet never resolves a sign request, release in-app guards so the user can retry. */
const WALLET_SIGN_IN_FLIGHT_RELEASE_MS = 120_000;

// BSC Pancake wrapper V2 target contract (spender / swap target)
const PANCAKE_WRAPPER_V2_EXPECTED_TO = '0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6';

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
  if (!SWAP_TRACE_LOG) return;
  const timestamp = new Date().toISOString();
  const transition = fromStatus ? `${fromStatus} → ${toStatus}` : `→ ${toStatus}`;
  console.log(`[Swap Lifecycle] ${timestamp} | ${transition}`, details || '');
}

/** Compact token snapshot for monitoring / admin ingest (no secrets). */
function buildMonitoringTokenWire(
  symbol: string,
  chainId: number,
  asset: AssetInfo | null,
): { symbol: string; address: string | null; isNative: boolean } {
  const meta =
    getTokenBySymbol(symbol, chainId) ||
    (asset?.contract_address ? getTokenByAddress(asset.contract_address, chainId) : undefined);
  if (!meta) {
    return { symbol, address: null, isNative: !!asset?.is_native };
  }
  let address: string | null = null;
  try {
    address = getSwapAddress(meta, chainId);
  } catch {
    address = meta.address ?? null;
  }
  return {
    symbol: meta.symbol ?? symbol,
    address,
    isNative: isNativeToken(meta.address),
  };
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
  const {
    fromAsset,
    toAsset,
    fromAmount,
    slippage,
    approvalMode,
    routeMode,
    setQuote,
    clearQuote,
  } = useSwapStore();
  const { fetchBalances } = useBalanceStore();
  const { updateRecordStatus } = useSwapHistoryStore();
  const { trackEvent } = useUsageStore();
  const { addConfirmedSwapEvent } = useCommissionMonitorStore();

  const [state, setState] = useState<SwapState>({
    status: 'idle',
    quote: null,
    txHash: null,
    explorerUrl: null,
    error: null,
    quoteErrorParsed: null,
    receiptSettlement: null,
  });

  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);

  const quoteInputFingerprint = useMemo(
    () =>
      getSwapQuoteInputFingerprint({
        chainId: chainId || 1,
        slippage,
        fromAmount,
        fromAsset,
        toAsset,
        routeMode,
      }),
    [chainId, slippage, fromAmount, fromAsset, toAsset, routeMode],
  );

  const prevQuoteInputFingerprintRef = useRef<string | null>(null);

  // Quote request ID counter - prevents stale responses from updating UI
  const quoteRequestIdRef = useRef(0);

  /** P4.4-K1 — context captured when a quote lands (preview reuse safety). */
  const quoteCapturedWalletRef = useRef<string | null>(null);
  const quoteCapturedInputFingerprintRef = useRef<string | null>(null);
  const quoteCapturedRouteFingerprintRef = useRef<string | null>(null);
  const quoteCapturedCommissionRequiredRef = useRef<boolean | null>(null);

  const clearQuoteCaptureContext = useCallback(() => {
    quoteCapturedWalletRef.current = null;
    quoteCapturedInputFingerprintRef.current = null;
    quoteCapturedRouteFingerprintRef.current = null;
    quoteCapturedCommissionRequiredRef.current = null;
  }, []);

  /**
   * Phase 3: Clear hook + store quote as soon as amount, tokens, chain, slippage, or route mode change
   * (before debounced refetch). Bump request id so in-flight responses cannot repopulate stale UI.
   * Does not run during approving / swapping / confirming (execution must keep swapQuote).
   */
  useEffect(() => {
    const prev = prevQuoteInputFingerprintRef.current;
    prevQuoteInputFingerprintRef.current = quoteInputFingerprint;

    if (prev === null) return;
    if (prev === quoteInputFingerprint) return;

    const statusBlocking =
      state.status === 'approving' || state.status === 'swapping' || state.status === 'confirming';
    if (statusBlocking) return;

    quoteRequestIdRef.current += 1;
    setSwapQuote(null);
    clearQuote();
    clearQuoteCaptureContext();
    setState((s) => {
      if (s.status === 'fetching_quote' || s.status === 'checking_allowance' || s.status === 'previewing') {
        return { ...s, status: 'idle', error: null, quoteErrorParsed: null };
      }
      return { ...s, error: null, quoteErrorParsed: null };
    });
  }, [quoteInputFingerprint, clearQuote, clearQuoteCaptureContext, state.status]);

  // Track if operation was cancelled by wallet event
  const isCancelledRef = useRef(false);

  /** Prevents double confirm / overlapping executeSwap when state updates lag one frame. */
  const swapExecutionLockRef = useRef(false);
  /** Wall-clock when execution lock was taken — used for stale-lock recovery in previewing only. */
  const swapExecutionLockStartedAtRef = useRef<number | null>(null);

  /** Blocks a second approval `sendTransaction` while the first is still with the wallet (Trust -32002). */
  const approvalWalletSigningInFlightRef = useRef(false);
  const approvalWalletGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Blocks a second swap `sendTransaction` while the first is still with the wallet. */
  const swapWalletSigningInFlightRef = useRef(false);
  const swapWalletGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Links approval + swap records within one confirmSwap execution flow. */
  const swapFlowIdRef = useRef<string | null>(null);
  /** Last approval journal record id in the active flow (for linkage). */
  const lastApprovalRecordIdRef = useRef<string | null>(null);

  const clearApprovalWalletSigningGuard = useCallback(() => {
    if (approvalWalletGuardTimerRef.current != null) {
      clearTimeout(approvalWalletGuardTimerRef.current);
      approvalWalletGuardTimerRef.current = null;
    }
    approvalWalletSigningInFlightRef.current = false;
  }, []);

  const clearSwapWalletSigningGuard = useCallback(() => {
    if (swapWalletGuardTimerRef.current != null) {
      clearTimeout(swapWalletGuardTimerRef.current);
      swapWalletGuardTimerRef.current = null;
    }
    swapWalletSigningInFlightRef.current = false;
  }, []);

  const armApprovalWalletSigningGuard = useCallback(() => {
    clearApprovalWalletSigningGuard();
    approvalWalletSigningInFlightRef.current = true;
    approvalWalletGuardTimerRef.current = setTimeout(() => {
      approvalWalletSigningInFlightRef.current = false;
      approvalWalletGuardTimerRef.current = null;
    }, WALLET_SIGN_IN_FLIGHT_RELEASE_MS);
  }, [clearApprovalWalletSigningGuard]);

  const armSwapWalletSigningGuard = useCallback(() => {
    clearSwapWalletSigningGuard();
    swapWalletSigningInFlightRef.current = true;
    swapWalletGuardTimerRef.current = setTimeout(() => {
      swapWalletSigningInFlightRef.current = false;
      swapWalletGuardTimerRef.current = null;
    }, WALLET_SIGN_IN_FLIGHT_RELEASE_MS);
  }, [clearSwapWalletSigningGuard]);

  useEffect(() => {
    return () => {
      clearApprovalWalletSigningGuard();
      clearSwapWalletSigningGuard();
    };
  }, [clearApprovalWalletSigningGuard, clearSwapWalletSigningGuard]);

  // PHASE 14: Handle wallet events (disconnect, chain change, account change)
  useEffect(() => {
    // Only listen when swap is in progress
    const isActive = state.status !== 'idle' && state.status !== 'success' && state.status !== 'error';
    if (!isActive) {
      isCancelledRef.current = false;
      return;
    }

    const unsubscribe = walletEvents.onAny((event) => {
      swapTrace(`[Swap] Wallet event during active swap: ${event.type}`);

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
      setState({
        status: 'idle',
        quote: null,
        txHash: null,
        explorerUrl: null,
        error: null,
        quoteErrorParsed: null,
        receiptSettlement: null,
      });
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
    swapTrace('[Swap] Reset - invalidating pending requests, new ID:', quoteRequestIdRef.current);

    logLifecycle(state.status, 'idle', { action: 'reset' });
    setState({
      status: 'idle',
      quote: null,
      txHash: null,
      explorerUrl: null,
      error: null,
      quoteErrorParsed: null,
      receiptSettlement: null,
    });
    setSwapQuote(null);
    clearQuote();
  // Note: state.status removed from deps to prevent reset identity from changing
  // when status changes, which would cause infinite loops in consuming components
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearQuote]);

  /** Clear quote error banner + stale quote so user can pick another token (P4.1-A). */
  const dismissQuoteError = useCallback(() => {
    quoteRequestIdRef.current += 1;
    setState((s) => ({
      ...s,
      status: 'idle',
      error: null,
      quoteErrorParsed: null,
    }));
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

  // PHASE 10: Fetch swap quote using aggregator (1inch primary, Uniswap fallback)
  // Uses request ID to prevent stale responses from updating UI
  const fetchSwapQuote = useCallback(async (): Promise<SwapQuote | null> => {
    if (!address || !fromAsset || !toAsset || !fromAmount) {
      setSwapQuote(null);
      clearQuote();
      clearQuoteCaptureContext();
      setState((s) => ({ ...s, status: 'idle', error: null, quoteErrorParsed: null }));
      return null;
    }

    const fromSymbol = getSymbol(fromAsset);
    const toSymbol = getSymbol(toAsset);

    if (!fromSymbol || !toSymbol) {
      setSwapQuote(null);
      clearQuote();
      clearQuoteCaptureContext();
      setState((s) => ({
        ...s,
        status: 'error',
        error: 'Please select both tokens to swap. Choose a token from each dropdown.',
        quoteErrorParsed: null,
      }));
      return null;
    }

    // Increment request ID and capture it for this request
    quoteRequestIdRef.current += 1;
    const thisRequestId = quoteRequestIdRef.current;
    swapTrace('[Swap] Quote request started, ID:', thisRequestId);

    // Invalidate any previous receive-line quote immediately for this new request (avoid stale output)
    setSwapQuote(null);
    clearQuote();
    clearQuoteCaptureContext();

    // PHASE 9: Log lifecycle transition
    logLifecycle(state.status, 'fetching_quote', { fromSymbol, toSymbol, fromAmount });
    setState((s) => ({ ...s, status: 'fetching_quote', error: null, quoteErrorParsed: null }));

    for (let quoteAttempt = 0; quoteAttempt < 2; quoteAttempt++) {
      try {
      swapTrace('[Swap] Fetching quote via aggregator:', { fromSymbol, toSymbol, fromAmount });
      if (SWAP_TRACE_LOG) console.debug('route_mode_selected', { routeMode });

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

      const commissionRequired = isCommissionRequiredMode();
      if (
        commissionRequired &&
        isCommissionPairAuditBlocked(chainId || 1, fromSymbol, toSymbol)
      ) {
        throw attachCommissionRouteFailure(
          'unsupported_commission_route',
          'Pair blocked by Swaperex commission audit policy.',
          {
            attemptedProvider: 'policy_block',
            chainId: chainId || 1,
            fromSymbol,
            toSymbol,
            fromAmount,
          },
        );
      }
      const tokenInMetaForMode = getTokenBySymbol(fromSymbol, chainId || 1);
      const tokenOutMetaForMode = getTokenBySymbol(toSymbol, chainId || 1);
      const inNativeForMode = tokenInMetaForMode ? isNativeToken(tokenInMetaForMode.address) : false;
      const outNativeForMode = tokenOutMetaForMode ? isNativeToken(tokenOutMetaForMode.address) : false;

      /** Route mode used for this quote request (may auto-switch to V2 for BSC native + commission-required). */
      let effectiveRouteMode: QuoteRouteMode = routeMode;
      /** Sync store route after quote lands (avoids mid-fetch `setRouteMode` → duplicate debounced fetch). */
      let routeModeProgrammaticSync: QuoteRouteMode | null = null;

      let aggregation;

      // Commission-required mode: wrapper-only execution when a commission-capable wrapper exists.
      if (commissionRequired) {
        const cid = chainId || 1;

        if (inNativeForMode || outNativeForMode) {
          if (cid === 56) {
            const cfg = getPancakeWrapperV2Config();
            const flags = {
              nativeEnabled: cfg.nativeEnabled,
              nativeQuoteEnabled: cfg.nativeQuoteEnabled,
            };

            if (routeMode !== 'pancakeswap-v3-wrapper-v2') {
              swapTrace('native_route_auto_forced', {
                tokenIn: fromSymbol,
                tokenOut: toSymbol,
                previousRouteMode: routeMode,
                flags,
              });
              routeModeProgrammaticSync = 'pancakeswap-v3-wrapper-v2';
              effectiveRouteMode = 'pancakeswap-v3-wrapper-v2';
            }

            if (!cfg.nativeEnabled) {
              swapTrace('pancake_wrapper_v2_native_blocked', {
                tokenIn: fromSymbol,
                tokenOut: toSymbol,
                routeMode: effectiveRouteMode,
                flags,
              });
              swapTrace('commission_required_route_blocked', {
                chainId: 56,
                routeMode: effectiveRouteMode,
                reason: 'native_wrapper_v2_not_enabled',
                tokenIn: fromSymbol,
                tokenOut: toSymbol,
              });
              throw attachCommissionRouteFailure('commission_bsc_native_disabled');
            }

            swapTrace('pancake_wrapper_v2_native_enabled', {
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
              routeMode: effectiveRouteMode,
              flags,
            });
            swapTrace('pancake_wrapper_v2_native_forced', {
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
              routeMode: effectiveRouteMode,
              flags,
            });
          } else if (cid === 1) {
            const u2 = getUniswapWrapperV2Config();
            const u2Flags = {
              nativeEnabled: u2.nativeEnabled,
              nativeQuoteEnabled: u2.nativeQuoteEnabled,
            };

            if (routeMode !== 'uniswap-v3-wrapper-v2') {
              swapTrace('native_route_auto_forced', {
                tokenIn: fromSymbol,
                tokenOut: toSymbol,
                previousRouteMode: routeMode,
                flags: u2Flags,
                chain: 'ethereum',
              });
              routeModeProgrammaticSync = 'uniswap-v3-wrapper-v2';
              effectiveRouteMode = 'uniswap-v3-wrapper-v2';
            }

            if (!u2.nativeQuoteEnabled) {
              swapTrace('uniswap_wrapper_v2_native_blocked', {
                tokenIn: fromSymbol,
                tokenOut: toSymbol,
                routeMode: effectiveRouteMode,
                flags: u2Flags,
              });
              throw attachCommissionRouteFailure('commission_eth_native_v2_required');
            }

            swapTrace('uniswap_wrapper_v2_native_enabled', {
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
              routeMode: effectiveRouteMode,
              flags: u2Flags,
            });
            swapTrace('uniswap_wrapper_v2_native_forced', {
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
              routeMode: effectiveRouteMode,
              flags: u2Flags,
            });
          } else {
            swapTrace('commission_required_route_blocked', {
              chainId: cid,
              routeMode,
              reason: 'native_leg_unsupported_chain',
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
            });
            throw attachCommissionRouteFailure('commission_native_unsupported_chain');
          }
        }

        if (cid === 56) {
          const fetchCommissionBscV2Quote = async (): Promise<AggregatedQuote> =>
            getQuoteFromProvider(
              'pancakeswap-v3-wrapper-v2',
              fromSymbol,
              toSymbol,
              fromAmount,
              56,
              slippage || DEFAULT_SLIPPAGE,
              effectiveRouteMode,
            );

          try {
            let forced: AggregatedQuote;
            try {
              forced = await fetchCommissionBscV2Quote();
            } catch (firstErr) {
              console.warn('[Swap] BSC commission-required V2 quote failed; retrying once', firstErr);
              forced = await fetchCommissionBscV2Quote();
            }
            swapTrace('commission_required_route_selected', {
              chainId: 56,
              routeMode: effectiveRouteMode,
              provider: forced.provider,
              reason: 'forced_pancakeswap_v3_wrapper_v2',
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
            });
            // Warm fee-bps cache for UI (best-effort).
            await ensurePancakeWrapperV2ChainFeeBps(provider, 56);
            aggregation = {
              best: forced,
              alternative: null,
              selectionReason: 'Commission required: forcing PancakeSwap V3 (Swaperex wrapper V2).',
            };
          } catch (wrapperErr) {
            const infra = parseQuoteError(wrapperErr);
            if (infra.category === 'network_error' || infra.category === 'rpc_error') {
              throw wrapperErr instanceof Error ? wrapperErr : new Error(String(wrapperErr));
            }
            swapTrace('commission_required_route_blocked', {
              chainId: 56,
              routeMode: effectiveRouteMode,
              provider: 'pancakeswap-v3-wrapper-v2',
              reason: 'wrapper_v2_quote_failed',
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
            });
            const wrapMsg = (wrapperErr as Error)?.message ?? '';
            throw attachCommissionRouteFailure(
              'unsupported_commission_route',
              wrapMsg,
              {
                attemptedProvider: 'pancakeswap-v3-wrapper-v2',
                chainId: 56,
                fromSymbol,
                toSymbol,
                fromAmount,
                fromTokenAddress: getTokenBySymbol(fromSymbol, 56)?.address ?? null,
                toTokenAddress: getTokenBySymbol(toSymbol, 56)?.address ?? null,
                rawWrapperMessage: wrapMsg.slice(0, 512),
              },
            );
          }
        } else if (cid === 1) {
          const u2 = getUniswapWrapperV2Config();
          const ethNativeLeg = inNativeForMode || outNativeForMode;
          const useV2 =
            ethNativeLeg
              ? !!(u2.enabled && u2.wrapperAddress && u2.nativeQuoteEnabled)
              : !!(u2.enabled && u2.wrapperAddress && effectiveRouteMode === 'uniswap-v3-wrapper-v2');

          const fetchEthCommissionQuote = async (): Promise<AggregatedQuote> => {
            const ethNativeLeg = inNativeForMode || outNativeForMode;
            if (!ethNativeLeg) {
              const u3 = getUniswapWrapperV3Config();
              const tInMeta = getTokenBySymbol(fromSymbol, 1);
              const tOutMeta = getTokenBySymbol(toSymbol, 1);
              if (
                u3.enabled &&
                u3.wrapperAddress &&
                tInMeta &&
                tOutMeta &&
                isUniswapWrapperV3CommissionEligible(1, tInMeta, tOutMeta)
              ) {
                return getQuoteFromProvider(
                  'uniswap-v3-wrapper-v3',
                  fromSymbol,
                  toSymbol,
                  fromAmount,
                  1,
                  slippage || DEFAULT_SLIPPAGE,
                  null,
                );
              }
            }
            if (useV2) {
              return getQuoteFromProvider(
                'uniswap-v3-wrapper-v2',
                fromSymbol,
                toSymbol,
                fromAmount,
                1,
                slippage || DEFAULT_SLIPPAGE,
                effectiveRouteMode,
              );
            }
            return getQuoteFromProvider(
              'uniswap-v3-wrapper',
              fromSymbol,
              toSymbol,
              fromAmount,
              1,
              slippage || DEFAULT_SLIPPAGE,
            );
          };

          try {
            let forced: AggregatedQuote;
            try {
              forced = await fetchEthCommissionQuote();
            } catch (firstErr) {
              const ethNativeLeg = inNativeForMode || outNativeForMode;
              const u3 = getUniswapWrapperV3Config();
              const tInMeta = getTokenBySymbol(fromSymbol, 1);
              const tOutMeta = getTokenBySymbol(toSymbol, 1);
              const v3Eligible =
                !ethNativeLeg &&
                u3.enabled &&
                u3.wrapperAddress &&
                tInMeta &&
                tOutMeta &&
                isUniswapWrapperV3CommissionEligible(1, tInMeta, tOutMeta);
              if (v3Eligible && !useV2) {
                // Allowlisted + V3 on: never downgrade to legacy `uniswap-v3-wrapper` (would hide V3 canary).
                console.warn(
                  '[Swap] ETH commission-required V3 quote failed — not falling back to legacy wrapper V1 for this allowlisted pair.',
                  firstErr,
                );
                throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
              }
              if (v3Eligible && useV2) {
                console.warn('[Swap] ETH commission-required V3 quote failed; retrying wrapper V2', firstErr);
                forced = await getQuoteFromProvider(
                  'uniswap-v3-wrapper-v2',
                  fromSymbol,
                  toSymbol,
                  fromAmount,
                  1,
                  slippage || DEFAULT_SLIPPAGE,
                  effectiveRouteMode,
                );
              } else {
                console.warn('[Swap] ETH commission-required quote failed; retrying once', firstErr);
                forced = await fetchEthCommissionQuote();
              }
            }
            swapTrace('commission_required_route_selected', {
              chainId: 1,
              routeMode: effectiveRouteMode,
              provider: forced.provider,
              reason:
                forced.provider === 'uniswap-v3-wrapper-v3'
                  ? 'forced_uniswap_v3_wrapper_v3'
                  : useV2
                    ? 'forced_uniswap_v3_wrapper_v2'
                    : 'forced_uniswap_v3_wrapper',
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
            });
            if (forced.provider === 'uniswap-v3-wrapper-v3') {
              await ensureUniswapWrapperV3ChainFeeBps(provider, 1);
            } else if (useV2) {
              await ensureUniswapWrapperV2ChainFeeBps(provider, 1);
            } else {
              await ensureUniswapWrapperChainFeeBps(provider, 1);
            }
            aggregation = {
              best: forced,
              alternative: null,
              selectionReason:
                forced.provider === 'uniswap-v3-wrapper-v3'
                  ? 'Commission required: Swaperex Uniswap wrapper V3 (multi-hop).'
                  : useV2
                    ? ethNativeLeg
                      ? 'Commission required: forcing Uniswap V3 (Swaperex wrapper V2).'
                      : 'Commission required: Uniswap V3 (Swaperex wrapper V2) — fixed route preference.'
                    : 'Commission required: forcing Uniswap V3 (Swaperex wrapper).',
            };
          } catch (wrapperErr) {
            const infra = parseQuoteError(wrapperErr);
            if (infra.category === 'network_error' || infra.category === 'rpc_error') {
              throw wrapperErr instanceof Error ? wrapperErr : new Error(String(wrapperErr));
            }
            const ethNl = inNativeForMode || outNativeForMode;
            const u3cfg = getUniswapWrapperV3Config();
            const tA = getTokenBySymbol(fromSymbol, 1);
            const tB = getTokenBySymbol(toSymbol, 1);
            const triedV3First =
              !ethNl &&
              !!(u3cfg.enabled && u3cfg.wrapperAddress && tA && tB && isUniswapWrapperV3CommissionEligible(1, tA, tB));
            const legacyProvider = useV2 ? 'uniswap-v3-wrapper-v2' : 'uniswap-v3-wrapper';
            swapTrace('commission_required_route_blocked', {
              chainId: 1,
              routeMode: effectiveRouteMode,
              provider: triedV3First ? `uniswap-v3-wrapper-v3→${legacyProvider}` : legacyProvider,
              reason: 'wrapper_quote_failed',
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
            });
            const wrapMsg = (wrapperErr as Error)?.message ?? '';
            throw attachCommissionRouteFailure(
              'unsupported_commission_route',
              wrapMsg,
              {
                attemptedProvider: triedV3First
                  ? `uniswap-v3-wrapper-v3_then_${legacyProvider}`
                  : legacyProvider,
                chainId: 1,
                fromSymbol,
                toSymbol,
                fromAmount,
                fromTokenAddress: getTokenBySymbol(fromSymbol, 1)?.address ?? null,
                toTokenAddress: getTokenBySymbol(toSymbol, 1)?.address ?? null,
                rawWrapperMessage: wrapMsg.slice(0, 512),
              },
            );
          }
        } else {
          swapTrace('commission_required_route_blocked', {
            chainId: chainId || 1,
            routeMode,
            reason: 'no_wrapper_available',
            tokenIn: fromSymbol,
            tokenOut: toSymbol,
          });
          throw attachCommissionRouteFailure('commission_chain_no_wrapper');
        }
      } else {
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
            address ?? null,
          ),
          ensureUniswapWrapperChainFeeBps(provider, chainId || 1),
          ensureUniswapWrapperV2ChainFeeBps(provider, chainId || 1),
          ensureUniswapWrapperV3ChainFeeBps(provider, chainId || 1),
          ensurePancakeWrapperChainFeeBps(provider, chainId || 1),
          ensurePancakeWrapperV2ChainFeeBps(provider, chainId || 1),
        ]);
        aggregation = aggregationInitial;
      }

      // Manual route MUST be honored: Pancake wrapper V2 is a fixed-route mode and must not silently degrade.
      // If anything upstream returns a different provider, force the wrapper-v2 quote explicitly.
      if (
        effectiveRouteMode === 'pancakeswap-v3-wrapper-v2' &&
        aggregation.best.provider !== 'pancakeswap-v3-wrapper-v2'
      ) {
        const forced = await getQuoteFromProvider(
          'pancakeswap-v3-wrapper-v2',
          fromSymbol,
          toSymbol,
          fromAmount,
          chainId || 1,
          slippage || DEFAULT_SLIPPAGE,
          effectiveRouteMode,
        );
        aggregation = {
          best: forced,
          alternative: null,
          selectionReason: 'PancakeSwap V3 (Swaperex wrapper V2) — forced by route preference',
        };
      }

      if (
        effectiveRouteMode === 'uniswap-v3-wrapper-v2' &&
        aggregation.best.provider !== 'uniswap-v3-wrapper-v2'
      ) {
        const forced = await getQuoteFromProvider(
          'uniswap-v3-wrapper-v2',
          fromSymbol,
          toSymbol,
          fromAmount,
          chainId || 1,
          slippage || DEFAULT_SLIPPAGE,
          effectiveRouteMode,
        );
        aggregation = {
          best: forced,
          alternative: null,
          selectionReason: 'Uniswap V3 (Swaperex wrapper V2) — forced by route preference',
        };
      }

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
            swapObsLog('wrapper_skip', { reason: 'net_below_1inch' });
          } else {
            aggregation = {
              ...aggregation,
              best: wrappedBest,
              selectionReason: `${aggregation.selectionReason} · Executing via Swaperex Uniswap wrapper (ERC20→ERC20, net output).`,
            };
          }
        } else {
          console.warn('[Swap] Uniswap wrapper quote unavailable — keeping direct Uniswap V3 execution quote.');
          swapObsLog('wrapper_skip', { reason: 'wrapper_quote_unavailable' });
        }
      }

      // V1 fee-wrapper auto-upgrade is **best-price only**. Fixed routes must not be rewritten here:
      // - `pancakeswap-v3` must stay direct SmartRouter when the user forces Pancake.
      // - `pancakeswap-v3-wrapper-v2` must never be replaced by v1.
      if (
        routeMode === 'best' &&
        (chainId || 1) === 56 &&
        aggregation.best.provider === 'pancakeswap-v3' &&
        shouldUsePancakeWrapperForSymbols(chainId || 1, fromSymbol, toSymbol)
      ) {
        const pwq = await getBestPancakeWrapperQuote(fromSymbol, toSymbol, fromAmount);
        const tokenOutMetaBsc = getTokenBySymbol(toSymbol, 56);
        if (pwq && tokenOutMetaBsc) {
          const wrappedPancakeBest = normalizePancakeWrapperAggregatedQuote(
            pwq,
            slippage || DEFAULT_SLIPPAGE,
            tokenOutMetaBsc.decimals,
            56,
          );
          // Same integrity rule as Ethereum Uniswap wrapper: net wrapper output vs 1inch runner-up quoted dst.
          // When Pancake direct beat 1inch gross but wrapper net is worse than 1inch, do not upgrade execution.
          const oneInchAlt =
            routeMode === 'best' && aggregation.alternative?.provider === '1inch'
              ? aggregation.alternative
              : null;
          if (oneInchAlt && wrappedPancakeBest.amountOutRaw < oneInchAlt.amountOutRaw) {
            console.warn(
              '[Swap] Pancake wrapper net below 1inch runner-up — keeping direct PancakeSwap V3 execution quote.',
              {
                wrapperNet: wrappedPancakeBest.amountOutRaw.toString(),
                oneInch: oneInchAlt.amountOutRaw.toString(),
              },
            );
            swapObsLog('pancake_wrapper_skip', {
              reason: 'net_below_1inch',
              wrapperNet: wrappedPancakeBest.amountOutRaw.toString(),
              oneInchNet: oneInchAlt.amountOutRaw.toString(),
            });
          } else {
            swapObsLog('pancake_wrapper_apply', {
              reason: oneInchAlt ? 'net_above_or_equal_1inch' : 'no_1inch_alternative',
              chainId: 56,
              wrapper: String(getPancakeWrapperSpenderAddress() ?? ''),
              wrapperNet: wrappedPancakeBest.amountOutRaw.toString(),
              oneInchNet: oneInchAlt?.amountOutRaw?.toString(),
              feeTier: wrappedPancakeBest.providerDetails?.feeTier,
              tokenIn: fromSymbol,
              tokenOut: toSymbol,
            });
            aggregation = {
              ...aggregation,
              best: wrappedPancakeBest,
              selectionReason: `${aggregation.selectionReason} · Executing via Swaperex Pancake wrapper (ERC20→ERC20, net output).`,
            };
          }
        } else {
          console.warn('[Swap] Pancake wrapper quote unavailable — keeping direct PancakeSwap V3 execution quote.');
          swapObsLog('pancake_wrapper_skip', { reason: 'wrapper_quote_unavailable' });
        }
      }

      const aggregatedQuote = aggregation.best;

      if (SWAP_TRACE_LOG) {
        console.debug('aggregated_quote_selected', {
          provider: aggregatedQuote?.provider,
          routeMode,
        });
      }

      swapTrace(
        '[Swap] Aggregator selected:',
        aggregatedQuote.provider,
        '|',
        aggregatedQuote.amountOutFormatted,
        toSymbol,
        '|',
        aggregation.selectionReason,
      );

      // Extract quote data for compatibility
      const quote: QuoteResult =
        aggregatedQuote.provider === 'uniswap-v3' ||
          aggregatedQuote.provider === 'uniswap-v3-wrapper' ||
          aggregatedQuote.provider === 'uniswap-v3-wrapper-v2' ||
          aggregatedQuote.provider === 'uniswap-v3-wrapper-v3'
        ? (aggregatedQuote.originalQuote as QuoteResult)
        : aggregatedQuote.provider === 'pancakeswap-v3' ||
            aggregatedQuote.provider === 'pancakeswap-v3-wrapper' ||
            aggregatedQuote.provider === 'pancakeswap-v3-wrapper-v2'
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

      // A newer quote request may have started during aggregation. Do not advance this one into
      // `checking_allowance` or it can clobber the latest request's status and strand the UI
      // (stale response returns at the ID check below without updating status again).
      if (thisRequestId !== quoteRequestIdRef.current) {
        swapTrace(
          '[Swap] Quote abandoned before allowance phase — stale request ID:',
          thisRequestId,
          'current:',
          quoteRequestIdRef.current,
        );
        return null;
      }

      const tokenIn = getTokenBySymbol(fromSymbol, chainId || 1);
      let hasAllowance = true;
      let allowanceCheckUncertain = false;

      const inputIsNative = isNativeSwapInput(fromAsset, fromSymbol, chainId || 1);

      // Native tokens don't need approval (no ERC20 allowance / spender flow)
      if (tokenIn && !isNativeToken(tokenIn.address)) {
        if (aggregatedQuote.provider === '1inch') {
          // Check 1inch router allowance — API failure must not imply zero allowance
          const allowance = await checkOneInchAllowance(fromSymbol, address, chainId || 1);
          const amountInWei = BigInt(aggregatedQuote.amountIn);
          if (allowance === null) {
            allowanceCheckUncertain = true;
            hasAllowance = true;
          } else {
            hasAllowance = allowance === 'unlimited' || BigInt(allowance) >= amountInWei;
          }
        } else if (isCommissionWrapperExecutionProvider(aggregatedQuote.provider)) {
          const wrapperAddr =
            aggregatedQuote.provider === 'uniswap-v3-wrapper'
              ? getUniswapWrapperSpenderAddress()
              : aggregatedQuote.provider === 'uniswap-v3-wrapper-v2'
                ? getUniswapWrapperV2SpenderAddress()
                : aggregatedQuote.provider === 'uniswap-v3-wrapper-v3'
                  ? getUniswapWrapperV3SpenderAddress()
                  : aggregatedQuote.provider === 'pancakeswap-v3-wrapper'
                    ? getPancakeWrapperSpenderAddress()
                    : aggregatedQuote.provider === 'pancakeswap-v3-wrapper-v2'
                      ? getPancakeWrapperV2SpenderAddress()
                      : null;
          const amountInWei = BigInt(aggregatedQuote.amountIn);
          if (!wrapperAddr) {
            hasAllowance = false;
          } else if (!address) {
            allowanceCheckUncertain = true;
            hasAllowance = true;
          } else {
            const read = await readCommissionWrapperAllowanceVsRequired({
              chainId: chainId || 1,
              tokenAddress: tokenIn.address,
              tokenSymbol: fromSymbol,
              fromSymbol,
              toSymbol,
              spender: wrapperAddr,
              owner: address,
              required: amountInWei,
              swapProvider: aggregatedQuote.provider,
            });
            if (read === 'unknown') {
              allowanceCheckUncertain = true;
              hasAllowance = true;
            } else {
              hasAllowance = read === 'sufficient';
            }
          }
        } else if (aggregatedQuote.provider === 'pancakeswap-v3') {
          // Check PancakeSwap router allowance (BSC)
          try {
            const { Contract } = await import('ethers');
            const tokenContract = new Contract(tokenIn.address, ALLOWANCE_ABI, provider);
            const allowance = await tokenContract.allowance(address, PANCAKESWAP_V3_ADDRESSES.router);
            const amountInWei = BigInt(aggregatedQuote.amountIn);
            hasAllowance = allowance >= amountInWei;
          } catch {
            allowanceCheckUncertain = true;
            hasAllowance = true;
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

      // Enter allowance phase only after async reads complete (ERC20) so a superseding request
      // cannot strand the UI in `checking_allowance` while this response is later discarded.
      if (thisRequestId !== quoteRequestIdRef.current) {
        swapTrace(
          '[Swap] Quote abandoned after allowance reads — stale request ID:',
          thisRequestId,
          'current:',
          quoteRequestIdRef.current,
        );
        return null;
      }

      logLifecycle('fetching_quote', 'checking_allowance', { tokenIn: fromSymbol, provider: aggregatedQuote.provider });
      setState((s) => ({ ...s, status: 'checking_allowance' }));

      // Calculate rate
      const rate = (parseFloat(aggregatedQuote.amountOutFormatted) / parseFloat(fromAmount)).toFixed(6);

      const needsApproval = !inputIsNative && !hasAllowance;

      const uniswapForLog = getUniswapV3Addresses(chainId || 1);
      const spenderForLog =
        aggregatedQuote.provider === 'uniswap-v3-wrapper'
          ? getUniswapWrapperSpenderAddress()
          : aggregatedQuote.provider === 'uniswap-v3-wrapper-v2'
            ? getUniswapWrapperV2SpenderAddress()
            : aggregatedQuote.provider === 'uniswap-v3-wrapper-v3'
              ? getUniswapWrapperV3SpenderAddress()
              : aggregatedQuote.provider === 'pancakeswap-v3-wrapper-v2'
                ? getPancakeWrapperV2SpenderAddress()
                : aggregatedQuote.provider === 'pancakeswap-v3-wrapper'
                  ? getPancakeWrapperSpenderAddress()
                  : aggregatedQuote.provider === 'uniswap-v3'
                    ? uniswapForLog?.router ?? null
                    : aggregatedQuote.provider === 'pancakeswap-v3'
                      ? '(pancake router)'
                      : aggregatedQuote.provider === '1inch'
                        ? '(1inch spender)'
                        : null;

      swapTrace('[Swap] Approval gate', {
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
        routeMode: effectiveRouteMode,
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
        swapTrace('[Swap] Quote response ignored - stale request ID:', thisRequestId, 'current:', quoteRequestIdRef.current);
        return null;
      }

      swapObsLog('quote_ready', {
        chainId: chainId || 0,
        routeMode: String(effectiveRouteMode),
        provider: aggregatedQuote.provider,
        from: fromSymbol,
        to: toSymbol,
        inputNative: inputIsNative,
        spender: String(spenderForLog ?? ''),
        needsApproval,
        allowanceUncertain: allowanceCheckUncertain,
        quoteTs: extendedQuote.quoteTimestamp,
        quoteTtlMs: QUOTE_EXPIRY_MS,
      });

      logLifecycle('checking_allowance', 'previewing', {
        provider: aggregatedQuote.provider,
        quote: aggregatedQuote.amountOutFormatted,
        needsApproval,
        allowanceCheckUncertain,
      });
      setState((s) => ({ ...s, status: 'previewing', quote, quoteErrorParsed: null }));
      setSwapQuote(extendedQuote);
      quoteCapturedWalletRef.current = address ?? null;
      quoteCapturedInputFingerprintRef.current = quoteInputFingerprint;
      quoteCapturedRouteFingerprintRef.current = getQuoteRoutePathFingerprint(extendedQuote);
      quoteCapturedCommissionRequiredRef.current = isCommissionRequiredMode();
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

      if (routeModeProgrammaticSync) {
        const st = useSwapStore.getState();
        if (st.routeMode !== routeModeProgrammaticSync) {
          st.setRouteMode(routeModeProgrammaticSync, { preserveQuoteSnapshot: true });
        }
      }

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

      logRevenueTelemetry('quote_success', {
        chainId: chainId ?? 0,
        fromSymbol,
        toSymbol,
        pairKey: buildRevenuePairKey(chainId ?? 0, fromSymbol, toSymbol),
        provider: aggregatedQuote.provider,
        feeBps: chainId === 56 ? 50 : chainId === 1 ? 20 : undefined,
        notionalBucket: notionalBucketFromAmount(fromAmount),
        source: 'swap_card',
      });

      return extendedQuote;
    } catch (err) {
      if (thisRequestId !== quoteRequestIdRef.current) {
        swapTrace('[Swap] Error ignored - stale request ID:', thisRequestId, 'current:', quoteRequestIdRef.current);
        logProductionEvent('quote_failure', {
          category: 'stale_quote',
          chainId: chainId ?? 0,
          provider: 'quote_aggregator',
          reasonCode: 'stale_request_id',
        });
        return null;
      }

      if (quoteAttempt === 0) {
        logProductionEvent('quote_retry', {
          chainId: chainId ?? 0,
          from: fromSymbol,
          to: toSymbol,
        });
        await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 200)));
        if (thisRequestId !== quoteRequestIdRef.current) return null;
        continue;
      }

      const parsed = parseQuoteError(err);
      const ce = (err as Error & { commissionQuoteAttempt?: CommissionQuoteAttemptMeta }).commissionQuoteAttempt;
      const diagSource = ce?.rawWrapperMessage || parsed.technicalReason || parsed.message || '';
      const wrapperQuoteDiagnostic = classifyWrapperQuoteFailure(diagSource);

      const quoteErrorDisplay =
        parsed.category === 'network_error' || parsed.category === 'rpc_error'
          ? 'Network issue. Please try again.'
          : parsed.message;
      const quoteFailurePayload: ProductionMonitoringPayload = {
        reason: parsed.message,
        category: parsed.category,
        chainId: chainId ?? 0,
        provider: 'quote_aggregator',
        ...(parsed.reasonCode ? { reasonCode: parsed.reasonCode } : {}),
      };
      if (parsed.technicalReason && parsed.technicalReason !== parsed.message) {
        quoteFailurePayload.technicalReason = parsed.technicalReason;
      }
      if (ce) {
        quoteFailurePayload.attemptedProvider = ce.attemptedProvider;
        quoteFailurePayload.fromSymbol = ce.fromSymbol;
        quoteFailurePayload.toSymbol = ce.toSymbol;
        quoteFailurePayload.fromAmount = ce.fromAmount;
        quoteFailurePayload.fromTokenAddress = ce.fromTokenAddress;
        quoteFailurePayload.toTokenAddress = ce.toTokenAddress;
        quoteFailurePayload.wrapperQuoteDiagnostic = wrapperQuoteDiagnostic;
      } else if (parsed.reasonCode === 'unsupported_commission_route') {
        quoteFailurePayload.wrapperQuoteDiagnostic = wrapperQuoteDiagnostic;
      }
      logProductionEvent('quote_failure', quoteFailurePayload);

      if (parsed.reasonCode === 'unsupported_commission_route' && isCommissionRequiredMode()) {
        const fromTok = getTokenBySymbol(fromSymbol, chainId || 1);
        const toTok = getTokenBySymbol(toSymbol, chainId || 1);
        logProductionEvent('unsupported_commission_route', {
          chainId: chainId ?? 0,
          fromSymbol,
          toSymbol,
          fromAmount,
          fromTokenAddress: fromTok?.address ?? null,
          toTokenAddress: toTok?.address ?? null,
          routeMode: String(routeMode),
          provider: ce?.attemptedProvider ?? 'quote_aggregator',
          commissionRequired: true,
          reasonCode: 'unsupported_commission_route',
          fromRouteSupport: getTokenRouteSupport(chainId || 1, fromSymbol),
          toRouteSupport: getTokenRouteSupport(chainId || 1, toSymbol),
          wrapperQuoteDiagnostic,
          ...(parsed.technicalReason ? { technicalReason: parsed.technicalReason } : {}),
        });
      }
      if (parsed.category === 'network_error' || parsed.category === 'rpc_error') {
        logProductionEvent('rpc_failure', {
          reason: parsed.message,
          chainId: chainId ?? 0,
          phase: 'quote',
        });
      }
      console.error('[Swap] Quote error:', err);
      logLifecycle(state.status, 'error', { error: quoteErrorDisplay });
      setSwapQuote(null);
      clearQuote();
      clearQuoteCaptureContext();
      setState((s) => ({ ...s, status: 'error', error: quoteErrorDisplay, quoteErrorParsed: parsed }));
      toast.error(quoteErrorDisplay);
      return null;
    }
    }
    return null;
  // Note: state.status removed from deps to prevent infinite loop - it's only used for logging
  }, [
    address,
    fromAsset,
    toAsset,
    fromAmount,
    chainId,
    slippage,
    routeMode,
    provider,
    setQuote,
    clearQuote,
    clearQuoteCaptureContext,
    quoteInputFingerprint,
  ]);

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
      swapObsLog('approval_skipped', { reason: 'native_input', provider: swapQuote.provider });
      return true;
    }

    try {
      logLifecycle(state.status, 'approving', { token: swapQuote.fromSymbol, provider: swapQuote.provider });
      setState((s) => ({ ...s, status: 'approving' }));
      logRevenueTelemetry('approve_clicked', {
        chainId: chainId ?? 0,
        fromSymbol: swapQuote.fromSymbol,
        toSymbol: swapQuote.toSymbol,
        pairKey: buildRevenuePairKey(chainId ?? 0, swapQuote.fromSymbol, swapQuote.toSymbol),
        provider: swapQuote.provider,
        feeBps: chainId === 56 ? 50 : chainId === 1 ? 20 : undefined,
        source: 'swap_card',
      });
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

      swapTrace('[Swap] Approval mode:', approvalMode, useExact ? `(${exactAmount})` : '(unlimited)');

      // Build approval transaction based on provider + approval mode
      let approvalTx: { to: string; data: string; value: string };

      if (swapQuote.provider === '1inch') {
        // Use 1inch approval API — pass amount string for exact mode
        swapTrace('[Swap] Building 1inch approval...');
        const amountStr = useExact && tokenIn
          ? formatUnits(swapQuote.amountIn, tokenIn.decimals)
          : undefined;
        approvalTx = await buildOneInchApproval(swapQuote.fromSymbol, chainId, amountStr);
      } else if (swapQuote.provider === 'pancakeswap-v3-wrapper-v2') {
        const w = getPancakeWrapperV2SpenderAddress();
        if (!w) {
          throw new Error('Pancake fee wrapper V2 is enabled in the environment but the wrapper address is not configured.');
        }
        if (w.toLowerCase() !== PANCAKE_WRAPPER_V2_EXPECTED_TO.toLowerCase()) {
          throw new Error(
            `Pancake wrapper V2 address mismatch. Expected ${PANCAKE_WRAPPER_V2_EXPECTED_TO} but got ${w}.`,
          );
        }
        swapTrace('[Swap] Building Pancake wrapper V2 approval...');
        const wrapAppr = buildPancakeWrapperV2ApprovalTx(
          swapQuote.fromSymbol,
          w,
          chainId,
          useExact ? exactAmount : undefined,
        );
        approvalTx = {
          to: wrapAppr.to,
          data: wrapAppr.data,
          value: wrapAppr.value,
        };
      } else if (swapQuote.provider === 'pancakeswap-v3-wrapper') {
        const w = getPancakeWrapperSpenderAddress();
        if (!w) {
          throw new Error('Pancake fee wrapper is enabled in the environment but the wrapper address is not configured.');
        }
        swapTrace('[Swap] Building Pancake wrapper approval...');
        const wrapAppr = buildPancakeWrapperApprovalTx(
          swapQuote.fromSymbol,
          w,
          chainId,
          useExact ? exactAmount : undefined,
        );
        approvalTx = {
          to: wrapAppr.to,
          data: wrapAppr.data,
          value: wrapAppr.value,
        };
      } else if (swapQuote.provider === 'pancakeswap-v3') {
        // PancakeSwap router approval (BSC)
        swapTrace('[Swap] Building PancakeSwap approval...');
        const pancakeApproval = buildPancakeApprovalTx(
          swapQuote.fromSymbol,
          useExact ? exactAmount : undefined,
        );
        approvalTx = {
          to: pancakeApproval.to,
          data: pancakeApproval.data,
          value: pancakeApproval.value,
        };
      } else if (swapQuote.provider === 'uniswap-v3-wrapper-v2') {
        const w = getUniswapWrapperV2SpenderAddress();
        if (!w) {
          throw new Error('Uniswap fee wrapper V2 is enabled in the environment but the wrapper address is not configured.');
        }
        swapTrace('[Swap] Building Uniswap wrapper V2 approval...');
        const wrapAppr = buildUniswapWrapperV2ApprovalTx(
          swapQuote.fromSymbol,
          w,
          chainId,
          useExact ? exactAmount : undefined,
        );
        approvalTx = {
          to: wrapAppr.to,
          data: wrapAppr.data,
          value: wrapAppr.value,
        };
      } else if (swapQuote.provider === 'uniswap-v3-wrapper-v3') {
        const w = getUniswapWrapperV3SpenderAddress();
        if (!w) {
          throw new Error('Uniswap fee wrapper V3 is enabled in the environment but the wrapper address is not configured.');
        }
        swapTrace('[Swap] Building Uniswap wrapper V3 approval...');
        const wrapAppr = buildUniswapWrapperV3ApprovalTx(
          swapQuote.fromSymbol,
          w,
          chainId,
          useExact ? exactAmount : undefined,
        );
        approvalTx = {
          to: wrapAppr.to,
          data: wrapAppr.data,
          value: wrapAppr.value,
        };
      } else if (swapQuote.provider === 'uniswap-v3-wrapper') {
        const wrapperAddr = getUniswapWrapperSpenderAddress();
        if (!wrapperAddr) {
          throw new Error('Uniswap fee wrapper is enabled in the environment but the wrapper address is not configured.');
        }
        swapTrace('[Swap] Building Uniswap wrapper approval...');
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
        swapTrace('[Swap] Building Uniswap approval...');
        approvalTx = buildRouterApproval(
          swapQuote.fromSymbol,
          chainId,
          useExact ? exactAmount : undefined,
        );
      }

      swapTrace('[Swap] Sending approval:', { provider: swapQuote.provider, ...approvalTx });

      swapObsLog('approval_tx_submit', {
        provider: swapQuote.provider,
        to: approvalTx.to,
        value: approvalTx.value,
        approvalMode: String(approvalMode),
      });

      if (approvalWalletSigningInFlightRef.current) {
        throw Object.assign(new Error(WALLET_SIGN_REQUEST_PENDING_MESSAGE), {
          code: -32002,
        });
      }
      armApprovalWalletSigningGuard();
      let tx;
      try {
        markSwapExecutionTiming('approval_prompt_requested', {
          provider: swapQuote.provider,
          chainId: chainId ?? 0,
        });
        // Send approval transaction (wallet signs)
        tx = await signer.sendTransaction({
          to: approvalTx.to,
          data: approvalTx.data,
          value: BigInt(approvalTx.value),
        });
      } finally {
        clearApprovalWalletSigningGuard();
      }

      if (!address || !chainId) {
        throw new Error('Wallet disconnected after approval broadcast.');
      }

      const approvalContext = buildApprovalJournalContext({
        swapQuote,
        chainId,
        approvalMode,
        spenderAddress: approvalTx.to,
        exactAmountRaw: useExact ? exactAmount : undefined,
      });

      const flowId = swapFlowIdRef.current ?? createFlowId();
      swapFlowIdRef.current = flowId;

      const journalStore = useTransactionJournalStore.getState();
      const journalResult = journalStore.journalApprovalSubmitted({
        flowId,
        walletAddress: address,
        chainId,
        transactionHash: tx.hash,
        context: approvalContext,
        explorerUrl: getExplorerTxUrl(chainId, tx.hash),
      });

      if (!journalResult.ok) {
        warnJournalWriteFailure(journalResult.reason, tx.hash);
      } else {
        lastApprovalRecordIdRef.current = journalResult.record.id;
        journalStore.markTransactionPending(journalResult.record.id);
      }

      toast.info('Approval sent — waiting for on-chain confirmation…');
      const receipt = await tx.wait();

      if (receipt) {
        applyJournalReceiptUpdate({
          chainId,
          kind: 'approval',
          transactionHash: tx.hash,
          receipt,
        });
      }

      swapTrace('[Swap Lifecycle] Approval confirmed:', tx.hash, '| Provider:', swapQuote.provider);
      swapObsLog('approval_tx_confirmed', { hash: tx.hash, provider: swapQuote.provider });
      toast.success('Token approved!');
      return true;
    } catch (err) {
      const parsed = parseTransactionError(err);

      if (isUserRejection(err)) {
        logProductionEvent('wallet_rejected', {
          phase: 'approval',
          chainId: chainId ?? 0,
          provider: swapQuote.provider,
          reasonCode: 'user_rejected',
        });
        logLifecycle('approving', 'previewing', { reason: 'user_rejected' });
        toast.warning('Approval cancelled');
        setState((s) => ({ ...s, status: 'previewing' }));
      } else if (isWalletSignRequestPending(err)) {
        logProductionEvent('wallet_request_pending', {
          phase: 'approval',
          chainId: chainId ?? 0,
          provider: swapQuote.provider,
          reasonCode: 'wallet_sign_pending',
        });
        logLifecycle('approving', 'previewing', { reason: 'wallet_sign_pending', code: -32002 });
        setState((s) => ({ ...s, status: 'previewing' }));
      } else {
        logProductionEvent('swap_failure', {
          phase: 'approval',
          category: parsed.category,
          chainId: chainId ?? 0,
          provider: swapQuote.provider,
          reasonCode: parsed.category,
        });
        logLifecycle('approving', 'error', { error: parsed.message });
        toast.error(`Approval failed: ${parsed.message}`);
        setState((s) => ({ ...s, status: 'error', error: parsed.message, quoteErrorParsed: null }));
      }

      throw err;
    }
  }, [
    swapQuote,
    chainId,
    approvalMode,
    getSigner,
    state.status,
    address,
    armApprovalWalletSigningGuard,
    clearApprovalWalletSigningGuard,
  ]);

  // Execute the swap
  const executeSwap = useCallback(async (): Promise<string> => {
    if (!swapQuote || !address || !chainId) {
      throw new Error('No quote available. Please enter an amount and wait for a quote before proceeding.');
    }

    markSwapExecutionTiming('preflight_started', {
      provider: swapQuote.provider,
      chainId: chainId ?? 0,
      needsApproval: swapQuote.needsApproval,
    });

    if (swapQuote.allowanceCheckUncertain) {
      logProductionEvent('swap_failure', {
        phase: 'pre_swap',
        category: 'allowance_failed',
        chainId: chainId ?? 0,
        provider: swapQuote.provider,
        reasonCode: 'allowance_check_uncertain',
      });
      const msg =
        'Could not verify token allowance (network). Refresh the quote and try again before swapping.';
      toast.warning(msg);
      throw new Error(msg);
    }

    let broadcastTx: { hash: string } | null = null;

    try {
      const needsApprovalAtStart = swapQuote.needsApproval;
      const inputNativeForSwap = isNativeSwapInput(fromAsset, swapQuote.fromSymbol, chainId);

      // Handle approval if needed
      if (swapQuote.needsApproval) {
        await executeApproval();
        // Update quote to reflect approval
        setSwapQuote((s) => (s ? { ...s, needsApproval: false } : null));
      }

      // Resolve signer before flipping to `swapping` so we do not show "Sign swap in your wallet" while
      // WalletConnect / injected provider is still connecting (common source of perceived hangs).
      const signer = await getSigner();

      swapObsLog('swap_exec_start', {
        chainId: chainId ?? 0,
        provider: swapQuote.provider,
        inputNative: inputNativeForSwap,
        approvalRequired: needsApprovalAtStart,
        allowanceUncertain: !!swapQuote.allowanceCheckUncertain,
        from: swapQuote.fromSymbol,
        to: swapQuote.toSymbol,
      });

      logLifecycle(state.status, 'swapping', {
        from: swapQuote.fromSymbol,
        to: swapQuote.toSymbol,
        amount: swapQuote.amountIn,
        provider: swapQuote.provider,
      });
      setState((s) => ({ ...s, status: 'swapping' }));
      toast.info('Confirm the swap in your wallet…');

      {
        const wv2 = getUniswapWrapperV2Config();
        const tIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tOut = getTokenBySymbol(swapQuote.toSymbol, chainId);
        const nativeLeg =
          (tIn && isNativeToken(tIn.address)) || (tOut && isNativeToken(tOut.address));
        if (swapQuote.provider === 'uniswap-v3-wrapper-v2' && nativeLeg && !wv2.nativeEnabled) {
          throw new Error('ETH swaps are currently in quote-only mode.');
        }
      }

      // PHASE 10 + 11: Build swap transaction based on provider
      let swapTx: { to: string; data: string; value: string; gas?: string; gasLimit?: string };
      let oneInchIntegratorFeeStatus: 'attached' | 'dropped' | 'disabled' | 'unknown' | null = null;

      if (swapQuote.provider === '1inch') {
        // Build 1inch swap transaction
        swapTrace('[Swap] Building 1inch swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const oneInchTx = await buildOneInchSwapTx({
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: tokenIn ? formatUnits(swapQuote.amountIn, tokenIn.decimals) : swapQuote.amountIn,
          fromAddress: address,
          slippage: swapQuote.slippage,
          chainId,
        });
        oneInchIntegratorFeeStatus = oneInchTx.integratorFeeStatus ?? 'unknown';
        swapTx = {
          to: oneInchTx.to,
          data: oneInchTx.data,
          value: oneInchTx.value,
          gasLimit: oneInchTx.gas,
        };
      } else if (swapQuote.provider === 'pancakeswap-v3-wrapper-v2') {
        const w = getPancakeWrapperV2SpenderAddress();
        if (!w) {
          throw new Error('Pancake fee wrapper V2 is enabled in the environment but the wrapper address is not configured.');
        }
        if (w.toLowerCase() !== PANCAKE_WRAPPER_V2_EXPECTED_TO.toLowerCase()) {
          throw new Error(
            `Pancake wrapper V2 address mismatch. Expected ${PANCAKE_WRAPPER_V2_EXPECTED_TO} but got ${w}.`,
          );
        }
        swapTrace('[Swap] Building Pancake wrapper V2 swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tokenOut = getTokenBySymbol(swapQuote.toSymbol, chainId);
        const amountInHuman = tokenIn
          ? formatUnits(swapQuote.amountIn, tokenIn.decimals)
          : swapQuote.from_amount;
        const pancakeWrapperV2FeeTier =
          (swapQuote.aggregatedQuote?.providerDetails?.feeTier as 100 | 500 | 2500 | 10000) || 2500;
        const pwTx = buildPancakeWrapperV2SwapTx(w, {
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: amountInHuman,
          amountOutMin: formatUnits(swapQuote.minAmountOut, tokenOut?.decimals ?? 18),
          recipient: address,
          feeTier: pancakeWrapperV2FeeTier,
        });
        swapTx = {
          to: pwTx.to,
          data: pwTx.data,
          value: pwTx.value,
        };
      } else if (swapQuote.provider === 'pancakeswap-v3-wrapper') {
        const w = getPancakeWrapperSpenderAddress();
        if (!w) {
          throw new Error('Pancake fee wrapper is enabled in the environment but the wrapper address is not configured.');
        }
        swapTrace('[Swap] Building Pancake wrapper swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tokenOut = getTokenBySymbol(swapQuote.toSymbol, chainId);
        const amountInHuman = tokenIn
          ? formatUnits(swapQuote.amountIn, tokenIn.decimals)
          : swapQuote.from_amount;
        const pancakeWrapperFeeTier =
          (swapQuote.aggregatedQuote?.providerDetails?.feeTier as 100 | 500 | 2500 | 10000) || 2500;
        const pwTx = buildPancakeWrapperSwapTx(w, {
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: amountInHuman,
          amountOutMin: formatUnits(swapQuote.minAmountOut, tokenOut?.decimals ?? 18),
          recipient: address,
          feeTier: pancakeWrapperFeeTier,
        });
        swapTx = {
          to: pwTx.to,
          data: pwTx.data,
          value: pwTx.value,
        };
      } else if (swapQuote.provider === 'pancakeswap-v3') {
        // PHASE 11: Build PancakeSwap swap transaction (BSC)
        swapTrace('[Swap] Building PancakeSwap swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tokenOut = getTokenBySymbol(swapQuote.toSymbol, chainId);
        // Get PancakeSwap fee tier from original quote (default: 2500 = medium)
        const pancakeFeeTier = (swapQuote.aggregatedQuote?.providerDetails?.feeTier as 100 | 500 | 2500 | 10000) || 2500;
        const pancakeTx = buildPancakeSwapTx({
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          // `buildPancakeSwapTx` expects human decimal strings; never fall back to wei (would produce invalid calldata).
          amountIn: tokenIn ? formatUnits(swapQuote.amountIn, tokenIn.decimals) : swapQuote.from_amount,
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
      } else if (swapQuote.provider === 'uniswap-v3-wrapper-v2') {
        const w = getUniswapWrapperV2SpenderAddress();
        if (!w) {
          throw new Error('Uniswap fee wrapper V2 is enabled in the environment but the wrapper address is not configured.');
        }
        swapTrace('[Swap] Building Uniswap wrapper V2 swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tokenOut = getTokenBySymbol(swapQuote.toSymbol, chainId);
        const amountInHuman = tokenIn
          ? formatUnits(swapQuote.amountIn, tokenIn.decimals)
          : swapQuote.from_amount;
        // Must match the quoted pool: prefer aggregator metadata, then QuoteResult.feeTier from the quote path.
        const uniswapWrapperV2FeeTier =
          (swapQuote.aggregatedQuote?.providerDetails?.feeTier as FeeTier | undefined) ??
          (swapQuote.feeTier as FeeTier | undefined) ??
          3000;
        const uTx = buildUniswapWrapperV2SwapTx(w, {
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: amountInHuman,
          amountOutMin: formatUnits(swapQuote.minAmountOut, tokenOut?.decimals ?? 18),
          recipient: address,
          feeTier: uniswapWrapperV2FeeTier,
        });
        swapTx = {
          to: uTx.to,
          data: uTx.data,
          value: uTx.value,
        };
      } else if (swapQuote.provider === 'uniswap-v3-wrapper-v3') {
        const w = getUniswapWrapperV3SpenderAddress();
        if (!w) {
          throw new Error('Uniswap fee wrapper V3 is enabled in the environment but the wrapper address is not configured.');
        }
        swapTrace('[Swap] Building Uniswap wrapper V3 swap...');
        const tokenIn = getTokenBySymbol(swapQuote.fromSymbol, chainId);
        const tokenOut = getTokenBySymbol(swapQuote.toSymbol, chainId);
        const amountInHuman = tokenIn
          ? formatUnits(swapQuote.amountIn, tokenIn.decimals)
          : swapQuote.from_amount;
        const oq = swapQuote.aggregatedQuote?.originalQuote as UniswapWrapperV3QuoteResult | undefined;
        if (!oq?.wrapperPath) {
          throw new Error('Missing Uniswap wrapper V3 path on quote — refresh and try again.');
        }
        const pathParams = getUniswapWrapperV3TxParamsFromQuote(oq, swapQuote.fromSymbol, swapQuote.toSymbol);
        const uTx = buildUniswapWrapperV3SwapTx(w, {
          tokenIn: swapQuote.fromSymbol,
          tokenOut: swapQuote.toSymbol,
          amountIn: amountInHuman,
          amountOutMin: formatUnits(swapQuote.minAmountOut, tokenOut?.decimals ?? 18),
          recipient: address,
          chainId: 1,
          ...pathParams,
        });
        swapTx = {
          to: uTx.to,
          data: uTx.data,
          value: uTx.value,
        };
      } else if (swapQuote.provider === 'uniswap-v3-wrapper') {
        const wrapperAddr = getUniswapWrapperSpenderAddress();
        if (!wrapperAddr) {
          throw new Error('Uniswap fee wrapper is enabled in the environment but the wrapper address is not configured.');
        }
        swapTrace('[Swap] Building Uniswap wrapper swap...');
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
        swapTrace('[Swap] Building Uniswap swap...');
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
        swapTrace('[Swap] Direct Uniswap tx preview', {
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

      if (isCommissionRequiredMode()) {
        if (!isCommissionWrapperExecutionProvider(swapQuote.provider)) {
          throw new Error('Commission-required mode: only Swaperex wrapper execution is allowed.');
        }
        const wrapperFeeBpsUi = (() => {
          switch (swapQuote.provider) {
            case 'uniswap-v3-wrapper':
              return getUniswapWrapperFeeBpsForUi();
            case 'uniswap-v3-wrapper-v2':
              return getUniswapWrapperV2FeeBpsForUi();
            case 'uniswap-v3-wrapper-v3':
              return getUniswapWrapperV3FeeBpsForUi();
            case 'pancakeswap-v3-wrapper':
              return getPancakeWrapperFeeBpsForUi();
            case 'pancakeswap-v3-wrapper-v2':
              return getPancakeWrapperV2FeeBpsForUi();
            default:
              return 0;
          }
        })();
        if (wrapperFeeBpsUi <= 0) {
          throw new Error('Commission mode: wrapper fee is zero or unknown — refusing to send.');
        }
        const toL = swapTx.to.toLowerCase();
        if (swapQuote.provider === 'uniswap-v3-wrapper') {
          const e = getUniswapWrapperSpenderAddress();
          if (!e || toL !== e.toLowerCase()) {
            throw new Error('Execution target must match configured Uniswap wrapper (V1).');
          }
        } else if (swapQuote.provider === 'uniswap-v3-wrapper-v2') {
          const e = getUniswapWrapperV2SpenderAddress();
          if (!e || toL !== e.toLowerCase()) {
            throw new Error('Execution target must match configured Uniswap wrapper V2.');
          }
        } else if (swapQuote.provider === 'uniswap-v3-wrapper-v3') {
          const e = getUniswapWrapperV3SpenderAddress();
          if (!e || toL !== e.toLowerCase()) {
            throw new Error('Execution target must match configured Uniswap wrapper V3.');
          }
        } else if (swapQuote.provider === 'pancakeswap-v3-wrapper') {
          const e = getPancakeWrapperSpenderAddress();
          if (!e || toL !== e.toLowerCase()) {
            throw new Error('Execution target must match configured Pancake wrapper (V1).');
          }
        } else if (swapQuote.provider === 'pancakeswap-v3-wrapper-v2') {
          const e = getPancakeWrapperV2SpenderAddress();
          if (!e || toL !== e.toLowerCase()) {
            throw new Error('Execution target must match configured Pancake wrapper V2.');
          }
          if (e.toLowerCase() !== PANCAKE_WRAPPER_V2_EXPECTED_TO.toLowerCase()) {
            throw new Error(
              `Pancake wrapper V2 address mismatch. Expected ${PANCAKE_WRAPPER_V2_EXPECTED_TO} but got ${e}.`,
            );
          }
        }

        const warnFeeDrift = (onChain: number | undefined, envDisplay: number, label: string): void => {
          if (onChain === undefined) return;
          if (Math.abs(onChain - envDisplay) > 1) {
            toast.warning(
              `${label}: on-chain fee (${onChain} bps) differs from env display (${envDisplay} bps). Execution uses the on-chain fee.`,
            );
          }
        };
        if (swapQuote.provider === 'uniswap-v3-wrapper') {
          warnFeeDrift(getUniswapWrapperSessionOnChainFeeBps(), getUniswapWrapperConfig().feeBpsDisplay, 'Uniswap wrapper');
        } else if (swapQuote.provider === 'uniswap-v3-wrapper-v2') {
          warnFeeDrift(
            getUniswapWrapperV2SessionOnChainFeeBps(),
            getUniswapWrapperV2Config().feeBpsDisplay,
            'Uniswap wrapper V2',
          );
        } else if (swapQuote.provider === 'uniswap-v3-wrapper-v3') {
          warnFeeDrift(
            getUniswapWrapperV3SessionOnChainFeeBps(),
            getUniswapWrapperV3Config().feeBpsDisplay,
            'Uniswap wrapper V3',
          );
        } else if (swapQuote.provider === 'pancakeswap-v3-wrapper') {
          warnFeeDrift(getPancakeWrapperSessionOnChainFeeBps(), getPancakeWrapperConfig().feeBpsDisplay, 'Pancake wrapper');
        } else if (swapQuote.provider === 'pancakeswap-v3-wrapper-v2') {
          warnFeeDrift(
            getPancakeWrapperV2SessionOnChainFeeBps(),
            getPancakeWrapperV2Config().feeBpsDisplay,
            'Pancake wrapper V2',
          );
        }
      }

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

      // P4.4-K2: V3 wrapper only — padded gas hint from quote (wallet may still simulate/adjust).
      let v3GasHintApplied = false;
      if (
        resolvedGasLimit === undefined &&
        swapQuote.provider === 'uniswap-v3-wrapper-v3'
      ) {
        const v3Hint = resolveUniswapWrapperV3GasLimitHint(swapQuote.aggregatedQuote);
        if (v3Hint !== undefined) {
          resolvedGasLimit = v3Hint;
          v3GasHintApplied = true;
          swapTrace('[Swap] V3 gas limit hint from quote', { gasLimit: v3Hint.toString() });
        }
      }

      swapTrace('[Swap] Sending swap:', {
        provider: swapQuote.provider,
        to: swapTx.to,
        dataLen: swapTx.data?.length ?? 0,
        value: swapTx.value,
        gasLimit: resolvedGasLimit !== undefined ? String(resolvedGasLimit) : swapTx.gasLimit,
      });

      swapObsLog('swap_tx_submit', {
        chainId: chainId ?? 0,
        provider: swapQuote.provider,
        to: swapTx.to,
        value: swapTx.value,
        dataLen: swapTx.data?.length ?? 0,
        inputNative: inputNativeForSwap,
        nativeLane: inputNativeForSwap ? 'in' : (toAsset && typeof toAsset === 'object' && 'contract_address' in toAsset && isNativeToken(String((toAsset as { contract_address?: string }).contract_address || '')) ? 'out' : 'none'),
        approvalPath: needsApprovalAtStart ? 'ran_or_skipped_native' : 'not_required',
        v3GasHintApplied,
        gasLimit: resolvedGasLimit !== undefined ? String(resolvedGasLimit) : null,
      });

      if (swapWalletSigningInFlightRef.current) {
        throw Object.assign(new Error(WALLET_SIGN_REQUEST_PENDING_MESSAGE), {
          code: -32002,
        });
      }
      armSwapWalletSigningGuard();
      let tx;
      let commissionTraceForSwap:
        | ReturnType<typeof classifyCommissionRoute>
        | null = null;
      try {
        console.debug('swap_tx_target', {
          provider: swapQuote.aggregatedQuote?.provider ?? swapQuote.provider,
          to: swapTx.to,
        });
        commissionTraceForSwap = classifyCommissionRoute({
          provider: swapQuote.provider,
          routeMode: swapQuote.routeMode,
          chainId,
          txTo: swapTx.to,
          tokenInSymbol: swapQuote.fromSymbol,
          tokenOutSymbol: swapQuote.toSymbol,
          fromAsset: fromAsset && typeof fromAsset === 'object' ? (fromAsset as { is_native?: boolean; contract_address?: string }) : null,
          toAsset: toAsset && typeof toAsset === 'object' ? (toAsset as { is_native?: boolean; contract_address?: string }) : null,
        });
        if (swapQuote.provider === '1inch') {
          commissionTraceForSwap.integratorFeeStatus = oneInchIntegratorFeeStatus ?? 'unknown';
        }
        swapTrace('swaperex_commission_trace', commissionTraceForSwap);
        if (import.meta.env.DEV) {
          // Keep this dev-only to avoid noisy production consoles.
          console.table([commissionTraceForSwap]);
        }
        markSwapExecutionTiming('swap_prompt_requested', {
          provider: swapQuote.provider,
          chainId: chainId ?? 0,
          gasLimit: resolvedGasLimit !== undefined ? String(resolvedGasLimit) : null,
          v3GasHintApplied,
        });
        // Send swap transaction (wallet signs)
        tx = await signer.sendTransaction({
          to: swapTx.to,
          data: swapTx.data,
          value: BigInt(swapTx.value),
          ...(resolvedGasLimit !== undefined ? { gasLimit: resolvedGasLimit } : {}),
        });
      } finally {
        clearSwapWalletSigningGuard();
      }

      broadcastTx = tx;

      markSwapExecutionTiming('tx_submitted', {
        provider: swapQuote.provider,
        chainId: chainId ?? 0,
        txHash: tx.hash,
        v3GasHintApplied,
      });

      swapObsLog('swap_tx_broadcast', { hash: tx.hash, chainId: chainId ?? 0, provider: swapQuote.provider });

      // PHASE 9: Generate explorer URL for this transaction
      const explorerUrl = getExplorerTxUrl(chainId, tx.hash);

      logLifecycle('swapping', 'confirming', { txHash: tx.hash, explorerUrl });
      setState((s) => ({ ...s, status: 'confirming', txHash: tx.hash, explorerUrl }));

      const flowId = swapFlowIdRef.current ?? createFlowId();
      swapFlowIdRef.current = flowId;

      const swapContext = buildSwapJournalContext({
        swapQuote,
        chainId,
        fromAsset,
        toAsset,
        fromAmount,
        slippage,
        recipient: address,
        routerAddress: swapTx.to,
        approvalRecordId: lastApprovalRecordIdRef.current ?? undefined,
      });

      const journalStore = useTransactionJournalStore.getState();
      const journalResult = journalStore.journalSwapSubmitted({
        flowId,
        walletAddress: address,
        chainId,
        transactionHash: tx.hash,
        context: swapContext,
        explorerUrl,
      });

      if (!journalResult.ok) {
        warnJournalWriteFailure(journalResult.reason, tx.hash);
      } else {
        journalStore.markTransactionPending(journalResult.record.id);
        if (lastApprovalRecordIdRef.current) {
          journalStore.linkApprovalAndSwap(lastApprovalRecordIdRef.current, journalResult.record.id);
        }
      }

      toast.info('Swap submitted — waiting for on-chain confirmation…');

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        clearPendingSwap();
        applyJournalReceiptUpdate({
          chainId,
          kind: 'swap',
          transactionHash: tx.hash,
          receipt,
        });
        updateRecordStatus(tx.hash, 'success');
        swapObsLog('swap_tx_confirmed', {
          hash: tx.hash,
          chainId: chainId ?? 0,
          status: 1,
          gasUsed: receipt.gasUsed?.toString() ?? '',
          provider: swapQuote.provider,
        });
        logLifecycle('confirming', 'success', {
          txHash: tx.hash,
          explorerUrl,
          gasUsed: receipt.gasUsed?.toString()
        });

        const treasuryRaw = commissionTraceForSwap?.expectedCommissionRecipient ?? null;
        const cid = chainId || 1;
        const tokenOutMeta =
          getTokenBySymbol(swapQuote.toSymbol, cid) ||
          (toAsset &&
          typeof toAsset === 'object' &&
          'contract_address' in toAsset &&
          (toAsset as { contract_address?: string }).contract_address
            ? getTokenByAddress((toAsset as { contract_address: string }).contract_address, cid)
            : undefined);
        const outputAddr = tokenOutMeta ? getSwapAddress(tokenOutMeta, cid) : null;
        const dec = tokenOutMeta?.decimals ?? 18;

        let feeAmountTokenWei: string | undefined;
        let feeTokenSymbol: string | undefined;
        let outputAmountForMonitor = swapQuote.amountOutFormatted;

        const nativeOut = tokenOutMeta ? isNativeToken(tokenOutMeta.address) : false;

        let receiptDecodedForMonitor: DecodedOutputAndFee | null = null;

        let receiptSettlement: SwapReceiptSettlement;
        try {
          const decoded =
            nativeOut && outputAddr && address && receipt.logs
              ? decodeNativeEthOutputAndFeeFromLogs(receipt.logs, address, treasuryRaw, outputAddr)
              : outputAddr && address && receipt.logs
                ? decodeSwapOutputAndFeeFromLogs(receipt.logs, address, treasuryRaw, outputAddr)
                : null;

          if (decoded && decoded.userNetWei > 0n) {
            receiptDecodedForMonitor = decoded;
            const recvHuman = formatBalance(parseFloat(formatUnits(decoded.userNetWei, dec)), 8);
            let feeHuman: string | null = null;
            let feeProvenance: SwapReceiptSettlement['feeProvenance'] = 'none';
            if (decoded.feeToTreasuryWei > 0n) {
              feeHuman = formatBalance(parseFloat(formatUnits(decoded.feeToTreasuryWei, dec)), 8);
              feeProvenance = 'treasury_transfer';
              feeAmountTokenWei = decoded.feeToTreasuryWei.toString();
              feeTokenSymbol = swapQuote.toSymbol;
            } else if (
              isCommissionWrapperExecutionProvider(swapQuote.provider) &&
              commissionTraceForSwap?.commissionKind === 'wrapper' &&
              commissionTraceForSwap.expectedCommissionBps != null
            ) {
              try {
                const feeW = estimateWrapperFeeWeiFromNetOutput(
                  decoded.userNetWei,
                  commissionTraceForSwap.expectedCommissionBps,
                );
                if (feeW > 0n) {
                  feeHuman = formatBalance(parseFloat(formatUnits(feeW, dec)), 8);
                  feeProvenance = 'inferred_from_receipt_net';
                  feeAmountTokenWei = feeW.toString();
                  feeTokenSymbol = swapQuote.toSymbol;
                }
              } catch {
                // non-blocking
              }
            }

            if (
              commissionTraceForSwap?.commissionKind === 'wrapper' &&
              (commissionTraceForSwap.expectedCommissionBps ?? 0) > 0 &&
              treasuryRaw &&
              decoded.feeToTreasuryWei === 0n
            ) {
              logProductionEvent('commission_missing', {
                txHash: tx.hash,
                chainId: cid,
                provider: swapQuote.provider,
                routeMode: String(swapQuote.routeMode ?? 'best'),
                reason: 'no_treasury_transfer_in_output_token',
                expectedFeeTokenSymbol: swapQuote.toSymbol,
                expectedFeeTokenAddress: outputAddr,
                expectedFeeTokenNative: nativeOut,
                commissionRoute: commissionTraceForSwap?.commissionKind,
                ...(commissionTraceForSwap?.wrapperKey != null
                  ? { wrapperRoute: commissionTraceForSwap.wrapperKey }
                  : {}),
                ...(commissionTraceForSwap?.expectedCommissionBps != null
                  ? { protocolFeeBps: commissionTraceForSwap.expectedCommissionBps }
                  : {}),
              });
            }

            outputAmountForMonitor = formatUnits(decoded.userNetWei, dec);
            receiptSettlement = {
              receivedHuman: recvHuman,
              receivedSymbol: swapQuote.toSymbol,
              feeHuman,
              feeSymbol: swapQuote.toSymbol,
              feeProvenance,
              userReceivedSource: 'receipt',
            };
          } else {
            throw new Error('receipt_decode_fallback');
          }
        } catch {
          let feeHuman: string | null = null;
          let feeProvenance: SwapReceiptSettlement['feeProvenance'] = 'none';
          if (
            isCommissionWrapperExecutionProvider(swapQuote.provider) &&
            commissionTraceForSwap?.commissionKind === 'wrapper' &&
            commissionTraceForSwap?.expectedCommissionBps != null
          ) {
            try {
              const netQ = BigInt(swapQuote.amountOut);
              const feeW = estimateWrapperFeeWeiFromNetOutput(
                netQ,
                commissionTraceForSwap.expectedCommissionBps,
              );
              if (feeW > 0n) {
                feeHuman = formatBalance(parseFloat(formatUnits(feeW, dec)), 8);
                feeProvenance = 'inferred_from_quote';
                feeAmountTokenWei = feeW.toString();
                feeTokenSymbol = swapQuote.toSymbol;
              }
            } catch {
              // non-blocking
            }
          }
          receiptSettlement = {
            receivedHuman: formatBalance(parseFloat(swapQuote.to_amount), 8),
            receivedSymbol: swapQuote.toSymbol,
            feeHuman,
            feeSymbol: swapQuote.toSymbol,
            feeProvenance,
            userReceivedSource: 'quote',
          };
        }

        setState((s) => ({
          ...s,
          status: 'success',
          txHash: tx.hash,
          explorerUrl,
          receiptSettlement,
          quoteErrorParsed: null,
        }));
        const v3TelemetryFields: ProductionMonitoringPayload =
          swapQuote.provider === 'uniswap-v3-wrapper-v3'
            ? (() => {
                const oq = swapQuote.aggregatedQuote?.originalQuote as UniswapWrapperV3QuoteResult | undefined;
                if (!oq?.v3FeeTiers?.length) {
                  return { wrapperVersion: 3 };
                }
                const path = oq.wrapperPath;
                const pathFingerprint =
                  typeof path === 'string' && path.length > 22
                    ? `${path.slice(0, 12)}…${path.slice(-8)}`
                    : undefined;
                return {
                  wrapperVersion: 3,
                  hopCount: oq.v3FeeTiers.length,
                  feeTierSummary: oq.v3FeeTiers.join('-'),
                  routePathSummary: oq.route,
                  ...(pathFingerprint ? { pathFingerprint } : {}),
                };
              })()
            : {};

        const swapSuccessMonitoring: ProductionMonitoringPayload = {
          txHash: tx.hash,
          chainId: cid,
          provider: swapQuote.provider,
          routeMode: String(swapQuote.routeMode ?? 'best'),
          fromToken: buildMonitoringTokenWire(swapQuote.fromSymbol, cid, fromAsset),
          toToken: buildMonitoringTokenWire(swapQuote.toSymbol, cid, toAsset),
          fromAmount,
          quotedOutput: swapQuote.amountOutFormatted,
          minimumReceived: swapQuote.minimum_received,
          userReceivedSource: receiptSettlement.userReceivedSource,
          ...(receiptDecodedForMonitor
            ? {
                userNetWei: receiptDecodedForMonitor.userNetWei.toString(),
                feeToTreasuryWei: receiptDecodedForMonitor.feeToTreasuryWei.toString(),
              }
            : {}),
          feeToken: buildMonitoringTokenWire(swapQuote.toSymbol, cid, toAsset),
          ...(commissionTraceForSwap?.expectedCommissionBps != null
            ? { protocolFeeBps: commissionTraceForSwap.expectedCommissionBps }
            : {}),
          ...(receipt.gasUsed != null ? { gasUsed: receipt.gasUsed.toString() } : {}),
          ...(receipt.gasPrice != null ? { effectiveGasPrice: receipt.gasPrice.toString() } : {}),
          receiptStatus: receipt.status ?? null,
          ...(commissionTraceForSwap?.commissionKind
            ? { commissionRoute: commissionTraceForSwap.commissionKind }
            : {}),
          ...(commissionTraceForSwap?.wrapperKey != null
            ? { wrapperRoute: commissionTraceForSwap.wrapperKey }
            : {}),
          nativeOutput: nativeOut,
          ...v3TelemetryFields,
        };
        logProductionEvent('swap_success', swapSuccessMonitoring);
        try {
          recordSuccessfulSwapPair({
            chainId: cid,
            fromSymbol: swapQuote.fromSymbol,
            toSymbol: swapQuote.toSymbol,
            provider: String(swapQuote.provider ?? ''),
            txHash: tx.hash,
            timestamp: Date.now(),
          });
        } catch {
          // non-blocking
        }
        toast.success('Swap confirmed');

        try {
          if (BigInt(swapQuote.amountOut) <= 0n) {
            swapObsLog('swap_post_verify_anomaly', {
              reason: 'quoted_amount_out_zero',
              provider: swapQuote.provider,
              txHash: tx.hash,
            });
            console.error('[Swap] Post-verify: quoted output amount is zero after successful receipt.');
          }
        } catch {
          swapObsLog('swap_post_verify_anomaly', {
            reason: 'amount_out_parse_failed',
            provider: swapQuote.provider,
            txHash: tx.hash,
          });
        }

        // Minimal local-only revenue tracking (confirmed swaps only)
        if (commissionTraceForSwap) {
          addConfirmedSwapEvent({
            timestamp: Date.now(),
            txHash: tx.hash,
            chainId: chainId ?? 0,
            provider: swapQuote.provider,
            routeMode: String(swapQuote.routeMode ?? 'best'),
            txTo: String(commissionTraceForSwap.txTo ?? ''),
            commissionKind:
              commissionTraceForSwap.commissionKind === 'wrapper'
                ? 'wrapper'
                : commissionTraceForSwap.commissionKind === '1inch_integrator_fee'
                  ? '1inch_integrator_fee'
                  : 'none',
            nativeLane: commissionTraceForSwap.nativeLane ?? 'none',
            expectedFeeBps: commissionTraceForSwap.expectedCommissionBps,
            expectedRecipient: commissionTraceForSwap.expectedCommissionRecipient,
            feeTokenSymbol,
            feeAmountTokenWei,
            outputAmountFormatted: outputAmountForMonitor,
          });
        }

        // Journal + history adapter updated via receipt handler above
        trackEvent('swap_completed');

        // Refresh balances once (non-blocking so success modal is not held on RPC)
        const chainNetwork = CHAIN_ID_TO_NETWORK[chainId] || 'ethereum';
        markSwapExecutionTiming('post_submit_refresh_started', {
          provider: swapQuote.provider,
          chainId: chainId ?? 0,
        });
        void fetchBalances(address, [chainNetwork])
          .then(() => {
            markSwapExecutionTiming('post_submit_refresh_finished', {
              provider: swapQuote.provider,
              chainId: chainId ?? 0,
            });
          })
          .catch((e) => {
            markSwapExecutionTiming('post_submit_refresh_finished', {
              provider: swapQuote.provider,
              chainId: chainId ?? 0,
              refreshError: 'failed',
            });
            console.warn('[Swap] Balance refresh after swap failed:', e);
          });

        return tx.hash;
      } else {
        swapObsLog('swap_tx_failed', {
          hash: tx.hash,
          chainId: chainId ?? 0,
          status: receipt?.status ?? -1,
          provider: swapQuote.provider,
        });
        updateRecordStatus(tx.hash, 'failed');
        applyJournalReceiptUpdate({
          chainId,
          kind: 'swap',
          transactionHash: tx.hash,
          receipt: receipt ?? { status: 0, blockNumber: 0 },
        });
        throw new Error('Transaction was not successful. The blockchain rejected the swap. Check your transaction on the explorer for details.');
      }
    } catch (err) {
      // Expected wallet outcomes: info/warn — not console.error (avoids false "critical" in DevTools).
      if (isUserRejection(err)) {
        console.info('[Swap Execution] Transaction rejected in wallet (expected); nothing broadcast.', {
          code: (err as { code?: unknown }).code,
        });
      } else if (isWalletSignRequestPending(err)) {
        console.warn('[Swap Execution] Wallet sign request already pending.', {
          code: (err as { code?: unknown }).code,
        });
      } else {
        logError('Swap Execution', err);
      }

      // Distinguish 1inch /swap build, wallet/RPC, and broadcast without mislabeling
      const parsed = parseSwapExecutionError(err);

      if (isUserRejection(err)) {
        logProductionEvent('wallet_rejected', {
          phase: 'swap',
          chainId: chainId ?? 0,
          provider: swapQuote?.provider ?? 'unknown',
          reasonCode: 'user_rejected',
        });
        logLifecycle(state.status, 'previewing', { reason: 'user_rejected' });
        setState((s) => ({ ...s, status: 'previewing' }));
        toast.warning('Transaction rejected in wallet. No transaction was broadcast.');
        swapTrace('[Swap] User rejected transaction');
      } else if (isWalletSignRequestPending(err)) {
        logProductionEvent('wallet_request_pending', {
          phase: 'swap',
          chainId: chainId ?? 0,
          provider: swapQuote?.provider ?? 'unknown',
          reasonCode: 'wallet_sign_pending',
        });
        logLifecycle(state.status, 'previewing', { reason: 'wallet_sign_pending', code: -32002 });
        setState((s) => ({ ...s, status: 'previewing' }));
        toast.warning(WALLET_SIGN_REQUEST_PENDING_MESSAGE);
        console.warn('[Swap] Wallet sign request already pending (-32002)');
      } else {
        if (broadcastTx) {
          const recordId = getJournalRecordId(chainId ?? 0, 'swap', broadcastTx.hash);
          if (recordId) {
            useTransactionJournalStore.getState().markTransactionUnknown(recordId, {
              category: parsed.category,
              technicalSummary: parsed.message.slice(0, 240),
              occurredAt: new Date().toISOString(),
              stage: 'swap-confirm',
              broadcastKnown: true,
              retryable: parsed.category === 'network_error' || parsed.category === 'rpc_error',
            });
          }
          updateRecordStatus(broadcastTx.hash, 'uncertain');
        }
        logProductionEvent('swap_failure', {
          reason: parsed.message,
          category: parsed.category,
          chainId: chainId ?? 0,
          provider: swapQuote?.provider ?? 'unknown',
        });
        if (parsed.category === 'network_error' || parsed.category === 'rpc_error') {
          logProductionEvent('rpc_failure', {
            reason: parsed.message,
            chainId: chainId ?? 0,
            phase: 'swap_execution',
          });
        }
        logLifecycle(state.status, 'error', {
          error: parsed.message,
          category: parsed.category,
        });
        setState((s) => ({
          ...s,
          status: 'error',
          error: parsed.message,
          quoteErrorParsed: null,
          receiptSettlement: null,
        }));
        toast.error(parsed.message);
        console.error('[Swap] Transaction failed:', parsed);
      }

      throw err;
    }
  }, [
    swapQuote,
    address,
    chainId,
    getSigner,
    executeApproval,
    fetchBalances,
    state.status,
    fromAmount,
    fromAsset,
    toAsset,
    updateRecordStatus,
    addConfirmedSwapEvent,
    slippage,
    trackEvent,
    armSwapWalletSigningGuard,
    clearSwapWalletSigningGuard,
  ]);

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

    swapTrace('[Swap] Starting swap validation...', {
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

    const reuseDecision = isReusableFreshQuote({
      quote: swapQuote,
      status: state.status,
      chainId: chainId || 1,
      address,
      fromSymbol,
      toSymbol,
      fromAmount,
      routeMode,
      quoteInputFingerprint,
      quoteCapturedInputFingerprint: quoteCapturedInputFingerprintRef.current,
      quoteCapturedWallet: quoteCapturedWalletRef.current,
      quoteCapturedRouteFingerprint: quoteCapturedRouteFingerprintRef.current,
      quoteCapturedCommissionRequired: quoteCapturedCommissionRequiredRef.current,
      commissionRequired: isCommissionRequiredMode(),
    });

    swapObsLog('preview_requote_decision', {
      quote_reused_for_preview: reuseDecision.reusable,
      preview_requote_reason: reuseDecision.reason,
      quoteAgeMs: reuseDecision.quoteAgeMs,
      provider: swapQuote?.provider ?? null,
    });
    if (SWAP_TRACE_LOG) {
      console.debug('[Swap] preview requote decision', {
        quote_reused_for_preview: reuseDecision.reusable,
        reason: reuseDecision.reason,
        quoteAgeMs: reuseDecision.quoteAgeMs,
      });
    }

    if (reuseDecision.reusable && swapQuote) {
      swapTrace('[Swap] Reusing fresh quote for preview (skipped redundant fetch)');
      return swapQuote;
    }

    swapTrace('[Swap] Validation passed, fetching quote...', { preview_requote_reason: reuseDecision.reason });

    // Get fresh quote
    const quote = await fetchSwapQuote();
    if (!quote) {
      throw new Error('Quote request failed. The pricing service may be temporarily unavailable. Please try again.');
    }

    // Return the quote for preview - actual execution happens when user confirms
    return quote;
  }, [
    address,
    isWrongChain,
    fromAsset,
    toAsset,
    fromAmount,
    chainId,
    fetchSwapQuote,
    swapQuote,
    state.status,
    routeMode,
    quoteInputFingerprint,
  ]);

  // Confirm and execute after preview
  const confirmSwap = useCallback(async (): Promise<string> => {
    if (!swapQuote) {
      throw new Error('No active swap to confirm. Please get a new quote and try again.');
    }

    const quoteAge = Date.now() - swapQuote.quoteTimestamp;

    const blockConfirmSwap = (reason: ConfirmSwapBlockReason): never => {
      swapObsLog('confirm_swap_blocked', {
        reason,
        status: state.status,
        provider: swapQuote.provider,
        quoteAgeMs: quoteAge,
      });
      clearSwapExecutionTiming();
      toast.warning(CONFIRM_SWAP_IN_PROGRESS_MESSAGE);
      throw new Error(SWAP_EXECUTION_IN_PROGRESS);
    };

    const statusBlock = getConfirmSwapBlockReason(state.status);
    if (statusBlock) {
      blockConfirmSwap(statusBlock);
    }

    if (state.status !== 'previewing') {
      throw new Error('No active swap to confirm. Please get a new quote and try again.');
    }

    // QUOTE EXPIRY CHECK: Block execution if quote is stale (>30 seconds old)
    // Stay in 'previewing' state so user can click "Refresh" instead of seeing error screen
    if (quoteAge > QUOTE_EXPIRY_MS) {
      const expiredSeconds = Math.floor(quoteAge / 1000);
      logLifecycle('previewing', 'previewing', { reason: 'quote_expired', quoteAge: expiredSeconds });
      swapObsLog('quote_expired_block', {
        quoteAgeMs: quoteAge,
        quoteTtlMs: QUOTE_EXPIRY_MS,
        provider: swapQuote.provider,
      });
      toast.warning('Quote expired. Refresh for a current price.');
      throw new Error('QUOTE_EXPIRED');
    }

    swapObsLog('confirm_swap', {
      quoteAgeMs: quoteAge,
      provider: swapQuote.provider,
      chainId: chainId ?? 0,
    });

    beginSwapExecutionTiming({
      quoteAgeMs: quoteAge,
      provider: swapQuote.provider,
      chainId: chainId ?? 0,
    });

    if (swapExecutionLockRef.current) {
      const now = Date.now();
      if (
        shouldClearStaleExecutionLock({
          status: state.status,
          lockHeld: true,
          lockStartedAt: swapExecutionLockStartedAtRef.current,
          now,
          staleThresholdMs: STALE_EXECUTION_LOCK_MS,
        })
      ) {
        const ageMs = staleExecutionLockAgeMs(swapExecutionLockStartedAtRef.current, now) ?? 0;
        swapObsLog('stale_execution_lock_cleared', { ageMs });
        swapExecutionLockRef.current = false;
        swapExecutionLockStartedAtRef.current = null;
      } else {
        blockConfirmSwap('execution_lock_held');
      }
    }

    swapExecutionLockRef.current = true;
    swapExecutionLockStartedAtRef.current = Date.now();
    swapFlowIdRef.current = createFlowId();
    lastApprovalRecordIdRef.current = null;
    try {
      return await executeSwap();
    } finally {
      swapExecutionLockRef.current = false;
      swapExecutionLockStartedAtRef.current = null;
      swapFlowIdRef.current = null;
      lastApprovalRecordIdRef.current = null;
      clearSwapExecutionTiming();
    }
  }, [state.status, swapQuote, executeSwap, chainId]);

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
      quoteErrorParsed: null,
      receiptSettlement: null,
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
          applyJournalReceiptUpdate({
            chainId,
            kind: 'swap',
            transactionHash: pending.txHash,
            receipt,
          });
          updateRecordStatus(pending.txHash, receipt.status === 1 ? 'success' : 'failed');
          swapObsLog('pending_reconciled', {
            hash: pending.txHash,
            chainId,
            status: receipt.status === 1 ? 1 : 0,
          });
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
              return {
                ...s,
                status: 'idle',
                quote: null,
                txHash: null,
                explorerUrl: null,
                error: null,
                quoteErrorParsed: null,
                receiptSettlement: null,
              };
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
            quoteErrorParsed: null,
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
            quoteErrorParsed: null,
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
          applyJournalReceiptUpdate({
            chainId,
            kind: 'swap',
            transactionHash: hash,
            receipt,
          });
          updateRecordStatus(hash, 'success');
          swapObsLog('recovery_tx_confirmed', { hash, chainId, status: 1 });
          toast.success('Swap confirmed on-chain. Balances may take a moment to update.');
          await fetchBalances(address, [chainNetwork]);
          setState((s) => ({
            ...s,
            status: 'idle',
            quote: null,
            txHash: null,
            explorerUrl: null,
            error: null,
            quoteErrorParsed: null,
          }));
          setSwapQuote(null);
          clearQuote();
          return;
        }

        toast.warning('This swap reverted on-chain.');
        applyJournalReceiptUpdate({
          chainId,
          kind: 'swap',
          transactionHash: hash,
          receipt: receipt ?? { status: 0, blockNumber: 0 },
        });
        updateRecordStatus(hash, 'failed');
        swapObsLog('recovery_tx_failed', { hash, chainId, status: 0 });
        setState((s) => ({
          ...s,
          status: 'error',
          error: 'Transaction reverted on-chain. Check the explorer for details.',
          quoteErrorParsed: null,
          txHash: hash,
          explorerUrl: explorerUrlResolved,
        }));
      } catch {
        if (cancelled) return;
        const recordId = getJournalRecordId(chainId, 'swap', hash);
        if (recordId) {
          useTransactionJournalStore.getState().markTransactionUnknown(recordId);
        }
        updateRecordStatus(hash, 'uncertain');
        swapObsLog('recovery_tx_uncertain', { hash, chainId });
        const explorerUrlResolved = getExplorerTxUrl(chainId, hash);
        setState((s) => ({
          ...s,
          status: 'error',
          error:
            'Could not confirm this transaction from this session. Check the explorer — it may still be pending or may have succeeded.',
          quoteErrorParsed: null,
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
      setState((s) => ({ ...s, status: 'idle', quote: null, explorerUrl: null, quoteErrorParsed: null }));
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

    dismissQuoteError,

    // Actions
    swap,              // Initiate swap (gets quote, shows preview)
    confirmSwap,       // Execute after user confirms preview
    cancelPreview,     // Cancel the preview
    fetchSwapQuote,    // Just get quote without executing
    reset,
  };
}

export default useSwap;
