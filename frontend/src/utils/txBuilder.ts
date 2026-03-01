/**
 * Transaction Builder
 *
 * Builds unsigned native and ERC-20 transfer transactions.
 * All amounts handled as BigInt for precision.
 */

import { parseUnits, formatUnits, Interface } from 'ethers';
import type { TransactionRequest } from 'ethers';

const ERC20_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

/**
 * Parse a decimal amount string to BigInt with correct decimals.
 * Prevents scientific notation and rounding bugs.
 */
export function parseAmount(amount: string, decimals: number): bigint {
  // Clean input: remove whitespace, reject scientific notation
  const cleaned = amount.trim();
  if (/[eE]/.test(cleaned)) {
    throw new Error('Scientific notation not supported');
  }
  if (cleaned === '' || cleaned === '.') {
    throw new Error('Invalid amount');
  }

  // Check decimal places don't exceed token decimals
  const parts = cleaned.split('.');
  if (parts.length === 2 && parts[1].length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }

  return parseUnits(cleaned, decimals);
}

/**
 * Format a BigInt amount to human-readable string
 */
export function formatAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

/**
 * Build a native token (ETH/BNB/MATIC) transfer
 */
export function buildNativeTransfer(
  to: string,
  amount: bigint,
): TransactionRequest {
  return {
    to,
    value: amount,
    data: '0x',
  };
}

/**
 * Build an ERC-20 token transfer
 */
export function buildERC20Transfer(
  tokenAddress: string,
  to: string,
  amount: bigint,
): TransactionRequest {
  const data = ERC20_INTERFACE.encodeFunctionData('transfer', [to, amount]);
  return {
    to: tokenAddress,
    value: 0n,
    data,
  };
}
