/**
 * Application constants
 */

// Chain configurations
export const CHAINS = {
  ethereum: {
    id: 1,
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    rpcUrl: 'https://eth.llamarpc.com',
    explorer: 'https://etherscan.io',
    logo: '/assets/chains/ethereum.svg',
  },
  bsc: {
    id: 56,
    name: 'BNB Chain',
    nativeSymbol: 'BNB',
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    explorer: 'https://bscscan.com',
    logo: '/assets/chains/bnb.svg',
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    nativeSymbol: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com/',
    explorer: 'https://polygonscan.com',
    logo: '/assets/chains/polygon.svg',
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum',
    nativeSymbol: 'ETH',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
    logo: '/assets/chains/arbitrum.svg',
  },
  optimism: {
    id: 10,
    name: 'Optimism',
    nativeSymbol: 'ETH',
    rpcUrl: 'https://mainnet.optimism.io',
    explorer: 'https://optimistic.etherscan.io',
    logo: '/assets/chains/optimism.svg',
  },
  avalanche: {
    id: 43114,
    name: 'Avalanche',
    nativeSymbol: 'AVAX',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorer: 'https://snowtrace.io',
    logo: '/assets/chains/avalanche.svg',
  },
} as const;

// Supported chain IDs
export const SUPPORTED_CHAIN_IDS: number[] = [1, 56, 137, 42161, 10, 43114];

// Default slippage options
export const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0, 3.0];

// Default deadline (minutes)
export const DEFAULT_DEADLINE = 20;

// Refresh intervals (ms)
export const BALANCE_REFRESH_INTERVAL = 30000;
export const QUOTE_REFRESH_INTERVAL = 15000;

// API configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// WalletConnect project ID
export const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
