/**
 * Reown AppKit initializer — WalletConnect QR modal, injected, Coinbase.
 * Replaces deprecated @web3modal/ethers.
 */

import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import {
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  avalanche,
} from '@reown/appkit/networks';
import { toast } from '@/stores/toastStore';
import {
  WALLETCONNECT_PROJECT_ID,
  HAS_WALLETCONNECT_PROJECT_ID,
} from '@/utils/constants';

let initialized = false;

function isWalletConnectProjectIdPlaceholder(projectId: string): boolean {
  return (
    !projectId ||
    projectId === 'PASTE_YOUR_PROJECT_ID_HERE' ||
    projectId === 'your_project_id_here'
  );
}

export function initAppKit() {
  if (initialized) return;
  initialized = true;

  const projectId = WALLETCONNECT_PROJECT_ID;
  const isPlaceholder =
    !HAS_WALLETCONNECT_PROJECT_ID || isWalletConnectProjectIdPlaceholder(projectId);

  if (isPlaceholder) {
    if (import.meta.env.PROD) {
      toast.warning(
        'WalletConnect disabled: set VITE_WC_PROJECT_ID and rebuild. VITE_WALLETCONNECT_PROJECT_ID is legacy fallback only.'
      );
    } else {
      console.warn(
        '[AppKit] Missing WalletConnect project ID. Use VITE_WC_PROJECT_ID (canonical). VITE_WALLETCONNECT_PROJECT_ID is legacy fallback only.'
      );
    }
    return;
  }

  const metadata = {
    name: 'Swaperex',
    description: 'Swaperex - Web3 Token Swap Platform',
    url: import.meta.env.VITE_APP_URL || 'https://dex.kobbex.com',
    icons: ['https://dex.kobbex.com/favicon.ico'],
  };

  const networks = [mainnet, bsc, polygon, arbitrum, optimism, avalanche];

  createAppKit({
    adapters: [new EthersAdapter()],
    networks: networks as [typeof mainnet, ...typeof mainnet[]],
    projectId,
    metadata,
    features: {
      analytics: false,
      email: true,
      socials: ['google', 'apple', 'x', 'github', 'discord'],
      emailShowWallets: true,
    },
  });
}
