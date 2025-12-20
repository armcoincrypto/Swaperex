/**
 * Swap Interface Component
 *
 * Main swap UI with token selection, amount input, and preview flow.
 * ALL signing happens client-side via the connected wallet.
 *
 * Flow: Enter amount → Get quote → Preview → Confirm in wallet → Success
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useSwap } from '@/hooks/useSwap';
import { useSwapStore } from '@/stores/swapStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { Button } from '@/components/common/Button';
import { SwapPreviewModal, SwapStep } from './SwapPreviewModal';
import { formatBalance, formatPercent } from '@/utils/format';
import type { AssetInfo } from '@/types/api';

// Mock assets for demo - would come from API
const MOCK_ASSETS: AssetInfo[] = [
  { symbol: 'ETH', name: 'Ethereum', chain: 'ethereum', decimals: 18, is_native: true },
  { symbol: 'USDT', name: 'Tether USD', chain: 'ethereum', decimals: 6, is_native: false },
  { symbol: 'USDC', name: 'USD Coin', chain: 'ethereum', decimals: 6, is_native: false },
  { symbol: 'DAI', name: 'Dai', chain: 'ethereum', decimals: 18, is_native: false },
];

export function SwapInterface() {
  const { isConnected, address, isWrongChain } = useWallet();
  const { getTokenBalance } = useBalanceStore();

  const {
    status,
    quote,
    txHash,
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
    toAmount,
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

  // Initialize with default assets
  useEffect(() => {
    if (!fromAsset) setFromAsset(MOCK_ASSETS[0]);
    if (!toAsset) setToAsset(MOCK_ASSETS[1]);
  }, [fromAsset, toAsset, setFromAsset, setToAsset]);

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

  // Open preview modal
  const handlePreviewSwap = async () => {
    try {
      await swap(); // This fetches the quote
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
    if (isQuoting) return 'Getting Quote...';
    if (quoteError) return 'Quote Error';
    if (status === 'fetching_quote') return 'Getting Quote...';
    return 'Preview Swap';
  };

  // Check if button should be disabled
  const isButtonDisabled = (): boolean => {
    if (!isConnected) return true;
    if (isWrongChain) return true;
    if (!fromAmount || parseFloat(fromAmount) === 0) return true;
    if (insufficientBalance) return true;
    if (isQuoting || status === 'fetching_quote') return true;
    return false;
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
          >
            <SettingsIcon />
          </button>
        </div>

        {/* Settings */}
        {showSettings && (
          <SlippageSettings
            value={slippage}
            onChange={setSlippage}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* From Token */}
        <div className={`bg-dark-800 rounded-xl p-4 mb-2 ${
          insufficientBalance ? 'border border-red-800' : ''
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-400">From</span>
            <span className={`text-sm ${insufficientBalance ? 'text-red-400' : 'text-dark-400'}`}>
              Balance: {formatBalance(fromBalance)}
              {isConnected && fromBalance !== '0.00' && (
                <button
                  onClick={() => setFromAmount(fromBalance)}
                  className="ml-2 text-primary-400 hover:text-primary-300"
                >
                  MAX
                </button>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <TokenButton asset={fromAsset} onClick={() => {}} />
            <input
              type="text"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                setFromAmount(val);
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
          >
            <SwapIcon />
          </button>
        </div>

        {/* To Token */}
        <div className="bg-dark-800 rounded-xl p-4 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-400">To (estimated)</span>
            <span className="text-sm text-dark-400">
              Balance: {formatBalance(getBalance(toAsset))}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <TokenButton asset={toAsset} onClick={() => {}} />
            <div className="flex-1 text-right">
              {isQuoting || status === 'fetching_quote' ? (
                <div className="flex items-center justify-end gap-2">
                  <LoadingSpinner />
                  <span className="text-dark-400">Getting quote...</span>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="0.0"
                  value={toAmount}
                  readOnly
                  className="w-full bg-transparent text-2xl font-medium text-right outline-none text-dark-400"
                />
              )}
            </div>
          </div>
        </div>

        {/* Quick Quote Preview (when quote available but not in preview) */}
        {quote && status === 'previewing' && !showPreview && (
          <div className="mt-4 p-3 bg-dark-800 rounded-xl text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-dark-400">Rate</span>
              <span>1 {fromAsset?.symbol} = {formatBalance(quote.rate)} {toAsset?.symbol}</span>
            </div>
            {quote.price_impact && parseFloat(quote.price_impact) > 0 && (
              <div className="flex justify-between mb-1">
                <span className="text-dark-400">Price Impact</span>
                <span className={parseFloat(quote.price_impact) > 3 ? 'text-red-400' : parseFloat(quote.price_impact) > 1 ? 'text-yellow-400' : ''}>
                  {formatPercent(quote.price_impact)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-dark-400">Minimum Received</span>
              <span>{formatBalance(quote.minimum_received)} {toAsset?.symbol}</span>
            </div>
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
          <p className="text-xs text-dark-500 text-center mt-3">
            All transactions are signed locally in your wallet
          </p>
        )}
      </div>

      {/* Swap Preview Modal */}
      <SwapPreviewModal
        isOpen={showPreview}
        quote={quote}
        step={getModalStep()}
        error={error}
        txHash={txHash}
        onConfirm={handleConfirmSwap}
        onCancel={handleCancelPreview}
        onRefreshQuote={handleRefreshQuote}
        isRefreshing={isRefreshingQuote}
      />
    </>
  );
}

// Sub-components
function TokenButton({ asset, onClick }: { asset: AssetInfo | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-dark-700 rounded-xl hover:bg-dark-600 transition-colors"
    >
      <div className="w-6 h-6 rounded-full bg-dark-500 flex items-center justify-center text-xs font-bold">
        {asset?.symbol?.[0] || '?'}
      </div>
      <span className="font-medium">{asset?.symbol || 'Select'}</span>
      <ChevronDownIcon />
    </button>
  );
}

function SlippageSettings({
  value,
  onChange,
  onClose,
}: {
  value: number;
  onChange: (v: number) => void;
  onClose: () => void;
}) {
  const options = [0.1, 0.5, 1.0, 3.0];

  return (
    <div className="mb-4 p-4 bg-dark-800 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium">Slippage Tolerance</span>
        <button onClick={onClose} className="text-dark-400 hover:text-white">
          <CloseIcon />
        </button>
      </div>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              value === opt
                ? 'bg-primary-600 text-white'
                : 'bg-dark-700 hover:bg-dark-600'
            }`}
          >
            {opt}%
          </button>
        ))}
      </div>
      {value >= 3 && (
        <p className="text-xs text-yellow-400 mt-2">
          High slippage may result in an unfavorable trade
        </p>
      )}
    </div>
  );
}

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

function WarningIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

export default SwapInterface;
