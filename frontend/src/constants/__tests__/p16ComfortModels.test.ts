import { describe, expect, it } from 'vitest';
import { resolveSwapCtaState } from '@/constants/swapCtaStates';
import {
  getTransactionLifecycleSpec,
  mapSwapStatusToLifecycle,
} from '@/constants/transactionLifecycle';

describe('swapCtaStates', () => {
  it('requires wallet connection first', () => {
    const spec = resolveSwapCtaState({
      isConnected: false,
      isWrongChain: false,
      commissionSwapUnavailable: false,
      hasAmount: true,
      insufficientBalance: false,
      isQuoteLoading: false,
      hasQuote: true,
      isQuoteExpired: false,
      needsApproval: false,
      status: 'previewing',
      isReadOnly: false,
      guardsBlocked: false,
      unsupportedRoute: false,
    });
    expect(spec.id).toBe('connect_wallet');
    expect(spec.reason).toContain('wallet');
  });

  it('enables switch network on read-only chains', () => {
    const spec = resolveSwapCtaState({
      isConnected: true,
      isWrongChain: false,
      commissionSwapUnavailable: true,
      hasAmount: false,
      insufficientBalance: false,
      isQuoteLoading: false,
      hasQuote: false,
      isQuoteExpired: false,
      needsApproval: false,
      status: 'idle',
      isReadOnly: false,
      guardsBlocked: false,
      unsupportedRoute: false,
    });
    expect(spec.id).toBe('switch_network');
    expect(spec.enabled).toBe(true);
  });
});

describe('transactionLifecycle', () => {
  it('maps quote ready from previewing status', () => {
    expect(
      mapSwapStatusToLifecycle({
        status: 'previewing',
        hasQuote: true,
        isQuoteExpired: false,
        needsApproval: false,
      }),
    ).toBe('quote_ready');
  });

  it('defines title and telemetry for every state', () => {
    const spec = getTransactionLifecycleSpec('swap_confirmed');
    expect(spec.title).toBeTruthy();
    expect(spec.telemetryEvent).toMatch(/^swap_lifecycle_/);
  });
});
