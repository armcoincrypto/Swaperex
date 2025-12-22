/**
 * Transaction History Service
 *
 * Fetches recent transactions from blockchain explorers (Etherscan/BSCScan).
 * READ-ONLY: No backend needed, uses public APIs.
 *
 * PRODUCTION: Simple, reliable, no analytics.
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

// Known DEX router addresses for swap detection
const SWAP_ROUTERS: Record<string, string> = {
  // Uniswap V3
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3',
  // 1inch
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch',
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch',
  // PancakeSwap V3
  '0x13f4ea83d0bd40e75c8222255bc855a974568dd4': 'PancakeSwap V3',
  '0x1b81d678ffb9c0263b24a97847620c99d213eb14': 'PancakeSwap V2',
};

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
}

/**
 * Fetch recent transactions for an address
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

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== '1' || !Array.isArray(data.result)) {
      console.warn('[TxHistory] API returned no results:', data.message);
      return [];
    }

    // Parse transactions
    const transactions: Transaction[] = data.result.map((tx: any) => {
      const toAddress = tx.to?.toLowerCase() || '';
      const isSwap = Object.keys(SWAP_ROUTERS).includes(toAddress);
      const swapRouter = SWAP_ROUTERS[toAddress];

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || '',
        value: tx.value,
        valueFormatted: formatValue(tx.value, chainId),
        timestamp: parseInt(tx.timeStamp, 10) * 1000,
        blockNumber: parseInt(tx.blockNumber, 10),
        isSwap,
        swapRouter,
        status: tx.isError === '0' ? 'success' : 'failed',
        explorerUrl: `${explorerConfig.explorer}/tx/${tx.hash}`,
        chainId,
      };
    });

    console.log('[TxHistory] Found', transactions.length, 'transactions');
    return transactions;
  } catch (error) {
    console.error('[TxHistory] Fetch failed:', error);
    return [];
  }
}

/**
 * Get only swap transactions
 */
export async function getRecentSwaps(
  address: string,
  chainId: number,
  limit: number = 20
): Promise<Transaction[]> {
  // Fetch more to filter for swaps
  const allTx = await getRecentTransactions(address, chainId, 50);
  return allTx.filter((tx) => tx.isSwap).slice(0, limit);
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
