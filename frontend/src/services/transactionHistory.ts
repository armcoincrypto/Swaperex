/**
 * Transaction History Service
 *
 * Fetches recent transactions from blockchain explorers (Etherscan/BSCScan).
 * READ-ONLY: No backend needed, uses public APIs.
 *
 * PRODUCTION: Simple, reliable, no analytics.
 * Improved swap detection and error handling.
 */

// Explorer API endpoints
const EXPLORER_APIS: Record<number, { api: string; explorer: string; name: string }> = {
  1: {
    api: 'https://api.etherscan.io/api',
    explorer: 'https://etherscan.io',
    name: 'Etherscan',
  },
  56: {
    api: 'https://api.bscscan.com/api',
    explorer: 'https://bscscan.com',
    name: 'BscScan',
  },
};

// Known DEX router addresses for swap detection (lowercase)
const SWAP_ROUTERS: Record<string, string> = {
  // Uniswap V3 (Ethereum)
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
  '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b': 'Uniswap Universal Router',
  // 1inch (Multi-chain)
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch V5',
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch V6',
  '0x1111111254fb6c44bac0bed2854e76f90643097d': '1inch V4',
  // PancakeSwap (BSC)
  '0x13f4ea83d0bd40e75c8222255bc855a974568dd4': 'PancakeSwap V3',
  '0x1b81d678ffb9c0263b24a97847620c99d213eb14': 'PancakeSwap V2',
  '0x10ed43c718714eb63d5aa57b78b54704e256024e': 'PancakeSwap V2',
  '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865': 'PancakeSwap Universal',
  // SushiSwap
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': 'SushiSwap',
  // OpenOcean
  '0x6352a56caadc4f1e25cd6c75970fa768a3304e64': 'OpenOcean',
};

// Swap-related method signatures (first 10 chars of function selector)
const SWAP_METHODS = [
  '0x7ff36ab5', // swapExactETHForTokens
  '0x18cbafe5', // swapExactTokensForETH
  '0x38ed1739', // swapExactTokensForTokens
  '0x8803dbee', // swapTokensForExactTokens
  '0xfb3bdb41', // swapETHForExactTokens
  '0x5c11d795', // swapExactTokensForTokensSupportingFeeOnTransferTokens
  '0xb6f9de95', // swapExactETHForTokensSupportingFeeOnTransferTokens
  '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
  '0x04e45aaf', // exactInputSingle (Uniswap V3)
  '0xc04b8d59', // exactInput (Uniswap V3)
  '0xdb3e2198', // exactOutputSingle (Uniswap V3)
  '0xf28c0498', // exactOutput (Uniswap V3)
  '0x12aa3caf', // swap (1inch)
  '0xe449022e', // uniswapV3Swap (1inch)
];

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  valueFormatted: string;
  timestamp: number;
  blockNumber: number;
  isSwap: boolean;
  swapRouter?: string;
  status: 'success' | 'failed' | 'pending';
  explorerUrl: string;
  chainId: number;
  methodId?: string;
}

/**
 * Detect if transaction is a swap based on router address or method signature
 */
function isSwapTransaction(to: string, inputData: string): { isSwap: boolean; router?: string } {
  const toAddress = to?.toLowerCase() || '';

  // Check if to address is a known router
  if (SWAP_ROUTERS[toAddress]) {
    return { isSwap: true, router: SWAP_ROUTERS[toAddress] };
  }

  // Check if method signature matches swap methods
  if (inputData && inputData.length >= 10) {
    const methodId = inputData.slice(0, 10).toLowerCase();
    if (SWAP_METHODS.includes(methodId)) {
      return { isSwap: true, router: 'DEX Swap' };
    }
  }

  return { isSwap: false };
}

/**
 * Fetch recent transactions for an address
 * Returns empty array on error (does not throw)
 */
export async function getRecentTransactions(
  address: string,
  chainId: number,
  limit: number = 10
): Promise<Transaction[]> {
  const explorerConfig = EXPLORER_APIS[chainId];
  if (!explorerConfig) {
    console.warn(`[TxHistory] No explorer API for chain ${chainId}`);
    return [];
  }

  try {
    // Fetch normal transactions
    const url = new URL(explorerConfig.api);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'txlist');
    url.searchParams.set('address', address);
    url.searchParams.set('startblock', '0');
    url.searchParams.set('endblock', '99999999');
    url.searchParams.set('page', '1');
    url.searchParams.set('offset', String(limit));
    url.searchParams.set('sort', 'desc');

    console.log('[TxHistory] Fetching from:', explorerConfig.name);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (data.status !== '1' || !Array.isArray(data.result)) {
      // API returned error or no results - not a failure, just no data
      console.log('[TxHistory] No transactions found or API limit:', data.message || 'no results');
      return [];
    }

    // Parse transactions
    const transactions: Transaction[] = data.result.map((tx: any) => {
      const { isSwap, router } = isSwapTransaction(tx.to, tx.input);

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || '',
        value: tx.value,
        valueFormatted: formatValue(tx.value, chainId),
        timestamp: parseInt(tx.timeStamp, 10) * 1000,
        blockNumber: parseInt(tx.blockNumber, 10),
        isSwap,
        swapRouter: router,
        status: tx.isError === '0' ? 'success' : 'failed',
        explorerUrl: `${explorerConfig.explorer}/tx/${tx.hash}`,
        chainId,
        methodId: tx.input?.slice(0, 10),
      };
    });

    console.log('[TxHistory] Found', transactions.length, 'transactions,',
      transactions.filter(t => t.isSwap).length, 'swaps');
    return transactions;
  } catch (error) {
    // Log but don't throw - return empty array
    if ((error as Error).name === 'AbortError') {
      console.warn('[TxHistory] Request timed out for chain', chainId);
    } else {
      console.warn('[TxHistory] Fetch failed for chain', chainId, ':', (error as Error).message);
    }
    return [];
  }
}

/**
 * Get only swap transactions
 * Returns empty array on error (does not throw)
 */
export async function getRecentSwaps(
  address: string,
  chainId: number,
  limit: number = 20
): Promise<Transaction[]> {
  // Fetch more to filter for swaps
  const allTx = await getRecentTransactions(address, chainId, 100);
  return allTx.filter((tx) => tx.isSwap).slice(0, limit);
}

/**
 * Get swap history across multiple chains
 * Fetches in parallel, returns combined results
 * Does not fail if one chain errors
 */
export async function getMultiChainSwaps(
  address: string,
  chainIds: number[],
  limitPerChain: number = 10
): Promise<Transaction[]> {
  const results = await Promise.allSettled(
    chainIds.map(chainId => getRecentSwaps(address, chainId, limitPerChain))
  );

  // Combine successful results
  const allSwaps: Transaction[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allSwaps.push(...result.value);
    } else {
      console.warn(`[TxHistory] Failed to fetch swaps for chain ${chainIds[index]}`);
    }
  });

  // Sort by timestamp descending
  return allSwaps.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Format wei value to readable string
 */
function formatValue(weiValue: string, chainId: number): string {
  try {
    const wei = BigInt(weiValue);
    const ether = Number(wei) / 1e18;

    if (ether === 0) return '0';
    if (ether < 0.0001) return '< 0.0001';

    const symbol = chainId === 56 ? 'BNB' : 'ETH';
    return `${ether.toFixed(4)} ${symbol}`;
  } catch {
    return '0';
  }
}

/**
 * Format timestamp to relative time
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerUrl(hash: string, chainId: number): string {
  const config = EXPLORER_APIS[chainId];
  if (!config) return '#';
  return `${config.explorer}/tx/${hash}`;
}

export default getRecentTransactions;
