import { describe, expect, it } from 'vitest';
import { resolveQuoteReadiness } from '@/utils/quoteReadiness';

describe('resolveQuoteReadiness', () => {
  it('marks gas-unavailable distinctly from quote ready', () => {
    const r = resolveQuoteReadiness({
      hasQuote: true,
      isQuoteLoading: false,
      isQuoteExpired: false,
      routeUnavailable: false,
      gasPriceAvailable: false,
      feeEstimateSettled: true,
      insufficientGas: false,
      needsApproval: false,
    });
    expect(r.state).toBe('QUOTE_READY_GAS_UNAVAILABLE');
    expect(r.publicLabel).toMatch(/network fee unavailable/i);
    expect(r.fullyReady).toBe(false);
    expect(r.canProceedToPreview).toBe(true);
    expect(r.helperText).toMatch(/wallet will show/i);
  });

  it('gives expired quote precedence over gas issues', () => {
    const r = resolveQuoteReadiness({
      hasQuote: true,
      isQuoteLoading: false,
      isQuoteExpired: true,
      routeUnavailable: false,
      gasPriceAvailable: false,
      feeEstimateSettled: true,
      insufficientGas: true,
      needsApproval: false,
    });
    expect(r.state).toBe('QUOTE_EXPIRED');
  });

  it('blocks on insufficient gas', () => {
    const r = resolveQuoteReadiness({
      hasQuote: true,
      isQuoteLoading: false,
      isQuoteExpired: false,
      routeUnavailable: false,
      gasPriceAvailable: true,
      feeEstimateSettled: true,
      insufficientGas: true,
      needsApproval: false,
    });
    expect(r.state).toBe('INSUFFICIENT_GAS');
    expect(r.canProceedToPreview).toBe(false);
  });

  it('returns READY_TO_SIGN when preview confirmed and gas known', () => {
    const r = resolveQuoteReadiness({
      hasQuote: true,
      isQuoteLoading: false,
      isQuoteExpired: false,
      routeUnavailable: false,
      gasPriceAvailable: true,
      feeEstimateSettled: true,
      insufficientGas: false,
      needsApproval: false,
      previewConfirmed: true,
    });
    expect(r.state).toBe('READY_TO_SIGN');
    expect(r.fullyReady).toBe(true);
  });
});
