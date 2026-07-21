import { PRICE_IMPACT_NOT_ESTIMATED } from '@/utils/format';
import {
  buildQuoteEconomics,
  expectedCommissionBpsForChain,
  type QuoteEconomics,
  type TokenIdentity,
} from '@/utils/quoteEconomics';
import { classifyQuoteQuality } from '@/utils/quoteQuality';

export type CertifiedQuoteEconomicsInput = {
  chainId: number;
  certifiedRouteFingerprint: string;
  provider: string;
  wrapperAddress: string;
  tokenIn: TokenIdentity;
  tokenOut: TokenIdentity;
  amountIn: string;
  amountOutGross?: string;
  commissionAmount?: string;
  amountOutNet: string;
  gasEstimate?: string;
  priceImpactPercent?: string;
  slippagePercent: number;
  feeTier?: number;
  wrapperPath?: string;
  hopCount: number;
  quotedAt: number;
  expiresAt: number;
};

function parsePositiveBigInt(value: string | undefined, field: string): bigint {
  if (!value) throw new Error(`Certified quote missing ${field}`);
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`Certified quote has invalid ${field}`);
  }
}

export function parseReliablePriceImpactBps(value: string | undefined): number | undefined {
  const raw = String(value ?? '').replace(/%/g, '').trim();
  if (!raw || raw === PRICE_IMPACT_NOT_ESTIMATED) return undefined;
  const percent = Number(raw);
  if (!Number.isFinite(percent) || percent < 0) return undefined;
  return Math.round(percent * 100);
}

export function buildCertifiedQuoteEconomics(
  input: CertifiedQuoteEconomicsInput,
  now = input.quotedAt,
): QuoteEconomics {
  const grossAmountOut = parsePositiveBigInt(input.amountOutGross, 'gross output');
  const commissionAmount = parsePositiveBigInt(input.commissionAmount, 'commission amount');
  const netAmountOut = parsePositiveBigInt(input.amountOutNet, 'net output');
  const amountIn = parsePositiveBigInt(input.amountIn, 'input amount');
  const gas = input.gasEstimate ? BigInt(input.gasEstimate) : undefined;
  const slippageBps = Math.floor(input.slippagePercent * 100);

  return buildQuoteEconomics(
    {
      chainId: input.chainId,
      routeFingerprint: [
        input.certifiedRouteFingerprint,
        input.provider,
        input.feeTier == null ? '' : `fee:${input.feeTier}`,
        input.wrapperPath ? `path:${input.wrapperPath}` : '',
      ]
        .filter(Boolean)
        .join('|'),
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn,
      grossAmountOut,
      commissionBps: expectedCommissionBpsForChain(input.chainId),
      commissionAmount,
      netAmountOut,
      estimatedGasUnits: gas != null && gas > 0n ? gas : undefined,
      priceImpactBps: parseReliablePriceImpactBps(input.priceImpactPercent),
      slippageBps,
      hopCount: input.hopCount,
      routeType: input.provider,
      wrapperAddress: input.wrapperAddress,
      certified: true,
      directRouter: false,
      quotedAt: input.quotedAt,
      expiresAt: input.expiresAt,
    },
    (quote) => classifyQuoteQuality(quote, now),
  );
}
