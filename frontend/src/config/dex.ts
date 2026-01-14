/**
 * DEX Configuration
 *
 * Extracted from Telegram bot routing logic.
 * Maps DEX protocols to chains and provides API endpoints.
 * ONLY contains public data - NO private keys, NO signing logic.
 */

import { CHAIN_IDS, type ChainName } from './chains';

export interface DexConfig {
  name: string;
  displayName: string;
  chain: ChainName;
  chainId: number;
  apiEndpoint: string;
  routerAddress?: string;
  quoterAddress?: string;
  minGasToken: string;
  minGasAmount: string;
  explorerUrl: string;
  logo?: string;
}

/**
 * DEX to Chain mapping
 * Source: Telegram bot swap handlers
 */
export const DEX_CHAIN_MAP: Record<string, ChainName> = {
  uniswap: 'ethereum',
  pancakeswap: 'bsc',
  quickswap: 'polygon',
  traderjoe: 'avalanche',
  sushiswap: 'ethereum',
  curve: 'ethereum',
};

/**
 * 1inch API Configuration
 */
export const ONEINCH_CONFIG = {
  apiBase: 'https://api.1inch.dev/swap/v6.0',
  supportedChains: [1, 56, 137, 42161, 10, 43114, 100, 250, 8453],
  defaultSlippage: 1, // 1%
  defaultDeadline: 20, // 20 minutes
};

/**
 * Jupiter (Solana) API Configuration
 */
export const JUPITER_CONFIG = {
  apiBase: 'https://lite-api.jup.ag/swap/v1',
  priceApi: 'https://api.jup.ag/price/v2',
  defaultSlippage: 100, // 1% in basis points
};

/**
 * DEX Configurations
 */
export const DEX_CONFIGS: Record<string, DexConfig> = {
  // Ethereum DEXes (via 1inch aggregator)
  uniswap: {
    name: 'uniswap',
    displayName: 'Uniswap V3 (Ethereum)',
    chain: 'ethereum',
    chainId: CHAIN_IDS.ethereum,
    apiEndpoint: `${ONEINCH_CONFIG.apiBase}/1`,
    minGasToken: 'ETH',
    minGasAmount: '0.01',
    explorerUrl: 'https://etherscan.io',
  },

  // BNB Chain DEXes
  pancakeswap: {
    name: 'pancakeswap',
    displayName: 'PancakeSwap (BNB Chain)',
    chain: 'bsc',
    chainId: CHAIN_IDS.bsc,
    apiEndpoint: `${ONEINCH_CONFIG.apiBase}/56`,
    minGasToken: 'BNB',
    minGasAmount: '0.005',
    explorerUrl: 'https://bscscan.com',
  },

  // Polygon DEXes
  quickswap: {
    name: 'quickswap',
    displayName: 'QuickSwap (Polygon)',
    chain: 'polygon',
    chainId: CHAIN_IDS.polygon,
    apiEndpoint: `${ONEINCH_CONFIG.apiBase}/137`,
    minGasToken: 'MATIC',
    minGasAmount: '0.1',
    explorerUrl: 'https://polygonscan.com',
  },

  // Avalanche DEXes
  traderjoe: {
    name: 'traderjoe',
    displayName: 'TraderJoe (Avalanche)',
    chain: 'avalanche',
    chainId: CHAIN_IDS.avalanche,
    apiEndpoint: `${ONEINCH_CONFIG.apiBase}/43114`,
    minGasToken: 'AVAX',
    minGasAmount: '0.05',
    explorerUrl: 'https://snowtrace.io',
  },

  // Arbitrum (via 1inch)
  arbitrum: {
    name: 'arbitrum',
    displayName: 'Arbitrum (1inch)',
    chain: 'arbitrum',
    chainId: CHAIN_IDS.arbitrum,
    apiEndpoint: `${ONEINCH_CONFIG.apiBase}/42161`,
    minGasToken: 'ETH',
    minGasAmount: '0.001',
    explorerUrl: 'https://arbiscan.io',
  },

  // Optimism (via 1inch)
  optimism: {
    name: 'optimism',
    displayName: 'Optimism (1inch)',
    chain: 'optimism',
    chainId: CHAIN_IDS.optimism,
    apiEndpoint: `${ONEINCH_CONFIG.apiBase}/10`,
    minGasToken: 'ETH',
    minGasAmount: '0.001',
    explorerUrl: 'https://optimistic.etherscan.io',
  },

  // Base (via 1inch)
  base: {
    name: 'base',
    displayName: 'Base (1inch)',
    chain: 'base',
    chainId: CHAIN_IDS.base,
    apiEndpoint: `${ONEINCH_CONFIG.apiBase}/8453`,
    minGasToken: 'ETH',
    minGasAmount: '0.001',
    explorerUrl: 'https://basescan.org',
  },
};

/**
 * Non-EVM DEX Configurations (for reference)
 */
export const NON_EVM_DEXES = {
  // Solana
  jupiter: {
    name: 'jupiter',
    displayName: 'Jupiter (Solana)',
    chain: 'solana',
    apiEndpoint: JUPITER_CONFIG.apiBase,
    minGasToken: 'SOL',
    minGasAmount: '0.01',
    explorerUrl: 'https://solscan.io',
  },

  // Cross-chain
  thorchain: {
    name: 'thorchain',
    displayName: 'THORChain (Cross-Chain)',
    chain: 'thorchain',
    apiEndpoint: 'https://thornode.ninerealms.com',
    minGasToken: 'RUNE',
    minGasAmount: '0.1',
    explorerUrl: 'https://viewblock.io/thorchain',
  },

  // Cosmos
  osmosis: {
    name: 'osmosis',
    displayName: 'Osmosis (Cosmos)',
    chain: 'cosmos',
    minGasToken: 'ATOM',
    minGasAmount: '0.1',
    explorerUrl: 'https://www.mintscan.io/osmosis',
  },

  // Tron
  sunswap: {
    name: 'sunswap',
    displayName: 'SunSwap (Tron)',
    chain: 'tron',
    minGasToken: 'TRX',
    minGasAmount: '50', // Tron needs significant TRX for energy
    explorerUrl: 'https://tronscan.org',
  },

  // TON
  stonfi: {
    name: 'stonfi',
    displayName: 'STON.fi (TON)',
    chain: 'ton',
    minGasToken: 'TON',
    minGasAmount: '0.5',
    explorerUrl: 'https://tonviewer.com',
  },

  // NEAR
  ref_finance: {
    name: 'ref_finance',
    displayName: 'Ref Finance (NEAR)',
    chain: 'near',
    minGasToken: 'NEAR',
    minGasAmount: '0.1',
    explorerUrl: 'https://explorer.near.org',
  },
};

/**
 * Swap Parameters
 */
export const SWAP_DEFAULTS = {
  slippage: 1.0, // 1%
  deadline: 20, // 20 minutes
  maxPriceImpact: 15, // 15% max price impact warning
  minReceiveRatio: 0.95, // Minimum 95% of quoted amount
};

/**
 * Get DEX config by name
 */
export function getDexConfig(dexName: string): DexConfig | undefined {
  return DEX_CONFIGS[dexName.toLowerCase()];
}

/**
 * Get DEX config by chain ID
 */
export function getDexByChainId(chainId: number): DexConfig | undefined {
  return Object.values(DEX_CONFIGS).find((dex) => dex.chainId === chainId);
}

/**
 * Get all DEXes for a chain
 */
export function getDexesForChain(chainName: ChainName): DexConfig[] {
  return Object.values(DEX_CONFIGS).filter((dex) => dex.chain === chainName);
}

/**
 * Check if chain is supported by 1inch
 */
export function isOneInchSupported(chainId: number): boolean {
  return ONEINCH_CONFIG.supportedChains.includes(chainId);
}

/**
 * Get 1inch API endpoint for chain
 */
export function getOneInchEndpoint(chainId: number): string {
  return `${ONEINCH_CONFIG.apiBase}/${chainId}`;
}

export default DEX_CONFIGS;
