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
import { Button } from '@/components/common/Button';
import { SwapPreviewModal, SwapStep } from './SwapPreviewModal';
import { formatBalance, formatPercent } from '@/utils/format';
import { getPopularTokens, isNativeToken, type Token } from '@/tokens';
import type { AssetInfo } from '@/types/api';

// Chain ID to chain name mapping
const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
};

// Gas buffer for native tokens (to leave enough for transaction fees)
const GAS_BUFFER: Record<number, number> = {
  1: 0.01,    // ETH - leave 0.01 ETH for gas
  56: 0.005,  // BNB - leave 0.005 BNB for gas
  137: 1,     // MATIC - leave 1 MATIC for gas
};

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
  const { isConnected, address, isWrongChain, chainId } = useWallet();
  const { getTokenBalance } = useBalanceStore();

  // Get available tokens for current chain
  const currentChainId = chainId || 1;
  const AVAILABLE_TOKENS = useMemo(() => {
    const tokens = getPopularTokens(currentChainId);
    return tokens.map((t) => tokenToAsset(t, currentChainId));
  }, [currentChainId]);

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
  } = useSwapStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isRefreshingQuote, setIsRefreshingQuote] = useState(false);
  const [showFromSelector, setShowFromSelector] = useState(false);
  const [showToSelector, setShowToSelector] = useState(false);
  const [customSlippage, setCustomSlippage] = useState('');

  // Ref for debounced quote fetching
  const quoteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      const gasBuffer = GAS_BUFFER[currentChainId] || 0.01;
      const maxAmount = Math.max(0, balance - gasBuffer);
      // Format to reasonable precision (avoid scientific notation)
      return maxAmount > 0 ? maxAmount.toFixed(6).replace(/\.?0+$/, '') : '0';
    }

    // For ERC20 tokens, use full balance
    return fromBalance;
  }, [fromBalance, fromAsset, currentChainId]);

  // Debounced quote fetching when amount changes
  useEffect(() => {
    // Clear previous timeout
    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current);
    }

    // Don't fetch if conditions not met
    if (!isConnected || !fromAsset || !toAsset || !fromAmount) {
      return;
    }

    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    // Debounce quote fetching - fetch regardless of balance (let user see the quote)
    quoteTimeoutRef.current = setTimeout(() => {
      console.log('[Swap] Fetching quote for:', fromAmount, fromAsset.symbol, '→', toAsset.symbol);
      fetchSwapQuote().catch((err) => {
        console.warn('[Swap] Quote fetch failed:', err.message);
      });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current);
      }
    };
  }, [fromAmount, fromAsset, toAsset, isConnected, fetchSwapQuote]);

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

  // Open preview modal
  const handlePreviewSwap = async () => {
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

  // Cancel preview
  const handleCancelPreview = () => {
    setShowPreview(false);
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

  // Render swap form
  return (
    <>
      <div className="w-full max-w-md mx-auto bg-dark-900 rounded-2xl p-4 border border-dark-800">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Swap</h2>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-dark-800 transition-colors"
            title="Settings"
          >
            <SettingsIcon />
          </button>
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

        {/* From Token */}
        <div className={`bg-dark-800 rounded-xl p-4 mb-2 ${
          insufficientBalance ? 'border border-red-800' : ''
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
                  title={fromAsset?.is_native ? `Max minus ${GAS_BUFFER[currentChainId] || 0.01} for gas` : 'Use full balance'}
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
        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={swapAssets}
            className="p-2 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors border-4 border-dark-900"
            title="Swap direction"
          >
            <SwapIcon />
          </button>
        </div>

        {/* To Token */}
        <div className="bg-dark-800 rounded-xl p-4 mt-2">
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
                />
              )}
            </div>
            <div className="flex-1 text-right">
              {isQuoting || status === 'fetching_quote' ? (
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

        {/* Quote Details (when quote available) */}
        {swapQuote && status === 'previewing' && !showPreview && (
          <div className="mt-4 p-4 bg-dark-800 rounded-xl text-sm space-y-2">
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
            <div className="flex justify-between">
              <span className="text-dark-400">Route</span>
              <span className="text-primary-400">{swapQuote.provider}</span>
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
        <Button
          onClick={handlePreviewSwap}
          disabled={isButtonDisabled()}
          loading={isQuoting || status === 'fetching_quote'}
          fullWidth
          className="mt-4"
          size="lg"
        >
          {getButtonText()}
        </Button>

        {/* Security Footer */}
        {isConnected && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <ShieldIcon />
            <p className="text-xs text-dark-500">
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
    </>
  );
}

// Token Button Component
function TokenButton({ asset, onClick }: { asset: AssetInfo | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-dark-700 rounded-xl hover:bg-dark-600 transition-colors"
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

// Token Selector Dropdown
function TokenSelectorDropdown({
  assets,
  selectedAsset,
  excludeAsset,
  onSelect,
  onClose,
}: {
  assets: AssetInfo[];
  selectedAsset: AssetInfo | null;
  excludeAsset: AssetInfo | null;
  onSelect: (asset: AssetInfo) => void;
  onClose: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter tokens by search query
  const filteredAssets = assets.filter((asset) =>
    asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    asset.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 mt-2 w-72 bg-dark-800 rounded-xl shadow-lg border border-dark-700 py-2 z-[60]"
    >
      {/* Search Input */}
      <div className="px-3 pb-2 mb-2 border-b border-dark-700">
        <input
          type="text"
          placeholder="Search token..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary-500"
          autoFocus
        />
      </div>

      {/* Token List */}
      <div className="max-h-64 overflow-y-auto">
        {filteredAssets.length === 0 ? (
          <div className="px-4 py-3 text-center text-dark-400 text-sm">
            No tokens found
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isSelected = asset.symbol === selectedAsset?.symbol;
            const isExcluded = asset.symbol === excludeAsset?.symbol;

            return (
              <button
                key={asset.symbol}
                onClick={() => onSelect(asset)}
                disabled={isExcluded}
                className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 ${
                  isSelected
                    ? 'bg-primary-600/20 text-primary-400'
                    : isExcluded
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-dark-700'
                }`}
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
                <div className="flex-1">
                  <div className="font-medium">{asset.symbol}</div>
                  <div className="text-xs text-dark-400">{asset.name}</div>
                </div>
                {isSelected && <CheckIcon />}
              </button>
            );
          })
        )}
      </div>
    </div>
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
    <div className="mb-4 p-4 bg-dark-800 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium">Slippage Tolerance</span>
        <button onClick={onClose} className="text-dark-400 hover:text-white">
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
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              value === opt
                ? 'bg-primary-600 text-white'
                : 'bg-dark-700 hover:bg-dark-600'
            }`}
          >
            {opt}%
          </button>
        ))}

        {/* Custom Input */}
        <div className={`flex-1 flex items-center gap-1 px-3 py-2 rounded-lg ${
          isCustom ? 'bg-primary-600/20 border border-primary-600' : 'bg-dark-700'
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

export default SwapInterface;
