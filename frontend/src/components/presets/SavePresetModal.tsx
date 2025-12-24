/**
 * Save Preset Modal
 *
 * Modal for saving the current swap setup as a preset.
 */

import { useState } from 'react';
import { usePresetStore } from '@/stores/presetStore';
import { useWalletStore } from '@/stores/walletStore';
import type { AssetInfo } from '@/types/api';

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromAsset: AssetInfo;
  toAsset: AssetInfo;
  fromAmount: string;
  slippage: number;
}

export function SavePresetModal({
  isOpen,
  onClose,
  fromAsset,
  toAsset,
  fromAmount,
  slippage,
}: SavePresetModalProps) {
  const [name, setName] = useState('');
  const [skipConfirmation, setSkipConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { address, chainId } = useWalletStore();
  const { addPreset, getPresetsForWallet } = usePresetStore();

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) {
      setError('Please enter a name for this preset');
      return;
    }

    if (!address || !chainId) {
      setError('Wallet not connected');
      return;
    }

    // Check for duplicate names
    const existingPresets = getPresetsForWallet(chainId, address);
    if (existingPresets.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())) {
      setError('A preset with this name already exists');
      return;
    }

    addPreset({
      name: name.trim(),
      fromAsset,
      toAsset,
      fromAmount,
      slippage,
      skipConfirmation,
      walletAddress: address,
      chainId,
    });

    // Reset and close
    setName('');
    setSkipConfirmation(false);
    setError(null);
    onClose();
  };

  const handleClose = () => {
    setName('');
    setSkipConfirmation(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-900 rounded-2xl w-full max-w-md mx-4 border border-dark-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 className="text-lg font-bold">Save Preset</h3>
          <button
            onClick={handleClose}
            className="p-1 text-dark-400 hover:text-white transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Preset Summary */}
          <div className="bg-dark-800 rounded-xl p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-dark-400">Swap</span>
              <div className="flex items-center gap-2">
                <span className="text-primary-400 font-medium">{fromAmount}</span>
                <span>{fromAsset.symbol}</span>
                <ArrowIcon />
                <span>{toAsset.symbol}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-dark-400">Slippage</span>
              <span>{slippage}%</span>
            </div>
          </div>

          {/* Name Input */}
          <div>
            <label className="block text-sm text-dark-400 mb-2">Preset Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Quick ETH to USDT"
              className="w-full px-4 py-3 bg-dark-800 rounded-xl border border-dark-700 focus:border-primary-500 outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* Skip Confirmation Toggle */}
          <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl">
            <div>
              <div className="flex items-center gap-2">
                <BoltIcon />
                <span className="font-medium text-sm">Instant Swap</span>
              </div>
              <p className="text-xs text-dark-400 mt-1">
                Skip confirmation modal and execute immediately
              </p>
            </div>
            <button
              onClick={() => setSkipConfirmation(!skipConfirmation)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                skipConfirmation ? 'bg-yellow-500' : 'bg-dark-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  skipConfirmation ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {skipConfirmation && (
            <div className="flex items-start gap-2 p-3 bg-yellow-900/20 border border-yellow-800 rounded-xl text-sm text-yellow-400">
              <WarningIcon />
              <span>
                With instant swap enabled, the transaction will execute immediately when you
                select this preset. Make sure you trust this swap setup.
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400 text-center">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-dark-700">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-primary-600 hover:bg-primary-500 rounded-xl font-medium transition-colors"
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  );
}

// Icons
function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

export default SavePresetModal;
