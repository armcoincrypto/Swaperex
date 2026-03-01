import { describe, it, expect, beforeEach } from 'vitest';
import { useSwapStore } from '../swapStore';

describe('swapStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useSwapStore.getState().reset();
  });

  describe('approvalMode', () => {
    it('defaults to exact', () => {
      expect(useSwapStore.getState().approvalMode).toBe('exact');
    });

    it('can be set to unlimited', () => {
      useSwapStore.getState().setApprovalMode('unlimited');
      expect(useSwapStore.getState().approvalMode).toBe('unlimited');
    });

    it('can be toggled back to exact', () => {
      useSwapStore.getState().setApprovalMode('unlimited');
      useSwapStore.getState().setApprovalMode('exact');
      expect(useSwapStore.getState().approvalMode).toBe('exact');
    });

    it('is preserved when other state changes', () => {
      useSwapStore.getState().setApprovalMode('unlimited');
      useSwapStore.getState().setFromAmount('1.5');
      expect(useSwapStore.getState().approvalMode).toBe('unlimited');
    });

    it('is reset to exact on store reset', () => {
      useSwapStore.getState().setApprovalMode('unlimited');
      useSwapStore.getState().reset();
      expect(useSwapStore.getState().approvalMode).toBe('exact');
    });
  });

  describe('slippage', () => {
    it('defaults to 0.5', () => {
      expect(useSwapStore.getState().slippage).toBe(0.5);
    });

    it('clears quote when slippage changes', () => {
      // Simulate having a quote
      useSwapStore.getState().setQuote({
        success: true,
        from_asset: 'ETH',
        to_asset: 'USDT',
        from_amount: '1',
        to_amount: '3000',
        rate: '3000',
        price_impact: '0.1',
        minimum_received: '2985',
      });
      expect(useSwapStore.getState().quote).not.toBeNull();

      useSwapStore.getState().setSlippage(1.0);
      expect(useSwapStore.getState().quote).toBeNull();
      expect(useSwapStore.getState().toAmount).toBe('');
    });
  });

  describe('quote freshness', () => {
    it('quote has no built-in TTL in store (managed by useSwap hook)', () => {
      // Store just holds the quote — expiry is checked in useSwap.ts confirmSwap()
      useSwapStore.getState().setQuote({
        success: true,
        from_asset: 'BNB',
        to_asset: 'USDT',
        from_amount: '0.1',
        to_amount: '60',
        rate: '600',
        price_impact: '0.05',
        minimum_received: '59.7',
      });
      expect(useSwapStore.getState().quote?.success).toBe(true);
    });
  });
});
