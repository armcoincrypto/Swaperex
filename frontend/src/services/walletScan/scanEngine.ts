/**
 * Wallet Scan Engine
 *
 * Core scanning logic: fetches token balances per chain with
 * concurrency control, timeout, fallback RPCs, and abort support.
 *
 * Non-custodial: uses read-only JsonRpcProvider calls only.
 */

import { JsonRpcProvider, Contract, formatUnits, formatEther, getAddress } from 'ethers';
import { ERC20_TOKENS, CHAIN_NAME_TO_ID } from '@/stores/balanceStore';
import { useCustomTokenStore } from '@/stores/customTokenStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { getRpcEndpoints, type RpcEndpoint } from './rpcConfig';
import type {
  ScanChainName,
  ScannedToken,
  ChainScanProgress,
  ScanLogEntry,
  TokenSource,
} from './types';

// ERC20 minimal ABI for balance + metadata queries
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
];

// Native token decimals
const NATIVE_DECIMALS = 18;

// Max concurrent token balance fetches per chain
const MAX_CONCURRENT_FETCHES = 5;

/** Structured log callback type */
export type ScanLogCallback = (entry: ScanLogEntry) => void;

/** Progress callback type - called as tokens are found */
export type ProgressCallback = (progress: ChainScanProgress) => void;

/**
 * Create a provider with timeout support
 */
function createProvider(rpc: RpcEndpoint): JsonRpcProvider {
  return new JsonRpcProvider(rpc.url, undefined, {
    staticNetwork: true,
    batchMaxCount: 1,
  });
}

/**
 * Safely normalize an address to EIP-55 checksum.
 * Returns null if address is invalid.
 */
function safeChecksum(address: string): string | null {
  try {
    return getAddress(address.toLowerCase());
  } catch {
    return null;
  }
}

/**
 * Fetch a single ERC20 token balance with timeout
 */
async function fetchTokenBalance(
  provider: JsonRpcProvider,
  tokenAddress: string,
  walletAddress: string,
  decimals: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link external abort signal
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const checksummed = safeChecksum(tokenAddress);
    if (!checksummed) return '0';

    const contract = new Contract(checksummed, ERC20_ABI, provider);
    const balanceRaw = await contract.balanceOf(walletAddress);
    return formatUnits(balanceRaw, decimals);
  } catch {
    return '0';
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Run promises with concurrency limit
 */
async function withConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  const executing: Set<Promise<void>> = new Set();

  for (const task of tasks) {
    const p = task().then((result) => {
      results.push(result);
      executing.delete(p);
    });
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Try connecting to RPCs in order until one works
 */
async function connectToRpc(
  chain: ScanChainName,
  log: ScanLogCallback,
): Promise<{ provider: JsonRpcProvider; rpc: RpcEndpoint } | null> {
  const rpcs = getRpcEndpoints(chain);

  for (const rpc of rpcs) {
    try {
      log({ timestamp: Date.now(), level: 'info', chain, message: `Trying ${rpc.name}...` });
      const provider = createProvider(rpc);
      // Quick connection test
      await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), rpc.timeout)),
      ]);
      log({ timestamp: Date.now(), level: 'info', chain, message: `Connected to ${rpc.name}` });
      return { provider, rpc };
    } catch {
      log({ timestamp: Date.now(), level: 'warn', chain, message: `${rpc.name} failed, trying next...` });
    }
  }

  return null;
}

/**
 * Scan a single chain for token balances.
 * Reports progress via callback as tokens are found.
 */
export async function scanChain(
  chain: ScanChainName,
  walletAddress: string,
  onProgress: ProgressCallback,
  onLog: ScanLogCallback,
  signal?: AbortSignal,
): Promise<ChainScanProgress> {
  const chainId = CHAIN_NAME_TO_ID[chain];
  const startTime = Date.now();

  const progress: ChainScanProgress = {
    chainName: chain,
    chainId,
    status: 'scanning',
    tokens: [],
    checked: 0,
    total: 0,
    elapsedMs: 0,
  };

  onProgress({ ...progress });
  onLog({ timestamp: Date.now(), level: 'info', chain, message: 'Starting scan...' });

  // Check abort
  if (signal?.aborted) {
    progress.status = 'failed';
    progress.error = 'Cancelled';
    return progress;
  }

  // Connect to RPC
  const connection = await connectToRpc(chain, onLog);
  if (!connection) {
    progress.status = 'failed';
    progress.error = 'All RPCs failed. Try again later.';
    progress.errorCode = 'rpc_timeout';
    progress.elapsedMs = Date.now() - startTime;
    onProgress({ ...progress });
    return progress;
  }

  const { provider, rpc } = connection;
  progress.rpcUsed = rpc.name;

  // Build token list: known tokens + custom tokens
  const knownTokens = (ERC20_TOKENS[chain] || []).map((t) => ({
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    source: 'known' as TokenSource,
  }));

  const customTokens = useCustomTokenStore.getState().getTokens(chainId).map((t) => ({
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    source: 'custom' as TokenSource,
  }));

  const allTokens = [...knownTokens, ...customTokens];
  progress.total = allTokens.length + 1; // +1 for native
  onProgress({ ...progress });

  const foundTokens: ScannedToken[] = [];
  const watchlistStore = useWatchlistStore.getState();

  // 1. Fetch native balance
  try {
    onLog({ timestamp: Date.now(), level: 'info', chain, message: 'Fetching native balance...' });
    const nativeBalance = await Promise.race([
      provider.getBalance(walletAddress),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), rpc.timeout)),
    ]);
    const formatted = formatEther(nativeBalance);
    progress.checked = 1;

    if (parseFloat(formatted) > 0) {
      const nativeSymbol = chain === 'bsc' ? 'BNB' : chain === 'polygon' ? 'MATIC' : 'ETH';
      foundTokens.push({
        chainId,
        chainName: chain,
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        symbol: nativeSymbol,
        name: nativeSymbol,
        decimals: NATIVE_DECIMALS,
        balance: formatted,
        source: 'known',
        isWatched: false,
        isNative: true,
      });
      onLog({ timestamp: Date.now(), level: 'info', chain, message: `Found ${formatted} ${nativeSymbol}` });
    }
  } catch (err) {
    onLog({ timestamp: Date.now(), level: 'warn', chain, message: 'Native balance fetch failed' });
    progress.checked = 1;
  }

  onProgress({ ...progress, tokens: [...foundTokens], elapsedMs: Date.now() - startTime });

  // 2. Fetch ERC20 balances with concurrency limit
  if (!signal?.aborted) {
    const tasks = allTokens.map((token) => async () => {
      if (signal?.aborted) return;

      const balance = await fetchTokenBalance(
        provider, token.address, walletAddress, token.decimals, rpc.timeout, signal,
      );
      progress.checked++;

      if (parseFloat(balance) > 0) {
        const checksummed = safeChecksum(token.address);
        const isWatched = checksummed ? watchlistStore.hasToken(chainId, checksummed) : false;

        foundTokens.push({
          chainId,
          chainName: chain,
          address: checksummed || token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          balance,
          source: token.source,
          isWatched,
          isNative: false,
        });
        onLog({
          timestamp: Date.now(), level: 'info', chain,
          message: `Found ${balance} ${token.symbol}`,
        });
      }

      // Report progress after every check
      onProgress({
        ...progress,
        tokens: [...foundTokens],
        elapsedMs: Date.now() - startTime,
      });
    });

    await withConcurrency(tasks, MAX_CONCURRENT_FETCHES);
  }

  // Finalize
  progress.status = signal?.aborted ? 'failed' : 'completed';
  progress.tokens = foundTokens;
  progress.elapsedMs = Date.now() - startTime;
  if (signal?.aborted) {
    progress.error = 'Cancelled';
  }

  onLog({
    timestamp: Date.now(), level: 'info', chain,
    message: `Scan complete: ${foundTokens.length} tokens found in ${progress.elapsedMs}ms`,
  });
  onProgress({ ...progress });

  return progress;
}
