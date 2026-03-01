/**
 * Network Selector Component
 *
 * Allows users to switch between supported blockchain networks.
 * Triggers MetaMask network switch when selected.
 */

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { CHAINS } from '@/utils/constants';

interface NetworkInfo {
  chainId: number;
  name: string;
  symbol: string;
  icon: string;
  rpcUrl: string;
  explorerUrl: string;
}

// Icons per chain (simple Unicode fallbacks)
const CHAIN_ICONS: Record<string, string> = {
  ethereum: '⟠',
  bsc: '⬡',
  polygon: '⬡',
  arbitrum: '⬡',
  optimism: '⬡',
  avalanche: '🔺',
};

// Build SUPPORTED_NETWORKS from CHAINS (single source of truth)
const SUPPORTED_NETWORKS: NetworkInfo[] = (Object.keys(CHAINS) as (keyof typeof CHAINS)[]).map(
  (key) => ({
    chainId: CHAINS[key].id,
    name: CHAINS[key].name,
    symbol: CHAINS[key].nativeSymbol,
    icon: CHAIN_ICONS[key] ?? '⬡',
    rpcUrl: CHAINS[key].rpcUrl,
    explorerUrl: CHAINS[key].explorer,
  })
);

export function NetworkSelector() {
  const { chainId, isConnected, switchNetwork } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const currentNetwork = SUPPORTED_NETWORKS.find((n) => n.chainId === chainId);
  const isUnsupportedNetwork = isConnected && !currentNetwork;

  const handleNetworkSwitch = async (network: NetworkInfo) => {
    if (network.chainId === chainId) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    try {
      await switchNetwork(network.chainId);
      setIsOpen(false);
    } catch (error) {
      console.error('[NetworkSelector] Failed to switch network:', error);
      // If network doesn't exist in MetaMask, try to add it
      if (window.ethereum) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${network.chainId.toString(16)}`,
                chainName: network.name,
                nativeCurrency: {
                  name: network.symbol,
                  symbol: network.symbol,
                  decimals: 18,
                },
                rpcUrls: [network.rpcUrl],
                blockExplorerUrls: [network.explorerUrl],
              },
            ],
          });
          setIsOpen(false);
        } catch (addError) {
          console.error('[NetworkSelector] Failed to add network:', addError);
        }
      }
    } finally {
      setIsSwitching(false);
    }
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="relative">
      {/* Current Network Button */}
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
            <span className="animate-spin">⟳</span>
            <span className="text-sm">Switching...</span>
          </>
        ) : isUnsupportedNetwork ? (
          <>
            <span>⚠️</span>
            <span className="text-sm">Wrong Network</span>
          </>
        ) : (
          <>
            <span className="text-lg">{currentNetwork?.icon}</span>
            <span className="text-sm font-medium">{currentNetwork?.name}</span>
            <span className="text-xs text-gray-400">▼</span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Network List */}
          <div className="absolute right-0 mt-2 w-48 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-dark-700">
              <span className="text-xs text-gray-400 font-medium">Select Network</span>
            </div>
            {SUPPORTED_NETWORKS.map((network) => (
              <button
                key={network.chainId}
                onClick={() => handleNetworkSwitch(network)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5
                  hover:bg-dark-700 transition-colors
                  ${network.chainId === chainId ? 'bg-dark-700' : ''}
                `}
              >
                <span className="text-lg">{network.icon}</span>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-white">{network.name}</div>
                  <div className="text-xs text-gray-400">{network.symbol}</div>
                </div>
                {network.chainId === chainId && (
                  <span className="text-green-400 text-sm">✓</span>
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
