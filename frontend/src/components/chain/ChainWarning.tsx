/**
 * Chain Warning Component
 *
 * Displays warnings when user is on wrong/unsupported chain.
 */

import { Button } from '@/components/common/Button';
import { getChainName, getChainIcon } from '@/utils/format';
import { SUPPORTED_CHAIN_IDS } from '@/utils/constants';

interface ChainWarningProps {
  currentChainId: number;
  requiredChainId?: number;
  onSwitchChain: (chainId: number) => Promise<void>;
  isSwitching?: boolean;
}

export function ChainWarning({
  currentChainId,
  requiredChainId,
  onSwitchChain,
  isSwitching = false,
}: ChainWarningProps) {
  const isUnsupported = !SUPPORTED_CHAIN_IDS.includes(currentChainId);
  const currentChainName = getChainName(currentChainId);

  // Unsupported chain
  if (isUnsupported) {
    return (
      <div className="bg-red-900/20 border border-red-600 rounded-xl p-4">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <WarningIcon />
          <span className="font-bold">Unsupported Network</span>
        </div>
        <p className="text-sm text-dark-300 mb-3">
          You're connected to <strong>{currentChainName || `Chain ${currentChainId}`}</strong>,
          which is not supported. Please switch to a supported network.
        </p>
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_CHAIN_IDS.slice(0, 4).map((chainId) => (
            <Button
              key={chainId}
              variant="secondary"
              size="sm"
              onClick={() => onSwitchChain(chainId)}
              loading={isSwitching}
            >
              {getChainName(chainId)}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Wrong chain for specific action
  if (requiredChainId && currentChainId !== requiredChainId) {
    const requiredChainName = getChainName(requiredChainId);

    return (
      <div className="bg-yellow-900/20 border border-yellow-600 rounded-xl p-4">
        <div className="flex items-center gap-2 text-yellow-400 mb-2">
          <WarningIcon />
          <span className="font-bold">Wrong Network</span>
        </div>
        <p className="text-sm text-dark-300 mb-3">
          You're on <strong>{currentChainName}</strong>, but this action requires{' '}
          <strong>{requiredChainName}</strong>.
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onSwitchChain(requiredChainId)}
          loading={isSwitching}
        >
          Switch to {requiredChainName}
        </Button>
      </div>
    );
  }

  return null;
}

/**
 * Compact chain indicator badge
 */
export function ChainBadge({
  chainId,
  showStatus = true,
}: {
  chainId: number;
  showStatus?: boolean;
}) {
  const isSupported = SUPPORTED_CHAIN_IDS.includes(chainId);
  const chainName = getChainName(chainId);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${
        isSupported
          ? 'bg-dark-700 text-dark-200'
          : 'bg-red-900/30 text-red-400'
      }`}
    >
      <ChainIcon chainId={chainId} />
      <span>{chainName}</span>
      {showStatus && !isSupported && (
        <span className="text-red-400">✗</span>
      )}
    </div>
  );
}

/**
 * Chain selector for switching networks
 */
export function ChainSelector({
  currentChainId,
  onSelect,
  disabled = false,
}: {
  currentChainId: number;
  onSelect: (chainId: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUPPORTED_CHAIN_IDS.map((chainId) => (
        <button
          key={chainId}
          onClick={() => onSelect(chainId)}
          disabled={disabled}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            chainId === currentChainId
              ? 'bg-primary-600 text-white'
              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <ChainIcon chainId={chainId} />
          {getChainName(chainId)}
        </button>
      ))}
    </div>
  );
}

/**
 * Banner shown at top of page when on wrong chain
 */
export function ChainWarningBanner({
  chainId,
  onSwitch,
  onDismiss,
}: {
  chainId: number;
  onSwitch: () => void;
  onDismiss: () => void;
}) {
  const chainName = getChainName(chainId);
  const isUnsupported = !SUPPORTED_CHAIN_IDS.includes(chainId);

  if (!isUnsupported) return null;

  return (
    <div className="bg-yellow-900/90 text-yellow-100 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WarningIcon />
          <span className="text-sm">
            <strong>{chainName || `Chain ${chainId}`}</strong> is not supported.
            Some features may be unavailable.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitch}
            className="px-3 py-1 bg-yellow-800 hover:bg-yellow-700 rounded text-sm font-medium transition-colors"
          >
            Switch Network
          </button>
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-yellow-800 rounded transition-colors"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// Icons
function WarningIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
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

function ChainIcon({ chainId }: { chainId: number }) {
  // Simple circle indicator - could be replaced with actual chain icons
  const colors: Record<number, string> = {
    1: 'bg-blue-500',      // Ethereum
    56: 'bg-yellow-500',   // BSC
    137: 'bg-purple-500',  // Polygon
    42161: 'bg-blue-400',  // Arbitrum
    10: 'bg-red-500',      // Optimism
    43114: 'bg-red-600',   // Avalanche
  };

  return (
    <div className={`w-3 h-3 rounded-full ${colors[chainId] || 'bg-dark-400'}`} />
  );
}

export default ChainWarning;
