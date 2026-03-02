/**
 * EVM Balance Service
 *
 * PHASE 13: Fetches balances directly from EVM blockchains.
 * Supports ETH, BSC, Polygon, Arbitrum.
 *
 * SECURITY: Read-only operations, no signing.
 */

import { Contract, JsonRpcProvider, Network } from 'ethers';
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
 * RPC proxy - use central config (no HTTP fallbacks)
 */
import { RPC_PROXY_BASE } from '@/config/api';

/**
 * RPC endpoints by chain (ETH/Polygon/Arbitrum via proxy; BSC direct)
 */
const RPC_ENDPOINTS: Record<string, string> = {
  ethereum: `${RPC_PROXY_BASE}/eth`,
  bsc: 'https://bsc-dataseed.binance.org',
  polygon: `${RPC_PROXY_BASE}/polygon`,
  arbitrum: `${RPC_PROXY_BASE}/arbitrum`,
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
 * Native token info by chain (includes logo URLs from token list)
 */
const NATIVE_TOKENS: Record<string, { symbol: string; name: string; decimals: number; logoUrl: string }> = {
  ethereum: { symbol: 'ETH', name: 'Ethereum', decimals: 18, logoUrl: 'https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png' },
  bsc: { symbol: 'BNB', name: 'BNB', decimals: 18, logoUrl: 'https://tokens.1inch.io/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c.png' },
  polygon: { symbol: 'MATIC', name: 'Polygon', decimals: 18, logoUrl: 'https://tokens.1inch.io/0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0.png' },
  arbitrum: { symbol: 'ETH', name: 'Ethereum', decimals: 18, logoUrl: 'https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png' },
};

/**
 * Native token address placeholder
 */
const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Singleton provider cache — reuses providers across calls to prevent
 * connection exhaustion. staticNetwork skips eth_chainId detection,
 * eliminating the infinite "retry in 1s" loop on network errors.
 */
const providerCache: Record<string, JsonRpcProvider> = {};
const providerFailCount: Record<string, number> = {};

function getProvider(chain: string): JsonRpcProvider {
  const rpc = RPC_ENDPOINTS[chain];
  if (!rpc) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  // Recreate provider after 3 consecutive failures (clears stale connections)
  if (providerCache[chain] && (providerFailCount[chain] || 0) >= 3) {
    delete providerCache[chain];
    providerFailCount[chain] = 0;
  }

  if (!providerCache[chain]) {
    const chainId = CHAIN_IDS[chain];
    const network = Network.from(chainId);
    providerCache[chain] = new JsonRpcProvider(rpc, network, { staticNetwork: network });
  }
  return providerCache[chain];
}

/** Record provider success — reset failure count */
function recordProviderSuccess(chain: string): void {
  providerFailCount[chain] = 0;
}

/** Record provider failure — increment count for cache clearing */
function recordProviderFailure(chain: string): void {
  providerFailCount[chain] = (providerFailCount[chain] || 0) + 1;
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
    logoUrl: nativeInfo.logoUrl,
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
  } catch {
    // Expected: token may not exist on-chain or user holds zero
    // Silent in production — not an error condition
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

    recordProviderSuccess(chain);

    return {
      chain: chain as PortfolioChain,
      chainId,
      nativeBalance,
      tokenBalances,
      totalUsdValue,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    recordProviderFailure(chain);
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
        logoUrl: NATIVE_TOKENS[chain]?.logoUrl,
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
