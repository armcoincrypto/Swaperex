/**
 * Services Index
 *
 * Export all service modules.
 * All services are READ-ONLY or BUILD-ONLY.
 * NO signing, NO transaction sending.
 */

// Quote Service (READ-ONLY)
export {
  getQuote,
  getBestQuote,
  formatQuoteForDisplay,
  getMinAmountOut,
  FEE_TIERS,
  type QuoteResult,
  type FeeTier,
} from './uniswapQuote';

// Transaction Builder (BUILD-ONLY, no send)
export {
  buildSwapTx,
  buildApprovalTx,
  buildRouterApproval,
  calculateMinOutput,
  validateSwapParams,
  type SwapParams,
  type UnsignedSwapTx,
  type ApprovalTx,
} from './uniswapTxBuilder';
