/**
 * Wallet Connect Component
 *
 * Handles wallet connection flow with improved UX.
 * NEVER receives private keys - only public address.
 *
 * Flow:
 * 1. User clicks "Connect Wallet"
 * 2. Wallet selection dropdown appears (MetaMask, WalletConnect, View-only)
 * 3. User selects a wallet type
 * 4. THEN wallet popup opens
 *
 * States handled:
 * - DISCONNECTED: Show connect button
 * - SELECTING: Show wallet options dropdown
 * - CONNECTING: Show spinner while waiting for wallet approval
 * - CONNECTED: Show address with chain badge
 * - WRONG_CHAIN: Show warning with switch button
 * - READ_ONLY: Show view-only badge
 * - ERROR: Show error with retry button
 */

import { useState, useRef, useEffect } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/common/Button';
import { shortenAddress } from '@/utils/format';
import { SUPPORTED_CHAIN_IDS } from '@/utils/constants';

type WalletOption = 'metamask' | 'walletconnect' | 'readonly';

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

  // UI states
  const [showMenu, setShowMenu] = useState(false);
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const [showReadOnlyInput, setShowReadOnlyInput] = useState(false);
  const [readOnlyAddress, setReadOnlyAddress] = useState('');
  const [addressError, setAddressError] = useState('');

  // Track which wallet was selected for retry
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);

  // Ref for click outside handling
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowWalletOptions(false);
      }
    }

    if (showWalletOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showWalletOptions]);

  // Handle wallet selection - popup only opens AFTER user selects
  const handleWalletSelect = async (option: WalletOption) => {
    setSelectedWallet(option);
    setShowWalletOptions(false);

    if (option === 'metamask') {
      try {
        await connectInjected();
      } catch {
        // Error handled in hook, shown in UI
      }
    } else if (option === 'walletconnect') {
      // WalletConnect not yet implemented - show message
      alert('WalletConnect coming soon!');
      setSelectedWallet(null);
    } else if (option === 'readonly') {
      setShowReadOnlyInput(true);
    }
  };

  // Handle read-only mode submission
  const handleReadOnlySubmit = () => {
    console.log('[DEBUG] handleReadOnlySubmit called, address:', readOnlyAddress);
    setAddressError('');

    // Validate before attempting
    if (!readOnlyAddress) {
      console.log('[DEBUG] Empty address - showing inline error');
      setAddressError('Please enter an address');
      return;
    }

    if (!readOnlyAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      console.log('[DEBUG] Invalid address format - showing inline error');
      setAddressError('Invalid address format (must be 0x followed by 40 hex characters)');
      return;
    }

    const success = enterReadOnlyMode(readOnlyAddress);
    console.log('[DEBUG] enterReadOnlyMode result:', success);
    if (success) {
      setShowReadOnlyInput(false);
      setReadOnlyAddress('');
      setSelectedWallet(null);
    } else {
      setAddressError('Failed to load address. Please try again.');
    }
  };

  // Handle retry after error - only retry if user clicks explicitly
  const handleRetry = () => {
    clearError();
    if (selectedWallet === 'metamask') {
      connectInjected();
    } else {
      // Reset to selection state
      setShowWalletOptions(true);
    }
  };

  // Cancel and reset state - HARD RESET everything
  const handleCancel = () => {
    console.log('[DEBUG] handleCancel called - resetting ALL state');
    clearError();
    setSelectedWallet(null);
    setShowWalletOptions(false);
    setShowReadOnlyInput(false);
    setReadOnlyAddress('');
    setAddressError('');
    console.log('[DEBUG] handleCancel complete - all state cleared');
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

  // ===== CONNECTED STATE =====
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

  // ===== READ-ONLY ADDRESS INPUT =====
  if (showReadOnlyInput) {
    return (
      <div className="flex flex-col gap-2 w-72">
        <div className="text-sm text-dark-400 mb-1">Enter wallet address to view</div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="0x..."
            value={readOnlyAddress}
            onChange={(e) => {
              setReadOnlyAddress(e.target.value);
              // Clear error when user starts typing
              if (addressError) setAddressError('');
            }}
            className={`flex-1 px-3 py-2 rounded-lg bg-dark-800 border outline-none text-sm font-mono ${
              addressError ? 'border-red-500' : 'border-dark-600 focus:border-primary-500'
            }`}
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
          onClick={handleCancel}
          className="text-xs text-dark-400 hover:text-dark-200"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ===== ERROR STATE =====
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
          <Button onClick={handleCancel} variant="ghost" size="sm">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ===== CONNECTING STATE =====
  if (isConnecting) {
    return (
      <div className="flex flex-col gap-2 items-center">
        <Button loading variant="primary" disabled>
          Connecting...
        </Button>
        <p className="text-xs text-dark-400 text-center">
          Please approve in your wallet
        </p>
        <button
          onClick={handleCancel}
          className="text-xs text-dark-400 hover:text-dark-200"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ===== DISCONNECTED STATE - WALLET SELECTION =====
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main Connect Button */}
      <Button
        onClick={() => setShowWalletOptions(!showWalletOptions)}
        variant="primary"
      >
        Connect Wallet
      </Button>

      {/* Wallet Selection Dropdown */}
      {showWalletOptions && (
        <div className="absolute right-0 mt-2 w-64 bg-dark-800 rounded-lg shadow-lg border border-dark-700 py-2 z-50">
          <div className="px-3 pb-2 mb-2 border-b border-dark-700">
            <span className="text-xs text-dark-400 uppercase tracking-wide">
              Select Wallet
            </span>
          </div>

          {/* MetaMask Option */}
          {hasInjectedWallet ? (
            <button
              onClick={() => handleWalletSelect('metamask')}
              className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3"
            >
              <MetaMaskIcon />
              <div>
                <div className="font-medium">MetaMask</div>
                <div className="text-xs text-dark-400">Connect with browser wallet</div>
              </div>
            </button>
          ) : (
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3 text-dark-400"
            >
              <MetaMaskIcon />
              <div>
                <div className="font-medium">Install MetaMask</div>
                <div className="text-xs">Browser wallet not detected</div>
              </div>
            </a>
          )}

          {/* WalletConnect Option */}
          <button
            onClick={() => handleWalletSelect('walletconnect')}
            className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3"
          >
            <WalletConnectIcon />
            <div>
              <div className="font-medium">WalletConnect</div>
              <div className="text-xs text-dark-400">Scan with mobile wallet</div>
            </div>
          </button>

          {/* Divider */}
          <div className="my-2 border-t border-dark-700" />

          {/* View-Only Option */}
          <button
            onClick={() => handleWalletSelect('readonly')}
            className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3"
          >
            <EyeIcon />
            <div>
              <div className="font-medium">View Address</div>
              <div className="text-xs text-dark-400">View balances without signing</div>
            </div>
          </button>
        </div>
      )}
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

function MetaMaskIcon() {
  return (
    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21.3 3L13.3 9.3l1.5-3.5L21.3 3z" />
        <path d="M2.7 3l7.9 6.4-1.4-3.5L2.7 3zm15.5 13.1l-2.1 3.2 4.5 1.2 1.3-4.4-3.7 0zm-15.2 0l1.3 4.4 4.5-1.2-2.1-3.2-3.7 0z" />
        <path d="M9.1 10.4l-1.3 1.9 4.5.2-.2-4.9-3 2.8zm5.8 0l-3-2.9-.1 5 4.5-.2-1.4-1.9zM6.6 19.3l2.7-1.3-2.3-1.8-.4 3.1zm5.4-1.3l2.7 1.3-.4-3.1-2.3 1.8z" />
      </svg>
    </div>
  );
}

function WalletConnectIcon() {
  return (
    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.5 9.5C8 7 16 7 18.5 9.5M7.5 12c2-2 7-2 9 0" />
      </svg>
    </div>
  );
}

function EyeIcon() {
  return (
    <div className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center">
      <svg className="w-5 h-5 text-dark-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </div>
  );
}

export default WalletConnect;
