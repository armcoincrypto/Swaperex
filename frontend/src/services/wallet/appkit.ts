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

let initialized = false;

export function initAppKit() {
  if (initialized) return;
  initialized = true;

  const projectId = (import.meta.env.VITE_WC_PROJECT_ID || '').trim();
  const isPlaceholder =
    !projectId ||
    projectId === 'PASTE_YOUR_PROJECT_ID_HERE' ||
    projectId === 'your_project_id_here';

  if (isPlaceholder) {
    if (import.meta.env.PROD) {
      toast.warning(
        'WalletConnect disabled: set VITE_WC_PROJECT_ID and rebuild. Get one at cloud.walletconnect.com'
      );
    } else {
      console.warn('[AppKit] Missing VITE_WC_PROJECT_ID. WalletConnect QR disabled.');
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
      // Email & social login (Google, etc.) — uses Reown/Magic. If Google sign-in fails,
      // add your app origin (e.g. http://localhost:3000) in Reown Cloud project settings.
      email: true,
      socials: ['google', 'apple', 'x', 'github', 'discord'],
      emailShowWallets: true,
    },
  });
}
