/**
 * EVM Balance Service
 *
 * PHASE 13: Fetches balances directly from EVM blockchains.
 * Supports ETH, BSC, Polygon, Arbitrum.
 *
 * SECURITY: Read-only operations, no signing.
 */

import { Contract, JsonRpcProvider } from 'ethers';
import {
  type PortfolioChain,
  type TokenBalance,
  type ChainBalance,
  formatBalance,
  logPortfolioLifecycle,
} from './portfolioTypes';
import { getTokenList, type Token } from '@/tokens';

/**
 * ERC20 minimal ABI for balance checking
 */
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * RPC endpoints by chain
 */
const RPC_ENDPOINTS: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
  polygon: 'https://polygon-rpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
};

/**
 * Chain ID mapping
 */
const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
};

/**
 * Native token info by chain
 */
const NATIVE_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  ethereum: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  bsc: { symbol: 'BNB', name: 'BNB', decimals: 18 },
  polygon: { symbol: 'MATIC', name: 'Polygon', decimals: 18 },
  arbitrum: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
};

/**
 * Native token address placeholder
 */
const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Create provider for chain
 */
function getProvider(chain: string): JsonRpcProvider {
  const rpc = RPC_ENDPOINTS[chain];
  if (!rpc) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  return new JsonRpcProvider(rpc);
}

/**
 * Fetch native balance (ETH, BNB, MATIC)
 */
async function fetchNativeBalance(
  provider: JsonRpcProvider,
  address: string,
  chain: string
): Promise<TokenBalance> {
  const nativeInfo = NATIVE_TOKENS[chain];
  if (!nativeInfo) {
    throw new Error(`Unknown native token for chain: ${chain}`);
  }

  const balance = await provider.getBalance(address);

  return {
    symbol: nativeInfo.symbol,
    name: nativeInfo.name,
    address: NATIVE_ADDRESS,
    decimals: nativeInfo.decimals,
    balance: balance.toString(),
    balanceFormatted: formatBalance(balance, nativeInfo.decimals),
    usdValue: null,
    usdPrice: null,
    isNative: true,
    chain: chain as PortfolioChain,
  };
}

/**
 * Fetch single ERC20 token balance
 */
async function fetchTokenBalance(
  provider: JsonRpcProvider,
  address: string,
  token: Token,
  chain: string
): Promise<TokenBalance | null> {
  try {
    // Skip native token placeholder
    if (token.address.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
      return null;
    }

    const contract = new Contract(token.address, ERC20_BALANCE_ABI, provider);
    const balance = await contract.balanceOf(address);

    // Skip zero balances
    if (balance === 0n) {
      return null;
    }

    return {
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      decimals: token.decimals,
      balance: balance.toString(),
      balanceFormatted: formatBalance(balance, token.decimals),
      usdValue: null,
      usdPrice: null,
      logoUrl: token.logoURI,
      isNative: false,
      chain: chain as PortfolioChain,
    };
  } catch (error) {
    // Token may not exist or contract call failed
    console.warn(`[EVMBalance] Failed to fetch ${token.symbol}:`, error);
    return null;
  }
}

/**
 * Fetch all token balances for a chain
 */
export async function fetchEvmChainBalance(
  address: string,
  chain: string
): Promise<ChainBalance> {
  logPortfolioLifecycle('Fetching EVM balances', { chain, address: address.slice(0, 10) + '...' });

  const provider = getProvider(chain);
  const chainId = CHAIN_IDS[chain];
  const tokenList = getTokenList(chainId);

  try {
    // Fetch native balance
    const nativeBalance = await fetchNativeBalance(provider, address, chain);

    // Fetch token balances in parallel (batch of 5 to avoid rate limits)
    const tokens = tokenList?.tokens || [];
    const tokenBalances: TokenBalance[] = [];

    // Process in batches of 5
    const batchSize = 5;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((token) => fetchTokenBalance(provider, address, token, chain))
      );
      tokenBalances.push(...results.filter((b): b is TokenBalance => b !== null));
    }

    // Calculate total USD value (will be filled in by price service)
    const totalUsdValue = '0';

    logPortfolioLifecycle('EVM balances fetched', {
      chain,
      nativeBalance: nativeBalance.balanceFormatted,
      tokenCount: tokenBalances.length,
    });

    return {
      chain: chain as PortfolioChain,
      chainId,
      nativeBalance,
      tokenBalances,
      totalUsdValue,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch balances';
    logPortfolioLifecycle('EVM balance error', { chain, error: message });

    // Return empty balance with error
    return {
      chain: chain as PortfolioChain,
      chainId,
      nativeBalance: {
        symbol: NATIVE_TOKENS[chain]?.symbol || 'ETH',
        name: NATIVE_TOKENS[chain]?.name || 'Native',
        address: NATIVE_ADDRESS,
        decimals: 18,
        balance: '0',
        balanceFormatted: '0',
        usdValue: null,
        usdPrice: null,
        isNative: true,
        chain: chain as PortfolioChain,
      },
      tokenBalances: [],
      totalUsdValue: '0',
      lastUpdated: Date.now(),
      error: message,
    };
  }
}

/**
 * Fetch balances for multiple EVM chains
 */
export async function fetchMultiEvmBalances(
  address: string,
  chains: string[] = ['ethereum', 'bsc', 'polygon', 'arbitrum']
): Promise<Record<string, ChainBalance>> {
  logPortfolioLifecycle('Fetching multi-chain EVM balances', { chains, address: address.slice(0, 10) + '...' });

  const results: Record<string, ChainBalance> = {};

  // Fetch all chains in parallel
  const balancePromises = chains.map((chain) =>
    fetchEvmChainBalance(address, chain).then((balance) => ({
      chain,
      balance,
    }))
  );

  const balances = await Promise.all(balancePromises);

  for (const { chain, balance } of balances) {
    results[chain] = balance;
  }

  logPortfolioLifecycle('Multi-chain EVM balances complete', {
    chainsProcessed: Object.keys(results).length,
  });

  return results;
}

/**
 * Check if address is valid EVM address
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export default fetchEvmChainBalance;
