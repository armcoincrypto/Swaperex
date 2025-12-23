/**
 * Token Validation Service
 *
 * Validates and fetches ERC20 token metadata from blockchain.
 * Checks for liquidity pool existence on Uniswap V3 (ETH) and PancakeSwap V3 (BSC).
 */

import { Contract, isAddress, formatUnits } from 'ethers';
import type { CustomToken } from '@/stores/customTokenStore';
import { NATIVE_TOKEN_ADDRESS, getWrappedNativeAddress } from '@/tokens';

// ERC20 ABI - minimal for metadata fetching
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
];

// Uniswap V3 Factory ABI - for pool lookup
const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
];

// Factory addresses by chain
const FACTORY_ADDRESSES: Record<number, string> = {
  1: '0x1F98431c8aD98523631AE4a59f267346ea31F984',   // Uniswap V3 Factory
  56: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',  // PancakeSwap V3 Factory
};

// Fee tiers to check for pool existence
const FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

export interface TokenValidationResult {
  success: boolean;
  token?: CustomToken;
  error?: string;
  warning?: string;
}

/**
 * Validate and fetch ERC20 token metadata
 */
export async function validateToken(
  address: string,
  chainId: number,
  provider: unknown // ethers Provider
): Promise<TokenValidationResult> {
  // Validate address format
  if (!isAddress(address)) {
    return {
      success: false,
      error: 'Invalid contract address format',
    };
  }

  // Don't allow native token address
  if (address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
    return {
      success: false,
      error: 'Cannot import native token (ETH/BNB)',
    };
  }

  try {
    // Create contract instance
    const contract = new Contract(address, ERC20_ABI, provider as import('ethers').Provider);

    // Fetch token metadata in parallel
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      contract.name().catch(() => null),
      contract.symbol().catch(() => null),
      contract.decimals().catch(() => null),
      contract.totalSupply().catch(() => null),
    ]);

    // Validate that it's a real ERC20 token
    if (!symbol || !name || decimals === null) {
      return {
        success: false,
        error: 'Contract is not a valid ERC20 token',
      };
    }

    // Check for liquidity pool
    const hasLiquidity = await checkPoolExists(address, chainId, provider);

    // Build warning message if no liquidity
    let warning: string | undefined;
    if (!hasLiquidity) {
      warning = 'No liquidity pool found. This token may not be tradeable.';
    }

    // Format total supply for display
    const formattedSupply = totalSupply
      ? formatUnits(totalSupply, decimals)
      : undefined;

    // Build custom token object
    const token: CustomToken = {
      symbol: symbol.toUpperCase(),
      name,
      address: address.toLowerCase(),
      decimals: Number(decimals),
      chainId,
      isCustom: true,
      addedAt: Date.now(),
      verified: hasLiquidity,
      totalSupply: formattedSupply,
      warning,
    };

    return {
      success: true,
      token,
      warning,
    };
  } catch (err) {
    console.error('[TokenValidation] Error validating token:', err);
    return {
      success: false,
      error: 'Failed to fetch token data. Check the contract address.',
    };
  }
}

/**
 * Check if a liquidity pool exists for the token
 * Checks against wrapped native (WETH/WBNB) on common fee tiers
 */
async function checkPoolExists(
  tokenAddress: string,
  chainId: number,
  provider: unknown
): Promise<boolean> {
  const factoryAddress = FACTORY_ADDRESSES[chainId];
  if (!factoryAddress) {
    console.warn('[TokenValidation] No factory address for chain:', chainId);
    return false;
  }

  const wrappedNative = getWrappedNativeAddress(chainId);
  if (!wrappedNative) {
    return false;
  }

  try {
    const factory = new Contract(
      factoryAddress,
      UNISWAP_V3_FACTORY_ABI,
      provider as import('ethers').Provider
    );

    // Check each fee tier for a pool
    for (const fee of FEE_TIERS) {
      const pool = await factory.getPool(tokenAddress, wrappedNative, fee);
      // Address(0) means no pool exists
      if (pool && pool !== '0x0000000000000000000000000000000000000000') {
        console.log(`[TokenValidation] Found pool at fee tier ${fee}:`, pool);
        return true;
      }
    }

    // Also check against major stablecoins
    const stablecoins: Record<number, string[]> = {
      1: [
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      ],
      56: [
        '0x55d398326f99059fF775485246999027B3197955', // USDT (BSC)
        '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC (BSC)
      ],
    };

    const chainStables = stablecoins[chainId] || [];
    for (const stable of chainStables) {
      for (const fee of FEE_TIERS) {
        const pool = await factory.getPool(tokenAddress, stable, fee);
        if (pool && pool !== '0x0000000000000000000000000000000000000000') {
          console.log(`[TokenValidation] Found stablecoin pool at fee tier ${fee}:`, pool);
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    console.error('[TokenValidation] Error checking pool:', err);
    return false;
  }
}

/**
 * Quick validation - just check if it looks like a valid address
 */
export function isValidTokenAddress(address: string): boolean {
  if (!address) return false;

  // Native token addresses are valid
  if (address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
    return true;
  }

  return isAddress(address);
}

export default {
  validateToken,
  isValidTokenAddress,
};
