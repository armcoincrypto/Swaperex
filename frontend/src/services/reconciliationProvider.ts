/**
 * Read-only JSON-RPC provider resolution for transaction reconciliation.
 */

import { JsonRpcProvider, Network } from 'ethers';
import {
  getBscReadRpcCandidates,
  getEthereumReadRpcCandidates,
  JSONRPC_TIMEOUT_MS,
  raceWithTimeout,
} from '@/config/rpc';
import { isSupportedJournalChain } from '@/utils/transactionJournalValidation';

const providerCache = new Map<number, JsonRpcProvider>();

function chainIdToNetwork(chainId: number): Network | null {
  try {
    return Network.from(chainId);
  } catch {
    return null;
  }
}

function candidatesForChain(chainId: number): string[] {
  if (chainId === 1) return getEthereumReadRpcCandidates();
  if (chainId === 56) return getBscReadRpcCandidates();
  return [];
}

export async function resolveReconciliationProvider(chainId: number): Promise<JsonRpcProvider | null> {
  if (!isSupportedJournalChain(chainId)) return null;

  const cached = providerCache.get(chainId);
  if (cached) {
    try {
      await raceWithTimeout(cached.getBlockNumber(), JSONRPC_TIMEOUT_MS);
      return cached;
    } catch {
      providerCache.delete(chainId);
    }
  }

  const network = chainIdToNetwork(chainId);
  if (!network) return null;

  for (const url of candidatesForChain(chainId)) {
    try {
      const provider = new JsonRpcProvider(url, network, { staticNetwork: network });
      await raceWithTimeout(provider.getBlockNumber(), JSONRPC_TIMEOUT_MS);
      providerCache.set(chainId, provider);
      return provider;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function clearReconciliationProviderCache(): void {
  providerCache.clear();
}
