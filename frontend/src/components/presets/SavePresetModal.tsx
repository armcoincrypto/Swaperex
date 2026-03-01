/**
 * Save Preset Modal
 *
 * Modal for saving the current swap setup as a preset.
 * Includes optional Smart Protection guards for safety checks.
 */

import { useState } from 'react';
import { usePresetStore, type PresetGuards } from '@/stores/presetStore';
import { useWalletStore } from '@/stores/walletStore';
import { getDefaultGuards } from '@/services/presetGuardService';
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Smart Protection guards state
  const defaultGuards = getDefaultGuards();
  const [guardsEnabled, setGuardsEnabled] = useState(false);
  const [guardMode, setGuardMode] = useState<'soft' | 'hard'>('soft');
  const [minSafetyScore, setMinSafetyScore] = useState(defaultGuards.minSafetyScore?.toString() || '70');
  const [maxPriceImpact, setMaxPriceImpact] = useState(defaultGuards.maxPriceImpact?.toString() || '2.5');
  const [minLiquidity, setMinLiquidity] = useState(defaultGuards.minLiquidityUsd?.toString() || '50000');
  const [useSafetyScore, setUseSafetyScore] = useState(true);
  const [usePriceImpact, setUsePriceImpact] = useState(true);
  const [useLiquidity, setUseLiquidity] = useState(false);

  const { address, chainId } = useWalletStore();
  const { addPreset, getPresetsForWallet } = usePresetStore();

  if (!isOpen) return null;

  // Build guards object from state
  const buildGuards = (): PresetGuards | undefined => {
    if (!guardsEnabled) return undefined;

    return {
      enabled: true,
      mode: guardMode,
      minSafetyScore: useSafetyScore ? parseFloat(minSafetyScore) : undefined,
      maxPriceImpact: usePriceImpact ? parseFloat(maxPriceImpact) : undefined,
      minLiquidityUsd: useLiquidity ? parseFloat(minLiquidity) : undefined,
    };
  };

  const resetState = () => {
    setName('');
    setSkipConfirmation(false);
    setError(null);
    setShowAdvanced(false);
    setGuardsEnabled(false);
    setGuardMode('soft');
    setMinSafetyScore(defaultGuards.minSafetyScore?.toString() || '70');
    setMaxPriceImpact(defaultGuards.maxPriceImpact?.toString() || '2.5');
    setMinLiquidity(defaultGuards.minLiquidityUsd?.toString() || '50000');
    setUseSafetyScore(true);
    setUsePriceImpact(true);
    setUseLiquidity(false);
  };

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
      guards: buildGuards(),
    });

    resetState();
    onClose();
  };

  const handleClose = () => {
    resetState();
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

          {/* Advanced Section - Smart Protection */}
          <div className="border border-dark-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-3 hover:bg-dark-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShieldIcon />
                <span className="text-sm font-medium">Smart Protection</span>
                {guardsEnabled && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary-600/30 text-primary-400">
                    Enabled
                  </span>
                )}
              </div>
              <ChevronIcon isOpen={showAdvanced} />
            </button>

            {showAdvanced && (
              <div className="p-3 pt-0 space-y-3 border-t border-dark-700">
                {/* Enable Guards Toggle */}
                <div className="flex items-center justify-between p-2 bg-dark-800 rounded-lg">
                  <div>
                    <div className="text-sm font-medium">Enable Protection</div>
                    <p className="text-xs text-dark-400">Add safety checks to this preset</p>
                  </div>
                  <ToggleButton
                    enabled={guardsEnabled}
                    onChange={setGuardsEnabled}
                    color="primary"
                  />
                </div>

                {guardsEnabled && (
                  <>
                    {/* Guard Mode */}
                    <div className="p-2 bg-dark-800 rounded-lg">
                      <div className="text-sm font-medium mb-2">Protection Mode</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setGuardMode('soft')}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                            guardMode === 'soft'
                              ? 'bg-primary-600 text-white'
                              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                          }`}
                        >
                          <div className="font-medium">Advise Only</div>
                          <div className="text-xs opacity-70">Show warnings</div>
                        </button>
                        <button
                          onClick={() => setGuardMode('hard')}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                            guardMode === 'hard'
                              ? 'bg-red-600 text-white'
                              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                          }`}
                        >
                          <div className="font-medium">Block Unsafe</div>
                          <div className="text-xs opacity-70">Prevent execution</div>
                        </button>
                      </div>
                    </div>

                    {/* Guard Conditions */}
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-dark-400">Conditions</div>

                      {/* Safety Score */}
                      <div className="flex items-center gap-3 p-2 bg-dark-800 rounded-lg">
                        <input
                          type="checkbox"
                          checked={useSafetyScore}
                          onChange={(e) => setUseSafetyScore(e.target.checked)}
                          className="w-4 h-4 rounded accent-primary-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm">Safety Score ≥</span>
                        </div>
                        <input
                          type="number"
                          value={minSafetyScore}
                          onChange={(e) => setMinSafetyScore(e.target.value)}
                          disabled={!useSafetyScore}
                          className="w-16 px-2 py-1 bg-dark-700 rounded text-sm text-center disabled:opacity-50"
                          min="0"
                          max="100"
                        />
                      </div>

                      {/* Price Impact */}
                      <div className="flex items-center gap-3 p-2 bg-dark-800 rounded-lg">
                        <input
                          type="checkbox"
                          checked={usePriceImpact}
                          onChange={(e) => setUsePriceImpact(e.target.checked)}
                          className="w-4 h-4 rounded accent-primary-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm">Price Impact ≤</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={maxPriceImpact}
                            onChange={(e) => setMaxPriceImpact(e.target.value)}
                            disabled={!usePriceImpact}
                            className="w-16 px-2 py-1 bg-dark-700 rounded text-sm text-center disabled:opacity-50"
                            min="0"
                            max="50"
                            step="0.1"
                          />
                          <span className="text-dark-400 text-sm">%</span>
                        </div>
                      </div>

                      {/* Liquidity */}
                      <div className="flex items-center gap-3 p-2 bg-dark-800 rounded-lg">
                        <input
                          type="checkbox"
                          checked={useLiquidity}
                          onChange={(e) => setUseLiquidity(e.target.checked)}
                          className="w-4 h-4 rounded accent-primary-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm">Liquidity ≥</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-dark-400 text-sm">$</span>
                          <input
                            type="number"
                            value={minLiquidity}
                            onChange={(e) => setMinLiquidity(e.target.value)}
                            disabled={!useLiquidity}
                            className="w-20 px-2 py-1 bg-dark-700 rounded text-sm text-center disabled:opacity-50"
                            min="0"
                            step="1000"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Mode Explanation */}
                    <div className="text-xs text-dark-500 p-2 bg-dark-800/50 rounded-lg">
                      {guardMode === 'soft' ? (
                        <span>
                          <strong>Advise mode:</strong> Shows warnings if conditions fail, but allows execution.
                        </span>
                      ) : (
                        <span>
                          <strong>Block mode:</strong> Prevents execution if any condition fails.
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

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

function ShieldIcon() {
  return (
    <svg className="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ToggleButton({
  enabled,
  onChange,
  color = 'primary',
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  color?: 'primary' | 'yellow';
}) {
  const bgColor = enabled
    ? color === 'yellow'
      ? 'bg-yellow-500'
      : 'bg-primary-500'
    : 'bg-dark-600';

  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-12 h-6 rounded-full transition-colors ${bgColor}`}
    >
      <div
        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default SavePresetModal;
