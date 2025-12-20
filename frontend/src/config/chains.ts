/**
 * Chain Configuration
 *
 * Extracted from Telegram bot routing logic.
 * ONLY contains public chain data - NO private keys, NO signing logic.
 */

export interface ChainConfig {
  id: number;
  name: string;
  symbol: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerTxPath: string;
  nativeToken: string;
  nativeDecimals: number;
  logo?: string;
}

/**
 * Supported EVM Chain IDs
 */
export const CHAIN_IDS = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  gnosis: 100,
  fantom: 250,
  base: 8453,
} as const;

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];
export type ChainName = keyof typeof CHAIN_IDS;

/**
 * Chain Configurations
 */
export const CHAINS: Record<ChainName, ChainConfig> = {
  ethereum: {
    id: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    nativeDecimals: 18,
  },
  bsc: {
    id: 56,
    name: 'BNB Chain',
    symbol: 'BNB',
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    explorerUrl: 'https://bscscan.com',
    explorerTxPath: '/tx/',
    nativeToken: 'BNB',
    nativeDecimals: 18,
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    symbol: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com/',
    explorerUrl: 'https://polygonscan.com',
    explorerTxPath: '/tx/',
    nativeToken: 'MATIC',
    nativeDecimals: 18,
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum One',
    symbol: 'ETH',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    nativeDecimals: 18,
  },
  optimism: {
    id: 10,
    name: 'Optimism',
    symbol: 'ETH',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    nativeDecimals: 18,
  },
  avalanche: {
    id: 43114,
    name: 'Avalanche C-Chain',
    symbol: 'AVAX',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    explorerTxPath: '/tx/',
    nativeToken: 'AVAX',
    nativeDecimals: 18,
  },
  gnosis: {
    id: 100,
    name: 'Gnosis Chain',
    symbol: 'xDAI',
    rpcUrl: 'https://rpc.gnosischain.com',
    explorerUrl: 'https://gnosisscan.io',
    explorerTxPath: '/tx/',
    nativeToken: 'xDAI',
    nativeDecimals: 18,
  },
  fantom: {
    id: 250,
    name: 'Fantom',
    symbol: 'FTM',
    rpcUrl: 'https://rpc.ftm.tools',
    explorerUrl: 'https://ftmscan.com',
    explorerTxPath: '/tx/',
    nativeToken: 'FTM',
    nativeDecimals: 18,
  },
  base: {
    id: 8453,
    name: 'Base',
    symbol: 'ETH',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    nativeDecimals: 18,
  },
};

/**
 * Get chain config by ID
 */
export function getChainById(chainId: number): ChainConfig | undefined {
  return Object.values(CHAINS).find((c) => c.id === chainId);
}

/**
 * Get chain config by name
 */
export function getChainByName(name: ChainName): ChainConfig {
  return CHAINS[name];
}

/**
 * Get explorer transaction URL
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const chain = getChainById(chainId);
  if (!chain) return '';
  return `${chain.explorerUrl}${chain.explorerTxPath}${txHash}`;
}

/**
 * Check if chain ID is supported
 */
export function isSupportedChain(chainId: number): boolean {
  return Object.values(CHAIN_IDS).includes(chainId as ChainId);
}

/**
 * Default supported chain IDs for wallet
 */
export const SUPPORTED_CHAIN_IDS = Object.values(CHAIN_IDS);

export default CHAINS;
