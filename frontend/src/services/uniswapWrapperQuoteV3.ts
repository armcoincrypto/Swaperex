/**
 * Uniswap V3 fee wrapper **V3** quotes (Ethereum). Read-only; no signing.
 * Multi-hop packed `path` + `quoteExactInputERC20` on the Swaperex wrapper.
 */

import { Contract, JsonRpcProvider, Network, formatUnits, parseUnits, solidityPacked } from 'ethers';
import { ETHEREUM_CONFIG } from '@/config';
import { getTokenBySymbol, getSwapAddress, isNativeToken } from '@/tokens';
import {
  getUniswapWrapperV3Config,
  isUniswapWrapperV3CommissionEligible,
  parseCanaryListFromEnv,
} from '@/config/uniswapWrapperV3';
import { type FeeTier, type QuoteResult } from './uniswapQuote';

const WRAPPER_V3_QUOTE_ABI = [
  {
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    name: 'quoteExactInputERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
      { name: '', type: 'uint160[]' },
      { name: '', type: 'uint32[]' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const FEE_TRY_ORDER: readonly FeeTier[] = [500, 3000, 100, 10000];

const NO_ROUTE_MESSAGE = 'No valid Uniswap V3 wrapper V3 route for this pair';

let cachedEth: JsonRpcProvider | null = null;

function getEthereumStaticProvider(): JsonRpcProvider {
  if (!cachedEth) {
    const net = Network.from(ETHEREUM_CONFIG.id);
    cachedEth = new JsonRpcProvider(ETHEREUM_CONFIG.rpcUrl, net, { staticNetwork: net });
  }
  return cachedEth;
}

export type UniswapWrapperV3QuoteResult = QuoteResult & {
  wrapperPath: `0x${string}`;
  v3FeeTiers: number[];
  amountOutGrossWei: string;
  feeAmountWei: string;
};

function normalizeSym(s: string): string {
  return String(s || '')
    .trim()
    .toUpperCase();
}

/** Find allowlist row matching tokenIn → tokenOut (symbol order). */
function resolveCanaryPathSymbols(tokenIn: string, tokenOut: string): string[] | null {
  const a = normalizeSym(tokenIn);
  const b = normalizeSym(tokenOut);
  for (const row of parseCanaryListFromEnv()) {
    if (row.length < 2) continue;
    if (normalizeSym(row[0]) === a && normalizeSym(row[row.length - 1]) === b) return row;
  }
  return null;
}

function encodeV3Path(tokenAddresses: string[], fees: number[]): `0x${string}` {
  if (tokenAddresses.length < 2 || fees.length !== tokenAddresses.length - 1) {
    throw new Error('encodeV3Path: token/fee length mismatch');
  }
  const types: string[] = [];
  const vals: Array<string | bigint> = [];
  for (let i = 0; i < tokenAddresses.length; i++) {
    types.push('address');
    vals.push(tokenAddresses[i]);
    if (i < fees.length) {
      types.push('uint24');
      vals.push(BigInt(fees[i]));
    }
  }
  return solidityPacked(types, vals) as `0x${string}`;
}

function* feeTuples(hops: number): Generator<number[]> {
  if (hops === 1) {
    for (const f of FEE_TRY_ORDER) yield [f];
    return;
  }
  if (hops === 2) {
    for (const f0 of FEE_TRY_ORDER) {
      for (const f1 of FEE_TRY_ORDER) {
        yield [f0, f1];
      }
    }
  }
}

/**
 * Quote via Swaperex Uniswap V3 fee wrapper V3 (`quoteExactInputERC20`).
 * Tries fee tier combinations until the wrapper quoter succeeds.
 */
export async function getUniswapWrapperV3Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
): Promise<UniswapWrapperV3QuoteResult> {
  const cfg = getUniswapWrapperV3Config();
  if (!cfg.enabled || !cfg.wrapperAddress) {
    throw new Error('Uniswap fee wrapper V3 is not enabled or not configured');
  }

  const tokenInData = getTokenBySymbol(tokenIn, 1);
  const tokenOutData = getTokenBySymbol(tokenOut, 1);
  if (!tokenInData) throw new Error(`Unknown token on Ethereum: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token on Ethereum: ${tokenOut}`);
  if (!isUniswapWrapperV3CommissionEligible(1, tokenInData, tokenOutData)) {
    throw new Error('Uniswap fee wrapper V3 does not support this pair with current flags or allowlist.');
  }
  if (isNativeToken(tokenInData.address) || isNativeToken(tokenOutData.address)) {
    throw new Error('Uniswap wrapper V3 (P4.4-F) supports WETH/ERC20 legs only — use WETH instead of native ETH.');
  }

  const row = resolveCanaryPathSymbols(tokenInData.symbol, tokenOutData.symbol);
  if (!row) {
    throw new Error(`${NO_ROUTE_MESSAGE} (${tokenInData.symbol} → ${tokenOutData.symbol})`);
  }

  const addrs = row.map((sym) => {
    const t = getTokenBySymbol(sym, 1);
    if (!t) throw new Error(`Unknown token in V3 path: ${sym}`);
    return getSwapAddress(t, 1);
  });

  const hops = addrs.length - 1;
  if (hops < 1 || hops > 2) {
    throw new Error('Uniswap wrapper V3 only supports 1–2 hops (MAX_HOPS=2 on-chain).');
  }

  const amountInWei = parseUnits(amountIn, tokenInData.decimals);
  const rpc = getEthereumStaticProvider();
  const wrapper = new Contract(cfg.wrapperAddress, WRAPPER_V3_QUOTE_ABI, rpc);

  for (const fees of feeTuples(hops)) {
    const path = encodeV3Path(addrs, fees);
    try {
      const result = await wrapper.quoteExactInputERC20.staticCall(
        path,
        addrs[0]!,
        addrs[addrs.length - 1]!,
        amountInWei,
      );
      const amountOutGross = result[0] as bigint;
      const feeAmount = result[1] as bigint;
      const amountOutNet = result[2] as bigint;
      const gasEstimate = result[5] as bigint;

      const amountOutFormatted = formatUnits(amountOutNet, tokenOutData.decimals);
      const firstFee = fees[0]!;

      return {
        amountIn: amountInWei.toString(),
        amountOut: amountOutNet.toString(),
        amountOutFormatted,
        priceImpact: '0',
        gasEstimate: gasEstimate.toString(),
        feeTier: firstFee as FeeTier,
        sqrtPriceX96After: '0',
        initializedTicksCrossed: 0,
        route: row.join(' → '),
        provider: 'uniswap-v3-wrapper-v3',
        wrapperPath: path,
        v3FeeTiers: [...fees],
        amountOutGrossWei: amountOutGross.toString(),
        feeAmountWei: feeAmount.toString(),
      };
    } catch {
      console.debug('[UniswapWrapperQuoteV3] quoteExactInputERC20 skipped (no pool or revert)', {
        fees,
        path: row.join('→'),
      });
    }
  }

  throw new Error(`${NO_ROUTE_MESSAGE} for ${tokenInData.symbol}/${tokenOutData.symbol}`);
}

export async function getBestUniswapWrapperV3Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
): Promise<UniswapWrapperV3QuoteResult | null> {
  try {
    return await getUniswapWrapperV3Quote(tokenIn, tokenOut, amountIn);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(NO_ROUTE_MESSAGE)) {
      return null;
    }
    throw err;
  }
}
