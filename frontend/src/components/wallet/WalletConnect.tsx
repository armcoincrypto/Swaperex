/**
 * Wallet Connect Component
 *
 * Handles wallet connection flow with improved UX.
 * NEVER receives private keys - only public address.
 *
 * States handled:
 * - DISCONNECTED: Show connect button or install MetaMask CTA
 * - CONNECTING: Show spinner while waiting for wallet approval
 * - CONNECTED: Show address with chain badge
 * - WRONG_CHAIN: Show warning with switch button
 * - READ_ONLY: Show view-only badge
 * - ERROR: Show error with retry button
 */

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/common/Button';
import { shortenAddress } from '@/utils/format';
import { SUPPORTED_CHAIN_IDS } from '@/utils/constants';

export function WalletConnect() {
  const {
    isConnected,
    isConnecting,
    isReadOnly,
    isSwitchingChain,
    address,
    chainId,
    hasInjectedWallet,
    error,
    connectInjected,
    disconnect,
    switchNetwork,
    enterReadOnlyMode,
    exitReadOnlyMode,
    clearError,
  } = useWallet();

  const [showMenu, setShowMenu] = useState(false);
  const [showReadOnlyInput, setShowReadOnlyInput] = useState(false);
  const [readOnlyAddress, setReadOnlyAddress] = useState('');
  const [addressError, setAddressError] = useState('');

  // Handle read-only mode submission
  const handleReadOnlySubmit = () => {
    setAddressError('');
    const success = enterReadOnlyMode(readOnlyAddress);
    if (success) {
      setShowReadOnlyInput(false);
      setReadOnlyAddress('');
    } else {
      setAddressError('Invalid address format (must be 0x...)');
    }
  };

  // Handle retry after error
  const handleRetry = () => {
    clearError();
    connectInjected();
  };

  // Handle chain switch from connected state
  const handleSwitchToSupported = async () => {
    try {
      // Switch to Ethereum mainnet as default
      await switchNetwork(1);
    } catch (err) {
      console.error('Failed to switch network:', err);
    }
  };

  // Connected state
  if (isConnected && address) {
    const isUnsupportedChain = !SUPPORTED_CHAIN_IDS.includes(chainId);

    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            isUnsupportedChain
              ? 'bg-red-900/30 border border-red-600 hover:bg-red-900/50'
              : 'bg-dark-800 hover:bg-dark-700'
          }`}
        >
          {/* Status indicator */}
          <div
            className={`w-2 h-2 rounded-full ${
              isReadOnly
                ? 'bg-yellow-500'
                : isUnsupportedChain
                ? 'bg-red-500'
                : 'bg-green-500'
            }`}
          />

          {/* Address */}
          <span className="font-medium">{shortenAddress(address)}</span>

          {/* Read-only badge */}
          {isReadOnly && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-900/50 text-yellow-400">
              View Only
            </span>
          )}

          {/* Chain badge */}
          {!isReadOnly && (
            <ChainBadge chainId={chainId} isUnsupported={isUnsupportedChain} />
          )}

          {/* Warning icon for wrong chain */}
          {isUnsupportedChain && !isReadOnly && <WarningIcon />}
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div className="absolute right-0 mt-2 w-56 bg-dark-800 rounded-lg shadow-lg border border-dark-700 py-1 z-50">
            {/* Copy address */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(address);
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left hover:bg-dark-700 transition-colors flex items-center gap-2"
            >
              <CopyIcon />
              Copy Address
            </button>

            {/* Switch network (if on wrong chain) */}
            {isUnsupportedChain && !isReadOnly && (
              <button
                onClick={() => {
                  handleSwitchToSupported();
                  setShowMenu(false);
                }}
                disabled={isSwitchingChain}
                className="w-full px-4 py-2 text-left hover:bg-dark-700 transition-colors flex items-center gap-2 text-yellow-400"
              >
                <SwitchIcon />
                {isSwitchingChain ? 'Switching...' : 'Switch Network'}
              </button>
            )}

            {/* Exit read-only / Disconnect */}
            <button
              onClick={() => {
                if (isReadOnly) {
                  exitReadOnlyMode();
                } else {
                  disconnect();
                }
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-red-400 hover:bg-dark-700 transition-colors flex items-center gap-2"
            >
              <DisconnectIcon />
              {isReadOnly ? 'Exit View Mode' : 'Disconnect'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Read-only address input mode
  if (showReadOnlyInput) {
    return (
      <div className="flex flex-col gap-2 w-64">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="0x..."
            value={readOnlyAddress}
            onChange={(e) => setReadOnlyAddress(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-dark-800 border border-dark-600 focus:border-primary-500 outline-none text-sm"
          />
          <Button
            onClick={handleReadOnlySubmit}
            variant="secondary"
            size="sm"
          >
            View
          </Button>
        </div>
        {addressError && (
          <p className="text-xs text-red-400">{addressError}</p>
        )}
        <button
          onClick={() => {
            setShowReadOnlyInput(false);
            setReadOnlyAddress('');
            setAddressError('');
          }}
          className="text-xs text-dark-400 hover:text-dark-200"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Disconnected state with error
  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800">
          <ErrorIcon />
          <span className="text-sm text-red-400">{error}</span>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRetry} variant="primary" size="sm">
            Try Again
          </Button>
          <Button onClick={clearError} variant="ghost" size="sm">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Disconnected state
  return (
    <div className="flex flex-col gap-2">
      {hasInjectedWallet ? (
        <>
          <Button
            onClick={connectInjected}
            loading={isConnecting}
            variant="primary"
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </Button>
          {isConnecting && (
            <p className="text-xs text-dark-400 text-center">
              Please approve in your wallet
            </p>
          )}
        </>
      ) : (
        <Button
          variant="secondary"
          onClick={() => window.open('https://metamask.io/download/', '_blank')}
        >
          Install MetaMask
        </Button>
      )}

      {/* View-only mode link */}
      <button
        onClick={() => setShowReadOnlyInput(true)}
        className="text-xs text-dark-400 hover:text-primary-400 transition-colors"
      >
        Or enter address to view
      </button>
    </div>
  );
}

// Chain badge component
function ChainBadge({ chainId, isUnsupported }: { chainId: number; isUnsupported: boolean }) {
  const chainNames: Record<number, string> = {
    1: 'ETH',
    56: 'BSC',
    137: 'MATIC',
    42161: 'ARB',
    10: 'OP',
    43114: 'AVAX',
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs rounded ${
        isUnsupported
          ? 'bg-red-900/50 text-red-400'
          : 'bg-dark-700 text-dark-300'
      }`}
    >
      {chainNames[chainId] || `Chain ${chainId}`}
    </span>
  );
}

// Icons
function WarningIcon() {
  return (
    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function SwitchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
      />
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}

export default WalletConnect;
