/**
 * Transaction History Hook
 *
 * PHASE 13: Fetches recent transactions for a wallet.
 * Supports EVM chains and Solana.
 *
 * Lifecycle: idle → fetching → success/error
 *
 * SECURITY: Read-only operations, no signing.
 */

import { useCallback, useState, useEffect } from 'react';
import { JsonRpcProvider } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  type PortfolioChain,
  type TransactionRecord,
  type TxHistoryState,
  logTxHistoryLifecycle,
} from '@/services/portfolioTypes';
import { isValidEvmAddress } from '@/services/evmBalanceService';
import { isValidSolanaAddress } from '@/services/solanaBalanceService';
import { SOLANA_CONFIG, getExplorerTxUrl } from '@/config/chains';

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
 * Get explorer URL for transaction
 */
function getExplorerUrl(chain: PortfolioChain, hash: string): string {
  if (chain === 'solana') {
    return `${SOLANA_CONFIG.explorerUrl}/tx/${hash}`;
  }

  const chainId = CHAIN_IDS[chain];
  return getExplorerTxUrl(chainId, hash);
}

/**
 * Fetch EVM transaction history using recent blocks
 * Note: For production, use an indexer like Etherscan API
 */
async function fetchEvmTransactions(
  address: string,
  chain: string,
  limit: number = 10
): Promise<TransactionRecord[]> {
  const transactions: TransactionRecord[] = [];

  try {
    const rpc = RPC_ENDPOINTS[chain];
    if (!rpc) return [];

    const provider = new JsonRpcProvider(rpc);

    // Get recent block range
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 1000); // Last ~1000 blocks

    // Note: This is a simplified approach. For production, use:
    // - Etherscan API
    // - The Graph
    // - Alchemy/Infura transaction APIs
    // - Covalent API

    // For now, we'll get the last few blocks and check for transactions
    const blocksToCheck = Math.min(10, latestBlock - fromBlock);

    for (let i = 0; i < blocksToCheck && transactions.length < limit; i++) {
      const blockNumber = latestBlock - i;
      const block = await provider.getBlock(blockNumber, true);

      if (!block || !block.prefetchedTransactions) continue;

      for (const tx of block.prefetchedTransactions) {
        // Check if address is sender or receiver
        if (
          tx.from.toLowerCase() === address.toLowerCase() ||
          tx.to?.toLowerCase() === address.toLowerCase()
        ) {
          transactions.push({
            hash: tx.hash,
            chain: chain as PortfolioChain,
            type: tx.data && tx.data !== '0x' ? 'swap' : 'transfer',
            status: 'confirmed',
            timestamp: block.timestamp * 1000,
            from: tx.from,
            to: tx.to || '',
            value: tx.value.toString(),
            valueFormatted: (Number(tx.value) / 1e18).toFixed(6),
            explorerUrl: getExplorerUrl(chain as PortfolioChain, tx.hash),
          });

          if (transactions.length >= limit) break;
        }
      }
    }

    logTxHistoryLifecycle('EVM transactions fetched', {
      chain,
      count: transactions.length,
    });
  } catch (error) {
    console.warn(`[TxHistory] Failed to fetch ${chain} transactions:`, error);
  }

  return transactions;
}

/**
 * Fetch Solana transaction history
 */
async function fetchSolanaTransactions(
  address: string,
  limit: number = 20
): Promise<TransactionRecord[]> {
  const transactions: TransactionRecord[] = [];

  try {
    const publicKey = new PublicKey(address);
    const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');

    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit,
    });

    for (const sig of signatures) {
      transactions.push({
        hash: sig.signature,
        chain: 'solana',
        type: 'unknown', // Would need to parse transaction for type
        status: sig.err ? 'failed' : 'confirmed',
        timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
        from: address,
        to: '', // Would need to parse transaction
        value: '0',
        valueFormatted: '0',
        explorerUrl: getExplorerUrl('solana', sig.signature),
      });
    }

    logTxHistoryLifecycle('Solana transactions fetched', {
      count: transactions.length,
    });
  } catch (error) {
    console.warn('[TxHistory] Failed to fetch Solana transactions:', error);
  }

  return transactions;
}

/**
 * Transaction history hook options
 */
interface UseTxHistoryOptions {
  autoFetch?: boolean;
  chains?: PortfolioChain[];
  limit?: number;
}

/**
 * Transaction history hook
 */
export function useTxHistory(
  address: string | null,
  options: UseTxHistoryOptions = {}
) {
  const {
    autoFetch = true,
    chains = ['ethereum'],
    limit = 20,
  } = options;

  const [state, setState] = useState<TxHistoryState>({
    status: 'idle',
    transactions: [],
    error: null,
    hasMore: false,
  });

  /**
   * Fetch transaction history
   */
  const fetchHistory = useCallback(async () => {
    if (!address) {
      setState({
        status: 'idle',
        transactions: [],
        error: null,
        hasMore: false,
      });
      return;
    }

    logTxHistoryLifecycle('Fetching history', {
      address: address.slice(0, 10) + '...',
      chains,
    });

    setState((s) => ({ ...s, status: 'fetching', error: null }));

    try {
      const allTransactions: TransactionRecord[] = [];

      // Determine address type
      const isSolana = isValidSolanaAddress(address);
      const isEvm = isValidEvmAddress(address);

      if (isSolana) {
        const txs = await fetchSolanaTransactions(address, limit);
        allTransactions.push(...txs);
      } else if (isEvm) {
        // Fetch from each chain
        for (const chain of chains) {
          if (chain === 'solana') continue;
          const txs = await fetchEvmTransactions(address, chain, limit);
          allTransactions.push(...txs);
        }
      } else {
        throw new Error('Invalid wallet address');
      }

      // Sort by timestamp (newest first)
      allTransactions.sort((a, b) => b.timestamp - a.timestamp);

      logTxHistoryLifecycle('History fetched', {
        totalCount: allTransactions.length,
      });

      setState({
        status: 'success',
        transactions: allTransactions.slice(0, limit),
        error: null,
        hasMore: allTransactions.length > limit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch history';
      logTxHistoryLifecycle('History error', { error: message });

      setState((s) => ({
        ...s,
        status: 'error',
        error: message,
      }));
    }
  }, [address, chains, limit]);

  /**
   * Auto-fetch on address change
   */
  useEffect(() => {
    if (autoFetch && address) {
      fetchHistory();
    }
  }, [autoFetch, address, fetchHistory]);

  /**
   * Get transactions by chain
   */
  const getTransactionsByChain = useCallback(
    (chain: PortfolioChain): TransactionRecord[] => {
      return state.transactions.filter((tx) => tx.chain === chain);
    },
    [state.transactions]
  );

  /**
   * Get transactions by type
   */
  const getTransactionsByType = useCallback(
    (type: TransactionRecord['type']): TransactionRecord[] => {
      return state.transactions.filter((tx) => tx.type === type);
    },
    [state.transactions]
  );

  return {
    // State
    status: state.status,
    transactions: state.transactions,
    error: state.error,
    hasMore: state.hasMore,
    isLoading: state.status === 'fetching',

    // Actions
    fetchHistory,

    // Helpers
    getTransactionsByChain,
    getTransactionsByType,
    transactionCount: state.transactions.length,
  };
}

export default useTxHistory;
