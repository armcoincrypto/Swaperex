/**
 * Swap Validation Utilities
 *
 * Comprehensive validation for swap operations.
 * All validations are client-side before any RPC calls.
 *
 * PHASE 7 - SAFETY CHECKS:
 * - Prevent same token swap
 * - Validate wallet connected
 * - Validate amount > 0
 * - Validate sufficient balance
 * - Validate token addresses
 * - Validate slippage range
 */

import { isAddress } from 'ethers';

/**
 * Validation error types
 */
export type SwapValidationError =
  | 'wallet_not_connected'
  | 'same_token'
  | 'invalid_from_token'
  | 'invalid_to_token'
  | 'invalid_amount'
  | 'amount_zero'
  | 'amount_negative'
  | 'insufficient_balance'
  | 'insufficient_gas'
  | 'slippage_too_low'
  | 'slippage_too_high'
  | 'invalid_recipient'
  | 'chain_not_supported'
  | 'quote_expired';

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: SwapValidationError[];
  messages: string[];
}

/**
 * Swap input parameters for validation
 */
export interface SwapValidationInput {
  isConnected: boolean;
  address: string | null;
  fromToken: string | null;
  toToken: string | null;
  fromAmount: string;
  fromBalance: string;
  slippage: number;
  chainId: number | null;
}

/**
 * Supported chain IDs for swaps
 * PHASE 11: ETH (1) and BSC (56) supported
 */
const SUPPORTED_CHAIN_IDS = [1, 56]; // Ethereum mainnet and BSC

/**
 * Slippage limits
 */
const MIN_SLIPPAGE = 0.01; // 0.01%
const MAX_SLIPPAGE = 50; // 50%
const HIGH_SLIPPAGE_WARNING = 5; // 5%

/**
 * Validate all swap inputs
 * Returns all validation errors (not just the first one)
 */
export function validateSwapInputs(input: SwapValidationInput): ValidationResult {
  const errors: SwapValidationError[] = [];
  const messages: string[] = [];

  // 1. Wallet connection check
  if (!input.isConnected || !input.address) {
    errors.push('wallet_not_connected');
    messages.push('Please connect your wallet to swap');
  }

  // 2. Token selection checks
  if (!input.fromToken) {
    errors.push('invalid_from_token');
    messages.push('Please select a token to swap from');
  }

  if (!input.toToken) {
    errors.push('invalid_to_token');
    messages.push('Please select a token to swap to');
  }

  // 3. Same token check (CRITICAL)
  if (input.fromToken && input.toToken && input.fromToken === input.toToken) {
    errors.push('same_token');
    messages.push('Cannot swap a token to itself');
  }

  // 4. Amount validation
  if (!input.fromAmount || input.fromAmount.trim() === '') {
    errors.push('invalid_amount');
    messages.push('Please enter an amount');
  } else {
    const amount = parseFloat(input.fromAmount);

    if (isNaN(amount)) {
      errors.push('invalid_amount');
      messages.push('Please enter a valid number');
    } else if (amount <= 0) {
      errors.push('amount_zero');
      messages.push('Amount must be greater than 0');
    } else if (amount < 0) {
      errors.push('amount_negative');
      messages.push('Amount cannot be negative');
    }
  }

  // 5. Balance validation
  if (input.fromAmount && input.fromBalance) {
    const amount = parseFloat(input.fromAmount);
    const balance = parseFloat(input.fromBalance);

    if (!isNaN(amount) && !isNaN(balance) && amount > balance) {
      errors.push('insufficient_balance');
      messages.push(`Insufficient balance. You have ${balance.toFixed(6)} available`);
    }
  }

  // 6. Slippage validation
  if (input.slippage < MIN_SLIPPAGE) {
    errors.push('slippage_too_low');
    messages.push(`Slippage must be at least ${MIN_SLIPPAGE}%`);
  } else if (input.slippage > MAX_SLIPPAGE) {
    errors.push('slippage_too_high');
    messages.push(`Slippage cannot exceed ${MAX_SLIPPAGE}%`);
  }

  // 7. Chain validation
  if (input.chainId !== null && !SUPPORTED_CHAIN_IDS.includes(input.chainId)) {
    errors.push('chain_not_supported');
    messages.push('Please switch to Ethereum or BSC');
  }

  // 8. Recipient validation (if address is available)
  if (input.address && !isAddress(input.address)) {
    errors.push('invalid_recipient');
    messages.push('Invalid wallet address');
  }

  return {
    isValid: errors.length === 0,
    errors,
    messages,
  };
}

/**
 * Quick validation - returns first error only
 * Use for button state and quick checks
 */
export function getFirstValidationError(input: SwapValidationInput): string | null {
  const result = validateSwapInputs(input);
  return result.messages[0] || null;
}

/**
 * Check if slippage is in warning range
 */
export function isSlippageWarning(slippage: number): boolean {
  return slippage >= HIGH_SLIPPAGE_WARNING && slippage <= MAX_SLIPPAGE;
}

/**
 * Check if slippage is dangerously high
 */
export function isSlippageDangerous(slippage: number): boolean {
  return slippage > 10;
}

/**
 * Check if slippage is too low (likely to fail)
 */
export function isSlippageTooLow(slippage: number): boolean {
  return slippage < 0.1;
}

/**
 * Validate token address format
 */
export function isValidTokenAddress(address: string): boolean {
  if (!address) return false;

  // Special case for native ETH
  if (address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    return true;
  }

  return isAddress(address);
}

/**
 * Check if tokens are the same (case-insensitive)
 */
export function isSameToken(tokenA: string | null, tokenB: string | null): boolean {
  if (!tokenA || !tokenB) return false;
  return tokenA.toLowerCase() === tokenB.toLowerCase();
}

/**
 * Parse and validate amount input
 * Returns null if invalid
 */
export function parseAmount(amount: string): number | null {
  if (!amount || amount.trim() === '') return null;

  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed < 0) return null;

  return parsed;
}

/**
 * Check if amount exceeds balance
 */
export function isInsufficientBalance(amount: string, balance: string): boolean {
  const amountNum = parseAmount(amount);
  const balanceNum = parseAmount(balance);

  if (amountNum === null || balanceNum === null) return false;
  return amountNum > balanceNum;
}

/**
 * Get validation state for button
 */
export function getButtonValidationState(input: SwapValidationInput): {
  disabled: boolean;
  text: string;
} {
  if (!input.isConnected) {
    return { disabled: true, text: 'Connect Wallet' };
  }

  if (!input.fromToken || !input.toToken) {
    return { disabled: true, text: 'Select Tokens' };
  }

  if (isSameToken(input.fromToken, input.toToken)) {
    return { disabled: true, text: 'Select Different Tokens' };
  }

  const amount = parseAmount(input.fromAmount);
  if (amount === null || amount <= 0) {
    return { disabled: true, text: 'Enter Amount' };
  }

  if (isInsufficientBalance(input.fromAmount, input.fromBalance)) {
    return { disabled: true, text: 'Insufficient Balance' };
  }

  if (input.chainId !== null && !SUPPORTED_CHAIN_IDS.includes(input.chainId)) {
    return { disabled: true, text: 'Switch Network' };
  }

  return { disabled: false, text: 'Preview Swap' };
}

/**
 * Log validation errors for debugging
 */
export function logValidationErrors(
  context: string,
  input: SwapValidationInput,
  result: ValidationResult
): void {
  if (!result.isValid) {
    console.warn(`[Swap Validation] ${context}:`, {
      errors: result.errors,
      messages: result.messages,
      input: {
        isConnected: input.isConnected,
        hasAddress: !!input.address,
        fromToken: input.fromToken,
        toToken: input.toToken,
        fromAmount: input.fromAmount,
        fromBalance: input.fromBalance,
        slippage: input.slippage,
        chainId: input.chainId,
      },
    });
  }
}

export default {
  validateSwapInputs,
  getFirstValidationError,
  isSlippageWarning,
  isSlippageDangerous,
  isSlippageTooLow,
  isValidTokenAddress,
  isSameToken,
  parseAmount,
  isInsufficientBalance,
  getButtonValidationState,
  logValidationErrors,
};
