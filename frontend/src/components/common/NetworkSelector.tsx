/**
 * Network Selector Component — P15 capability-aware network picker.
 *
 * Switches chain via `useWallet().switchNetwork` (EIP-1193: same provider as WalletConnect / AppKit).
 */

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { getChain } from '@/wallet/chains';
import {
  getNetworkCapabilityLabel,
  getSwapUnavailableReason,
  getWalletNetworkCapabilities,
  isSwapEnabledNetwork,
} from '@/config/networkCapabilities';
import { logRevenueTelemetry } from '@/utils/revenueTelemetry';

const CHAIN_ICONS: Record<number, string> = {
  1: '\u27E0',
  56: '\u2B21',
  137: '\u2B23',
  42161: '\uD83D\uDD35',
  10: '\uD83D\uDD34',
  43114: '\uD83D\uDD3A',
};

export function NetworkSelector() {
  const { chainId, isConnected, switchNetwork, walletType } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchMessage, setSwitchMessage] = useState<string | null>(null);

  const networks = getWalletNetworkCapabilities();
  const currentNetwork = networks.find((n) => n.chainId === chainId);
  const isUnsupportedNetwork = isConnected && !currentNetwork;

  const handleNetworkSwitch = async (targetChainId: number) => {
    if (targetChainId === chainId) {
      setIsOpen(false);
      return;
    }

    setSwitchMessage(null);
    setIsSwitching(true);
    try {
      await switchNetwork(targetChainId);
      logRevenueTelemetry('chain_selected', {
        chainId: targetChainId,
        source: 'network_selector',
        swapCapable: isSwapEnabledNetwork(targetChainId),
      });
      setIsOpen(false);
    } catch (error) {
      console.error('[NetworkSelector] Failed to switch network:', error);
      const msg =
        error instanceof Error ? error.message : 'Could not switch network. Try again from your wallet app.';
      setSwitchMessage(msg);

      const chain = getChain(targetChainId);
      if (
        chain &&
        walletType !== 'walletconnect' &&
        window.ethereum &&
        typeof (window.ethereum as { request?: unknown }).request === 'function'
      ) {
        try {
          await (window.ethereum as { request: (args: unknown) => Promise<unknown> }).request({
            method: 'wallet_addEthereumChain',
            params: [chain.addChainParams],
          });
          setIsOpen(false);
          setSwitchMessage(null);
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

  const currentLabel = currentNetwork ? getNetworkCapabilityLabel(currentNetwork.chainId) : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setSwitchMessage(null);
          setIsOpen(!isOpen);
        }}
        disabled={isSwitching}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
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
            <span className="animate-spin">{'\u27F3'}</span>
            <span className="text-sm">Switching...</span>
          </>
        ) : isUnsupportedNetwork ? (
          <>
            <span>{'\u26A0\uFE0F'}</span>
            <span className="text-sm">Wrong Network</span>
          </>
        ) : (
          <>
            <span className="text-lg">{CHAIN_ICONS[chainId] ?? '\u26D3'}</span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-medium">{currentNetwork?.name}</span>
              {currentLabel && (
                <span className="text-[10px] text-dark-400">{currentLabel}</span>
              )}
            </span>
            <span className="text-xs text-gray-400">{'\u25BC'}</span>
          </>
        )}
      </button>

      {switchMessage && (
        <p className="mt-1 max-w-xs text-xs text-amber-400" role="status">
          {switchMessage}
        </p>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden />

          <div
            className="absolute right-0 mt-2 w-64 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto"
            role="listbox"
            aria-label="Select network"
          >
            <div className="p-2 border-b border-dark-700 space-y-1">
              <span className="text-xs text-gray-400 font-medium block">Select network</span>
              <p className="text-[10px] text-dark-500 leading-snug">
                Swaps run on Ethereum and BNB Chain. Other networks are for balances, send, and portfolio.
              </p>
            </div>
            {networks.map((network) => {
              const badge = getNetworkCapabilityLabel(network.chainId);
              const isSwap = network.swapSupported;
              return (
                <button
                  key={network.chainId}
                  type="button"
                  role="option"
                  aria-selected={network.chainId === chainId}
                  title={!isSwap ? getSwapUnavailableReason(network.chainId) : undefined}
                  onClick={() => handleNetworkSwitch(network.chainId)}
                  className={`
                    w-full flex items-start gap-3 px-3 py-2.5
                    hover:bg-dark-700 transition-colors text-left
                    ${network.chainId === chainId ? 'bg-dark-700' : ''}
                  `}
                >
                  <span className="text-lg pt-0.5">{CHAIN_ICONS[network.chainId] ?? '\u26D3'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{network.name}</div>
                    <div className="text-xs text-gray-400">{network.nativeToken}</div>
                    <span
                      className={`inline-flex mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        isSwap
                          ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-700/40'
                          : 'bg-dark-700/80 text-dark-300 border border-dark-600/50'
                      }`}
                    >
                      {badge}
                    </span>
                  </div>
                  {network.chainId === chainId && (
                    <span className="text-green-400 text-sm pt-1">{'\u2713'}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default NetworkSelector;
