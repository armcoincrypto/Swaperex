/**
 * Withdrawal Interface Component
 *
 * Main withdrawal UI with asset selection, amount input, and destination address.
 * ALL signing happens client-side via the connected wallet.
 *
 * Flow: Select asset → Enter amount → Enter address → Preview → Confirm in wallet → Success
 */

import { useState, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useWithdrawal } from '@/hooks/useWithdrawal';
import { useBalanceStore } from '@/stores/balanceStore';
import { Button } from '@/components/common/Button';
import { WithdrawalPreviewModal } from './WithdrawalPreviewModal';
import { formatBalance, getChainName } from '@/utils/format';
import type { TokenBalance } from '@/types/api';

// Supported chains for withdrawal
const CHAINS = [
  { id: 'ethereum', name: 'Ethereum', chainId: 1 },
  { id: 'bsc', name: 'BNB Chain', chainId: 56 },
  { id: 'polygon', name: 'Polygon', chainId: 137 },
  { id: 'arbitrum', name: 'Arbitrum', chainId: 42161 },
  { id: 'optimism', name: 'Optimism', chainId: 10 },
  { id: 'avalanche', name: 'Avalanche', chainId: 43114 },
];

export function WithdrawalInterface() {
  const { isConnected, address, isWrongChain } = useWallet();
  const { balances, getTokenBalance } = useBalanceStore();

  const {
    status,
    template,
    txHash,
    error,
    input,
    canPreview,
    updateInput,
    preview,
    confirmWithdrawal,
    cancelPreview,
    reset,
    isValidAddress,
  } = useWithdrawal();

  const [showPreview, setShowPreview] = useState(false);
  const [showAssetSelector, setShowAssetSelector] = useState(false);

  // Get all available token balances across chains
  const getAllBalances = useCallback((): TokenBalance[] => {
    const allBalances: TokenBalance[] = [];
    Object.entries(balances).forEach(([chain, response]) => {
      if (response.native_balance) {
        allBalances.push({ ...response.native_balance, chain });
      }
      if (response.token_balances) {
        response.token_balances.forEach((token) => {
          allBalances.push({ ...token, chain });
        });
      }
    });
    return allBalances.filter((b) => parseFloat(b.balance) > 0);
  }, [balances]);

  const availableBalances = getAllBalances();

  // Get selected asset balance
  const selectedBalance = input.asset
    ? getTokenBalance(input.chain, input.asset)
    : null;

  // Check for insufficient balance
  const insufficientBalance =
    input.amount &&
    selectedBalance &&
    parseFloat(input.amount) > 0 &&
    parseFloat(input.amount) > parseFloat(selectedBalance.balance);

  // Address validation
  const addressError = input.destinationAddress && !isValidAddress(input.destinationAddress)
    ? 'Invalid address format'
    : input.destinationAddress && address && input.destinationAddress.toLowerCase() === address.toLowerCase()
    ? 'Cannot send to your own address'
    : null;

  // Handle preview
  const handlePreview = async () => {
    const result = await preview();
    if (result) {
      setShowPreview(true);
    }
  };

  // Handle confirm
  const handleConfirm = async () => {
    try {
      await confirmWithdrawal();
    } catch (err) {
      // Error handled in hook
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setShowPreview(false);
    cancelPreview();
  };

  // Handle new withdrawal after success
  const handleDone = () => {
    setShowPreview(false);
    reset();
  };

  // Select asset from list
  const selectAsset = (balance: TokenBalance) => {
    updateInput('asset', balance.symbol);
    updateInput('chain', balance.chain);
    setShowAssetSelector(false);
  };

  // Get button text
  const getButtonText = (): string => {
    if (!isConnected) return 'Connect Wallet';
    if (isWrongChain) return 'Wrong Network';
    if (!input.asset) return 'Select Asset';
    if (!input.amount || parseFloat(input.amount) === 0) return 'Enter Amount';
    if (insufficientBalance) return 'Insufficient Balance';
    if (!input.destinationAddress) return 'Enter Address';
    if (addressError) return addressError;
    if (status === 'fetching_template') return 'Loading...';
    return 'Preview Withdrawal';
  };

  // Check if button should be disabled
  const isButtonDisabled = (): boolean => {
    if (!isConnected) return true;
    if (isWrongChain) return true;
    if (!canPreview) return true;
    if (insufficientBalance) return true;
    if (addressError) return true;
    if (status === 'fetching_template') return true;
    return false;
  };

  return (
    <>
      <div className="w-full max-w-md mx-auto bg-dark-900 rounded-2xl p-4 border border-dark-800">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Withdraw</h2>
        </div>

        {/* Asset Selector */}
        <div className="bg-dark-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-400">Asset</span>
            {selectedBalance && (
              <span className="text-sm text-dark-400">
                Balance: {formatBalance(selectedBalance.balance)}
              </span>
            )}
          </div>

          <button
            onClick={() => setShowAssetSelector(!showAssetSelector)}
            className="w-full flex items-center justify-between px-3 py-3 bg-dark-700 rounded-xl hover:bg-dark-600 transition-colors"
          >
            <div className="flex items-center gap-3">
              {input.asset ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-dark-500 flex items-center justify-center">
                    <span className="font-bold">{input.asset[0]}</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{input.asset}</div>
                    <div className="text-xs text-dark-400">{getChainName(CHAINS.find(c => c.id === input.chain)?.chainId || 1)}</div>
                  </div>
                </>
              ) : (
                <span className="text-dark-400">Select asset to withdraw</span>
              )}
            </div>
            <ChevronDownIcon />
          </button>

          {/* Asset dropdown */}
          {showAssetSelector && (
            <div className="mt-2 bg-dark-700 rounded-xl max-h-60 overflow-y-auto">
              {availableBalances.length > 0 ? (
                availableBalances.map((balance, i) => (
                  <button
                    key={`${balance.chain}-${balance.symbol}-${i}`}
                    onClick={() => selectAsset(balance)}
                    className="w-full flex items-center justify-between px-3 py-3 hover:bg-dark-600 transition-colors first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-dark-500 flex items-center justify-center">
                        <span className="text-sm font-bold">{balance.symbol[0]}</span>
                      </div>
                      <div className="text-left">
                        <div className="font-medium">{balance.symbol}</div>
                        <div className="text-xs text-dark-400">{getChainName(CHAINS.find(c => c.id === balance.chain)?.chainId || 1)}</div>
                      </div>
                    </div>
                    <span className="text-dark-400">{formatBalance(balance.balance)}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-dark-400">
                  {isConnected ? 'No tokens with balance' : 'Connect wallet to see balances'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Amount Input */}
        <div className={`bg-dark-800 rounded-xl p-4 mb-4 ${insufficientBalance ? 'border border-red-800' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-400">Amount</span>
            {selectedBalance && (
              <button
                onClick={() => updateInput('amount', selectedBalance.balance)}
                className="text-sm text-primary-400 hover:text-primary-300"
              >
                MAX
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="0.0"
            value={input.amount}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.]/g, '');
              updateInput('amount', val);
            }}
            className="w-full bg-transparent text-2xl font-medium outline-none"
            disabled={!input.asset}
          />
          {insufficientBalance && (
            <p className="text-xs text-red-400 mt-2">Insufficient balance</p>
          )}
        </div>

        {/* Destination Address */}
        <div className={`bg-dark-800 rounded-xl p-4 mb-4 ${addressError ? 'border border-red-800' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-400">Destination Address</span>
          </div>
          <input
            type="text"
            placeholder="0x..."
            value={input.destinationAddress}
            onChange={(e) => updateInput('destinationAddress', e.target.value)}
            className="w-full bg-transparent text-sm font-mono outline-none break-all"
          />
          {addressError && (
            <p className="text-xs text-red-400 mt-2">{addressError}</p>
          )}
        </div>

        {/* Chain Selector (if asset is multi-chain) */}
        {input.asset && (
          <div className="bg-dark-800 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-dark-400">Network</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-dark-700 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-dark-500 flex items-center justify-center">
                <ChainIcon chainId={CHAINS.find(c => c.id === input.chain)?.chainId || 1} />
              </div>
              <span className="font-medium">{getChainName(CHAINS.find(c => c.id === input.chain)?.chainId || 1)}</span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && status !== 'previewing' && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Withdraw Button */}
        <Button
          onClick={handlePreview}
          disabled={isButtonDisabled()}
          loading={status === 'fetching_template'}
          fullWidth
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

      {/* Withdrawal Preview Modal */}
      <WithdrawalPreviewModal
        isOpen={showPreview}
        template={template}
        status={status}
        error={error}
        txHash={txHash}
        onConfirm={handleConfirm}
        onCancel={status === 'success' ? handleDone : handleCancel}
      />
    </>
  );
}

// Icons
function ChevronDownIcon() {
  return (
    <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChainIcon({ chainId }: { chainId: number }) {
  // Simple chain indicator - in production would use actual chain icons
  const colors: Record<number, string> = {
    1: 'bg-blue-500',
    56: 'bg-yellow-500',
    137: 'bg-purple-500',
    42161: 'bg-blue-400',
    10: 'bg-red-500',
    43114: 'bg-red-400',
  };

  return (
    <div className={`w-full h-full rounded-full ${colors[chainId] || 'bg-gray-500'}`} />
  );
}

export default WithdrawalInterface;
