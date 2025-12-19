/**
 * Wallet Connect Component
 *
 * Handles wallet connection flow.
 * NEVER receives private keys - only public address.
 */

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/common/Button';
import { shortenAddress } from '@/utils/format';

export function WalletConnect() {
  const {
    isConnected,
    isConnecting,
    address,
    chainId,
    hasInjectedWallet,
    error,
    connectInjected,
    disconnect,
  } = useWallet();

  const [showMenu, setShowMenu] = useState(false);

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-medium">{shortenAddress(address)}</span>
          <ChainBadge chainId={chainId} />
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-dark-800 rounded-lg shadow-lg border border-dark-700 py-1 z-50">
            <button
              onClick={() => {
                navigator.clipboard.writeText(address);
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left hover:bg-dark-700 transition-colors"
            >
              Copy Address
            </button>
            <button
              onClick={() => {
                disconnect();
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-red-400 hover:bg-dark-700 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {hasInjectedWallet ? (
        <Button
          onClick={connectInjected}
          loading={isConnecting}
          variant="primary"
        >
          Connect Wallet
        </Button>
      ) : (
        <Button variant="secondary" disabled>
          Install MetaMask
        </Button>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}

function ChainBadge({ chainId }: { chainId: number }) {
  const chainNames: Record<number, string> = {
    1: 'ETH',
    56: 'BSC',
    137: 'MATIC',
    42161: 'ARB',
    10: 'OP',
    43114: 'AVAX',
  };

  return (
    <span className="px-2 py-0.5 text-xs rounded bg-dark-700 text-dark-300">
      {chainNames[chainId] || chainId}
    </span>
  );
}

export default WalletConnect;
