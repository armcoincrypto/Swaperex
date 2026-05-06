/**
 * Soft token / pool signals for the swap UI (read-only RPC).
 * Does not block swaps — surfaces warnings only.
 */

import { Contract, JsonRpcProvider, Network, ZeroAddress, getAddress, isAddress } from 'ethers';
import {
  getChainById,
  getPancakeSwapV3Addresses,
  getUniswapV3Addresses,
  hasPancakeSwapV3,
  hasUniswapV3,
} from '@/config/chains';
import { raceWithTimeout, JSONRPC_TIMEOUT_MS } from '@/config/rpc';
import type { AssetInfo } from '@/types/api';
import { getSwapAddress, getTokenByAddress, getTokenBySymbol, isStaticToken } from '@/tokens';

const FACTORY_GET_POOL_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
] as const;
const POOL_LIQUIDITY_ABI = ['function liquidity() external view returns (uint128)'] as const;

const FEE_TIERS = [100, 500, 3000, 10_000] as const;

/** Raw V3 `liquidity()` below this hints at a very thin pool (not USD TVL). */
export const V3_LIQUIDITY_WARN_THRESHOLD = 10_000_000_000_000_000n;

const PROBE_TIMEOUT_MS = Math.min(10_000, JSONRPC_TIMEOUT_MS);

function sortTokens(a: string, b: string): [string, string] {
  const A = getAddress(a);
  const B = getAddress(b);
  return A.toLowerCase() < B.toLowerCase() ? [A, B] : [B, A];
}

function v3FactoryForChain(chainId: number): string | null {
  if (hasPancakeSwapV3(chainId)) {
    return getPancakeSwapV3Addresses()?.factory ?? null;
  }
  if (hasUniswapV3(chainId)) {
    return getUniswapV3Addresses(chainId)?.factory ?? null;
  }
  return null;
}

function readRpcUrlForChain(chainId: number): string | null {
  const chain = getChainById(chainId);
  return chain?.rpcUrl?.trim() || null;
}

export interface V3PairProbeResult {
  hasPool: boolean;
  maxLiquidity: bigint;
  lowLiquidity: boolean;
}

/**
 * Scans standard V3 fee tiers on the chain's canonical V3 factory (Uniswap-family or Pancake on BSC).
 */
export async function probeV3PairLiquidity(
  chainId: number,
  tokenIn: string,
  tokenOut: string,
): Promise<V3PairProbeResult> {
  const factory = v3FactoryForChain(chainId);
  const rpcUrl = readRpcUrlForChain(chainId);
  if (!factory || !rpcUrl) {
    return { hasPool: true, maxLiquidity: 0n, lowLiquidity: false };
  }

  const run = async (): Promise<V3PairProbeResult> => {
    const net = Network.from(chainId);
    const provider = new JsonRpcProvider(rpcUrl, net, { staticNetwork: net });
    const fc = new Contract(factory, FACTORY_GET_POOL_ABI, provider);
    const [t0, t1] = sortTokens(tokenIn, tokenOut);
    let maxL = 0n;
    let hasPool = false;
    for (const fee of FEE_TIERS) {
      try {
        const poolAddr: string = await fc.getPool(t0, t1, fee);
        if (!poolAddr || poolAddr === ZeroAddress) continue;
        const pc = new Contract(poolAddr, POOL_LIQUIDITY_ABI, provider);
        const liq = await pc.liquidity();
        const liqBig = BigInt(liq.toString());
        if (liqBig > 0n) hasPool = true;
        if (liqBig > maxL) maxL = liqBig;
      } catch {
        continue;
      }
    }
    return {
      hasPool,
      maxLiquidity: maxL,
      lowLiquidity: hasPool && maxL > 0n && maxL < V3_LIQUIDITY_WARN_THRESHOLD,
    };
  };

  try {
    return await raceWithTimeout(run(), PROBE_TIMEOUT_MS);
  } catch {
    return { hasPool: true, maxLiquidity: 0n, lowLiquidity: false };
  }
}

export function isSwapAssetKnownForChain(
  asset: AssetInfo,
  chainId: number,
  hasToken: (c: number, addr: string) => boolean,
): boolean {
  if (asset.is_native) return true;
  const addr = asset.contract_address?.trim();
  if (addr && isAddress(addr)) {
    if (getTokenByAddress(addr, chainId)) return true;
    if (hasToken(chainId, addr)) return true;
    if (isStaticToken(addr, chainId)) return true;
    return false;
  }
  return Boolean(getTokenBySymbol(asset.symbol, chainId));
}

/** Wrapped-native address for pool checks when the picker uses the native sentinel. */
export function assetToV3ProbeAddress(asset: AssetInfo, chainId: number): string | null {
  const bySymbol = getTokenBySymbol(asset.symbol, chainId);
  const byAddr =
    asset.contract_address && isAddress(asset.contract_address)
      ? getTokenByAddress(asset.contract_address, chainId)
      : undefined;
  const meta = bySymbol ?? byAddr;
  if (meta) return getSwapAddress(meta, chainId);
  if (asset.contract_address && isAddress(asset.contract_address)) {
    return getAddress(asset.contract_address);
  }
  return null;
}
