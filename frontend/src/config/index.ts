/**
 * Configuration Exports
 *
 * Centralized exports for all chain, token, and DEX configurations.
 * These configs are extracted from the Telegram bot and contain ONLY:
 * - Public chain data
 * - Public token addresses
 * - DEX API endpoints
 * - Uniswap V3 contract addresses
 *
 * NO private keys, NO signing logic, NO custodial code.
 */

// Chain configurations
export {
  CHAINS,
  CHAIN_IDS,
  SUPPORTED_CHAIN_IDS,
  UNISWAP_V3_ADDRESSES,
  UNISWAP_V3_CHAIN_IDS,
  WRAPPED_NATIVE_ADDRESSES,
  ETHEREUM_CONFIG,
  getChainById,
  getChainByName,
  getExplorerTxUrl,
  getUniswapV3Addresses,
  getWrappedNativeAddress,
  hasUniswapV3,
  isSupportedChain,
  // PHASE 12: Solana exports
  SOLANA_CONFIG,
  SOLANA_CHAIN_ID,
  getSolanaExplorerUrl,
  isSolanaAddress,
  type ChainConfig,
  type ChainId,
  type ChainName,
  type UniswapV3Addresses,
} from './chains';

// Token configurations
export {
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
  NATIVE_TOKEN_ADDRESS,
  SOLANA_TOKENS,
  SOLANA_DECIMALS,
  COMMON_TOKENS,
  getTokenAddress,
  getTokenDecimals,
  getChainTokens,
  isNativeToken,
  type TokenInfo,
} from './tokens';

// DEX configurations
export {
  DEX_CONFIGS,
  DEX_CHAIN_MAP,
  NON_EVM_DEXES,
  ONEINCH_CONFIG,
  JUPITER_CONFIG,
  SWAP_DEFAULTS,
  getDexConfig,
  getDexByChainId,
  getDexesForChain,
  isOneInchSupported,
  getOneInchEndpoint,
  type DexConfig,
} from './dex';
