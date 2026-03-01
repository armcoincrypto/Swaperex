/**
 * Address Utilities
 *
 * Checksum validation, ENS resolution, contract detection.
 * Uses ethers.js for all address operations.
 */

import { isAddress, getAddress, BrowserProvider } from 'ethers';

/**
 * Validate and checksum an Ethereum address
 */
export function validateAddress(addr: string): {
  valid: boolean;
  checksummed: string;
  error?: string;
} {
  if (!addr) {
    return { valid: false, checksummed: '', error: 'Address is required' };
  }

  const trimmed = addr.trim();

  // Check if it looks like an ENS name
  if (trimmed.endsWith('.eth')) {
    return { valid: false, checksummed: '', error: 'ENS_NAME' };
  }

  if (!isAddress(trimmed)) {
    return { valid: false, checksummed: '', error: 'Invalid address format' };
  }

  try {
    const checksummed = getAddress(trimmed);
    return { valid: true, checksummed };
  } catch {
    return { valid: false, checksummed: '', error: 'Invalid address checksum' };
  }
}

/**
 * Check if an address is a contract (has code deployed)
 */
export async function isContractAddress(
  addr: string,
  provider: BrowserProvider,
): Promise<boolean> {
  try {
    const code = await provider.getCode(addr);
    return code !== '0x' && code.length > 2;
  } catch {
    return false;
  }
}

/**
 * Resolve ENS name to address (Ethereum mainnet only)
 */
export async function resolveENS(
  name: string,
  provider: BrowserProvider,
): Promise<string | null> {
  try {
    const resolved = await provider.resolveName(name);
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Convert address to EIP-55 checksum format
 */
export function toChecksumAddress(addr: string): string {
  try {
    return getAddress(addr);
  } catch {
    return addr;
  }
}
