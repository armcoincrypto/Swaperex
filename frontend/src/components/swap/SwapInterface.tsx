/**
 * Swap Interface Component
 *
 * Main swap UI with token selection, amount input, and execution.
 * ALL signing happens client-side via the connected wallet.
 */

import { useState, useEffect } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useQuote } from '@/hooks/useQuote';
import { useTransaction } from '@/hooks/useTransaction';
import { useSwapStore } from '@/stores/swapStore';
import { Button } from '@/components/common/Button';
import { formatBalance, formatUsd, formatPercent, getExplorerUrl } from '@/utils/format';
import type { AssetInfo } from '@/types/api';

// Mock assets for demo - would come from API
const MOCK_ASSETS: AssetInfo[] = [
  { symbol: 'ETH', name: 'Ethereum', chain: 'ethereum', decimals: 18, is_native: true },
  { symbol: 'USDT', name: 'Tether USD', chain: 'ethereum', decimals: 6, is_native: false },
  { symbol: 'USDC', name: 'USD Coin', chain: 'ethereum', decimals: 6, is_native: false },
  { symbol: 'DAI', name: 'Dai', chain: 'ethereum', decimals: 18, is_native: false },
];

export function SwapInterface() {
  const { isConnected, address, chainId } = useWallet();
  const { quote, isQuoting, quoteError } = useQuote();
  const { executeTransaction, status, txHash, error: txError, reset } = useTransaction();

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
    isSwapping,
    setSwapping,
  } = useSwapStore();

  const [showSettings, setShowSettings] = useState(false);

  // Initialize with default assets
  useEffect(() => {
    if (!fromAsset) setFromAsset(MOCK_ASSETS[0]);
    if (!toAsset) setToAsset(MOCK_ASSETS[1]);
  }, [fromAsset, toAsset, setFromAsset, setToAsset]);

  // Execute swap
  const handleSwap = async () => {
    if (!quote?.transaction || !isConnected) return;

    setSwapping(true);
    try {
      await executeTransaction(quote.transaction);
    } finally {
      setSwapping(false);
    }
  };

  // Render swap form
  return (
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
      <div className="bg-dark-800 rounded-xl p-4 mb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-dark-400">From</span>
          <span className="text-sm text-dark-400">
            Balance: {formatBalance('0.00')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <TokenButton asset={fromAsset} onClick={() => {}} />
          <input
            type="text"
            placeholder="0.0"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
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
          <span className="text-sm text-dark-400">To</span>
          <span className="text-sm text-dark-400">
            Balance: {formatBalance('0.00')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <TokenButton asset={toAsset} onClick={() => {}} />
          <input
            type="text"
            placeholder="0.0"
            value={toAmount}
            readOnly
            className="flex-1 bg-transparent text-2xl font-medium text-right outline-none text-dark-400"
          />
        </div>
      </div>

      {/* Quote Details */}
      {quote && (
        <div className="mt-4 p-3 bg-dark-800 rounded-xl text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-dark-400">Rate</span>
            <span>1 {fromAsset?.symbol} = {formatBalance(quote.rate)} {toAsset?.symbol}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-dark-400">Price Impact</span>
            <span className={parseFloat(quote.price_impact) > 1 ? 'text-yellow-400' : ''}>
              {formatPercent(quote.price_impact)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-dark-400">Minimum Received</span>
            <span>{formatBalance(quote.minimum_received)} {toAsset?.symbol}</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {(quoteError || txError) && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400">
          {quoteError || txError}
        </div>
      )}

      {/* Success Display */}
      {status === 'success' && txHash && (
        <div className="mt-4 p-3 bg-green-900/20 border border-green-800 rounded-xl text-sm">
          <div className="flex items-center justify-between">
            <span className="text-green-400">Swap successful!</span>
            <a
              href={getExplorerUrl(chainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:underline"
            >
              View Transaction
            </a>
          </div>
        </div>
      )}

      {/* Swap Button */}
      <Button
        onClick={handleSwap}
        disabled={!isConnected || !quote || isSwapping || status === 'signing' || status === 'broadcasting'}
        loading={isQuoting || isSwapping || status === 'signing' || status === 'broadcasting' || status === 'confirming'}
        fullWidth
        className="mt-4"
        size="lg"
      >
        {!isConnected
          ? 'Connect Wallet'
          : isQuoting
          ? 'Getting Quote...'
          : !quote
          ? 'Enter an amount'
          : status === 'signing'
          ? 'Confirm in Wallet...'
          : status === 'broadcasting'
          ? 'Broadcasting...'
          : status === 'confirming'
          ? 'Confirming...'
          : 'Swap'}
      </Button>
    </div>
  );
}

// Sub-components
function TokenButton({ asset, onClick }: { asset: AssetInfo | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-dark-700 rounded-xl hover:bg-dark-600 transition-colors"
    >
      <div className="w-6 h-6 rounded-full bg-dark-500" />
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
    </div>
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

export default SwapInterface;
