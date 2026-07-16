/**
 * Swap Interface Component
 *
 * Main swap UI with token selection, amount input, and preview flow.
 * ALL signing happens client-side via the connected wallet.
 *
 * Flow: Enter amount → Get quote → Preview → Confirm in wallet → Success
 */

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@/hooks/useWallet';
import { useSwapUrlSync } from '@/hooks/useSwapUrlSync';
import { useSwap } from '@/hooks/useSwap';
import { useTransactionReconciliation } from '@/hooks/useTransactionReconciliation';
import { useTransactionDetailsDialog } from '@/hooks/useTransactionDetailsDialog';
import { RecoveredTransactionCard } from '@/components/swap/RecoveredTransactionCard';
import { DeviceSwapActivityStrip } from '@/components/history/SwapHistory';
import { useSwapStore, type ApprovalMode } from '@/stores/swapStore';
import { toast } from '@/stores/toastStore';
import { useBalances } from '@/hooks/useBalances';
import { useBalanceStore } from '@/stores/balanceStore';
import { useCustomTokenStore, type CustomToken } from '@/stores/customTokenStore';
import { useFavoriteTokensStore } from '@/stores/favoriteTokensStore';
import { usePresetStore, type SwapPreset, type GuardEvaluation } from '@/stores/presetStore';
import { PresetDropdown } from '@/components/presets/PresetDropdown';
import { SavePresetModal } from '@/components/presets/SavePresetModal';
import { GuardWarningPanel } from '@/components/presets/GuardWarningPanel';
import { evaluatePresetGuards } from '@/services/presetGuardService';
import { TokenSafetyBadges } from '@/components/common/TokenSafetyBadges';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import {
  LazyCommissionRouteRecoveryChips,
  LazyCommissionRouteRecoveryPanel,
  LazySwapPreviewModal,
} from './lazySwapUiChunks';
import type { SwapStep } from './swapPreviewTypes';
import { SwapExecutionRail } from './SwapExecutionRail';
import { RouteTransparencyCard } from './RouteTransparencyCard';
import { NetworkFeeEstimateRow } from './NetworkFeeEstimateRow';
import { getNetworkCapability, isSwapEnabledNetwork } from '@/config/networkCapabilities';
import { TermsGateModal } from '@/components/common/TermsGateModal';
import { useTermsStore } from '@/stores/termsStore';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import {
  formatBalance,
  formatGasLimitUnits,
  getChainName,
  getPriceImpactUi,
  parsePriceImpactPercentOrNaN,
  shortenAddress,
  swapAggregatorProviderLabel,
} from '@/utils/format';
import {
  estimateNetworkFeeForDisplay,
  type NetworkFeeEstimateResult,
} from '@/utils/networkFeeEstimate';
import {
  checkNativeGasAffordability,
  formatSafeNativeMaxAmount,
  parseGasUnitsBigInt,
  scaleFeeByGasUnits,
} from '@/utils/safeNativeMax';
import { resolveQuoteReadiness } from '@/utils/quoteReadiness';
import {
  getRouteDisplayName,
  getRouteExplanation,
  getRouteShortName,
  getRouteSupportIdentifier,
} from '@/utils/routePresentation';
import {
  getPopularTokens,
  getWrappedNativeAddress,
  isNativeToken,
  isStaticToken,
  type Token,
} from '@/tokens';
import {
  getMonetizationConfig,
  isMonetizationActiveForProvider,
  getPancakeWrapperFeeBpsForUi,
  getPancakeWrapperV2FeeBpsForUi,
  getUniswapWrapperFeeBpsForUi,
  getUniswapWrapperV2FeeBpsForUi,
  getUniswapWrapperV3FeeBpsForUi,
  isPancakeWrapperFeeBpsUnverified,
  isPancakeWrapperV2FeeBpsUnverified,
  isUniswapWrapperFeeBpsUnverified,
  isUniswapWrapperV2FeeBpsUnverified,
  getPancakeWrapperV2Config,
  getUniswapWrapperV2Config,
  isCommissionRequiredMode,
  isUniswapWrapperV3PathAvailableButDisabled,
} from '@/config';
import {
  formatQuoteRoutePreferenceLabel,
  isQuoteRouteModeDisabled,
  type QuoteRouteMode,
} from '@/services/quoteAggregator';
import { validateToken } from '@/services/tokenValidation';
import {
  assetToV3ProbeAddress,
  isSwapAssetKnownForChain,
  probeV3PairLiquidity,
} from '@/services/tokenSafetyProbe';
import { analyzeSwapFromContext, type SwapIntelligence } from '@/services/dex';
import type { AssetInfo } from '@/types/api';
import { isAddress } from 'ethers';
import { isDebugMode } from '@/utils/chainHealth';
import { getSwapQuoteInputFingerprint } from '@/utils/swapQuoteInputFingerprint';
import { emitSwapLifecycleStage } from '@/utils/swapLifecycleTelemetry';
import {
  compareRouteSupport,
  getRouteSupportLabel,
  getTokenRouteSupport,
  routeSupportBadgeTooltip,
  type RouteSupportStatus,
} from '@/utils/routeSupport';
import { isCommissionPairAuditBlocked } from '@/constants/commissionCoverage';
import { getCommissionRouteIssueCopy } from '@/utils/commissionRouteDisplay';
import {
  getRoutingDisplayStatus,
  getRoutingDisplayBadgeLabel,
  getRoutingDisplayDescription,
  isNativeWrappedPair,
  routingDisplayBadgeClass,
  routeSupportForAsset,
} from '@/utils/routingDisplayStatus';
import type { QuoteFailureReasonCode } from '@/utils/errors';
import { logProductionEvent } from '@/utils/productionMonitoring';
import { logRevenueTelemetry } from '@/utils/revenueTelemetry';
import { isCommissionSwapUnavailableOnChain } from '@/constants/commissionChains';
import { resolveSwapCtaState } from '@/constants/swapCtaStates';
import { mapSwapStatusToLifecycle, getTransactionLifecycleSpec } from '@/constants/transactionLifecycle';
import { CommissionSwapChainBanner } from '@/components/swap/CommissionSwapChainBanner';
import { UnsupportedSwapNetworkExperience } from '@/components/swap/UnsupportedSwapNetworkExperience';
import { FeaturedCommissionRoutes } from '@/components/swap/FeaturedCommissionRoutes';
import { InlineSkeleton } from '@/components/common/InlineSkeleton';

// Chain ID to chain name mapping
const CHAIN_NAMES: Record<number, string> = {
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

function ContextSep() {
  return <span className="shell-context-strip__sep" aria-hidden>·</span>;
}

/** Placeholder while audited route shortcuts chunk loads (deferred off critical quote path). */
const lazyCommissionRoutesFallback = (
  <div
    className="relative z-10 mt-3 rounded-lg border border-emerald-800/25 bg-emerald-950/15 px-3 py-2.5 min-h-[3.5rem] animate-pulse"
    aria-hidden
  />
);

/** P8-I.1a — display-only session line (chain · account · quote freshness). */
function SwapSessionContextStrip({
  chainId,
  isConnected,
  isWrongChain,
  isReadOnly,
  address,
  hasUsableQuote,
  isQuoteFetchUiLoading,
  quoteSecondsRemaining,
  isQuoteExpired,
  quoteStatusLabel,
}: {
  chainId: number;
  isConnected: boolean;
  isWrongChain: boolean;
  isReadOnly: boolean;
  address: string | null | undefined;
  hasUsableQuote: boolean;
  isQuoteFetchUiLoading: boolean;
  quoteSecondsRemaining: number | null;
  isQuoteExpired: boolean;
  /** P18 — readiness-aware status (overrides generic "Quote ready" when set). */
  quoteStatusLabel?: string | null;
}) {
  const chainLabel = getChainName(chainId);
  const quoteExpired =
    isQuoteExpired || (quoteSecondsRemaining !== null && quoteSecondsRemaining <= 0);

  let quoteLabel: string | null = null;
  if (isConnected && !isWrongChain) {
    if (isQuoteFetchUiLoading && !hasUsableQuote) {
      quoteLabel = 'Getting quote…';
    } else if (hasUsableQuote) {
      quoteLabel = quoteExpired
        ? 'Quote expired'
        : quoteStatusLabel?.trim() || 'Quote ready';
    }
  }

  return (
    <p className="shell-context-strip" role="status" aria-live="polite">
      <span className="text-dark-300">{chainLabel}</span>

      {!isConnected ? (
        <>
          <ContextSep />
          <span>Connect wallet</span>
        </>
      ) : isWrongChain ? (
        <>
          <ContextSep />
          <span className="text-amber-300/85">Wrong network</span>
          {address ? (
            <>
              <ContextSep />
              <span className="tabular-nums text-dark-500">{shortenAddress(address)}</span>
            </>
          ) : null}
        </>
      ) : (
        <>
          <ContextSep />
          <span>
            {isReadOnly ? 'Read-only' : 'Connected'}
            {address ? (
              <>
                {' '}
                <span className="tabular-nums text-dark-500">{shortenAddress(address)}</span>
              </>
            ) : null}
          </span>
          {quoteLabel ? (
            <>
              <ContextSep />
              <span className={quoteExpired ? 'text-amber-300/85' : undefined}>{quoteLabel}</span>
            </>
          ) : null}
          {hasUsableQuote && !quoteExpired && quoteSecondsRemaining !== null && quoteSecondsRemaining > 0 ? (
            <>
              <ContextSep />
              <span className="tabular-nums text-dark-500">
                Expires in {quoteSecondsRemaining}s
              </span>
            </>
          ) : null}
        </>
      )}
    </p>
  );
}

/** USD liquidity heuristic for Advanced details — avoids bare "$0" in UI. */
function formatIntelligenceLiquidityUsdLabel(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return 'Not estimated';
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return '< $1,000';
}

function formatIntelligenceAnalysisPriceImpact(impact: SwapIntelligence['priceImpact']): string {
  if (impact.level === 'unknown') return 'Not estimated';
  return `${impact.percentage.toFixed(2)}%`;
}

// Debounce delay for quote fetching (ms)
const QUOTE_DEBOUNCE_MS = 650;

/** Debounce for V3 pool / soft token checks (ms) */
const TOKEN_SAFETY_PROBE_DEBOUNCE_MS = 550;

// Convert Token to AssetInfo for compatibility
function tokenToAsset(token: Token, chainId: number): AssetInfo {
  const chainName = CHAIN_NAMES[chainId] || 'ethereum';
  return {
    symbol: token.symbol,
    name: token.name,
    chain: chainName,
    decimals: token.decimals,
    is_native: isNativeToken(token.address),
    contract_address: token.address,
    logo_url: token.logoURI,
  };
}

/** Display-only: native chain asset vs wrapped native (e.g. ETH vs WETH) for selector clarity */
function nativeWrappedBadgeKind(asset: AssetInfo, chainId: number): 'native' | 'wrapped' | null {
  if (asset.is_native) return 'native';
  const wrappedAddr = getWrappedNativeAddress(chainId);
  if (
    asset.contract_address &&
    wrappedAddr &&
    asset.contract_address.toLowerCase() === wrappedAddr.toLowerCase()
  ) {
    return 'wrapped';
  }
  return null;
}

export function SwapInterface() {
  const { isConnected, address, isWrongChain, chainId, provider, isReadOnly, switchNetwork } =
    useWallet();
  const { getTokenBalance, currentChainUnsupported } = useBalances();
  const chainStatus = useBalanceStore((s) => s.chainStatus);
  const balanceRows = useBalanceStore((s) => s.balances);
  const { getTokens: getCustomTokens, addToken: addCustomToken, removeToken: removeCustomToken } =
    useCustomTokenStore();
  const hasTokenInStore = useCustomTokenStore((s) => s.hasToken);

  // Get available tokens for current chain (static + custom)
  const currentChainId = chainId || 1;
  const commissionSwapUnavailable = isCommissionSwapUnavailableOnChain(currentChainId);
  useSwapUrlSync(!commissionSwapUnavailable);
  const customTokens = getCustomTokens(currentChainId);

  const AVAILABLE_TOKENS = useMemo(() => {
    // Static tokens
    const staticTokens = getPopularTokens(currentChainId).map((t) => tokenToAsset(t, currentChainId));

    // Custom tokens converted to AssetInfo
    const customAssets: AssetInfo[] = customTokens.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      chain: CHAIN_NAMES[currentChainId] || 'ethereum',
      decimals: t.decimals,
      is_native: false,
      contract_address: t.address,
      logo_url: undefined,
      // Custom token marker for UI
      isCustom: true,
      verified: t.verified,
      warning: t.warning,
    } as AssetInfo & { isCustom?: boolean; verified?: boolean; warning?: string }));

    return [...staticTokens, ...customAssets];
  }, [currentChainId, customTokens]);

  const {
    status,
    swapQuote,
    txHash,
    explorerUrl,
    error,
    quoteErrorParsed,
    receiptSettlement,
    isQuoteExpired,
    swap,
    confirmSwap,
    cancelPreview,
    fetchSwapQuote,
    reset,
    dismissQuoteError,
    activeFlowId,
    ensureActiveFlowId,
  } = useSwap();

  const {
    recoveredTrace,
    manualRecheck,
    manualRecheckDisabled,
    isReconciling,
  } = useTransactionReconciliation();

  const { openFromRecoveredTrace, openFromActivityItem, dialog: transactionDetailsDialog } =
    useTransactionDetailsDialog();

  const {
    fromAsset,
    toAsset,
    fromAmount,
    slippage,
    approvalMode,
    setFromAsset,
    setToAsset,
    setFromAmount,
    setSlippage,
    setApprovalMode,
    routeMode,
    setRouteMode,
    swapAssets,
    clearQuote,
  } = useSwapStore();

  const swapUiTrace =
    import.meta.env.DEV ||
    (typeof import.meta.env.VITE_DEBUG_SWAP === 'string' &&
      ['1', 'true', 'yes', 'on'].includes(import.meta.env.VITE_DEBUG_SWAP.trim().toLowerCase()));

  useEffect(() => {
    if (swapUiTrace) console.debug('route_mode_selected', { routeMode });
  }, [routeMode, swapUiTrace]);

  /** Single source of truth: in-flight quote work in useSwap (incl. allowance check after aggregation). */
  const isQuotePipelineLoading = useMemo(
    () => status === 'fetching_quote' || status === 'checking_allowance',
    [status],
  );

  /** True once we have quote output — do not mask it with pipeline loading UI (Phase 2 / allowance tail). */
  const hasUsableQuote = useMemo(
    () => Boolean(swapQuote && (swapQuote.amountOut || swapQuote.amountOutFormatted)),
    [swapQuote],
  );

  const fromRouteSupportForPrecheck: RouteSupportStatus = useMemo(() => {
    if (!fromAsset) return 'unknown';
    const ext = fromAsset as ExtendedAssetInfo;
    return routeSupportForAsset(currentChainId, {
      symbol: fromAsset.symbol,
      contract_address: fromAsset.contract_address,
      isCustom: ext.isCustom,
    });
  }, [currentChainId, fromAsset]);

  const toRouteSupportForPrecheck: RouteSupportStatus = useMemo(() => {
    if (!toAsset) return 'unknown';
    const ext = toAsset as ExtendedAssetInfo;
    return routeSupportForAsset(currentChainId, {
      symbol: toAsset.symbol,
      contract_address: toAsset.contract_address,
      isCustom: ext.isCustom,
    });
  }, [currentChainId, toAsset]);

  /**

   * Pipeline UI loading: spinner / "Getting quote…" / disabled main CTA.
   * During `checking_allowance`, treat as loading even if a prior quote is still on screen — avoids
   * "Preview Swap" while `handlePreviewSwap` requires `previewing` (race when overlapping requests).
   */
  const isQuoteFetchUiLoading = useMemo(
    () =>
      isQuotePipelineLoading &&
      (!hasUsableQuote || status === 'checking_allowance'),
    [isQuotePipelineLoading, hasUsableQuote, status],
  );

  /** P2.1 — single routing truth for swap card (display-only). */
  const routingDisplay = useMemo(
    () =>
      getRoutingDisplayStatus({
        chainId: currentChainId,
        fromAsset: fromAsset
          ? {
              symbol: fromAsset.symbol,
              contract_address: fromAsset.contract_address,
              isCustom: (fromAsset as ExtendedAssetInfo).isCustom,
              is_native: fromAsset.is_native,
            }
          : null,
        toAsset: toAsset
          ? {
              symbol: toAsset.symbol,
              contract_address: toAsset.contract_address,
              isCustom: (toAsset as ExtendedAssetInfo).isCustom,
              is_native: toAsset.is_native,
            }
          : null,
        fromRouteSupport: fromRouteSupportForPrecheck,
        toRouteSupport: toRouteSupportForPrecheck,
        hasUsableQuote,
        quoteSuccess: Boolean(swapQuote?.success),
        quoteErrorReasonCode: quoteErrorParsed?.reasonCode as QuoteFailureReasonCode | null | undefined,
        isQuoteFetchUiLoading,
      }),
    [
      currentChainId,
      fromAsset,
      toAsset,
      fromRouteSupportForPrecheck,
      toRouteSupportForPrecheck,
      hasUsableQuote,
      swapQuote?.success,
      quoteErrorParsed?.reasonCode,
      isQuoteFetchUiLoading,
    ],
  );

  const lastRoutePrecheckTelemetryKeyRef = useRef<string>('');
  useEffect(() => {
    if (!routingDisplay.showPrecheckRow) {
      lastRoutePrecheckTelemetryKeyRef.current = '';
      return;
    }
    if (!fromAsset || !toAsset) return;
    const pre = routingDisplay.status;
    if (pre === 'heuristic_likely' || pre === 'heuristic_checking' || pre === 'loading_quote') return;

    const key = `${currentChainId}|${fromAsset.symbol}|${toAsset.symbol}|${pre}`;
    const tid = window.setTimeout(() => {
      if (lastRoutePrecheckTelemetryKeyRef.current === key) return;
      lastRoutePrecheckTelemetryKeyRef.current = key;
      logProductionEvent('route_precheck_visible', {
        chainId: currentChainId,
        fromSymbol: fromAsset.symbol,
        toSymbol: toAsset.symbol,
        status: pre,
        fromRouteSupport: fromRouteSupportForPrecheck,
        toRouteSupport: toRouteSupportForPrecheck,
        commissionRequired: isCommissionRequiredMode(),
      });
    }, 550);
    return () => clearTimeout(tid);
  }, [
    routingDisplay.showPrecheckRow,
    routingDisplay.status,
    fromAsset,
    toAsset,
    currentChainId,
    fromRouteSupportForPrecheck,
    toRouteSupportForPrecheck,
  ]);

  /** Commission mainnet + ETH native leg + V2 configured + quotes on, execution off (Phase 2). */
  const isEthNativeV2QuoteOnlyNoExec = useMemo(() => {
    if (!isCommissionRequiredMode() || currentChainId !== 1) return false;
    if (!fromAsset?.is_native && !toAsset?.is_native) return false;
    const u2 = getUniswapWrapperV2Config();
    return (
      u2.enabled &&
      !!u2.wrapperAddress &&
      u2.nativeQuoteEnabled &&
      !u2.nativeEnabled
    );
  }, [currentChainId, fromAsset?.is_native, toAsset?.is_native]);

  /** Canary hint: multi-hop V3 path exists for this pair but V3 routing is off in env (no execution claim). */
  const showUniswapWrapperV3CanaryHint = useMemo(() => {
    if (!fromAsset?.symbol || !toAsset?.symbol) return false;
    if (!isCommissionRequiredMode() || currentChainId !== 1) return false;
    if (fromAsset.is_native || toAsset.is_native) return false;
    return isUniswapWrapperV3PathAvailableButDisabled(currentChainId, fromAsset.symbol, toAsset.symbol);
  }, [currentChainId, fromAsset?.symbol, fromAsset?.is_native, toAsset?.symbol, toAsset?.is_native]);

  const statusRef = useRef(status);
  statusRef.current = status;

  const lastQuoteReceivedKeyRef = useRef<string>('');

  const quoteInputFingerprint = useMemo(
    () =>
      getSwapQuoteInputFingerprint({
        chainId: currentChainId,
        slippage,
        fromAmount,
        fromAsset,
        toAsset,
        routeMode,
      }),
    [currentChainId, slippage, fromAmount, fromAsset, toAsset, routeMode],
  );

  const prevQuoteInputFingerprintUiRef = useRef<string | null>(null);

  /** Close preview modal when quote inputs change (useSwap clears quote + previewing in parallel). */
  useEffect(() => {
    const prev = prevQuoteInputFingerprintUiRef.current;
    prevQuoteInputFingerprintUiRef.current = quoteInputFingerprint;
    if (prev === null) return;
    if (prev === quoteInputFingerprint) return;
    setShowPreview(false);
  }, [quoteInputFingerprint]);

  /** P3.3 — quote_received when a new quote lands for the active flow. */
  useEffect(() => {
    if (!activeFlowId || !swapQuote?.quoteTimestamp) return;
    const key = `${activeFlowId}:${swapQuote.quoteTimestamp}`;
    if (lastQuoteReceivedKeyRef.current === key) return;
    lastQuoteReceivedKeyRef.current = key;
    emitSwapLifecycleStage({
      swapFlowId: activeFlowId,
      stage: 'quote_received',
      chainId: currentChainId,
      provider: swapQuote.provider ?? null,
      routeMode: String(routeMode),
      quoteFingerprint: quoteInputFingerprint,
    });
  }, [
    activeFlowId,
    swapQuote?.quoteTimestamp,
    swapQuote?.provider,
    currentChainId,
    routeMode,
    quoteInputFingerprint,
  ]);

  /** P3.3 — terminal lifecycle from swap status (tx_mined / receipt / reconciliation / failure). */
  const successLifecycleDoneForFlowRef = useRef<string | null>(null);
  const failureLifecycleDoneForFlowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeFlowId) return;

    if (status === 'success') {
      if (successLifecycleDoneForFlowRef.current === activeFlowId) return;
      successLifecycleDoneForFlowRef.current = activeFlowId;
      emitSwapLifecycleStage({
        swapFlowId: activeFlowId,
        stage: 'tx_mined',
        chainId: currentChainId,
        provider: swapQuote?.provider ?? null,
        routeMode: String(routeMode),
        quoteFingerprint: quoteInputFingerprint,
        txHash: txHash ?? null,
      });
      if (receiptSettlement?.feeProvenance === 'treasury_transfer') {
        emitSwapLifecycleStage({
          swapFlowId: activeFlowId,
          stage: 'receipt_decoded',
          chainId: currentChainId,
          provider: swapQuote?.provider ?? null,
          routeMode: String(routeMode),
          quoteFingerprint: quoteInputFingerprint,
          txHash: txHash ?? null,
        });
        emitSwapLifecycleStage({
          swapFlowId: activeFlowId,
          stage: 'reconciliation_completed',
          chainId: currentChainId,
          provider: swapQuote?.provider ?? null,
          routeMode: String(routeMode),
          quoteFingerprint: quoteInputFingerprint,
          txHash: txHash ?? null,
        });
      }
      return;
    }

    successLifecycleDoneForFlowRef.current = null;

    if (status === 'error') {
      if (failureLifecycleDoneForFlowRef.current === activeFlowId) return;
      failureLifecycleDoneForFlowRef.current = activeFlowId;
      emitSwapLifecycleStage({
        swapFlowId: activeFlowId,
        stage: 'swap_failed',
        chainId: currentChainId,
        provider: swapQuote?.provider ?? null,
        routeMode: String(routeMode),
        quoteFingerprint: quoteInputFingerprint,
        txHash: txHash ?? null,
        reason: error ?? null,
      });
    } else {
      failureLifecycleDoneForFlowRef.current = null;
    }
  }, [
    status,
    activeFlowId,
    currentChainId,
    swapQuote?.provider,
    routeMode,
    quoteInputFingerprint,
    txHash,
    receiptSettlement?.feeProvenance,
    error,
  ]);

  /** Power-user controls (settings, quick pairs, presets) — hidden until opened. */
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  /** Terms / Privacy gate — opens before preview when user has not accepted yet. */
  const termsAccepted = useTermsStore((s) => s.accepted);
  const [showTermsGate, setShowTermsGate] = useState(false);
  const [showAdvancedQuoteDetails, setShowAdvancedQuoteDetails] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1',
  );
  const [isRefreshingQuote, setIsRefreshingQuote] = useState(false);
  const [showFromSelector, setShowFromSelector] = useState(false);
  const [showToSelector, setShowToSelector] = useState(false);
  const [customSlippage, setCustomSlippage] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [skipConfirmationActive, setSkipConfirmationActive] = useState(false);
  const [swapIntelligence, setSwapIntelligence] = useState<SwapIntelligence | null>(null);

  // Active preset for guard evaluation
  const [activePreset, setActivePreset] = useState<SwapPreset | null>(null);
  const [guardEvaluation, setGuardEvaluation] = useState<GuardEvaluation | null>(null);
  const [guardsDismissed, setGuardsDismissed] = useState(false);

  // Preset store
  const { markPresetUsed } = usePresetStore();

  // Quote expiry countdown (30 second TTL)
  const QUOTE_EXPIRY_SECONDS = 30;
  const [quoteSecondsRemaining, setQuoteSecondsRemaining] = useState<number | null>(null);

  // Delayed spinner state - don't show spinner immediately (Uniswap-style UX)
  const [showSpinner, setShowSpinner] = useState(false);

  // Ref for debounced quote fetching
  const quoteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref for delayed spinner
  const spinnerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tokenSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenSafetyGenRef = useRef(0);

  /** Soft signals only — never blocks the swap button. */
  const [tokenSafety, setTokenSafety] = useState<{
    unknownFrom: boolean;
    unknownTo: boolean;
    noV3Pool: boolean;
    lowLiquidity: boolean;
  } | null>(null);

  // Track previous chain to detect changes
  const [prevChainId, setPrevChainId] = useState(currentChainId);

  // Initialize with default assets or reset when chain changes
  useEffect(() => {
    const chainChanged = prevChainId !== currentChainId;

    if (chainChanged) {
      // Chain changed - reset to chain's native token
      setPrevChainId(currentChainId);
      if (AVAILABLE_TOKENS.length > 0) {
        setFromAsset(AVAILABLE_TOKENS[0]); // Native token (ETH/BNB/MATIC)
      }
      if (AVAILABLE_TOKENS.length > 2) {
        setToAsset(AVAILABLE_TOKENS[2]); // Usually USDT
      } else if (AVAILABLE_TOKENS.length > 1) {
        setToAsset(AVAILABLE_TOKENS[1]);
      }
      // Clear any existing quote/amount
      setFromAmount('');
      reset();
    } else if (!fromAsset && AVAILABLE_TOKENS.length > 0) {
      // Initial setup
      setFromAsset(AVAILABLE_TOKENS[0]);
    }

    if (!chainChanged && !toAsset && AVAILABLE_TOKENS.length > 1) {
      setToAsset(AVAILABLE_TOKENS[2] || AVAILABLE_TOKENS[1]);
    }
  }, [currentChainId, prevChainId, fromAsset, toAsset, setFromAsset, setToAsset, setFromAmount, reset, AVAILABLE_TOKENS]);

  // Fixed-route modes are chain-specific; reset to Best price if the network cannot run the selection
  useEffect(() => {
    if (isQuoteRouteModeDisabled(routeMode, currentChainId)) {
      setRouteMode('best');
      toast.info('Route preference set to Best price — not available on this network.');
    }
  }, [currentChainId, routeMode, setRouteMode]);

  // Clear stale swap error when route or token selection changes (do not depend on `status` — avoids clearing on first error)
  useEffect(() => {
    if (statusRef.current === 'error') {
      reset();
    }
  }, [
    routeMode,
    fromAsset?.symbol,
    fromAsset?.contract_address,
    toAsset?.symbol,
    toAsset?.contract_address,
    reset,
  ]);

  // Soft token list + V3 pool hints (debounced; informational only)
  useEffect(() => {
    if (!fromAsset || !toAsset) {
      setTokenSafety(null);
      return;
    }

    if (tokenSafetyTimerRef.current) clearTimeout(tokenSafetyTimerRef.current);

    tokenSafetyTimerRef.current = setTimeout(() => {
      const gen = ++tokenSafetyGenRef.current;
      const unknownFrom = !isSwapAssetKnownForChain(fromAsset, currentChainId, hasTokenInStore);
      const unknownTo = !isSwapAssetKnownForChain(toAsset, currentChainId, hasTokenInStore);
      const addrA = assetToV3ProbeAddress(fromAsset, currentChainId);
      const addrB = assetToV3ProbeAddress(toAsset, currentChainId);

      if (!addrA || !addrB || addrA.toLowerCase() === addrB.toLowerCase()) {
        if (tokenSafetyGenRef.current === gen) {
          setTokenSafety({
            unknownFrom,
            unknownTo,
            noV3Pool: false,
            lowLiquidity: false,
          });
        }
        return;
      }

      void (async () => {
        const r = await probeV3PairLiquidity(currentChainId, addrA, addrB);
        if (tokenSafetyGenRef.current !== gen) return;
        setTokenSafety({
          unknownFrom,
          unknownTo,
          noV3Pool: !r.hasPool,
          lowLiquidity: r.lowLiquidity,
        });
      })();
    }, TOKEN_SAFETY_PROBE_DEBOUNCE_MS);

    return () => {
      if (tokenSafetyTimerRef.current) clearTimeout(tokenSafetyTimerRef.current);
    };
  }, [
    fromAsset,
    toAsset,
    currentChainId,
    fromAsset?.symbol,
    fromAsset?.contract_address,
    toAsset?.symbol,
    toAsset?.contract_address,
    hasTokenInStore,
  ]);

  // Delayed spinner - wait 250ms before showing spinner (Uniswap-style UX)
  // If quote resolves fast, spinner never appears = feels instant
  const SPINNER_DELAY_MS = 250;
  useEffect(() => {
    const isFetching = isQuoteFetchUiLoading;

    if (isFetching) {
      // Start delay timer - only show spinner after 250ms
      spinnerTimeoutRef.current = setTimeout(() => {
        setShowSpinner(true);
      }, SPINNER_DELAY_MS);
    } else {
      // Clear timer and hide spinner immediately when done
      if (spinnerTimeoutRef.current) {
        clearTimeout(spinnerTimeoutRef.current);
        spinnerTimeoutRef.current = null;
      }
      setShowSpinner(false);
    }

    return () => {
      if (spinnerTimeoutRef.current) {
        clearTimeout(spinnerTimeoutRef.current);
      }
    };
  }, [isQuoteFetchUiLoading]);

  // Quote expiry countdown - updates every second when quote is active
  useEffect(() => {
    // Only run countdown when we have a quote with timestamp (keep during fetch so TTL UX stays stable)
    if (
      !swapQuote?.quoteTimestamp ||
      (status !== 'previewing' && status !== 'fetching_quote' && status !== 'checking_allowance')
    ) {
      setQuoteSecondsRemaining(null);
      return;
    }

    // Calculate initial remaining time
    const calculateRemaining = () => {
      const elapsed = Math.floor((Date.now() - swapQuote.quoteTimestamp) / 1000);
      return Math.max(0, QUOTE_EXPIRY_SECONDS - elapsed);
    };

    setQuoteSecondsRemaining(calculateRemaining());

    // Update every second
    const intervalId = setInterval(() => {
      const remaining = calculateRemaining();
      setQuoteSecondsRemaining(remaining);

      // Stop counting at 0
      if (remaining <= 0) {
        clearInterval(intervalId);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [swapQuote?.quoteTimestamp, status]);

  // Compute swap intelligence when quote is available
  useEffect(() => {
    // Clear intelligence if no quote
    if (!swapQuote || !fromAsset || !toAsset) {
      setSwapIntelligence(null);
      return;
    }

    // Only compute when previewing
    if (status !== 'previewing') {
      return;
    }

    // Compute intelligence
    const computeIntelligence = async () => {
      try {
        const intelligence = await analyzeSwapFromContext(
          fromAsset,
          toAsset,
          fromAmount,
          swapQuote.amountOutFormatted,
          parsePriceImpactPercentOrNaN(swapQuote.price_impact),
          currentChainId,
          slippage,
          swapAggregatorProviderLabel(swapQuote.provider)
        );
        setSwapIntelligence(intelligence);
      } catch (err) {
        if (swapUiTrace) console.warn('[Intelligence] Failed to analyze swap:', err);
        // Don't block the swap if intelligence fails
      }
    };

    computeIntelligence();
  }, [swapQuote, fromAsset, toAsset, fromAmount, status, currentChainId, slippage]);

  // Get balance for selected asset (sentinels: '…' loading, 'unavailable' unknown/failed fetch, '—' N/A)
  const getBalance = useCallback(
    (asset: AssetInfo | null): string => {
      if (!asset || !address) return '—';
      if (currentChainUnsupported) return '—';
      const ck = asset.chain;
      const st = chainStatus[ck];
      if (st === 'loading' || (st === 'idle' && !balanceRows[ck])) {
        return '…';
      }
      if (st === 'error') return 'unavailable';
      const tokenBalance = getTokenBalance(ck, asset.symbol);
      if (tokenBalance === null) {
        return 'unavailable';
      }
      return tokenBalance.balance;
    },
    [getTokenBalance, address, currentChainUnsupported, chainStatus, balanceRows],
  );

  // Check for insufficient balance
  const fromBalance = getBalance(fromAsset);
  const fromBalanceNum =
    fromBalance === '…' || fromBalance === 'unavailable' || fromBalance === '—'
      ? NaN
      : parseFloat(fromBalance);
  const insufficientBalance =
    fromAmount &&
    parseFloat(fromAmount) > 0 &&
    Number.isFinite(fromBalanceNum) &&
    parseFloat(fromAmount) > fromBalanceNum;
  /** Hide main-card insufficient warning while the preview modal is open — balances can update mid-flow and confuse users. */
  const insufficientBalanceForUi =
    insufficientBalance &&
    !showPreview &&
    !isEthNativeV2QuoteOnlyNoExec;

  // P18 — native balance + network fee estimate for safe MAX / affordability
  const nativeSymbol = getNetworkCapability(currentChainId)?.nativeToken ?? 'ETH';
  const nativeBalanceRaw = useMemo(() => {
    if (!address) return '—';
    if (currentChainUnsupported) return '—';
    const ck = fromAsset?.chain ?? (CHAIN_NAMES[currentChainId] || 'ethereum');
    const st = chainStatus[ck];
    if (st === 'loading' || (st === 'idle' && !balanceRows[ck])) return '…';
    if (st === 'error') return 'unavailable';
    const tokenBalance = getTokenBalance(ck, nativeSymbol);
    if (tokenBalance === null) return 'unavailable';
    return tokenBalance.balance;
  }, [
    address,
    currentChainUnsupported,
    fromAsset?.chain,
    currentChainId,
    chainStatus,
    balanceRows,
    getTokenBalance,
    nativeSymbol,
  ]);
  const nativeBalanceNum =
    nativeBalanceRaw === '…' || nativeBalanceRaw === 'unavailable' || nativeBalanceRaw === '—'
      ? NaN
      : parseFloat(nativeBalanceRaw);

  const [networkFeeEstimate, setNetworkFeeEstimate] = useState<NetworkFeeEstimateResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!swapQuote?.gasEstimate || !isConnected) {
      setNetworkFeeEstimate(null);
      return;
    }
    void estimateNetworkFeeForDisplay({
      chainId: currentChainId,
      gasEstimate: swapQuote.gasEstimate,
      provider,
      walletConnected: isConnected,
    }).then((r) => {
      if (!cancelled) setNetworkFeeEstimate(r);
    });
    return () => {
      cancelled = true;
    };
  }, [swapQuote?.gasEstimate, currentChainId, provider, isConnected, swapQuote?.provider]);

  const gasAffordability = useMemo(() => {
    if (!isConnected || !Number.isFinite(nativeBalanceNum)) {
      return null;
    }
    const nativeInput = fromAsset?.is_native
      ? parseFloat(fromAmount || '0') || 0
      : 0;
    const swapFee = networkFeeEstimate?.feeNativeApprox ?? null;
    const approvalFee = swapQuote?.needsApproval
      ? scaleFeeByGasUnits(swapFee, parseGasUnitsBigInt(swapQuote.gasEstimate))
      : null;
    return checkNativeGasAffordability({
      chainId: currentChainId,
      nativeBalance: nativeBalanceNum,
      nativeInputAmount: nativeInput,
      estimatedSwapFeeNative: swapFee,
      gasPriceAvailable: Boolean(networkFeeEstimate?.isLiveEstimate),
      needsApproval: Boolean(swapQuote?.needsApproval),
      estimatedApprovalFeeNative: approvalFee,
    });
  }, [
    isConnected,
    nativeBalanceNum,
    fromAsset?.is_native,
    fromAmount,
    networkFeeEstimate,
    swapQuote?.needsApproval,
    swapQuote?.gasEstimate,
    currentChainId,
  ]);

  const insufficientGas =
    Boolean(gasAffordability && !gasAffordability.sufficient) &&
    Boolean(fromAmount && parseFloat(fromAmount) > 0) &&
    !insufficientBalance;

  const quoteReadiness = useMemo(
    () =>
      resolveQuoteReadiness({
        hasQuote: Boolean(hasUsableQuote && swapQuote),
        isQuoteLoading: isQuoteFetchUiLoading,
        isQuoteExpired,
        routeUnavailable: Boolean(
          quoteErrorParsed?.reasonCode === 'unsupported_commission_route',
        ),
        gasPriceAvailable: Boolean(networkFeeEstimate?.isLiveEstimate),
        feeEstimateSettled: Boolean(networkFeeEstimate?.settled) || (!isConnected && Boolean(swapQuote)),
        insufficientGas,
        needsApproval: Boolean(swapQuote?.needsApproval),
        previewConfirmed: showPreview,
      }),
    [
      hasUsableQuote,
      swapQuote,
      isQuoteFetchUiLoading,
      isQuoteExpired,
      quoteErrorParsed?.reasonCode,
      networkFeeEstimate,
      isConnected,
      insufficientGas,
      showPreview,
    ],
  );

  // Calculate MAX amount (subtract gas reserve for native tokens — P18 safe MAX)
  const getMaxAmount = useCallback((): string => {
    if (fromBalance === '…' || fromBalance === '—' || fromBalance === 'unavailable') return '0';
    const balance = parseFloat(fromBalance);
    if (!Number.isFinite(balance) || balance <= 0) return '0';

    if (fromAsset?.is_native) {
      return formatSafeNativeMaxAmount({
        walletNativeBalance: balance,
        estimatedNetworkFeeNative: networkFeeEstimate?.feeNativeApprox ?? null,
        chainId: currentChainId,
        gasPriceAvailable: Boolean(networkFeeEstimate?.isLiveEstimate),
      });
    }

    return fromBalance;
  }, [fromBalance, fromAsset, currentChainId, networkFeeEstimate]);

  // Debounced quote fetching when amount changes
  // RULE 2: ZERO INPUT = ZERO EVERYTHING
  // RULE 3: Quote lifecycle must be finite
  useEffect(() => {
    // Clear previous timeout immediately
    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current);
      quoteTimeoutRef.current = null;
    }

    // RULE 2: If amount is empty or zero, clear everything and return to idle
    const amount = parseFloat(fromAmount || '0');
    if (!fromAmount || isNaN(amount) || amount <= 0) {
      // Only clear if we're not in a swap flow
      if (status === 'idle' || status === 'fetching_quote' || status === 'checking_allowance') {
        clearQuote();
      }
      return;
    }

    // Don't fetch quotes on networks without commission swap support (P15)
    if (commissionSwapUnavailable) {
      if (status === 'idle' || status === 'fetching_quote' || status === 'checking_allowance') {
        clearQuote();
      }
      return;
    }

    // Don't fetch if other conditions not met
    if (!isConnected || !fromAsset || !toAsset) {
      return;
    }

    // Don't auto-refresh if user is already previewing/swapping - let them see the price
    if (status === 'previewing' || status === 'approving' || status === 'swapping' || status === 'confirming' || status === 'success') {
      return;
    }

    // Debounce quote fetching
    quoteTimeoutRef.current = setTimeout(() => {
      // `routeMode` is in deps so auto-forcing the wrapper route mid-request (commission / native Phase 2)
      // can reschedule this timer while a quote is already resolving. `status` is intentionally omitted
      // from deps, so re-read the latest status here — otherwise an orphaned callback can clear a good
      // quote and leave the UI stuck on "Getting quote..." (spinner + fetching_quote).
      if (
        statusRef.current === 'previewing' ||
        statusRef.current === 'approving' ||
        statusRef.current === 'swapping' ||
        statusRef.current === 'confirming' ||
        statusRef.current === 'success'
      ) {
        return;
      }
      if (swapUiTrace) {
        console.log('[Swap] Fetching quote for:', fromAmount, fromAsset.symbol, '→', toAsset.symbol);
      }
      const fp = getSwapQuoteInputFingerprint({
        chainId: currentChainId,
        slippage,
        fromAmount,
        fromAsset,
        toAsset,
        routeMode,
      });
      const fid = ensureActiveFlowId(fp);
      emitSwapLifecycleStage({
        swapFlowId: fid,
        stage: 'quote_requested',
        chainId: currentChainId,
        routeMode: String(routeMode),
        quoteFingerprint: fp,
      });
      fetchSwapQuote().catch((err) => {
        if (swapUiTrace) console.warn('[Swap] Quote fetch failed:', err.message);
      });
    }, QUOTE_DEBOUNCE_MS);

    // Cleanup: cancel pending quote on unmount or input change
    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current);
        quoteTimeoutRef.current = null;
      }
    };
  // Note: status removed from deps to prevent infinite loop - we check it inside the effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAmount, fromAsset, toAsset, isConnected, fetchSwapQuote, clearQuote, routeMode, swapUiTrace, commissionSwapUnavailable]);

  // Token selection handlers
  const handleFromTokenSelect = useCallback((asset: AssetInfo) => {
    if (asset.symbol === toAsset?.symbol) {
      swapAssets();
    } else {
      setFromAsset(asset);
    }
    // Drop in-memory quote immediately so a prior ERC20 `needsApproval` cannot leak across token changes
    reset();
    setShowFromSelector(false);
  }, [toAsset, setFromAsset, swapAssets, reset]);

  const handleToTokenSelect = useCallback((asset: AssetInfo) => {
    if (asset.symbol === fromAsset?.symbol) {
      swapAssets();
    } else {
      setToAsset(asset);
    }
    reset();
    setShowToSelector(false);
  }, [fromAsset, setToAsset, swapAssets, reset]);

  // Handle custom slippage input
  const handleCustomSlippage = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 50) {
      setSlippage(numValue);
    }
    setCustomSlippage(value);
  };

  // Skip confirmation - auto-execute when preset with skipConfirmation is loaded
  useEffect(() => {
    if (!skipConfirmationActive) return;
    if (isReadOnly) return;
    if (!swapQuote || !swapQuote.amountOutFormatted) return;
    if (status !== 'previewing') return;
    if (swapQuote.allowanceCheckUncertain) return;

    // Reset the skip confirmation flag
    setSkipConfirmationActive(false);

    // Auto-execute the swap
    if (swapUiTrace) console.log('[Swap] Skip confirmation active - auto-executing swap');
    swap()
      .then(() => {
        // Directly confirm without showing preview
        confirmSwap();
      })
      .catch((err) => {
        console.warn('[Swap] Auto-execute failed:', err);
      });
  }, [skipConfirmationActive, swapQuote, status, swap, confirmSwap, isReadOnly]);

  // Expired quote: refresh only (stay on swap card). Fresh quote: open preview as today.
  const handleMainSwapAction = async () => {
    if (commissionSwapUnavailable) {
      try {
        await switchNetwork(1);
      } catch {
        toast.error('Could not switch network. Try from your wallet app.');
      }
      return;
    }
    if (
      status === 'error' &&
      quoteErrorParsed?.reasonCode === 'unsupported_commission_route'
    ) {
      dismissQuoteError();
      setShowFromSelector(false);
      setShowToSelector(true);
      return;
    }
    if (swapQuote && isQuoteExpired) {
      await fetchSwapQuote();
      return;
    }
    if (swapQuote?.allowanceCheckUncertain) {
      toast.info(SWAP_SURFACE_COPY.allowanceCheckUncertainToast);
      await fetchSwapQuote();
      return;
    }
    // Block preview/swap behind explicit Terms/Privacy acceptance (one-time per browser).
    if (!useTermsStore.getState().accepted) {
      setShowTermsGate(true);
      return;
    }
    await handlePreviewSwap();
  };

  const handleTermsGateAccept = () => {
    setShowTermsGate(false);
    void handlePreviewSwap();
  };

  // Open preview modal - ONLY if quote is valid and fresh
  const handlePreviewSwap = async () => {
    if (isReadOnly) return;

    if (insufficientGas) {
      toast.error(
        gasAffordability?.blockingMessage ??
          'Insufficient native balance for network fees.',
      );
      return;
    }

    // Guard: Must have valid input
    const amount = parseFloat(fromAmount || '0');
    if (!fromAmount || isNaN(amount) || amount <= 0) {
      if (swapUiTrace) console.warn('[Swap] Preview blocked - no valid input amount');
      return;
    }

    // Guard: Must have a quote with output
    if (!swapQuote || !swapQuote.amountOutFormatted || parseFloat(swapQuote.amountOutFormatted) <= 0) {
      if (swapUiTrace) console.warn('[Swap] Preview blocked - no valid quote');
      return;
    }

    if (swapQuote.allowanceCheckUncertain) {
      toast.info(SWAP_SURFACE_COPY.allowanceCheckUncertainToast);
      const refreshed = await fetchSwapQuote();
      if (!refreshed) return;
      return;
    }

    // Guard: Status must be previewing (quote ready)
    if (status !== 'previewing') {
      if (swapUiTrace) console.warn('[Swap] Preview blocked - status is not previewing:', status);
      return;
    }

    // Refresh stale quote before preview (aligns with 30s TTL / modal expiry)
    const staleMs = QUOTE_EXPIRY_SECONDS * 1000;
    if (swapQuote.quoteTimestamp && Date.now() - swapQuote.quoteTimestamp >= staleMs) {
      const refreshed = await fetchSwapQuote();
      if (!refreshed) return;
    }

    try {
      if (activeFlowId) {
        emitSwapLifecycleStage({
          swapFlowId: activeFlowId,
          stage: 'preview_opened',
          chainId: currentChainId,
          provider: swapQuote?.provider ?? null,
          routeMode: String(routeMode),
          quoteFingerprint: quoteInputFingerprint,
        });
        logRevenueTelemetry('preview_opened', {
          chainId: currentChainId,
          fromSymbol: fromAsset?.symbol,
          toSymbol: toAsset?.symbol,
          pairKey:
            fromAsset && toAsset
              ? `${currentChainId}|${fromAsset.symbol}|${toAsset.symbol}`
              : undefined,
          source: 'swap_card',
          provider: swapQuote?.provider,
        });
      }
      await swap();
      setShowPreview(true);
    } catch (err) {
      // Error handled in useSwap
    }
  };

  // Confirm swap from preview modal
  const handleConfirmSwap = async () => {
    if (insufficientGas) {
      toast.error(
        gasAffordability?.blockingMessage ??
          'Insufficient native balance for network fees.',
      );
      return;
    }
    try {
      await confirmSwap();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'SWAP_EXECUTION_IN_PROGRESS' || message === 'QUOTE_EXPIRED') {
        return;
      }
      console.warn('[SwapInterface] confirmSwap failed', err);
    }
  };

  // Cancel preview or close success modal
  const handleCancelPreview = () => {
    // Swap tx already broadcast — only hide the modal; confirmation pipeline keeps running.
    if (txHash && status === 'confirming') {
      setShowPreview(false);
      return;
    }

    if (showPreview && activeFlowId && status !== 'success') {
      emitSwapLifecycleStage({
        swapFlowId: activeFlowId,
        stage: 'abandoned',
        chainId: currentChainId,
        provider: swapQuote?.provider ?? null,
        routeMode: String(routeMode),
        quoteFingerprint: quoteInputFingerprint,
        reason: 'user_closed_preview',
      });
    }
    setShowPreview(false);

    // If swap was successful, clear the input for a fresh start
    if (status === 'success') {
      setFromAmount('');
    }

    cancelPreview();
    reset();
  };

  // Refresh quote in preview
  const handleRefreshQuote = async () => {
    setIsRefreshingQuote(true);
    try {
      await fetchSwapQuote();
    } finally {
      setIsRefreshingQuote(false);
    }
  };

  // Handle preset selection - prefill swap form
  const handlePresetSelect = useCallback((preset: SwapPreset) => {
    // Prefill assets
    setFromAsset(preset.fromAsset);
    setToAsset(preset.toAsset);

    // Prefill amount and slippage
    setFromAmount(preset.fromAmount);
    setSlippage(preset.slippage);

    // Clear prior swap quote / approval flags (same concern as token picker)
    reset();

    // Mark preset as used
    markPresetUsed(preset.id);

    // Store active preset for guard evaluation
    setActivePreset(preset);
    setGuardEvaluation(null);
    setGuardsDismissed(false);

    // If skip confirmation is enabled, set flag for immediate execution
    // (but only if guards are not enabled or in soft mode)
    if (preset.skipConfirmation && (!preset.guards?.enabled || preset.guards.mode === 'soft')) {
      setSkipConfirmationActive(true);
    }
  }, [setFromAsset, setToAsset, setFromAmount, setSlippage, markPresetUsed, reset]);

  // Evaluate guards when intelligence changes
  useEffect(() => {
    if (!activePreset?.guards?.enabled) {
      setGuardEvaluation(null);
      return;
    }

    // Evaluate guards against current intelligence
    const evaluation = evaluatePresetGuards(activePreset.guards, swapIntelligence);
    setGuardEvaluation(evaluation);

    // If blocked in hard mode, disable skip confirmation
    if (evaluation.blocked) {
      setSkipConfirmationActive(false);
    }
  }, [activePreset, swapIntelligence]);

  // Check if we can save a preset (have valid swap setup)
  const canSavePreset = fromAsset && toAsset && fromAmount && parseFloat(fromAmount) > 0;

  const getModalStep = (): SwapStep => {
    switch (status) {
      case 'approving':
        return 'approving';
      case 'swapping':
        return 'swapping';
      case 'confirming':
        return 'broadcasting';
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'preview';
    }
  };

  const showRecoveryCard =
    Boolean(recoveredTrace) &&
    !showPreview &&
    !['approving', 'swapping', 'confirming'].includes(status);

  // Get button text
  const getButtonText = (): string => {
    if (!isConnected) return 'Connect Wallet';
    if (isWrongChain) return 'Wrong Network';
    if (commissionSwapUnavailable) return SWAP_SURFACE_COPY.commissionSwapSwitchNetworkCta;
    if (!fromAmount || parseFloat(fromAmount) === 0) return SWAP_SURFACE_COPY.emptyStateCtaEnterAmount;
    // Phase 2 native quote-only: stable CTA must win over balance / approval / refresh / pipeline labels
    if (isEthNativeV2QuoteOnlyNoExec && hasUsableQuote) {
      return SWAP_SURFACE_COPY.quoteOnlyNoExecutionCta;
    }
    if (status === 'approving') return 'Approving token…';
    if (status === 'swapping') return 'Sign swap in wallet…';
    if (status === 'confirming') return 'Confirming on-chain…';
    if (status === 'success') return 'Swap completed';
    if (insufficientBalance) return `Insufficient ${fromAsset?.symbol || ''} Balance`;
    if (insufficientGas && gasAffordability?.blockingMessage) {
      return `Insufficient ${gasAffordability.nativeSymbol} for fees`;
    }
    if (isQuoteFetchUiLoading) return SWAP_SURFACE_COPY.gettingQuote;
    if (status === 'error' && error) {
      if (!swapQuote && quoteErrorParsed?.reasonCode === 'unsupported_commission_route') {
        return SWAP_SURFACE_COPY.unsupportedCommissionRouteCta;
      }
      return swapQuote ? SWAP_SURFACE_COPY.swapFailedCta : SWAP_SURFACE_COPY.quoteFailedCta;
    }
    // Debounce gap / awaiting pipeline: amount set but not yet loading or quoted
    if (!swapQuote && fromAmount && parseFloat(fromAmount) > 0 && !insufficientBalance) {
      return SWAP_SURFACE_COPY.gettingQuote;
    }
    // Show blocked state if hard guards fail
    if (guardEvaluation?.blocked && !guardsDismissed) return 'Blocked by Protection';
    if (swapQuote && isQuoteExpired) return SWAP_SURFACE_COPY.refreshQuoteCta;
    if (swapQuote?.allowanceCheckUncertain) return SWAP_SURFACE_COPY.allowanceCheckUncertainCta;
    if (isReadOnly) return 'Connect wallet to swap';
    return 'Preview Swap';
  };

  // Check if button should be disabled
  const isButtonDisabled = (): boolean => {
    if (!isConnected) return true;
    if (isWrongChain) return true;
    if (commissionSwapUnavailable) return false;
    if (!fromAmount || parseFloat(fromAmount) === 0) return true;
    if (
      status === 'approving' ||
      status === 'swapping' ||
      status === 'confirming' ||
      status === 'success'
    ) {
      return true;
    }
    if (insufficientBalance) return true;
    if (insufficientGas) return true;
    if (isQuoteFetchUiLoading) return true;
    if (status === 'error' && error) {
      if (!swapQuote && quoteErrorParsed?.reasonCode === 'unsupported_commission_route') {
        return false;
      }
      return true;
    }
    // Must have a quote to proceed
    if (!swapQuote) return true;
    if (isEthNativeV2QuoteOnlyNoExec && hasUsableQuote) {
      return true;
    }
    // View-only: quotes are informational; signing requires WalletConnect (expired-quote refresh still allowed)
    if (isReadOnly && !isQuoteExpired) return true;
    // Block if hard guards fail
    if (guardEvaluation?.blocked && !guardsDismissed) return true;
    return false;
  };

  // Get fee tier display name
  const getFeeTierDisplay = (feeTier: number): string => {
    const tiers: Record<number, string> = {
      100: '0.01%',
      500: '0.05%',
      3000: '0.3%',
      10000: '1%',
    };
    return tiers[feeTier] || `${(feeTier / 10000).toFixed(2)}%`;
  };

  // Check if swap is ready (for glow effect) — never "ready" on an expired quote
  const isSwapReady =
    !isButtonDisabled() &&
    swapQuote &&
    status === 'previewing' &&
    !isQuoteExpired &&
    !swapQuote.allowanceCheckUncertain &&
    quoteReadiness.fullyReady;

  const isMainCtaDisabled = isButtonDisabled();

  /** Receive column display — preserves stale quote (K1) during background refresh. */
  const receiveAmountState = useMemo(() => {
    const hasInput =
      Boolean(fromAmount) && parseFloat(fromAmount) > 0 && !insufficientBalance;
    if (!hasInput) return 'empty' as const;
    if (hasUsableQuote && swapQuote?.amountOutFormatted) {
      if (isQuotePipelineLoading && status !== 'checking_allowance') {
        return 'refreshing' as const;
      }
      return 'quoted' as const;
    }
    if (isQuoteFetchUiLoading || (showSpinner && !hasUsableQuote)) {
      return 'loading' as const;
    }
    if (hasInput) return 'pending' as const;
    return 'empty' as const;
  }, [
    fromAmount,
    insufficientBalance,
    hasUsableQuote,
    swapQuote?.amountOutFormatted,
    isQuotePipelineLoading,
    status,
    isQuoteFetchUiLoading,
    showSpinner,
  ]);

  const mainCtaLabel = getButtonText();

  const ctaSpec = useMemo(() => {
    if (insufficientGas && gasAffordability) {
      return {
        id: 'insufficient_gas' as const,
        label: `Insufficient ${gasAffordability.nativeSymbol} for fees`,
        enabled: false,
        reason: gasAffordability.blockingMessage ?? 'Not enough native token for network fees',
        nextStep: `Reduce the swap amount or add more ${gasAffordability.nativeSymbol}`,
      };
    }
    if (quoteReadiness.state === 'QUOTE_READY_GAS_UNAVAILABLE') {
      const base = resolveSwapCtaState({
        isConnected,
        isWrongChain,
        commissionSwapUnavailable,
        hasAmount: Boolean(fromAmount && parseFloat(fromAmount) > 0),
        insufficientBalance: Boolean(insufficientBalance),
        isQuoteLoading: isQuoteFetchUiLoading,
        hasQuote: Boolean(hasUsableQuote),
        isQuoteExpired,
        needsApproval: Boolean(swapQuote?.needsApproval),
        status,
        isReadOnly,
        guardsBlocked: Boolean(guardEvaluation?.blocked && !guardsDismissed),
        unsupportedRoute: Boolean(
          status === 'error' &&
            !swapQuote &&
            quoteErrorParsed?.reasonCode === 'unsupported_commission_route',
        ),
      });
      return {
        ...base,
        reason: 'Quote ready — network fee unavailable',
        nextStep:
          'Your wallet will show the final network fee before signing. Preview is available; affordability is not fully confirmed.',
      };
    }
    return resolveSwapCtaState({
      isConnected,
      isWrongChain,
      commissionSwapUnavailable,
      hasAmount: Boolean(fromAmount && parseFloat(fromAmount) > 0),
      insufficientBalance: Boolean(insufficientBalance),
      isQuoteLoading: isQuoteFetchUiLoading,
      hasQuote: Boolean(hasUsableQuote),
      isQuoteExpired,
      needsApproval: Boolean(swapQuote?.needsApproval),
      status,
      isReadOnly,
      guardsBlocked: Boolean(guardEvaluation?.blocked && !guardsDismissed),
      unsupportedRoute: Boolean(
        status === 'error' &&
          !swapQuote &&
          quoteErrorParsed?.reasonCode === 'unsupported_commission_route',
      ),
    });
  }, [
    insufficientGas,
    gasAffordability,
    quoteReadiness.state,
    isConnected,
    isWrongChain,
    commissionSwapUnavailable,
    fromAmount,
    insufficientBalance,
    isQuoteFetchUiLoading,
    hasUsableQuote,
    isQuoteExpired,
    swapQuote?.needsApproval,
    status,
    isReadOnly,
    guardEvaluation?.blocked,
    guardsDismissed,
    swapQuote,
    quoteErrorParsed?.reasonCode,
  ]);

  const lifecycleState = useMemo(
    () =>
      mapSwapStatusToLifecycle({
        status,
        hasQuote: Boolean(hasUsableQuote),
        isQuoteExpired,
        needsApproval: swapQuote?.needsApproval,
        error,
        isConnected,
      }),
    [status, hasUsableQuote, isQuoteExpired, swapQuote?.needsApproval, error, isConnected],
  );

  const showCommissionRouteIssue =
    isCommissionRequiredMode() &&
    fromAsset &&
    toAsset &&
    !isNativeWrappedPair(currentChainId, fromAsset, toAsset) &&
    (routingDisplay.showUnsupportedPanel ||
      (!hasUsableQuote &&
        (quoteErrorParsed?.reasonCode === 'unsupported_commission_route' ||
          isCommissionPairAuditBlocked(
            currentChainId,
            fromAsset.symbol,
            toAsset.symbol,
          ))));

  const commissionRouteIssueCopy = useMemo(() => {
    if (!fromAsset || !toAsset) {
      return {
        title: SWAP_SURFACE_COPY.unsupportedCommissionRouteTitle,
        helper: SWAP_SURFACE_COPY.commissionRouteRecoveryHelper,
      };
    }
    return getCommissionRouteIssueCopy(currentChainId, fromAsset.symbol, toAsset.symbol);
  }, [currentChainId, fromAsset, toAsset]);

  const showRoutePrecheckRow =
    routingDisplay.showPrecheckRow && !showCommissionRouteIssue;

  const commissionRecoveryNeeded =
    showCommissionRouteIssue ||
    Boolean(
      error &&
        status !== 'previewing' &&
        !isQuotePipelineLoading &&
        !(hasUsableQuote && swapQuote?.success) &&
        routingDisplay.showUnsupportedPanel,
    );

  const needCommissionUiChunk = commissionRecoveryNeeded;

  /** Defer display-only commission UI until idle; load immediately for recovery paths. */
  const [commissionUiChunkReady, setCommissionUiChunkReady] = useState(false);

  useEffect(() => {
    if (!needCommissionUiChunk) {
      setCommissionUiChunkReady(false);
      return;
    }
    if (commissionRecoveryNeeded) {
      setCommissionUiChunkReady(true);
      return;
    }

    let cancelled = false;
    const activate = () => {
      if (!cancelled) setCommissionUiChunkReady(true);
    };

    let idleHandle: number | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(activate, { timeout: 2000 });
    } else {
      const timeoutId = window.setTimeout(activate, 300);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [needCommissionUiChunk, commissionRecoveryNeeded]);

  /** Visual-only CTA styling — does not change disabled rules or execution. */
  const ctaVisualState = useMemo(() => {
    if (!isConnected || isWrongChain) return 'neutral' as const;
    if (commissionSwapUnavailable) return 'unsupported' as const;
    if (
      status === 'error' &&
      quoteErrorParsed?.reasonCode === 'unsupported_commission_route' &&
      !swapQuote
    ) {
      return 'unsupported' as const;
    }
    if (isSwapReady) return 'ready' as const;
    if (
      isQuoteFetchUiLoading ||
      (showSpinner && !hasUsableQuote && fromAmount && parseFloat(fromAmount) > 0)
    ) {
      return 'loading' as const;
    }
    if (isMainCtaDisabled) return 'incomplete' as const;
    return 'neutral' as const;
  }, [
    isConnected,
    isWrongChain,
    commissionSwapUnavailable,
    status,
    quoteErrorParsed?.reasonCode,
    swapQuote,
    isSwapReady,
    isQuoteFetchUiLoading,
    showSpinner,
    hasUsableQuote,
    fromAmount,
    isMainCtaDisabled,
  ]);

  const mainCtaClassName = useMemo(() => {
    const base =
      'w-full py-3.5 rounded-glass-sm font-semibold text-base transition-all duration-200 disabled:cursor-not-allowed';
    switch (ctaVisualState) {
      case 'ready':
        return `${base} bg-accent text-electro-bg shadow-glow-accent hover:brightness-110 disabled:opacity-50 disabled:shadow-none`;
      case 'loading':
        return `${base} bg-electro-panel text-gray-300 border border-accent/40 ring-1 ring-accent/20 animate-pulse disabled:opacity-90`;
      case 'unsupported':
        return `${base} bg-amber-950/35 text-amber-50 border border-amber-600/45 hover:bg-amber-900/45 hover:border-amber-500/55`;
      case 'incomplete':
        return `${base} bg-electro-panel/50 text-dark-400 border border-white/[0.08] disabled:opacity-65`;
      default:
        return `${base} bg-electro-panel text-gray-400 border border-white/[0.1] hover:bg-electro-panelHover hover:border-white/[0.15] disabled:opacity-50 disabled:shadow-none`;
    }
  }, [ctaVisualState]);

  // Render swap form
  if (commissionSwapUnavailable) {
    return (
      <>
        <div className="w-full max-w-md lg:max-w-xl 2xl:max-w-2xl mx-auto bg-electro-panel/90 backdrop-blur-glass rounded-2xl p-5 sm:p-6 border border-white/[0.1] shadow-[0_20px_60px_rgba(0,0,0,0.45)] relative overflow-x-hidden min-w-0">
          <div className="relative z-10 mb-3">
            <h2 className="text-xl font-bold text-white">Swap</h2>
            <p className="mt-1 text-xs text-dark-400">Not available on the selected network.</p>
          </div>
          <UnsupportedSwapNetworkExperience
            chainId={currentChainId}
            onSwitchToSwapChain={(targetChainId) => {
              void switchNetwork(targetChainId).catch(() => {
                toast.error('Could not switch network. Try from your wallet app.');
              });
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="w-full max-w-md lg:max-w-xl 2xl:max-w-2xl mx-auto bg-electro-panel/90 backdrop-blur-glass rounded-2xl p-5 sm:p-6 border border-white/[0.1] shadow-[0_20px_60px_rgba(0,0,0,0.45)] relative overflow-x-hidden overflow-y-visible min-w-0">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-glass-gradient pointer-events-none" />
        {/* Header + session context */}
        <div className="relative z-10 mb-3 min-w-0">
          <h2 className="text-xl font-bold text-white">Swap</h2>
          <SwapSessionContextStrip
            chainId={currentChainId}
            isConnected={isConnected}
            isWrongChain={isWrongChain}
            isReadOnly={isReadOnly}
            address={address}
            hasUsableQuote={hasUsableQuote}
            isQuoteFetchUiLoading={isQuoteFetchUiLoading}
            quoteSecondsRemaining={quoteSecondsRemaining}
            isQuoteExpired={isQuoteExpired}
            quoteStatusLabel={
              hasUsableQuote && !isQuoteExpired
                ? quoteReadiness.publicLabel
                : null
            }
          />
        </div>

        <CommissionSwapChainBanner
          chainId={currentChainId}
          onSwitchToSwapChain={(targetChainId) => {
            void switchNetwork(targetChainId).catch(() => {
              toast.error('Could not switch network. Try from your wallet app.');
            });
          }}
        />

        <SwapExecutionRail
          status={status}
          isConnected={isConnected}
          hasQuote={hasUsableQuote}
          needsApproval={swapQuote?.needsApproval}
          quoteSecondsRemaining={quoteSecondsRemaining}
          providerLabel={
            swapQuote?.provider ? swapAggregatorProviderLabel(swapQuote.provider) : null
          }
          error={error}
        />

        {isCommissionRequiredMode() &&
          currentChainId === 1 &&
          (fromAsset?.is_native || toAsset?.is_native) &&
          getUniswapWrapperV2Config().nativeQuoteEnabled &&
          !getUniswapWrapperV2Config().nativeEnabled && (
            <div className="relative z-10 mb-3 rounded-lg bg-slate-800/80 border border-white/[0.08] px-3 py-2 text-[11px] text-dark-100 leading-snug">
              ETH swaps are currently in quote-only mode.
            </div>
          )}

        {currentChainId === 1 &&
          getUniswapWrapperV2Config().nativeEnabled &&
          getUniswapWrapperV2Config().experimentalNativeUi &&
          (fromAsset?.is_native || toAsset?.is_native) && (
            <div className="relative z-10 mb-3 rounded-lg bg-amber-900/25 border border-amber-700/40 px-3 py-2 text-[11px] text-amber-100/95 leading-snug">
              Experimental ETH routing
            </div>
          )}

        {isCommissionRequiredMode() &&
          currentChainId === 1 &&
          (fromAsset?.is_native || toAsset?.is_native) &&
          (!getUniswapWrapperV2Config().enabled ||
            !getUniswapWrapperV2Config().wrapperAddress ||
            !getUniswapWrapperV2Config().nativeQuoteEnabled) && (
            <div className="relative z-10 mb-3 rounded-lg bg-amber-900/20 border border-amber-700/35 px-3 py-2 text-[11px] text-amber-100/95 leading-snug">
              ETH native swaps are temporarily unavailable.
            </div>
          )}

        {/* More options: presets, save, swap settings, quick pairs — closed by default */}
        {showMoreOptions ? (
          <div className="relative z-10 mb-3 rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06] bg-black/20">
              <span className="text-[11px] font-medium text-dark-200">More options</span>
              <button
                type="button"
                onClick={() => setShowMoreOptions(false)}
                className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                title="Close"
                aria-label="Close more options"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="p-3 space-y-3">
              {isConnected && (
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
                    <PresetDropdown onSelectPreset={handlePresetSelect} />
                  </div>
                  {canSavePreset && (
                    <button
                      type="button"
                      onClick={() => setShowSavePreset(true)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-electro-bgAlt/60 text-[11px] text-dark-300 hover:text-primary-400 hover:border-primary-500/30 transition-colors"
                      title="Save as preset"
                    >
                      <SaveIcon />
                      <span>Save preset</span>
                    </button>
                  )}
                </div>
              )}
              <SlippageSettings
                value={slippage}
                customValue={customSlippage}
                onChange={setSlippage}
                onCustomChange={handleCustomSlippage}
                approvalMode={approvalMode}
                onApprovalModeChange={setApprovalMode}
                routeMode={routeMode}
                onRouteModeChange={setRouteMode}
                chainId={currentChainId}
                onClose={() => setShowMoreOptions(false)}
              />
              <QuickSwapPresets
                chainId={currentChainId}
                tokens={AVAILABLE_TOKENS}
                onSelect={(from, to) => {
                  const fromToken = AVAILABLE_TOKENS.find((t) => t.symbol === from);
                  const toToken = AVAILABLE_TOKENS.find((t) => t.symbol === to);
                  if (fromToken) setFromAsset(fromToken);
                  if (toToken) setToAsset(toToken);
                  reset();
                }}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMoreOptions(true)}
            className="relative z-10 mb-3 w-full min-w-0 inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/[0.12] px-3 py-2 text-[11px] text-dark-300 hover:text-dark-100 transition-colors"
            title="More swap options"
            aria-expanded={false}
            aria-label="More options"
          >
            <SettingsIcon />
            <span>More options</span>
          </button>
        )}

        {tokenSafety &&
          (tokenSafety.unknownFrom ||
            tokenSafety.unknownTo ||
            tokenSafety.noV3Pool ||
            tokenSafety.lowLiquidity) &&
          (() => {
            const contractRisk = !!(tokenSafety.unknownFrom || tokenSafety.unknownTo);
            const panel =
              contractRisk
                ? 'border-amber-600/40 bg-amber-950/30 text-amber-100/95'
                : 'border-slate-600/35 bg-slate-900/50 text-slate-200';
            const kicker = contractRisk ? 'text-amber-200/95' : 'text-slate-300';
            return (
              <div className={`relative z-10 mb-3 rounded-xl px-3 py-2.5 text-[11px] leading-snug border ${panel}`}>
                <p className={`font-semibold uppercase tracking-wide text-[10px] mb-1.5 ${kicker}`}>
                  {contractRisk ? SWAP_SURFACE_COPY.tokenSafetyTitleCaution : SWAP_SURFACE_COPY.tokenSafetyTitleInfo}
                </p>
                <ul className="list-none space-y-1.5 pl-0">
                  {tokenSafety.unknownFrom && (
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5 shrink-0">
                        <WarningIcon />
                      </span>
                      <span>
                        This token is not verified (&quot;{fromAsset?.symbol}&quot;). Confirm the contract before you swap.
                      </span>
                    </li>
                  )}
                  {tokenSafety.unknownTo && (
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5 shrink-0">
                        <WarningIcon />
                      </span>
                      <span>
                        This token is not verified (&quot;{toAsset?.symbol}&quot;). Confirm the contract before you swap.
                      </span>
                    </li>
                  )}
                  {tokenSafety.noV3Pool &&
                    !(
                      swapQuote?.provider &&
                      String(swapQuote.provider).toLowerCase().includes('wrapper')
                    ) && (
                    <li className="flex items-start gap-2">
                      <span className="text-slate-400 mt-0.5 shrink-0">
                        <InfoIcon />
                      </span>
                      <span>
                        Direct V3 pool not found for this pair on this network — swaps may still route via other
                        liquidity sources.
                      </span>
                    </li>
                  )}
                  {tokenSafety.lowLiquidity && (
                    <li className="flex items-start gap-2">
                      <span className="text-slate-400 mt-0.5 shrink-0">
                        <InfoIcon />
                      </span>
                      <span>
                        This pair has low on-chain V3 liquidity — expect higher slippage or occasional quote failures.
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            );
          })()}

        {/* From Token */}
        <div className={`relative bg-electro-bgAlt/80 rounded-glass-sm p-3.5 sm:p-4 mb-2 border transition-all duration-200 ${
          showFromSelector ? 'z-30' : 'z-10'
        } ${
          insufficientBalanceForUi ? 'border-danger/50 shadow-glow-danger' : 'border-white/[0.06] hover:border-white/[0.1]'
        }`}>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 mb-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-dark-500 shrink-0">You pay</span>
            <div
              className={`flex items-center gap-2 text-xs sm:text-sm min-w-0 ${
                insufficientBalanceForUi ? 'text-red-400' : 'text-dark-400'
              }`}
            >
              <span className="tabular-nums">
                Balance{' '}
                <span className={`font-medium ${insufficientBalanceForUi ? 'text-red-300' : 'text-dark-300'}`}>
                  {fromBalance === '…' ? (
                    <InlineSkeleton className="inline-block h-4 w-[4.5rem] align-middle" />
                  ) : fromBalance === 'unavailable' ? (
                    <span className="text-dark-500 font-normal not-italic">unavailable</span>
                  ) : fromBalance === '—' ? (
                    <span className="text-dark-500 font-normal">—</span>
                  ) : (
                    formatBalance(fromBalance)
                  )}
                </span>
              </span>
              {isConnected && fromBalanceNum > 0 && Number.isFinite(fromBalanceNum) && (
                <button
                  type="button"
                  onClick={() => {
                    const maxAmount = getMaxAmount();
                    if (parseFloat(maxAmount) > 0) {
                      setFromAmount(maxAmount);
                    }
                  }}
                  className="shrink-0 min-h-[2rem] px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide text-primary-300 bg-primary-500/15 border border-primary-500/35 hover:bg-primary-500/25 hover:border-primary-400/50 transition-colors"
                  title={fromAsset?.is_native ? 'Max (leaves small amount for gas)' : 'Use full balance'}
                >
                  MAX
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3.5 w-full min-w-0 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative shrink-0 self-stretch sm:self-auto min-w-0">
              <TokenButton
                asset={fromAsset}
                chainId={currentChainId}
                onClick={() => {
                  setShowFromSelector(!showFromSelector);
                  setShowToSelector(false);
                }}
              />
              {showFromSelector && (
                <TokenSelectorDropdown
                  assets={AVAILABLE_TOKENS}
                  selectedAsset={fromAsset}
                  excludeAsset={toAsset}
                  onSelect={handleFromTokenSelect}
                  onClose={() => setShowFromSelector(false)}
                  chainId={currentChainId}
                  provider={provider}
                  onAddToken={addCustomToken}
                  onRemoveToken={removeCustomToken}
                  showFavorites={true}
                />
              )}
            </div>
            <div className="w-full min-w-0 flex-1 overflow-x-auto sm:overflow-x-visible [scrollbar-width:thin]">
              <input
                id="swap-from-amount"
                name="swap-from-amount"
                type="text"
                placeholder="0.0"
                value={fromAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  // Prevent multiple decimal points
                  if (val.split('.').length <= 2) {
                    setFromAmount(val);
                  }
                }}
                className="w-full min-w-0 bg-transparent text-2xl sm:text-[1.65rem] font-semibold text-right outline-none tabular-nums leading-tight py-0.5"
              />
            </div>
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center -my-2 relative z-20">
          <button
            onClick={() => {
              swapAssets();
              reset();
            }}
            className="p-2.5 bg-electro-panel rounded-xl hover:bg-electro-panelHover transition-all duration-200 border-4 border-electro-bg hover:border-accent/20 group"
            title="Swap direction"
          >
            <div className="text-gray-400 group-hover:text-accent transition-colors">
              <SwapIcon />
            </div>
          </button>
        </div>

        {/* To Token */}
        <div className={`relative bg-electro-bgAlt/80 rounded-glass-sm p-3.5 sm:p-4 mt-2 border border-white/[0.06] hover:border-white/[0.1] transition-all duration-200 ${
          showToSelector ? 'z-30' : 'z-10'
        }`}>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2 mb-2.5">
            <div className="flex flex-col gap-0.5 shrink-0 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-dark-500">You receive</span>
              <span className="text-[10px] text-dark-500/90">After fees · estimate</span>
            </div>
            <span className="text-xs sm:text-sm text-dark-400 tabular-nums">
              Balance{' '}
              <span className="font-medium text-dark-300">
                {(() => {
                  const b = getBalance(toAsset);
                  if (b === '…') return <InlineSkeleton className="inline-block h-4 w-[4.5rem] align-middle" />;
                  if (b === 'unavailable') return <span className="text-dark-500 font-normal">unavailable</span>;
                  if (b === '—') return <span className="text-dark-500 font-normal">—</span>;
                  return formatBalance(b);
                })()}
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-3.5 w-full min-w-0 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative shrink-0 self-stretch sm:self-auto min-w-0">
              <TokenButton
                asset={toAsset}
                chainId={currentChainId}
                onClick={() => {
                  setShowToSelector(!showToSelector);
                  setShowFromSelector(false);
                }}
              />
              {showToSelector && (
                <TokenSelectorDropdown
                  assets={AVAILABLE_TOKENS}
                  selectedAsset={toAsset}
                  excludeAsset={fromAsset}
                  onSelect={handleToTokenSelect}
                  onClose={() => setShowToSelector(false)}
                  chainId={currentChainId}
                  provider={provider}
                  onAddToken={addCustomToken}
                  onRemoveToken={removeCustomToken}
                  showFavorites={true}
                />
              )}
            </div>
            {/* Fixed min-height keeps pay/receive rows aligned; quote vs placeholder */}
            <div
              className="w-full min-w-0 flex-1 min-h-[2.5rem] text-right flex flex-col items-stretch sm:items-end justify-center overflow-x-auto sm:overflow-x-visible [scrollbar-width:thin]"
              aria-live="polite"
              aria-atomic="true"
            >
              {receiveAmountState === 'loading' ? (
                <InlineSkeleton className="h-8 w-[7.5rem] sm:h-9 sm:w-[8.5rem] ml-auto" />
              ) : receiveAmountState === 'pending' ? (
                <div className="flex items-center gap-2 justify-end min-w-0">
                  <LoadingSpinner />
                  <span className="text-sm text-dark-400 min-w-0">{SWAP_SURFACE_COPY.gettingQuote}</span>
                </div>
              ) : receiveAmountState === 'quoted' || receiveAmountState === 'refreshing' ? (
                <div className="flex items-center gap-2 justify-end min-w-0 w-full">
                  {receiveAmountState === 'refreshing' ? <LoadingSpinner /> : null}
                  <span className="min-w-0 text-right text-xl sm:text-2xl font-semibold tabular-nums text-primary-400 break-all">
                    {formatBalance(swapQuote!.amountOutFormatted, 6)}
                  </span>
                </div>
              ) : (
                <span className="text-lg sm:text-xl font-medium text-dark-600/50 tabular-nums select-none" aria-hidden>
                  —
                </span>
              )}
            </div>
          </div>
        </div>

        {/* P2.1 — single routing truth row (display-only; never blocks swap). */}
        {showRoutePrecheckRow && fromAsset && toAsset && (
          <div
            className="relative z-10 mt-3 flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-snug"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide border ${routingDisplayBadgeClass(routingDisplay.status)}`}
                title={getRoutingDisplayDescription(routingDisplay.status, currentChainId)}
              >
                {getRoutingDisplayBadgeLabel(routingDisplay.status)}
              </span>
              <span className="text-dark-400 flex-1 min-w-0">
                {getRoutingDisplayDescription(routingDisplay.status, currentChainId)}
              </span>
            </div>
          </div>
        )}

        {showCommissionRouteIssue && !routingDisplay.showUnsupportedPanel && (
          <CommissionRouteRecoveryPanelSection
            ready={commissionUiChunkReady}
            activeChainId={currentChainId}
            fromAsset={fromAsset}
            toAsset={toAsset}
            onSelectPair={(from, to) => {
              setShowFromSelector(false);
              setShowToSelector(false);
              setFromAsset(from);
              setToAsset(to);
              reset();
            }}
          />
        )}

        {/* Imported / unverified token notice (swap path only) */}
        {(() => {
          const fromExt = fromAsset as ExtendedAssetInfo | null;
          const toExt = toAsset as ExtendedAssetInfo | null;
          const lines: string[] = [];
          if (fromExt?.isCustom && !fromExt.verified) {
            lines.push(
              `${fromExt.symbol} is imported and not on the curated list — double-check the contract before you pay.`
            );
          }
          if (toExt?.isCustom && !toExt.verified) {
            lines.push(
              `${toExt.symbol} is imported and not on the curated list — verify you are receiving the correct asset.`
            );
          }
          if (lines.length === 0) return null;
          return (
            <div className="relative z-10 mt-3 rounded-xl border border-slate-600/35 bg-slate-900/45 px-3 py-2.5 text-xs text-slate-200 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Imported token</p>
              {lines.map((line) => (
                <p key={line} className="flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5 shrink-0">
                    <InfoIcon />
                  </span>
                  <span>{line}</span>
                </p>
              ))}
            </div>
          );
        })()}

        {/* Swap Intelligence compact strip removed (Phase 3.1): unlabeled score / % / $ confused users; see Advanced details. */}

        {/* Guard Warning Panel (when preset has guards and they fail) */}
        {guardEvaluation &&
          !guardEvaluation.passed &&
          !guardsDismissed &&
          status === 'previewing' &&
          !showPreview &&
          !isEthNativeV2QuoteOnlyNoExec && (
          <div className="mt-4">
            <GuardWarningPanel
              evaluation={guardEvaluation}
              onDismiss={() => setGuardsDismissed(true)}
              onProceedAnyway={() => setGuardsDismissed(true)}
            />
          </div>
        )}

        {showRecoveryCard && recoveredTrace && (
          <div className="relative z-10 mt-4">
            <RecoveredTransactionCard
              trace={recoveredTrace}
              onOpenDetails={() => openFromRecoveredTrace(recoveredTrace)}
              onManualRecheck={manualRecheck}
              manualRecheckDisabled={manualRecheckDisabled}
              isReconciling={isReconciling}
            />
          </div>
        )}

        <DeviceSwapActivityStrip
          chainId={currentChainId}
          excludeFlowId={showRecoveryCard ? recoveredTrace?.flowId : undefined}
          onViewDetails={openFromActivityItem}
        />

        {/* Quote Details (when quote available) */}
        {swapQuote && (status === 'previewing' || isQuotePipelineLoading) && !showPreview && (
          <div className="relative z-10 mt-4 p-4 bg-electro-bgAlt/70 rounded-xl text-sm space-y-2.5 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {/* Quote validity — route transparency card + execution economics below */}
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-dark-400" title="Quote is valid for a short time; refresh if the timer expires.">
                Quote
              </span>
              {quoteSecondsRemaining !== null && (
                quoteSecondsRemaining <= 0 ? (
                  isEthNativeV2QuoteOnlyNoExec && hasUsableQuote && isQuotePipelineLoading ? (
                    <div className="flex flex-col items-end gap-0.5 shrink-0 max-w-[10rem]">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-dark-700 text-dark-300">
                        <ClockIcon />
                        <span>0s</span>
                      </div>
                      <span className="text-[10px] text-dark-500 leading-tight text-right">
                        {SWAP_SURFACE_COPY.refreshingQuoteSubtle}
                      </span>
                    </div>
                  ) : (
                  <button
                    type="button"
                    onClick={() => void fetchSwapQuote()}
                    disabled={isQuotePipelineLoading}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-red-900/30 text-red-400 hover:bg-red-900/45 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ClockIcon />
                    <span>
                      {isQuotePipelineLoading
                        ? SWAP_SURFACE_COPY.refreshing
                        : SWAP_SURFACE_COPY.quoteExpiredChip}
                    </span>
                  </button>
                  )
                ) : (
                  <div
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${
                      quoteSecondsRemaining <= 5
                        ? 'bg-red-900/30 text-red-400 border-red-700/40'
                        : quoteSecondsRemaining <= 10
                        ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700/35'
                        : 'bg-emerald-950/40 text-emerald-200/90 border-emerald-600/25'
                    }`}
                    title={SWAP_SURFACE_COPY.quoteTtlTooltip}
                  >
                    <ClockIcon />
                    <span>{quoteSecondsRemaining}s</span>
                  </div>
                )
              )}
            </div>

            <RouteTransparencyCard
              providerLabel={swapAggregatorProviderLabel(swapQuote.provider)}
              routeModeLabel={formatQuoteRoutePreferenceLabel(swapQuote.routeMode)}
              amountOutFormatted={formatBalance(swapQuote.amountOutFormatted, 6)}
              minimumReceived={`${formatBalance(swapQuote.minimum_received, 6)} ${toAsset?.symbol ?? ''}`}
              priceImpactLabel={getPriceImpactUi(swapQuote.price_impact).label}
              priceImpactSeverity={getPriceImpactUi(swapQuote.price_impact).severity}
              gasUnitsDisplay={formatGasLimitUnits(swapQuote.gasEstimate)}
              quoteSelectionReason={swapQuote.quoteSelectionReason}
              runnerUpProviderLabel={
                swapQuote.runnerUpAggregatedQuote
                  ? swapAggregatorProviderLabel(swapQuote.runnerUpAggregatedQuote.provider)
                  : null
              }
              runnerUpAmountOut={
                swapQuote.runnerUpAggregatedQuote
                  ? `${formatBalance(swapQuote.runnerUpAggregatedQuote.amountOut, 6)} ${toAsset?.symbol ?? ''}`
                  : null
              }
              needsApproval={swapQuote.needsApproval}
              allowanceCheckUncertain={swapQuote.allowanceCheckUncertain}
            />

            {/* Main summary — execution economics (route/min/gas on RouteTransparencyCard) */}
            <div className="rounded-lg border border-white/[0.05] bg-black/10 px-3 py-2.5 space-y-2 min-w-0">
              <div className="flex justify-between gap-2 min-w-0 items-baseline">
                <span className="text-dark-400 shrink-0">Exchange rate</span>
                <span className="min-w-0 text-right text-dark-100 break-words tabular-nums">
                  1 {fromAsset?.symbol} = {formatBalance(swapQuote.rate, 6)} {toAsset?.symbol}
                </span>
              </div>
              {showUniswapWrapperV3CanaryHint && (
                <div className="flex justify-between gap-2 min-w-0 items-center pt-0.5">
                  <span className="text-dark-400 shrink-0 text-xs">Routing</span>
                  <span
                    className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded border border-amber-600/40 bg-amber-950/30 text-amber-200/90"
                    title="A Kobbex Uniswap wrapper V3 path is defined for this pair; enable VITE_UNISWAP_WRAPPER_V3_* to use it in commission mode."
                  >
                    V3 route available
                  </span>
                </div>
              )}
              {(() => {
                const q = swapQuote;
                if (q.provider === '1inch' && isMonetizationActiveForProvider('1inch')) {
                  return (
                    <div className="flex justify-between gap-2 min-w-0 items-baseline">
                      <span className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.swaperexFeeLabel}</span>
                      <span
                        className="min-w-0 text-right text-dark-200 tabular-nums break-words"
                        title="Output-token fee via 1inch on execution; quote output is estimated before this fee"
                      >
                        {(getMonetizationConfig().feeBps / 100).toFixed(2)}%
                      </span>
                    </div>
                  );
                }
                if (q.provider === 'uniswap-v3-wrapper') {
                  return (
                    <div className="flex justify-between gap-2 min-w-0 items-baseline">
                      <span className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.swaperexFeeLabel}</span>
                      <span
                        className="min-w-0 text-right text-dark-200 tabular-nums break-words"
                        title="Taken from gross swap output on-chain; quoted receive amount is net of this fee."
                      >
                        {(getUniswapWrapperFeeBpsForUi() / 100).toFixed(2)}%
                      </span>
                    </div>
                  );
                }
                if (q.provider === 'uniswap-v3-wrapper-v2') {
                  return (
                    <div className="flex justify-between gap-2 min-w-0 items-baseline">
                      <span className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.swaperexFeeLabel}</span>
                      <span
                        className="min-w-0 text-right text-dark-200 tabular-nums break-words"
                        title={SWAP_SURFACE_COPY.swaperexFeeTooltip}
                      >
                        {(getUniswapWrapperV2FeeBpsForUi() / 100).toFixed(2)}%
                      </span>
                    </div>
                  );
                }
                if (q.provider === 'uniswap-v3-wrapper-v3') {
                  return (
                    <div className="flex justify-between gap-2 min-w-0 items-baseline">
                      <span className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.swaperexFeeLabel}</span>
                      <span
                        className="min-w-0 text-right text-dark-200 tabular-nums break-words"
                        title={SWAP_SURFACE_COPY.swaperexFeeTooltip}
                      >
                        {(getUniswapWrapperV3FeeBpsForUi() / 100).toFixed(2)}%
                      </span>
                    </div>
                  );
                }
                if (q.provider === 'pancakeswap-v3-wrapper') {
                  return (
                    <div className="flex justify-between gap-2 min-w-0 items-baseline">
                      <span className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.swaperexFeeLabel}</span>
                      <span
                        className="min-w-0 text-right text-dark-200 tabular-nums break-words"
                        title={SWAP_SURFACE_COPY.swaperexFeeTooltip}
                      >
                        {(getPancakeWrapperFeeBpsForUi() / 100).toFixed(2)}%
                      </span>
                    </div>
                  );
                }
                if (q.provider === 'pancakeswap-v3-wrapper-v2') {
                  return (
                    <div className="flex justify-between gap-2 min-w-0 items-baseline">
                      <span className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.swaperexFeeLabel}</span>
                      <span
                        className="min-w-0 text-right text-dark-200 tabular-nums break-words"
                        title={SWAP_SURFACE_COPY.swaperexFeeTooltip}
                      >
                        {(getPancakeWrapperV2FeeBpsForUi() / 100).toFixed(2)}%
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="flex justify-between gap-2 min-w-0 items-baseline">
                    <span className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.swaperexFeeLabel}</span>
                    <span
                      className="min-w-0 text-right text-dark-200 tabular-nums break-words"
                      title="No separate Kobbex fee on this route"
                    >
                      None
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Advanced details — full technical context; open by default with ?debug=1 */}
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowAdvancedQuoteDetails((o) => !o)}
                className="w-full flex items-center justify-between gap-2 text-xs font-medium text-dark-300 hover:text-dark-100 py-2.5 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
                aria-expanded={showAdvancedQuoteDetails}
              >
                <span>Advanced details</span>
                <span className="text-dark-500 tabular-nums" aria-hidden>
                  {showAdvancedQuoteDetails ? '▲' : '▼'}
                </span>
              </button>
              {showAdvancedQuoteDetails && (
                <div className="mt-2 p-3 rounded-xl border border-white/[0.06] bg-black/15 space-y-3 text-xs">
                  <p className="text-[11px] text-dark-500 leading-snug">{SWAP_SURFACE_COPY.trustLineQuoteEstimate}</p>

                  <div className="flex justify-between text-xs gap-2 pt-1 border-b border-white/[0.06] pb-2">
                    <span className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.routePreferenceLabel}</span>
                    <span className="text-dark-200 text-right">{formatQuoteRoutePreferenceLabel(swapQuote.routeMode)}</span>
                  </div>

                  {swapQuote.quoteSelectionReason && (
                    <div className="rounded-lg bg-dark-800/40 border border-white/[0.05] px-3 py-2 space-y-2">
                      <div className="flex justify-between gap-2 items-start text-xs">
                        <span className="text-dark-400 shrink-0">Quote selection</span>
                        <span className="text-dark-200 text-right leading-snug">{swapQuote.quoteSelectionReason}</span>
                      </div>
                      {swapQuote.runnerUpAggregatedQuote ? (
                        <>
                          <div className="flex justify-between text-xs gap-2">
                            <span className="text-dark-400">
                              {SWAP_SURFACE_COPY.routeViaLabel} · {swapAggregatorProviderLabel(swapQuote.provider)}
                            </span>
                            <span className="text-primary-400 font-medium tabular-nums">
                              {formatBalance(swapQuote.amountOutFormatted, 6)} {toAsset?.symbol}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs gap-2 text-dark-400">
                            <span>
                              Runner-up · {swapAggregatorProviderLabel(swapQuote.runnerUpAggregatedQuote.provider)}
                            </span>
                            <span className="tabular-nums">
                              {formatBalance(swapQuote.runnerUpAggregatedQuote.amountOut, 6)} {toAsset?.symbol}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-xs gap-2">
                          <span className="text-dark-400">
                            {SWAP_SURFACE_COPY.routeViaLabel} · {swapAggregatorProviderLabel(swapQuote.provider)}
                          </span>
                          <span className="text-primary-400 font-medium tabular-nums">
                            {formatBalance(swapQuote.amountOutFormatted, 6)} {toAsset?.symbol}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-dark-400">Expected output</span>
                    <span className="text-primary-400 font-medium">
                      {formatBalance(swapQuote.amountOutFormatted, 6)} {toAsset?.symbol}
                    </span>
                  </div>

                  {(() => {
                    const pi = getPriceImpactUi(swapQuote.price_impact);
                    const impactClass =
                      pi.severity === 'unavailable'
                        ? 'text-dark-400'
                        : pi.severity === 'critical' || pi.severity === 'high'
                        ? 'text-red-400'
                        : pi.severity === 'medium'
                        ? 'text-yellow-400'
                        : pi.severity === 'low' || pi.severity === 'negligible'
                        ? 'text-green-400'
                        : 'text-dark-300';
                    return (
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-dark-400 shrink-0">Price impact</span>
                        <span
                          className={`text-right ${impactClass}`}
                          title={
                            pi.severity === 'unavailable'
                              ? 'No trustworthy impact % for this direct Uniswap quote; use size, slippage, and execution preview.'
                              : 'Estimated move vs. mid price before fees — not slippage tolerance'
                          }
                        >
                          {pi.label}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex justify-between">
                    <span className="text-dark-400">
                      {swapQuote.provider === '1inch'
                        ? SWAP_SURFACE_COPY.feeRouteCostLabel
                        : SWAP_SURFACE_COPY.feePoolCostLabel}
                    </span>
                    <span>
                      {swapQuote.provider === '1inch'
                        ? 'Included in quote (multi-pool)'
                        : swapQuote.provider === 'uniswap-v3-wrapper' ||
                            swapQuote.provider === 'uniswap-v3-wrapper-v2' ||
                            swapQuote.provider === 'uniswap-v3-wrapper-v3' ||
                            swapQuote.provider === 'pancakeswap-v3-wrapper' ||
                            swapQuote.provider === 'pancakeswap-v3-wrapper-v2'
                          ? `${getFeeTierDisplay(swapQuote.feeTier)} pool (wrapper route)`
                          : `${getFeeTierDisplay(swapQuote.feeTier)} fee tier`}
                    </span>
                  </div>

                  {swapQuote.provider === '1inch' && isMonetizationActiveForProvider('1inch') && (
                    <div className="flex justify-between gap-2">
                      <span className="text-dark-400 shrink-0">Platform fee (detail)</span>
                      <span
                        className="text-right text-dark-200"
                        title="Output-token fee via 1inch on execution; quote output is estimated before this fee"
                      >
                        {(getMonetizationConfig().feeBps / 100).toFixed(2)}%
                      </span>
                    </div>
                  )}

                  {swapQuote.provider === 'uniswap-v3-wrapper' && (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-400 shrink-0">Wrapper protocol fee</span>
                        <span
                          className="text-right text-dark-200"
                          title="Taken from gross swap output on-chain; quoted receive amount is net of this fee."
                        >
                          {(getUniswapWrapperFeeBpsForUi() / 100).toFixed(2)}%
                        </span>
                      </div>
                      {isUniswapWrapperFeeBpsUnverified() && (
                        <p className="text-[10px] text-dark-500 leading-snug pl-0">
                          {SWAP_SURFACE_COPY.wrapperFeeUnverifiedNote}
                        </p>
                      )}
                    </div>
                  )}

                  {swapQuote.provider === 'uniswap-v3-wrapper-v2' && (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-400 shrink-0">Wrapper V2 protocol fee</span>
                        <span
                          className="text-right text-dark-200"
                          title={SWAP_SURFACE_COPY.swaperexFeeTooltip}
                        >
                          {(getUniswapWrapperV2FeeBpsForUi() / 100).toFixed(2)}%
                        </span>
                      </div>
                      {isUniswapWrapperV2FeeBpsUnverified() && (
                        <p className="text-[10px] text-dark-500 leading-snug pl-0">
                          {SWAP_SURFACE_COPY.wrapperFeeUnverifiedNote}
                        </p>
                      )}
                    </div>
                  )}

                  {swapQuote.provider === 'uniswap-v3-wrapper-v3' && (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-400 shrink-0">Wrapper V3 protocol fee</span>
                        <span
                          className="text-right text-dark-200"
                          title={SWAP_SURFACE_COPY.swaperexFeeTooltip}
                        >
                          {(getUniswapWrapperV3FeeBpsForUi() / 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {swapQuote.provider === 'pancakeswap-v3-wrapper' && (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-400 shrink-0">Wrapper protocol fee</span>
                        <span
                          className="text-right text-dark-200"
                          title={SWAP_SURFACE_COPY.swaperexFeeTooltip}
                        >
                          {(getPancakeWrapperFeeBpsForUi() / 100).toFixed(2)}%
                        </span>
                      </div>
                      {isPancakeWrapperFeeBpsUnverified() && (
                        <p className="text-[10px] text-dark-500 leading-snug pl-0">
                          {SWAP_SURFACE_COPY.wrapperFeeUnverifiedNote}
                        </p>
                      )}
                    </div>
                  )}

                  {swapQuote.provider === 'pancakeswap-v3-wrapper-v2' && (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-400 shrink-0">Wrapper V2 protocol fee</span>
                        <span
                          className="text-right text-dark-200"
                          title={SWAP_SURFACE_COPY.swaperexFeeTooltip}
                        >
                          {(getPancakeWrapperV2FeeBpsForUi() / 100).toFixed(2)}%
                        </span>
                      </div>
                      {isPancakeWrapperV2FeeBpsUnverified() && (
                        <p className="text-[10px] text-dark-500 leading-snug pl-0">
                          {SWAP_SURFACE_COPY.wrapperFeeUnverifiedNote}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-dark-400">Slippage tolerance</span>
                    <span>{swapQuote.slippage}%</span>
                  </div>

                  <div className="border-t border-dark-700 pt-2 space-y-2">
                    <NetworkFeeEstimateRow
                      chainId={currentChainId}
                      gasEstimate={swapQuote.gasEstimate}
                      provider={provider}
                      walletConnected={isConnected && !isReadOnly}
                    />
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <span className="text-dark-400 shrink-0">Route via</span>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <ProviderBadge provider={swapQuote.provider} />
                      <RouteTooltip provider={swapQuote.provider} />
                    </div>
                  </div>

                  <div className="flex justify-between gap-2 items-baseline font-mono text-[10px] text-dark-400 break-all">
                    <span className="shrink-0 text-dark-500">Route id</span>
                    <span className="text-right text-dark-300">{swapQuote.provider}</span>
                  </div>

                  {swapIntelligence && (
                    <div className="space-y-2 pt-2 border-t border-white/[0.05]">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-dark-500">
                        Heuristic analysis (not the live quote)
                      </p>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-400 shrink-0">Safety score</span>
                        <span className="text-right text-dark-200">
                          {swapIntelligence.safetyScore.score}{' '}
                          <span className="text-dark-500">({swapIntelligence.safetyScore.level})</span>
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-400 shrink-0">Analysis price impact</span>
                        <span className="text-right text-dark-200">
                          {formatIntelligenceAnalysisPriceImpact(swapIntelligence.priceImpact)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-400 shrink-0">Selected pool estimated liquidity</span>
                        <span className="text-right text-dark-200">
                          {formatIntelligenceLiquidityUsdLabel(swapIntelligence.liquidity.totalUSD)}
                        </span>
                      </div>
                      <p className="text-[10px] text-dark-500 leading-snug">
                        Token scanner data and selected-pool liquidity come from different sources.
                      </p>
                      {swapIntelligence.routes.length > 1 && (
                        <div className="flex justify-between gap-2 items-start">
                          <span className="text-dark-400 shrink-0">Route heuristic (best)</span>
                          <span className="text-right text-dark-200 leading-snug">
                            {swapIntelligence.routes[0].dexName ?? swapIntelligence.routes[0].provider}
                            {typeof swapIntelligence.routeComparison?.savingsPercent === 'number' &&
                            swapIntelligence.routeComparison.savingsPercent > 0.01
                              ? ` · ~${swapIntelligence.routeComparison.savingsPercent.toFixed(2)}% vs alternatives`
                              : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-dark-500 leading-snug pt-2 border-t border-white/[0.05]">
                    {SWAP_SURFACE_COPY.quoteFeesFootnote}
                  </p>
                </div>
              )}
            </div>

            {/* Approval Notice — hidden in Phase 2 quote-only (execution impossible) */}
            {swapQuote.needsApproval && !isEthNativeV2QuoteOnlyNoExec && (
              <div className="flex items-center gap-2 p-2 bg-blue-900/20 rounded-lg mt-2 text-blue-400">
                <InfoIcon />
                <span className="text-xs">
                  Token approval required (2 transactions)
                </span>
              </div>
            )}
            {swapQuote.allowanceCheckUncertain && !isEthNativeV2QuoteOnlyNoExec && (
              <div className="flex items-center gap-2 p-2 bg-yellow-900/20 rounded-lg mt-2">
                <WarningIcon />
                <span className="text-yellow-400 text-xs">{SWAP_SURFACE_COPY.allowanceCheckUncertainHint}</span>
              </div>
            )}
          </div>
        )}

        {/* High Price Impact Warning — suppressed in Phase 2 quote-only so execution noise does not dominate */}
        {swapQuote &&
          !isEthNativeV2QuoteOnlyNoExec &&
          (() => {
          const n = parsePriceImpactPercentOrNaN(swapQuote.price_impact);
          return Number.isFinite(n) && n > 3;
        })() && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400 flex items-center gap-2">
            <WarningIcon />
            <span>High price impact! You may receive significantly less.</span>
          </div>
        )}

        {/* Error Display — avoid harsh banner while a good quote is still on screen */}
        {error &&
          status !== 'previewing' &&
          !isQuotePipelineLoading &&
          !(hasUsableQuote && swapQuote?.success) &&
          (routingDisplay.showUnsupportedPanel ? (
            <div className="mt-4 p-3 bg-amber-900/15 border border-amber-700/35 rounded-xl text-sm text-amber-100">
              <p className="font-medium text-amber-50">
                {commissionRouteIssueCopy.title}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-amber-100/90">
                {commissionRouteIssueCopy.helper}
              </p>
              <div className="mt-2">
                <CommissionRouteRecoveryChipsSection
                  ready={commissionUiChunkReady}
                  activeChainId={currentChainId}
                  fromAsset={fromAsset}
                  toAsset={toAsset}
                  onSelectPair={(from, to) => {
                    setShowFromSelector(false);
                    setShowToSelector(false);
                    setFromAsset(from);
                    setToAsset(to);
                    reset();
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400">
              {error}
            </div>
          ))}

        {/* Insufficient Balance Warning */}
        {insufficientBalanceForUi && (
          <div
            className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400 flex items-center gap-2"
            role="alert"
          >
            <WarningIcon />
            <span>Insufficient {fromAsset?.symbol} balance</span>
          </div>
        )}

        {insufficientGas && gasAffordability?.blockingMessage && !showPreview && (
          <div
            className="mt-4 p-3 bg-amber-950/40 border border-amber-700/50 rounded-xl text-sm text-amber-200/95 flex items-start gap-2"
            role="alert"
          >
            <WarningIcon />
            <span>{gasAffordability.blockingMessage}</span>
          </div>
        )}

        {quoteReadiness.state === 'QUOTE_READY_GAS_UNAVAILABLE' &&
          hasUsableQuote &&
          !insufficientGas &&
          !showPreview && (
            <div
              className="mt-3 px-3 py-2 rounded-lg border border-white/[0.06] bg-black/20 text-[11px] text-dark-400 leading-snug"
              role="status"
            >
              {quoteReadiness.publicLabel}. {quoteReadiness.helperText}
            </div>
          )}

        {/* Swap Button */}
        <FeaturedCommissionRoutes
          activeChainId={currentChainId}
          fromAsset={fromAsset}
          toAsset={toAsset}
          onSelectPair={(from, to) => {
            setShowFromSelector(false);
            setShowToSelector(false);
            setFromAsset(from);
            setToAsset(to);
            reset();
          }}
        />

        <div className="relative z-10 mt-4">
          <button
            id="swap-main-cta"
            onClick={() => void handleMainSwapAction()}
            disabled={isButtonDisabled()}
            className={mainCtaClassName}
            title={
              insufficientGas
                ? gasAffordability?.blockingMessage ?? mainCtaLabel
                : quoteReadiness.state === 'QUOTE_READY_GAS_UNAVAILABLE'
                  ? quoteReadiness.helperText ?? mainCtaLabel
                  : mainCtaLabel
            }
            aria-describedby="swap-main-cta-desc"
          >
            {ctaVisualState === 'loading' &&
            showSpinner &&
            status !== 'error' &&
            !hasUsableQuote ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                <span>{SWAP_SURFACE_COPY.gettingQuote}</span>
              </span>
            ) : (
              mainCtaLabel
            )}
          </button>
          <span id="swap-main-cta-desc" className="sr-only">
            {ctaSpec.reason}. {ctaSpec.nextStep}.
          </span>
          <p className="sr-only" aria-live="polite">
            {getTransactionLifecycleSpec(lifecycleState, { isConnected }).title}:{' '}
            {getTransactionLifecycleSpec(lifecycleState, { isConnected }).description}
          </p>
        </div>

        {/* Security Footer */}
        {isConnected && (
          <div className="relative z-10 mt-4 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 justify-center text-center max-w-md lg:max-w-xl 2xl:max-w-2xl mx-auto">
              <ShieldIcon />
              <p className="text-[11px] text-dark-400 leading-snug text-left">
                <span className="text-dark-300 font-medium">{SWAP_SURFACE_COPY.swapCardTrustCompact}</span>
                <span className="text-dark-500"> {SWAP_SURFACE_COPY.swapCardTrustMicroLine}</span>
                <span className="text-dark-500">
                  {' '}
                  <Link to="/trust" className="text-accent/80 hover:text-accent underline-offset-2 hover:underline">
                    Trust Center
                  </Link>
                </span>
              </p>
            </div>
            {termsAccepted && (
              <p className="mt-1 text-center text-[10px] text-dark-500">Terms accepted</p>
            )}
          </div>
        )}
      </div>

      {/* Terms / Privacy gate — must be accepted before first preview */}
      <TermsGateModal
        isOpen={showTermsGate}
        onClose={() => setShowTermsGate(false)}
        onAccept={handleTermsGateAccept}
        actionLabel="Accept & Continue"
      />

      {/* Swap Preview Modal — lazy chunk; loads on first preview open */}
      {showPreview && (
        <Suspense fallback={null}>
          <LazySwapPreviewModal
            isOpen={showPreview}
            quote={swapQuote}
            step={getModalStep()}
            error={error}
            txHash={txHash}
            explorerUrl={explorerUrl}
            receiptSettlement={receiptSettlement}
            approvalMode={approvalMode}
            chainId={currentChainId}
            walletProvider={provider}
            walletConnected={isConnected && !isReadOnly}
            onConfirm={handleConfirmSwap}
            onCancel={handleCancelPreview}
            onRefreshQuote={handleRefreshQuote}
            isRefreshing={isRefreshingQuote}
            quoteTtlSecondsRemaining={quoteSecondsRemaining}
            lifecycleFlowId={activeFlowId}
            fromLogoUrl={fromAsset?.logo_url}
            toLogoUrl={toAsset?.logo_url}
          />
        </Suspense>
      )}

      {showSavePreset && fromAsset && toAsset && (
        <SavePresetModal
          isOpen={showSavePreset}
          onClose={() => setShowSavePreset(false)}
          fromAsset={fromAsset}
          toAsset={toAsset}
          fromAmount={fromAmount}
          slippage={slippage}
        />
      )}

      {transactionDetailsDialog}
    </>
  );
}

type CommissionRouteUiProps = {
  ready: boolean;
  activeChainId: number;
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
};

function CommissionRouteRecoveryPanelSection(props: CommissionRouteUiProps) {
  if (!props.ready) return null;
  return (
    <Suspense fallback={lazyCommissionRoutesFallback}>
      <LazyCommissionRouteRecoveryPanel
        activeChainId={props.activeChainId}
        fromAsset={props.fromAsset}
        toAsset={props.toAsset}
        onSelectPair={props.onSelectPair}
      />
    </Suspense>
  );
}

function CommissionRouteRecoveryChipsSection(props: CommissionRouteUiProps) {
  if (!props.ready) return null;
  return (
    <Suspense fallback={null}>
      <LazyCommissionRouteRecoveryChips
        activeChainId={props.activeChainId}
        fromAsset={props.fromAsset}
        toAsset={props.toAsset}
        onSelectPair={props.onSelectPair}
      />
    </Suspense>
  );
}

// Token Button Component
function TokenButton({
  asset,
  chainId,
  onClick,
}: {
  asset: AssetInfo | null;
  chainId: number;
  onClick: () => void;
}) {
  const kind = asset ? nativeWrappedBadgeKind(asset, chainId) : null;
  const secondaryMeta =
    asset &&
    (kind === 'native'
      ? `${asset.name} · Native`
      : kind === 'wrapped'
        ? `${asset.name} · Wrapped`
        : asset.name);
  const title = asset
    ? `${asset.symbol} — ${asset.name}${
        kind === 'native' ? ' — Native (chain gas token)' : kind === 'wrapped' ? ' — Wrapped native' : ''
      }`
    : 'Select token';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-3 px-3 py-2.5 sm:py-3 min-h-[3.25rem] bg-electro-panel/80 rounded-xl hover:bg-electro-panelHover transition-all duration-200 border border-white/[0.06] hover:border-white/[0.1] min-w-0 w-full sm:w-auto sm:max-w-[14rem] ring-1 ring-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
    >
      <SwapTokenAvatar
        symbol={asset?.symbol}
        logoUrl={asset?.logo_url}
        chainId={chainId}
        size="lg"
      />
      <div className="flex flex-col items-start min-w-0 flex-1 text-left gap-0.5">
        <span className="text-base sm:text-[15px] font-semibold leading-tight tracking-tight truncate w-full">
          {asset?.symbol || 'Select'}
        </span>
        {asset && secondaryMeta && (
          <span
            className={`text-[11px] leading-snug truncate w-full ${
              kind === 'native' ? 'text-emerald-400/85' : kind === 'wrapped' ? 'text-dark-400' : 'text-dark-400'
            }`}
          >
            {secondaryMeta}
          </span>
        )}
      </div>
      <ChevronDownIcon />
    </button>
  );
}

// Extended AssetInfo type for custom tokens
interface ExtendedAssetInfo extends AssetInfo {
  isCustom?: boolean;
  verified?: boolean;
  warning?: string;
}

function routeSupportBadgeClass(status: RouteSupportStatus): string {
  switch (status) {
    case 'supported':
      return 'bg-emerald-900/40 text-emerald-100 border-emerald-700/35';
    case 'likely_supported':
      return 'bg-sky-900/35 text-sky-100 border-sky-700/35';
    case 'limited':
      return 'bg-amber-900/40 text-amber-100 border-amber-700/35';
    default:
      return 'bg-dark-600/70 text-dark-400 border-white/[0.08]';
  }
}

// Token Selector Dropdown with import functionality
function TokenSelectorDropdown({
  assets,
  selectedAsset,
  excludeAsset,
  onSelect,
  onClose,
  chainId,
  provider,
  onAddToken,
  onRemoveToken,
  showFavorites = false,
}: {
  assets: ExtendedAssetInfo[];
  selectedAsset: AssetInfo | null;
  excludeAsset: AssetInfo | null;
  onSelect: (asset: AssetInfo) => void;
  onClose: () => void;
  chainId?: number;
  provider?: unknown;
  onAddToken?: (token: CustomToken) => void;
  onRemoveToken?: (chainId: number, address: string) => void;
  showFavorites?: boolean;
}) {
  const { isFavorite, toggleFavorite } = useFavoriteTokensStore();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedToken, setImportedToken] = useState<CustomToken | null>(null);
  const [customTokenRiskAck, setCustomTokenRiskAck] = useState(false);
  const swapChainForImport = chainId != null && isSwapEnabledNetwork(chainId);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Check if search query is a contract address
  const isContractAddress = searchQuery.length === 42 && searchQuery.startsWith('0x') && isAddress(searchQuery);

  // Check if token already exists
  const tokenExists = isContractAddress && assets.some(
    a => a.contract_address?.toLowerCase() === searchQuery.toLowerCase()
  );

  // Check if it's a static token (can't be removed)
  const isStatic = isContractAddress && chainId && isStaticToken(searchQuery, chainId);

  // Validate and import token
  const handleImportToken = async () => {
    if (!provider || !chainId || !onAddToken) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const result = await validateToken(searchQuery, chainId, provider);

      if (result.success && result.token) {
        setImportedToken(result.token);
      } else {
        setImportError(result.error || 'Failed to import token');
      }
    } catch (err) {
      setImportError('Failed to validate token');
    } finally {
      setIsImporting(false);
    }
  };

  // Confirm adding the imported token
  const handleConfirmImport = () => {
    if (importedToken && onAddToken && customTokenRiskAck) {
      onAddToken(importedToken);
      // Convert to AssetInfo and select it
      const assetInfo: AssetInfo = {
        symbol: importedToken.symbol,
        name: importedToken.name,
        chain: CHAIN_NAMES[importedToken.chainId] || 'ethereum',
        decimals: importedToken.decimals,
        is_native: false,
        contract_address: importedToken.address,
      };
      onSelect(assetInfo);
      setImportedToken(null);
      setCustomTokenRiskAck(false);
      setSearchQuery('');
    }
  };

  // Filter tokens by search query
  const filteredAssets = useMemo(() => {
    let result = assets.filter((asset) =>
      asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.contract_address?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const cid = chainId ?? 0;
    result = [...result].sort((a, b) => {
      if (showFavorites && chainId) {
        const aFav = isFavorite(chainId, a.contract_address || '');
        const bFav = isFavorite(chainId, b.contract_address || '');
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
      }
      if (cid === 1 || cid === 56) {
        const sa = getTokenRouteSupport(cid, {
          symbol: a.symbol,
          contract_address: a.contract_address,
          isCustom: (a as ExtendedAssetInfo).isCustom,
        });
        const sb = getTokenRouteSupport(cid, {
          symbol: b.symbol,
          contract_address: b.contract_address,
          isCustom: (b as ExtendedAssetInfo).isCustom,
        });
        const byRoute = compareRouteSupport(sa, sb);
        if (byRoute !== 0) return byRoute;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    return result;
  }, [assets, searchQuery, showFavorites, chainId, isFavorite]);

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 mt-2 w-[min(320px,calc(100vw-2rem))] bg-electro-panel/95 backdrop-blur-glass rounded-glass shadow-glass border border-white/[0.08] py-2 z-[60]"
    >
      {/* Search Input */}
      <div className="px-3 pb-2 mb-2 border-b border-dark-700">
        {chainId != null && !swapChainForImport && (
          <p className="text-[10px] text-amber-200/90 mb-2 leading-snug">
            {SWAP_SURFACE_COPY.customTokenImportBlockedNonSwapChain}
          </p>
        )}
        <input
          id="token-search"
          name="token-search"
          type="text"
          placeholder="Search or paste contract address..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setImportError(null);
            setImportedToken(null);
          }}
          className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary-500"
          autoFocus
        />
      </div>

      {/* Import Token Section - shown when contract address is detected */}
      {isContractAddress && !tokenExists && !isStatic && !!provider && chainId && onAddToken && swapChainForImport && (
        <div className="px-3 pb-3 mb-2 border-b border-dark-700">
          {importedToken ? (
            // Show imported token details for confirmation with security data
            <div className="bg-dark-700 rounded-lg p-3">
              {/* Token Header */}
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-dark-600">
                <SwapTokenAvatar
                  symbol={importedToken.symbol}
                  logoUrl={importedToken.logoURI}
                  chainId={importedToken.chainId}
                  size="lg"
                />
                <div className="flex-1">
                  <div className="font-medium text-lg">{importedToken.symbol}</div>
                  <div className="text-xs text-dark-400">{importedToken.name}</div>
                </div>
              </div>

              {/* Security Signals */}
              <div className="mb-3">
                <div className="text-xs text-dark-400 mb-1.5">Security Check</div>
                <TokenSafetyBadges
                  contractAddress={importedToken.address}
                  chainId={importedToken.chainId}
                  compact={true}
                  showDisclaimer={false}
                />
              </div>

              {/* Liquidity Warning (from pool check) */}
              {importedToken.warning && (
                <div className="text-xs text-yellow-400 mb-2 flex items-center gap-1 bg-yellow-900/20 px-2 py-1.5 rounded">
                  <WarningIcon />
                  {importedToken.warning}
                </div>
              )}

              {/* Contract Address */}
              <div className="text-xs text-dark-400 mb-3 font-mono truncate bg-dark-800 px-2 py-1 rounded">
                {importedToken.address}
              </div>

              {/* Disclaimer + risk acknowledgement */}
              <div className="text-[10px] text-dark-500 mb-2 leading-relaxed">
                Security data is informational only, not financial advice. Custom tokens are not verified by Kobbex.
              </div>
              <label className="flex items-start gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customTokenRiskAck}
                  onChange={(e) => setCustomTokenRiskAck(e.target.checked)}
                  className="mt-0.5 rounded border-dark-600"
                />
                <span className="text-[11px] text-dark-300 leading-snug">
                  {SWAP_SURFACE_COPY.customTokenRiskAckLabel}
                </span>
              </label>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setImportedToken(null);
                    setCustomTokenRiskAck(false);
                  }}
                  className="flex-1 px-3 py-1.5 bg-dark-600 rounded text-sm hover:bg-dark-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={!customTokenRiskAck}
                  className="flex-1 px-3 py-1.5 bg-primary-600 rounded text-sm hover:bg-primary-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import Token
                </button>
              </div>
            </div>
          ) : (
            // Show import button
            <button
              onClick={handleImportToken}
              disabled={isImporting}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary-600/20 text-primary-400 rounded-lg hover:bg-primary-600/30 transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <LoadingSpinner />
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <PlusIcon />
                  <span>Import Token</span>
                </>
              )}
            </button>
          )}
          {importError && (
            <div className="mt-2 text-xs text-red-400 text-center">
              {importError}
            </div>
          )}
        </div>
      )}

      {/* Token already exists message */}
      {isContractAddress && tokenExists && (
        <div className="px-3 pb-2 mb-2 text-xs text-dark-400 text-center">
          Token already in list
        </div>
      )}

      {/* Token List */}
      <div className="max-h-72 overflow-y-auto scrollbar-thin">
        {filteredAssets.length === 0 ? (
          <div className="px-4 py-3 text-center text-dark-400 text-sm">
            {isContractAddress ? 'Token not found - import above' : 'No tokens found'}
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isSelected = asset.symbol === selectedAsset?.symbol &&
              asset.contract_address?.toLowerCase() === selectedAsset?.contract_address?.toLowerCase();
            const isExcluded = asset.symbol === excludeAsset?.symbol &&
              asset.contract_address?.toLowerCase() === excludeAsset?.contract_address?.toLowerCase();
            const isCustom = (asset as ExtendedAssetInfo).isCustom;
            const verified = (asset as ExtendedAssetInfo).verified;

            const isFav = showFavorites && chainId && isFavorite(chainId, asset.contract_address || '');
            const nativeWrapped =
              chainId != null ? nativeWrappedBadgeKind(asset, chainId) : null;
            const routeStatus: RouteSupportStatus =
              chainId != null
                ? getTokenRouteSupport(chainId, {
                    symbol: asset.symbol,
                    contract_address: asset.contract_address,
                    isCustom: isCustom,
                  })
                : 'unknown';
            const routeDimmed = routeStatus === 'limited' || routeStatus === 'unknown';

            return (
              <div
                key={`${asset.symbol}-${asset.contract_address}`}
                onClick={() => !isExcluded && onSelect(asset)}
                className={`w-full min-h-[3.25rem] px-4 py-3 text-left transition-colors flex items-center gap-3 cursor-pointer ${
                  isSelected
                    ? 'bg-primary-600/20 text-primary-400'
                    : isExcluded
                    ? 'opacity-50 cursor-not-allowed'
                    : routeDimmed
                      ? 'opacity-[0.88] hover:bg-dark-700'
                      : 'hover:bg-dark-700'
                }`}
              >
                {/* Favorite Star Button */}
                {showFavorites && chainId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite({
                        symbol: asset.symbol,
                        address: asset.contract_address || '',
                        name: asset.name,
                        chainId: chainId,
                      });
                    }}
                    className={`p-1 transition-colors flex-shrink-0 ${
                      isFav
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-dark-500 hover:text-yellow-400'
                    }`}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <StarIcon filled={!!isFav} />
                  </button>
                )}
                <SwapTokenAvatar
                  symbol={asset.symbol}
                  logoUrl={asset.logo_url}
                  chainId={chainId}
                  size="md"
                  showChainBadge={false}
                />
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium truncate">{asset.symbol}</span>
                    {nativeWrapped === 'native' && (
                      <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-emerald-900/35 text-emerald-400/95 flex-shrink-0">
                        Native
                      </span>
                    )}
                    {nativeWrapped === 'wrapped' && (
                      <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-dark-600/80 text-dark-300 flex-shrink-0">
                        Wrapped
                      </span>
                    )}
                    {chainId != null && (
                      <span
                        className={`text-[9px] font-medium tracking-wide px-1 py-0.5 rounded border flex-shrink-0 ${routeSupportBadgeClass(routeStatus)}`}
                        title={routeSupportBadgeTooltip(routeStatus)}
                      >
                        {getRouteSupportLabel(routeStatus)}
                      </span>
                    )}
                    {isFav && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-900/30 text-yellow-400 flex-shrink-0">
                        Fav
                      </span>
                    )}
                    {!isCustom &&
                      chainId &&
                      asset.contract_address &&
                      isStaticToken(asset.contract_address, chainId) && (
                        <span
                          className="text-[10px] px-1 py-0.5 rounded flex-shrink-0 bg-emerald-900/30 text-emerald-400/95"
                          title="Kobbex curated list — verify contracts on an explorer before large trades."
                        >
                          Listed
                        </span>
                      )}
                    {isCustom && (
                      <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${
                        verified
                          ? 'bg-blue-900/30 text-blue-400'
                          : 'bg-yellow-900/30 text-yellow-400'
                      }`}>
                        {verified ? 'Imported' : 'Unverified'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-dark-400 truncate">{asset.name}</div>
                </div>
                {isSelected && <CheckIcon />}
                {/* Remove button for custom tokens */}
                {isCustom && onRemoveToken && chainId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveToken(chainId, asset.contract_address || '');
                    }}
                    className="p-1 text-dark-400 hover:text-red-400 transition-colors flex-shrink-0"
                    title="Remove token"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Plus Icon for import button
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

// Trash Icon for remove button
function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

// Star Icon for favorites
function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="w-4 h-4" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

// Slippage Settings Component
function SlippageSettings({
  value,
  customValue,
  onChange,
  onCustomChange,
  approvalMode,
  onApprovalModeChange,
  routeMode,
  onRouteModeChange,
  chainId,
  onClose,
}: {
  value: number;
  customValue: string;
  onChange: (v: number) => void;
  onCustomChange: (v: string) => void;
  approvalMode: ApprovalMode;
  onApprovalModeChange: (mode: ApprovalMode) => void;
  routeMode: QuoteRouteMode;
  onRouteModeChange: (mode: QuoteRouteMode) => void;
  chainId: number;
  onClose: () => void;
}) {
  const presets = [0.1, 0.5, 1.0];
  const isCustom = !presets.includes(value);
  const commissionRequired = isCommissionRequiredMode();
  const showCommissionRequired = commissionRequired && (import.meta.env.DEV || isDebugMode());

  const routeModeOptions = useMemo(() => {
    const opts: { mode: QuoteRouteMode; label: string }[] = [
      { mode: 'best', label: 'Best' },
      { mode: '1inch', label: '1inch' },
      { mode: 'uniswap-v3', label: 'Uniswap' },
      { mode: 'pancakeswap-v3', label: 'Pancake' },
    ];
    if (chainId === 56 && getPancakeWrapperV2Config().enabled) {
      opts.push({ mode: 'pancakeswap-v3-wrapper-v2', label: 'Pancake V2 wrap' });
    }
    if (chainId === 1 && getUniswapWrapperV2Config().enabled) {
      opts.push({ mode: 'uniswap-v3-wrapper-v2', label: 'Uniswap V2 wrap' });
    }
    return opts;
  }, [chainId]);

  return (
    <div className="relative z-10 mb-4 p-4 bg-electro-bgAlt/80 rounded-glass-sm border border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium text-white">Swap Settings</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <CloseIcon />
        </button>
      </div>

      {/* Route preference */}
      <div className="mb-4">
        <span className="text-sm text-dark-300 mb-2 block">{SWAP_SURFACE_COPY.routePreferenceLabel}</span>
        {showCommissionRequired && (
          <div className="mb-2 text-[11px] text-yellow-300/90">
            Commission required mode: enabled
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {routeModeOptions.map(({ mode, label }) => {
            const disabled = isQuoteRouteModeDisabled(mode, chainId);
            const active = routeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                title={
                  disabled
                    ? 'Not available on this network'
                    : formatQuoteRoutePreferenceLabel(mode)
                }
                onClick={() => onRouteModeChange(mode)}
                className={`px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200 truncate ${
                  disabled
                    ? 'opacity-40 cursor-not-allowed bg-dark-800 text-dark-500'
                    : active
                      ? 'bg-accent text-electro-bg'
                      : 'bg-electro-panel hover:bg-electro-panelHover border border-white/[0.06] text-dark-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-dark-500 mt-2 leading-snug">
          Best price compares routes. Fixed options execute only on that venue — no silent fallback.
        </p>
      </div>

      {/* Slippage tolerance */}
      <div className="mb-4">
        <span className="text-sm text-dark-300 mb-2 block">Slippage tolerance</span>
        <div className="flex gap-2 mb-2">
          {presets.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onChange(opt);
                onCustomChange('');
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                value === opt
                  ? 'bg-accent text-electro-bg font-medium'
                  : 'bg-electro-panel hover:bg-electro-panelHover border border-white/[0.06]'
              }`}
            >
              {opt}%
            </button>
          ))}

          {/* Custom Input */}
          <div className={`flex-1 flex items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200 ${
            isCustom ? 'bg-accent/10 border border-accent/30' : 'bg-electro-panel border border-white/[0.06]'
          }`}>
            <input
              id="slippage-custom"
              name="slippage-custom"
              type="text"
              placeholder="Custom"
              value={customValue}
              onChange={(e) => onCustomChange(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
            <span className="text-dark-400">%</span>
          </div>
        </div>

        {/* Slippage Warnings */}
        {value < 0.1 && (
          <p className="text-xs text-yellow-400">
            Very low slippage may cause transaction to fail
          </p>
        )}
        {value >= 3 && value < 10 && (
          <p className="text-xs text-yellow-400">
            High slippage may result in unfavorable trade
          </p>
        )}
        {value >= 10 && (
          <p className="text-xs text-red-400">
            Very high slippage! Only use for volatile tokens
          </p>
        )}
      </div>

      {/* Approval Mode */}
      <div>
        <span className="text-sm text-dark-300 mb-2 block">Token Approval</span>
        <div className="flex gap-2">
          <button
            onClick={() => onApprovalModeChange('exact')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
              approvalMode === 'exact'
                ? 'bg-accent text-electro-bg font-medium'
                : 'bg-electro-panel hover:bg-electro-panelHover border border-white/[0.06]'
            }`}
          >
            Exact
          </button>
          <button
            onClick={() => onApprovalModeChange('unlimited')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
              approvalMode === 'unlimited'
                ? 'bg-accent text-electro-bg font-medium'
                : 'bg-electro-panel hover:bg-electro-panelHover border border-white/[0.06]'
            }`}
          >
            Unlimited
          </button>
        </div>
        <p className={`text-xs mt-2 ${approvalMode === 'unlimited' ? 'text-yellow-400' : 'text-dark-500'}`}>
          {approvalMode === 'exact'
            ? 'Approves only the exact amount needed for this swap (safer).'
            : 'Approves unlimited spending for this token. Saves gas on future swaps but grants permanent access to the router contract.'}
        </p>
      </div>
    </div>
  );
}

// Loading Spinner
function LoadingSpinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-dark-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

// Icons
function SaveIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-4 h-4 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

// Route Tooltip - Explains why this route was chosen
function RouteTooltip({ provider }: { provider: string }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="text-dark-400 hover:text-dark-300"
        aria-label="Route explanation"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-dark-700 rounded-lg text-xs text-white w-64 shadow-lg z-50">
          <div className="font-medium mb-1">Why this route?</div>
          <div className="text-dark-300 leading-relaxed">{getRouteExplanation(provider)}</div>
          <div className="text-dark-400 mt-2 pt-2 border-t border-dark-600 leading-relaxed space-y-1.5">
            <p>Quotes are short-lived (30s). If the timer expires, refresh quote before you confirm in your wallet.</p>
            <p>Gas limits and network fees in the quote panel are estimates — your wallet finalizes them when you sign.</p>
            <p className="text-dark-500">Advanced route ID: {getRouteSupportIdentifier(provider)}</p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-dark-700" />
        </div>
      )}
    </div>
  );
}

// Provider Badge - Visual indicator for DEX provider
function ProviderBadge({ provider }: { provider: string }) {
  const getProviderStyle = () => {
    const short = getRouteShortName(provider);
    switch (provider) {
      case '1inch':
        return { bg: 'bg-red-900/30', text: 'text-red-400', label: short };
      case 'uniswap-v3':
        return { bg: 'bg-pink-900/30', text: 'text-pink-400', label: short };
      case 'uniswap-v3-wrapper':
      case 'uniswap-v3-wrapper-v2':
      case 'uniswap-v3-wrapper-v3':
        return { bg: 'bg-pink-900/30', text: 'text-pink-200', label: getRouteDisplayName(provider) };
      case 'pancakeswap-v3':
        return { bg: 'bg-yellow-900/30', text: 'text-yellow-400', label: short };
      case 'pancakeswap-v3-wrapper':
      case 'pancakeswap-v3-wrapper-v2':
        return { bg: 'bg-yellow-900/30', text: 'text-yellow-200', label: getRouteDisplayName(provider) };
      default:
        return { bg: 'bg-primary-900/30', text: 'text-primary-400', label: getRouteDisplayName(provider) };
    }
  };

  const style = getProviderStyle();

  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

// Quick Swap Presets - Common trading pairs for 1-click selection
function QuickSwapPresets({
  chainId,
  tokens,
  onSelect,
}: {
  chainId: number;
  tokens: AssetInfo[];
  onSelect: (from: string, to: string) => void;
}) {
  // Define presets per chain (native token + major stablecoins)
  const CHAIN_PRESETS: Record<number, { label: string; from: string; to: string; icon: string }[]> = {
    1: [
      { label: 'Sell ETH', from: 'ETH', to: 'USDT', icon: '📉' },
      { label: 'Buy ETH', from: 'USDT', to: 'ETH', icon: '📈' },
      { label: 'Exit to Stable', from: 'ETH', to: 'USDC', icon: '🛡️' },
    ],
    56: [
      { label: 'Sell BNB', from: 'BNB', to: 'USDT', icon: '📉' },
      { label: 'Buy BNB', from: 'USDT', to: 'BNB', icon: '📈' },
      { label: 'Exit to Stable', from: 'BNB', to: 'USDC', icon: '🛡️' },
    ],
    137: [
      { label: 'Sell MATIC', from: 'MATIC', to: 'USDC', icon: '📉' },
      { label: 'Buy MATIC', from: 'USDC', to: 'MATIC', icon: '📈' },
      { label: 'Exit to Stable', from: 'MATIC', to: 'USDT', icon: '🛡️' },
    ],
    42161: [
      { label: 'Sell ETH', from: 'ETH', to: 'USDC', icon: '📉' },
      { label: 'Buy ETH', from: 'USDC', to: 'ETH', icon: '📈' },
      { label: 'Exit to Stable', from: 'ETH', to: 'USDT', icon: '🛡️' },
    ],
    10: [
      { label: 'Sell ETH', from: 'ETH', to: 'USDC', icon: '📉' },
      { label: 'Buy ETH', from: 'USDC', to: 'ETH', icon: '📈' },
      { label: 'Exit to Stable', from: 'ETH', to: 'USDT', icon: '🛡️' },
    ],
    43114: [
      { label: 'Sell AVAX', from: 'AVAX', to: 'USDC', icon: '📉' },
      { label: 'Buy AVAX', from: 'USDC', to: 'AVAX', icon: '📈' },
      { label: 'Exit to Stable', from: 'AVAX', to: 'USDT', icon: '🛡️' },
    ],
    100: [
      { label: 'Sell xDAI', from: 'xDAI', to: 'USDC', icon: '📉' },
      { label: 'Buy GNO', from: 'xDAI', to: 'GNO', icon: '📈' },
    ],
    250: [
      { label: 'Sell FTM', from: 'FTM', to: 'USDC', icon: '📉' },
      { label: 'Buy FTM', from: 'USDC', to: 'FTM', icon: '📈' },
      { label: 'Exit to Stable', from: 'FTM', to: 'DAI', icon: '🛡️' },
    ],
    8453: [
      { label: 'Sell ETH', from: 'ETH', to: 'USDC', icon: '📉' },
      { label: 'Buy ETH', from: 'USDC', to: 'ETH', icon: '📈' },
    ],
  };

  const presets = CHAIN_PRESETS[chainId] || CHAIN_PRESETS[1];

  // Only show presets if tokens are available
  const hasTokens = presets.every(
    (p) => tokens.some((t) => t.symbol === p.from) && tokens.some((t) => t.symbol === p.to)
  );

  if (!hasTokens) return null;

  // Collapsed by default: keeps the main swap card focused on the active swap.
  // Power-user shortcut chips (Sell/Buy/Exit to Stable) remain one click away.
  return (
    <details className="group relative z-10 mb-3 rounded-lg border border-white/[0.06] bg-white/[0.03]">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-dark-300 hover:text-dark-100 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          <span className="text-[10px] uppercase tracking-wider text-dark-500 shrink-0">
            Quick swap
          </span>
          <span className="text-dark-600 shrink-0">·</span>
          <span className="truncate text-dark-400">
            {presets.length} shortcut{presets.length === 1 ? '' : 's'}
          </span>
        </span>
        <span
          className="text-dark-500 shrink-0 text-[10px] transition-transform group-open:rotate-180"
          aria-hidden
        >
          ▾
        </span>
      </summary>
      <div className="flex gap-2 px-3 pb-3 pt-1 overflow-x-auto">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => onSelect(preset.from, preset.to)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-electro-bgAlt/60 hover:bg-electro-panel rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap border border-white/[0.04] hover:border-white/[0.08]"
            title={`${preset.from} → ${preset.to}`}
          >
            <span>{preset.icon}</span>
            <span className="text-gray-400">{preset.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

export default SwapInterface;
