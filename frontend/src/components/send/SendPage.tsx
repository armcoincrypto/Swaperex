/**
 * Send Page v2
 *
 * Professional transfer flow with gas estimation, address validation,
 * ENS resolution, contact book, and execution tracking.
 *
 * NON-CUSTODIAL: All signing happens client-side via connected wallet.
 * No backend required — builds transactions directly with ethers.js.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { parseEther, formatEther } from 'ethers';
import { useWallet } from '@/hooks/useWallet';
import { useBalanceStore } from '@/stores/balanceStore';
import { useSendStore } from '@/stores/sendStore';
import { useSwapHistoryStore } from '@/stores/swapHistoryStore';
import { Button } from '@/components/common/Button';
import { AssetPicker, type SelectedAsset } from './AssetPicker';
import { AddressInput } from './AddressInput';
import { FeePreview } from './FeePreview';
import { validateAddress } from '@/utils/address';
import { parseAmount } from '@/utils/txBuilder';
import { buildNativeTransfer, buildERC20Transfer } from '@/utils/txBuilder';
import {
  estimateTransferFee,
  calculateMaxNativeSend,
  canAffordGas as checkCanAffordGas,
  type FeeEstimate,
} from '@/services/send/sendService';
import { getNativeSymbol } from '@/tokens';
import { getExplorerUrl, shortenAddress, getChainName } from '@/utils/format';
import { isUserRejection, parseTransactionError } from '@/utils/errors';
import { toast } from '@/stores/toastStore';
import { getTokenBySymbol } from '@/tokens';
import { ERC20_TOKENS } from '@/stores/balanceStore';

type SendStatus = 'idle' | 'estimating' | 'ready' | 'signing' | 'broadcasting' | 'confirming' | 'success' | 'error';

export function SendPage() {
  const { address, chainId, provider, switchNetwork, isReadOnly, getSigner } = useWallet();
  const { balances, fetchBalances } = useBalanceStore();
  const { gasMode, setGasMode, addRecentAddress } = useSendStore();

  // Form state
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const [amount, setAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');

  // Execution state
  const [status, setStatus] = useState<SendStatus>('idle');
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Debounce ref for gas estimation
  const estimateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEstimateRef = useRef<FeeEstimate | null>(null);

  // ─── Derived state ───────────────────────────────────────────────

  const nativeSymbol = chainId ? getNativeSymbol(chainId) : 'ETH';

  // Resolve contract address for selected ERC-20
  const resolveTokenAddress = useCallback((): string | undefined => {
    if (!selectedAsset || selectedAsset.isNative) return undefined;
    // Use contract address from selected asset (populated by AssetPicker from static lists)
    if (selectedAsset.contractAddress) return selectedAsset.contractAddress;
    // Fallback: Find in ERC20_TOKENS
    const chainTokens = ERC20_TOKENS[selectedAsset.chain] || [];
    const found = chainTokens.find((t) => t.symbol === selectedAsset.symbol);
    if (found) return found.address;
    // Fallback: Try from static token list
    const staticToken = getTokenBySymbol(selectedAsset.symbol, selectedAsset.chainId);
    return staticToken?.address;
  }, [selectedAsset]);

  const tokenAddress = resolveTokenAddress();

  // Check wrong chain
  const isWrongChain = selectedAsset && chainId !== selectedAsset.chainId;

  // Validate amount
  const amountNum = parseFloat(amount);
  const hasAmount = !isNaN(amountNum) && amountNum > 0;
  const insufficientBalance = hasAmount && selectedAsset &&
    amountNum > parseFloat(selectedAsset.balance);

  // Validate address (memoized to prevent new object reference each render)
  const addrValidation = useMemo(
    () => destinationAddress ? validateAddress(destinationAddress) : null,
    [destinationAddress],
  );
  const isAddressValid = addrValidation?.valid ||
    (destinationAddress.endsWith('.eth') && chainId === 1);

  // Address error for display
  const addressError = destinationAddress && !isAddressValid && !destinationAddress.endsWith('.eth')
    ? addrValidation?.error || 'Invalid address'
    : null;

  // Native balance for gas checks
  const nativeBalance = (() => {
    if (!selectedAsset) return 0n;
    const chainName = selectedAsset.chain;
    const chainBal = balances[chainName];
    if (!chainBal?.native_balance?.balance_raw) return 0n;
    try {
      return BigInt(chainBal.native_balance.balance_raw);
    } catch {
      try { return parseEther(chainBal.native_balance.balance); }
      catch { return 0n; }
    }
  })();

  // Can afford gas?
  const gasAffordability = feeEstimate && hasAmount
    ? checkCanAffordGas(
        nativeBalance,
        selectedAsset?.isNative ? parseEther(amount || '0') : 0n,
        feeEstimate,
        selectedAsset?.isNative || false,
      )
    : { canAfford: true, shortfallWei: 0n };

  // ─── Gas estimation (debounced) ──────────────────────────────────

  const estimateGas = useCallback(async () => {
    if (!provider || !selectedAsset || !hasAmount || !isAddressValid || isWrongChain) {
      return;
    }

    const resolvedAddr = addrValidation?.checksummed || destinationAddress;
    if (!resolvedAddr || !address) return;

    setStatus('estimating');
    setEstimateError(null);

    try {
      const amountWei = parseAmount(amount, selectedAsset.decimals);

      let txRequest;
      if (selectedAsset.isNative) {
        txRequest = buildNativeTransfer(resolvedAddr, amountWei);
      } else if (tokenAddress) {
        txRequest = buildERC20Transfer(tokenAddress, resolvedAddr, amountWei);
      } else {
        throw new Error('Token contract address not found');
      }

      // Add from address for estimation
      txRequest.from = address;

      console.log('[Send] Estimating gas...', { to: resolvedAddr, isNative: selectedAsset.isNative, amount });
      const fee = await estimateTransferFee(provider, txRequest, gasMode);
      console.log('[Send] Gas estimated:', { gasLimit: fee.gasLimit.toString(), totalFee: fee.totalFeeWei.toString() });
      setFeeEstimate(fee);
      lastEstimateRef.current = fee;
      setStatus('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to estimate gas';
      console.error('[Send] Gas estimation failed:', msg, err);
      setEstimateError(msg);
      // Keep last good estimate visible
      if (lastEstimateRef.current) {
        setFeeEstimate(lastEstimateRef.current);
      }
      setStatus('idle');
    }
  }, [provider, selectedAsset, amount, hasAmount, isAddressValid, isWrongChain, addrValidation, destinationAddress, address, gasMode, tokenAddress]);

  // Ref to always hold latest estimateGas without resetting the timer
  const estimateGasRef = useRef(estimateGas);
  estimateGasRef.current = estimateGas;

  // Debounced estimation trigger — deps are only the values that should re-trigger
  useEffect(() => {
    if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current);

    if (!hasAmount || !isAddressValid || !selectedAsset || isWrongChain || !provider) {
      return;
    }

    estimateTimerRef.current = setTimeout(() => estimateGasRef.current(), 400);

    return () => {
      if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current);
    };
  }, [amount, destinationAddress, selectedAsset, gasMode, hasAmount, isAddressValid, isWrongChain, provider]);

  // ─── Amount helpers ──────────────────────────────────────────────

  const handleAmountChange = (val: string) => {
    // Allow decimal input, prevent scientific notation
    const cleaned = val.replace(/[^0-9.]/g, '');
    // Prevent multiple dots
    const parts = cleaned.split('.');
    if (parts.length > 2) return;
    setAmount(cleaned);
    // Reset tx state when amount changes
    if (status === 'success' || status === 'error') {
      setStatus('idle');
      setTxHash(null);
      setTxError(null);
    }
  };

  const handlePercentage = (pct: number) => {
    if (!selectedAsset) return;

    if (pct === 100 && selectedAsset.isNative && feeEstimate) {
      // Max for native: subtract gas buffer
      const maxWei = calculateMaxNativeSend(nativeBalance, feeEstimate);
      if (maxWei <= 0n) {
        setAmount('0');
        return;
      }
      setAmount(formatEther(maxWei));
    } else {
      const bal = parseFloat(selectedAsset.balance);
      const value = (bal * pct) / 100;
      // Truncate to token decimals
      const decimals = selectedAsset.decimals;
      const factor = Math.pow(10, Math.min(decimals, 8));
      setAmount((Math.floor(value * factor) / factor).toString());
    }
  };

  // ─── Send execution ──────────────────────────────────────────────

  const handleSend = async () => {
    if (!selectedAsset || !hasAmount || !isAddressValid || !provider || !address || !feeEstimate) return;

    const resolvedAddr = addrValidation?.checksummed || destinationAddress;
    if (!resolvedAddr) return;

    try {
      setStatus('signing');
      setTxError(null);
      toast.info('Confirm transaction in your wallet...');

      const signer = await getSigner();
      const amountWei = parseAmount(amount, selectedAsset.decimals);

      let txRequest;
      if (selectedAsset.isNative) {
        txRequest = buildNativeTransfer(resolvedAddr, amountWei);
      } else if (tokenAddress) {
        txRequest = buildERC20Transfer(tokenAddress, resolvedAddr, amountWei);
      } else {
        throw new Error('Token contract address not found');
      }

      // Add gas params
      txRequest.gasLimit = feeEstimate.gasLimit;
      if (feeEstimate.isEip1559 && feeEstimate.maxFeePerGas) {
        txRequest.maxFeePerGas = feeEstimate.maxFeePerGas;
        if (feeEstimate.maxPriorityFeePerGas) {
          txRequest.maxPriorityFeePerGas = feeEstimate.maxPriorityFeePerGas;
        }
      } else if (feeEstimate.gasPrice) {
        txRequest.gasPrice = feeEstimate.gasPrice;
      }

      setStatus('broadcasting');
      const tx = await signer.sendTransaction(txRequest);

      setTxHash(tx.hash);
      setStatus('confirming');

      // Record as pending activity
      addRecentAddress(resolvedAddr);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        setStatus('success');
        toast.success('Transfer sent successfully!');

        // Record in swap history as a "transfer" type for Activity panel
        try {
          const historyStore = useSwapHistoryStore.getState();
          historyStore.addRecord({
            chainId: selectedAsset.chainId,
            timestamp: Date.now(),
            status: 'success',
            provider: 'transfer',
            slippage: 0,
            fromAsset: {
              symbol: selectedAsset.symbol,
              name: selectedAsset.name,
              chain: selectedAsset.chain,
              decimals: selectedAsset.decimals,
              is_native: selectedAsset.isNative,
              contract_address: tokenAddress,
            },
            toAsset: {
              symbol: selectedAsset.symbol,
              name: selectedAsset.name,
              chain: selectedAsset.chain,
              decimals: selectedAsset.decimals,
              is_native: selectedAsset.isNative,
              contract_address: tokenAddress,
            },
            fromAmount: amount,
            toAmount: amount,
            txHash: tx.hash,
            explorerUrl: getExplorerUrl(selectedAsset.chainId, tx.hash),
          });
        } catch {
          // Non-critical: activity recording failure doesn't affect send
        }

        // Refresh balances
        fetchBalances(address, [selectedAsset.chain]);
      } else {
        throw new Error('Transaction failed on-chain');
      }
    } catch (err) {
      if (isUserRejection(err)) {
        setStatus('idle');
        toast.warning('Transaction rejected');
        return;
      }
      const parsed = parseTransactionError(err);
      setTxError(parsed.message);
      setStatus('error');
      toast.error(parsed.message);
    }
  };

  // ─── Reset after success ─────────────────────────────────────────

  const handleNewSend = () => {
    setAmount('');
    setDestinationAddress('');
    setFeeEstimate(null);
    setTxHash(null);
    setTxError(null);
    setEstimateError(null);
    setStatus('idle');
    lastEstimateRef.current = null;
  };

  // ─── Button state ────────────────────────────────────────────────

  const getButtonText = (): string => {
    if (status === 'success') return 'Send Another';
    if (status === 'signing') return 'Confirm in Wallet...';
    if (status === 'broadcasting') return 'Broadcasting...';
    if (status === 'confirming') return 'Confirming...';
    if (status === 'estimating') return 'Estimating Gas...';
    if (isReadOnly) return 'View-Only Mode';
    if (!selectedAsset) return 'Select Asset';
    if (isWrongChain) return `Switch to ${getChainName(selectedAsset.chainId)}`;
    if (!amount || !hasAmount) return 'Enter Amount';
    if (insufficientBalance) return 'Insufficient Balance';
    if (!destinationAddress) return 'Enter Address';
    if (!isAddressValid) return 'Invalid Address';
    if (!gasAffordability.canAfford) return `Insufficient ${nativeSymbol} for Gas`;
    // Show clear feedback when fee estimate is missing
    if (estimateError && !feeEstimate) return 'Retry Gas Estimate';
    if (!feeEstimate) return 'Estimating Gas...';
    return 'Send';
  };

  const isButtonDisabled = (): boolean => {
    if (status === 'success') return false;
    if (status === 'signing' || status === 'broadcasting' || status === 'confirming') return true;
    if (status === 'estimating') return true;
    if (isReadOnly) return true;
    if (!selectedAsset) return true;
    if (isWrongChain) return false; // Allow click to switch network
    if (!hasAmount || insufficientBalance) return true;
    if (!isAddressValid) return true;
    if (!gasAffordability.canAfford) return true;
    // Allow retry click when estimation failed
    if (!feeEstimate && estimateError) return false;
    if (!feeEstimate) return true;
    return false;
  };

  const handleButtonClick = () => {
    if (status === 'success') {
      handleNewSend();
      return;
    }
    if (isWrongChain && selectedAsset) {
      switchNetwork(selectedAsset.chainId).catch(() => {});
      return;
    }
    // Retry gas estimation if it failed
    if (!feeEstimate && estimateError) {
      estimateGas();
      return;
    }
    handleSend();
  };

  const isExecuting = ['signing', 'broadcasting', 'confirming'].includes(status);

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-md mx-auto bg-dark-900 rounded-2xl p-4 border border-dark-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Send</h2>
        {status === 'success' && (
          <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full">
            Sent
          </span>
        )}
      </div>

      {/* Wrong chain banner */}
      {isWrongChain && selectedAsset && (
        <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-xl text-sm text-yellow-400 flex items-center justify-between">
          <span>Wrong network. Switch to {getChainName(selectedAsset.chainId)}</span>
          <button
            onClick={() => switchNetwork(selectedAsset.chainId)}
            className="text-xs bg-yellow-800 hover:bg-yellow-700 px-2 py-1 rounded-lg transition-colors"
          >
            Switch
          </button>
        </div>
      )}

      {/* Success state */}
      {status === 'success' && txHash && selectedAsset && (
        <div className="mb-4 p-4 bg-green-900/20 border border-green-800 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-400 font-medium">Transfer Confirmed</span>
          </div>
          <p className="text-sm text-dark-300 mb-2">
            Sent {amount} {selectedAsset.symbol} to {shortenAddress(destinationAddress, 6)}
          </p>
          <div className="flex items-center gap-2">
            <a
              href={getExplorerUrl(selectedAsset.chainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-400 hover:text-primary-300 underline"
            >
              View on Explorer
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(txHash)}
              className="text-xs text-dark-400 hover:text-white"
            >
              Copy Hash
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && txError && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400">
          {txError}
        </div>
      )}

      {/* Asset Picker */}
      <AssetPicker
        selected={selectedAsset}
        onSelect={(asset) => {
          setSelectedAsset(asset);
          setFeeEstimate(null);
          lastEstimateRef.current = null;
          setEstimateError(null);
          if (status === 'success' || status === 'error') {
            setStatus('idle');
            setTxHash(null);
            setTxError(null);
          }
        }}
      />

      {/* Amount Input */}
      <div className={`bg-dark-800 rounded-xl p-4 mb-4 ${insufficientBalance ? 'border border-red-800' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-dark-400">Amount</span>
          {selectedAsset && (
            <span className="text-sm text-dark-400">
              Balance: {parseFloat(selectedAsset.balance).toFixed(
                Math.min(selectedAsset.decimals, 6),
              )}
            </span>
          )}
        </div>

        <input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          className="w-full bg-transparent text-2xl font-medium outline-none mb-2"
          disabled={!selectedAsset || isExecuting}
        />

        {/* Quick chips */}
        {selectedAsset && (
          <div className="flex items-center gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => handlePercentage(pct)}
                disabled={isExecuting}
                className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {pct === 100 ? 'Max' : `${pct}%`}
              </button>
            ))}
          </div>
        )}

        {/* Validation messages */}
        {insufficientBalance && (
          <p className="text-xs text-red-400 mt-2">Insufficient balance</p>
        )}
        {hasAmount && selectedAsset && !selectedAsset.isNative && !gasAffordability.canAfford && feeEstimate && (
          <p className="text-xs text-yellow-400 mt-2">
            You need {nativeSymbol} to pay for gas fees
          </p>
        )}
      </div>

      {/* Destination Address */}
      <AddressInput
        value={destinationAddress}
        onChange={(addr) => {
          setDestinationAddress(addr);
          if (status === 'success' || status === 'error') {
            setStatus('idle');
            setTxHash(null);
            setTxError(null);
          }
        }}
        chainId={chainId}
        ownAddress={address}
        error={addressError}
      />

      {/* Fee Preview */}
      {selectedAsset && hasAmount && isAddressValid && !isWrongChain && (
        <FeePreview
          feeEstimate={feeEstimate}
          isEstimating={status === 'estimating'}
          estimateError={estimateError}
          sendAmount={amount}
          tokenSymbol={selectedAsset.symbol}
          isNativeToken={selectedAsset.isNative}
          chainId={selectedAsset.chainId}
          canAffordGas={gasAffordability.canAfford}
          shortfallWei={gasAffordability.shortfallWei}
          gasMode={gasMode}
          onGasModeChange={(mode) => {
            setGasMode(mode);
            // Re-estimate with new mode
            setFeeEstimate(null);
            lastEstimateRef.current = null;
          }}
          onRetry={estimateGas}
        />
      )}

      {/* Send Button */}
      <Button
        onClick={handleButtonClick}
        disabled={isButtonDisabled()}
        loading={isExecuting}
        fullWidth
        size="lg"
      >
        {getButtonText()}
      </Button>

      {/* Confirming status */}
      {status === 'confirming' && txHash && selectedAsset && (
        <div className="mt-3 p-3 bg-dark-800 rounded-xl text-center">
          <p className="text-sm text-dark-300 mb-1">Transaction broadcasted</p>
          <a
            href={getExplorerUrl(selectedAsset.chainId, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-400 hover:text-primary-300"
          >
            {shortenAddress(txHash, 8)} - View on Explorer
          </a>
        </div>
      )}

      {/* Security footer */}
      <p className="text-xs text-dark-500 text-center mt-3">
        All transactions are signed locally in your wallet
      </p>
    </div>
  );
}

export default SendPage;
