/**
 * Address Normalization Utilities
 *
 * Two types of normalization for different use cases:
 *
 * 1. normalizeAddressChecksum() - For on-chain calls
 *    Uses ethers.getAddress() to convert to EIP-55 checksum format.
 *    Returns null if address is invalid.
 *
 * 2. normalizeAddressLower() - For storage and comparison keys
 *    Simple lowercase conversion for consistent key lookup.
 *    Use this when comparing addresses or storing in localStorage/state.
 */

import { getAddress, isAddress } from 'ethers';

/**
 * Normalize address to EIP-55 checksum format for on-chain calls.
 * Returns null if address is invalid.
 *
 * Use this when:
 * - Making contract calls (balanceOf, etc.)
 * - Interacting with ethers.js Contract instances
 */
export function normalizeAddressChecksum(address: string): string | null {
  try {
    if (!isAddress(address)) {
      return null;
    }
    return getAddress(address);
  } catch {
    return null;
  }
}

/**
 * Normalize address to lowercase for storage and comparison.
 *
 * Use this when:
 * - Storing addresses in localStorage
 * - Using addresses as Map/Set keys
 * - Comparing two addresses for equality
 */
export function normalizeAddressLower(address: string): string {
  return address.toLowerCase();
}
