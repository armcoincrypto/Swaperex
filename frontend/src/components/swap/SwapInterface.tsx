/**
 * Swap Interface Component
 *
 * Main swap UI with token selection, amount input, and preview flow.
 * ALL signing happens client-side via the connected wallet.
 *
 * Flow: Enter amount → Get quote → Preview → Confirm in wallet → Success
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useSwap } from '@/hooks/useSwap';
import { useSwapStore } from '@/stores/swapStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { useCustomTokenStore, type CustomToken } from '@/stores/customTokenStore';
import { useFavoriteTokensStore } from '@/stores/favoriteTokensStore';
import { usePresetStore, type SwapPreset, type GuardEvaluation } from '@/stores/presetStore';
import { PresetDropdown } from '@/components/presets/PresetDropdown';
import { SavePresetModal } from '@/components/presets/SavePresetModal';
import { GuardWarningPanel } from '@/components/presets/GuardWarningPanel';
import { SwapIntelligencePanel } from '@/components/swap/intelligence';
import { evaluatePresetGuards } from '@/services/presetGuardService';
import { TokenSafetyBadges } from '@/components/common/TokenSafetyBadges';
import { SwapPreviewModal, SwapStep } from './SwapPreviewModal';
import { formatBalance, formatPercent } from '@/utils/format';
import { getPopularTokens, isNativeToken, isStaticToken, type Token } from '@/tokens';
import { validateToken } from '@/services/tokenValidation';
import { analyzeSwapFromContext, type SwapIntelligence } from '@/services/dex';
import type { AssetInfo } from '@/types/api';
import { isAddress } from 'ethers';

// Chain ID to chain name mapping
const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
};

// Gas buffer for native tokens (to leave enough for transaction fees)
// Use smaller of: fixed buffer OR 5% of balance
const GAS_BUFFER_FIXED: Record<number, number> = {
  1: 0.005,   // ETH - leave max 0.005 ETH for gas
  56: 0.002,  // BNB - leave max 0.002 BNB for gas
  137: 0.5,   // MATIC - leave max 0.5 MATIC for gas
};
const GAS_BUFFER_PERCENT = 0.05; // 5% of balance as minimum buffer

// Minimum output value in USD to prevent dust swaps
// DISABLED: We don't have USD prices for all tokens, so this check was incorrect
// const MIN_OUTPUT_USD = 0.01;

// Debounce delay for quote fetching (ms)
const QUOTE_DEBOUNCE_MS = 500;

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

export function SwapInterface() {
  const { isConnected, address, isWrongChain, chainId, provider } = useWallet();
  const { getTokenBalance } = useBalanceStore();
  const { getTokens: getCustomTokens, addToken: addCustomToken, removeToken: removeCustomToken } = useCustomTokenStore();

  // Get available tokens for current chain (static + custom)
  const currentChainId = chainId || 1;
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
    swap,
    confirmSwap,
    cancelPreview,
    fetchSwapQuote,
    reset,
  } = useSwap();

  const {
    fromAsset,
    toAsset,
    fromAmount,
    slippage,
    setFromAsset,
    setToAsset,
    setFromAmount,
    setSlippage,
    swapAssets,
    isQuoting,
    quoteError,
    clearQuote,
  } = useSwapStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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

  // Delayed spinner - wait 250ms before showing spinner (Uniswap-style UX)
  // If quote resolves fast, spinner never appears = feels instant
  const SPINNER_DELAY_MS = 250;
  useEffect(() => {
    const isFetching = isQuoting || status === 'fetching_quote';

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
  }, [isQuoting, status]);

  // Quote expiry countdown - updates every second when quote is active
  useEffect(() => {
    // Only run countdown when we have a quote with timestamp
    if (!swapQuote?.quoteTimestamp || status !== 'previewing') {
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
          parseFloat(swapQuote.price_impact || '0'),
          currentChainId,
          slippage
        );
        setSwapIntelligence(intelligence);
      } catch (err) {
        console.warn('[Intelligence] Failed to analyze swap:', err);
        // Don't block the swap if intelligence fails
      }
    };

    computeIntelligence();
  }, [swapQuote, fromAsset, toAsset, fromAmount, status, currentChainId, slippage]);

  // Get balance for selected asset
  const getBalance = useCallback((asset: AssetInfo | null): string => {
    if (!asset || !address) return '0.00';
    const tokenBalance = getTokenBalance(asset.chain, asset.symbol);
    return tokenBalance?.balance || '0.00';
  }, [getTokenBalance, address]);

  // Check for insufficient balance
  const fromBalance = getBalance(fromAsset);
  const insufficientBalance = fromAmount &&
    parseFloat(fromAmount) > 0 &&
    parseFloat(fromAmount) > parseFloat(fromBalance);

  // Calculate MAX amount (subtract gas buffer for native tokens)
  const getMaxAmount = useCallback((): string => {
    const balance = parseFloat(fromBalance);
    if (balance <= 0) return '0';

    // If sending native token, subtract gas buffer
    if (fromAsset?.is_native) {
      // Use smaller of: fixed buffer OR 5% of balance
      const fixedBuffer = GAS_BUFFER_FIXED[currentChainId] || 0.005;
      const percentBuffer = balance * GAS_BUFFER_PERCENT;
      const gasBuffer = Math.min(fixedBuffer, percentBuffer);

      // Ensure we leave at least something for gas, but use 90% if balance is tiny
      const maxAmount = balance > gasBuffer ? balance - gasBuffer : balance * 0.9;

      // Format to reasonable precision (avoid scientific notation)
      return maxAmount > 0 ? maxAmount.toFixed(8).replace(/\.?0+$/, '') : '0';
    }

    // For ERC20 tokens, use full balance
    return fromBalance;
  }, [fromBalance, fromAsset, currentChainId]);

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
      if (status === 'idle' || status === 'fetching_quote') {
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
      console.log('[Swap] Fetching quote for:', fromAmount, fromAsset.symbol, '→', toAsset.symbol);
      fetchSwapQuote().catch((err) => {
        console.warn('[Swap] Quote fetch failed:', err.message);
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
  }, [fromAmount, fromAsset, toAsset, isConnected, fetchSwapQuote, clearQuote]);

  // Token selection handlers
  const handleFromTokenSelect = useCallback((asset: AssetInfo) => {
    if (asset.symbol === toAsset?.symbol) {
      swapAssets();
    } else {
      setFromAsset(asset);
    }
    setShowFromSelector(false);
  }, [toAsset, setFromAsset, swapAssets]);

  const handleToTokenSelect = useCallback((asset: AssetInfo) => {
    if (asset.symbol === fromAsset?.symbol) {
      swapAssets();
    } else {
      setToAsset(asset);
    }
    setShowToSelector(false);
  }, [fromAsset, setToAsset, swapAssets]);

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
    if (!swapQuote || !swapQuote.amountOutFormatted) return;
    if (status !== 'previewing') return;

    // Reset the skip confirmation flag
    setSkipConfirmationActive(false);

    // Auto-execute the swap
    console.log('[Swap] Skip confirmation active - auto-executing swap');
    swap()
      .then(() => {
        // Directly confirm without showing preview
        confirmSwap();
      })
      .catch((err) => {
        console.warn('[Swap] Auto-execute failed:', err);
      });
  }, [skipConfirmationActive, swapQuote, status, swap, confirmSwap]);

  // Open preview modal - ONLY if quote is valid and fresh
  const handlePreviewSwap = async () => {
    // Guard: Must have valid input
    const amount = parseFloat(fromAmount || '0');
    if (!fromAmount || isNaN(amount) || amount <= 0) {
      console.warn('[Swap] Preview blocked - no valid input amount');
      return;
    }

    // Guard: Must have a quote with output
    if (!swapQuote || !swapQuote.amountOutFormatted || parseFloat(swapQuote.amountOutFormatted) <= 0) {
      console.warn('[Swap] Preview blocked - no valid quote');
      return;
    }

    // Guard: Status must be previewing (quote ready)
    if (status !== 'previewing') {
      console.warn('[Swap] Preview blocked - status is not previewing:', status);
      return;
    }

    try {
      await swap();
      setShowPreview(true);
    } catch (err) {
      // Error handled in useSwap
    }
  };

  // Confirm swap from preview modal
  const handleConfirmSwap = async () => {
    try {
      await confirmSwap();
    } catch (err) {
      // Error handled in useSwap
    }
  };

  // Cancel preview or close success modal
  const handleCancelPreview = () => {
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
  }, [setFromAsset, setToAsset, setFromAmount, setSlippage, markPresetUsed]);

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

  // Map swap status to modal step
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

  // Get button text
  const getButtonText = (): string => {
    if (!isConnected) return 'Connect Wallet';
    if (isWrongChain) return 'Wrong Network';
    if (!fromAmount || parseFloat(fromAmount) === 0) return 'Enter Amount';
    if (insufficientBalance) return `Insufficient ${fromAsset?.symbol || ''} Balance`;
    if (isQuoting || status === 'fetching_quote') return 'Getting Quote...';
    if (quoteError) return 'Quote Error - Try Again';
    if (!swapQuote && fromAmount && parseFloat(fromAmount) > 0) return 'Getting Quote...';
    // Show blocked state if hard guards fail
    if (guardEvaluation?.blocked && !guardsDismissed) return 'Blocked by Protection';
    return 'Preview Swap';
  };

  // Check if button should be disabled
  const isButtonDisabled = (): boolean => {
    if (!isConnected) return true;
    if (isWrongChain) return true;
    if (!fromAmount || parseFloat(fromAmount) === 0) return true;
    if (insufficientBalance) return true;
    if (isQuoting || status === 'fetching_quote') return true;
    if (quoteError) return true;
    // Must have a quote to proceed
    if (!swapQuote) return true;
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

  // Check if swap is ready (for glow effect)
  const isSwapReady = !isButtonDisabled() && swapQuote && status === 'previewing';

  // Render swap form
  return (
    <>
      <div className="w-full max-w-md mx-auto bg-electro-panel/90 backdrop-blur-glass rounded-glass p-4 border border-white/[0.08] shadow-glass relative overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-glass-gradient pointer-events-none" />
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Swap</h2>
          <div className="flex items-center gap-2">
            {/* Preset Dropdown */}
            {isConnected && (
              <PresetDropdown onSelectPreset={handlePresetSelect} />
            )}
            {/* Save Preset Button */}
            {isConnected && canSavePreset && (
              <button
                onClick={() => setShowSavePreset(true)}
                className="p-2 rounded-lg hover:bg-dark-800 transition-colors text-dark-400 hover:text-primary-400"
                title="Save as preset"
              >
                <SaveIcon />
              </button>
            )}
            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-dark-800 transition-colors"
              title="Settings"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <SlippageSettings
            value={slippage}
            customValue={customSlippage}
            onChange={setSlippage}
            onCustomChange={handleCustomSlippage}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Quick Swap Presets */}
        <QuickSwapPresets
          chainId={currentChainId}
          tokens={AVAILABLE_TOKENS}
          onSelect={(from, to) => {
            const fromToken = AVAILABLE_TOKENS.find((t) => t.symbol === from);
            const toToken = AVAILABLE_TOKENS.find((t) => t.symbol === to);
            if (fromToken) setFromAsset(fromToken);
            if (toToken) setToAsset(toToken);
          }}
        />

        {/* From Token */}
        <div className={`relative z-10 bg-electro-bgAlt/80 rounded-glass-sm p-4 mb-2 border transition-all duration-200 ${
          insufficientBalance ? 'border-danger/50 shadow-glow-danger' : 'border-white/[0.06] hover:border-white/[0.1]'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-400">You Pay</span>
            <span className={`text-sm ${insufficientBalance ? 'text-red-400' : 'text-dark-400'}`}>
              Balance: {formatBalance(fromBalance)}
              {isConnected && parseFloat(fromBalance) > 0 && (
                <button
                  onClick={() => {
                    const maxAmount = getMaxAmount();
                    if (parseFloat(maxAmount) > 0) {
                      setFromAmount(maxAmount);
                    }
                  }}
                  className="ml-2 text-primary-400 hover:text-primary-300"
                  title={fromAsset?.is_native ? 'Max (leaves small amount for gas)' : 'Use full balance'}
                >
                  MAX
                </button>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <TokenButton
                asset={fromAsset}
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
            <input
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
              className="flex-1 bg-transparent text-2xl font-medium text-right outline-none"
            />
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center -my-2 relative z-20">
          <button
            onClick={swapAssets}
            className="p-2.5 bg-electro-panel rounded-xl hover:bg-electro-panelHover transition-all duration-200 border-4 border-electro-bg hover:border-accent/20 group"
            title="Swap direction"
          >
            <div className="text-gray-400 group-hover:text-accent transition-colors">
              <SwapIcon />
            </div>
          </button>
        </div>

        {/* To Token */}
        <div className="relative z-10 bg-electro-bgAlt/80 rounded-glass-sm p-4 mt-2 border border-white/[0.06] hover:border-white/[0.1] transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-400">You Receive</span>
            <span className="text-sm text-dark-400">
              Balance: {formatBalance(getBalance(toAsset))}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <TokenButton
                asset={toAsset}
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
            <div className="flex-1 text-right">
              {showSpinner ? (
                <div className="flex items-center justify-end gap-2">
                  <LoadingSpinner />
                  <span className="text-dark-400">Getting quote...</span>
                </div>
              ) : swapQuote && swapQuote.amountOutFormatted ? (
                <span className="text-2xl font-medium text-primary-400">
                  {formatBalance(swapQuote.amountOutFormatted, 6)}
                </span>
              ) : fromAmount && parseFloat(fromAmount) > 0 && !insufficientBalance ? (
                <div className="flex items-center justify-end gap-2">
                  <span className="text-2xl font-medium text-dark-500">~</span>
                </div>
              ) : (
                <span className="text-2xl font-medium text-dark-500">0.0</span>
              )}
            </div>
          </div>
        </div>

        {/* Swap Intelligence Panel (when quote available) */}
        {swapIntelligence && status === 'previewing' && !showPreview && (
          <div className="mt-4">
            <SwapIntelligencePanel intelligence={swapIntelligence} compact />
          </div>
        )}

        {/* Guard Warning Panel (when preset has guards and they fail) */}
        {guardEvaluation && !guardEvaluation.passed && !guardsDismissed && status === 'previewing' && !showPreview && (
          <div className="mt-4">
            <GuardWarningPanel
              evaluation={guardEvaluation}
              onDismiss={() => setGuardsDismissed(true)}
              onProceedAnyway={() => setGuardsDismissed(true)}
            />
          </div>
        )}

        {/* Quote Details (when quote available) */}
        {swapQuote && status === 'previewing' && !showPreview && (
          <div className="relative z-10 mt-4 p-4 bg-electro-bgAlt/60 rounded-glass-sm text-sm space-y-2 border border-white/[0.06]">
            {/* Best Route Banner with Countdown */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-dark-700">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-900/50 flex items-center justify-center">
                  <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-green-400 font-medium">Best route found</span>
                <RouteTooltip provider={swapQuote.provider} />
              </div>
              {/* Quote Expiry Countdown */}
              {quoteSecondsRemaining !== null && (
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${
                  quoteSecondsRemaining <= 0
                    ? 'bg-red-900/30 text-red-400'
                    : quoteSecondsRemaining <= 5
                    ? 'bg-red-900/30 text-red-400'
                    : quoteSecondsRemaining <= 10
                    ? 'bg-yellow-900/30 text-yellow-400'
                    : 'bg-dark-700 text-dark-300'
                }`}>
                  <ClockIcon />
                  {quoteSecondsRemaining <= 0 ? (
                    <span>Expired - Refresh</span>
                  ) : (
                    <span>{quoteSecondsRemaining}s</span>
                  )}
                </div>
              )}
            </div>

            {/* Rate */}
            <div className="flex justify-between">
              <span className="text-dark-400">Rate</span>
              <span>1 {fromAsset?.symbol} = {formatBalance(swapQuote.rate, 6)} {toAsset?.symbol}</span>
            </div>

            {/* Expected Output */}
            <div className="flex justify-between">
              <span className="text-dark-400">Expected Output</span>
              <span className="text-primary-400 font-medium">
                {formatBalance(swapQuote.amountOutFormatted, 6)} {toAsset?.symbol}
              </span>
            </div>

            {/* Minimum Received */}
            <div className="flex justify-between">
              <span className="text-dark-400">Minimum Received</span>
              <span>{formatBalance(swapQuote.minimum_received, 6)} {toAsset?.symbol}</span>
            </div>

            {/* Price Impact */}
            {swapQuote.price_impact && parseFloat(swapQuote.price_impact) > 0 && (
              <div className="flex justify-between">
                <span className="text-dark-400">Price Impact</span>
                <span className={
                  parseFloat(swapQuote.price_impact) > 3
                    ? 'text-red-400'
                    : parseFloat(swapQuote.price_impact) > 1
                    ? 'text-yellow-400'
                    : 'text-green-400'
                }>
                  {formatPercent(swapQuote.price_impact)}
                </span>
              </div>
            )}

            {/* Fee Tier */}
            <div className="flex justify-between">
              <span className="text-dark-400">Pool Fee</span>
              <span>{getFeeTierDisplay(swapQuote.feeTier)}</span>
            </div>

            {/* Slippage */}
            <div className="flex justify-between">
              <span className="text-dark-400">Slippage Tolerance</span>
              <span>{swapQuote.slippage}%</span>
            </div>

            {/* Gas Estimate */}
            <div className="flex justify-between border-t border-dark-700 pt-2 mt-2">
              <span className="text-dark-400">Est. Gas</span>
              <span className="text-dark-400">~250,000 gas</span>
            </div>

            {/* Provider */}
            <div className="flex justify-between items-center">
              <span className="text-dark-400">Route via</span>
              <div className="flex items-center gap-2">
                <ProviderBadge provider={swapQuote.provider} />
              </div>
            </div>

            {/* Approval Notice */}
            {swapQuote.needsApproval && (
              <div className="flex items-center gap-2 p-2 bg-blue-900/20 rounded-lg mt-2">
                <InfoIcon />
                <span className="text-blue-400 text-xs">
                  Token approval required (2 transactions)
                </span>
              </div>
            )}
          </div>
        )}

        {/* High Price Impact Warning */}
        {swapQuote && parseFloat(swapQuote.price_impact || '0') > 3 && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400 flex items-center gap-2">
            <WarningIcon />
            <span>High price impact! You may receive significantly less.</span>
          </div>
        )}

        {/* Error Display */}
        {(quoteError || (error && status !== 'previewing')) && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400">
            {quoteError || error}
          </div>
        )}

        {/* Insufficient Balance Warning */}
        {insufficientBalance && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400 flex items-center gap-2">
            <WarningIcon />
            <span>Insufficient {fromAsset?.symbol} balance</span>
          </div>
        )}

        {/* Swap Button */}
        <div className="relative z-10 mt-4">
          <button
            onClick={handlePreviewSwap}
            disabled={isButtonDisabled()}
            className={`
              w-full py-3.5 rounded-glass-sm font-semibold text-base
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
              ${isSwapReady
                ? 'bg-accent text-electro-bg shadow-glow-accent hover:brightness-110'
                : showSpinner
                  ? 'bg-electro-panel text-gray-400 border border-white/[0.1]'
                  : 'bg-electro-panel text-gray-400 border border-white/[0.1] hover:bg-electro-panelHover hover:border-white/[0.15]'
              }
            `}
          >
            {showSpinner ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                <span>Getting Quote...</span>
              </span>
            ) : (
              getButtonText()
            )}
          </button>
        </div>

        {/* Security Footer */}
        {isConnected && (
          <div className="relative z-10 flex items-center justify-center gap-2 mt-3">
            <ShieldIcon />
            <p className="text-xs text-gray-500">
              All transactions are signed locally in your wallet
            </p>
          </div>
        )}
      </div>

      {/* Swap Preview Modal */}
      <SwapPreviewModal
        isOpen={showPreview}
        quote={swapQuote}
        step={getModalStep()}
        error={error}
        txHash={txHash}
        explorerUrl={explorerUrl}
        onConfirm={handleConfirmSwap}
        onCancel={handleCancelPreview}
        onRefreshQuote={handleRefreshQuote}
        isRefreshing={isRefreshingQuote}
      />

      {/* Save Preset Modal */}
      {fromAsset && toAsset && (
        <SavePresetModal
          isOpen={showSavePreset}
          onClose={() => setShowSavePreset(false)}
          fromAsset={fromAsset}
          toAsset={toAsset}
          fromAmount={fromAmount}
          slippage={slippage}
        />
      )}
    </>
  );
}

// Token Button Component
function TokenButton({ asset, onClick }: { asset: AssetInfo | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-electro-panel/80 rounded-xl hover:bg-electro-panelHover transition-all duration-200 border border-white/[0.06] hover:border-white/[0.1]"
    >
      {asset?.logo_url ? (
        <img
          src={asset.logo_url}
          alt={asset.symbol}
          className="w-6 h-6 rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div className={`w-6 h-6 rounded-full bg-dark-500 flex items-center justify-center text-xs font-bold ${asset?.logo_url ? 'hidden' : ''}`}>
        {asset?.symbol?.[0] || '?'}
      </div>
      <span className="font-medium">{asset?.symbol || 'Select'}</span>
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
    if (importedToken && onAddToken) {
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

    // Sort favorites first if enabled
    if (showFavorites && chainId) {
      result = [...result].sort((a, b) => {
        const aFav = isFavorite(chainId, a.contract_address || '');
        const bFav = isFavorite(chainId, b.contract_address || '');
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return 0;
      });
    }

    return result;
  }, [assets, searchQuery, showFavorites, chainId, isFavorite]);

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 mt-2 w-80 bg-electro-panel/95 backdrop-blur-glass rounded-glass shadow-glass border border-white/[0.08] py-2 z-[60]"
    >
      {/* Search Input */}
      <div className="px-3 pb-2 mb-2 border-b border-dark-700">
        <input
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
      {isContractAddress && !tokenExists && !isStatic && !!provider && chainId && onAddToken && (
        <div className="px-3 pb-3 mb-2 border-b border-dark-700">
          {importedToken ? (
            // Show imported token details for confirmation with security data
            <div className="bg-dark-700 rounded-lg p-3">
              {/* Token Header */}
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-dark-600">
                <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center text-lg font-bold">
                  {importedToken.symbol[0]}
                </div>
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

              {/* Disclaimer */}
              <div className="text-[10px] text-dark-500 mb-3 leading-relaxed">
                Security data is informational only, not financial advice. Always DYOR.
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setImportedToken(null)}
                  className="flex-1 px-3 py-1.5 bg-dark-600 rounded text-sm hover:bg-dark-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  className="flex-1 px-3 py-1.5 bg-primary-600 rounded text-sm hover:bg-primary-500 text-white"
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
      <div className="max-h-64 overflow-y-auto">
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

            return (
              <div
                key={`${asset.symbol}-${asset.contract_address}`}
                className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 ${
                  isSelected
                    ? 'bg-primary-600/20 text-primary-400'
                    : isExcluded
                    ? 'opacity-50'
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
                    className={`p-1 transition-colors ${
                      isFav
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-dark-500 hover:text-yellow-400'
                    }`}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <StarIcon filled={!!isFav} />
                  </button>
                )}
                <button
                  onClick={() => !isExcluded && onSelect(asset)}
                  disabled={isExcluded}
                  className="flex items-center gap-3 flex-1"
                >
                  {asset.logo_url ? (
                    <img
                      src={asset.logo_url}
                      alt={asset.symbol}
                      className="w-8 h-8 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center text-sm font-bold">
                      {asset.symbol[0]}
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{asset.symbol}</span>
                      {isFav && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400">
                          Favorite
                        </span>
                      )}
                      {isCustom && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          verified
                            ? 'bg-blue-900/30 text-blue-400'
                            : 'bg-yellow-900/30 text-yellow-400'
                        }`}>
                          {verified ? 'Imported' : 'Unverified'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-dark-400">{asset.name}</div>
                  </div>
                  {isSelected && <CheckIcon />}
                </button>
                {/* Remove button for custom tokens */}
                {isCustom && onRemoveToken && chainId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveToken(chainId, asset.contract_address || '');
                    }}
                    className="p-1 text-dark-400 hover:text-red-400 transition-colors"
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
  onClose,
}: {
  value: number;
  customValue: string;
  onChange: (v: number) => void;
  onCustomChange: (v: string) => void;
  onClose: () => void;
}) {
  const presets = [0.1, 0.5, 1.0];
  const isCustom = !presets.includes(value);

  return (
    <div className="relative z-10 mb-4 p-4 bg-electro-bgAlt/80 rounded-glass-sm border border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium text-white">Slippage Tolerance</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <CloseIcon />
        </button>
      </div>

      <div className="flex gap-2 mb-3">
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
            type="text"
            placeholder="Custom"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
          />
          <span className="text-dark-400">%</span>
        </div>
      </div>

      {/* Warnings */}
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
    <svg className="w-4 h-4 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  const getProviderInfo = () => {
    switch (provider) {
      case '1inch':
        return 'Aggregates multiple DEXs to find the best price with lowest slippage.';
      case 'uniswap-v3':
        return 'Direct swap via Uniswap V3 concentrated liquidity pools.';
      case 'pancakeswap-v3':
        return 'Direct swap via PancakeSwap V3 on BNB Chain.';
      default:
        return 'Route selected for best output amount.';
    }
  };

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="text-dark-400 hover:text-dark-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-dark-700 rounded-lg text-xs text-white w-48 shadow-lg z-50">
          <div className="font-medium mb-1">Why this route?</div>
          <div className="text-dark-300">{getProviderInfo()}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-dark-700" />
        </div>
      )}
    </div>
  );
}

// Provider Badge - Visual indicator for DEX provider
function ProviderBadge({ provider }: { provider: string }) {
  const getProviderStyle = () => {
    switch (provider) {
      case '1inch':
        return { bg: 'bg-red-900/30', text: 'text-red-400', label: '1inch' };
      case 'uniswap-v3':
        return { bg: 'bg-pink-900/30', text: 'text-pink-400', label: 'Uniswap V3' };
      case 'pancakeswap-v3':
        return { bg: 'bg-yellow-900/30', text: 'text-yellow-400', label: 'PancakeSwap' };
      default:
        return { bg: 'bg-primary-900/30', text: 'text-primary-400', label: provider };
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
  // Define presets per chain
  const presets = chainId === 56
    ? [
        { label: 'Sell BNB', from: 'BNB', to: 'USDT', icon: '📉' },
        { label: 'Buy BNB', from: 'USDT', to: 'BNB', icon: '📈' },
        { label: 'Exit to Stable', from: 'BNB', to: 'BUSD', icon: '🛡️' },
      ]
    : [
        { label: 'Sell ETH', from: 'ETH', to: 'USDT', icon: '📉' },
        { label: 'Buy ETH', from: 'USDT', to: 'ETH', icon: '📈' },
        { label: 'Exit to Stable', from: 'ETH', to: 'USDC', icon: '🛡️' },
      ];

  // Only show presets if tokens are available
  const hasTokens = presets.every(
    (p) => tokens.some((t) => t.symbol === p.from) && tokens.some((t) => t.symbol === p.to)
  );

  if (!hasTokens) return null;

  return (
    <div className="relative z-10 flex gap-2 mb-4 overflow-x-auto pb-1">
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
  );
}

export default SwapInterface;
