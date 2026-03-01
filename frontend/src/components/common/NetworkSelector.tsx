/**
 * Network Selector Component
 *
 * Allows users to switch between supported blockchain networks.
 * Supports wallet_switchEthereumChain with wallet_addEthereumChain fallback.
 * Uses centralized chain config from @/wallet.
 */

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { CHAINS, getChain } from '@/wallet';

// Icons per chain (emoji-based for simplicity)
const CHAIN_ICONS: Record<number, string> = {
  1: '\u27E0',      // Ethereum
  56: '\u2B21',     // BSC
  137: '\u2B21',    // Polygon
  42161: '\u{1F680}', // Arbitrum
  10: '\u{1F534}',   // Optimism
  43114: '\u{1F3D4}\uFE0F', // Avalanche
};

export function NetworkSelector() {
  const { chainId, isConnected, switchNetwork } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const currentChain = getChain(chainId);
  const isUnsupportedNetwork = isConnected && !currentChain;

  const handleNetworkSwitch = async (targetChainId: number) => {
    if (targetChainId === chainId) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    try {
      await switchNetwork(targetChainId);
      setIsOpen(false);
    } catch (error) {
      console.error('[NetworkSelector] Failed to switch network:', error);
    } finally {
      setIsSwitching(false);
    }
  };

  if (!isConnected) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg
          ${isUnsupportedNetwork
            ? 'bg-red-500/20 border border-red-500/50 text-red-400'
            : 'bg-dark-800 border border-dark-700 text-white hover:bg-dark-700'
          }
          transition-colors duration-200
          ${isSwitching ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
        `}
      >
        {isSwitching ? (
          <>
            <span className="animate-spin">\u27F3</span>
            <span className="text-sm">Switching...</span>
          </>
        ) : isUnsupportedNetwork ? (
          <>
            <span>\u26A0\uFE0F</span>
            <span className="text-sm">Wrong Network</span>
          </>
        ) : (
          <>
            <span className="text-lg">{CHAIN_ICONS[chainId] || '\u26D3'}</span>
            <span className="text-sm font-medium">{currentChain?.name}</span>
            <span className="text-xs text-gray-400">\u25BC</span>
          </>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 mt-2 w-48 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-dark-700">
              <span className="text-xs text-gray-400 font-medium">Select Network</span>
            </div>
            {CHAINS.map((chain) => (
              <button
                key={chain.id}
                onClick={() => handleNetworkSwitch(chain.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5
                  hover:bg-dark-700 transition-colors
                  ${chain.id === chainId ? 'bg-dark-700' : ''}
                `}
              >
                <span className="text-lg">{CHAIN_ICONS[chain.id] || '\u26D3'}</span>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-white">{chain.name}</div>
                  <div className="text-xs text-gray-400">{chain.nativeSymbol}</div>
                </div>
                {chain.id === chainId && (
                  <span className="text-green-400 text-sm">\u2713</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default NetworkSelector;
