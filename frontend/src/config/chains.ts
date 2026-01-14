/**
 * Chain Configuration
 *
 * Extracted from Telegram bot routing logic.
 * ONLY contains public chain data - NO private keys, NO signing logic.
 *
 * Supports: Uniswap V3, PancakeSwap V3, 1inch Aggregator
 */

/**
 * Uniswap V3 Contract Addresses
 * Source: https://docs.uniswap.org/contracts/v3/reference/deployments
 */
export interface UniswapV3Addresses {
  router: string;           // SwapRouter02
  quoter: string;           // QuoterV2
  factory: string;          // UniswapV3Factory
  positionManager: string;  // NonfungiblePositionManager
  permit2: string;          // Permit2 (for gasless approvals)
}

/**
 * PancakeSwap V3 Contract Addresses (BSC)
 * Source: https://docs.pancakeswap.finance/developers/smart-contracts
 */
export interface PancakeSwapV3Addresses {
  router: string;           // SmartRouter
  quoter: string;           // QuoterV2
  factory: string;          // V3Factory
  positionManager: string;  // NonfungiblePositionManager
}

/**
 * Chain Configuration Interface
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
  wrappedNativeToken: string;  // WETH, WBNB, WMATIC, etc.
  wrappedNativeAddress: string;
  uniswapV3?: UniswapV3Addresses;
  pancakeSwapV3?: PancakeSwapV3Addresses;
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
 * Uniswap V3 Addresses per Chain
 * These are the official Uniswap V3 deployment addresses
 */
export const UNISWAP_V3_ADDRESSES: Record<number, UniswapV3Addresses> = {
  // Ethereum Mainnet
  1: {
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',      // SwapRouter02
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',      // QuoterV2
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',     // UniswapV3Factory
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88', // NonfungiblePositionManager
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',     // Permit2
  },
  // Arbitrum One
  42161: {
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
  // Optimism
  10: {
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
  // Polygon
  137: {
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
  // Base
  8453: {
    router: '0x2626664c2603336E57B271c5C0b26F421741e481',      // Universal Router on Base
    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    positionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
};

/**
 * PancakeSwap V3 Addresses (BSC)
 * Source: https://docs.pancakeswap.finance/developers/smart-contracts/pancakeswap-exchange/v3-contracts
 */
export const PANCAKESWAP_V3_ADDRESSES: PancakeSwapV3Addresses = {
  router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',       // SmartRouter
  quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',       // QuoterV2
  factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',      // V3Factory
  positionManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', // NFT Position Manager
};

/**
 * Wrapped Native Token Addresses
 */
export const WRAPPED_NATIVE_ADDRESSES: Record<number, string> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',       // WETH on Ethereum
  56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',      // WBNB on BSC
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',     // WMATIC on Polygon
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',   // WETH on Arbitrum
  10: '0x4200000000000000000000000000000000000006',      // WETH on Optimism
  43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',   // WAVAX on Avalanche
  100: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',     // WXDAI on Gnosis
  250: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',     // WFTM on Fantom
  8453: '0x4200000000000000000000000000000000000006',    // WETH on Base
};

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
    wrappedNativeToken: 'WETH',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[1],
    uniswapV3: UNISWAP_V3_ADDRESSES[1],
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
    wrappedNativeToken: 'WBNB',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[56],
    pancakeSwapV3: PANCAKESWAP_V3_ADDRESSES,
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
    wrappedNativeToken: 'WMATIC',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[137],
    uniswapV3: UNISWAP_V3_ADDRESSES[137],
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
    wrappedNativeToken: 'WETH',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[42161],
    uniswapV3: UNISWAP_V3_ADDRESSES[42161],
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
    wrappedNativeToken: 'WETH',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[10],
    uniswapV3: UNISWAP_V3_ADDRESSES[10],
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
    wrappedNativeToken: 'WAVAX',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[43114],
    // Avalanche uses TraderJoe, not Uniswap V3
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
    wrappedNativeToken: 'WXDAI',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[100],
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
    wrappedNativeToken: 'WFTM',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[250],
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
    wrappedNativeToken: 'WETH',
    wrappedNativeAddress: WRAPPED_NATIVE_ADDRESSES[8453],
    uniswapV3: UNISWAP_V3_ADDRESSES[8453],
  },
};

/**
 * Ethereum Mainnet Config (Primary for Phase 2)
 */
export const ETHEREUM_CONFIG = CHAINS.ethereum;

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
 * Get Uniswap V3 addresses for chain
 */
export function getUniswapV3Addresses(chainId: number): UniswapV3Addresses | undefined {
  return UNISWAP_V3_ADDRESSES[chainId];
}

/**
 * Get wrapped native token address
 */
export function getWrappedNativeAddress(chainId: number): string | undefined {
  return WRAPPED_NATIVE_ADDRESSES[chainId];
}

/**
 * Check if chain has Uniswap V3
 */
export function hasUniswapV3(chainId: number): boolean {
  return chainId in UNISWAP_V3_ADDRESSES;
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

/**
 * Chains with Uniswap V3 support
 */
export const UNISWAP_V3_CHAIN_IDS = Object.keys(UNISWAP_V3_ADDRESSES).map(Number);

/**
 * Check if chain has PancakeSwap V3
 */
export function hasPancakeSwapV3(chainId: number): boolean {
  return chainId === 56;
}

/**
 * Get PancakeSwap V3 addresses (BSC only)
 */
export function getPancakeSwapV3Addresses(): PancakeSwapV3Addresses | undefined {
  return PANCAKESWAP_V3_ADDRESSES;
}

/**
 * Chains with PancakeSwap V3 support
 */
export const PANCAKESWAP_V3_CHAIN_IDS = [56];

/**
 * PHASE 12: Solana Configuration (Non-EVM)
 * Solana uses signatures instead of tx hashes
 */
export const SOLANA_CONFIG = {
  name: 'Solana',
  symbol: 'SOL',
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  explorerUrl: 'https://solscan.io',
  explorerTxPath: '/tx/',
  nativeToken: 'SOL',
  nativeDecimals: 9,
  // Solana uses "mainnet-beta" cluster
  cluster: 'mainnet-beta' as const,
};

/**
 * PHASE 12: Get Solana explorer URL for transaction signature
 */
export function getSolanaExplorerUrl(signature: string): string {
  return `${SOLANA_CONFIG.explorerUrl}${SOLANA_CONFIG.explorerTxPath}${signature}`;
}

/**
 * PHASE 12: Check if a chain is Solana
 * Solana doesn't use chainId, we use a special identifier
 */
export const SOLANA_CHAIN_ID = 'solana' as const;

/**
 * PHASE 12: Check if address is Solana format (base58)
 */
export function isSolanaAddress(address: string): boolean {
  // Solana addresses are 32-44 characters of base58
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export default CHAINS;
