/**
 * Helpers to build journal contexts from active swap execution state.
 */

import { formatUnits } from 'ethers';
import type { AssetInfo } from '@/types/api';
import type { SwapQuote } from '@/hooks/useSwap';
import type { ApprovalJournalContext, SwapJournalContext } from '@/types/transactionJournal';
import { getSwapAddress, getTokenBySymbol } from '@/tokens';
import { getSwapQuoteInputFingerprint } from '@/utils/swapQuoteInputFingerprint';

function resolveTokenAddress(
  symbol: string,
  chainId: number,
  asset: AssetInfo | null | undefined,
): { address: string; decimals: number } {
  const token = getTokenBySymbol(symbol, chainId);
  const decimals = token?.decimals ?? asset?.decimals ?? 18;
  if (token) {
    const addr = getSwapAddress(token, chainId);
    return { address: addr?.toLowerCase() ?? 'native', decimals };
  }
  if (asset?.contract_address) {
    return { address: asset.contract_address.toLowerCase(), decimals: asset.decimals };
  }
  return { address: 'native', decimals };
}

export function buildApprovalJournalContext(params: {
  swapQuote: SwapQuote;
  chainId: number;
  approvalMode: 'exact' | 'unlimited';
  spenderAddress: string;
  exactAmountRaw?: bigint;
}): ApprovalJournalContext {
  const { swapQuote, chainId, approvalMode, spenderAddress, exactAmountRaw } = params;
  const token = getTokenBySymbol(swapQuote.fromSymbol, chainId);
  const tokenAddress = token ? (getSwapAddress(token, chainId)?.toLowerCase() ?? 'native') : 'native';

  return {
    tokenAddress,
    tokenSymbol: swapQuote.fromSymbol,
    tokenDecimals: token?.decimals ?? 18,
    spenderAddress: spenderAddress.toLowerCase(),
    approvalMode,
    approvedAmountRaw: exactAmountRaw?.toString(),
    approvedAmountDisplay:
      exactAmountRaw !== undefined && token
        ? formatUnits(exactAmountRaw, token.decimals)
        : undefined,
    provider: swapQuote.provider,
  };
}

export function buildSwapJournalContext(params: {
  swapQuote: SwapQuote;
  chainId: number;
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  fromAmount: string;
  slippage: number;
  recipient?: string;
  routerAddress?: string;
  approvalRecordId?: string;
}): SwapJournalContext {
  const { swapQuote, chainId, fromAsset, toAsset, fromAmount, slippage, recipient, routerAddress, approvalRecordId } =
    params;

  const fromToken = resolveTokenAddress(swapQuote.fromSymbol, chainId, fromAsset);
  const toToken = resolveTokenAddress(swapQuote.toSymbol, chainId, toAsset);

  const quoteFingerprint = getSwapQuoteInputFingerprint({
    chainId,
    slippage,
    fromAmount,
    fromAsset: fromAsset ?? null,
    toAsset: toAsset ?? null,
    routeMode: swapQuote.routeMode,
  });

  return {
    fromTokenAddress: fromToken.address,
    fromTokenSymbol: swapQuote.fromSymbol,
    fromTokenDecimals: fromToken.decimals,
    toTokenAddress: toToken.address,
    toTokenSymbol: swapQuote.toSymbol,
    toTokenDecimals: toToken.decimals,
    inputAmountRaw: swapQuote.amountIn.toString(),
    inputAmountDisplay: fromAmount,
    expectedOutputRaw: swapQuote.amountOut.toString(),
    expectedOutputDisplay: swapQuote.amountOutFormatted,
    minimumOutputRaw: swapQuote.minimum_received,
    minimumOutputDisplay: swapQuote.minimum_received,
    slippageBps: Math.round(slippage * 100),
    provider: swapQuote.provider,
    routerAddress: routerAddress?.toLowerCase(),
    recipient: recipient?.toLowerCase(),
    quoteFingerprint,
    approvalRecordId,
  };
}

export function warnJournalWriteFailure(reason: string, txHash: string): void {
  console.warn('[Swap] Journal persistence failed after broadcast — transaction was still submitted.', {
    reason,
    txHash,
  });
}
