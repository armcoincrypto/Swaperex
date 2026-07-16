import { describe, expect, it } from 'vitest';
import {
  buildTradePreparationItems,
  getTradePreparationSummary,
} from '@/components/swap/intelligence/swapIntelCenterModel';
import type { AssetInfo } from '@/types/api';

const ethNative: AssetInfo = {
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  is_native: true,
  chain: 'ethereum',
};

const usdc: AssetInfo = {
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  contract_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  chain: 'ethereum',
  is_native: false,
};

describe('trade preparation compact summary', () => {
  it('prioritizes network mismatch over pending quote', () => {
    const items = buildTradePreparationItems({
      isConnected: true,
      isWrongChain: true,
      walletChainId: 56,
      activeChainId: 1,
      fromAsset: ethNative,
      toAsset: usdc,
      slippage: 0.5,
      hasActiveQuote: false,
      isQuoting: false,
    });

    const summary = getTradePreparationSummary(items, true);
    expect(summary.tone).toBe('warn');
    expect(summary.label).toMatch(/Switch wallet/i);
    expect(summary.expandByDefault).toBe(true);
  });

  it('shows ready summary when all checks pass', () => {
    const items = buildTradePreparationItems({
      isConnected: true,
      isWrongChain: false,
      walletChainId: 1,
      activeChainId: 1,
      fromAsset: ethNative,
      toAsset: usdc,
      slippage: 0.5,
      hasActiveQuote: true,
      isQuoting: false,
    });

    const summary = getTradePreparationSummary(items, true);
    expect(summary.tone).toBe('ok');
    expect(summary.label).toBe('Ready to review');
  });

  it('shows connect wallet when disconnected', () => {
    const items = buildTradePreparationItems({
      isConnected: false,
      isWrongChain: false,
      walletChainId: null,
      activeChainId: 1,
      fromAsset: ethNative,
      toAsset: usdc,
      slippage: 0.5,
      hasActiveQuote: false,
      isQuoting: false,
    });

    const summary = getTradePreparationSummary(items, false);
    expect(summary.label).toBe('Connect wallet to continue');
  });

  it('uses enter-amount wording without refresh when no quote exists', () => {
    const items = buildTradePreparationItems({
      isConnected: true,
      isWrongChain: false,
      walletChainId: 1,
      activeChainId: 1,
      fromAsset: ethNative,
      toAsset: usdc,
      slippage: 0.5,
      hasActiveQuote: false,
      isQuoting: false,
    });
    const quote = items.find((item) => item.id === 'quote');
    expect(quote?.detail).toBe('Enter an amount to request a quote');
    expect(quote?.detail.toLowerCase()).not.toContain('refresh');
  });
});
