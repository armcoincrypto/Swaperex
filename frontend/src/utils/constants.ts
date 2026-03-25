/**
 * Application constants
 *
 * Chain config is now centralized in @/wallet/chains.ts.
 * Re-exported here for backwards compatibility.
 */

import {
  CHAINS as WALLET_CHAINS,
  SUPPORTED_CHAIN_IDS as WALLET_SUPPORTED_CHAIN_IDS,
} from '@/wallet';

// Re-export chain config from wallet module (single source of truth)
// Legacy shape kept for backwards compat with components that use CHAINS.ethereum.rpcUrl etc.
export const CHAINS = {
  ethereum:  WALLET_CHAINS.find((c) => c.id === 1)!,
  bsc:       WALLET_CHAINS.find((c) => c.id === 56)!,
  polygon:   WALLET_CHAINS.find((c) => c.id === 137)!,
  arbitrum:  WALLET_CHAINS.find((c) => c.id === 42161)!,
  optimism:  WALLET_CHAINS.find((c) => c.id === 10)!,
  avalanche: WALLET_CHAINS.find((c) => c.id === 43114)!,
} as const;

// Supported chain IDs
export const SUPPORTED_CHAIN_IDS: number[] = WALLET_SUPPORTED_CHAIN_IDS;

// Default slippage options
export const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0, 3.0];

// Default deadline (minutes)
export const DEFAULT_DEADLINE = 20;

// Refresh intervals (ms)
export const BALANCE_REFRESH_INTERVAL = 30000;
export const QUOTE_REFRESH_INTERVAL = 15000;

// API configuration (delegate to centralized config)
export { API_BASE_URL } from '@/config/api';

// WalletConnect Cloud project ID (compile-time, from Vite env)
export const WALLETCONNECT_PROJECT_ID =
  (import.meta.env.VITE_WC_PROJECT_ID || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '').trim();
export const HAS_WALLETCONNECT_PROJECT_ID = WALLETCONNECT_PROJECT_ID.length > 0;
