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

// Phase 1 — 1inch platform fee (env)
export {
  MAX_PLATFORM_FEE_BPS,
  feeBpsToOneInchFeePercent,
  formatOneInchFeeParam,
  getMonetizationConfig,
  isMonetizationActiveForProvider,
  type MonetizationConfig,
} from './monetization';

// Uniswap V3 fee wrapper (Ethereum ERC20→ERC20, feature-flagged)
export {
  ensureUniswapWrapperChainFeeBps,
  getUniswapWrapperConfig,
  getUniswapWrapperFeeBpsForUi,
  getUniswapWrapperSpenderAddress,
  isUniswapWrapperExecutionEligible,
  isUniswapWrapperFeeBpsUnverified,
  isUniswapWrapperFeeBpsVerified,
  shouldUseUniswapWrapperForSymbols,
  type UniswapWrapperConfig,
} from './uniswapWrapper';

// PancakeSwap V3 fee wrapper (BSC / chain 56, ERC20→ERC20, feature-flagged)
export {
  ensurePancakeWrapperChainFeeBps,
  getPancakeWrapperConfig,
  getPancakeWrapperFeeBpsForUi,
  getPancakeWrapperSpenderAddress,
  isPancakeWrapperExecutionEligible,
  isPancakeWrapperFeeBpsUnverified,
  isPancakeWrapperFeeBpsVerified,
  shouldUsePancakeWrapperForSymbols,
  type PancakeWrapperConfig,
} from './pancakeWrapper';

// PancakeSwap V3 fee wrapper V2 (BSC; optional native legs) — optional fixed route `pancakeswap-v3-wrapper-v2` when env-enabled
export {
  ensurePancakeWrapperV2ChainFeeBps,
  getPancakeWrapperV2Config,
  getPancakeWrapperV2FeeBpsForUi,
  getPancakeWrapperV2SpenderAddress,
  isPancakeWrapperV2ExecutionEligible,
  isPancakeWrapperV2FeeBpsUnverified,
  isPancakeWrapperV2FeeBpsVerified,
  type PancakeWrapperV2Config,
} from './pancakeWrapperV2';
