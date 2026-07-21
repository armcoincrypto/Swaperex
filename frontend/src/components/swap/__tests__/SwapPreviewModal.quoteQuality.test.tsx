import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SwapPreviewModal } from '../SwapPreviewModal';
import type { SwapQuote } from '@/hooks/useSwap';
import { buildCertifiedQuoteEconomics } from '@/utils/certifiedQuoteEconomics';
import { PRICE_IMPACT_NOT_ESTIMATED } from '@/utils/format';

function quote(priceImpactPercent: string): SwapQuote {
  const economics = buildCertifiedQuoteEconomics({
    chainId: 1,
    certifiedRouteFingerprint: '1|weth|usdc',
    provider: 'uniswap-v3-wrapper-v2',
    wrapperAddress: '0x0000000000000000000000000000000000000001',
    tokenIn: { symbol: 'WETH', address: '0x2', decimals: 18, isNative: false },
    tokenOut: { symbol: 'USDC', address: '0x3', decimals: 6, isNative: false },
    amountIn: '1000000000000000000',
    amountOutGross: '1000000',
    commissionAmount: '2000',
    amountOutNet: '998000',
    gasEstimate: '200000',
    priceImpactPercent,
    slippagePercent: 0.5,
    feeTier: 500,
    hopCount: 1,
    quotedAt: Date.now(),
    expiresAt: Date.now() + 30_000,
  });
  return {
    amountIn: '1000000000000000000',
    amountOut: '998000',
    amountOutGross: '1000000',
    commissionAmount: '2000',
    amountOutFormatted: '0.998',
    priceImpact: priceImpactPercent,
    gasEstimate: '200000',
    feeTier: 500,
    sqrtPriceX96After: '0',
    initializedTicksCrossed: 0,
    route: 'WETH → USDC',
    fromSymbol: 'WETH',
    toSymbol: 'USDC',
    minAmountOut: '993010',
    minAmountOutFormatted: '0.99301',
    slippage: 0.5,
    needsApproval: false,
    provider: 'uniswap-v3-wrapper-v2',
    routeMode: 'best',
    quoteTimestamp: Date.now(),
    success: true,
    from_asset: 'WETH',
    to_asset: 'USDC',
    from_amount: '1',
    to_amount: '0.998',
    rate: '0.998',
    price_impact: priceImpactPercent,
    minimum_received: '0.99301',
    economics,
  };
}

function renderModal(value: SwapQuote) {
  render(
    <SwapPreviewModal
      isOpen
      quote={value}
      step="preview"
      error={null}
      txHash={null}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      onRefreshQuote={vi.fn()}
      isRefreshing={false}
      chainId={1}
      walletConnected
      quoteTtlSecondsRemaining={25}
    />,
  );
}

describe('SwapPreviewModal quote quality', () => {
  it('shows unknown impact as unavailable, never safe', () => {
    renderModal(quote(PRICE_IMPACT_NOT_ESTIMATED));
    expect(
      screen.getByText(/Price impact is unavailable and is not labeled safe/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Negligible/i)).not.toBeInTheDocument();
  });

  it('shows and blocks above-threshold price impact', () => {
    renderModal(quote('5.01'));
    expect(screen.getByText(/Price impact exceeds 5%/i)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Quote blocked/i });
    expect(button).toBeDisabled();
  });
});
