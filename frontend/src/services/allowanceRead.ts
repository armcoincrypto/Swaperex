/**
 * P4.4-K3 — ERC20 allowance reads for commission wrapper paths.
 * Uses the same static read RPC as quotes (not the wallet BrowserProvider).
 */

import { Contract, JsonRpcProvider, Network, type Provider } from 'ethers';
import { CHAINS } from '@/config/chains';
import { getPrimaryBscReadRpcUrl, getPrimaryEthereumReadRpcUrl } from '@/config/rpc';
import { logProductionEvent } from '@/utils/productionMonitoring';
import { swapObsLog } from '@/utils/swapObservability';

const ALLOWANCE_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type Erc20AllowanceRead = 'sufficient' | 'insufficient' | 'unknown';

let cachedEthReadProvider: JsonRpcProvider | null = null;
let cachedBscReadProvider: JsonRpcProvider | null = null;

/** Shared static JsonRpcProvider — aligned with V3 quote / Dwellir read path. */
export function getStaticReadProviderForChain(chainId: number): JsonRpcProvider | null {
  if (chainId === 1) {
    if (!cachedEthReadProvider) {
      const net = Network.from(CHAINS.ethereum.id);
      cachedEthReadProvider = new JsonRpcProvider(getPrimaryEthereumReadRpcUrl(), net, {
        staticNetwork: net,
      });
    }
    return cachedEthReadProvider;
  }
  if (chainId === 56) {
    if (!cachedBscReadProvider) {
      const net = Network.from(CHAINS.bsc.id);
      cachedBscReadProvider = new JsonRpcProvider(getPrimaryBscReadRpcUrl(), net, {
        staticNetwork: net,
      });
    }
    return cachedBscReadProvider;
  }
  return null;
}

function classifyAllowanceError(err: unknown): string {
  if (err && typeof err === 'object') {
    const o = err as { code?: unknown; message?: unknown };
    if (o.code != null) return String(o.code);
    if (typeof o.message === 'string' && o.message.length > 0) {
      return o.message.slice(0, 120);
    }
  }
  if (err instanceof Error) return err.name || 'Error';
  return 'unknown';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 200–400 ms inclusive (P4.4-K3). */
function randomAllowanceRetryBackoffMs(): number {
  return 200 + Math.floor(Math.random() * 201);
}

function emitAllowanceReadFailed(fields: {
  token: string;
  tokenAddress: string;
  spender: string;
  provider: string;
  direction: string;
  errorClass: string;
  rpcSource: 'static';
  attempt: number;
  retried: boolean;
  chainId: number;
}): void {
  const payload = {
    token: fields.token,
    tokenAddress: fields.tokenAddress,
    spender: fields.spender,
    provider: fields.provider,
    direction: fields.direction,
    errorClass: fields.errorClass,
    rpcSource: fields.rpcSource,
    attempt: fields.attempt,
    retried: fields.retried,
    chainId: fields.chainId,
  };
  swapObsLog('allowance_read_failed', payload);
  logProductionEvent('allowance_read_failed', payload);
}

async function readAllowanceOnce(
  tokenAddress: string,
  spender: string,
  owner: string,
  required: bigint,
  readProvider: Provider,
): Promise<Erc20AllowanceRead> {
  const tokenContract = new Contract(tokenAddress, ALLOWANCE_ABI, readProvider);
  const allowance = await tokenContract.allowance(owner, spender);
  return allowance >= required ? 'sufficient' : 'insufficient';
}

export type CommissionWrapperAllowanceReadParams = {
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string;
  fromSymbol: string;
  toSymbol: string;
  spender: string;
  owner: string;
  required: bigint;
  /** Aggregated swap provider id, e.g. uniswap-v3-wrapper-v3 */
  swapProvider: string;
};

/**
 * Allowance read for commission wrapper execution — static RPC + one retry on failure.
 */
export async function readCommissionWrapperAllowanceVsRequired(
  params: CommissionWrapperAllowanceReadParams,
): Promise<Erc20AllowanceRead> {
  const direction = `${params.fromSymbol}→${params.toSymbol}`;
  const staticProvider = getStaticReadProviderForChain(params.chainId);

  if (!staticProvider) {
    emitAllowanceReadFailed({
      token: params.tokenSymbol,
      tokenAddress: params.tokenAddress,
      spender: params.spender,
      provider: params.swapProvider,
      direction,
      errorClass: 'static_provider_unavailable',
      rpcSource: 'static',
      attempt: 1,
      retried: false,
      chainId: params.chainId,
    });
    return 'unknown';
  }

  const runAttempt = async (attempt: number, retried: boolean): Promise<Erc20AllowanceRead> => {
    try {
      return await readAllowanceOnce(
        params.tokenAddress,
        params.spender,
        params.owner,
        params.required,
        staticProvider,
      );
    } catch (err) {
      console.error('[Swap] ERC20 allowance read failed (static RPC):', err);
      emitAllowanceReadFailed({
        token: params.tokenSymbol,
        tokenAddress: params.tokenAddress,
        spender: params.spender,
        provider: params.swapProvider,
        direction,
        errorClass: classifyAllowanceError(err),
        rpcSource: 'static',
        attempt,
        retried,
        chainId: params.chainId,
      });
      return 'unknown';
    }
  };

  const first = await runAttempt(1, false);
  if (first !== 'unknown') return first;

  await sleep(randomAllowanceRetryBackoffMs());
  return runAttempt(2, true);
}
