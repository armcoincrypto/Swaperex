/**
 * Wallet Connect Component
 *
 * Handles wallet connection flow:
 * 1. User clicks "Connect Wallet"
 * 2. User may use header "View address" (read-only) or "Connect Wallet" → picker: WalletConnect / view-only
 * 3. After connect: shows address, chain, balance, wallet label
 *
 * NEVER receives private keys — only public address.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/common/Button';
import { shortenAddress } from '@/utils/format';
import { useBalanceStore } from '@/stores/balanceStore';
import { getChain, isSupportedChain, CHAINS } from '@/wallet';

type WalletOption = 'walletconnect' | 'readonly';

/** Disconnected header — short labels; full explanations stay in the picker rows */
const WALLET_ENTRY_LABELS = {
  viewAddressHeader: 'View address',
  viewAddressHeaderTitle: 'Read-only — inspect balances without WalletConnect or signing',
} as const;

export function WalletConnect() {
  const {
    isConnected,
    isConnecting,
    isReadOnly,
    isSwitchingChain,
    address,
    chainId,
    connectorLabel,
    error,
    connectWalletConnect,
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
  const [copied, setCopied] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Native balance from store
  // balanceStore keys by chain name (e.g. "ethereum", "bsc", "polygon")
  const balances = useBalanceStore((s) => s.balances);
  const nativeBalance = (() => {
    const chain = getChain(chainId);
    if (!chain || !address) return null;
    // Find the chain balance entry by matching chain id to known chain names
    const chainNames: Record<number, string> = { 1: 'ethereum', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum', 10: 'optimism', 43114: 'avalanche' };
    const chainName = chainNames[chainId];
    if (!chainName) return null;
    const chainBal = balances[chainName];
    if (!chainBal?.native_balance) return null;
    const num = parseFloat(chainBal.native_balance.balance);
    if (isNaN(num)) return null;
    return `${num.toFixed(4)} ${chain.nativeSymbol}`;
  })();

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowWalletOptions(false);
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showWalletOptions || showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showWalletOptions, showMenu]);

  // Handle wallet selection
  const handleWalletSelect = async (option: WalletOption) => {
    setSelectedWallet(option);
    setShowWalletOptions(false);

    if (option === 'walletconnect') {
      try {
        await connectWalletConnect();
      } catch {
        // Error handled in hook, shown in UI
      }
    } else if (option === 'readonly') {
      setShowReadOnlyInput(true);
    }
  };

  // Handle read-only submission
  const handleReadOnlySubmit = () => {
    setAddressError('');
    if (!readOnlyAddress) {
      setAddressError('Please enter an address');
      return;
    }
    if (!readOnlyAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setAddressError('Invalid address format (must be 0x followed by 40 hex characters)');
      return;
    }
    const success = enterReadOnlyMode(readOnlyAddress);
    if (success) {
      setShowReadOnlyInput(false);
      setReadOnlyAddress('');
      setSelectedWallet(null);
    } else {
      setAddressError('Failed to load address. Please try again.');
    }
  };

  // Retry
  const handleRetry = () => {
    clearError();
    if (selectedWallet === 'walletconnect') {
      connectWalletConnect();
    } else {
      setShowWalletOptions(true);
    }
  };

  // Cancel and reset
  const handleCancel = () => {
    clearError();
    setSelectedWallet(null);
    setShowWalletOptions(false);
    setShowReadOnlyInput(false);
    setReadOnlyAddress('');
    setAddressError('');
  };

  // Copy address
  const handleCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  // Switch to supported chain
  const handleSwitchToSupported = async () => {
    try {
      await switchNetwork(1);
    } catch (err) {
      console.error('Failed to switch network:', err);
    }
  };

  // ===== CONNECTED STATE =====
  if (isConnected && address) {
    const isUnsupported = !isSupportedChain(chainId);
    const chainCfg = getChain(chainId);

    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            isUnsupported
              ? 'bg-red-900/30 border border-red-600 hover:bg-red-900/50'
              : 'bg-dark-800 hover:bg-dark-700'
          }`}
        >
          {/* Status dot */}
          <div
            className={`w-2 h-2 rounded-full ${
              isReadOnly ? 'bg-yellow-500'
              : isUnsupported ? 'bg-red-500'
                : 'bg-green-500'
            }`}
          />

          {/* Address */}
          <span className="font-medium">{shortenAddress(address)}</span>

          {/* Badges */}
          {isReadOnly && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-900/50 text-yellow-400">
              View Only
            </span>
          )}
          {!isReadOnly && (
            <ChainBadge chainId={chainId} isUnsupported={isUnsupported} />
          )}
          {isUnsupported && !isReadOnly && <WarningIcon />}
        </button>

        {/* Connected dropdown */}
        {showMenu && (
          <div className="absolute right-0 mt-2 w-72 bg-dark-800 rounded-lg shadow-lg border border-dark-700 py-1 z-50">
            {/* Header: wallet label + chain */}
            <div className="px-4 py-3 border-b border-dark-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-dark-400 uppercase tracking-wide">
                  {connectorLabel || 'Connected'}
                </span>
                {chainCfg && !isReadOnly && (
                  <span className="text-xs text-dark-400">
                    {chainCfg.name} (ID: {chainId})
                  </span>
                )}
                {isUnsupported && !isReadOnly && (
                  <span className="text-xs text-red-400">
                    Unsupported (ID: {chainId})
                  </span>
                )}
              </div>
              <div className="font-mono text-sm text-white break-all">{address}</div>
              {nativeBalance && !isReadOnly && (
                <div className="mt-1 text-sm text-dark-300">{nativeBalance}</div>
              )}
            </div>

            {/* Copy address */}
            <button
              onClick={() => { handleCopy(); setShowMenu(false); }}
              className="w-full px-4 py-2 text-left hover:bg-dark-700 transition-colors flex items-center gap-2"
            >
              <CopyIcon />
              {copied ? 'Copied!' : 'Copy Address'}
            </button>

            {/* Switch network (if unsupported) */}
            {isUnsupported && !isReadOnly && (
              <button
                onClick={() => { handleSwitchToSupported(); setShowMenu(false); }}
                disabled={isSwitchingChain}
                className="w-full px-4 py-2 text-left hover:bg-dark-700 transition-colors flex items-center gap-2 text-yellow-400"
              >
                <SwitchIcon />
                {isSwitchingChain ? 'Switching...' : 'Switch to Ethereum'}
              </button>
            )}

            {/* Disconnect / Exit view */}
            <button
              onClick={() => {
                if (isReadOnly) exitReadOnlyMode();
                else disconnect();
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

  // ===== READ-ONLY INPUT =====
  if (showReadOnlyInput) {
    return (
      <div className="flex flex-col gap-2 w-72">
        <div className="text-sm text-dark-400 mb-1">Enter wallet address to view</div>
        <div className="flex items-center gap-2">
          <input
            id="wallet-address"
            name="wallet-address"
            type="text"
            placeholder="0x..."
            value={readOnlyAddress}
            onChange={(e) => {
              setReadOnlyAddress(e.target.value);
              if (addressError) setAddressError('');
            }}
            className={`flex-1 px-3 py-2 rounded-lg bg-dark-800 border outline-none text-sm font-mono ${
              addressError ? 'border-red-500' : 'border-dark-600 focus:border-primary-500'
            }`}
          />
          <Button onClick={handleReadOnlySubmit} variant="secondary" size="sm">
            View
          </Button>
        </div>
        {addressError && <p className="text-xs text-red-400">{addressError}</p>}
        <button onClick={handleCancel} className="text-xs text-dark-400 hover:text-dark-200">
          Cancel
        </button>
      </div>
    );
  }

  // ===== ERROR STATE =====
  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800 max-w-sm">
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
          Scan the QR code with your mobile wallet
        </p>
        <button onClick={handleCancel} className="text-xs text-dark-400 hover:text-dark-200">
          Cancel
        </button>
      </div>
    );
  }

  const openReadOnlyFromHeader = () => {
    clearError();
    setSelectedWallet(null);
    setShowWalletOptions(false);
    setShowReadOnlyInput(true);
  };

  // ===== DISCONNECTED — WALLET PICKER =====
  return (
    <div className="relative flex flex-wrap items-center justify-end gap-2" ref={dropdownRef}>
      <button
        type="button"
        onClick={openReadOnlyFromHeader}
        title={WALLET_ENTRY_LABELS.viewAddressHeaderTitle}
        className="px-3 py-2 text-sm font-medium text-dark-300 hover:text-white transition-colors whitespace-nowrap rounded-lg hover:bg-dark-800/80 border border-transparent hover:border-white/[0.06]"
      >
        {WALLET_ENTRY_LABELS.viewAddressHeader}
      </button>
      <Button onClick={() => setShowWalletOptions(!showWalletOptions)} variant="primary">
        Connect Wallet
      </Button>

      {showWalletOptions && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-dark-800 rounded-lg shadow-lg border border-dark-700 py-2 z-50">
          <div className="px-3 pb-2 mb-2 border-b border-dark-700">
            <span className="text-xs text-dark-400 uppercase tracking-wide">
              Connect or view
            </span>
            <p className="text-[11px] text-dark-500 mt-1 leading-snug">
              WalletConnect signs transactions. View address is read-only.
            </p>
          </div>

          {/* WalletConnect */}
          <button
            onClick={() => handleWalletSelect('walletconnect')}
            className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3"
          >
            <WalletConnectIcon />
            <div>
              <div className="font-medium">WalletConnect</div>
              <div className="text-xs text-dark-400">
                QR code for mobile wallets & Ledger
              </div>
            </div>
          </button>

          {/* Coinbase Wallet (via WalletConnect) */}
          <button
            onClick={() => handleWalletSelect('walletconnect')}
            className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3"
          >
            <CoinbaseIcon />
            <div>
              <div className="font-medium">Coinbase Wallet</div>
              <div className="text-xs text-dark-400">
                Via WalletConnect QR
              </div>
            </div>
          </button>

          <div className="my-2 border-t border-dark-700" />

          {/* View-only — placed above network chips so it stays visible without scrolling */}
          <button
            onClick={() => handleWalletSelect('readonly')}
            className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3"
          >
            <EyeIcon />
            <div>
              <div className="font-medium">View address</div>
              <div className="text-xs text-dark-400">Read-only — balances without signing</div>
            </div>
          </button>

          <div className="my-2 border-t border-dark-700" />

          {/* Supported chains info */}
          <div className="px-4 py-2">
            <div className="text-xs text-dark-400 mb-1.5">Supported networks</div>
            <div className="flex flex-wrap gap-1">
              {CHAINS.map((c) => (
                <span key={c.id} className="px-2 py-0.5 text-xs rounded bg-dark-700 text-dark-300">
                  {c.shortName}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function ChainBadge({ chainId, isUnsupported }: { chainId: number; isUnsupported: boolean }) {
  const chain = getChain(chainId);
  return (
    <span
      className={`px-2 py-0.5 text-xs rounded ${
        isUnsupported
          ? 'bg-red-900/50 text-red-400'
          : 'bg-dark-700 text-dark-300'
      }`}
    >
      {chain?.shortName || `Chain ${chainId}`}
    </span>
  );
}

// ─── Icons ───────────────────────────────────────────────────

function WarningIcon() {
  return (
    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function SwitchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
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

function CoinbaseIcon() {
  return (
    <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
      <span className="text-blue-400 font-bold text-sm">CB</span>
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
